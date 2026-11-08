// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const READY = process.env.E2E_READY === "1";

async function login(page: any) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`sec-${Date.now()}@opendream.example`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
}

test("SEC-01 API Key 创建/轮换 + 导出", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await login(page);
  await page.goto(`${BASE}/api-keys`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("api-keys-page")).toBeVisible();
  await page.getByTestId("api-key-create").click();
  await page.getByTestId("api-key-name").fill("E2E Key");
  await page.getByTestId("api-key-create-submit").click();
  await expect(page.getByTestId("api-key-plaintext")).toBeVisible();
  await expect(page.getByTestId("api-key-plaintext")).toContainText("ock_");
  await page.getByRole("button", { name: "我已保存" }).click();
  await expect(page.getByTestId("api-key-card").first()).toBeVisible();
  await page.getByTestId("api-key-rotate").first().click();
  await page.getByTestId("api-key-rotate-submit").click();
  await expect(page.getByTestId("api-key-plaintext")).toBeVisible();

  const exportResponse = page.waitForResponse((r) => r.url().includes("/usage/exports") && r.request().method() === "POST", { timeout: 15_000 });
  await page.goto(`${BASE}/usage`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("usage-export").click();
  expect((await exportResponse).status()).toBe(202);
});

test("SEC-02 企业 SSO mock 登录", async ({ browser }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/api/v1/auth/login`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await page.locator('input[name="email"]').fill("sso-e2e@opendream.example");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/\/workspaces/, { timeout: 20_000 });
  await context.close();
});

test("SEC-03 配额申请抽屉", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await login(page);
  await page.goto(`${BASE}/org`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("org-page")).toBeVisible();
  await page.getByTestId("quota-request-create").click();
  await expect(page.getByTestId("quota-request-drawer")).toBeVisible();
  await page.getByTestId("quota-request-amount").fill("3");
  await page.getByTestId("quota-request-reason").fill("E2E 扩容");
  await page.getByTestId("quota-request-submit").click();
  await expect(page.getByTestId("quota-request-row").first()).toBeVisible({ timeout: 10_000 });
});

test("SEC-04 企业门户 + 控制台设备配对", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await login(page);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("public-portal")).toBeVisible();
  await expect(page.getByTestId("portal-console")).toHaveAttribute("href", "/workspaces");
  await expect(page.getByTestId("portal-github")).toHaveAttribute("href", "https://github.com/SuHong615/opendream-cloud");
  await page.goto(`${BASE}/devices`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("devices-page")).toBeVisible();
  await page.getByTestId("devices-pair").click();
  await expect(page.getByTestId("devices-pairing-code")).toHaveText(/^OD-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});
