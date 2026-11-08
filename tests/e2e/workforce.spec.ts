// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const READY = process.env.E2E_READY === "1";

async function login(page: any) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`wf-e2e-${Date.now()}@example.com`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/workspaces", { timeout: 30_000 });
}

test("UI-WF-01 数字员工列表/详情", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1 + /employees 页面");
  await login(page);
  await page.goto(`${BASE}/employees`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("employees-page")).toBeVisible();
  await expect(page.getByTestId("employee-card").first()).toBeVisible();
  await page.getByTestId("employee-card").first().getByRole("button", { name: "详情" }).click();
  await expect(page.getByTestId("employee-detail")).toBeVisible();
});

test("UI-WF-02 专家小队发起运行并查看时间线", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1 + /squads 页面");
  await login(page);
  await page.goto(`${BASE}/squads`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("squads-page")).toBeVisible();
  await page.getByTestId("squad-start").first().click();
  await expect(page.getByTestId("squad-start-dialog")).toBeVisible();
  await page.locator("#squad-goal").fill("交付一个带审批的发票助手应用");
  await page.getByTestId("squad-start-submit").click();
  await expect(page.getByTestId("squad-run-detail")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("squad-task").first()).toBeVisible();
  await expect(page.getByTestId("squad-message").first()).toBeVisible();
});

test("UI-WF-03 旧数字人入口重定向到数字员工", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await login(page);
  await page.goto(`${BASE}/digital-human`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/employees$/);
});
