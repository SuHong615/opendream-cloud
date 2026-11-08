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

test.describe.serial("功能深入回归（用户反馈）", () => {
  test.skip(!READY, "需要 E2E_READY=1");
  test("AUD-01 页面导航全部可达", async ({ page }) => {
    await login(page);
    const routes: Array<[string, string]> = [
      ["/models", "models-page"], ["/skills", "skills-page"], ["/apps", "apps-page"],
      ["/mcp", "mcp-page"], ["/workflows", "workflows-page"], ["/employees", "employees-page"],
      ["/squads", "squads-page"], ["/eval", "eval-page"], ["/experiments", "experiments-page"],
      ["/memory", "memory-page"], ["/observability", "observability-page"], ["/org", "org-page"],
      ["/audit", "audit-page"], ["/usage", "usage-page"], ["/workspaces", "workspaces-page"],
    ];
    for (const [path, testid] of routes) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId(testid)).toBeVisible({ timeout: 15_000 });
    }
  });

  test("AUD-02 MCP 进入详情后可返回列表", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/mcp`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("mcp-page").waitFor();
    await page.waitForTimeout(1000);
    const count = await page.getByTestId("mcp-server").count();
    test.skip(count === 0, "无 MCP 服务可点");
    await page.getByTestId("mcp-server").first().click();
    await expect(page.getByTestId("mcp-back")).toBeVisible();
    await page.getByTestId("mcp-back").dispatchEvent("click");
    await expect(page.getByTestId("mcp-server").first()).toBeVisible();
  });

  test("AUD-03 模型供应商可无 Key 保存 + 分页", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/models`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("models-page").waitFor();
    await page.getByTestId("provider-add").click();
    await page.getByTestId("provider-form").waitFor();
    await page.getByTestId("provider-name").fill(`无鉴权-${Date.now()}`);
    await page.getByTestId("provider-base-url").fill("http://mock-model:9100/v1");
    await page.getByTestId("provider-models").fill("mock-small");
    await page.getByTestId("provider-save").click();
    await expect(page.getByTestId("provider-form")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("provider-form-error")).toHaveCount(0);
    if (await page.getByTestId("provider-pagination").count()) {
      await expect(page.getByTestId("provider-page-next")).toBeEnabled();
    }
  });

  test("AUD-04 工作区销毁按名称自动选择（不再手填）", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/workspaces`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("workspaces-page").waitFor();
    await page.waitForTimeout(1200);
    const links = await page.getByTestId("workspace-detail-link").count();
    test.skip(links === 0, "无工作区可测");
    await page.getByTestId("workspace-detail-link").first().click();
    await page.waitForURL("**/workspaces/**", { timeout: 15_000 });
    await page.getByTestId("destroy-open").click();
    await expect(page.getByTestId("destroy-dialog")).toBeVisible();
    await expect(page.getByTestId("destroy-workspace-select")).toBeVisible();
    await expect(page.getByTestId("destroy-confirm-input")).toHaveCount(0);
    await page.getByTestId("destroy-cancel-button").click();
  });
});
