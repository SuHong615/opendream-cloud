// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const READY = process.env.E2E_READY === "1";

test("UI-EXP-01 实验中心列表/结果", async ({ page }) => {
  test.skip(!READY, "需要 E2E_READY=1 + /experiments 页面");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(`exp-e2e-${Date.now()}@example.com`);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/workspaces", { timeout: 30_000 });
  await page.goto(`${BASE}/experiments`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("experiments-page")).toBeVisible();
  await expect(page.getByTestId("experiment-card").first()).toBeVisible();
  const results = page.getByTestId("experiment-results").first();
  if (await results.count()) await results.click();
  await expect(page.getByTestId("experiment-results-panel")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("experiment-winner").first()).toBeVisible();
});
