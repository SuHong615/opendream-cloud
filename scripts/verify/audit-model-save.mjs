// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
const BASE = process.env.CONSOLE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
page.on("response", async (r) => {
  if (r.url().includes("/api/v1/model-providers") && r.request().method() === "POST") {
    errors.push(`POST ${r.status()} ${await r.text().catch(() => "")}`);
  }
});
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.getByTestId("login-email").fill("lilei@xingyun.example");
await page.getByTestId("login-submit").click();
await page.waitForURL("**/workspaces", { timeout: 30_000 });
await page.goto(`${BASE}/models`, { waitUntil: "domcontentloaded" });
await page.getByTestId("models-page").waitFor({ timeout: 30_000 });
await page.getByTestId("provider-add").click();
await page.getByTestId("provider-form").waitFor();
await page.getByTestId("provider-name").fill(`OpenAI-${Date.now()}`);
await page.getByTestId("provider-base-url").fill("https://api.openai.com/v1");
await page.getByTestId("provider-models").fill("gpt-4o-mini");
await page.getByTestId("provider-api-key").fill("sk-test-123456");
await page.getByTestId("provider-save").click();
await page.waitForTimeout(1500);
const formError = await page.getByTestId("provider-form-error").textContent().catch(() => null);
const toast = await page.getByTestId("toast").first().textContent().catch(() => null);
console.log("formError:", formError);
console.log("toast:", toast);
console.log("errors:", errors);
await page.screenshot({ path: "docs/05-delivery/evidence/audit-model-save.png", fullPage: true });
await browser.close();
