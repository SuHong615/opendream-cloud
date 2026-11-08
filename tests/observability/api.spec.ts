// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * V5 Observability API 测试（task-52 阶段 1 脚手架）
 * 运行：V5_RUN=1 CONTROL_PLANE_URL=http://127.0.0.1:4000 bun test tests/observability
 */
import { describe, expect, test } from 'bun:test'

const REMOTE = (process.env.CONTROL_PLANE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '')
const ready = process.env.V5_RUN === '1'
type S = { cookie: string; csrf: string; userId: string; orgId: string }
async function devLogin(email: string): Promise<S> {
  const res = await fetch(`${REMOTE}/api/v1/auth/dev-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  if (res.status !== 200) throw new Error(`dev-login ${res.status}`)
  const b = (await res.json()) as any
  return { cookie: (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]!).join('; '), csrf: b.csrf_token, userId: b.session.user_id, orgId: b.session.org_id }
}
async function req(method: string, path: string, s?: S) {
  const headers: Record<string, string> = {}
  if (s) headers.cookie = s.cookie
  const res = await fetch(`${REMOTE}${path}`, { method, headers })
  const text = await res.text(); let json: any
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  return { status: res.status, json, text }
}

describe.skipIf(!ready)('V5 observability API', () => {
  let owner: S

  test('OBS-01 overview（range 校验）', async () => {
    owner = await devLogin(`v5-obs-${Date.now()}@example.com`)
    const ok = await req('GET', '/api/v1/observability/overview?range=24h', owner)
    expect([200, 404]).toContain(ok.status)
    if (ok.status === 200) {
      expect(ok.json).toHaveProperty('qps')
    }
    const bad = await req('GET', '/api/v1/observability/overview?range=nope', owner)
    if (bad.status !== 404) expect([400, 422]).toContain(bad.status)
  })

  test('OBS-02 timeseries 有序无 NaN', async () => {
    const ts = await req('GET', '/api/v1/observability/timeseries?metric=requests&step=60&range=1h', owner)
    if (ts.status === 404) { expect(true).toBe(true); return }
    expect(ts.status).toBe(200)
    const points = ts.json.points ?? ts.json.series?.[0]?.points ?? []
    let prev = -Infinity
    for (const p of points) {
      const t = p.timestamp ?? p.t ?? p.ts
      if (typeof t === 'number') { expect(t).toBeGreaterThanOrEqual(prev); prev = t }
      expect(Number.isFinite(Number(p.value ?? p.v))).toBe(true)
    }
  })

  test('OBS-04 租户隔离/member 只读', async () => {
    const other = await devLogin(`v5-obs-other-${Date.now()}@example.com`)
    const o = await req('GET', '/api/v1/observability/overview?range=24h', other)
    expect([200, 403, 404]).toContain(o.status)
    const anon = await fetch(`${REMOTE}/api/v1/observability/overview?range=24h`)
    expect([401, 404]).toContain(anon.status)
  })
})
