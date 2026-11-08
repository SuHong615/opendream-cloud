// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const CONSOLE = process.env.CONSOLE_URL ?? "http://localhost:3000";
const WORKSPACE = process.env.WORKSPACE_URL ?? "http://localhost:4096";
const PASSWORD = process.env.WS_PASSWORD ?? "Local-Demo-Pass-123";
const OUT_DIR = process.env.OUT_DIR ?? "docs/05-delivery/evidence/local";

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });

// 1) 控制台
const consoleContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const consolePage = await consoleContext.newPage();
await consolePage.goto(`${CONSOLE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
await consolePage.getByTestId("login-email").fill(`local-${Date.now()}@example.com`);
await consolePage.getByTestId("login-submit").click();
await consolePage.waitForURL("**/workspaces", { timeout: 30_000 });
await consolePage.getByTestId("workspaces-page").waitFor({ timeout: 30_000 });
await consolePage.screenshot({ path: `${OUT_DIR}/console-workspaces.png`, fullPage: true });
console.log("console:", consolePage.url());

// 2) 工作区（opencode Web UI，Basic + password 登录）
const wsContext = await browser.newContext({
  httpCredentials: { username: "opencode", password: PASSWORD },
  viewport: { width: 1440, height: 900 },
});
const wsPage = await wsContext.newPage();
await wsPage.goto(WORKSPACE, { waitUntil: "networkidle", timeout: 60_000 });
const usePassword = wsPage.getByText(/use password/i).first();
if (await usePassword.count()) {
  await usePassword.click();
  await wsPage.waitForTimeout(800);
  const pw = wsPage.locator('input[type="password"]').first();
  if (await pw.count()) {
    await pw.fill(PASSWORD);
    await wsPage.getByRole("button").filter({ hasText: /connect|连接|登录/i }).first().click();
    await wsPage.waitForTimeout(3000);
  }
}
await wsPage.screenshot({ path: `${OUT_DIR}/workspace-ui.png`, fullPage: true });
console.log("workspace:", wsPage.url(), await wsPage.title());

await browser.close();
