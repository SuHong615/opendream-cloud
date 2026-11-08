// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";

const BASE = process.env.CONSOLE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const issues = [];
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) issues.push(`console ${m.text()}`); });
page.on("response", (r) => {
  if (r.status() >= 400 && r.url().includes("/api/")) issues.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
});

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.getByTestId("login-email").fill("lilei@xingyun.example");
await page.getByTestId("login-submit").click();
await page.waitForURL("**/workspaces", { timeout: 30_000 });

const routes = [
  ["/models", "models-page"], ["/skills", "skills-page"], ["/apps", "apps-page"],
  ["/mcp", "mcp-page"], ["/workflows", "workflows-page"], ["/employees", "employees-page"],
  ["/squads", "squads-page"], ["/eval", "eval-page"], ["/experiments", "experiments-page"],
  ["/memory", "memory-page"], ["/observability", "observability-page"], ["/org", "org-page"],
  ["/audit", "audit-page"], ["/usage", "usage-page"], ["/workspaces", "workspaces-page"],
];
for (const [path, testid] of routes) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  const visible = await page.getByTestId(testid).count().catch(() => 0);
  const body = await page.locator("body").innerText().catch(() => "");
  console.log(`${path} status=${res?.status()} testid=${visible} textLen=${body.length}`);
  if (!visible) issues.push(`missing testid ${testid} on ${path}`);
}

// MCP detail back
await page.goto(`${BASE}/mcp`, { waitUntil: "domcontentloaded" });
await page.getByTestId("mcp-page").waitFor();
const serverCount = await page.getByTestId("mcp-server").count();
console.log("mcp servers:", serverCount);
if (serverCount > 0) {
  await page.getByTestId("mcp-server").first().click();
  await page.getByTestId("mcp-detail").waitFor();
  const backVisible = await page.getByTestId("mcp-back").isVisible().catch(() => false);
  console.log("mcp back visible:", backVisible);
  if (backVisible) await page.getByTestId("mcp-back").click();
  await page.waitForTimeout(400);
  const backToList = await page.getByTestId("mcp-server").first().isVisible().catch(() => false);
  console.log("mcp back to list:", backToList);
  if (!backVisible || !backToList) issues.push("MCP back navigation failed");
}

// Model create + edit
await page.goto(`${BASE}/models`, { waitUntil: "domcontentloaded" });
await page.getByTestId("models-page").waitFor();
await page.getByTestId("provider-add").click();
await page.getByTestId("provider-form").waitFor();
await page.getByTestId("provider-name").fill(`Audit-${Date.now()}`);
await page.getByTestId("provider-base-url").fill("https://api.openai.com/v1");
await page.getByTestId("provider-models").fill("gpt-4o-mini");
await page.getByTestId("provider-api-key").fill("sk-audit-123456");
await page.getByTestId("provider-save").click();
await page.waitForTimeout(1200);
const formError = await page.getByTestId("provider-form-error").textContent().catch(() => null);
const toast = await page.getByTestId("toast").first().textContent().catch(() => null);
console.log("model create formError:", formError, "toast:", toast);
if (formError) issues.push(`model create error: ${formError}`);

// Workspace destroy dialog select
const wsLink = page.getByTestId("workspace-detail-link").first();
await page.goto(`${BASE}/workspaces`, { waitUntil: "domcontentloaded" });
if (await page.getByTestId("workspace-detail-link").count()) {
  await page.getByTestId("workspace-detail-link").first().click();
  await page.waitForURL("**/workspaces/**", { timeout: 15_000 });
  await page.getByTestId("destroy-open").click();
  await page.getByTestId("destroy-dialog").waitFor();
  const selectVisible = await page.getByTestId("destroy-workspace-select").isVisible().catch(() => false);
  const inputGone = (await page.getByTestId("destroy-confirm-input").count()) === 0;
  console.log("destroy select visible:", selectVisible, "old input gone:", inputGone);
  if (!selectVisible || !inputGone) issues.push("workspace destroy select not applied");
  await page.getByTestId("destroy-cancel-button").click();
} else {
  console.log("no workspace for destroy check");
}

console.log("ISSUES:", JSON.stringify(issues, null, 2));
await browser.close();
