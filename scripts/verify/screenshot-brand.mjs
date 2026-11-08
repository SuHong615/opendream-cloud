// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE = process.env.CONSOLE_URL ?? "http://localhost:3001";
const OUT = "docs/05-delivery/evidence/brand";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.getByTestId("login-email").fill("lilei@xingyun.example");
await page.getByTestId("login-submit").click();
await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
const pages = [["/employees", "employees-page", "01-employees.png"], ["/squads", "squads-page", "02-squads.png"], ["/skills", "skills-page", "03-skills.png"], ["/models", "models-page", "04-models.png"]];
for (const [path, testid, file] of pages) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId(testid).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  console.log(path, "ok");
}
await page.goto(`${BASE}/skills`, { waitUntil: "domcontentloaded" });
await page.getByTestId("skills-page").waitFor();
await page.getByTestId("skill-create").click();
await page.getByTestId("skill-upload-drawer").waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/05-skill-upload.png`, fullPage: true });
await browser.close();
console.log("brand screenshots ok");
