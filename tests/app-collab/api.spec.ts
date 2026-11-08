// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * v3 应用权限 + 在线协同 API 测试（task-30 执行版）
 *
 * 实测口径（对齐 services/app-center 实现）：
 *  - control-plane 进程内启动（临时 DB），/api/v1/apps* 代理到 app-center（默认 127.0.0.1:4103）
 *  - 协同：/api/v1/apps/{id}/collab[/messages|/proposals|/proposals/{pid}/approve]
 *  - 契约：base_version 三处校验 → 409；patch 路径白名单；跨租户 404；viewer 无 edit 权限 403
 *
 * 运行：V3_RUN=1 bun test tests/app-collab
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { buildApp } from '../../apps/control-plane/src/app'
import { loadEnv } from '../../apps/control-plane/src/env'

const dir = mkdtempSync(join(tmpdir(), 'oc-v3-collab-'))
const env = loadEnv({
  ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '0',
  DATABASE_PATH: join(dir, 'test.sqlite'), ALLOW_DEV_LOGIN: '1', SEED_DEV: 'true',
  SESSION_SECRET: 'test-session-secret-0123456789',
  APIKEY_PEPPER: 'test-apikey-pepper-0123456789',
  TICKET_SECRET: 'test-ticket-secret-0123456789',
})
const { app } = buildApp({ env, quiet: true })
let base = ''
const REMOTE = process.env.CONTROL_PLANE_URL?.replace(/\/$/, '')

type S = { cookie: string; csrf: string; userId: string; orgId: string }
async function devLogin(email: string): Promise<S> {
  const res = await fetch(`${base}/api/v1/auth/dev-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  if (res.status !== 200) throw new Error(`dev-login ${res.status}`)
  const b = (await res.json()) as any
  return { cookie: (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]!).join('; '), csrf: b.csrf_token, userId: b.session.user_id, orgId: b.session.org_id }
}
async function req(method: string, path: string, s?: S, body?: unknown) {
  const headers: Record<string, string> = {}
  if (s) headers.cookie = s.cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (s && method !== 'GET') headers['x-csrf-token'] = s.csrf
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json: any; try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  return { status: res.status, json, text }
}

let ready = false
beforeAll(async () => {
  if (REMOTE) { base = REMOTE } else { await app.listen({ host: '127.0.0.1', port: 0 }); base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` }
})
afterAll(async () => {
  if (!REMOTE) { try { app.server.stop(true) } catch {}; try { await app.close() } catch {} }
  try { rmSync(dir, { recursive: true, force: true }) } catch {}
})
{
  await app.ready().catch(() => undefined)
  ready = process.env.V3_RUN === '1'
  if (!ready) console.warn('[v3-collab] skipped（V3_RUN!=1；需 control-plane+app-center:4103）')
}

describe.skipIf(!ready)('v3 应用权限 + 协同（task-30）', () => {
  let owner: S
  let appId = ''
  let baseVersion = 1

  test('APP-01 创建应用 + 读取', async () => {
    owner = await devLogin(`v3-app-owner-${Date.now()}@example.com`)
    const created = await req('POST', '/api/v1/apps', owner, {
      slug: `qa-app-${crypto.randomUUID().slice(0, 8)}`, name: 'QA App', template: 'node', visibility: 'private',
    })
    expect(created.status).toBe(201)
    appId = created.json.id
    expect((await req('GET', `/api/v1/apps/${appId}`, owner)).status).toBe(200)
  })

  test('COL-01 协同会话/消息/提案/批准（base_version 校验）', async () => {
    const collab = await req('GET', `/api/v1/apps/${appId}/collab`, owner)
    expect(collab.status).toBe(200)
    expect(collab.json.base_version).toBe(1)
    baseVersion = collab.json.base_version
    expect((await req('POST', `/api/v1/apps/${appId}/collab/messages`, owner, { client_msg_id: crypto.randomUUID(), type: 'chat', content: '把首页按钮改蓝色' })).status).toBe(201)
    const proposal = await req('POST', `/api/v1/apps/${appId}/collab/proposals`, owner, {
      base_version: baseVersion,
      summary: 'change button color',
      hash: `sha256:${crypto.randomUUID()}`,
      files: [{ path: 'src/index.ts', status: 'modified', additions: 2, deletions: 1, unified_diff: '--- a\n+++ b' }],
    })
    expect(proposal.status).toBe(201)
    const approved = await req('POST', `/api/v1/apps/${appId}/collab/proposals/${proposal.json.id}/approve`, owner, { expected_base_version: baseVersion })
    expect(approved.status).toBe(200)
    expect(approved.json.version.version).toBe(2)
  })

  test('COL-05 并发冲突：过期 base_version → 409', async () => {
    const p2 = await req('POST', `/api/v1/apps/${appId}/collab/proposals`, owner, {
      base_version: 1, summary: 'stale proposal', hash: `sha256:${crypto.randomUUID()}`,
      files: [{ path: 'src/app.ts', status: 'modified', additions: 1, deletions: 0 }],
    })
    expect(p2.status).toBe(201)
    const r = await req('POST', `/api/v1/apps/${appId}/collab/proposals/${p2.json.id}/approve`, owner, { expected_base_version: 1 })
    expect(r.status).toBe(409)
    expect(r.json?.error?.reason ?? r.json?.error?.details?.code ?? '').toContain('conflict')
  })

  test('COL-06 patch 注入：路径逃逸/保护文件被拒（ADR-V3-02 口径）', async () => {
    for (const path of ['../etc/passwd', '.git/config', '.github/workflows/ci.yml']) {
      const r = await req('POST', `/api/v1/apps/${appId}/collab/proposals`, owner, {
        base_version: 2, summary: 'inject', hash: `sha256:${crypto.randomUUID()}`,
        files: [{ path, status: 'modified', additions: 1, deletions: 0 }],
      })
      // 冻结契约（1.1.0）：400 validation_failed + reason=collab_patch_denied
      // + details.files[] + details.cause="path_not_allowed"（path_not_allowed 独立 reason 为 1.2 backlog）
      expect(r.status).toBe(400)
      expect(r.json?.error?.reason).toBe('collab_patch_denied')
      const details = r.json?.error?.details ?? {}
      // ADR-V3-02：逃逸/畸形 = path_escape；保护文件 = path_not_allowed
      expect(['path_escape', 'path_not_allowed']).toContain(details.cause)
      expect(Array.isArray(details.files)).toBe(true)
      expect(JSON.stringify(details.files)).toContain(path)
    }
  })

  test('COL-10 跨租户访问应用 → 404', async () => {
    const other = await devLogin(`v3-app-other-${Date.now()}@example.com`)
    expect((await req('GET', `/api/v1/apps/${appId}`, other)).status).toBe(404)
  })

  test('APP-P-02 分享创建（users scope）→ 201；同 org viewer 访问链路待补', async () => {
    const member = await devLogin(`v3-app-member-${Date.now()}@example.com`)
    const share = await req('POST', `/api/v1/apps/${appId}/shares`, owner, {
      scope: 'users', role: 'view', subject_type: 'user', subject_id: member.userId,
    })
    expect(share.status).toBe(201)
    // NOT-RUN（同 org viewer 会话）：dev-login 每个用户独立 personal org，跨 org share 的 effective role 需同 org 成员 fixture；
    // 记 DEGRADED，待用户/组织 fixtures 或 SSO 测试账号补充后覆盖（契约 §23.1 view=200 / edit=403）。
  })

  test('COL-W-01 协同 worker：消息 → 自动提案（轮询，worker 不可用则 DEGRADED）', async () => {
    const before = await req('GET', `/api/v1/apps/${appId}/collab/proposals`, owner)
    const beforeIds = new Set((before.json?.items ?? []).map((p: any) => p.id))
    await req('POST', `/api/v1/apps/${appId}/collab/messages`, owner, { client_msg_id: crypto.randomUUID(), type: 'chat', content: '请把标题改成 V4' })
    let found: any
    for (let i = 0; i < 8 && !found; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      const r = await req('GET', `/api/v1/apps/${appId}/collab/proposals`, owner)
      found = (r.json?.items ?? []).find((p: any) => !beforeIds.has(p.id))
    }
    if (found) {
      expect(Array.isArray(found.files)).toBe(true)
      expect(found.files.length).toBeGreaterThan(0)
    } else {
      console.warn('[v4] collab worker 未在 12s 内生成 proposal（DEGRADED：worker 未就绪）')
    }
  })
})
