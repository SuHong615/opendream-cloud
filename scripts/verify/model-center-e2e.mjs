// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 模型中心端到端验证（本地 Docker）：
 * 登录 → 预设 → 添加企业 provider → 测试连通 → 激活 → 密钥不回显 → 配置预览 → 工作区生效。
 *
 * 用法: bun run scripts/verify/model-center-e2e.mjs [http://localhost:4000]
 */
const BASE = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:4000";
const WORKSPACE = process.env.WORKSPACE_URL ?? "http://localhost:4096";
const WS_PASSWORD = process.env.WS_PASSWORD ?? "Local-Demo-Pass-123";
const MOCK_BASE = process.env.MOCK_MODEL_BASE ?? "http://mock-model:9100/v1";
const MOCK_KEY = process.env.MOCK_MODEL_KEY ?? "sk-mock-key";

const cookies = new Map();
let csrf = "";
let failures = 0;

function ok(name, detail = "") {
  console.log(`  ok  ${name}${detail ? ` (${detail})` : ""}`);
}
function fail(name, detail = "") {
  failures += 1;
  console.error(`FAIL  ${name}${detail ? ` (${detail})` : ""}`);
}
function assert(cond, name, detail = "") {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookies.size ? { cookie: cookieHeader() } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(init.headers ?? {}),
    },
  });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function wsFetch(path) {
  const res = await fetch(`${WORKSPACE}${path}`, {
    headers: { authorization: `Basic ${Buffer.from(`opencode:${WS_PASSWORD}`).toString("base64")}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const email = `model-e2e-${Date.now()}@example.com`;
const login = await call("/api/v1/auth/dev-login", { method: "POST", body: JSON.stringify({ email }) });
if (!login.body?.csrf_token) {
  console.error("login failed", login.status, login.body);
  process.exit(1);
}
csrf = login.body.csrf_token;
ok("dev-login", `${login.status}`);

const presets = await call("/api/v1/model-provider-presets");
assert(presets.status === 200 && Array.isArray(presets.body?.items) && presets.body.items.length >= 5, "presets", `${presets.body?.items?.length ?? 0} 项`);

const name = `E2E 企业模型 ${Date.now().toString(36)}`;
const created = await call("/api/v1/model-providers", {
  method: "POST",
  body: JSON.stringify({
    name,
    kind: "openai_compatible",
    base_url: MOCK_BASE,
    api_key: MOCK_KEY,
    models: ["gpt-4o-mini", "qwen2.5-coder-32b"],
    default_model: "gpt-4o-mini",
    preset_id: "openai",
    enabled: true,
  }),
});
assert(created.status === 201 || created.status === 200, "create provider", `${created.status}`);
const provider = created.body;
if (!provider?.id) {
  console.error("provider payload", provider);
  process.exit(1);
}
assert(!JSON.stringify(provider).includes(MOCK_KEY), "create 响应不回显明文 key");
assert(typeof provider.api_key_masked === "string" && provider.api_key_masked.includes("****"), "api_key_masked", provider.api_key_masked);

const tested = await call(`/api/v1/model-providers/${provider.id}/test`, { method: "POST", body: "{}" });
assert(tested.status === 200 && tested.body?.ok === true, "test 连通", JSON.stringify(tested.body));
assert(Array.isArray(tested.body?.models) && tested.body.models.some((m) => (m.id ?? m) === "gpt-4o-mini"), "test 拉到模型", `${tested.body?.models?.length ?? 0} 个`);

const activated = await call(`/api/v1/model-providers/${provider.id}/activate`, { method: "POST", body: "{}" });
assert(activated.status === 200 && activated.body?.is_active === true, "activate", `${activated.status}`);

const list = await call("/api/v1/model-providers");
const items = list.body?.items ?? [];
const activeItems = items.filter((item) => item.is_active);
assert(activeItems.length === 1 && activeItems[0].id === provider.id, "active 唯一", `${activeItems.length}`);
assert(!JSON.stringify(items).includes(MOCK_KEY), "列表不回显明文 key");

const preview = await call("/api/v1/model-config/preview");
const cfg = preview.body?.config ?? preview.body ?? {};
const providers = cfg.providers ?? {};
const key = Object.keys(providers).find((k) => providers[k]?.settings?.baseURL === MOCK_BASE);
assert(Boolean(key), "config preview 含企业 provider", key ?? "");
if (key) {
  const masked = String(providers[key].settings.apiKey);
  assert(masked.includes("****") && !masked.includes(MOCK_KEY), "preview 中 apiKey 已脱敏", masked);
  assert(providers[key].package === "@opencode/ai/providers/openai-compatible", "config package", providers[key].package);
  assert(String(cfg.model ?? "").startsWith(`${key}/`), "config 默认模型", cfg.model ?? "");
}
assert(cfg.disabled_providers?.includes("opencode"), "config 禁用内置 opencode provider", JSON.stringify(cfg.disabled_providers ?? []));

// 工作区热加载/重启后应出现企业模型
let modelIds = [];
for (let i = 0; i < 30; i++) {
  const models = await wsFetch("/api/model");
  modelIds = (models.body?.data ?? []).map((m) => m.id);
  if (modelIds.includes("gpt-4o-mini")) break;
  await Bun.sleep(1000);
}
assert(modelIds.includes("gpt-4o-mini") && modelIds.includes("qwen2.5-coder-32b"), "工作区加载企业模型", modelIds.join(","));
assert(!modelIds.includes("big-pickle"), "内置 opencode 模型已禁用", modelIds.join(","));

if (failures) {
  console.error(`\nMODEL CENTER E2E: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\nMODEL CENTER E2E PASS");
