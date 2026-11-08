// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.getByTestId("login-email").fill("lilei@xingyun.example");
await page.getByTestId("login-submit").click();
await page.waitForURL("**/workspaces", { timeout: 30_000 });
await page.waitForTimeout(1500);
const cards = await page.getByTestId("workspace-card").count();
console.log("cards", cards);
if (cards > 0) {
  await page.getByTestId("workspace-detail-link").first().click();
  await page.waitForURL("**/workspaces/**", { timeout: 15_000 });
  await page.getByTestId("destroy-open").click();
  console.log("select visible", await page.getByTestId("destroy-workspace-select").isVisible(), "old input", await page.getByTestId("destroy-confirm-input").count());
  await page.getByTestId("destroy-ack").check();
  await page.getByTestId("destroy-submit").click();
  await page.waitForTimeout(1500);
  console.log("notice", await page.getByTestId("detail-notice").textContent().catch(() => null));
  if (await page.getByTestId("destroy-cancel").count()) {
    await page.getByTestId("destroy-cancel").click();
    await page.waitForTimeout(1000);
    console.log("cancel toast", await page.getByTestId("toast").first().textContent().catch(() => null));
  }
}
await browser.close();
