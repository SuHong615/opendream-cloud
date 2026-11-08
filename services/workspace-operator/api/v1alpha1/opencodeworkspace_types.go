// Package v1alpha1 定义 OpencodeWorkspace CRD 的 Go 类型。
//
// G4 范围（task-13）：owner / size(=4C8G) / image / persistence；完整 BACKEND §5.2
// 契约（tenantId/config/access/lifecycle/...）在 G5 扩展，新增字段保持向后兼容。
package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const (
	// GroupName 是 CRD 的 API 组。
	GroupName = "workspace.opencode.cloud"
	// Version 是当前 CRD 版本。
	Version = "v1alpha1"
	// Kind 是 CRD 的 Kind。
	Kind = "OpencodeWorkspace"

	// Size4C8G 是 MVP 唯一允许的工作区规格（PLAN C1，requests=limits）。
	Size4C8G = "4C8G"

	// Finalizer 阻止误删：PVC 等资源由 operator 按策略处理后才移除。
	Finalizer = "workspace.opencode.cloud/finalizer"
)

// SchemeGroupVersion 供 scheme 注册使用。
var SchemeGroupVersion = schema.GroupVersion{Group: GroupName, Version: Version}

// Owner 描述工作区归属（租户键 + 用户）。
type Owner struct {
	UserID string `json:"userId"`
	// OrgID 必填（多租户）；保留 omitempty 兼容早期样例。
	OrgID string `json:"orgId,omitempty"`
}

// Image 指定运行时镜像；生产必须使用 digest。
type Image struct {
	Repository string `json:"repository"`
	Tag        string `json:"tag,omitempty"`
	// Digest 生产必填（禁止浮动 tag）。
	Digest string `json:"digest,omitempty"`
}

// Persistence 描述 PVC 策略。
type Persistence struct {
	// Mode: pvc（默认）| emptyDir（无云盘环境/演示用，不持久化）。
	Mode string `json:"mode,omitempty"`
	// Size 默认 20Gi；只允许扩不缩。
	Size string `json:"size,omitempty"`
	// StorageClass 默认 alicloud-disk-essd。
	StorageClass string `json:"storageClass,omitempty"`
	// ReclaimPolicy 仅用于 CR 删除时的语义记录：retain | snapshot-then-delete | delete。
	// 注意：稳态下 operator 永不删除 PVC（D1）。
	ReclaimPolicy string `json:"reclaimPolicy,omitempty"`
}

// Runtime 允许覆盖容器启动命令/探针模式（用于自定义运行时镜像；默认走 workspace-agent）。
type Runtime struct {
	// Command 非空时覆盖镜像默认 command（如 ["/bin/sh","-lc"]）。
	Command []string `json:"command,omitempty"`
	// Args 非空时作为覆盖 command 的参数。
	Args []string `json:"args,omitempty"`
	// Probe: "agent"（默认，HTTP 8081）| "tcp"（TCP 4096，适用于无 workspace-agent 的镜像）。
	Probe string `json:"probe,omitempty"`
}

// OpencodeWorkspaceSpec 是用户/控制面声明的期望状态。
type OpencodeWorkspaceSpec struct {
	Owner       Owner       `json:"owner"`
	Size        string      `json:"size"`
	Image       Image       `json:"image"`
	Persistence Persistence `json:"persistence,omitempty"`
	Runtime     Runtime     `json:"runtime,omitempty"`
}

// Condition 与 metav1.Condition 对齐的简化版（避免额外依赖）。
type Condition struct {
	Type               string      `json:"type"`
	Status             string      `json:"status"`
	Reason             string      `json:"reason,omitempty"`
	Message            string      `json:"message,omitempty"`
	LastTransitionTime metav1.Time `json:"lastTransitionTime,omitempty"`
}

// OpencodeWorkspaceStatus 由 operator 写入。
type OpencodeWorkspaceStatus struct {
	// Phase: Pending|Provisioning|Starting|Ready|Idle|Stopping|Stopped|Error|Deleting|Deleted
	Phase              string      `json:"phase,omitempty"`
	URL                string      `json:"url,omitempty"`
	PodName            string      `json:"podName,omitempty"`
	ServiceName        string      `json:"serviceName,omitempty"`
	PVCName            string      `json:"pvcName,omitempty"`
	ObservedGeneration int64       `json:"observedGeneration,omitempty"`
	Conditions         []Condition `json:"conditions,omitempty"`
}

// OpencodeWorkspace 是 CRD 根对象。
type OpencodeWorkspace struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   OpencodeWorkspaceSpec   `json:"spec,omitempty"`
	Status OpencodeWorkspaceStatus `json:"status,omitempty"`
}

// OpencodeWorkspaceList 是列表类型。
type OpencodeWorkspaceList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []OpencodeWorkspace `json:"items"`
}

// DeepCopyInto 复制到 out。
func (in *OpencodeWorkspace) DeepCopyInto(out *OpencodeWorkspace) {
	*out = *in
	out.TypeMeta = in.TypeMeta
	in.ObjectMeta.DeepCopyInto(&out.ObjectMeta)
	out.Spec = in.Spec
	out.Spec.Runtime.Command = append([]string(nil), in.Spec.Runtime.Command...)
	out.Spec.Runtime.Args = append([]string(nil), in.Spec.Runtime.Args...)
	if in.Status.Conditions != nil {
		out.Status.Conditions = make([]Condition, len(in.Status.Conditions))
		copy(out.Status.Conditions, in.Status.Conditions)
	}
}

// DeepCopy 返回深拷贝。
func (in *OpencodeWorkspace) DeepCopy() *OpencodeWorkspace {
	if in == nil {
		return nil
	}
	out := new(OpencodeWorkspace)
	in.DeepCopyInto(out)
	return out
}

// DeepCopyObject 实现 runtime.Object。
func (in *OpencodeWorkspace) DeepCopyObject() runtime.Object {
	if c := in.DeepCopy(); c != nil {
		return c
	}
	return nil
}

// DeepCopyInto 复制到 out。
func (in *OpencodeWorkspaceList) DeepCopyInto(out *OpencodeWorkspaceList) {
	*out = *in
	out.TypeMeta = in.TypeMeta
	in.ListMeta.DeepCopyInto(&out.ListMeta)
	if in.Items != nil {
		out.Items = make([]OpencodeWorkspace, len(in.Items))
		for i := range in.Items {
			in.Items[i].DeepCopyInto(&out.Items[i])
		}
	}
}

// DeepCopy 返回深拷贝。
func (in *OpencodeWorkspaceList) DeepCopy() *OpencodeWorkspaceList {
	if in == nil {
		return nil
	}
	out := new(OpencodeWorkspaceList)
	in.DeepCopyInto(out)
	return out
}

// DeepCopyObject 实现 runtime.Object。
func (in *OpencodeWorkspaceList) DeepCopyObject() runtime.Object {
	if c := in.DeepCopy(); c != nil {
		return c
	}
	return nil
}

// AddToScheme 注册类型到 scheme。
func AddToScheme(s *runtime.Scheme) error {
	s.AddKnownTypes(SchemeGroupVersion, &OpencodeWorkspace{}, &OpencodeWorkspaceList{})
	metav1.AddToGroupVersion(s, SchemeGroupVersion)
	return nil
}
