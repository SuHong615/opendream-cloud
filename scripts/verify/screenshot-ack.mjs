// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.WS_URL ?? "http://127.0.0.1:14097";
const PASSWORD = process.env.WS_PASSWORD ?? "Demo-Pass-9f3c";
const OUT = process.env.OUT ?? "docs/05-delivery/evidence/ack/workspace-ui.png";

mkdirSync("docs/05-delivery/evidence/ack", { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  httpCredentials: { username: "opencode", password: PASSWORD },
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });

// 若停在 pairing 页面，切到密码登录
const usePassword = page.getByText(/use password/i).first();
if (await usePassword.count()) {
  await usePassword.click();
  await page.waitForTimeout(800);
  const pw = page.locator('input[type="password"]').first();
  if (await pw.count()) {
    await pw.fill(PASSWORD);
    await page.getByRole("button").filter({ hasText: /connect|连接|登录/i }).first().click();
    await page.waitForTimeout(3000);
  }
}

await page.screenshot({ path: OUT, fullPage: true });
console.log(JSON.stringify({ url: page.url(), title: await page.title(), out: OUT }));
await browser.close();
