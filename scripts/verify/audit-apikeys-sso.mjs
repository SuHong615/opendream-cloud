// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.getByTestId("login-email").fill(`new-${Date.now()}@opendream.example`);
await page.getByTestId("login-submit").click();
await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
await page.goto(`${BASE}/api-keys`, { waitUntil: "domcontentloaded" });
await page.getByTestId("api-keys-page").waitFor({ timeout: 20_000 });
console.log("keys page loaded, empty:", await page.getByTestId("api-keys-empty").count());
await page.getByTestId("api-key-create").click();
await page.getByTestId("api-key-name").fill("CI 部署");
await page.getByTestId("api-key-create-submit").click();
await page.getByTestId("api-key-plaintext").waitFor({ timeout: 10_000 });
const plaintext = await page.getByTestId("api-key-plaintext").textContent();
console.log("plaintext prefix:", plaintext?.slice(0, 8));
await page.getByRole("button", { name: "我已保存" }).click();
await page.getByTestId("api-key-card").first().waitFor({ timeout: 10_000 });
await page.getByTestId("api-key-rotate").first().click();
await page.getByTestId("api-key-rotate-submit").click();
await page.getByTestId("api-key-plaintext").waitFor({ timeout: 10_000 });
console.log("rotated key prefix:", (await page.getByTestId("api-key-plaintext").textContent())?.slice(0, 8));
await page.getByRole("button", { name: "我已保存" }).click();

// SSO mock flow in a fresh context
const context2 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const sso = await context2.newPage();
await sso.goto(`${BASE}/api/v1/auth/login`, { waitUntil: "domcontentloaded" });
console.log("sso authorize:", sso.url().includes("mock-authorize"));
await sso.locator('input[name="email"]').fill("sso@opendream.example");
await sso.locator("button[type=submit]").click();
await sso.waitForURL(/\/workspaces/, { timeout: 20_000 });
console.log("sso landed:", sso.url());
await browser.close();
