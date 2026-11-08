// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 本地企业模型占位服务（OpenAI 兼容），用于验证模型中心 → opencode 配置 → 工作区调用链路。
 * 仅本地演示：固定 API Key、固定模型列表、回显式补全。
 */
const PORT = Number(process.env.PORT ?? 9100);
const API_KEY = process.env.MOCK_MODEL_API_KEY ?? "sk-mock-key";

const MODELS = [
  { id: "gpt-4o-mini", name: "GPT-4o mini (mock)", context: 128000, output: 8192 },
  { id: "qwen2.5-coder-32b", name: "Qwen2.5 Coder 32B (mock)", context: 131072, output: 8192 },
  { id: "deepseek-v3", name: "DeepSeek V3 (mock)", context: 65536, output: 8192 },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  return token === API_KEY;
}

function completionText(body: any): string {
  const last = Array.isArray(body?.messages) ? body.messages.at(-1) : undefined;
  const content = typeof last?.content === "string" ? last.content : "ping";
  return `[mock:${body?.model ?? "unknown"}] 收到：${content.slice(0, 200)}`;
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return json({ status: "ok", service: "mock-model", models: MODELS.length });
    }
    if (url.pathname === "/v1/models") {
      if (!authorized(request)) return json({ error: { code: "invalid_api_key", message: "invalid API key" } }, 401);
      return json({
        object: "list",
        data: MODELS.map((model) => ({
          id: model.id,
          object: "model",
          owned_by: "enterprise",
          name: model.name,
          context_window: model.context,
          max_output_tokens: model.output,
        })),
      });
    }
    if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
      if (!authorized(request)) return json({ error: { code: "invalid_api_key", message: "invalid API key" } }, 401);
      const body: any = await request.json().catch(() => ({}));
      if (!body?.model || !Array.isArray(body?.messages)) {
        return json({ error: { code: "invalid_request", message: "model and messages are required" } }, 400);
      }
      const text = completionText(body);
      const id = `chatcmpl-mock-${crypto.randomUUID().slice(0, 8)}`;
      const created = Math.floor(Date.now() / 1000);
      const usage = { prompt_tokens: 12, completion_tokens: text.length, total_tokens: 12 + text.length };

      if (body.stream) {
        const encoder = new TextEncoder();
        const chunks: Uint8Array[] = [];
        const push = (data: unknown) => chunks.push(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        push({
          id,
          object: "chat.completion.chunk",
          created,
          model: body.model,
          choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }],
        });
        push({
          id,
          object: "chat.completion.chunk",
          created,
          model: body.model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage,
        });
        chunks.push(encoder.encode("data: [DONE]\n\n"));
        return new Response(chunks.length ? new Blob(chunks) : null, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        });
      }

      return json({
        id,
        object: "chat.completion",
        created,
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: text },
            finish_reason: "stop",
          },
        ],
        usage,
      });
    }
    return json({ error: { code: "not_found", message: `unknown route ${url.pathname}` } }, 404);
  },
});

console.log(`[mock-model] http://0.0.0.0:${PORT} models=${MODELS.map((m) => m.id).join(",")}`);
