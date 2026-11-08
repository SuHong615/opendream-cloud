// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 模型中心 UI E2E（task-21 / Playwright，系统 Chrome）
 *
 * 前置：Docker 栈已就绪（console http://localhost:3000 / control-plane 4000 / mock-model）
 * 运行：
 *   $env:E2E_READY='1'; $env:E2E_BASE_URL='http://localhost:3000'; $env:PLAYWRIGHT_CHANNEL='chrome'
 *   bunx playwright test -c tests/e2e --grep "模型中心"
 */
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const READY = process.env.E2E_READY === '1'
const SKIP = 'E2E 需 Docker 栈就绪：E2E_READY=1 + console:3000 + control-plane:4000'
const EVID = join(process.cwd(), 'docs', '05-delivery', 'evidence', 'model-center')
mkdirSync(EVID, { recursive: true })

const MOCK_BASE_URL = 'http://mock-model:9100/v1'
const MOCK_KEY = 'sk-mock-key'

async function login(page: any, email: string) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-error')).toHaveCount(0)
  await page.waitForURL(/\/(workspaces|models)/, { timeout: 20_000 })
}

async function gotoModels(page: any) {
  await page.goto('/models')
  await expect(page.getByTestId('models-page')).toBeVisible({ timeout: 20_000 })
}

test.describe('模型中心 UI（task-21）', () => {
  test.describe.configure({ mode: 'serial' })
  const email = `qa-model-e2e-${Date.now()}@example.com`
  const providerName = `QA 模型 ${Date.now()}`
  let created = false

  test('U-01 登录 → /models 渲染（真实 API，无 DEMO banner）', async ({ page }) => {
    test.skip(!READY, SKIP)
    await login(page, email)
    await gotoModels(page)
    await expect(page.getByTestId('demo-banner')).toHaveCount(0)
    await expect(page.getByTestId('provider-add').or(page.getByTestId('provider-empty-add')).first()).toBeVisible()
    await page.screenshot({ path: join(EVID, '01-models-page.png'), fullPage: true })
  })

  test('U-02/04/05 添加供应商 → 测试连通 → 保存 → 卡片出现', async ({ page }) => {
    test.skip(!READY, SKIP)
    await login(page, email)
    await gotoModels(page)
    const add = page.getByTestId('provider-add').or(page.getByTestId('provider-empty-add')).first()
    await add.click()
    const form = page.getByTestId('provider-form')
    await expect(form).toBeVisible()

    const preset = page.getByTestId('provider-preset')
    if (await preset.count()) {
      const options = await preset.locator('option').allTextContents()
      const idx = options.findIndex((t) => /openai|兼容|custom|自定义/i.test(t))
      if (idx >= 0) await preset.selectOption({ index: idx })
    }
    await page.getByTestId('provider-name').fill(providerName)
    await page.getByTestId('provider-base-url').fill(MOCK_BASE_URL)
    await page.getByTestId('provider-api-key').fill(MOCK_KEY)
    const modelsInput = page.getByTestId('provider-models')
    if (await modelsInput.count()) await modelsInput.fill('gpt-4o-mini')

    await form.getByTestId('provider-test').click()
    const testResult = page.getByTestId('provider-test-result')
    await expect(testResult).toBeVisible({ timeout: 20_000 })
    await expect(testResult).toContainText(/成功|healthy|模型|model/i)
    await page.screenshot({ path: join(EVID, '02-provider-test.png'), fullPage: true })

    await form.getByTestId('provider-save').click()
    await expect(page.getByTestId('toast').first()).toBeVisible({ timeout: 20_000 })
    const card = page.getByTestId('provider-card').filter({ hasText: providerName })
    await expect(card).toBeVisible({ timeout: 20_000 })
    created = true
    await page.screenshot({ path: join(EVID, '03-provider-card.png'), fullPage: true })
  })

  test('U-06 设为默认 → 默认徽标唯一', async ({ page }) => {
    test.skip(!READY, SKIP)
    await login(page, email)
    await gotoModels(page)
    const card = page.getByTestId('provider-card').filter({ hasText: providerName })
    await card.getByTestId('provider-activate').click()
    await expect(page.getByTestId('toast').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('provider-active-badge')).toHaveCount(1)
    await expect(card.getByTestId('provider-active-badge')).toBeVisible()
    await page.screenshot({ path: join(EVID, '04-provider-active.png'), fullPage: true })
  })

  test('U-07 编辑（api_key 不回填明文）→ 保存', async ({ page }) => {
    test.skip(!READY, SKIP)
    await login(page, email)
    await gotoModels(page)
    const card = page.getByTestId('provider-card').filter({ hasText: providerName })
    await card.getByTestId('provider-edit').click()
    await expect(page.getByTestId('provider-form')).toBeVisible()
    const keyValue = await page.getByTestId('provider-api-key').inputValue()
    expect(keyValue === '' || keyValue.includes('*') || /mask/i.test(keyValue)).toBeTruthy()
    await page.getByTestId('provider-name').fill(providerName + ' 改')
    await page.getByTestId('provider-form').getByTestId('provider-save').click()
    await expect(page.getByTestId('toast').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('provider-card').filter({ hasText: providerName + ' 改' })).toBeVisible({ timeout: 20_000 })
  })

  test('U-12 键盘：Esc 关闭抽屉', async ({ page }) => {
    test.skip(!READY, SKIP)
    await login(page, email)
    await gotoModels(page)
    await page.getByTestId('provider-add').or(page.getByTestId('provider-empty-add')).first().click()
    await expect(page.getByTestId('provider-form')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('provider-form')).toHaveCount(0)
  })

  test('U-08 删除（二次确认）→ 卡片消失', async ({ page }) => {
    test.skip(!READY, SKIP)
    test.skip(!created, '依赖创建用例先成功')
    await login(page, email)
    await gotoModels(page)
    const card = page
      .getByTestId('provider-card')
      .filter({ hasText: providerName + ' 改' })
      .or(page.getByTestId('provider-card').filter({ hasText: providerName }))
      .first()
    await card.getByTestId('provider-delete').click()
    await expect(page.getByTestId('provider-delete-dialog')).toBeVisible()
    await page.getByTestId('provider-delete-confirm').click()
    await expect(page.getByTestId('toast').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('provider-card').filter({ hasText: providerName })).toHaveCount(0, { timeout: 20_000 })
    await page.screenshot({ path: join(EVID, '05-provider-deleted.png'), fullPage: true })
  })
})
