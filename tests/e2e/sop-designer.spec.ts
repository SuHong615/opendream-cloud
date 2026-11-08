// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const READY = process.env.E2E_READY === "1";

test("SOP-DESIGNER-01 从 SOP 打开画布、加节点并保存版本", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`sop-designer-${Date.now()}@opendream.example`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
  await page.goto(`${BASE}/orchestration/loopforge`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("loopforge-tab-sop").click();
  await page.getByTestId("loopforge-sop-create").first().click();
  await expect(page.getByText(/已从 SOP 创建/)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("loopforge-sop-design").first().click();
  await expect(page.getByTestId("sop-designer-page")).toBeVisible();
  await page.getByTestId("sop-add-node").click();
  await expect(page.getByTestId("sop-node-drawer")).toBeVisible();
  await page.getByTestId("sop-node-name").fill("验收节点");
  await page.getByRole("button", { name: "完成" }).click();
  await page.getByTestId("sop-version-input").fill("1.0.1");
  await page.getByTestId("sop-save").click();
  await expect(page.getByText(/版本 1.0.1 已保存/)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("sop-connect-mode").click();
  await expect(page.getByTestId("sop-connect-hint")).toBeVisible();
  await page.getByTestId("sop-canvas-node").first().click();
  await expect(page.getByTestId("sop-connect-hint")).toContainText("已选择起点");
  await page.getByTestId("sop-node-drawer").getByRole("button", { name: "完成" }).click();
  await page.getByTestId("sop-diff").click();
  await expect(page.getByTestId("sop-diff-result")).toBeVisible();
});
