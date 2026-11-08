// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.CONSOLE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "docs/05-delivery/evidence/v4";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/*", (route) => (route.request().resourceType() === "font" ? route.abort() : route.continue()));
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.getByTestId("login-email").fill(`v4-ui-${Date.now()}@example.com`);
await page.getByTestId("login-submit").click();
await page.waitForURL("**/workspaces", { timeout: 30_000 });

for (const [path, testid, name] of [
  ["/workflows", "workflows-page", "01-workflows.png"],
  ["/digital-human", "dh-page", "02-digital-human.png"],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByTestId(testid).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
  console.log(path, "ok");
}
await browser.close();
