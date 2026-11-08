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
for (const [path, testid] of [["/skills", "skills-page"], ["/prompts", "prompts-page"], ["/usage", "usage-page"]]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId(testid).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  console.log(path, "cards", await page.locator("[data-testid$=card]").count(), "text", (await page.locator("body").innerText()).length);
  await page.screenshot({ path: `docs/05-delivery/evidence/audit${path.replace("/", "-")}.png`, fullPage: true });
}
// skill detail + install if possible
await page.goto(`${BASE}/skills`, { waitUntil: "domcontentloaded" });
await page.getByTestId("skills-page").waitFor();
if (await page.getByTestId("skill-card").count()) {
  await page.getByTestId("skill-card").first().click();
  console.log("skill detail:", await page.getByTestId("skill-detail").isVisible().catch(() => false));
}
await browser.close();
