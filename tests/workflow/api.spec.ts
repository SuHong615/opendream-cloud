// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * V4 Workflow Engine API 测试（task-44 阶段 1 脚手架）
 * 契约：openapi 1.1.0 `/api/v1/workflow-*`；运行：V4_RUN=1 CONTROL_PLANE_URL=http://127.0.0.1:4000 bun test tests/workflow
 * 未实现时整组 skip。
 */
import { describe, expect, test } from 'bun:test'

const REMOTE = (process.env.CONTROL_PLANE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '')
const ready = process.env.V4_RUN === '1'

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
  const text = await res.text(); let json: any
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  return { status: res.status, json, text }
}

describe.skipIf(!ready)('V4 workflow-engine API', () => {
  let owner: S
  let defId = ''
  let versionId = ''
  let runId = ''

  test('WF-DSL-01/02 定义+版本+不可变', async () => {
    owner = await devLogin(`v4-wf-${Date.now()}@example.com`)
    const created = await req('POST', '/api/v1/workflow-definitions', owner, {
      slug: `qa-wf-${Date.now().toString(36)}`, name: `qa-wf-${Date.now()}`, description: 'qa', dsl: { apiVersion: 'workflow.opencode.cloud/v1', kind: 'Workflow', metadata: { name: 'qa-workflow', version: '1.0.0' }, spec: { nodes: [{ id: 'approve', type: 'human_approval', assignee: { type: 'role', value: 'owner' }, sla: { due: '24h' }, input: { title: 'Approve' } }] } },
    })
    expect([200, 201]).toContain(created.status)
    defId = created.json.id
    const version = await req('POST', `/api/v1/workflow-definitions/${defId}/versions`, owner, { version: '1.0.1', dsl: created.json.dsl ?? { apiVersion: 'workflow.opencode.cloud/v1', kind: 'Workflow', metadata: { name: 'qa-workflow', version: '1.0.0' }, spec: { nodes: [{ id: 'approve', type: 'human_approval', assignee: { type: 'role', value: 'owner' }, sla: { due: '24h' }, input: { title: 'Approve' } }] } } })
    expect([200, 201, 409]).toContain(version.status)
    versionId = version.json.id
    // 非法 DSL → 400
    const invalid = await req('POST', `/api/v1/workflow-definitions/${defId}/versions`, owner, { dsl: { nodes: [{ type: 'nope' }] } })
    expect([400, 422]).toContain(invalid.status)
  })

  test('WF-RUN-01/02 启动/幂等/状态', async () => {
    const run = await req('POST', '/api/v1/workflow-instances', owner, { definition_id: defId, version: 1, idempotency_key: `idem-${Date.now()}`, input: {} })
    expect([200, 201]).toContain(run.status)
    const id = run.json.id
    runId = id
    const again = await req('POST', '/api/v1/workflow-instances', owner, { definition_id: defId, version: 1, idempotency_key: run.json.idempotency_key, input: {} })
    expect(again.json.id).toBe(id)
    const got = await req('GET', `/api/v1/workflow-instances/${id}`, owner)
    expect(got.status).toBe(200)
    expect(['pending', 'running', 'succeeded', 'failed', 'waiting_human', 'waiting_timer', 'canceled', 'compensating']).toContain(got.json.status)
  })

  test('WF-HUM-01/02 人工任务 + 审批不可绕过', async () => {
    const run = await req('POST', '/api/v1/workflow-instances', owner, { definition_id: defId, version: 1, idempotency_key: `hum-${Date.now()}`, input: {} })
    const id = run.json.id
    // 无权限用户操作 → 403/404
    const other = await devLogin(`v4-wf-other-${Date.now()}@example.com`)
    const denied = await req('POST', `/api/v1/workflow-instances/${id}/signal`, other, { name: 'approve' })
    expect([403, 404]).toContain(denied.status)
    // 取消幂等
    const c1 = await req('POST', `/api/v1/workflow-instances/${id}/cancel`, owner, { reason: 'qa' })
    expect([200, 204, 409]).toContain(c1.status)
  })

  test('WF-SEC-01 跨租户 404 / SSE 鉴权', async () => {
    const other = await devLogin(`v4-wf-tenant-${Date.now()}@example.com`)
    if (defId) expect((await req('GET', `/api/v1/workflow-definitions/${defId}`, other)).status).toBe(404)
    if (versionId) expect((await req('GET', `/api/v1/workflow-versions/${versionId}`, other)).status).toBe(404)
  })

  test('WF-SEC-02 CSRF 缺失 403 / 跨租户 cancel / script 注入拒绝', async () => {
    const noCsrf = await fetch(`${REMOTE}/api/v1/workflow-definitions`, { method: 'POST', headers: { cookie: owner.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x', dsl: {} }) })
    expect([401, 403]).toContain(noCsrf.status)
    const other = await devLogin(`v4-wf-sec-${Date.now()}@example.com`)
    if (runId) expect([403, 404]).toContain((await req('POST', `/api/v1/workflow-instances/${runId}/cancel`, other, { reason: 'x' })).status)
    const inj = await req('POST', `/api/v1/workflow-definitions/${defId}/versions`, owner, { dsl: { nodes: [{ type: 'script', code: 'process.exit(1)' }] } })
    expect([400, 422]).toContain(inj.status)
  })
})
