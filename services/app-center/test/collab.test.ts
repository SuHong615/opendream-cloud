// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp, setupHarness, TENANT_HEADERS, type Harness } from "./helpers";

let harness: Harness;
beforeAll(() => {
  harness = setupHarness();
});
afterAll(async () => {
  await harness.close();
});

const operatorHeaders = { ...TENANT_HEADERS, "x-oc-user-id": "00000000-0000-4000-8000-0000000000b1", "x-oc-roles": "member" };
const editorHeaders = { ...TENANT_HEADERS, "x-oc-user-id": "00000000-0000-4000-8000-0000000000b2", "x-oc-roles": "member" };
const viewerHeaders = { ...TENANT_HEADERS, "x-oc-user-id": "00000000-0000-4000-8000-0000000000b3", "x-oc-roles": "member" };
const teamHeaders = { ...TENANT_HEADERS, "x-oc-user-id": "00000000-0000-4000-8000-0000000000b4", "x-oc-roles": "member", "x-oc-teams": "team-crm" };

async function permissions(appId: string, headers: Record<string, string>) {
  const response = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${appId}/permissions`, headers });
  expect(response.statusCode).toBe(200);
  return response.json() as { role: string; actions: string[] };
}

describe("App ACL（v3）", () => {
  test("COLLAB-01 成员角色矩阵：operator 有 deploy/rollback、无 edit；viewer 只 view", async () => {
    const app = await createApp(harness.app);
    const owner = await permissions(String(app.id), TENANT_HEADERS);
    expect(owner.role).toBe("owner");
    expect(owner.actions).toEqual(["view", "use", "edit", "share", "deploy", "rollback", "delete"]);

    const addOperator = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${app.id}/members`,
      headers: TENANT_HEADERS,
      payload: { subject_type: "user", subject_id: operatorHeaders["x-oc-user-id"], role: "operator" },
    });
    expect(addOperator.statusCode).toBe(201);
    const operator = await permissions(String(app.id), operatorHeaders);
    expect(operator.role).toBe("operator");
    expect(operator.actions).toEqual(["view", "use", "deploy", "rollback"]);

    await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${app.id}/members`,
      headers: TENANT_HEADERS,
      payload: { subject_type: "user", subject_id: viewerHeaders["x-oc-user-id"], role: "viewer" },
    });
    const viewer = await permissions(String(app.id), viewerHeaders);
    expect(viewer.actions).toEqual(["view"]);

    const memberList = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${app.id}/members`, headers: TENANT_HEADERS });
    expect((memberList.json() as { items: unknown[] }).items).toHaveLength(2);

    const viewerDenied = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${app.id}/members`,
      headers: viewerHeaders,
      payload: { subject_type: "user", subject_id: "u-x", role: "viewer" },
    });
    expect(viewerDenied.statusCode).toBe(403); // 同租户无权限：403（不泄露未授权资源用 404）
  });

  test("COLLAB-02 分享 scope=team：team 成员可见且 effective_role 生效", async () => {
    const app = await createApp(harness.app);
    const share = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${app.id}/shares`,
      headers: TENANT_HEADERS,
      payload: { scope: "team", role: "edit", subject_type: "team", subject_id: "team-crm" },
    });
    expect(share.statusCode).toBe(201);
    const body = share.json() as { scope: string; subject_type: string; subject_id: string };
    expect(body.scope).toBe("team");
    expect(body.subject_type).toBe("team");

    const view = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${app.id}`, headers: teamHeaders });
    expect(view.statusCode).toBe(200);
    expect((view.json() as { effective_role: string }).effective_role).toBe("edit");
  });
});

describe("App 协同（v3）", () => {
  test("COLLAB-03 消息幂等 + 提案 base_version 冲突 + 批准生成新版本 + rollback", async () => {
    const app = await createApp(harness.app);
    const appId = String(app.id);

    // 成员：editor
    await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${appId}/members`,
      headers: TENANT_HEADERS,
      payload: { subject_type: "user", subject_id: editorHeaders["x-oc-user-id"], role: "editor" },
    });

    const collab = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${appId}/collab`, headers: editorHeaders });
    expect(collab.statusCode).toBe(200);
    const session = collab.json() as { session_id: string; base_version: number; last_seq: number };
    expect(session.base_version).toBe(1);

    const message = async () =>
      harness.app.inject({
        method: "POST",
        url: `/api/v1/apps/${appId}/collab/messages`,
        headers: editorHeaders,
        payload: { client_msg_id: "msg-1", type: "chat", content: "hello" },
      });
    const firstMessage = await message();
    expect(firstMessage.statusCode).toBe(201);
    const duplicateMessage = await message();
    expect(duplicateMessage.statusCode).toBe(201);
    expect((duplicateMessage.json() as { id: string }).id).toBe((firstMessage.json() as { id: string }).id);

    const proposalPayload = {
      base_version: 1,
      summary: "add index.ts",
      hash: "sha256:abc123",
      files: [{ path: "src/index.ts", status: "added", additions: 10, deletions: 0, unified_diff: "+hello" }],
    };
    const proposal = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${appId}/collab/proposals`,
      headers: editorHeaders,
      payload: proposalPayload,
    });
    expect(proposal.statusCode).toBe(201);
    const proposalId = (proposal.json() as { id: string; status: string }).id;
    expect((proposal.json() as { status: string }).status).toBe("open");

    const duplicateProposal = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${appId}/collab/proposals`,
      headers: editorHeaders,
      payload: proposalPayload,
    });
    expect(duplicateProposal.statusCode).toBe(200);

    const approve = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${appId}/collab/proposals/${proposalId}/approve`,
      headers: editorHeaders,
      payload: { expected_base_version: 1 },
    });
    expect(approve.statusCode).toBe(200);
    const approved = approve.json() as { version: { version: number; id: string }; proposal: { status: string } };
    expect(approved.version.version).toBe(2);
    expect(approved.proposal.status).toBe("approved");

    const secondProposal = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${appId}/collab/proposals`,
      headers: editorHeaders,
      payload: { ...proposalPayload, hash: "sha256:def456" },
    });
    const secondId = (secondProposal.json() as { id: string }).id;
    // 第三版本前先制造冲突：当前 app.version=2，用旧 base=1 批准
    const conflict = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${appId}/collab/proposals/${secondId}/approve`,
      headers: editorHeaders,
      payload: { expected_base_version: 1 },
    });
    expect(conflict.statusCode).toBe(409);
    const conflictBody = conflict.json() as { error: { code: string; details: { code: string; current_base_version: number } } };
    expect(conflictBody.error.code).toBe("conflict");
    expect(conflictBody.error.details.code).toBe("collab_conflict");
    expect(conflictBody.error.details.current_base_version).toBe(2);

    const versions = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${appId}/versions`, headers: editorHeaders });
    const versionItems = (versions.json() as { items: Array<{ id: string; version: number }> }).items;
    expect(versionItems.map((item) => item.version)).toEqual([1, 2]);
    const v1 = versionItems.find((item) => item.version === 1)!;

    const rollback = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${appId}/versions/${v1.id}/rollback`,
      headers: TENANT_HEADERS,
      payload: {},
    });
    expect(rollback.statusCode).toBe(200);
    expect((rollback.json() as { version: { version: number }; rolled_back_to: number }).rolled_back_to).toBe(1);
    expect((rollback.json() as { version: { version: number } }).version.version).toBe(3);
  });

  test("COLLAB-04 patch 路径白名单：拒绝 .git/.github/CI/密钥/../绝对路径", async () => {
    const app = await createApp(harness.app);
    const appId = String(app.id);
    const denied = [".git/config", ".github/workflows/ci.yml", ".gitlab-ci.yml", ".env", "secrets/prod.key", "../etc/passwd", "/etc/passwd"];
    for (const [index, path] of denied.entries()) {
      const response = await harness.app.inject({
        method: "POST",
        url: `/api/v1/apps/${appId}/collab/proposals`,
        headers: TENANT_HEADERS,
        payload: {
          base_version: 1,
          summary: `deny ${path}`,
          hash: `sha256:denied-${index}`,
          files: [{ path, status: "modified", additions: 1, deletions: 0, unified_diff: "-old\n+new" }],
        },
      });
      expect(response.statusCode).toBe(400);
      const error = (response.json() as { error: { code: string; reason?: string; details?: { cause?: string; files?: Array<{ path: string; reason: string }> } } }).error;
      expect(error.code).toBe("validation_failed");
      expect(error.reason).toBe("collab_patch_denied");
      expect(error.details?.cause).toBeString();
      expect(error.details?.files?.some((file) => file.path === path)).toBe(true);
    }

    const allowed = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${appId}/collab/proposals`,
      headers: TENANT_HEADERS,
      payload: {
        base_version: 1,
        summary: "normal source change",
        hash: "sha256:allowed-1",
        files: [{ path: "src/index.ts", status: "modified", additions: 1, deletions: 0, unified_diff: "-old\n+new" }],
      },
    });
    expect(allowed.statusCode).toBe(201);

    // 批准合并前二次校验：直接篡改已存提案的路径，必须拒绝
    const proposalId = (allowed.json() as { id: string }).id;
    const stored = harness.ctx.store.proposals.get(proposalId)!;
    stored.files = [{ path: ".github/workflows/ci.yml", status: "modified", additions: 1, deletions: 0, unified_diff: "-a\n+b" }];
    const approve = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${appId}/collab/proposals/${proposalId}/approve`,
      headers: TENANT_HEADERS,
      payload: { expected_base_version: 1 },
    });
    expect(approve.statusCode).toBe(400);
    expect((approve.json() as { error: { reason: string } }).error.reason).toBe("collab_patch_denied");
  });

  test("COLLAB-05 AI worker：消息异步生成 open proposal→approve 新版本；同消息幂等", async () => {
    const app = await createApp(harness.app);
    const appId = String(app.id);
    const send = () =>
      harness.app.inject({
        method: "POST",
        url: `/api/v1/apps/${appId}/collab/messages`,
        headers: TENANT_HEADERS,
        payload: { client_msg_id: "worker-msg-1", type: "chat", content: "请为首页增加缓存" },
      });
    expect((await send()).statusCode).toBe(201);
    const tick = await harness.app.inject({ method: "POST", url: "/internal/collab/tick", payload: {} });
    expect(tick.statusCode).toBe(200);
    // 生产路径有 setTimeout(0) 自动 worker；手动 tick 可能先/后于自动 worker，processed 可为 0。
    expect((tick.json() as { processed: number }).processed).toBeGreaterThanOrEqual(0);

    let proposals = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${appId}/collab/proposals`, headers: TENANT_HEADERS });
    let items = (proposals.json() as {
      items: Array<{
        id: string;
        status: string;
        base_version: number;
        content_hash: string;
        test_suggestion: string | null;
        generated_by: string;
        files: Array<{ path: string; unified_diff: string }>;
      }>;
    }).items;
    expect(items).toHaveLength(1);
    const proposal = items[0]!;
    expect(proposal.status).toBe("open");
    expect(proposal.base_version).toBe(1);
    expect(proposal.generated_by).toBe("ai-worker");
    expect(proposal.content_hash).toStartWith("sha256:");
    expect(proposal.test_suggestion).toBeString();
    expect(proposal.files[0]?.path).toStartWith("src/agent-");
    expect(proposal.files[0]?.unified_diff).toContain("AI worker proposal");

    expect((await send()).statusCode).toBe(201);
    await harness.app.inject({ method: "POST", url: "/internal/collab/tick", payload: {} });
    proposals = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${appId}/collab/proposals`, headers: TENANT_HEADERS });
    items = (proposals.json() as { items: typeof items }).items;
    expect(items).toHaveLength(1);

    const approve = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${appId}/collab/proposals/${proposal.id}/approve`,
      headers: TENANT_HEADERS,
      payload: { expected_base_version: 1 },
    });
    expect(approve.statusCode).toBe(200);
    const approved = approve.json() as { version: { version: number; content_hash: string }; proposal: { status: string } };
    expect(approved.version.version).toBe(2);
    expect(approved.version.content_hash).toStartWith("sha256:");
    expect(approved.proposal.status).toBe("approved");

    const versions = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${appId}/versions`, headers: TENANT_HEADERS });
    expect((versions.json() as { items: Array<{ version: number }> }).items.map((item) => item.version)).toEqual([1, 2]);
  });
});
