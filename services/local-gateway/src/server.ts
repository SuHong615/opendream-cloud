// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
const PORT = Number(process.env.PORT ?? 8080);
const WORKSPACE = process.env.WORKSPACE_URL ?? "http://workspace:4096";
const MCP_HUB = process.env.MCP_HUB_URL ?? "http://mcp-hub:4104";
const PASSWORD = process.env.WORKSPACE_PASSWORD ?? "";
const BASIC = "Basic " + Buffer.from(`opencode:${PASSWORD}`).toString("base64");

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 255,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json({ status: "ok", workspace: WORKSPACE, mcp_hub: MCP_HUB, service: "local-gateway" });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const isMcp = url.pathname === "/mcp" || url.pathname.startsWith("/mcp/");
    const target = new URL(isMcp ? MCP_HUB : WORKSPACE);
    target.pathname = isMcp ? url.pathname.replace(/^\/mcp/, "") || "/" : url.pathname;
    target.search = url.search;
    if (url.searchParams.has("__ticket")) target.searchParams.delete("__ticket");

    const headers = new Headers(request.headers);
    headers.delete("host");
    if (isMcp) {
      // MCP Gateway 自己校验 binding ticket；网关只做入口/转发
      headers.delete("cookie");
    } else {
      // opencode 工作区：网关注入 Basic，不把控制台会话 Cookie 带过去
      headers.set("authorization", BASIC);
      const cookie = headers.get("cookie");
      if (cookie) {
        const kept = cookie
          .split(";")
          .map((part) => part.trim())
          .filter((part) => !part.startsWith("__Host-oc_session=") && !part.startsWith("oc_csrf="));
        if (kept.length) headers.set("cookie", kept.join("; "));
        else headers.delete("cookie");
      }
    }

    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
      });
      const responseHeaders = new Headers(upstream.headers);
      // Bun fetch 已解压响应体；必须移除压缩/长度头，否则浏览器按 br/gzip 解码会挂起
      responseHeaders.delete("content-encoding");
      responseHeaders.delete("content-length");
      responseHeaders.delete("transfer-encoding");
      for (const [key, value] of Object.entries(corsHeaders())) responseHeaders.set(key, value);
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch (error) {
      return Response.json(
        { error: { code: "bad_gateway", message: `${isMcp ? "mcp-hub" : "workspace"} unreachable: ${String(error)}` } },
        { status: 502, headers: corsHeaders() },
      );
    }
  },
});

console.log(`[local-gateway] http://0.0.0.0:${PORT} -> workspace=${WORKSPACE} mcp=${MCP_HUB}`);
