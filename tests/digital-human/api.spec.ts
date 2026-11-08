// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * V4 数字人 L1 API 测试（LEGACY，已由 Agent Workforce 取代）。
 * 用户澄清“数字人”= 企业应用内数字员工/专家小队，不是 RTC 虚拟人；
 * 本套件仅保留历史契约，不再作为主门禁执行；新覆盖见 tests/e2e/workforce.spec.ts。
 */
import { describe, expect, test } from 'bun:test'

const REMOTE = (process.env.CONTROL_PLANE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '')
const ready = false

type S = { cookie: string; csrf: string; userId: string; orgId: string }
async function devLogin(email: string): Promise<S> {
  const res = await fetch(`${REMOTE}/api/v1/auth/dev-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  if (res.status !== 200) throw new Error(`dev-login ${res.status}`)
  const b = (await res.json()) as any
  return { cookie: (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]!).join('; '), csrf: b.csrf_token, userId: b.session.user_id, orgId: b.session.org_id }
}
async function req(method: string, path: string, s?: S, body?: unknown) {
  const headers: Record<string, string> = {}
  if (s) headers.cookie = s.cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (s && method !== 'GET') headers['x-csrf-token'] = s.csrf
  const res = await fetch(`${REMOTE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text(); let json: any
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  return { status: res.status, json, text }
}

describe.skipIf(!ready)('V4 digital-human L1 API', () => {
  let owner: S
  let sessionId = ''

  test('DH-SES-01 创建会话 + 幂等', async () => {
    owner = await devLogin(`v4-dh-${Date.now()}@example.com`)
    const avatars = (await req('GET', '/api/v1/dh/avatars', owner)).json.items as Array<{ id: string }>
    const voices = (await req('GET', '/api/v1/dh/voices', owner)).json.items as Array<{ id: string }>
    const body = { mode: 'realtime', avatar_id: avatars[0].id, voice_id: voices[0].id, scene_id: 'sc-default', language: 'zh-CN', idempotency_key: `dh-${Date.now()}` }
    const created = await req('POST', '/api/v1/dh/sessions', owner, body)
    expect([200, 201]).toContain(created.status)
    sessionId = created.json.id ?? created.json.session_id
    expect(sessionId).toBeTruthy()
    const again = await req('POST', '/api/v1/dh/sessions', owner, body)
    expect(again.status).toBe(200)
    expect(again.json.id ?? again.json.session_id).toBe(sessionId)
  })

  test('DH-SES-02 输入/打断/结束', async () => {
    expect([200, 202]).toContain((await req('POST', `/api/v1/dh/sessions/${sessionId}/input`, owner, { type: 'text', text: '你好' })).status)
    expect([200, 204]).toContain((await req('POST', `/api/v1/dh/sessions/${sessionId}/interrupt`, owner, {})).status)
    expect([200, 204]).toContain((await req('POST', `/api/v1/dh/sessions/${sessionId}/end`, owner, { reason: 'qa' })).status)
    const after = await req('POST', `/api/v1/dh/sessions/${sessionId}/input`, owner, { type: 'text', text: 'after end' })
    expect([409, 410, 422]).toContain(after.status)
  })

  test('DH-SSE-02 会话越权 → 404/403', async () => {
    const other = await devLogin(`v4-dh-other-${Date.now()}@example.com`)
    const r = await req('GET', `/api/v1/dh/sessions/${sessionId}`, other)
    expect([403, 404]).toContain(r.status)
    const sse = await fetch(`${REMOTE}/api/v1/dh/sessions/${sessionId}/events`, { headers: { cookie: other.cookie, accept: 'text/event-stream' } })
    expect([401, 403, 404]).toContain(sse.status)
    await sse.body?.cancel()
  })

  test('DH-ERR-01 非法 mode/avatar → 4xx 两层错误', async () => {
    const bad = await req('POST', '/api/v1/dh/sessions', owner, { mode: 'nope', avatar_id: 'x', voice_id: 'y' })
    expect([400, 422]).toContain(bad.status)
    expect(bad.json?.error?.code).toBeDefined()
  })

  test('DH-TK-01 embed token 语义', async () => {
    const t = await req('POST', '/api/v1/dh/embed-tokens', owner, { app_id: 'qa-app', origin: 'http://localhost:3000', ttl: 600 })
    if (t.status === 200 || t.status === 201) {
      expect(typeof (t.json.token ?? t.json.embed_token)).toBe('string')
    } else expect([400, 403, 404]).toContain(t.status)
  })

  test('DH-SEC-01 未登录/无签名 Webhook/跨租户输入', async () => {
    // 未登录创建 → 401
    const anon = await fetch(`${REMOTE}/api/v1/dh/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'realtime' }) })
    expect(anon.status).toBe(401)
    // 无签名 webhook → 401/403
    const wh = await fetch(`${REMOTE}/api/v1/dh/webhooks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'dh.session.started' }) })
    expect([401, 403, 404]).toContain(wh.status)
    // 跨租户 input
    const other = await devLogin(`v4-dh-sec-${Date.now()}@example.com`)
    if (sessionId) expect([403, 404]).toContain((await req('POST', `/api/v1/dh/sessions/${sessionId}/input`, other, { type: 'text', text: 'hijack' })).status)
  })
})
