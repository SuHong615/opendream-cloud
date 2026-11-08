"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { WorkflowDefinition, WorkflowVersion } from "@/lib/workflow-types";
import type { Model } from "@/lib/types";
import type { RoleItem } from "@/lib/api";

interface CanvasNode { id: string; type: string; name?: string; needs?: string[]; model_ref?: string; executor?: string; role_ref?: string; input?: Record<string, unknown>; assignee?: { type: string; value: string }; sla?: { due?: string } }
const NODE_TYPES = ["agent", "script", "human_approval", "condition", "parallel", "subworkflow", "timer", "webhook", "render"];

function defaultsForType(type: string, id: string): CanvasNode {
  if (type === "agent") return { id, type, name: "Agent 节点", model_ref: "default-coding", executor: "opencode", role_ref: "role_lead", input: { prompt: "请根据上游结果执行本节点任务" } };
  if (type === "script") return { id, type, name: "脚本节点", input: { runtime: "bash", code: "echo ok" } };
  if (type === "human_approval") return { id, type, name: "人工审批", input: { title: "请审批" }, assignee: { type: "role", value: "owner" }, sla: { due: "1h" } };
  if (type === "condition") return { id, type, name: "条件分支", input: {} };
  if (type === "subworkflow") return { id, type, name: "子流程", input: { workflow_id: "" } };
  return { id, type, name: type };
}

function dslNodes(dsl: Record<string, unknown> | null): CanvasNode[] {
  const spec = dsl?.spec as { nodes?: CanvasNode[] } | undefined;
  return Array.isArray(spec?.nodes) ? spec!.nodes! : [];
}

function withNodes(dsl: Record<string, unknown>, nodes: CanvasNode[]): Record<string, unknown> {
  const spec = (dsl.spec ?? {}) as Record<string, unknown>;
  return { ...dsl, spec: { ...spec, nodes } };
}

function autoLayout(nodes: CanvasNode[]): Record<string, { x: number; y: number }> {
  const layers = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    if (layers.has(id)) return layers.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const node = nodes.find((item) => item.id === id);
    const needs = node?.needs ?? [];
    const depth = needs.length ? Math.max(...needs.map((need) => depthOf(need, seen))) + 1 : 0;
    layers.set(id, depth);
    return depth;
  };
  const byLayer = new Map<number, number>();
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    const depth = depthOf(node.id);
    const index = byLayer.get(depth) ?? 0;
    byLayer.set(depth, index + 1);
    positions[node.id] = { x: 40 + depth * 240, y: 40 + index * 110 };
  }
  return positions;
}

export default function SopDesignerPage() {
  const params = useParams<{ id: string }>();
  const workflowId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [dsl, setDsl] = useState<Record<string, unknown> | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [versionInput, setVersionInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [diff, setDiff] = useState<{ added: string[]; removed: string[]; changed: string[] } | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [executors, setExecutors] = useState<Array<{ id: string; label: string }>>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const load = useCallback(async () => {
    if (!workflowId) return;
    try {
      const [def, versionList] = await Promise.all([api.getWorkflow(workflowId), api.listWorkflowVersions(workflowId)]);
      setDefinition(def);
      setVersions(versionList.items);
      const latest = versionList.items.sort((a, b) => b.version.localeCompare(a.version))[0];
      if (latest) {
        setSelectedVersion(latest.id);
        const nextDsl = latest.dsl;
        setDsl(nextDsl);
        setPositions(autoLayout(dslNodes(nextDsl)));
        setVersionInput(bumpVersion(latest.version));
      } else {
        const skeleton = buildSkeleton(def);
        setDsl(skeleton);
        setPositions(autoLayout(dslNodes(skeleton)));
        setVersionInput("1.0.0");
      }
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
    void api.listModels().then((result) => setModels(result.items)).catch(() => setModels([]));
    void api.listExecutors().then((result) => setExecutors(result.items)).catch(() => setExecutors([]));
    void api.listRoles().then((result) => setRoles(result.items)).catch(() => setRoles([]));
  }, [workflowId]);
  useEffect(() => { void load(); }, [load]);

  const nodes = useMemo(() => dslNodes(dsl), [dsl]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  function updateNode(patch: Partial<CanvasNode>) {
    if (!dsl || !selectedNode) return;
    const next = nodes.map((node) => node.id === selectedNode.id ? { ...node, ...patch } : node);
    setDsl(withNodes(dsl, next));
  }

  function updateInput(patch: Record<string, unknown>) {
    if (!selectedNode) return;
    updateNode({ input: { ...(selectedNode.input ?? {}), ...patch } });
  }

  function changeNodeType(type: string) {
    if (!selectedNode) return;
    const defaults = defaultsForType(type, selectedNode.id);
    updateNode({ ...defaults, needs: selectedNode.needs ?? [] });
  }

  function addNode() {
    if (!dsl) return;
    const index = nodes.length + 1;
    const node: CanvasNode = { ...defaultsForType("agent", `node_${index}`), name: `节点 ${index}`, needs: nodes.length ? [nodes[nodes.length - 1]!.id] : [] };
    const next = [...nodes, node];
    setDsl(withNodes(dsl, next));
    setPositions(autoLayout(next));
    setSelectedNodeId(node.id);
  }

  function removeNode(id: string) {
    if (!dsl) return;
    const next = nodes.filter((node) => node.id !== id).map((node) => ({ ...node, needs: (node.needs ?? []).filter((need) => need !== id) }));
    setDsl(withNodes(dsl, next));
    setPositions(autoLayout(next));
    setSelectedNodeId(null);
  }

  function selectNode(id: string) {
    if (connectMode) {
      if (!connectFrom) {
        setConnectFrom(id);
        setSelectedNodeId(id);
        return;
      }
      if (connectFrom !== id) {
        const next = nodes.map((node) => node.id === id ? { ...node, needs: [...new Set([...(node.needs ?? []), connectFrom])] } : node);
        setDsl(withNodes(dsl!, next));
        setConnectFrom(null);
      }
      setSelectedNodeId(id);
      return;
    }
    setSelectedNodeId(id);
  }

  function diffSelectedVersion() {
    const version = versions.find((item) => item.id === selectedVersion);
    if (!version || !dsl) return;
    const before = dslNodes(version.dsl);
    const beforeMap = new Map(before.map((node) => [node.id, node]));
    const afterMap = new Map(nodes.map((node) => [node.id, node]));
    setDiff({
      added: [...afterMap.keys()].filter((id) => !beforeMap.has(id)),
      removed: [...beforeMap.keys()].filter((id) => !afterMap.has(id)),
      changed: [...afterMap.keys()].filter((id) => {
        const prev = beforeMap.get(id);
        const next = afterMap.get(id);
        if (!prev || !next) return false;
        return prev.type !== next.type || prev.name !== next.name || JSON.stringify(prev.needs ?? []) !== JSON.stringify(next.needs ?? []);
      }),
    });
  }

  async function rollbackSelectedVersion() {
    const version = versions.find((item) => item.id === selectedVersion);
    if (!version || !definition) return;
    setBusy("rollback");
    try {
      const nextVersion = bumpVersion([...versions].map((item) => item.version).sort().at(-1) ?? "1.0.0");
      const metadata = (version.dsl.metadata ?? {}) as Record<string, unknown>;
      await api.createWorkflowVersion(definition.id, { version: nextVersion, dsl: { ...version.dsl, metadata: { ...metadata, version: nextVersion } } });
      await load();
      setToastMessage(`已回滚为新版本 ${nextVersion}`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "回滚失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally { setBusy(null); }
  }

  function switchVersion(versionId: string) {
    const version = versions.find((item) => item.id === versionId);
    if (!version) return;
    setSelectedVersion(versionId);
    setDsl(version.dsl);
    setPositions(autoLayout(dslNodes(version.dsl)));
    setVersionInput(bumpVersion(version.version));
  }

  async function saveVersion() {
    if (!dsl || !definition) return;
    setBusy("save");
    try {
      const metadata = (dsl.metadata ?? {}) as Record<string, unknown>;
      const payload = { ...dsl, metadata: { ...metadata, version: versionInput } };
      await api.createWorkflowVersion(definition.id, { version: versionInput, dsl: payload });
      await load();
      setToastMessage(`版本 ${versionInput} 已保存`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "保存失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally { setBusy(null); }
  }

  async function runSop() {
    if (!dsl || !definition) return;
    setBusy("run");
    try {
      const latest = versions.find((item) => item.id === selectedVersion);
      const result = await api.startWorkflowRun({ workflow_id: definition.id, version: latest?.version ?? versionInput, inputs: {} });
      setToastMessage(`SOP 已启动：${result.run_id}`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "启动失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally { setBusy(null); }
  }

  function onPointerDown(event: React.PointerEvent, id: string) {
    const rect = canvasRef.current?.getBoundingClientRect();
    const pos = positions[id] ?? { x: 40, y: 40 };
    drag.current = { id, offsetX: event.clientX - (rect?.left ?? 0) - pos.x, offsetY: event.clientY - (rect?.top ?? 0) - pos.y };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!drag.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setPositions((prev) => ({ ...prev, [drag.current!.id]: { x: Math.max(8, event.clientX - rect.left - drag.current!.offsetX), y: Math.max(8, event.clientY - rect.top - drag.current!.offsetY) } }));
  }
  function onPointerUp() { drag.current = null; }

  if (loading) return <AppShell><div className="oc-page"><Skeleton lines={6} /></div></AppShell>;
  if (!definition || !dsl) return <AppShell><div className="oc-page"><ErrorState description={error?.message ?? "SOP 不存在"} requestId={error?.requestId} onRetry={() => void load()} /></div></AppShell>;

  return (
    <AppShell>
      <div data-testid="sop-designer-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <a href="/orchestration/loopforge" className="text-xs text-fg-tertiary hover:text-fg">← LoopForge 编排</a>
            <div className="oc-eyebrow mt-2">Workflow · SOP Designer</div>
            <h1 className="oc-title">{definition.display_name || definition.name}</h1>
            <p className="oc-subtitle">拖动节点调整布局；点击节点编辑类型、名称与依赖；保存为新版本后即可运行或绑定军团。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="oc-input w-auto" value={selectedVersion} onChange={(e) => switchVersion(e.target.value)} data-testid="sop-version-select">
              {versions.length === 0 ? <option value="">新版本</option> : versions.map((version) => <option key={version.id} value={version.id}>{version.version}</option>)}
            </select>
            <Button className="oc-btn-sm" onClick={addNode} data-testid="sop-add-node">+ 节点</Button>
            <Button className={`oc-btn-sm ${connectMode ? "oc-btn-primary" : ""}`} onClick={() => { setConnectMode((value) => !value); setConnectFrom(null); }} data-testid="sop-connect-mode">{connectMode ? "连线中" : "连线"}</Button>
            <Button className="oc-btn-sm" onClick={diffSelectedVersion} data-testid="sop-diff">对比当前</Button>
            <Button className="oc-btn-sm" onClick={() => void rollbackSelectedVersion()} loading={busy === "rollback"} data-testid="sop-rollback">回滚</Button>
            <Button className="oc-btn-sm" onClick={() => void runSop()} loading={busy === "run"} data-testid="sop-run">运行 SOP</Button>
            <Button className="oc-btn-sm" variant="primary" onClick={() => void saveVersion()} loading={busy === "save"} data-testid="sop-save">保存版本</Button>
          </div>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-fg-tertiary">
          <span>版本号</span>
          <input className="oc-input w-32" value={versionInput} onChange={(e) => setVersionInput(e.target.value)} data-testid="sop-version-input" />
          <span>节点 {nodes.length} 个</span>
          <span>拖拽画布节点可调整布局；保存只写入 DSL，不包含坐标。</span>
        </div>

        {connectMode && <div className="mt-3 rounded-lg border border-[var(--oc-primary)] bg-surface px-3 py-2 text-xs" data-testid="sop-connect-hint">{connectFrom ? `已选择起点 ${connectFrom}，点击目标节点建立依赖` : "连线模式：先点击起点节点，再点击目标节点"}</div>}
        {diff && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--oc-border)" }} data-testid="sop-diff-result">
            <span>对比：新增 {diff.added.length}</span><span>删除 {diff.removed.length}</span><span>变更 {diff.changed.length}</span>
            {[...diff.added.map((id) => `+${id}`), ...diff.removed.map((id) => `-${id}`), ...diff.changed.map((id) => `~${id}`)].slice(0, 8).map((label) => <span key={label} className="font-mono">{label}</span>)}
            <button type="button" className="ml-auto text-fg-tertiary hover:text-fg" onClick={() => setDiff(null)}>关闭</button>
          </div>
        )}

        <div ref={canvasRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="relative mt-4 h-[620px] overflow-auto rounded-xl border bg-surface-2" style={{ borderColor: "var(--oc-border)" }} data-testid="sop-canvas">
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {nodes.flatMap((node) => (node.needs ?? []).map((need) => {
              const from = positions[need]; const to = positions[node.id];
              if (!from || !to) return null;
              return <line key={`${need}-${node.id}`} x1={from.x + 190} y1={from.y + 34} x2={to.x} y2={to.y + 34} stroke="var(--oc-border-strong)" strokeWidth="2" />;
            }))}
          </svg>
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onPointerDown={(event) => onPointerDown(event, node.id)}
              onClick={() => selectNode(node.id)}
              className="absolute w-[190px] cursor-grab rounded-lg border bg-surface p-3 text-left shadow-sm active:cursor-grabbing"
              style={{ left: positions[node.id]?.x ?? 40, top: positions[node.id]?.y ?? 40, borderColor: selectedNodeId === node.id ? "var(--oc-primary)" : "var(--oc-border)" }}
              data-testid="sop-canvas-node"
            >
              <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{node.name || node.id}</span><span className="oc-badge">{node.type}</span></div>
              <div className="mt-1 font-mono text-2xs text-fg-tertiary">{node.id}</div>
              {node.type === "agent" && <div className="mt-1 truncate text-2xs text-fg-tertiary">角色 · {roles.find((role) => role.id === node.role_ref)?.name ?? "未绑定"}</div>}
            </button>
          ))}
        </div>
      </div>

      {selectedNode && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setSelectedNodeId(null)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="sop-node-drawer">
            <h2 className="text-lg font-semibold">节点设置</h2>
            <label className="oc-field-label mt-5" htmlFor="sop-node-id">节点 ID</label>
            <input id="sop-node-id" className="oc-input mt-1.5 font-mono" value={selectedNode.id} disabled />
            <label className="oc-field-label mt-4" htmlFor="sop-node-name">名称</label>
            <input id="sop-node-name" className="oc-input mt-1.5" value={selectedNode.name ?? ""} onChange={(e) => updateNode({ name: e.target.value })} data-testid="sop-node-name" />
            <label className="oc-field-label mt-4" htmlFor="sop-node-type">类型</label>
            <select id="sop-node-type" className="oc-input mt-1.5" value={selectedNode.type} onChange={(e) => changeNodeType(e.target.value)} data-testid="sop-node-type">
              {NODE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>

            {selectedNode.type === "agent" && (
              <>
                <label className="oc-field-label mt-4" htmlFor="sop-node-model">模型（模型中心）</label>
                <select id="sop-node-model" className="oc-input mt-1.5" value={selectedNode.model_ref ?? ""} onChange={(e) => updateNode({ model_ref: e.target.value })} data-testid="sop-node-model">
                  <option value="">请选择模型</option>
                  {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
                <label className="oc-field-label mt-4" htmlFor="sop-node-executor">执行器</label>
                <select id="sop-node-executor" className="oc-input mt-1.5" value={selectedNode.executor ?? "opencode"} onChange={(e) => updateNode({ executor: e.target.value })} data-testid="sop-node-executor">
                  {executors.map((executor) => <option key={executor.id} value={executor.id}>{executor.label}</option>)}
                </select>
                <label className="oc-field-label mt-4" htmlFor="sop-node-role">角色</label>
                <select id="sop-node-role" className="oc-input mt-1.5" value={selectedNode.role_ref ?? ""} onChange={(e) => updateNode({ role_ref: e.target.value })} data-testid="sop-node-role">
                  <option value="">不绑定角色</option>
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
                <label className="oc-field-label mt-4" htmlFor="sop-node-prompt">Prompt</label>
                <textarea id="sop-node-prompt" className="oc-input mt-1.5" rows={4} value={String(selectedNode.input?.prompt ?? "")} onChange={(e) => updateInput({ prompt: e.target.value })} data-testid="sop-node-prompt" />
              </>
            )}

            {selectedNode.type === "human_approval" && (
              <>
                <label className="oc-field-label mt-4" htmlFor="sop-node-title">审批标题</label>
                <input id="sop-node-title" className="oc-input mt-1.5" value={String(selectedNode.input?.title ?? "")} onChange={(e) => updateInput({ title: e.target.value })} data-testid="sop-node-title" />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="oc-field-label">审批人类型
                    <select className="oc-input mt-1.5" value={selectedNode.assignee?.type ?? "role"} onChange={(e) => updateNode({ assignee: { type: e.target.value, value: selectedNode.assignee?.value ?? "owner" } })}>
                      {["user", "role", "team"].map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="oc-field-label">审批人
                    <input className="oc-input mt-1.5" value={selectedNode.assignee?.value ?? ""} onChange={(e) => updateNode({ assignee: { type: selectedNode.assignee?.type ?? "role", value: e.target.value } })} />
                  </label>
                </div>
                <label className="oc-field-label mt-4" htmlFor="sop-node-sla">SLA</label>
                <input id="sop-node-sla" className="oc-input mt-1.5" value={selectedNode.sla?.due ?? ""} onChange={(e) => updateNode({ sla: { due: e.target.value } })} placeholder="1h / 30m / 1d" />
              </>
            )}

            {selectedNode.type === "script" && (
              <>
                <label className="oc-field-label mt-4" htmlFor="sop-node-runtime">Runtime</label>
                <input id="sop-node-runtime" className="oc-input mt-1.5" value={String(selectedNode.input?.runtime ?? "")} onChange={(e) => updateInput({ runtime: e.target.value })} placeholder="bash / node / python" />
                <label className="oc-field-label mt-4" htmlFor="sop-node-code">脚本</label>
                <textarea id="sop-node-code" className="oc-input mt-1.5 font-mono" rows={6} value={String(selectedNode.input?.code ?? "")} onChange={(e) => updateInput({ code: e.target.value })} data-testid="sop-node-code" />
              </>
            )}

            <div className="oc-field-label mt-4">依赖节点（needs）</div>
            <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto rounded-lg border p-3" style={{ borderColor: "var(--oc-border)" }}>
              {nodes.filter((node) => node.id !== selectedNode.id).map((node) => (
                <label key={node.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(selectedNode.needs ?? []).includes(node.id)} onChange={(e) => updateNode({ needs: e.target.checked ? [...(selectedNode.needs ?? []), node.id] : (selectedNode.needs ?? []).filter((id) => id !== node.id) })} />{node.name || node.id} <span className="font-mono text-2xs text-fg-tertiary">{node.id}</span></label>
              ))}
              {nodes.length <= 1 && <span className="text-xs text-fg-tertiary">暂无其他节点</span>}
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="danger" onClick={() => removeNode(selectedNode.id)} data-testid="sop-node-delete">删除节点</Button>
              <Button variant="primary" onClick={() => setSelectedNodeId(null)}>完成</Button>
            </div>
          </div>
        </div>
      )}
      {toastMessage && <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>}
    </AppShell>
  );
}

function bumpVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return "1.0.0";
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function buildSkeleton(definition: WorkflowDefinition): Record<string, unknown> {
  return {
    apiVersion: "workflow.opencode.cloud/v1",
    kind: "Workflow",
    metadata: {
      name: definition.slug || `sop-${definition.id.slice(0, 8)}`,
      version: "1.0.0",
      displayName: definition.display_name || definition.name,
      description: definition.description ?? "",
    },
    spec: {
      nodes: [{ id: "analyze", type: "agent", name: "需求分析", model_ref: "default-coding", input: { prompt: "分析需求并输出结构化任务" } }],
    },
  };
}
