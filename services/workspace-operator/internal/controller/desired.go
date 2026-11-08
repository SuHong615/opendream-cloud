// Package controller 实现 OpencodeWorkspace 的 reconcile：把 CR 收敛为
// Deployment(4C8G) + PVC(Retain) + Service + NetworkPolicy。
package controller

import (
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"

	workspacev1alpha1 "github.com/opendream-cloud/workspace-operator/api/v1alpha1"
)

const (
	// OpencodePort 是 opencode serve 固定端口（不可漂移：必须显式 --port 4096）。
	OpencodePort int32 = 4096
	// AgentHealthPort 是 workspace-agent 健康/探针端口。
	AgentHealthPort int32 = 8081

	workspaceCPU      = "4"
	workspaceMemory   = "8Gi"
	ephemeralStorage  = "2Gi"
	defaultPVCSize    = "20Gi"
	defaultStorageCls = "alicloud-disk-essd"
	passwordSecretKey = "OPENCODE_SERVER_PASSWORD"

	// GatewayNamespace 是所有工作区流量的唯一入口命名空间。
	GatewayNamespace = "opencode-gateway"
	// EgressProxyPort 是工作区唯一公网出口（白名单代理）。
	EgressProxyPort int32 = 3128
	// LiteLLMPort 是模型网关端口。
	LiteLLMPort int32 = 4000
)

// LabelsForWorkspace 返回标准标签（租户/工作区可观测与成本归集依赖它们）。
func LabelsForWorkspace(ws *workspacev1alpha1.OpencodeWorkspace) map[string]string {
	labels := map[string]string{
		"app.kubernetes.io/name":       "opencode-workspace",
		"app.kubernetes.io/managed-by": "workspace-operator",
		"opencode.cloud/workspace-id":  ws.Name,
	}
	if ws.Spec.Owner.OrgID != "" {
		labels["opencode.cloud/org-id"] = ws.Spec.Owner.OrgID
	}
	if ws.Spec.Owner.UserID != "" {
		labels["opencode.cloud/owner-user-id"] = ws.Spec.Owner.UserID
	}
	return labels
}

// ImageRef 优先使用 digest（质量红线：生产禁止浮动 tag）。
func ImageRef(img workspacev1alpha1.Image) string {
	if img.Digest != "" {
		return img.Repository + "@" + img.Digest
	}
	if img.Tag != "" {
		return img.Repository + ":" + img.Tag
	}
	return img.Repository
}

// PVCSize 返回 PVC 容量（默认 20Gi）。
func PVCSize(ws *workspacev1alpha1.OpencodeWorkspace) string {
	if ws.Spec.Persistence.Size != "" {
		return ws.Spec.Persistence.Size
	}
	return defaultPVCSize
}

// StorageClass 返回存储类（默认 alicloud-disk-essd）。
func StorageClass(ws *workspacev1alpha1.OpencodeWorkspace) string {
	if ws.Spec.Persistence.StorageClass != "" {
		return ws.Spec.Persistence.StorageClass
	}
	return defaultStorageCls
}

// DesiredPVC 构造工作区 PVC：RWO、Retain 语义；**稳态下 operator 永不删除 PVC**（D1）。
func DesiredPVC(ws *workspacev1alpha1.OpencodeWorkspace) *corev1.PersistentVolumeClaim {
	size := resource.MustParse(PVCSize(ws))
	sc := StorageClass(ws)
	return &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ws.Name + "-home",
			Namespace: ws.Namespace,
			Labels:    LabelsForWorkspace(ws),
			Annotations: map[string]string{
				"opencode.cloud/retain": "true",
			},
			OwnerReferences: []metav1.OwnerReference{
				*metav1.NewControllerRef(ws, workspacev1alpha1.SchemeGroupVersion.WithKind(workspacev1alpha1.Kind)),
			},
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes:      []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			StorageClassName: &sc,
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{corev1.ResourceStorage: size},
			},
		},
	}
}

// DesiredService 构造 ClusterIP Service（仅 gateway 可访问，由 NetworkPolicy 收敛）。
func DesiredService(ws *workspacev1alpha1.OpencodeWorkspace) *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ws.Name,
			Namespace: ws.Namespace,
			Labels:    LabelsForWorkspace(ws),
			OwnerReferences: []metav1.OwnerReference{
				*metav1.NewControllerRef(ws, workspacev1alpha1.SchemeGroupVersion.WithKind(workspacev1alpha1.Kind)),
			},
		},
		Spec: corev1.ServiceSpec{
			Type:     corev1.ServiceTypeClusterIP,
			Selector: map[string]string{"opencode.cloud/workspace-id": ws.Name},
			Ports: []corev1.ServicePort{
				{Name: "http", Port: OpencodePort, TargetPort: intstr.FromInt32(OpencodePort), Protocol: corev1.ProtocolTCP},
			},
		},
	}
}

// DesiredDeployment 构造 4C8G（requests=limits）工作区 Deployment。
func DesiredDeployment(ws *workspacev1alpha1.OpencodeWorkspace) *appsv1.Deployment {
	replicas := int32(1)
	labels := LabelsForWorkspace(ws)
	runAsUser := int64(1000)
	runAsGroup := int64(1000)
	fsGroup := int64(1000)
	allowEscalation := false
	readOnlyRoot := true
	automount := false

	container := corev1.Container{
		Name:            "workspace",
		Image:           ImageRef(ws.Spec.Image),
		ImagePullPolicy: corev1.PullIfNotPresent,
		Command:         workspaceCommand(ws),
		Args:            workspaceArgs(ws),
		Env: []corev1.EnvVar{
			{Name: "OPENCODE_HOSTNAME", Value: "0.0.0.0"},
			{Name: "OPENCODE_PORT", Value: fmt.Sprintf("%d", OpencodePort)},
			{Name: "OPENCODE_DISABLE_AUTOUPDATE", Value: "1"},
			{Name: "AGENT_HEALTH_PORT", Value: fmt.Sprintf("%d", AgentHealthPort)},
			{Name: "WORKSPACE_ID", Value: ws.Name},
			{Name: "OPENCODE_CONFIG_DIR", Value: "/home/opencode/.config/opencode"},
			{Name: "OPENCODE_DB", Value: "/home/opencode/.local/share/opencode/opencode.db"},
			{
				Name: passwordSecretKey,
				ValueFrom: &corev1.EnvVarSource{
					SecretKeyRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: ws.Name + "-auth"},
						Key:                  passwordSecretKey,
					},
				},
			},
		},
		Ports: []corev1.ContainerPort{
			{Name: "http", ContainerPort: OpencodePort, Protocol: corev1.ProtocolTCP},
			{Name: "agent-health", ContainerPort: AgentHealthPort, Protocol: corev1.ProtocolTCP},
		},
		Resources: corev1.ResourceRequirements{
			// 4C8G：requests=limits，Guaranteed QoS（C1；不允许超卖）。
			Requests: corev1.ResourceList{
				corev1.ResourceCPU:              resource.MustParse(workspaceCPU),
				corev1.ResourceMemory:           resource.MustParse(workspaceMemory),
				corev1.ResourceEphemeralStorage: resource.MustParse(ephemeralStorage),
			},
			Limits: corev1.ResourceList{
				corev1.ResourceCPU:              resource.MustParse(workspaceCPU),
				corev1.ResourceMemory:           resource.MustParse(workspaceMemory),
				corev1.ResourceEphemeralStorage: resource.MustParse(ephemeralStorage),
			},
		},
		SecurityContext: &corev1.SecurityContext{
			AllowPrivilegeEscalation: &allowEscalation,
			ReadOnlyRootFilesystem:   &readOnlyRoot,
			RunAsNonRoot:             boolPtr(true),
			RunAsUser:                &runAsUser,
			RunAsGroup:               &runAsGroup,
			Capabilities:             &corev1.Capabilities{Drop: []corev1.Capability{"ALL"}},
			SeccompProfile:           &corev1.SeccompProfile{Type: corev1.SeccompProfileTypeRuntimeDefault},
		},
		// 探针默认走 agent（避免把 Basic 密码写进探针配置）；runtime.probe=tcp 时直接探 4096。
		StartupProbe:   startupProbe(ws),
		ReadinessProbe: readinessProbe(ws),
		LivenessProbe:  livenessProbe(ws),
		VolumeMounts: []corev1.VolumeMount{
			{Name: "home", MountPath: "/home/opencode", SubPath: "home"},
			{Name: "home", MountPath: "/workspace", SubPath: "workspace"},
			{Name: "config", MountPath: "/etc/opencode"},
			{Name: "tmp", MountPath: "/tmp"},
			{Name: "vartmp", MountPath: "/var/tmp"},
		},
	}

	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ws.Name,
			Namespace: ws.Namespace,
			Labels:    labels,
			OwnerReferences: []metav1.OwnerReference{
				*metav1.NewControllerRef(ws, workspacev1alpha1.SchemeGroupVersion.WithKind(workspacev1alpha1.Kind)),
			},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			// RWO PVC + SQLite：禁止双 Pod 同时挂载。
			Strategy: appsv1.DeploymentStrategy{Type: appsv1.RecreateDeploymentStrategyType},
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"opencode.cloud/workspace-id": ws.Name},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					AutomountServiceAccountToken: &automount,
					TerminationGracePeriodSeconds: int64Ptr(60),
					SecurityContext: &corev1.PodSecurityContext{
						RunAsNonRoot:   boolPtr(true),
						RunAsUser:      &runAsUser,
						RunAsGroup:     &runAsGroup,
						FSGroup:        &fsGroup,
						SeccompProfile: &corev1.SeccompProfile{Type: corev1.SeccompProfileTypeRuntimeDefault},
					},
					NodeSelector: map[string]string{"dedicated": "workspace"},
					Tolerations: []corev1.Toleration{
						{Key: "dedicated", Operator: corev1.TolerationOpEqual, Value: "workspace", Effect: corev1.TaintEffectNoSchedule},
					},
					Containers: []corev1.Container{container},
					Volumes: []corev1.Volume{
						homeVolume(ws),
						{Name: "config", VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{SizeLimit: quantityPtr("64Mi")}}},
						{Name: "tmp", VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{SizeLimit: quantityPtr("2Gi")}}},
						{Name: "vartmp", VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{SizeLimit: quantityPtr("1Gi")}}},
					},
				},
			},
		},
	}
}

// DesiredNetworkPolicies 返回两条基线策略：default-deny + 仅允许 gateway 入站/白名单出站。
func DesiredNetworkPolicies(ws *workspacev1alpha1.OpencodeWorkspace) []*networkingv1.NetworkPolicy {
	labels := LabelsForWorkspace(ws)
	port4096 := intstr.FromInt32(OpencodePort)
	tcp := corev1.ProtocolTCP
	udp := corev1.ProtocolUDP
	port53 := intstr.FromInt32(53)
	port3128 := intstr.FromInt32(EgressProxyPort)
	port4000 := intstr.FromInt32(LiteLLMPort)

	denyAll := &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ws.Name + "-default-deny",
			Namespace: ws.Namespace,
			Labels:    labels,
			OwnerReferences: []metav1.OwnerReference{
				*metav1.NewControllerRef(ws, workspacev1alpha1.SchemeGroupVersion.WithKind(workspacev1alpha1.Kind)),
			},
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress, networkingv1.PolicyTypeEgress},
		},
	}

	allow := &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ws.Name + "-allow",
			Namespace: ws.Namespace,
			Labels:    labels,
			OwnerReferences: []metav1.OwnerReference{
				*metav1.NewControllerRef(ws, workspacev1alpha1.SchemeGroupVersion.WithKind(workspacev1alpha1.Kind)),
			},
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: map[string]string{"opencode.cloud/workspace-id": ws.Name}},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress, networkingv1.PolicyTypeEgress},
			Ingress: []networkingv1.NetworkPolicyIngressRule{
				{
					From: []networkingv1.NetworkPolicyPeer{
						{
							NamespaceSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"kubernetes.io/metadata.name": GatewayNamespace}},
							PodSelector:       &metav1.LabelSelector{MatchLabels: map[string]string{"app.kubernetes.io/name": "workspace-gateway"}},
						},
					},
					Ports: []networkingv1.NetworkPolicyPort{{Protocol: &tcp, Port: &port4096}},
				},
			},
			Egress: []networkingv1.NetworkPolicyEgressRule{
				{ // DNS
					To: []networkingv1.NetworkPolicyPeer{
						{
							NamespaceSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"kubernetes.io/metadata.name": "kube-system"}},
							PodSelector:       &metav1.LabelSelector{MatchLabels: map[string]string{"k8s-app": "kube-dns"}},
						},
					},
					Ports: []networkingv1.NetworkPolicyPort{
						{Protocol: &udp, Port: &port53},
						{Protocol: &tcp, Port: &port53},
					},
				},
				{ // LiteLLM 模型网关（内网）
					To: []networkingv1.NetworkPolicyPeer{
						{
							NamespaceSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"kubernetes.io/metadata.name": GatewayNamespace}},
							PodSelector:       &metav1.LabelSelector{MatchLabels: map[string]string{"app.kubernetes.io/name": "litellm"}},
						},
					},
					Ports: []networkingv1.NetworkPolicyPort{{Protocol: &tcp, Port: &port4000}},
				},
				{ // 唯一公网出口：egress-proxy（域名白名单 + 审计）
					To: []networkingv1.NetworkPolicyPeer{
						{
							NamespaceSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"kubernetes.io/metadata.name": GatewayNamespace}},
							PodSelector:       &metav1.LabelSelector{MatchLabels: map[string]string{"app.kubernetes.io/name": "egress-proxy"}},
						},
					},
					Ports: []networkingv1.NetworkPolicyPort{{Protocol: &tcp, Port: &port3128}},
				},
			},
		},
	}

	return []*networkingv1.NetworkPolicy{denyAll, allow}
}

// WorkspaceURL 计算工作区访问地址（子域名；不支持子路径）。
func WorkspaceURL(ws *workspacev1alpha1.OpencodeWorkspace, domain string) string {
	return fmt.Sprintf("https://%s.ws.%s", ws.Name, domain)
}

func boolPtr(b bool) *bool { return &b }
func int64Ptr(i int64) *int64 { return &i }
func quantityPtr(s string) *resource.Quantity {
	q := resource.MustParse(s)
	return &q
}

func workspaceCommand(ws *workspacev1alpha1.OpencodeWorkspace) []string {
	if len(ws.Spec.Runtime.Command) > 0 {
		return ws.Spec.Runtime.Command
	}
	return []string{"/usr/local/bin/opendream-cloud-entrypoint"}
}

func workspaceArgs(ws *workspacev1alpha1.OpencodeWorkspace) []string {
	return ws.Spec.Runtime.Args
}

func agentProbe(path string) *corev1.Probe {
	return &corev1.Probe{
		ProbeHandler: corev1.ProbeHandler{
			HTTPGet: &corev1.HTTPGetAction{Path: path, Port: intstr.FromInt32(AgentHealthPort)},
		},
	}
}

func startupProbe(ws *workspacev1alpha1.OpencodeWorkspace) *corev1.Probe {
	if ws.Spec.Runtime.Probe == "tcp" {
		return &corev1.Probe{
			ProbeHandler:     corev1.ProbeHandler{TCPSocket: &corev1.TCPSocketAction{Port: intstr.FromInt32(OpencodePort)}},
			PeriodSeconds:    2,
			FailureThreshold: 90,
			TimeoutSeconds:   2,
		}
	}
	probe := agentProbe("/startupz")
	probe.PeriodSeconds = 2
	probe.FailureThreshold = 45
	probe.TimeoutSeconds = 2
	return probe
}

func readinessProbe(ws *workspacev1alpha1.OpencodeWorkspace) *corev1.Probe {
	if ws.Spec.Runtime.Probe == "tcp" {
		return &corev1.Probe{
			ProbeHandler:     corev1.ProbeHandler{TCPSocket: &corev1.TCPSocketAction{Port: intstr.FromInt32(OpencodePort)}},
			PeriodSeconds:    5,
			FailureThreshold: 3,
			TimeoutSeconds:   2,
		}
	}
	probe := agentProbe("/healthz")
	probe.PeriodSeconds = 5
	probe.FailureThreshold = 3
	probe.TimeoutSeconds = 2
	return probe
}

func livenessProbe(ws *workspacev1alpha1.OpencodeWorkspace) *corev1.Probe {
	if ws.Spec.Runtime.Probe == "tcp" {
		return &corev1.Probe{
			ProbeHandler:        corev1.ProbeHandler{TCPSocket: &corev1.TCPSocketAction{Port: intstr.FromInt32(OpencodePort)}},
			InitialDelaySeconds: 120,
			PeriodSeconds:       20,
			FailureThreshold:    6,
		}
	}
	probe := agentProbe("/livez")
	probe.InitialDelaySeconds = 120
	probe.PeriodSeconds = 20
	probe.FailureThreshold = 6
	return probe
}

func homeVolume(ws *workspacev1alpha1.OpencodeWorkspace) corev1.Volume {
	if ws.Spec.Persistence.Mode == "emptyDir" {
		return corev1.Volume{
			Name: "home",
			VolumeSource: corev1.VolumeSource{
				EmptyDir: &corev1.EmptyDirVolumeSource{SizeLimit: quantityPtr("2Gi")},
			},
		}
	}
	return corev1.Volume{
		Name: "home",
		VolumeSource: corev1.VolumeSource{
			PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: ws.Name + "-home"},
		},
	}
}
