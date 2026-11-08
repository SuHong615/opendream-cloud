// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const url = process.argv[2];
const password = process.env.WS_PASSWORD ?? "Local-Demo-Pass-123";
const out = process.env.OUT_DIR ?? "docs/05-delivery/evidence/local";
if (!url) throw new Error("usage: bun check-local-url-browser.mjs <workspace-url>");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-proxy-server", "--disable-remote-fonts"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// 阻止外部字体加载（本地无外网时 document.fonts.ready 会挂起截图）
await context.route("**/*", (route) => {
  if (route.request().resourceType() === "font") return route.abort();
  return route.continue();
});
const page = await context.newPage();
const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/gateway-access.png`, fullPage: true, timeout: 15_000 });
console.log("goto", response?.status(), page.url());

const usePassword = page.getByText(/use password/i).first();
if (await usePassword.count()) {
  await usePassword.click();
  await page.waitForTimeout(800);
  const input = page.locator('input[type="password"]').first();
  if (await input.count()) {
    await input.fill(password);
    await page.getByRole("button").filter({ hasText: /connect|连接|登录/i }).first().click();
    await page.waitForTimeout(3000);
  }
}
await page.screenshot({ path: `${out}/gateway-app.png`, fullPage: true, timeout: 15_000 });
console.log("final", page.url(), await page.title());
await browser.close();
