// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { devLogin, headers, setupHarness, type AuthSession, type TestHarness } from "./helpers/app";
import { decryptSecret, secretKeyFor } from "../src/lib/secret-box";

let harness: TestHarness;
let app: FastifyInstance;
let mockServer: ReturnType<typeof Bun.serve>;
let mockBase: string;

beforeAll(async () => {
  mockServer = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/models")) {
        if (url.pathname.includes("/unauthorized")) {
          return Response.json({ error: { message: "bad key" } }, { status: 401 });
        }
        return Response.json({
          object: "list",
          data: [
            { id: "gpt-4o-mini", name: "GPT-4o mini", object: "model" },
            { id: "qwen2.5-coder-32b", name: "Qwen2.5 Coder 32B", object: "model" },
          ],
        });
      }
      return Response.json({ ok: true });
    },
  });
  mockBase = `http://127.0.0.1:${mockServer.port}/v1`;
  harness = await setupHarness({ MOCK_PROVISION_MS: "10" });
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
  mockServer.stop(true);
});

const email = (name: string) => `${name}-${crypto.randomUUID().slice(0, 8)}@example.com`;
const unique = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function autoModelConfigPath(): string {
  return harness.env.OPENCODE_CONFIG_OUT;
}

async function createProvider(session: AuthSession, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/v1/model-providers",
    headers: headers(session),
    payload: body,
  });
}

async function providerId(session: AuthSession, name: string): Promise<string> {
  const response = await app.inject({ method: "GET", url: "/api/v1/model-providers", headers: { cookie: session.cookie } });
  const items = (response.json() as { items: Array<{ id: string; name: string }> }).items;
  const provider = items.find((item) => item.name === name);
  if (!provider) throw new Error(`provider not found: ${name}`);
  return provider.id;
}

describe("模型中心（G4 model-center）", () => {
  test("MC-01 预设列表 ≥11 且字段完整", async () => {
    const session = await devLogin(app, email("mc1"));
    const response = await app.inject({ method: "GET", url: "/api/v1/model-provider-presets", headers: { cookie: session.cookie } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ id: string; name: string; kind: string; base_url: string; default_models: string[]; docs_url: string }> };
    expect(body.items.length).toBeGreaterThanOrEqual(11);
    for (const id of ["openai", "azure", "anthropic", "google", "deepseek", "qwen", "kimi", "glm", "ollama", "vllm", "openai-compatible"]) {
      expect(body.items.some((preset) => preset.id === id)).toBe(true);
    }
    expect(body.items.every((preset) => preset.base_url && Array.isArray(preset.default_models))).toBe(true);
  });

  test("MC-02 创建 provider：加密存储 + 掩码返回，绝不明文回显", async () => {
    const session = await devLogin(app, email("mc2"));
    const name = unique("企业模型");
    const plaintext = "sk-test-secret-1234";
    const response = await createProvider(session, {
      name,
      kind: "deepseek",
      base_url: "https://api.deepseek.com/v1",
      api_key: plaintext,
      preset_id: "deepseek",
      models: ["deepseek-chat", "deepseek-reasoner"],
      default_model: "deepseek-chat",
    });
    expect(response.statusCode).toBe(201);
    const created = response.json() as { id: string; api_key_masked: string; kind: string; default_model: string; has_credential: boolean };
    expect(created.api_key_masked).toBe("sk-****1234");
    expect(created.kind).toBe("deepseek");
    expect(created.default_model).toBe("deepseek-chat");
    expect(created.has_credential).toBe(true);
    expect(JSON.stringify(created)).not.toContain(plaintext);
    const row = harness.ctx.sqlite
      .query<{ api_key_cipher: string }, [string]>("SELECT api_key_cipher FROM model_providers WHERE id = ?")
      .get(created.id);
    expect(row?.api_key_cipher).toStartWith("v1.");
    expect(row?.api_key_cipher).not.toContain(plaintext);
    expect(decryptSecret(secretKeyFor(harness.env), row?.api_key_cipher)).toBe(plaintext);
    const list = await app.inject({ method: "GET", url: "/api/v1/model-providers", headers: { cookie: session.cookie } });
    expect(JSON.stringify(list.json())).not.toContain(plaintext);
  });

  test("MC-03 PATCH：改名称/地址/模型；空 api_key 不覆盖", async () => {
    const session = await devLogin(app, email("mc3"));
    const name = unique("patch-me");
    const created = await createProvider(session, {
      name,
      kind: "openai_compatible",
      base_url: "https://old.example.com/v1",
      api_key: "sk-patch-secret-9999",
      models: ["m1"],
      default_model: "m1",
    });
    const id = (created.json() as { id: string }).id;
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/model-providers/${id}`,
      headers: headers(session),
      payload: { name: `${name}-v2`, base_url: "https://new.example.com/v1", api_key: "", models: ["m1", "m2"], default_model: "m2" },
    });
    expect(patch.statusCode).toBe(200);
    const body = patch.json() as { name: string; base_url: string; api_key_masked: string; default_model: string; models_count: number };
    expect(body.name).toBe(`${name}-v2`);
    expect(body.base_url).toBe("https://new.example.com/v1");
    expect(body.api_key_masked).toBe("sk-****9999");
    expect(body.default_model).toBe("m2");
    expect(body.models_count).toBe(2);
  });

  test("MC-04 test 成功：拉取模型、health healthy、返回 latency/models", async () => {
    const session = await devLogin(app, email("mc4"));
    const name = unique("test-ok");
    const created = await createProvider(session, {
      name,
      kind: "openai_compatible",
      base_url: mockBase,
      api_key: "sk-mock-key",
      models: ["seed-model"],
    });
    const id = (created.json() as { id: string }).id;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/model-providers/${id}/test`,
      headers: headers(session),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; latency_ms: number; models: Array<{ id: string }>; request_id: string };
    expect(body.ok).toBe(true);
    expect(body.latency_ms).toBeGreaterThanOrEqual(0);
    expect(body.models.map((model) => model.id)).toContain("gpt-4o-mini");
    expect(body.request_id).toBeString();
    const provider = (await app.inject({ method: "GET", url: "/api/v1/model-providers", headers: { cookie: session.cookie } }))
      .json() as { items: Array<{ id: string; health: string; models_count: number }> };
    const row = provider.items.find((item) => item.id === id);
    expect(row?.health).toBe("healthy");
    expect(row?.models_count).toBeGreaterThanOrEqual(2);
  });

  test("MC-05 test 失败：HTTP 401 时返回 200 {ok:false,error_code} 且 health unhealthy", async () => {
    const session = await devLogin(app, email("mc5"));
    const name = unique("test-fail");
    const created = await createProvider(session, {
      name,
      kind: "openai_compatible",
      base_url: `${mockBase}/unauthorized`,
      api_key: "sk-bad-key",
      models: ["m1"],
    });
    const id = (created.json() as { id: string }).id;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/model-providers/${id}/test`,
      headers: headers(session),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; error_code: string; request_id: string };
    expect(body.ok).toBe(false);
    expect(body.error_code).toBe("http_401");
    const provider = (await app.inject({ method: "GET", url: "/api/v1/model-providers", headers: { cookie: session.cookie } }))
      .json() as { items: Array<{ id: string; health: string }> };
    expect(provider.items.find((item) => item.id === id)?.health).toBe("unhealthy");
  });

  test("MC-06 activate：同一 org 唯一 active，并更新默认策略", async () => {
    const session = await devLogin(app, email("mc6"));
    const a = await createProvider(session, {
      name: unique("active-a"),
      kind: "openai_compatible",
      base_url: mockBase,
      api_key: "sk-a",
      models: ["a-model"],
      default_model: "a-model",
    });
    const idA = (a.json() as { id: string }).id;
    const b = await createProvider(session, {
      name: unique("active-b"),
      kind: "openai_compatible",
      base_url: mockBase,
      api_key: "sk-b",
      models: ["b-model"],
      default_model: "b-model",
    });
    const idB = (b.json() as { id: string }).id;
    await app.inject({ method: "POST", url: `/api/v1/model-providers/${idA}/activate`, headers: headers(session) });
    const activated = await app.inject({ method: "POST", url: `/api/v1/model-providers/${idB}/activate`, headers: headers(session) });
    expect(activated.statusCode).toBe(200);
    const providers = (await app.inject({ method: "GET", url: "/api/v1/model-providers", headers: { cookie: session.cookie } }))
      .json() as { items: Array<{ id: string; org_id: string | null; is_active: boolean }> };
    // task-22：该 org 可见的 provider（global + org）中 is_active 恰好 1 个
    const active = providers.items.filter((item) => item.is_active);
    expect(active.map((item) => item.id)).toEqual([idB]);
    const policies = (await app.inject({ method: "GET", url: "/api/v1/model-policies", headers: { cookie: session.cookie } }))
      .json() as { items: Array<{ is_default: boolean; default_model_id: string | null }> };
    expect(policies.items.find((policy) => policy.is_default)?.default_model_id).toBeString();
  });

  test("MC-07 sync：只拉取模型列表并 upsert", async () => {
    const session = await devLogin(app, email("mc7"));
    const created = await createProvider(session, {
      name: unique("sync"),
      kind: "openai_compatible",
      base_url: mockBase,
      api_key: "sk-sync",
      models: [],
    });
    const id = (created.json() as { id: string }).id;
    const response = await app.inject({ method: "POST", url: `/api/v1/model-providers/${id}/sync`, headers: headers(session) });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; models: Array<{ id: string }> };
    expect(body.ok).toBe(true);
    expect(body.models.length).toBeGreaterThanOrEqual(2);
  });

  test("MC-08 config preview + 写文件：根级配置、preview 脱敏、写盘真实 key", async () => {
    const session = await devLogin(app, email("mc8"));
    const name = unique("config");
    await createProvider(session, {
      name,
      kind: "openai_compatible",
      base_url: mockBase,
      api_key: "sk-config-key",
      models: ["gpt-4o-mini", "qwen2.5-coder-32b"],
      default_model: "gpt-4o-mini",
      preset_id: "enterprise",
    });
    const preview = await app.inject({ method: "GET", url: "/api/v1/model-config/preview", headers: { cookie: session.cookie } });
    expect(preview.statusCode).toBe(200);
    const body = preview.json() as {
      $schema: string;
      model: string;
      disabled_providers: string[];
      providers: Record<string, { package: string; settings: { apiKey: string }; models: Record<string, { name: string }> }>;
    };
    expect(body.$schema).toBe("https://opencode.ai/config.json");
    expect(body.disabled_providers).toEqual(["opencode"]);
    expect(body.model).toMatch(/^[a-z0-9_-]+\/[^/]+$/);
    const keys = Object.keys(body.providers);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    const first = body.providers[keys[0]!]!;
    expect(first.package).toBe("@opencode/ai/providers/openai-compatible");
    // preview 不回显明文 key
    expect(preview.body).not.toContain("sk-config-key");
    expect(first.settings.apiKey).toContain("****");
    // 写盘文件是完整配置，含真实 key（供 workspace 下发）
    const written = JSON.parse(readFileSync(autoModelConfigPath(), "utf8")) as typeof body;
    expect(written.disabled_providers).toEqual(["opencode"]);
    const writtenKeys = Object.keys(written.providers);
    expect(writtenKeys.length).toBeGreaterThanOrEqual(1);
    expect(Object.values(written.providers).some((provider) => provider.settings.apiKey === "sk-config-key")).toBe(true);
  });

  test("MC-09 隔离：其他用户 PATCH/DELETE/test 返回 404", async () => {
    const alice = await devLogin(app, email("mc9a"));
    const bob = await devLogin(app, email("mc9b"));
    const created = await createProvider(alice, {
      name: unique("isolated"),
      kind: "openai_compatible",
      base_url: mockBase,
      api_key: "sk-iso",
      models: ["m"],
    });
    const id = (created.json() as { id: string }).id;
    for (const [method, path] of [
      ["PATCH", `/api/v1/model-providers/${id}`],
      ["DELETE", `/api/v1/model-providers/${id}`],
      ["POST", `/api/v1/model-providers/${id}/test`],
    ] as const) {
      const response = await app.inject({ method, url: path, headers: headers(bob), payload: method === "PATCH" ? { name: "x" } : undefined });
      expect(response.statusCode).toBe(404);
    }
  });

  test("MC-10 DELETE：204 并从列表消失", async () => {
    const session = await devLogin(app, email("mc10"));
    const name = unique("delete-me");
    const created = await createProvider(session, {
      name,
      kind: "openai_compatible",
      base_url: mockBase,
      api_key: "sk-del",
      models: ["m1"],
    });
    const id = (created.json() as { id: string }).id;
    const response = await app.inject({ method: "DELETE", url: `/api/v1/model-providers/${id}`, headers: headers(session) });
    expect(response.statusCode).toBe(204);
    const list = (await app.inject({ method: "GET", url: "/api/v1/model-providers", headers: { cookie: session.cookie } }))
      .json() as { items: Array<{ id: string }> };
    expect(list.items.some((item) => item.id === id)).toBe(false);
  });

  test("MC-11 seed 默认企业 Mock provider：mock-model + active + 默认模型", async () => {
    // 独立实例：避免前面的 activate 改动全局 active
    const isolated = await setupHarness();
    try {
      const session = await devLogin(isolated.app, email("mc11"));
      const list = (await isolated.app.inject({ method: "GET", url: "/api/v1/model-providers", headers: { cookie: session.cookie } }))
        .json() as { items: Array<{ id: string; name: string; base_url: string; is_active: boolean; default_model: string | null; api_key_masked: string | null }> };
      const mock = list.items.find((item) => item.base_url === "http://mock-model:9100/v1");
      expect(mock).toBeDefined();
      expect(mock?.is_active).toBe(true);
      expect(mock?.default_model).toBe("gpt-4o-mini");
      expect(mock?.api_key_masked).toBe("sk-****-key");
      const preview = (await isolated.app.inject({ method: "GET", url: "/api/v1/model-config/preview", headers: { cookie: session.cookie } }))
        .json() as {
        $schema: string;
        model: string;
        disabled_providers: string[];
        providers: Record<string, { name: string; package: string; settings: { baseURL: string; apiKey: string }; models: Record<string, { name: string }> }>;
      };
      expect(preview.model).toBe("enterprise/gpt-4o-mini");
      expect(preview.disabled_providers).toEqual(["opencode"]);
      expect(Object.keys(preview.providers)).toEqual(["enterprise"]);
      const provider = preview.providers["enterprise"]!;
      expect(provider.package).toBe("@opencode/ai/providers/openai-compatible");
      expect(provider.settings.baseURL).toBe("http://mock-model:9100/v1");
      // P0：preview 只回掩码；真实 key 只出现在写盘文件
      expect(provider.settings.apiKey).toBe("sk-****-key");
      expect(JSON.stringify(preview)).not.toContain("sk-mock-key");
      expect(Object.keys(provider.models)).toEqual(["gpt-4o-mini", "qwen2.5-coder-32b"]);
      expect(provider.models["gpt-4o-mini"]?.name).toBe("GPT-4o mini");
      const fs = await import("node:fs");
      const written = JSON.parse(fs.readFileSync(isolated.env.OPENCODE_CONFIG_OUT, "utf8")) as typeof preview;
      expect(written.providers["enterprise"]?.settings.apiKey).toBe("sk-mock-key");
    } finally {
      await isolated.close();
    }
  });
});
