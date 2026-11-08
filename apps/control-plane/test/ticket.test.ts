// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { devLogin, ensureReady, headers, setupHarness, type AuthSession, type TestHarness } from "./helpers/app";
import { verifyAndConsumeWorkspaceTicket } from "../src/services/tickets";
import { signTicket } from "../src/lib/crypto";

let harness: TestHarness;
let app: FastifyInstance;

beforeAll(async () => {
  harness = await setupHarness({ MOCK_PROVISION_MS: "20" });
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

const email = (name: string) => `${name}-${crypto.randomUUID().slice(0, 8)}@example.com`;

async function readyWorkspace(session: AuthSession): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/api/v1/workspaces/me/ensure", headers: headers(session) });
  const body = response.json() as { id: string };
  await ensureReady(app, session, body.id);
  return body.id;
}

async function issue(session: AuthSession, workspaceId: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/workspaces/${workspaceId}/access-ticket`,
    headers: headers(session),
  });
}

describe("access ticket", () => {
  test("TICKET-01 签发并通过验签（aud=workspace:<id>）", async () => {
    const session = await devLogin(app, email("t1"));
    const workspaceId = await readyWorkspace(session);
    const response = await issue(session, workspaceId);
    expect(response.statusCode).toBe(200);
    const body = response.json() as { workspace_id: string; ticket: string; expires_in: number; url: string; mode: string };
    expect(body.workspace_id).toBe(workspaceId);
    expect(body.expires_in).toBe(60);
    expect(body.url).toContain("__ticket=");
    expect(body.mode).toBe("redirect");
    const claims = verifyAndConsumeWorkspaceTicket(harness.env, body.ticket, workspaceId);
    expect(claims.aud).toBe(`workspace:${workspaceId}`);
    expect(claims.sub).toBe(session.userId);
    expect(claims.tenant).toBe(session.orgId);
  });

  test("TICKET-02 同一 ticket 重放被拒绝（ticket_reused）", async () => {
    const session = await devLogin(app, email("t2"));
    const workspaceId = await readyWorkspace(session);
    const body = (await issue(session, workspaceId)).json() as { ticket: string };
    verifyAndConsumeWorkspaceTicket(harness.env, body.ticket, workspaceId);
    expect(() => verifyAndConsumeWorkspaceTicket(harness.env, body.ticket, workspaceId)).toThrow(/already used/);
  });

  test("TICKET-03 过期 ticket 被拒绝", async () => {
    const expired = signTicket(
      harness.env.TICKET_SECRET,
      { iss: harness.env.PUBLIC_BASE_URL, aud: "workspace:any", sub: "u", tenant: "t", ws: "any" },
      -1,
    );
    expect(() => verifyAndConsumeWorkspaceTicket(harness.env, expired.token)).toThrow();
  });

  test("TICKET-04 跨工作区 audience 不匹配被拒绝", async () => {
    const session = await devLogin(app, email("t4"));
    const workspaceId = await readyWorkspace(session);
    const body = (await issue(session, workspaceId)).json() as { ticket: string };
    expect(() => verifyAndConsumeWorkspaceTicket(harness.env, body.ticket, crypto.randomUUID())).toThrow(/audience/);
  });

  test("TICKET-05 工作区未 ready 时签发返回 409 workspace_not_ready", async () => {
    const session = await devLogin(app, email("t5"));
    const created = await app.inject({ method: "POST", url: "/api/v1/workspaces/me/ensure", headers: headers(session) });
    const workspaceId = (created.json() as { id: string }).id;
    const response = await issue(session, workspaceId);
    expect(response.statusCode).toBe(409);
    const body = response.json() as { error: { reason: string } };
    expect(body.error.reason).toBe("workspace_not_ready");
  });
});
