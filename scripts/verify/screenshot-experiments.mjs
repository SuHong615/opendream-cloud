// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE = process.env.CONSOLE_URL ?? "http://localhost:3000";
const OUT = "docs/05-delivery/evidence/experiments";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/*", (r) => (r.request().resourceType() === "font" ? r.abort() : r.continue()));
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.getByTestId("login-email").fill(`exp-ui-${Date.now()}@example.com`);
await page.getByTestId("login-submit").click();
await page.waitForURL("**/workspaces", { timeout: 30_000 });
await page.goto(`${BASE}/experiments`, { waitUntil: "domcontentloaded" });
await page.getByTestId("experiments-page").waitFor({ timeout: 30_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-experiments.png`, fullPage: true });
const results = page.getByRole("button", { name: /结果/ }).first();
if (await results.count()) {
  await results.click().catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/02-results.png`, fullPage: true });
}
await browser.close();
console.log("experiments screenshots ok");
