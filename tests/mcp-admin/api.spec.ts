// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * V4 MCP 管理端点测试（task-44；openapi 1.1.0 版本/渠道/工具）
 * 运行：V4_RUN=1 CONTROL_PLANE_URL=http://127.0.0.1:4000 bun test tests/mcp-admin
 */
import { describe, expect, test } from 'bun:test'

const REMOTE = (process.env.CONTROL_PLANE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '')
const ready = process.env.V4_RUN === '1'
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

describe.skipIf(!ready)('V4 MCP admin endpoints', () => {
  let admin: S
  let serverId = ''
  let versionId = ''

  test('admin create/publish server (fixture)', async () => {
    admin = await devLogin(`v4-mcp-admin-${Date.now()}@example.com`)
    const created = await req('POST', '/api/v1/mcp-servers', admin, {
      slug: `v4-mcp-${Date.now().toString(36)}`, name: 'V4 MCP', transport: 'streamable_http',
      endpoint: 'http://mock-mcp:9000/mcp', auth_type: 'none',
      tools: [{ name: 'echo', destructive: false }], default_tools: ['echo'],
    })
    expect(created.status).toBe(201)
    serverId = created.json.id
  })

  test('MCP-ADM-01 版本列表/详情', async () => {
    const versions = await req('GET', `/api/v1/mcp-servers/${serverId}/versions`, admin)
    expect(versions.status).toBe(200)
    expect(Array.isArray(versions.json.items)).toBe(true)
    versionId = versions.json.items[0]?.id
    expect(versionId).toBeTruthy()
    expect((await req('GET', `/api/v1/mcp-versions/${versionId}`, admin)).status).toBe(200)
  })

  test('MCP-ADM-02 review/publish/yank', async () => {
    expect((await req('POST', `/api/v1/mcp-servers/${serverId}/submit-review`, admin, {})).status).toBe(200)
    expect((await req('POST', `/api/v1/mcp-servers/${serverId}/review`, admin, { decision: 'approve' })).status).toBe(200)
    expect([200, 201]).toContain((await req('POST', `/api/v1/mcp-versions/${versionId}/publish`, admin, {})).status)
    const yank = await req('POST', `/api/v1/mcp-versions/${versionId}/yank`, admin, { reason: 'qa' })
    expect([200, 204, 409]).toContain(yank.status)
  })

  test('MCP-ADM-03 channels', async () => {
    const ch = await req('GET', `/api/v1/mcp-servers/${serverId}/channels`, admin)
    expect([200, 404]).toContain(ch.status)
    if (ch.status === 200) expect(ch.json).toBeDefined()
  })

  test('MCP-ADM-04 tools 目录', async () => {
    const tools = await req('GET', `/api/v1/mcp-servers/${serverId}/tools`, admin)
    expect([200, 404]).toContain(tools.status)
  })

  test('MCP-ADM-05 权限', async () => {
    const other = await devLogin(`v4-mcp-other-${Date.now()}@example.com`)
    expect([403, 404]).toContain((await req('GET', `/api/v1/mcp-servers/${serverId}/versions`, other)).status)
    expect((await req('GET', `/api/v1/mcp-servers/${serverId}/versions`)).status).toBe(401)
  })
})
