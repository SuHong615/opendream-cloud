// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 模型中心 API 测试（task-21）
 *
 * 特点：
 *  - 独立起 control-plane 实例（随机端口 + 临时 DB），**不依赖 Docker**
 *  - 内嵌 mock OpenAI 兼容服务（Bun.serve），支持 success / 401 / timeout
 *  - 依赖探测：task-18 未落地时整组 skip（不误报）
 *
 * 运行：cd D:\opencode && bun test tests/model-center/api.spec.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { buildApp } from '../../apps/control-plane/src/app'
import { loadEnv } from '../../apps/control-plane/src/env'
import { signCookie } from '../../apps/control-plane/src/lib/crypto'
import { SESSION_COOKIE, CSRF_COOKIE } from '../../apps/control-plane/src/lib/constants'

const dir = mkdtempSync(join(tmpdir(), 'oc-model-center-'))
const configOut = join(dir, 'opencode.json')

// ---------- mock OpenAI 兼容服务 ----------
type MockMode = 'ok' | '401' | 'timeout'
let mockMode: MockMode = 'ok'
const mockServer = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (mockMode === 'timeout') await new Promise((r) => setTimeout(r, 2000))
    if (mockMode === '401') return Response.json({ error: { message: 'invalid api key' } }, { status: 401 })
    if (url.pathname === '/v1/models') {
      return Response.json({ object: 'list', data: [{ id: 'mock-gpt-4o-mini', object: 'model' }, { id: 'mock-qwen', object: 'model' }] })
    }
    if (url.pathname === '/v1/chat/completions') return Response.json({ choices: [{ message: { content: 'ok' } }] })
    return Response.json({ error: { message: 'not found' } }, { status: 404 })
  },
})
const mockBase = `http://127.0.0.1:${mockServer.port}/v1`

// ---------- control-plane 实例 ----------
const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '0',
  DATABASE_PATH: join(dir, 'test.sqlite'),
  ALLOW_DEV_LOGIN: '1',
  SEED_DEV: 'true',
  SESSION_SECRET: 'test-session-secret-0123456789',
  APIKEY_PEPPER: 'test-apikey-pepper-0123456789',
  TICKET_SECRET: 'test-ticket-secret-0123456789',
  MODEL_PROVIDER_TEST_TIMEOUT_MS: '300',
  OPENCODE_CONFIG_OUT: configOut,
  MODEL_SECRET_KEY: 'test-model-secret-0123456789',
})
const { app, ctx } = buildApp({ env, quiet: true })
let base = ''

type Session = { cookie: string; csrf: string; userId: string; orgId: string; email: string }

async function req(
  method: string,
  path: string,
  session?: Session,
  body?: unknown,
  opts: { csrf?: boolean } = {},
): Promise<{ status: number; json: any; text: string }> {
  const headers: Record<string, string> = {}
  if (session) headers.cookie = session.cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (session && method !== 'GET' && opts.csrf !== false) headers['x-csrf-token'] = session.csrf
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  return { status: res.status, json, text }
}

async function devLogin(email: string): Promise<Session> {
  const res = await fetch(`${base}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (res.status !== 200) throw new Error(`dev-login ${res.status}`)
  const list = res.headers.getSetCookie?.() ?? []
  const cookies = list.map((c) => c.split(';')[0]!)
  const body = (await res.json()) as any
  return { cookie: cookies.join('; '), csrf: body.csrf_token, userId: body.session.user_id, orgId: body.session.org_id, email }
}

function insertMember(userId: string, orgId: string, role: string): void {
  ctx.sqlite.run(
    `INSERT INTO memberships (id, org_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)`,
    [crypto.randomUUID(), orgId, userId, role, Date.now()],
  )
}

/** 伪造"admin org 内 member 角色"的会话（会话 Cookie 为签名自包含，无需登录改写 org） */
function forgeSessionInOrg(userId: string, orgId: string): Session {
  const csrf = crypto.randomUUID()
  const token = signCookie(env.SESSION_SECRET, { sub: userId, org: orgId, sid: crypto.randomUUID(), exp: Date.now() + 3600_000 })
  return {
    cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${CSRF_COOKIE}=${csrf}`,
    csrf,
    userId,
    orgId,
    email: 'forged@example.com',
  }
}

const isMasked = (v: unknown): boolean => typeof v === 'string' && (v.includes('*') || /mask|redact/i.test(v))

let ready = false
beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
  const addr = app.server.address() as AddressInfo
  base = `http://127.0.0.1:${addr.port}`
  const probe = await fetch(`${base}/api/v1/model-provider-presets`).catch(() => undefined)
  ready = Boolean(probe && probe.status !== 404)
  if (!ready) console.warn('[model-center] task-18 endpoints not implemented yet → suite skipped (scaffold only)')
})

afterAll(async () => {
  try { mockServer.stop(true) } catch {}
  try { app.server.stop(true) } catch {}
  try { await app.close() } catch {}
  try { rmSync(dir, { recursive: true, force: true }) } catch {}
})

describe('模型中心 API（task-21）', () => {
  const skip = () => { if (!ready) throw new Error('SKIP: model-center endpoints not implemented (task-18 pending)') }
  let admin: Session
  let providerA = ''
  let providerAName = ''

  test('未登录 → 401（含 presets/preview）', async () => {
    skip()
    for (const [m, p] of [
      ['GET', '/api/v1/model-providers'],
      ['POST', '/api/v1/model-providers'],
      ['GET', '/api/v1/model-provider-presets'],
      ['GET', '/api/v1/model-config/preview'],
    ] as const) {
      const r = await req(m, p)
      expect(r.status).toBe(401)
      expect(r.json?.error?.code).toBe('unauthorized')
    }
  })

  test('预设 ≥10 且字段完整', async () => {
    skip()
    admin = await devLogin(`qa-model-admin-${Date.now()}@example.com`)
    const r = await req('GET', '/api/v1/model-provider-presets', admin)
    expect(r.status).toBe(200)
    const items = r.json?.items ?? r.json
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThanOrEqual(10)
    for (const key of ['id', 'name', 'kind', 'base_url']) expect(items[0]).toHaveProperty(key)
  })

  test('创建 provider：列表只回显 masked，无明文', async () => {
    skip()
    const plain = 'sk-secret-plaintext-should-not-leak'
    providerAName = `qa-provider-${Date.now()}`
    const r = await req('POST', '/api/v1/model-providers', admin, {
      name: providerAName,
      kind: 'openai_compatible',
      base_url: mockBase,
      api_key: plain,
      models: ['mock-gpt-4o-mini'],
    })
    expect([200, 201]).toContain(r.status)
    expect(r.text).not.toContain(plain)
    providerA = r.json?.id
    expect(typeof providerA).toBe('string')
    const list = await req('GET', '/api/v1/model-providers', admin)
    expect(list.status).toBe(200)
    expect(list.text).not.toContain(plain)
    const item = (list.json?.items ?? []).find((p: any) => p.id === providerA)
    expect(item).toBeTruthy()
    expect(isMasked(item.api_key_masked)).toBe(true)
  })

  test('重复名 → 4xx 且不产生重复', async () => {
    skip()
    const r = await req('POST', '/api/v1/model-providers', admin, {
      name: providerAName, kind: 'openai_compatible', base_url: mockBase, api_key: 'sk-dup',
    })
    expect([400, 409]).toContain(r.status)
  })

  test('test 成功：health=healthy + models upsert + latency', async () => {
    skip()
    mockMode = 'ok'
    const r = await req('POST', `/api/v1/model-providers/${providerA}/test`, admin)
    expect(r.status).toBe(200)
    expect(r.json?.ok).toBe(true)
    expect(r.json?.latency_ms).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(r.json?.models)).toBe(true)
    const list = await req('GET', '/api/v1/model-providers', admin)
    const item = (list.json?.items ?? []).find((p: any) => p.id === providerA)
    expect(item.health).toBe('healthy')
    expect(item.models_count).toBeGreaterThanOrEqual(1)
  })

  test('test 失败（401/超时/网络错误）→ 200 ok:false + unhealthy', async () => {
    skip()
    for (const mode of ['401', 'timeout'] as MockMode[]) {
      mockMode = mode
      const r = await req('POST', `/api/v1/model-providers/${providerA}/test`, admin)
      expect(r.status).toBe(200)
      expect(r.json?.ok).toBe(false)
      expect(typeof r.json?.error_code).toBe('string')
    }
    mockMode = 'ok'
    const list = await req('GET', '/api/v1/model-providers', admin)
    const item = (list.json?.items ?? []).find((p: any) => p.id === providerA)
    expect(['unhealthy', 'down']).toContain(item.health)
  })

  test('activate 唯一默认 + config preview（baseURL 存在、apiKey 掩码、无明文）', async () => {
    skip()
    const b = await req('POST', '/api/v1/model-providers', admin, {
      name: `qa-provider-b-${Date.now()}`, kind: 'openai_compatible', base_url: mockBase, api_key: 'sk-second-secret', models: ['mock-qwen'],
    })
    expect([200, 201]).toContain(b.status)
    const providerB = b.json.id
    expect((await req('POST', `/api/v1/model-providers/${providerA}/activate`, admin)).status).toBe(200)
    expect((await req('POST', `/api/v1/model-providers/${providerB}/activate`, admin)).status).toBe(200)
    const list = await req('GET', '/api/v1/model-providers', admin)
    const actives = (list.json?.items ?? []).filter((p: any) => p.is_active)
    expect(actives.length).toBe(1)
    expect(actives[0].id).toBe(providerB)

    const preview = await req('GET', '/api/v1/model-config/preview', admin)
    expect(preview.status).toBe(200)
    expect(preview.json).toHaveProperty('$schema')
    expect(typeof preview.json?.model).toBe('string')
    const providers = preview.json?.providers ?? {}
    const keys = Object.keys(providers)
    expect(keys.length).toBeGreaterThanOrEqual(1)
    const entry = providers[keys[0]!]
    expect(String(entry?.settings?.baseURL ?? '')).toContain('127.0.0.1')
    // 安全：preview 不出现两个明文 key；若返回 apiKey 必须是掩码（lead 口径）
    expect(preview.text).not.toContain('sk-second-secret')
    expect(preview.text).not.toContain('sk-secret-plaintext-should-not-leak')
    for (const k of keys) {
      const apiKey = providers[k]?.settings?.apiKey
      if (apiKey !== undefined && apiKey !== null) expect(isMasked(apiKey)).toBe(true)
    }
  })

  test('member 只读/403；跨 org owner 404', async () => {
    skip()
    const memberUser = await devLogin(`qa-model-member-${Date.now()}@example.com`)
    insertMember(memberUser.userId, admin.orgId, 'member')
    const member = forgeSessionInOrg(memberUser.userId, admin.orgId)
    expect((await req('GET', '/api/v1/model-providers', member)).status).toBe(200)
    expect((await req('POST', '/api/v1/model-providers', member, { name: 'x', kind: 'openai_compatible', base_url: mockBase, api_key: 'sk-x' })).status).toBe(403)
    expect((await req('POST', `/api/v1/model-providers/${providerA}/test`, member)).status).toBe(403)
    expect((await req('DELETE', `/api/v1/model-providers/${providerA}`, member)).status).toBe(403)

    const other = await devLogin(`qa-model-other-${Date.now()}@example.com`)
    expect((await req('PATCH', `/api/v1/model-providers/${providerA}`, other, { name: 'hijack' })).status).toBe(404)
    expect((await req('DELETE', `/api/v1/model-providers/${providerA}`, other)).status).toBe(404)
    expect((await req('POST', `/api/v1/model-providers/${providerA}/test`, other)).status).toBe(404)
  })

  test('编辑：空 api_key 不覆盖；删除 204 且列表移除', async () => {
    skip()
    const list = await req('GET', '/api/v1/model-providers', admin)
    const before = (list.json?.items ?? []).find((p: any) => p.id === providerA)
    const patch = await req('PATCH', `/api/v1/model-providers/${providerA}`, admin, { name: before.name + '-edited', api_key: '' })
    expect([200, 204]).toContain(patch.status)
    const after = (await req('GET', '/api/v1/model-providers', admin)).json.items.find((p: any) => p.id === providerA)
    expect(after.name).toBe(before.name + '-edited')
    expect(isMasked(after.api_key_masked)).toBe(true)

    expect((await req('DELETE', `/api/v1/model-providers/${providerA}`, admin)).status).toBe(204)
    const afterDelete = await req('GET', '/api/v1/model-providers', admin)
    expect((afterDelete.json?.items ?? []).some((p: any) => p.id === providerA)).toBe(false)
    // 配置写入（异步/同步均可，仅提示）
    await new Promise((r) => setTimeout(r, 300))
    if (!existsSync(configOut)) console.warn('[model-center] OPENCODE_CONFIG_OUT not written yet (async/环境)')
  })
})
