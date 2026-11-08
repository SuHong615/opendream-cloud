// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { devLogin, headers, setupHarness, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let app: FastifyInstance;
beforeAll(async () => {
  harness = await setupHarness();
  app = harness.app;
});
afterAll(async () => {
  await harness.close();
});

describe("DESKTOP / OpenDream Code", () => {
  test("配对 → 设备 token → bootstrap 模型/MCP → 设备管理", async () => {
    const session = await devLogin(app, `desktop-${Date.now()}@example.com`);
    const auth = { ...headers(session), cookie: session.cookie };
    const pairing = await app.inject({ method: "POST", url: "/api/v1/desktop/pairings", headers: auth, payload: { name: "E2E PC" } });
    expect(pairing.statusCode).toBe(201);
    const code = (pairing.json() as { code: string }).code;
    expect(code).toMatch(/^OD-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const claim = await app.inject({ method: "POST", url: "/api/v1/desktop/pairings/claim", payload: { code, name: "E2E PC", platform: "win32" } });
    expect(claim.statusCode).toBe(201);
    const token = (claim.json() as { token: string }).token;
    expect(token.startsWith("odc_")).toBe(true);

    const bootstrap = await app.inject({ method: "GET", url: "/api/v1/desktop/bootstrap?workspace_dir=C%3A%5Cwork", headers: { authorization: `Bearer ${token}` } });
    if (bootstrap.statusCode !== 200) throw new Error(`BOOTSTRAP ${bootstrap.statusCode} ${bootstrap.body}`);
    const body = bootstrap.json() as { opencode: { mcp: Record<string, { type: string; command?: string[] }> }; engine: { mode: string } };
    expect(body.engine.mode).toBe("dual");
    const filesystem = body.opencode.mcp.filesystem!;
    expect(filesystem.type).toBe("local");
    expect(filesystem.command?.join(" ")).toContain("server-filesystem");

    const devices = await app.inject({ method: "GET", url: "/api/v1/desktop/devices", headers: { cookie: session.cookie } });
    expect(devices.statusCode).toBe(200);
    const id = (devices.json() as { items: Array<{ id: string }> }).items[0]!.id;
    const revoke = await app.inject({ method: "DELETE", url: `/api/v1/desktop/devices/${id}`, headers: auth });
    expect(revoke.statusCode).toBe(204);
    const denied = await app.inject({ method: "GET", url: "/api/v1/desktop/bootstrap", headers: { authorization: `Bearer ${token}` } });
    expect(denied.statusCode).toBe(401);
  });
});
