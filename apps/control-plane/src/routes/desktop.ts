// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Readable } from "node:stream";
import { z } from "zod";
import type { AppContext } from "../context";
import { ApiError } from "../lib/errors";
import { randomId, sha256Hex } from "../lib/crypto";
import { decryptSecret, secretKeyFor } from "../lib/secret-box";
import { auditFromRequest } from "../services/audit";
import { enqueueOutbox } from "../services/outbox";
import { generateOpencodeConfig } from "../services/opencode-config";
import { currentRequestId, parseInput, requireCsrf, requireSession } from "./shared";

interface DeviceRow {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  platform: string;
  token_hash: string;
  last_seen_at: number | null;
  revoked_at: number | null;
  created_at: number;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function pairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `OD-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

function bearer(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new ApiError({ code: "unauthorized", status: 401, message: "device token required" });
  return header.slice("Bearer ".length).trim();
}

async function requireDevice(ctx: AppContext, request: FastifyRequest): Promise<DeviceRow> {
  const token = bearer(request);
  const device = await ctx.dbPort.get<DeviceRow>("SELECT * FROM desktop_devices WHERE token_hash = ? AND revoked_at IS NULL", [sha256Hex(token)]);
  if (!device) throw new ApiError({ code: "unauthorized", status: 401, message: "invalid or revoked device token" });
  await ctx.dbPort.run("UPDATE desktop_devices SET last_seen_at = ? WHERE id = ?", [Date.now(), device.id]);
  return device;
}

/** 本地 MCP 自动安装目录：首次启动时 opencode 通过 npx 拉取并运行。 */
function builtinMcp(workspaceDir: string) {
  return {
    filesystem: {
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", workspaceDir],
      enabled: true,
    },
    memory: {
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-memory"],
      enabled: true,
    },
    "sequential-thinking": {
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"],
      enabled: true,
    },
  };
}

async function remoteMcp(ctx: AppContext, request: FastifyRequest, orgId: string, userId: string, role: string): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`${ctx.env.MCP_HUB_URL.replace(/\/+$/u, "")}/api/v1/mcp-servers`, {
      headers: {
        "x-oc-org-id": orgId,
        "x-oc-org-slug": ctx.sqlite.query<{ slug: string }, [string]>("SELECT slug FROM orgs WHERE id = ?").get(orgId)?.slug ?? orgId,
        "x-oc-user-id": userId,
        "x-oc-roles": role,
        "x-request-id": currentRequestId(request),
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return {};
    const body = (await response.json()) as { items?: Array<{ slug?: string; name?: string; status?: string; transport?: string; endpoint?: string | null }> };
    const servers = body.items ?? [];
    const output: Record<string, unknown> = {};
    for (const server of servers) {
      if (!server.slug || !server.endpoint) continue;
      if (server.status && !["published", "approved", "review", "draft", "deprecated"].includes(server.status)) continue;
      output[server.slug] = {
        type: "remote",
        url: server.endpoint,
        enabled: true,
      };
    }
    return output;
  } catch {
    return {};
  }
}

export function registerDesktopRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/v1/desktop/pairings", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const body = parseInput(z.object({ name: z.string().min(1).max(80).optional() }), request.body ?? {});
    let code = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = pairingCode();
      const exists = await ctx.dbPort.get("SELECT 1 FROM desktop_pairings WHERE code_hash = ?", [sha256Hex(code)]);
      if (!exists) break;
    }
    const expiresAt = Date.now() + 10 * 60_000;
    await ctx.dbPort.run("INSERT INTO desktop_pairings (id, org_id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)", [randomId(), principal.orgId, principal.userId, sha256Hex(code), expiresAt, Date.now()]);
    auditFromRequest(ctx.sqlite, { request, principal, action: "desktop.pairing.create", resourceType: "desktop_pairing", resourceId: code.slice(0, 5), outcome: "success" });
    return reply.code(201).send({ code, name: body.name ?? null, expires_at: new Date(expiresAt).toISOString(), cloud_url: ctx.env.CONSOLE_BASE_URL, api_url: ctx.env.PUBLIC_API_URL });
  });

  app.post("/api/v1/desktop/pairings/claim", async (request, reply) => {
    const body = parseInput(z.object({ code: z.string().min(6).max(32), name: z.string().min(1).max(80), platform: z.string().max(40).default("") }), request.body ?? {});
    const pairing = await ctx.dbPort.get<{ id: string; org_id: string; user_id: string; expires_at: number; used_at: number | null }>(
      "SELECT id, org_id, user_id, expires_at, used_at FROM desktop_pairings WHERE code_hash = ?",
      [sha256Hex(body.code.trim().toUpperCase())],
    );
    if (!pairing || pairing.used_at || pairing.expires_at < Date.now()) {
      throw new ApiError({ code: "validation_failed", status: 400, message: "pairing code is invalid or expired" });
    }
    const token = `odc_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
    const deviceId = randomId();
    await ctx.dbPort.run("UPDATE desktop_pairings SET used_at = ? WHERE id = ?", [Date.now(), pairing.id]);
    await ctx.dbPort.run("INSERT INTO desktop_devices (id, org_id, user_id, name, platform, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [deviceId, pairing.org_id, pairing.user_id, body.name, body.platform ?? "", sha256Hex(token), Date.now()]);
    enqueueOutbox(ctx, "desktop.device.paired", { device_id: deviceId, platform: body.platform ?? "" }, pairing.org_id);
    return reply.code(201).send({
      device_id: deviceId,
      token,
      org_id: pairing.org_id,
      user_id: pairing.user_id,
      api_url: ctx.env.PUBLIC_API_URL,
      console_url: ctx.env.CONSOLE_BASE_URL,
    });
  });

  app.get("/api/v1/desktop/devices", async (request) => {
    const principal = requireSession(ctx, request);
    const rows = await ctx.dbPort.all<Omit<DeviceRow, "token_hash">>(
      "SELECT id, org_id, user_id, name, platform, last_seen_at, revoked_at, created_at FROM desktop_devices WHERE org_id = ? AND user_id = ? ORDER BY created_at DESC",
      [principal.orgId, principal.userId],
    );
    return { items: rows.map((row) => ({ ...row, last_seen_at: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null, revoked_at: row.revoked_at ? new Date(row.revoked_at).toISOString() : null, created_at: new Date(row.created_at).toISOString() })) };
  });

  app.delete("/api/v1/desktop/devices/:deviceId", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const { deviceId } = z.object({ deviceId: z.string() }).parse(request.params);
    await ctx.dbPort.run("UPDATE desktop_devices SET revoked_at = ? WHERE id = ? AND org_id = ?", [Date.now(), deviceId, principal.orgId]);
    auditFromRequest(ctx.sqlite, { request, principal, action: "desktop.device.revoke", resourceType: "desktop_device", resourceId: deviceId, outcome: "success" });
    return reply.code(204).send();
  });

  app.get("/api/v1/desktop/bootstrap", async (request) => {
    const device = await requireDevice(ctx, request);
    const query = z.object({ workspace_dir: z.string().max(512).optional(), include_remote_mcp: z.coerce.boolean().default(true) }).parse(request.query ?? {});
    const workspaceDir = query.workspace_dir ?? process.cwd();
    const deviceToken = bearer(request);
    const opencode = generateOpencodeConfig(ctx, device.org_id, { desktop: { apiUrl: ctx.env.PUBLIC_API_URL, token: deviceToken } });
    const mcp = { ...builtinMcp(workspaceDir), ...(query.include_remote_mcp ? await remoteMcp(ctx, request, device.org_id, device.user_id, "member") : {}) };
    const models = await ctx.dbPort.all<{ provider_id: string; provider_model_id: string; display_name: string; provider_name: string }>(
      `SELECT m.provider_id, m.provider_model_id, m.display_name, p.name AS provider_name
       FROM models m JOIN model_providers p ON p.id = m.provider_id
       WHERE m.enabled = 1 AND p.enabled = 1 AND (p.org_id IS NULL OR p.org_id = ?) ORDER BY p.is_active DESC, m.display_name`,
      [device.org_id],
    );
    return {
      device: { id: device.id, name: device.name, platform: device.platform },
      engine: { mode: "dual", cloud_url: ctx.env.CONSOLE_BASE_URL, api_url: ctx.env.PUBLIC_API_URL, local_runtime: "opencode" },
      opencode: { ...opencode, mcp },
      models,
      synced_at: new Date().toISOString(),
    };
  });

  /** 桌面端模型代理：设备 token 鉴权，注入 Provider 真实 Key，本机不落 Key。 */
  app.all("/api/v1/desktop/model-proxy/:providerId/*", async (request, reply) => {
    const device = await requireDevice(ctx, request);
    const { providerId } = z.object({ providerId: z.string() }).parse(request.params);
    const provider = await ctx.dbPort.get<{ id: string; base_url: string; api_key_cipher: string | null; enabled: number; org_id: string | null }>(
      "SELECT id, base_url, api_key_cipher, enabled, org_id FROM model_providers WHERE id = ? AND enabled = 1 AND (org_id IS NULL OR org_id = ?)",
      [providerId, device.org_id],
    );
    if (!provider) throw new ApiError({ code: "not_found", status: 404, message: "provider not found" });
    const apiKey = decryptSecret(secretKeyFor(ctx.env), provider.api_key_cipher);
    if (!apiKey) throw new ApiError({ code: "upstream_error", status: 502, message: "provider credential unavailable" });
    const subPath = String((request.params as Record<string, unknown>)["*"] ?? "");
    const url = new URL(request.url, "http://control-plane.local");
    const target = `${provider.base_url.replace(/\/+$/u, "")}/${subPath.replace(/^\/+/u, "")}${url.search}`;
    const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
    for (const name of ["content-type", "accept", "openai-beta", "openai-organization"]) {
      const value = request.headers[name];
      if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(",") : String(value);
    }
    const method = request.method.toUpperCase();
    const hasBody = !["GET", "HEAD"].includes(method) && request.body !== undefined;
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method,
        headers,
        body: hasBody ? JSON.stringify(request.body) : undefined,
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new ApiError({ code: "upstream_error", status: 502, message: "model upstream unavailable" });
    }
    reply.code(upstream.status);
    for (const name of ["content-type", "cache-control", "x-request-id"]) {
      const value = upstream.headers.get(name);
      if (value) reply.header(name, value);
    }
    const contentType = upstream.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") && upstream.body) {
      reply.hijack();
      reply.raw.writeHead(upstream.status, { "content-type": contentType, "cache-control": "no-cache", connection: "keep-alive" });
      Readable.fromWeb(upstream.body as never).pipe(reply.raw);
      return reply;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    return reply.send(buffer);
  });

  app.post("/api/v1/desktop/heartbeat", async (request) => {
    const device = await requireDevice(ctx, request);
    return { ok: true, device_id: device.id, server_time: new Date().toISOString() };
  });
}
