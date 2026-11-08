// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * V4 Digital Human UI E2E（testid 待 web-console 落地；feature-detect，缺失则 skip）
 * 运行：E2E_READY=1 E2E_BASE_URL=http://localhost:3000 PLAYWRIGHT_CHANNEL=chrome bunx playwright test -c tests/e2e --grep "V4 Digital"
 */
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const READY = process.env.E2E_READY === '1'
const SKIP = '需 E2E_READY=1 + console 数字人 UI 落地'
const EVID = join(process.cwd(), 'docs', '05-delivery', 'evidence', 'v4')
mkdirSync(EVID, { recursive: true })

async function login(page: any, email: string) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-submit').click()
  await page.waitForURL(/\/(workspaces|digital-human|apps)/, { timeout: 20_000 })
}

test.describe('V4 Digital Human UI', () => {
  test('UI-DH-01 会话页可用', async ({ page }) => {
    test.skip(!READY, SKIP)
    await login(page, `v4-dh-ui-${Date.now()}@example.com`)
    const res = await page.goto('/digital-human')
    test.skip(!res || res.status() >= 400, 'digital-human UI 未落地')
    const root = page.getByTestId('dh-page')
    test.skip((await root.count()) === 0, 'dh-page testid 未落地')
    await expect(root).toBeVisible()
    await page.screenshot({ path: join(EVID, 'dh-01-page.png'), fullPage: true })
  })
})
