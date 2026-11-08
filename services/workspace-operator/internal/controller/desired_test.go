package controller

import (
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	workspacev1alpha1 "github.com/opendream-cloud/workspace-operator/api/v1alpha1"
)

func sampleWorkspace() *workspacev1alpha1.OpencodeWorkspace {
	return &workspacev1alpha1.OpencodeWorkspace{
		ObjectMeta: metav1.ObjectMeta{Name: "ws-01H7F3C2A91", Namespace: "ws-org-01H"},
		Spec: workspacev1alpha1.OpencodeWorkspaceSpec{
			Owner: workspacev1alpha1.Owner{UserID: "usr-1", OrgID: "org-1"},
			Size:  workspacev1alpha1.Size4C8G,
			Image: workspacev1alpha1.Image{
				Repository: "registry.cn-beijing.aliyuncs.com/opencode/workspace-runtime",
				Tag:        "2.2.5-20261104",
				Digest:     "sha256:0123456789abcdef",
			},
			Persistence: workspacev1alpha1.Persistence{Size: "20Gi"},
		},
	}
}

func TestDesiredDeploymentIs4C8GGuranteed(t *testing.T) {
	dep := DesiredDeployment(sampleWorkspace())
	container := dep.Spec.Template.Spec.Containers[0]

	reqCPU := container.Resources.Requests.Cpu().String()
	limCPU := container.Resources.Limits.Cpu().String()
	reqMem := container.Resources.Requests.Memory().String()
	limMem := container.Resources.Limits.Memory().String()

	if reqCPU != "4" || limCPU != "4" {
		t.Fatalf("cpu requests/limits must both be 4, got req=%s lim=%s", reqCPU, limCPU)
	}
	if reqMem != "8Gi" || limMem != "8Gi" {
		t.Fatalf("memory requests/limits must both be 8Gi, got req=%s lim=%s", reqMem, limMem)
	}
	if *dep.Spec.Replicas != 1 {
		t.Fatalf("replicas must be 1")
	}
	if dep.Spec.Strategy.Type != "Recreate" {
		t.Fatalf("strategy must be Recreate for RWO PVC")
	}
}

func TestDesiredDeploymentSecurityAndImage(t *testing.T) {
	ws := sampleWorkspace()
	dep := DesiredDeployment(ws)
	pod := dep.Spec.Template.Spec
	container := pod.Containers[0]

	if !*pod.SecurityContext.RunAsNonRoot {
		t.Fatalf("pod must runAsNonRoot")
	}
	if *pod.SecurityContext.RunAsUser != 1000 {
		t.Fatalf("workspace uid must be 1000")
	}
	if container.SecurityContext.ReadOnlyRootFilesystem == nil || !*container.SecurityContext.ReadOnlyRootFilesystem {
		t.Fatalf("root filesystem must be read-only")
	}
	if len(container.SecurityContext.Capabilities.Drop) != 1 || container.SecurityContext.Capabilities.Drop[0] != "ALL" {
		t.Fatalf("must drop ALL capabilities")
	}
	if pod.AutomountServiceAccountToken == nil || *pod.AutomountServiceAccountToken {
		t.Fatalf("SA token must not be automounted")
	}
	if container.Image != ws.Spec.Image.Repository+"@"+ws.Spec.Image.Digest {
		t.Fatalf("image must pin digest, got %s", container.Image)
	}
	if container.Ports[0].ContainerPort != 4096 {
		t.Fatalf("opencode port must be 4096")
	}
	if container.StartupProbe.HTTPGet.Path != "/startupz" || container.ReadinessProbe.HTTPGet.Path != "/healthz" {
		t.Fatalf("probes must go through agent :8081")
	}
}

func TestDesiredPVCIsRetained(t *testing.T) {
	ws := sampleWorkspace()
	pvc := DesiredPVC(ws)
	if pvc.Name != ws.Name+"-home" {
		t.Fatalf("unexpected pvc name %s", pvc.Name)
	}
	if got := pvc.Spec.Resources.Requests.Storage().String(); got != "20Gi" {
		t.Fatalf("default pvc size must be 20Gi, got %s", got)
	}
	if pvc.Annotations["opencode.cloud/retain"] != "true" {
		t.Fatalf("pvc must carry retain annotation")
	}
	if *pvc.Spec.StorageClassName != "alicloud-disk-essd" {
		t.Fatalf("unexpected storage class %s", *pvc.Spec.StorageClassName)
	}
	if pvc.Spec.AccessModes[0] != "ReadWriteOnce" {
		t.Fatalf("pvc must be RWO")
	}
}

func TestDesiredNetworkPoliciesDenyByDefault(t *testing.T) {
	ws := sampleWorkspace()
	policies := DesiredNetworkPolicies(ws)
	if len(policies) != 2 {
		t.Fatalf("expected 2 network policies, got %d", len(policies))
	}
	deny := policies[0]
	if len(deny.Spec.PodSelector.MatchLabels) != 0 {
		t.Fatalf("first policy must be default-deny (empty podSelector)")
	}
	allow := policies[1]
	if len(allow.Spec.Ingress) != 1 || allow.Spec.Ingress[0].Ports[0].Port.IntValue() != 4096 {
		t.Fatalf("ingress must only allow gateway -> :4096")
	}
	hasProxy := false
	for _, egress := range allow.Spec.Egress {
		for _, port := range egress.Ports {
			if port.Port.IntValue() == 3128 {
				hasProxy = true
			}
		}
	}
	if !hasProxy {
		t.Fatalf("egress must include egress-proxy :3128 (G2-18: no 0.0.0.0/0)")
	}
}

func TestWorkspaceURLSubdomain(t *testing.T) {
	got := WorkspaceURL(sampleWorkspace(), "example.com")
	if got != "https://ws-01H7F3C2A91.ws.example.com" {
		t.Fatalf("unexpected url %s", got)
	}
}
