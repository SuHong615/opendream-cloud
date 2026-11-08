// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";

const BASE = process.env.CONSOLE_URL ?? "http://localhost:3000";
const CP = "http://localhost:4000";
// seed MCP server for demo org
const login = await fetch(`${CP}/api/v1/auth/dev-login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "lilei@xingyun.example" }),
});
const session = await login.json();
const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const csrf = session.csrf_token;
const seed = await fetch(`${CP}/api/v1/mcp-servers`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf },
  body: JSON.stringify({ slug: `audit-mcp-${Date.now().toString(36)}`, name: "Audit MCP", transport: "streamable_http", endpoint: "http://mock-mcp:9000/mcp", auth_type: "none", tools: [{ name: "echo", destructive: false }], default_tools: ["echo"] }),
});
console.log("seed mcp:", seed.status);

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("RSC payload")) console.log("console:", m.text().slice(0, 160)); });
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.getByTestId("login-email").fill("lilei@xingyun.example");
await page.getByTestId("login-submit").click();
await page.waitForURL("**/workspaces", { timeout: 30_000 });

// MCP: list -> detail -> back
await page.goto(`${BASE}/mcp`, { waitUntil: "domcontentloaded" });
await page.getByTestId("mcp-page").waitFor();
await page.waitForTimeout(1200);
const servers = await page.getByTestId("mcp-server").count();
console.log("mcp servers:", servers, "detail initially:", await page.getByTestId("mcp-detail").count());
if (servers > 0) {
  await page.getByTestId("mcp-server").first().click();
  await page.getByTestId("mcp-detail").waitFor({ timeout: 5000 });
  console.log("back visible:", await page.getByTestId("mcp-back").isVisible());
  await page.getByTestId("mcp-back").dispatchEvent("click");
  await page.waitForTimeout(500);
  console.log("list after back:", await page.getByTestId("mcp-server").first().isVisible());
}

// Model create + edit
await page.goto(`${BASE}/models`, { waitUntil: "domcontentloaded" });
await page.getByTestId("models-page").waitFor();
await page.waitForTimeout(800);
await page.getByTestId("provider-add").click();
await page.getByTestId("provider-form").waitFor();
await page.getByTestId("provider-name").fill(`Audit-${Date.now()}`);
await page.getByTestId("provider-base-url").fill("https://api.openai.com/v1");
await page.getByTestId("provider-models").fill("gpt-4o-mini");
await page.getByTestId("provider-api-key").fill("sk-audit-123456");
await page.getByTestId("provider-save").click();
await page.waitForTimeout(1800);
console.log("form error:", await page.getByTestId("provider-form-error").textContent().catch(() => null));
console.log("form still open:", await page.getByTestId("provider-form").count());
console.log("toast:", await page.getByTestId("toast").first().textContent().catch(() => null));

// Workspace destroy select
await page.goto(`${BASE}/workspaces`, { waitUntil: "domcontentloaded" });
await page.getByTestId("workspaces-page").waitFor();
await page.waitForTimeout(1500);
const cards = await page.getByTestId("workspace-detail-link").count();
console.log("workspace links:", cards);
if (cards > 0) {
  await page.getByTestId("workspace-detail-link").first().click();
  await page.waitForURL("**/workspaces/**", { timeout: 15_000 });
  await page.getByTestId("destroy-open").click();
  await page.getByTestId("destroy-dialog").waitFor();
  console.log("destroy select:", await page.getByTestId("destroy-workspace-select").count(), "old input:", await page.getByTestId("destroy-confirm-input").count());
  await page.getByTestId("destroy-cancel-button").click();
}
await browser.close();
