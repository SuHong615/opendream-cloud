// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.CONSOLE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "docs/05-delivery/evidence/model-center";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.route("**/*", (route) => (route.request().resourceType() === "font" ? route.abort() : route.continue()));
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.getByTestId("login-email").fill(`models-ui-${Date.now()}@example.com`);
await page.getByTestId("login-submit").click();
await page.waitForURL("**/workspaces", { timeout: 30_000 });

await page.goto(`${BASE}/models`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.getByTestId("models-page").waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-models-page.png`, fullPage: true });

// 打开添加供应商抽屉
await page.getByTestId("provider-add").first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/02-provider-drawer.png`, fullPage: true });

console.log("screenshots:", OUT, "cards=", await page.getByTestId("provider-card").count());
await browser.close();
