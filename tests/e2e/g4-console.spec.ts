// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from '@playwright/test'

/**
 * G4 控制台浏览器 E2E（真实 4001 API，console :3101 + channel=chrome）
 *
 * 覆盖 #1（登录→工作区列表，真实数据非 DEMO）+ #3（创建→ready→详情入口）。
 * 运行：
 *   $env:E2E_READY='1'; $env:E2E_BASE_URL='http://localhost:3101'
 *   bunx playwright test -c tests/e2e/g4-console.spec.ts
 *
 * 前置：console dev（API_PROXY_TARGET=http://127.0.0.1:4001）+ control-plane 4001 clean DB。
 */

const READY = process.env.E2E_READY === '1'
const SKIP = 'G4 browser E2E requires E2E_READY=1 + console dev + control-plane 4001'

test.describe('G4 控制台真实浏览器 E2E', () => {
  test.describe.configure({ mode: 'serial' })

  test('E2E-AUTH-01 浏览器登录 → 工作区列表（真实数据，无 DEMO）', async ({ page, context }) => {
    test.skip(!READY, SKIP)
    const email = `qa-e2e-${Date.now()}@example.com`
    await page.goto('/login')
    await expect(page.getByTestId('login-form')).toBeVisible()
    await page.getByTestId('login-email').fill(email)
    await page.getByTestId('login-submit').click()

    await expect(page.getByTestId('login-error')).toHaveCount(0)
    await page.waitForURL('**/workspaces', { timeout: 15_000 })
    await expect(page.getByTestId('workspaces-page')).toBeVisible()
    // 真实 API：不得出现 DEMO banner
    await expect(page.getByTestId('demo-banner')).toHaveCount(0)

    // 会话 Cookie：__Host-oc_session（HttpOnly）
    const cookies = await context.cookies()
    const sess = cookies.find((c) => c.name === '__Host-oc_session')
    expect(sess, 'session cookie must exist').toBeTruthy()
    expect(sess!.httpOnly).toBe(true)
  })

  test('E2E-WS-01 浏览器创建 → ready → 详情入口可见（UI 级）', async ({ page }) => {
    test.skip(!READY, SKIP)
    const email = `qa-e2e-${Date.now()}-ws@example.com`
    await page.goto('/login')
    await page.getByTestId('login-email').fill(email)
    await page.getByTestId('login-submit').click()
    await page.waitForURL('**/workspaces', { timeout: 15_000 })

    // 新用户无工作区 → empty-create；否则 workspace-create
    const create = page.getByTestId('empty-create').or(page.getByTestId('workspace-create')).first()
    await expect(create).toBeVisible({ timeout: 15_000 })
    await create.click()

    // 创建中（provisioning-card）或直接出现 card
    await expect(page.getByTestId('provisioning-card').or(page.getByTestId('workspace-card')).first()).toBeVisible({ timeout: 15_000 })

    // mock provisioner 120ms → 最终出现 enter/detail 入口（仅 ready 态渲染）
    await expect(page.getByTestId('workspace-enter').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('workspace-detail-link').first()).toBeVisible()

    // 进入详情页（不进 GUI 新标签页，避免跨域/网关依赖）
    await page.getByTestId('workspace-detail-link').first().click()
    await expect(page.getByTestId('workspace-detail')).toBeVisible({ timeout: 15_000 })
  })
})
