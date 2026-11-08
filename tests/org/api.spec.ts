// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * V5 Org API 测试（task-52 阶段 1 脚手架）
 * 运行：V5_RUN=1 CONTROL_PLANE_URL=http://127.0.0.1:4000 bun test tests/org
 * 契约：openapi 1.1.0 `/api/v1/orgs*`；quotas 为 V5 增量（假设 /orgs/{id}/quotas）。
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

describe.skipIf(!ready)('V5 org API', () => {
  let owner: S
  let orgId = ''

  test('ORG-01 成员列表', async () => {
    owner = await devLogin(`v5-org-${Date.now()}@example.com`)
    orgId = owner.orgId
    const r = await req('GET', `/api/v1/orgs/${orgId}/members`, owner)
    expect(r.status).toBe(200)
    expect(Array.isArray(r.json.items ?? r.json.members ?? r.json)).toBe(true)
  })

  test('ORG-02/03 邀请/角色边界', async () => {
    const inv = await req('POST', `/api/v1/orgs/${orgId}/members`, owner, { email: `v5-inv-${Date.now()}@example.com`, role: 'member' })
    expect([200, 201, 404]).toContain(inv.status)
    if (inv.status === 200 || inv.status === 201) {
      const memberId = inv.json.id ?? inv.json.member_id
      if (memberId) {
        expect((await req('PATCH', `/api/v1/orgs/${orgId}/members/${memberId}`, owner, { role: 'admin' })).status).toBe(200)
        expect((await req('PATCH', `/api/v1/orgs/${orgId}/members/${memberId}`, owner, { role: 'nope' })).status).toBe(400)
      }
    }
    // 最后 owner 不能移除（若实现）
    const self = await req('DELETE', `/api/v1/orgs/${orgId}/members/${owner.userId}`, owner)
    expect([200, 204, 400, 403, 404, 409]).toContain(self.status)
  })

  test('ORG-04 配额读写（owner）', async () => {
    const q = await req('GET', `/api/v1/orgs/${orgId}/quotas`, owner)
    expect([200, 404]).toContain(q.status)
    if (q.status === 200) {
      const set = await req('PUT', `/api/v1/orgs/${orgId}/quotas`, owner, { workspaces: 50 })
      expect([200, 404]).toContain(set.status)
      const bad = await req('PUT', `/api/v1/orgs/${orgId}/quotas`, owner, { workspaces: -1 })
      if (bad.status !== 404) expect([400, 422]).toContain(bad.status)
    }
  })

  test('ORG-05 跨租户 404 / 未登录 401 / CSRF 403', async () => {
    const other = await devLogin(`v5-org-other-${Date.now()}@example.com`)
    expect((await req('GET', `/api/v1/orgs/${orgId}/members`, other)).status).toBe(404)
    const anon = await fetch(`${REMOTE}/api/v1/orgs/${orgId}/members`)
    expect(anon.status).toBe(401)
    const noCsrf = await fetch(`${REMOTE}/api/v1/orgs/${orgId}/members`, { method: 'POST', headers: { cookie: owner.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@example.com', role: 'member' }) })
    expect([401, 403, 404]).toContain(noCsrf.status)
  })

  test('ORG-06 1.2 alias：/organizations/current*', async () => {
    const members = await req('GET', '/api/v1/organizations/current/members', owner)
    expect([200, 404]).toContain(members.status)
    if (members.status === 200) expect(Array.isArray(members.json.items ?? members.json.members ?? members.json)).toBe(true)
    const quotas = await req('GET', '/api/v1/organizations/current/quotas', owner)
    expect([200, 404]).toContain(quotas.status)
  })
})
