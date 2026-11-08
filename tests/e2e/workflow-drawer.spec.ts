// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const READY = process.env.E2E_READY === "1";

async function login(page: any) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`wfui-${Date.now()}@opendream.example`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
}

test("WF-UI-01 中文名称创建工作流 + 右侧抽屉", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await login(page);
  await page.goto(`${BASE}/workflows`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("workflow-create").click();
  const drawer = page.getByTestId("workflow-create-dialog");
  await expect(drawer).toBeVisible();
  const box = await drawer.boundingBox();
  expect(box!.x).toBeGreaterThan(700);
  expect(box!.width).toBeLessThanOrEqual(500);
  await page.locator("#wf-name").fill("测试");
  await page.locator("#wf-display").fill("测试流水线");
  await page.getByTestId("workflow-create-submit").click();
  await expect(drawer).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText("测试流水线").first()).toBeVisible({ timeout: 10_000 });
});

test("WF-UI-02 数字员工弹窗也使用右侧抽屉", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await login(page);
  await page.goto(`${BASE}/employees`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("employee-create").click();
  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThan(700);
});
