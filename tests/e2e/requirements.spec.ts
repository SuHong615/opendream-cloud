// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const READY = process.env.E2E_READY === "1";

test("LEGION-02 需求中心登记 → 下达军团", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`req-${Date.now()}@opendream.example`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
  await page.goto(`${BASE}/requirements`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("requirements-page")).toBeVisible();
  await page.getByTestId("requirement-create").click();
  await page.getByTestId("requirement-title").fill("E2E 需求：客户工单自动化");
  await page.getByTestId("requirement-description").fill("验收：自动分诊并生成回复草稿");
  await page.getByTestId("requirement-legion").selectOption({ index: 1 });
  await page.getByTestId("requirement-submit").click();
  await expect(page.getByTestId("requirement-row").first()).toBeVisible();
  await page.getByTestId("requirement-dispatch").first().click();
  await expect(page.getByText(/已下达/)).toBeVisible({ timeout: 15_000 });
});

test("LEGION-03 审批中心可查看待人工门禁", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`appr-${Date.now()}@opendream.example`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
  await page.goto(`${BASE}/approvals`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("approvals-page")).toBeVisible();
});
