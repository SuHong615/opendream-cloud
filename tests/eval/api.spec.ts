// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * V5 评测 API 测试（task-52 阶段 1 脚手架）
 * 运行：V5_RUN=1 CONTROL_PLANE_URL=http://127.0.0.1:4000 bun test tests/eval
 * 契约假设：evaluators 为 V5 增量；eval-runs/datasets 用 openapi 1.1.0 既有路径。
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

describe.skipIf(!ready)('V5 eval API', () => {
  let owner: S
  let evaluatorId = ''
  let datasetId = ''
  let runId = ''

  test('EV-01 evaluator 列表/创建', async () => {
    owner = await devLogin(`v5-eval-${Date.now()}@example.com`)
    const list = await req('GET', '/api/v1/eval-evaluators', owner)
    expect(list.status).toBe(200)
    const created = await req('POST', '/api/v1/eval-evaluators', owner, { name: `qa-eval-${Date.now()}`, type: 'llm_judge', config: { prompt: 'score' } })
    expect([200, 201]).toContain(created.status)
    evaluatorId = created.json.id
  })

  test('EV-03/04 run 创建+状态机', async () => {
    const ds = await req('POST', '/api/v1/eval-datasets', owner, { name: `qa-ds-${Date.now()}`, samples: [{ input: '1+1', expected: '2' }] })
    if ([200, 201].includes(ds.status)) datasetId = ds.json.id
    const run = await req('POST', '/api/v1/eval-runs', owner, { dataset_id: datasetId, evaluator_ids: [evaluatorId], model: 'gpt-4o-mini' })
    expect([200, 201, 202]).toContain(run.status)
    runId = run.json.id
    const got = await req('GET', `/api/v1/eval-runs/${runId}`, owner)
    expect(got.status).toBe(200)
    expect(['pending', 'queued', 'running', 'succeeded', 'completed', 'failed', 'canceled']).toContain(got.json.status)
  })

  test('EV-05 results/report', async () => {
    if (!runId) return
    const results = await req('GET', `/api/v1/eval-runs/${runId}/results`, owner)
    expect([200, 202]).toContain(results.status)
    const report = await req('GET', `/api/v1/eval-runs/${runId}/report`, owner)
    expect([200, 202, 404]).toContain(report.status)
  })

  test('EV-06 跨租户 404', async () => {
    const other = await devLogin(`v5-eval-other-${Date.now()}@example.com`)
    if (evaluatorId) expect([403, 404]).toContain((await req('DELETE', `/api/v1/eval-evaluators/${evaluatorId}`, other)).status)
    if (runId) expect((await req('GET', `/api/v1/eval-runs/${runId}`, other)).status).toBe(404)
  })

  test('EV-07 注入配置拒绝', async () => {
    const inj = await req('POST', '/api/v1/eval-evaluators', owner, { name: 'inj', type: 'script', config: { code: 'process.exit(1)' } })
    expect([400, 403, 422]).toContain(inj.status)
  })
})
