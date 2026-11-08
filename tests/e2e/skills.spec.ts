// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from "@playwright/test";
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const READY = process.env.E2E_READY === "1";

async function login(page: any) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill("lilei@xingyun.example");
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
}

test("SKILL-UI-01 上传式新增 + 卡片分页 + 六页签右侧抽屉", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await login(page);
  await page.goto(`${BASE}/skills`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("skills-page")).toBeVisible();
  await expect(page.getByTestId("skill-pagination")).toBeVisible();
  const before = await page.getByTestId("skill-card").count();
  const suffix = Date.now().toString(36);
  const name = `E2E 上传 ${suffix}`;
  await page.getByTestId("skill-create").click();
  await expect(page.getByTestId("skill-upload-drawer")).toBeVisible();
  await page.getByPlaceholder("发票抽取", { exact: true }).fill(name);
  await page.getByPlaceholder("invoice-extract", { exact: true }).fill(`e2e-upload-${suffix}`);
  await page.locator("#skill-content").fill("# E2E Skill\n\n测试内容 {{input}}");
  await page.getByTestId("skill-save").click();
  await expect(page.getByTestId("skill-upload-drawer")).toHaveCount(0, { timeout: 15_000 });
  await page.getByTestId("skill-search").fill(name);
  await expect(page.getByTestId("skill-card").filter({ hasText: name }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("skill-card").filter({ hasText: name }).first().dispatchEvent("click");
  await expect(page.getByTestId("skill-detail-drawer")).toBeVisible();
  for (const tab of ["content", "code", "review", "debug", "versions", "enable"]) {
    await expect(page.getByTestId(`skill-tab-${tab}`)).toBeVisible();
  }
  await page.getByTestId("skill-tab-versions").click();
  await expect(page.getByTestId("skill-version").first()).toBeVisible();
});
