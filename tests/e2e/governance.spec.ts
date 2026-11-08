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
  await page.waitForURL("**/workspaces", { timeout: 30_000 });
}

test("GOV-01 数字员工 Guardrail 与版本快照", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await login(page);
  await page.goto(`${BASE}/employees`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("employees-page")).toBeVisible();
  await expect(page.getByTestId("employee-card").first()).toBeVisible();
  await page.getByTestId("employee-card").first().getByRole("button", { name: "详情" }).click();
  await expect(page.getByTestId("employee-detail")).toBeVisible();
  await expect(page.getByTestId("employee-guardrails")).toBeVisible();
  await page.getByTestId("guardrails-save").click();
  await page.waitForTimeout(500);
  await page.getByTestId("employee-version-snapshot").click();
  await expect(page.getByTestId("employee-version").first()).toBeVisible({ timeout: 10_000 });
});

test("GOV-02 专家小队定时排班", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1");
  await login(page);
  await page.goto(`${BASE}/squads`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("squads-page")).toBeVisible();
  await expect(page.getByTestId("schedules-section")).toBeVisible();
  const before = await page.getByTestId("schedule-card").count();
  await page.getByTestId("schedule-create").click();
  await page.locator("#schedule-name").fill(`E2E 排班 ${Date.now()}`);
  await page.locator("#schedule-goal").fill("E2E 定时巡检交付状态");
  await page.getByTestId("schedule-save").click();
  await expect(page.getByTestId("schedule-card")).toHaveCount(before + 1, { timeout: 10_000 });
});
