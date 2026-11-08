// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildAndDeploy, createApp, setupHarness, TENANT_HEADERS, type Harness } from "./helpers";

let harness: Harness;
beforeAll(() => {
  harness = setupHarness();
});
afterAll(async () => {
  await harness.close();
});

const memberHeaders = { "x-oc-org-id": "00000000-0000-4000-8000-000000000001", "x-oc-user-id": "00000000-0000-4000-8000-000000000003", "x-oc-roles": "member" };
const otherOrgHeaders = { "x-oc-org-id": "00000000-0000-4000-8000-000000000099", "x-oc-user-id": "00000000-0000-4000-8000-000000000098", "x-oc-roles": "owner" };

describe("App 生命周期", () => {
  test("APP-01 创建 → 预检 → 构建 → 部署（1C2G）", async () => {
    const app = await createApp(harness.app);
    const preflight = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/preflight`, headers: TENANT_HEADERS, payload: {} });
    expect(preflight.statusCode).toBe(200);
    expect((preflight.json() as { checks: unknown[] }).checks.length).toBeGreaterThan(0);

    const { build, deployment } = await buildAndDeploy(harness.app, String(app.id));
    expect(build.status).toBe("succeeded");
    expect(build.image_digest).toStartWith("sha256:");
    expect(deployment.status).toBe("running");
    const resources = deployment.resources as { requests: { cpu: string; memory: string }; limits: { cpu: string; memory: string } };
    expect(resources.requests).toEqual({ cpu: "1", memory: "2Gi" });
    expect(resources.limits).toEqual(resources.requests);

    const fetched = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${app.id}`, headers: TENANT_HEADERS });
    expect((fetched.json() as { state: string }).state).toBe("ready");
  });

  test("APP-02 分享 ACL：user/use → 成员可见 → 越权 404/403", async () => {
    const app = await createApp(harness.app);
    const share = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${app.id}/shares`,
      headers: TENANT_HEADERS,
      payload: { scope: "users", role: "use", subject_type: "user", subject_id: "00000000-0000-4000-8000-000000000003" },
    });
    expect(share.statusCode).toBe(201);

    const memberView = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${app.id}`, headers: memberHeaders });
    expect(memberView.statusCode).toBe(200);
    expect((memberView.json() as { effective_role: string }).effective_role).toBe("use");

    const memberDelete = await harness.app.inject({ method: "DELETE", url: `/api/v1/apps/${app.id}`, headers: memberHeaders });
    expect(memberDelete.statusCode).toBe(403);

    const otherOrg = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${app.id}`, headers: otherOrgHeaders });
    expect(otherOrg.statusCode).toBe(404);
  });

  test("APP-03 shares/preview 不落库、无 total；重复 share 409", async () => {
    const app = await createApp(harness.app);
    const preview = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${app.id}/shares/preview`,
      headers: TENANT_HEADERS,
      payload: { shares: [{ scope: "users", role: "use", subject_type: "user", subject_id: "u-1" }, { scope: "org", role: "view" }] },
    });
    expect(preview.statusCode).toBe(200);
    const body = preview.json() as { visible_users: string[]; total?: number; resulting_shares: unknown[] };
    expect(body.visible_users).toEqual(["u-1"]);
    expect(body.total).toBeUndefined();
    expect(body.resulting_shares).toHaveLength(2);

    await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/shares`, headers: TENANT_HEADERS, payload: { scope: "org", role: "view" } });
    const duplicate = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/shares`, headers: TENANT_HEADERS, payload: { scope: "org", role: "use" } });
    expect(duplicate.statusCode).toBe(409);
  });

  test("APP-04 access-ticket EdDSA/60s/jti 一次性 + access-request", async () => {
    const app = await createApp(harness.app);
    await buildAndDeploy(harness.app, String(app.id));
    const ticketResponse = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/access-ticket`, headers: TENANT_HEADERS, payload: {} });
    expect(ticketResponse.statusCode).toBe(200);
    const ticket = ticketResponse.json() as { ticket: string; expires_in: number; jti: string };
    expect(ticket.expires_in).toBe(60);
    expect(ticket.ticket.startsWith("v1.")).toBe(true);
    const payload = harness.ctx.signer.verify(ticket.ticket);
    expect(payload).not.toBeNull();
    expect(String(payload!.jti)).toBe(ticket.jti);
    expect(String(payload!.aud)).toBe(`app:${app.id}`);

    const request = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/access-requests`, headers: memberHeaders, payload: {} });
    expect(request.statusCode).toBe(202);
    const again = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/access-requests`, headers: memberHeaders, payload: {} });
    expect(again.statusCode).toBe(409);
  });

  test("APP-05 休眠/唤醒别名 + 域名验证状态机", async () => {
    const app = await createApp(harness.app);
    const { deployment } = await buildAndDeploy(harness.app, String(app.id));

    const sleep = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/sleep`, headers: TENANT_HEADERS });
    expect((sleep.json() as { status: string; replicas: number }).replicas).toBe(0);
    const suspend = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/suspend`, headers: TENANT_HEADERS });
    expect((suspend.json() as { status: string }).status).toBe("sleeping");
    const wake = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/wake`, headers: TENANT_HEADERS });
    expect((wake.json() as { status: string; replicas: number }).replicas).toBe(1);
    expect((wake.json() as { deployment_id: string }).deployment_id).toBe(String(deployment.id));

    const domain = await harness.app.inject({
      method: "POST",
      url: `/api/v1/apps/${app.id}/domains`,
      headers: TENANT_HEADERS,
      payload: { hostname: `custom-${crypto.randomUUID().slice(0, 6)}.example.com` },
    });
    expect(domain.statusCode).toBe(201);
    const created = domain.json() as { id: string; status: string };
    expect(created.status).toBe("pending_verification");
    const first = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/domains/${created.id}/verify`, headers: TENANT_HEADERS });
    expect((first.json() as { status: string }).status).toBe("issuing");
    const second = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/domains/${created.id}/verify`, headers: TENANT_HEADERS });
    expect((second.json() as { status: string }).status).toBe("active");
  });

  test("APP-06 构建重试 + 日志 + 跨租户 404", async () => {
    const app = await createApp(harness.app);
    const build = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/builds`, headers: TENANT_HEADERS, payload: {} });
    const buildId = (build.json() as { id: string }).id;
    const retry = await harness.app.inject({ method: "POST", url: `/api/v1/apps/${app.id}/builds/${buildId}/retry`, headers: TENANT_HEADERS });
    expect(retry.statusCode).toBe(202);
    const logs = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${app.id}/logs?limit=3`, headers: TENANT_HEADERS });
    expect((logs.json() as { items: unknown[] }).items).toHaveLength(3);
    const other = await harness.app.inject({ method: "GET", url: `/api/v1/apps/${app.id}`, headers: otherOrgHeaders });
    expect(other.statusCode).toBe(404);
  });
});
