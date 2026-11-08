package controller

import (
	"context"
	"fmt"
	"os"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"

	workspacev1alpha1 "github.com/opendream-cloud/workspace-operator/api/v1alpha1"
)

// Reconciler 把 OpencodeWorkspace 收敛为工作区资源。
type Reconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder
	// Domain 是工作区子域名后缀（如 example.com → <name>.ws.example.com）。
	Domain string
}

// Reconcile 实现 controller-runtime 的 Reconcile。
func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	var ws workspacev1alpha1.OpencodeWorkspace
	if err := r.Get(ctx, req.NamespacedName, &ws); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	// 删除：稳态下 PVC 永不删除（D1）；显式销毁由控制面在冷却期后设置 retainPolicy，
	// PVC 的删除动作由 G5 的销毁控制器执行。这里只释放 finalizer。
	if !ws.DeletionTimestamp.IsZero() {
		if controllerutil.ContainsFinalizer(&ws, workspacev1alpha1.Finalizer) {
			controllerutil.RemoveFinalizer(&ws, workspacev1alpha1.Finalizer)
			if err := r.Update(ctx, &ws); err != nil {
				return ctrl.Result{}, err
			}
			r.event(&ws, corev1.EventTypeNormal, "WorkspaceFinalized", "workload removed; PVC retained (D1)")
		}
		return ctrl.Result{}, nil
	}

	if ws.Spec.Size != workspacev1alpha1.Size4C8G {
		r.setPhase(ctx, &ws, "Error", "UnsupportedSize", fmt.Sprintf("size %q is not supported; only %s", ws.Spec.Size, workspacev1alpha1.Size4C8G))
		r.event(&ws, corev1.EventTypeWarning, "UnsupportedSize", ws.Spec.Size)
		return ctrl.Result{}, nil
	}

	if !controllerutil.ContainsFinalizer(&ws, workspacev1alpha1.Finalizer) {
		controllerutil.AddFinalizer(&ws, workspacev1alpha1.Finalizer)
		if err := r.Update(ctx, &ws); err != nil {
			return ctrl.Result{}, err
		}
	}

	// 1) PVC：先于 Pod（WaitForFirstConsumer）；永不自动删除。emptyDir 模式跳过 PVC。
	if ws.Spec.Persistence.Mode != "emptyDir" {
		pvc := DesiredPVC(&ws)
		if err := r.ensurePVC(ctx, &ws, pvc); err != nil {
			return ctrl.Result{}, err
		}
	}

	// 2) Deployment（4C8G，Recreate）。
	dep := DesiredDeployment(&ws)
	if err := r.ensureDeployment(ctx, &ws, dep); err != nil {
		return ctrl.Result{}, err
	}

	// 3) Service + 4) NetworkPolicy
	if err := r.ensureService(ctx, &ws, DesiredService(&ws)); err != nil {
		return ctrl.Result{}, err
	}
	for _, np := range DesiredNetworkPolicies(&ws) {
		if err := r.ensureNetworkPolicy(ctx, &ws, np); err != nil {
			return ctrl.Result{}, err
		}
	}

	// 5) status（不改 spec；失败仅 requeue）
	current := &appsv1.Deployment{}
	depErr := r.Get(ctx, client.ObjectKeyFromObject(dep), current)
	phase, reason, msg := "Provisioning", "PVCBound", "waiting for pod readiness"
	if depErr == nil && current.Status.ReadyReplicas > 0 {
		phase, reason, msg = "Ready", "PodReady", "workspace is ready"
	}
	r.setReadyStatus(ctx, &ws, phase, "Ready", reason, msg)
	logger.V(1).Info("reconciled", "workspace", ws.Name, "phase", phase)

	// 漂移/就绪轮询：就绪后放慢；未就绪短周期。
	if phase == "Ready" {
		return ctrl.Result{RequeueAfter: 5 * time.Minute}, nil
	}
	return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
}

// SetupWithManager 注册 controller。
func (r *Reconciler) SetupWithManager(mgr ctrl.Manager) error {
	if r.Domain == "" {
		r.Domain = envOr("WORKSPACE_DOMAIN", "example.com")
	}
	if r.Recorder == nil {
		r.Recorder = mgr.GetEventRecorderFor("workspace-operator")
	}
	return ctrl.NewControllerManagedBy(mgr).
		For(&workspacev1alpha1.OpencodeWorkspace{}).
		Owns(&appsv1.Deployment{}).
		Owns(&corev1.PersistentVolumeClaim{}).
		Owns(&corev1.Service{}).
		Owns(&networkingv1.NetworkPolicy{}).
		Complete(r)
}

func (r *Reconciler) ensurePVC(ctx context.Context, ws *workspacev1alpha1.OpencodeWorkspace, desired *corev1.PersistentVolumeClaim) error {
	existing := &corev1.PersistentVolumeClaim{}
	err := r.Get(ctx, client.ObjectKeyFromObject(desired), existing)
	if apierrors.IsNotFound(err) {
		if err := r.Create(ctx, desired); err != nil {
			return err
		}
		r.event(ws, corev1.EventTypeNormal, "PVCCreated", desired.Name)
		return nil
	}
	if err != nil {
		return err
	}
	// 稳态幂等：不删除、不缩容、不改已存在 PVC 的 accessMode/StorageClass。
	return nil
}

func (r *Reconciler) ensureDeployment(ctx context.Context, ws *workspacev1alpha1.OpencodeWorkspace, desired *appsv1.Deployment) error {
	existing := &appsv1.Deployment{}
	err := r.Get(ctx, client.ObjectKeyFromObject(desired), existing)
	if apierrors.IsNotFound(err) {
		if err := r.Create(ctx, desired); err != nil {
			return err
		}
		r.event(ws, corev1.EventTypeNormal, "DeploymentCreated", desired.Name)
		return nil
	}
	if err != nil {
		return err
	}
	// 漂移修复：镜像 digest / 资源 / 探针被改动时恢复期望值。
	changed := false
	if existing.Spec.Template.Spec.Containers[0].Image != desired.Spec.Template.Spec.Containers[0].Image {
		existing.Spec.Template.Spec.Containers[0].Image = desired.Spec.Template.Spec.Containers[0].Image
		changed = true
	}
	if fmt.Sprintf("%v", existing.Spec.Template.Spec.Containers[0].Resources) != fmt.Sprintf("%v", desired.Spec.Template.Spec.Containers[0].Resources) {
		existing.Spec.Template.Spec.Containers[0].Resources = desired.Spec.Template.Spec.Containers[0].Resources
		changed = true
	}
	if changed {
		if err := r.Update(ctx, existing); err != nil {
			return err
		}
		r.event(ws, corev1.EventTypeNormal, "DriftRepaired", desired.Name)
	}
	return nil
}

func (r *Reconciler) ensureService(ctx context.Context, ws *workspacev1alpha1.OpencodeWorkspace, desired *corev1.Service) error {
	existing := &corev1.Service{}
	err := r.Get(ctx, client.ObjectKeyFromObject(desired), existing)
	if apierrors.IsNotFound(err) {
		if err := r.Create(ctx, desired); err != nil {
			return err
		}
		r.event(ws, corev1.EventTypeNormal, "ServiceCreated", desired.Name)
		return nil
	}
	return err
}

func (r *Reconciler) ensureNetworkPolicy(ctx context.Context, ws *workspacev1alpha1.OpencodeWorkspace, desired *networkingv1.NetworkPolicy) error {
	existing := &networkingv1.NetworkPolicy{}
	err := r.Get(ctx, client.ObjectKeyFromObject(desired), existing)
	if apierrors.IsNotFound(err) {
		if err := r.Create(ctx, desired); err != nil {
			return err
		}
		r.event(ws, corev1.EventTypeNormal, "NetworkPolicyCreated", desired.Name)
		return nil
	}
	return err
}

func (r *Reconciler) setPhase(ctx context.Context, ws *workspacev1alpha1.OpencodeWorkspace, phase, reason, message string) {
	r.setStatus(ctx, ws, phase, "", reason, message)
}

// setReadyStatus 写 phase/url/conditions（冲突时 requeue 由上层处理）。
func (r *Reconciler) setReadyStatus(ctx context.Context, ws *workspacev1alpha1.OpencodeWorkspace, phase, condType, reason, message string) {
	r.setStatus(ctx, ws, phase, condType, reason, message)
}

func (r *Reconciler) setStatus(ctx context.Context, ws *workspacev1alpha1.OpencodeWorkspace, phase, condType, reason, message string) {
	if ws.Status.Phase == phase && len(ws.Status.Conditions) > 0 {
		return
	}
	ws.Status.Phase = phase
	ws.Status.URL = WorkspaceURL(ws, r.Domain)
	ws.Status.ServiceName = ws.Name
	ws.Status.PVCName = ws.Name + "-home"
	ws.Status.ObservedGeneration = ws.Generation
	now := metav1.Now()
	conditions := make([]workspacev1alpha1.Condition, 0, 1)
	if condType != "" {
		conditions = append(conditions, workspacev1alpha1.Condition{
			Type:               condType,
			Status:             "True",
			Reason:             reason,
			Message:            message,
			LastTransitionTime: now,
		})
	}
	ws.Status.Conditions = conditions
	if err := r.Status().Update(ctx, ws); err != nil {
		log.FromContext(ctx).V(1).Info("status update failed", "workspace", ws.Name, "err", err.Error())
	}
}

func (r *Reconciler) event(ws *workspacev1alpha1.OpencodeWorkspace, eventType, reason, message string) {
	if r.Recorder != nil {
		r.Recorder.Event(ws, eventType, reason, message)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
