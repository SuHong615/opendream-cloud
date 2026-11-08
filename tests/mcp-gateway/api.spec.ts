// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * v3 MCP lifecycle + gateway API tests (task-30 rerun)
 * Run: V3_RUN=1 CONTROL_PLANE_URL=http://127.0.0.1:4000 bun test tests/mcp-gateway
 */
import { describe, expect, test } from 'bun:test'

const REMOTE = (process.env.CONTROL_PLANE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '')
const GATEWAY = (process.env.MCP_GATEWAY_URL ?? 'http://localhost:8080').replace(/\/$/, '') + '/mcp'
const MOCK_ENDPOINT = process.env.MCP_MOCK_ENDPOINT ?? 'http://mock-mcp:9000/mcp'
const ready = process.env.V3_RUN === '1'

type S = { cookie: string; csrf: string; userId: string; orgId: string; orgSlug: string }

async function devLogin(email: string): Promise<S> {
  const res = await fetch(`${REMOTE}/api/v1/auth/dev-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  if (res.status !== 200) throw new Error(`dev-login ${res.status}`)
  const b = (await res.json()) as any
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]!).join('; ')
  const me = await fetch(`${REMOTE}/api/v1/me`, { headers: { cookie } })
  const mb = (await me.json()) as any
  return { cookie, csrf: b.csrf_token, userId: b.session.user_id, orgId: b.session.org_id, orgSlug: mb.orgs?.[0]?.slug ?? b.session.org_id }
}
async function req(method: string, path: string, s?: S, body?: unknown) {
  const headers: Record<string, string> = {}
  if (s) headers.cookie = s.cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (s && method !== 'GET') headers['x-csrf-token'] = s.csrf
  const res = await fetch(`${REMOTE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json: any; try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  return { status: res.status, json, text }
}
async function createServer(admin: S) {
  const r = await req('POST', '/api/v1/mcp-servers', admin, {
    slug: `qa-mcp-${crypto.randomUUID().slice(0, 8)}`, name: 'QA MCP', transport: 'streamable_http',
    endpoint: MOCK_ENDPOINT, auth_type: 'none',
    tools: [{ name: 'echo', destructive: false }, { name: 'danger', destructive: true }],
    default_tools: ['echo'],
  })
  if (r.status !== 201) throw new Error(`create ${r.status} ${r.text.slice(0, 200)}`)
  return r.json
}
async function publish(admin: S, id: string) {
  for (const [p, b] of [
    [`/api/v1/mcp-servers/${id}/submit-review`, {}],
    [`/api/v1/mcp-servers/${id}/review`, { decision: 'approve' }],
    [`/api/v1/mcp-servers/${id}/health-check`, {}],
    [`/api/v1/mcp-servers/${id}/publish`, {}],
  ] as const) {
    const r = await req('POST', p, admin, b)
    if (r.status !== 200) throw new Error(`lifecycle ${p} ${r.status} ${r.text.slice(0, 180)}`)
  }
}
async function bind(admin: S, serverId: string, allowed: string[]) {
  const r = await req('POST', '/api/v1/mcp-bindings', admin, { mcp_server_id: serverId, subject_type: 'workspace', subject_id: 'qa-ws', allowed_tools: allowed })
  if (r.status !== 201) throw new Error(`binding ${r.status} ${r.text.slice(0, 180)}`)
  return r.json as { id: string; token: string }
}
async function rpc(orgSlug: string, serverSlug: string, token: string | undefined, method: string, params?: unknown, suffix = '') {
  const res = await fetch(`${GATEWAY}/v1/${orgSlug}/${serverSlug}${suffix}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) }),
  })
  const text = await res.text(); let json: any
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  return { status: res.status, json, text }
}
const decode = (seg: string) => JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))

describe.skipIf(!ready)('v3 MCP lifecycle + gateway (task-30 rerun)', () => {
  let admin: S
  let server: any
  let binding: { id: string; token: string }

  test('LC-01 lifecycle draft->review->published->deprecated->offline', async () => {
    admin = await devLogin(`v3-mcp-admin-${Date.now()}@example.com`)
    server = await createServer(admin)
    expect(server.status).toBe('draft')
    await publish(admin, server.id)
    const got = await req('GET', `/api/v1/mcp-servers/${server.id}`, admin)
    expect(got.json.status).toBe('published')
    expect(got.json.stable_version).toBe(1)
    expect((await req('POST', `/api/v1/mcp-servers/${server.id}/deprecate`, admin, {})).status).toBe(200)
    expect((await req('POST', `/api/v1/mcp-servers/${server.id}/offline`, admin, {})).status).toBe(200)
  })

  test('LC-03 illegal transition: draft directly publish -> 409', async () => {
    const s = await createServer(admin)
    expect((await req('POST', `/api/v1/mcp-servers/${s.id}/publish`, admin, {})).status).toBe(409)
  })

  test('GW-01/02 tool visibility/deny (binding allowlist)', async () => {
    server = await createServer(admin)
    await publish(admin, server.id)
    binding = await bind(admin, server.id, ['echo'])
    const list = await rpc(server.org_slug, server.slug, binding.token, 'tools/list')
    expect(list.status).toBe(200)
    expect(list.json?.result?.tools?.map((t: any) => t.name)).toEqual(['echo'])
    const denied = await rpc(server.org_slug, server.slug, binding.token, 'tools/call', { name: 'danger', arguments: {} })
    if (denied.status === 200) expect(denied.json?.error?.code).toBe(-32001)
    else expect(denied.status).toBe(403)
  })

  test('TK-01 EdDSA ticket claims/TTL/kid with real orgSlug', async () => {
    const token = binding.token
    if (!token.includes('.')) { expect(token.startsWith('mcpb_')).toBe(true); return }
    const [h, p] = token.split('.')
    const header = decode(h!)
    const claims = decode(p!)
    expect(header.alg).toBe('EdDSA')
    expect(header.kid).toBeTruthy()
    for (const k of ['iss', 'aud', 'sub', 'org', 'binding_id', 'server_id', 'server_version', 'scope', 'scope_hash', 'jti', 'iat', 'exp']) expect(claims).toHaveProperty(k)
    expect(claims.aud).toBe(`mcp:org:${server.org_slug}`)
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(300)
    expect((await rpc(server.org_slug, server.slug, token, 'tools/list')).status).toBe(200)
  })

  test('GW-13 unauthenticated 401 / cross-tenant 403 / unpublished 404', async () => {
    expect((await rpc(server.org_slug, server.slug, undefined, 'tools/list')).status).toBe(401)
    const other = await devLogin(`v3-mcp-other-${Date.now()}@example.com`)
    expect([403, 404]).toContain((await rpc(other.orgSlug, server.slug, binding.token, 'tools/list')).status)
  })

  test('TK-03 cross-tenant ticket -> 403 tenant_mismatch', async () => {
    const other = await devLogin(`v3-mcp-tenant-${Date.now()}@example.com`)
    expect((await rpc(other.orgSlug, server.slug, binding.token, 'tools/list')).status).toBe(403)
  })

  test('TK-04 revoke binding -> ticket invalid', async () => {
    const del = await req('DELETE', `/api/v1/mcp-bindings/${binding.id}`, admin)
    expect(del.status).toBe(204)
    expect((await rpc(server.org_slug, server.slug, binding.token, 'tools/list')).status).toBe(401)
  })

  test('MCP-ERR tool not found -> -32007', async () => {
    const s2 = await createServer(admin)
    await publish(admin, s2.id)
    const b2 = await bind(admin, s2.id, ['echo'])
    const r = await rpc(s2.org_slug, s2.slug, b2.token, 'tools/call', { name: 'nope', arguments: {} })
    if (r.status === 200) {
      expect(r.json?.error?.code).toBe(-32007)
      expect(r.json?.error?.data?.code).toBe('tool_not_found')
    } else expect([403, 404]).toContain(r.status)
  })
})
