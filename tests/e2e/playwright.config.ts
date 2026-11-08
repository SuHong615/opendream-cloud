// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { defineConfig } from '@playwright/test'

/**
 * OpenDream Cloud · 核心 E2E 骨架（task-15 / G4）
 *
 * 运行前提（G4 后逐步满足）：
 *   - 控制面 + 控制台可访问：E2E_BASE_URL（默认 http://localhost:3000）
 *   - 工作区网关/群集：E2E_KUBECONFIG（kind 或 staging）
 *   - 打开用例：E2E_READY=1（未置位时全部 skip，见 core-journeys.spec.ts）
 *
 * 纪律：本骨架在 task-12/14 有可运行版本前不得移除 skip；
 * 移除 skip 必须在 G2 的 A-G2 关闭后，并附证据（TEST-PLAN §11.2）。
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // 租户/工作区资源串行，避免互相污染
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../docs/05-delivery/evidence/e2e-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    // 本机无 Playwright Chromium 时用系统 Chrome：PLAYWRIGHT_CHANNEL=chrome
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || undefined } }],
})
