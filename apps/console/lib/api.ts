// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type {
  AccessTicket,
  ApiErrorBody,
  ApiErrorEnvelope,
  Me,
  Model,
  ModelProvider,
  ModelProviderPreset,
  OpencodeConfigPreview,
  ProviderInput,
  ProviderTestResult,
  Workspace,
} from "@/lib/types";
import type {
  AppAuditEvent,
  AppMember,
  AppRole,
  AppShare,
  AppSummary,
  AppVersion,
  CollabMessage,
  CollabProposal,
  CollabSession,
} from "@/lib/app-collab-types";
import type {
  HumanTask,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowTemplate,
} from "@/lib/workflow-types";
import type {
  DhAvatar,
  DhMessage,
  DhSession,
  DhVoice,
} from "@/lib/digital-human-types";
import type {
  EvalDataset,
  EvalEvaluator,
  EvalRun,
  ExperienceItem,
  MemoryItem,
  ObsOverview,
  OrgInfo,
  OrgMember,
  OrgQuota,
  TimeSeriesPoint,
} from "@/lib/m5-types";
import type {
  McpChannel,
  McpServer,
  McpTool,
  McpVersion,
} from "@/lib/mcp-types";
import type {
  AgentEmployee,
  AgentEmployeeVersion,
  AgentGuardrails,
  AgentRun,
  AgentSchedule,
  AgentSquad,
} from "@/lib/workforce-types";
import type {
  Experiment,
  ExperimentResults,
} from "@/lib/experiment-types";
import type { PromptAsset, PromptInput } from "@/lib/prompt-types";
import type { Skill, SkillDebugResult, SkillInstallation, SkillUploadInput, SkillVersion, UsageResponse } from "@/lib/skills-usage-types";

export class ApiError extends Error {
  code: string;
  reason?: string;
  status: number;
  requestId?: string;
  details?: Record<string, unknown>;

  constructor(
    body: ApiErrorBody | null,
    status: number,
    fallbackMessage = "请求失败",
  ) {
    super(body?.message || fallbackMessage);
    this.name = "ApiError";
    this.code = body?.code || "internal_error";
    this.reason = body?.reason;
    this.status = status;
    this.requestId = body?.request_id;
    this.details = body?.details;
  }

  /** Domain reason first (two-layer error model), then generic code. */
  get displayReason(): string {
    return this.reason || this.code;
  }
}

/** Control plane unreachable (network / proxy / 5xx without usable JSON). */
export function isUnavailable(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.status === 0 || err.code === "proxy_unavailable" || err.status >= 500)
  );
}

let csrfCache: string | null = null;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function setCsrf(token: string | null | undefined) {
  if (token) csrfCache = token;
}

async function getCsrfToken(): Promise<string | null> {
  if (csrfCache) return csrfCache;
  const fromCookie = readCookie("oc_csrf");
  if (fromCookie) {
    csrfCache = fromCookie;
    return fromCookie;
  }
  try {
    const res = await fetch("/api/v1/auth/csrf", { credentials: "include" });
    if (!res.ok) return null;
    const body = (await res.json()) as { csrf_token?: string | null };
    csrfCache = body.csrf_token ?? null;
    return csrfCache;
  } catch {
    return null;
  }
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  const here = window.location.pathname + window.location.search;
  window.location.href = `/login?return_to=${encodeURIComponent(here)}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !path.startsWith("/api/v1/auth/")) {
    const csrf = await getCsrfToken();
    if (csrf) headers.set("x-csrf-token", csrf);
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(null, 0, "无法连接控制面服务");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    if (res.status === 401) redirectToLogin();
    const envelope = body as ApiErrorEnvelope | null;
    const err = new ApiError(
      envelope?.error ?? null,
      res.status,
      res.statusText || "请求失败",
    );
    // Next.js rewrite proxy returns HTML (not JSON envelope) when the
    // control plane is down — treat only that case as "unavailable".
    if (!body && res.status >= 500) {
      err.code = "proxy_unavailable";
      err.message = "控制面服务暂不可达";
    }
    throw err;
  }

  const envelope = body as { error?: ApiErrorBody } | null;
  if (envelope?.error) {
    throw new ApiError(envelope.error, res.status);
  }
  return body as T;
}

const base = "/api/v1";

export const api = {
  login(email: string) {
    return request<{ csrf_token?: string }>(`${base}/auth/dev-login`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }).then((body) => {
      setCsrf(body.csrf_token);
      return body;
    });
  },

  logout() {
    return request<void>(`${base}/auth/logout`, { method: "POST" });
  },

  me() {
    return request<Me>(`${base}/me`);
  },

  listWorkspaces() {
    return request<{ items: Workspace[]; next_cursor: string | null }>(
      `${base}/workspaces`,
    );
  },

  ensureWorkspace() {
    return request<Workspace>(`${base}/workspaces/me/ensure`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  getWorkspace(id: string) {
    return request<Workspace>(`${base}/workspaces/${id}`);
  },

  startWorkspace(id: string) {
    return request<Workspace>(`${base}/workspaces/${id}/start`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  accessTicket(id: string) {
    return request<AccessTicket>(
      `${base}/workspaces/${id}/access-ticket`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  destroyWorkspace(id: string, confirmName: string) {
    return request<Workspace>(`${base}/workspaces/${id}/destroy`, {
      method: "POST",
      body: JSON.stringify({
        confirm_name: confirmName,
        acknowledge_data_loss: true,
        keep_snapshot: true,
      }),
    });
  },

  cancelDestroy(id: string) {
    return request<Workspace>(`${base}/workspaces/${id}/destroy/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  listModels() {
    return request<{ items: Model[]; next_cursor: string | null }>(
      `${base}/models?available=true`,
    );
  },

  /** Model center: presets / providers / connectivity (task-18 contract). */
  listProviderPresets() {
    return request<{ items: ModelProviderPreset[] }>(
      `${base}/model-provider-presets`,
    );
  },

  listModelProviders() {
    return request<{ items: ModelProvider[] }>(`${base}/model-providers`);
  },

  createModelProvider(input: ProviderInput) {
    return request<ModelProvider>(`${base}/model-providers`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateModelProvider(id: string, input: Partial<ProviderInput>) {
    return request<ModelProvider>(`${base}/model-providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteModelProvider(id: string) {
    return request<void>(`${base}/model-providers/${id}`, {
      method: "DELETE",
    });
  },

  testModelProvider(id: string) {
    return request<ProviderTestResult>(`${base}/model-providers/${id}/test`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  activateModelProvider(id: string) {
    return request<ModelProvider>(`${base}/model-providers/${id}/activate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  syncModelProvider(id: string) {
    return request<ProviderTestResult>(`${base}/model-providers/${id}/sync`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  modelConfigPreview() {
    return request<OpencodeConfigPreview>(`${base}/model-config/preview`);
  },

  listAuditLogs(params: { limit?: number } = {}) {
    const q = new URLSearchParams();
    q.set("limit", String(params.limit ?? 20));
    return request<{
      items: AuditLog[];
      next_cursor: string | null;
    }>(`${base}/audit-logs?${q.toString()}`);
  },

  /** ---------------------------------------------------------------- apps */
  listApps() {
    return request<{ items: AppSummary[]; next_cursor?: string | null }>(
      `${base}/apps`,
    );
  },

  getApp(appId: string) {
    return request<AppSummary>(`${base}/apps/${appId}`);
  },

  getAppPermissions(appId: string) {
    return request<{ role: AppRole; actions: string[] }>(
      `${base}/apps/${appId}/permissions`,
    );
  },

  listAppMembers(appId: string) {
    return request<{ items: AppMember[] }>(`${base}/apps/${appId}/members`);
  },

  addAppMember(
    appId: string,
    input: { subject_type: "user" | "team"; subject_id: string; role: AppRole },
  ) {
    return request<AppMember>(`${base}/apps/${appId}/members`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateAppMember(appId: string, memberId: string, role: AppRole) {
    return request<AppMember>(`${base}/apps/${appId}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  removeAppMember(appId: string, memberId: string) {
    return request<void>(`${base}/apps/${appId}/members/${memberId}`, {
      method: "DELETE",
    });
  },

  listAppShares(appId: string) {
    return request<{ items: AppShare[] }>(`${base}/apps/${appId}/shares`);
  },

  createAppShare(
    appId: string,
    input: {
      scope: "public" | "org" | "team" | "users";
      role: "view" | "use" | "edit";
      subject_type?: "user" | "team";
      subject_id?: string;
      expires_at?: string | null;
    },
  ) {
    return request<AppShare>(`${base}/apps/${appId}/shares`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateAppShare(
    appId: string,
    shareId: string,
    input: { role?: "view" | "use" | "edit"; expires_at?: string | null },
  ) {
    return request<AppShare>(`${base}/apps/${appId}/shares/${shareId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteAppShare(appId: string, shareId: string) {
    return request<void>(`${base}/apps/${appId}/shares/${shareId}`, {
      method: "DELETE",
    });
  },

  /** ---------------------------------------------------------- collab */
  getCollabSession(appId: string) {
    return request<CollabSession>(`${base}/apps/${appId}/collab`);
  },

  listCollabMessages(appId: string) {
    return request<{ items: CollabMessage[] }>(
      `${base}/apps/${appId}/collab/messages`,
    );
  },

  sendCollabMessage(appId: string, content: string) {
    return request<{ id: string; seq?: number; created_at: string }>(
      `${base}/apps/${appId}/collab/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          client_msg_id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `msg-${Date.now()}`,
          type: "chat",
          content,
        }),
      },
    );
  },

  listCollabProposals(appId: string, status?: string) {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<{ items: CollabProposal[] }>(
      `${base}/apps/${appId}/collab/proposals${q}`,
    );
  },

  approveCollabProposal(
    appId: string,
    proposalId: string,
    expectedBaseVersion: string,
  ) {
    return request<{ version: AppVersion; proposal?: CollabProposal }>(
      `${base}/apps/${appId}/collab/proposals/${proposalId}/approve`,
      {
        method: "POST",
        body: JSON.stringify({ expected_base_version: expectedBaseVersion }),
      },
    );
  },

  rejectCollabProposal(appId: string, proposalId: string, reason: string, note?: string) {
    return request<CollabProposal>(
      `${base}/apps/${appId}/collab/proposals/${proposalId}/reject`,
      { method: "POST", body: JSON.stringify({ reason, note }) },
    );
  },

  listAppVersions(appId: string) {
    return request<{ items: AppVersion[] }>(`${base}/apps/${appId}/versions`);
  },

  rollbackAppVersion(appId: string, versionId: string) {
    return request<{ version: AppVersion; rolled_back_to?: string }>(
      `${base}/apps/${appId}/versions/${versionId}/rollback`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  listAppAudit(appId: string, limit = 5) {
    return request<{ items: AppAuditEvent[] }>(
      `${base}/audit-logs?resource_type=app&resource_id=${encodeURIComponent(
        appId,
      )}&limit=${limit}`,
    );
  },

  listOrgMembers(orgId: string, q = "") {
    return request<{
      items: { id: string; name?: string; display_name?: string; email?: string }[];
    }>(`${base}/orgs/${orgId}/members?q=${encodeURIComponent(q)}`);
  },

  listOrgTeams(orgId: string, q = "") {
    return request<{ items: { id: string; name: string }[] }>(
      `${base}/orgs/${orgId}/teams?q=${encodeURIComponent(q)}`,
    );
  },

  /** ---------------------------------------------------------- workflows */
  listWorkflows() {
    return request<{ items: WorkflowDefinition[] }>(`${base}/workflows`);
  },

  listWorkflowTemplates() {
    return request<{ items: WorkflowTemplate[] }>(`${base}/workflow-templates`);
  },

  createWorkflow(input: {
    name?: string;
    display_name?: string;
    description?: string;
    category?: string;
    is_template?: boolean;
    template_id?: string;
    slug?: string;
    visibility?: string;
  }) {
    return request<WorkflowDefinition>(`${base}/workflows`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async publishWorkflow(workflowId: string, version: string) {
    try {
      return await request<WorkflowDefinition>(`${base}/workflows/${workflowId}/publish`, {
        method: "POST",
        body: JSON.stringify({ version }),
      });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        return request<WorkflowDefinition>(
          `${base}/workflows/${workflowId}/versions/${version}/publish`,
          { method: "POST", body: JSON.stringify({}) },
        );
      }
      throw err;
    }
  },

  listWorkflowRuns() {
    return request<{ items: WorkflowRun[] }>(`${base}/workflow-runs`);
  },

  getWorkflowRun(runId: string) {
    return request<WorkflowRun>(`${base}/workflow-runs/${runId}`);
  },

  async startWorkflowRun(input: {
    workflow_id: string;
    version?: string;
    inputs?: Record<string, string>;
    trigger?: string;
  }) {
    const normalize = (result: {
      run_id?: string;
      id?: string;
      status?: string;
    }) => ({
      run_id: result.run_id || result.id || "",
      status: result.status || "pending",
    });
    try {
      const result = await request<{ run_id?: string; id?: string; status?: string }>(
        `${base}/workflows/${input.workflow_id}/runs`,
        {
          method: "POST",
          body: JSON.stringify({ version: input.version, inputs: input.inputs }),
        },
      );
      return normalize(result);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        const result = await request<{ run_id?: string; id?: string; status?: string }>(
          `${base}/workflow-runs`,
          {
            method: "POST",
            body: JSON.stringify({
              workflow_id: input.workflow_id,
              version: input.version,
              inputs: input.inputs,
              trigger: input.trigger,
            }),
          },
        );
        return normalize(result);
      }
      throw err;
    }
  },

  cancelWorkflowRun(runId: string) {
    return request<WorkflowRun>(`${base}/workflow-runs/${runId}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  retryWorkflowRun(runId: string) {
    return request<{ run_id: string; status: string }>(
      `${base}/workflow-runs/${runId}/replay`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  listHumanTasks() {
    return request<{ items: HumanTask[] }>(`${base}/human-tasks`);
  },

  decideHumanTask(
    taskId: string,
    decision: "approve" | "reject",
    comment?: string,
  ) {
    return request<HumanTask>(`${base}/human-tasks/${taskId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    });
  },

  /** ---------------------------------------------------- digital human */
  listDhAvatars() {
    return request<{
      items: {
        id: string;
        name: string;
        tier?: string;
        status?: string;
        preview_url?: string;
        language?: string[];
      }[];
    }>(`${base}/dh/avatars`).then((result) => ({
      items: result.items.map((item) => ({
        id: item.id,
        name: item.name,
        style: item.tier || "L1",
        status:
          item.status === "active" ? "ready" : item.status ?? "ready",
        description: item.language?.join(" / "),
      })),
    }));
  },

  listDhVoices() {
    return request<{
      items: {
        id: string;
        name: string;
        provider?: string;
        language?: string;
        gender?: string;
        style?: string;
        status?: string;
      }[];
    }>(`${base}/dh/voices`).then((result) => ({
      items: result.items.map((item) => ({
        id: item.id,
        name: item.name,
        gender: item.gender,
        language: item.language || "zh-CN",
        status:
          item.status === "active" ? "ready" : item.status ?? "ready",
        description: [item.provider, item.style].filter(Boolean).join(" · "),
      })),
    }));
  },

  listDhSessions() {
    return request<{ items: DhSession[] }>(`${base}/dh/sessions`).then((result) => ({
      items: result.items.map(normalizeDhSession),
    }));
  },

  createDhSession(input: {
    avatar_id: string;
    voice_id: string;
    greeting?: string;
  }) {
    return request<DhSession>(`${base}/dh/sessions`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then(normalizeDhSession);
  },

  getDhSession(sessionId: string) {
    return request<DhSession>(`${base}/dh/sessions/${sessionId}`).then(
      normalizeDhSession,
    );
  },

  async sendDhInput(sessionId: string, text: string) {
    try {
      const result = await request<{
        message_id?: string;
        role?: string;
        text?: string;
        latency_ms?: number;
        created_at?: string;
      }>(`${base}/dh/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      return normalizeDhReply(result);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        const result = await request<{
          accepted?: boolean;
          reply?: {
            message_id?: string;
            role?: string;
            text?: string;
            latency_ms?: number;
            created_at?: string;
          };
        }>(`${base}/dh/sessions/${sessionId}/input`, {
          method: "POST",
          body: JSON.stringify({ type: "text", text }),
        });
        return normalizeDhReply(result.reply ?? {});
      }
      throw err;
    }
  },

  endDhSession(sessionId: string, reason = "user_left") {
    return request<{
      session_id?: string;
      id?: string;
      state?: string;
      status?: string;
      ended_at?: string;
      end_reason?: string;
    }>(`${base}/dh/sessions/${sessionId}/end`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }).then((result) => ({
      id: result.session_id || result.id || sessionId,
      status: result.state || result.status || "ended",
      ended_at: result.ended_at || new Date().toISOString(),
      end_reason: result.end_reason || reason,
    })) as Promise<DhSession>;
  },

  /** --------------------------------------------------------------- M5 */
  listEvalDatasets() {
    return request<{ items: EvalDataset[] }>(`${base}/eval-datasets`);
  },

  listEvalEvaluators() {
    return request<{ items: EvalEvaluator[] }>(`${base}/eval-evaluators`);
  },

  createEvalEvaluator(input: {
    name: string;
    kind?: string;
    description?: string;
  }) {
    return request<EvalEvaluator>(`${base}/eval-evaluators`, {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        display_name: input.name,
        description: input.description,
        kind: "custom",
        metric: "custom",
        prompt: input.description || input.name,
      }),
    });
  },

  listEvalRuns() {
    return request<{ items: EvalRun[] }>(`${base}/eval-runs`);
  },

  createEvalRun(input: {
    name?: string;
    dataset_id: string;
    evaluator_id?: string;
  }) {
    return request<EvalRun>(`${base}/eval-runs`, {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        dataset_id: input.dataset_id,
        evaluator_ids: input.evaluator_id ? [input.evaluator_id] : undefined,
      }),
    });
  },

  getEvalRun(runId: string) {
    return request<EvalRun & { report?: unknown }>(`${base}/eval-runs/${runId}`);
  },

  listMemory(q?: string) {
    const normalize = (body: {
      items?: MemoryItem[];
      results?: Array<{
        id: string;
        memory?: string;
        text?: string;
        scope?: string;
        user_id?: string;
        created_at?: string | number;
        score?: number;
        metadata?: Record<string, unknown>;
      }>;
    }) => ({
      items: (body.items ??
        (body.results ?? []).map((item) => ({
          id: item.id,
          text: item.memory || item.text || "",
          scope: item.scope,
          user_id: item.user_id,
          score: item.score,
          metadata: item.metadata,
          created_at:
            typeof item.created_at === "number"
              ? new Date(item.created_at).toISOString()
              : item.created_at,
        }))) as MemoryItem[],
    });
    if (q) {
      return request<Parameters<typeof normalize>[0]>(`${base}/memories/search`, {
        method: "POST",
        body: JSON.stringify({ query: q, top_k: 20 }),
      }).then(normalize);
    }
    return request<Parameters<typeof normalize>[0]>(`${base}/memories`).then(
      normalize,
    );
  },

  addMemory(text: string, scope = "user") {
    return request<{ id?: string }>(`${base}/memories`, {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: text }],
        metadata: { scope },
      }),
    });
  },

  deleteMemory(memoryId: string) {
    return request<void>(`${base}/memories/${memoryId}`, { method: "DELETE" });
  },

  listExperiences(q?: string) {
    if (q) {
      return request<{ items: ExperienceItem[] }>(
        `${base}/experiences/search?q=${encodeURIComponent(q)}`,
      );
    }
    return request<{ items: ExperienceItem[] }>(`${base}/experiences`);
  },

  getObservabilityOverview() {
    return request<{
      workspaces?: number | { total?: number; ready?: number };
      usage?: { tokens?: number; cost_usd?: number; errors?: number; requests?: number };
      tokens?: number;
      cost_usd?: string;
      error_rate?: number;
      mcp_servers?: number;
      eval_runs?: number;
      mcp?: { calls?: number; denied?: number };
      eval?: { runs?: number };
      services?: ObsOverview["services"];
      updated_at?: string;
    }>(`${base}/observability/overview`).then((body) => {
      const requests = body.usage?.requests ?? 0;
      const errors = body.usage?.errors ?? 0;
      return {
        workspaces:
          typeof body.workspaces === "number"
            ? body.workspaces
            : body.workspaces?.total ?? 0,
        tokens: body.usage?.tokens ?? body.tokens ?? 0,
        cost_usd:
          body.cost_usd ??
          String((body.usage?.cost_usd ?? 0).toFixed(2)),
        error_rate:
          body.error_rate ?? (requests > 0 ? errors / requests : 0),
        mcp_servers:
          body.mcp_servers ?? body.mcp?.calls ?? 0,
        eval_runs: body.eval_runs ?? body.eval?.runs ?? 0,
        services: body.services,
        updated_at: body.updated_at ?? new Date().toISOString(),
      } satisfies ObsOverview;
    });
  },

  getObservabilityTimeseries(metric = "tokens") {
    return request<{ points: TimeSeriesPoint[]; items: TimeSeriesPoint[] }>(
      `${base}/observability/timeseries?metric=${metric}&step=3600`,
    );
  },

  getCurrentOrg() {
    return request<{ organization: OrgInfo; quotas: OrgQuota }>(
      `${base}/organizations/current`,
    );
  },

  listOrgMembersCurrent() {
    return request<{ items: OrgMember[] }>(
      `${base}/organizations/current/members`,
    );
  },

  inviteOrgMember(email: string, role: string) {
    return request<OrgMember>(`${base}/organizations/current/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  },

  updateOrgMemberRole(memberId: string, role: string) {
    return request<OrgMember>(
      `${base}/organizations/current/members/${memberId}`,
      { method: "PATCH", body: JSON.stringify({ role }) },
    );
  },

  removeOrgMember(memberId: string) {
    return request<void>(`${base}/organizations/current/members/${memberId}`, {
      method: "DELETE",
    });
  },

  getOrgQuotas() {
    return request<OrgQuota>(`${base}/organizations/current/quotas`);
  },

  /** --------------------------------------------------------------- MCP */
  listMcpServers() {
    return request<{ items: McpServer[] }>(`${base}/mcp-servers`);
  },

  listMcpVersions(serverId: string) {
    return request<{ items: McpVersion[] }>(
      `${base}/mcp-servers/${serverId}/versions`,
    );
  },

  reviewMcpVersion(
    serverId: string,
    versionId: string,
    decision: "approve" | "reject",
    comment?: string,
  ) {
    return request<McpVersion>(
      `${base}/mcp-servers/${serverId}/versions/${versionId}/review`,
      { method: "POST", body: JSON.stringify({ decision, comment }) },
    );
  },

  publishMcpVersion(serverId: string, versionId: string) {
    return request<McpVersion>(
      `${base}/mcp-servers/${serverId}/versions/${versionId}/publish`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  yankMcpVersion(serverId: string, versionId: string, reason?: string) {
    return request<McpVersion>(
      `${base}/mcp-servers/${serverId}/versions/${versionId}/yank`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
  },

  getMcpChannels(serverId: string) {
    return request<{ items: McpChannel[] } | McpChannel[]>(
      `${base}/mcp-servers/${serverId}/channels`,
    );
  },

  updateMcpChannels(
    serverId: string,
    channels: { channel: string; version_id: string }[],
  ) {
    return request<{ items: McpChannel[] }>(
      `${base}/mcp-servers/${serverId}/channels`,
      { method: "PUT", body: JSON.stringify({ channels }) },
    );
  },

  listMcpTools(serverId: string) {
    return request<{ items: McpTool[] }>(
      `${base}/mcp-servers/${serverId}/tools`,
    );
  },

  /** ------------------------------------------------- agent workforce */
  listAgentEmployees() {
    return request<{ items: AgentEmployee[] }>(`${base}/agent-employees`);
  },

  getAgentEmployee(employeeId: string) {
    return request<AgentEmployee>(`${base}/agent-employees/${employeeId}`);
  },

  createAgentEmployee(input: {
    name: string;
    role: string;
    title: string;
    mission: string;
    skills?: string[];
    mcp_servers?: string[];
    memory_scope?: string;
    autonomy?: string;
    avatar_color?: string;
  }) {
    return request<AgentEmployee>(`${base}/agent-employees`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateAgentEmployee(
    employeeId: string,
    input: {
      name?: string;
      title?: string;
      mission?: string;
      skills?: string[];
      status?: "active" | "paused";
    },
  ) {
    return request<AgentEmployee>(`${base}/agent-employees/${employeeId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  listAgentSquads() {
    return request<{ items: AgentSquad[] }>(`${base}/agent-squads`);
  },

  getAgentSquad(squadId: string) {
    return request<AgentSquad>(`${base}/agent-squads/${squadId}`);
  },

  startAgentSquadRun(
    squadId: string,
    input: { goal: string; app_id?: string; context?: Record<string, unknown> },
  ) {
    return request<AgentRun>(`${base}/agent-squads/${squadId}/runs`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listAgentRuns() {
    return request<{ items: AgentRun[] }>(`${base}/agent-runs`);
  },

  getAgentRun(runId: string) {
    return request<AgentRun>(`${base}/agent-runs/${runId}`);
  },

  decideAgentRun(
    runId: string,
    input: { gate?: string; decision: "approved" | "rejected" },
  ) {
    return request<AgentRun>(`${base}/agent-runs/${runId}/approve`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getAgentGuardrails(employeeId: string) {
    return request<AgentGuardrails>(
      `${base}/agent-employees/${employeeId}/guardrails`,
    );
  },

  updateAgentGuardrails(employeeId: string, input: AgentGuardrails) {
    return request<AgentGuardrails>(
      `${base}/agent-employees/${employeeId}/guardrails`,
      { method: "PUT", body: JSON.stringify(input) },
    );
  },

  listAgentEmployeeVersions(employeeId: string) {
    return request<{ items: AgentEmployeeVersion[] }>(
      `${base}/agent-employees/${employeeId}/versions`,
    );
  },

  snapshotAgentEmployeeVersion(employeeId: string) {
    return request<AgentEmployeeVersion>(
      `${base}/agent-employees/${employeeId}/versions`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  rollbackAgentEmployeeVersion(employeeId: string, versionId: string) {
    return request<AgentEmployee>(
      `${base}/agent-employees/${employeeId}/rollback`,
      { method: "POST", body: JSON.stringify({ version_id: versionId }) },
    );
  },

  listAgentSchedules() {
    return request<{ items: AgentSchedule[] }>(`${base}/agent-schedules`);
  },

  createAgentSchedule(input: {
    name: string;
    squad_id: string;
    goal: string;
    interval_minutes: number;
    enabled: boolean;
  }) {
    return request<AgentSchedule>(`${base}/agent-schedules`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateAgentSchedule(
    scheduleId: string,
    input: {
      name?: string;
      goal?: string;
      interval_minutes?: number;
      enabled?: boolean;
    },
  ) {
    return request<AgentSchedule>(`${base}/agent-schedules/${scheduleId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  runAgentSchedule(scheduleId: string) {
    return request<{ schedule: AgentSchedule; run: AgentRun }>(
      `${base}/agent-schedules/${scheduleId}/run`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  deleteAgentSchedule(scheduleId: string) {
    return request<void>(`${base}/agent-schedules/${scheduleId}`, {
      method: "DELETE",
    });
  },

  /** ------------------------------------------------- experiments (M10) */
  listExperiments() {
    return request<{ items: Experiment[] }>(`${base}/experiments`);
  },

  createExperiment(input: {
    name: string;
    description?: string;
    dataset_id: string;
    evaluator_id?: string | null;
    variants: Array<{
      name: string;
      model: string;
      prompt_ref?: string | null;
      weight?: number;
    }>;
  }) {
    return request<Experiment>(`${base}/experiments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  startExperiment(experimentId: string) {
    return request<Experiment>(`${base}/experiments/${experimentId}/start`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  getExperimentResults(experimentId: string) {
    return request<ExperimentResults>(
      `${base}/experiments/${experimentId}/results`,
    );
  },

  deleteExperiment(experimentId: string) {
    return request<void>(`${base}/experiments/${experimentId}`, {
      method: "DELETE",
    });
  },

  /** ------------------------------------------------- prompts library */
  listPrompts(params: { q?: string; tag?: string } = {}) {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.tag) query.set("tag", params.tag);
    const suffix = query.toString();
    return request<{ items: PromptAsset[] }>(
      `${base}/prompts${suffix ? `?${suffix}` : ""}`,
    );
  },

  getPrompt(promptId: string) {
    return request<PromptAsset>(`${base}/prompts/${promptId}`);
  },

  createPrompt(input: PromptInput) {
    return request<PromptAsset>(`${base}/prompts`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updatePrompt(promptId: string, input: Partial<PromptInput>) {
    return request<PromptAsset>(`${base}/prompts/${promptId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deletePrompt(promptId: string) {
    return request<void>(`${base}/prompts/${promptId}`, { method: "DELETE" });
  },

  /** ------------------------------------------------- skills & usage */
  listSkills(params: {
    q?: string;
    category?: string;
    cursor?: string;
    limit?: number;
  } = {}) {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.category) query.set("category", params.category);
    if (params.cursor) query.set("cursor", params.cursor);
    query.set("limit", String(params.limit ?? 100));
    return request<{ items: Skill[]; next_cursor?: string | null }>(
      `${base}/skills?${query.toString()}`,
    );
  },

  getSkill(skillId: string) {
    return request<Skill>(`${base}/skills/${skillId}`);
  },

  uploadSkill(input: SkillUploadInput) {
    return request<{ skill: Skill; version: SkillVersion }>(
      `${base}/skills/upload`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  updateSkill(
    skillId: string,
    input: {
      name?: string;
      summary?: string | null;
      category?: string | null;
      visibility?: string;
    },
  ) {
    return request<Skill>(`${base}/skills/${skillId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteSkill(skillId: string) {
    return request<void>(`${base}/skills/${skillId}`, { method: "DELETE" });
  },

  listSkillVersions(skillId: string) {
    return request<{ items: SkillVersion[] }>(
      `${base}/skills/${skillId}/versions?limit=100`,
    );
  },

  getSkillVersion(skillId: string, versionId: string) {
    return request<SkillVersion>(
      `${base}/skills/${skillId}/versions/${versionId}`,
    );
  },

  submitSkillReview(skillId: string, versionId: string) {
    return request<SkillVersion>(
      `${base}/skills/${skillId}/versions/${versionId}/submit-review`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  reviewSkillVersion(
    skillId: string,
    versionId: string,
    input: { decision: "approve" | "reject"; comment?: string },
  ) {
    return request<SkillVersion>(
      `${base}/skills/${skillId}/versions/${versionId}/review`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  publishSkillVersion(skillId: string, versionId: string) {
    return request<SkillVersion>(
      `${base}/skills/${skillId}/versions/${versionId}/publish`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  yankSkillVersion(skillId: string, versionId: string, reason: string) {
    return request<SkillVersion>(
      `${base}/skills/${skillId}/versions/${versionId}/yank`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
  },

  rollbackSkillVersion(skillId: string, versionId: string) {
    return request<SkillVersion>(
      `${base}/skills/${skillId}/versions/${versionId}/rollback`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  debugSkill(skillId: string, input: string) {
    return request<SkillDebugResult>(`${base}/skills/${skillId}/debug`, {
      method: "POST",
      body: JSON.stringify({ input }),
    });
  },

  enableSkill(skillId: string) {
    return request<{ skill: Skill; version?: SkillVersion }>(
      `${base}/skills/${skillId}/enable`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  disableSkill(skillId: string) {
    return request<{ skill: Skill }>(`${base}/skills/${skillId}/disable`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  installSkill(skillId: string, workspaceId?: string) {
    return request<SkillInstallation>(`${base}/skills/${skillId}/install`, {
      method: "POST",
      body: JSON.stringify({ workspace_id: workspaceId ?? null }),
    });
  },

  listSkillInstallations() {
    return request<{ items: SkillInstallation[] }>(`${base}/skill-installations`);
  },

  uninstallSkill(installationId: string) {
    return request<void>(`${base}/skill-installations/${installationId}`, {
      method: "DELETE",
    });
  },

  getUsage(params: { from: string; to: string; groupBy?: "hour" | "day" | "none" }) {
    const query = new URLSearchParams({
      from: params.from,
      to: params.to,
      group_by: params.groupBy ?? "hour",
    });
    return request<UsageResponse>(`${base}/usage?${query.toString()}`);
  },

  listApiKeys() {
    return request<{ items: ApiKeyItem[] }>(`${base}/api-keys`);
  },
  createApiKey(input: { name: string; scopes?: string[] }) {
    return request<{ id: string; plaintext: string; prefix: string; name: string; scopes: string[]; created_at: string }>(`${base}/api-keys`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  revokeApiKey(id: string) {
    return request<void>(`${base}/api-keys/${id}`, { method: "DELETE" });
  },
  rotateApiKey(id: string) {
    return request<{ id: string; plaintext: string; prefix: string; rotated_at: string }>(`${base}/api-keys/${id}/rotate`, {
      method: "POST",
      body: "{}",
    });
  },
  createAuditExport() {
    return request<{ id: string; rows: number; download_url: string }>(`${base}/audit-logs/exports`, { method: "POST", body: "{}" });
  },
  createUsageExport() {
    return request<{ id: string; rows: number; download_url: string }>(`${base}/usage/exports`, { method: "POST", body: "{}" });
  },
  listQuotaRequests() {
    return request<{ items: Array<{ id: string; resource: string; amount: number; reason: string; status: string; created_at: string }> }>(`${base}/quota-requests`);
  },
  createQuotaRequest(input: { resource: string; amount: number; reason?: string }) {
    return request<{ id: string; status: string }>(`${base}/quota-requests`, { method: "POST", body: JSON.stringify(input) });
  },
  listCredentials() {
    return request<{ items: CredentialItem[] }>(`${base}/credentials`);
  },
  createCredential(input: { name: string; env_key: string; value: string; description?: string }) {
    return request<CredentialItem>(`${base}/credentials`, { method: "POST", body: JSON.stringify(input) });
  },
  deleteCredential(id: string) {
    return request<void>(`${base}/credentials/${id}`, { method: "DELETE" });
  },
  listAgentTemplates() {
    return request<{ items: AgentTemplateItem[] }>(`${base}/agent-templates`);
  },
  instantiateAgentTemplate(templateId: string, name?: string) {
    return request<{ id: string; name: string }>(`${base}/agent-templates/${templateId}/instantiate`, { method: "POST", body: JSON.stringify({ name }) });
  },
  listOutboxEvents(status?: string) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<{ items: OutboxEventItem[]; stats: Record<string, number> }>(`${base}/outbox/events${query}`);
  },
  replayOutboxEvent(id: string) {
    return request<{ id: string; status: string }>(`${base}/outbox/events/${id}/replay`, { method: "POST", body: "{}" });
  },
  createDesktopPairing() {
    return request<{ code: string; expires_at: string; cloud_url: string; api_url: string }>(`${base}/desktop/pairings`, { method: "POST", body: "{}" });
  },
  listDesktopDevices() {
    return request<{ items: Array<{ id: string; name: string; platform: string; last_seen_at: string | null; created_at: string }> }>(`${base}/desktop/devices`);
  },
  revokeDesktopDevice(id: string) {
    return request<void>(`${base}/desktop/devices/${id}`, { method: "DELETE" });
  },
};

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface CredentialItem {
  id: string;
  name: string;
  env_key: string;
  description: string;
  masked: string;
  created_at: string;
  updated_at: string;
}

export interface AgentTemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  config: { role: string; title: string; mission: string; agent_type?: string; skills?: string[]; mcp_servers?: string[] };
}

export interface OutboxEventItem {
  id: string;
  topic: string;
  status: string;
  attempts: number;
  created_at: string;
  available_at: string;
  published_at: string | null;
  last_error: string | null;
}

function normalizeDhSession(input: DhSession & {
  session_id?: string;
  state?: string;
  started_at?: string;
  created_at?: string;
}): DhSession {
  const status = input.status || input.state || "creating";
  return {
    ...input,
    id: input.session_id || input.id,
    status:
      status === "created"
        ? "creating"
        : status === "connecting"
          ? "creating"
          : status,
    started_at: input.started_at || input.created_at,
  };
}

function normalizeDhReply(input: {
  message_id?: string;
  role?: string;
  text?: string;
  latency_ms?: number;
  created_at?: string;
}): { message?: DhMessage; status?: string } {
  if (!input.text) return { status: "accepted" };
  return {
    status: "accepted",
    message: {
      id: input.message_id || `dh-ai-${Date.now()}`,
      role: (input.role as DhMessage["role"]) || "assistant",
      text: input.text,
      latency_ms: input.latency_ms,
      created_at: input.created_at || new Date().toISOString(),
    },
  };
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_type?: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  resource_name?: string | null;
  outcome?: "success" | "denied" | "error";
  request_id?: string | null;
  created_at: string;
}

export function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
