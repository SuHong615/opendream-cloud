// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.CONSOLE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "docs/05-delivery/evidence/app-center";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.route("**/*", (route) => (route.request().resourceType() === "font" ? route.abort() : route.continue()));
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.getByTestId("login-email").fill("app-demo@example.com");
await page.getByTestId("login-submit").click();
await page.waitForURL("**/workspaces", { timeout: 30_000 });

// 用同源 fetch 创建演示应用（浏览器会话 + CSRF cookie）
const created = await page.evaluate(async () => {
  const csrf = document.cookie.match(/(?:^|; )oc_csrf=([^;]+)/)?.[1] ?? "";
  const res = await fetch("/api/v1/apps", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": decodeURIComponent(csrf) },
    body: JSON.stringify({ slug: `demo-${Date.now().toString(36)}`, name: "企业知识助手", description: "演示应用：权限、分享与协同修改", template: "static", entry: "index.html" }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
});
console.log("create", created.status, created.body?.id);
const appId = created.body?.id;

await page.goto(`${BASE}/apps`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.getByTestId("apps-page").waitFor({ timeout: 30_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-apps.png`, fullPage: true });

if (appId) {
  await page.goto(`${BASE}/apps/${appId}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByTestId("app-detail").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/02-app-detail.png`, fullPage: true });
  const collab = page.getByTestId("app-collab-open").first();
  if (await collab.count()) {
    await collab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/03-collab.png`, fullPage: true });
  }
}

console.log("screenshots", OUT);
await browser.close();
