// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const READY = process.env.E2E_READY === "1";

test("LEGION-02 组建数字军团", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`legion-create-${Date.now()}@opendream.example`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
  await page.goto(`${BASE}/legions`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("legion-create").click();
  await page.getByTestId("legion-create-name").fill("E2E 数据决策军团");
  await page.getByTestId("legion-create-mission").fill("用数据回答经营问题");
  await page.getByTestId("legion-create-squad").first().check();
  await page.getByTestId("legion-create-submit").click();
  await expect(page.getByText("数字军团已组建")).toBeVisible({ timeout: 10_000 });
});

test("LEGION-03 军团详情页 + 下达战役", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`legion-detail-${Date.now()}@opendream.example`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
  await page.goto(`${BASE}/legions`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("legion-open").first().click();
  await expect(page.getByTestId("legion-detail-page")).toBeVisible();
  await expect(page.getByTestId("legion-detail-stat")).toHaveCount(8);
  await page.getByTestId("legion-detail-dispatch").click();
  await page.getByTestId("legion-detail-goal").fill("E2E 详情页战役");
  await page.getByTestId("legion-detail-submit").click();
  await expect(page.getByText("战役已下达")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("legion-detail-run").first()).toBeVisible();
});

test("LEGION-01 数字军团卡片 + 下达战役 + 战役列表", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`legion-${Date.now()}@opendream.example`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
  await page.goto(`${BASE}/legions`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("legions-page")).toBeVisible();
  await expect(page.getByTestId("legion-card")).toHaveCount(3);
  await page.getByTestId("legion-dispatch").first().click();
  await expect(page.getByTestId("legion-dispatch-drawer")).toBeVisible();
  await page.getByTestId("legion-goal").fill("E2E 军团战役");
  await page.getByTestId("legion-requirement").fill("REQ-E2E-LEGION");
  await page.getByTestId("legion-dispatch-submit").click();
  await expect(page.getByTestId("legion-run-row").first()).toBeVisible({ timeout: 15_000 });
});
