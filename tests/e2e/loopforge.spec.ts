// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const READY = process.env.E2E_READY === "1";

test("LOOPFORGE-01 编排模块：SOP/需求/能力/审批/评测/治理", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`loopforge-${Date.now()}@opendream.example`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
  await page.goto(`${BASE}/orchestration/loopforge`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("loopforge-page")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(11);
  await expect(page.getByTestId("loopforge-chat-input")).toBeVisible();
  await page.getByTestId("loopforge-chat-input").fill("E2E Main Bot：交付一个客户运营自动化流程");
  await page.getByTestId("loopforge-chat-send").click();
  await expect(page.getByText(/已创建沙箱工作区和战役/)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("loopforge-tab-roles").click();
  await expect(page.getByTestId("loopforge-role-card").first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("loopforge-role-card").first().click();
  await expect(page.getByTestId("loopforge-role-drawer")).toBeVisible();
  await page.getByTestId("loopforge-role-drawer").getByRole("button", { name: "取消" }).click();
  await page.getByTestId("loopforge-tab-sop").click();
  await expect(page.getByTestId("loopforge-sop-template").first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("loopforge-sop-view").first().click();
  await expect(page.getByTestId("loopforge-sop-drawer")).toBeVisible();
  await expect(page.getByTestId("loopforge-sop-node").first()).toBeVisible();
  await page.getByTestId("loopforge-sop-drawer").getByRole("button", { name: "关闭" }).click();
  await page.getByTestId("loopforge-tab-requirements").click();
  await expect(page.getByTestId("loopforge-requirement-create")).toBeVisible();
  await page.getByTestId("loopforge-tab-capabilities").click();
  await expect(page.getByTestId("loopforge-capability").first()).toBeVisible();
  await expect(page.getByTestId("loopforge-executor").first()).toBeVisible();
  await page.getByTestId("loopforge-executor-probe").first().click();
  await expect(page.getByTestId("loopforge-executor-probe-result").first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("loopforge-tab-approvals").click();
  await expect(page.getByTestId("loopforge-page")).toBeVisible();
  await page.getByTestId("loopforge-tab-evaluation").click();
  await expect(page.getByRole("heading", { name: "评测运行" })).toBeVisible();
  await page.getByTestId("loopforge-tab-governance").click();
  await expect(page.getByTestId("loopforge-governance").first()).toBeVisible();
});

test("LOOPFORGE-02 旧 /workflows/loopforge 重定向到编排模块", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`loopforge-redirect-${Date.now()}@opendream.example`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces/, { timeout: 30_000 });
  await page.goto(`${BASE}/workflows/loopforge`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/orchestration\/loopforge/);
  await expect(page.getByTestId("loopforge-page")).toBeVisible();
});
