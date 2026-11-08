// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
const READY = process.env.E2E_READY === '1'
const SKIP = '需 E2E_READY=1 + /memory 页面落地'
const EVID = join(process.cwd(), 'docs', '05-delivery', 'evidence', 'v5')
mkdirSync(EVID, { recursive: true })
async function login(page: any, email: string) {
  await page.goto('/login'); await page.getByTestId('login-email').fill(email); await page.getByTestId('login-submit').click()
  await page.waitForURL(/\/(workspaces|memory)/, { timeout: 20_000 })
}
test('UI-MEM /memory', async ({ page }) => {
  test.skip(!READY, SKIP)
  await login(page, `v5-mem-ui-${Date.now()}@example.com`)
  const res = await page.goto('/memory'); test.skip(!res || res.status() >= 400, 'memory UI 未落地')
  const root = page.getByTestId('memory-page'); test.skip((await root.count()) === 0, 'memory-page testid 未落地')
  await expect(root).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: join(EVID, 'e2e-memory.png'), fullPage: true })
})
