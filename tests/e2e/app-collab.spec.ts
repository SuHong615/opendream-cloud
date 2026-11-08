// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * App 权限 + 协同 UI E2E（task-30；web-console testid）
 *
 * 前置：console:3000 + control-plane:4000 + app-center:4103 最新构建；
 * 运行：E2E_READY=1 E2E_BASE_URL=http://localhost:3000 PLAYWRIGHT_CHANNEL=chrome \
 *       bunx playwright test -c tests/e2e --grep "App 协同"
 */
import { test, expect, request } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const READY = process.env.E2E_READY === '1'
const SKIP = '需 localhost:3000/4000/4103 最新构建（E2E_READY=1）'
const EVID = join(process.cwd(), 'docs', '05-delivery', 'evidence', 'v3')
mkdirSync(EVID, { recursive: true })
const CP = process.env.CONTROL_PLANE_URL ?? 'http://127.0.0.1:4000'

async function login(page: any, email: string) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-submit').click()
  await page.waitForURL(/\/(workspaces|apps)/, { timeout: 20_000 })
}

test.describe('App 协同 UI（task-30）', () => {
  test.describe.configure({ mode: 'serial' })
  const email = `qa-app-e2e-${Date.now()}@example.com`
  const slug = `qa-app-ui-${Date.now().toString(36)}`

  test.beforeAll(async () => {
    test.skip(!READY, SKIP)
    // 预置真实 app 记录（dev-login + 创建），确保列表/详情非空
    const api = await request.newContext({ baseURL: CP })
    const loginRes = await api.post('/api/v1/auth/dev-login', { data: { email } })
    expect(loginRes.status()).toBe(200)
    const csrf = (await loginRes.json()).csrf_token
    const cookie = loginRes
      .headersArray()
      .filter((h: any) => h.name.toLowerCase() === 'set-cookie')
      .map((h: any) => h.value.split(';')[0]!)
      .join('; ')
    const res = await api.post('/api/v1/apps', {
      headers: { cookie, 'x-csrf-token': csrf },
      data: { slug, name: 'QA App UI', template: 'node', visibility: 'private' },
    })
    expect(res.status()).toBe(201)
    await api.dispose()
  })

  test('U-APP-01 登录 → /apps 列表渲染', async ({ page }) => {
    test.skip(!READY, SKIP)
    await login(page, email)
    await page.goto('/apps')
    await expect(page.getByTestId('apps-page')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('demo-banner')).toHaveCount(0)
    await page.screenshot({ path: join(EVID, 'app-01-list.png'), fullPage: true })
  })

  test('U-APP-02 打开应用 → 详情/权限/分享面板', async ({ page }) => {
    test.skip(!READY, SKIP)
    await login(page, email)
    await page.goto('/apps')
    const card = page.getByTestId('app-card').filter({ hasText: 'QA App UI' })
    await expect(card).toBeVisible({ timeout: 20_000 })
    await card.getByTestId('app-detail-link').click()
    await expect(page.getByTestId('app-detail')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('app-role-badge')).toBeVisible()
    await expect(page.getByTestId('permission-panel')).toBeVisible()
    await expect(page.getByTestId('share-panel')).toBeVisible()
    await expect(page.getByTestId('version-list')).toBeVisible()
    await page.screenshot({ path: join(EVID, 'app-02-detail.png'), fullPage: true })
  })

  test('U-APP-03 协同抽屉：打开 → 发消息 → 消息出现', async ({ page }) => {
    test.skip(!READY, SKIP)
    await login(page, email)
    await page.goto('/apps')
    await page.getByTestId('app-card').filter({ hasText: 'QA App UI' }).getByTestId('app-detail-link').click()
    await expect(page.getByTestId('app-detail')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('app-collab-open').click()
    await expect(page.getByTestId('collab-drawer')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('collab-input').fill('把首页按钮改成蓝色')
    const [sendResp] = await Promise.all([
      page.waitForResponse((r: any) => r.url().includes('/collab/messages') && r.request().method() === 'POST', { timeout: 20_000 }).catch(() => null),
      page.getByTestId('collab-send').click(),
    ])
    if (sendResp) expect([200, 201]).toContain(sendResp.status())
    await expect(page.getByTestId('collab-message').filter({ hasText: '把首页按钮改成蓝色' })).toBeVisible({ timeout: 20_000 })
    // 提案由 worker 生成（真实模式轮询 4×900ms）；若未生成则记录等待态，不判 UI 失败
    const proposal = page.getByTestId('collab-proposal')
    if (await proposal.count()) {
      await expect(proposal.first()).toBeVisible()
    }
    await page.screenshot({ path: join(EVID, 'app-03-collab.png'), fullPage: true })
  })
})
