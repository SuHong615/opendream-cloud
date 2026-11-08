// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * G4 越权矩阵（API 级）— #6 API 级替代（kind 不可用，lead 批准 DEGRADED）
 *
 * 覆盖：跨租户 404（D19）、未认证 401、B 列表不泄露 A、B 审计不含 A、B 销毁 A 资源失败。
 * 用法：bun tests/security/authz-matrix.ts [baseUrl]
 * 输出：PASS/FAIL 行；有 FAIL 退出码 1。证据：evidence/g4/<run>/authz-matrix.log
 *
 * 注意：会向目标库写测试用户/工作区（lead 已批准 4001 clean DB 可写）；
 * 工作区销毁有 5min 冷却，测试结束不立即删除（G4 期间保留为测试数据）。
 */

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4001'
const runId = Date.now().toString(36)

type Session = { cookie: string; userId: string; orgId: string }
const results: { name: string; pass: boolean; detail: string }[] = []

function check(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

async function login(email: string): Promise<Session> {
  const res = await fetch(`${BASE}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (res.status !== 200) throw new Error(`dev-login ${res.status} for ${email}`)
  const setCookies = res.headers.getSetCookie?.() ?? []
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ')
  const body = (await res.json()) as { session: { user_id: string; org_id: string } }
  return { cookie, userId: body.session.user_id, orgId: body.session.org_id }
}

async function call(session: Session | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (session) headers.cookie = session.cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  // CSRF：dev-login 的 oc_csrf 在 cookie 里，写操作需 x-csrf-token
  if (session && method !== 'GET') {
    const csrf = session.cookie.split('; ').find((c) => c.startsWith('oc_csrf='))
    if (csrf) headers['x-csrf-token'] = csrf.split('=')[1] ?? ''
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }
  return { status: res.status, json, text }
}

async function ensureWorkspace(s: Session): Promise<string> {
  const res = await call(s, 'POST', '/api/v1/workspaces/me/ensure', {})
  if (res.status !== 202 && res.status !== 200) throw new Error(`ensure ${res.status}: ${res.text}`)
  return res.json.id as string
}

async function waitReady(s: Session, id: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const res = await call(s, 'GET', `/api/v1/workspaces/${id}`)
    const state = res.json?.state
    if (state === 'ready' || state === 'error') return state
    await new Promise((r) => setTimeout(r, 200))
  }
  return 'timeout'
}

const a = await login(`qa-authz-a-${runId}@example.com`)
const b = await login(`qa-authz-b-${runId}@example.com`)
check('A/B 为不同租户', a.orgId !== b.orgId, `a.org=${a.orgId} b.org=${b.orgId}`)

const aWs = await ensureWorkspace(a)
const aState = await waitReady(a, aWs)
check('A 工作区 ready', aState === 'ready', `state=${aState} id=${aWs}`)

// 未认证
const unauth = await call(null, 'GET', `/api/v1/workspaces/${aWs}`)
check('未认证访问 → 401 unauthorized', unauth.status === 401 && unauth.json?.error?.code === 'unauthorized', `status=${unauth.status} code=${unauth.json?.error?.code}`)

// B 直接访问 A 工作区 → 404（D19，不泄露存在性）
const bGet = await call(b, 'GET', `/api/v1/workspaces/${aWs}`)
check('B 访问 A 工作区 → 404 not_found', bGet.status === 404 && bGet.json?.error?.code === 'not_found', `status=${bGet.status} body=${bGet.text.slice(0, 120)}`)

// B 取 A 工作区 ticket → 404
const bTicket = await call(b, 'POST', `/api/v1/workspaces/${aWs}/access-ticket`)
check('B 取 A 的 access-ticket → 404', bTicket.status === 404, `status=${bTicket.status}`)

// B 销毁 A 工作区 → 404
const bDestroy = await call(b, 'POST', `/api/v1/workspaces/${aWs}/destroy`, { confirm_name: 'x', acknowledge_data_loss: true })
check('B 销毁 A 工作区 → 404', bDestroy.status === 404, `status=${bDestroy.status}`)

// B 列表不包含 A 的工作区
const bList = await call(b, 'GET', '/api/v1/workspaces')
const bIds = (bList.json?.items ?? []).map((w: any) => w.id)
check('B 列表不泄露 A 工作区', bList.status === 200 && !bIds.includes(aWs), `status=${bList.status} count=${bIds.length}`)

// B 审计不含 A 的工作区
const bAudit = await call(b, 'GET', '/api/v1/audit-logs?resource_type=workspace')
const auditIds = (bAudit.json?.items ?? []).map((x: any) => x.resource_id)
check('B 审计不含 A 工作区', bAudit.status === 200 && !auditIds.includes(aWs), `status=${bAudit.status} count=${auditIds.length}`)

// A 自己可访问
const aGet = await call(a, 'GET', `/api/v1/workspaces/${aWs}`)
check('A 访问自己工作区 → 200', aGet.status === 200 && aGet.json?.id === aWs, `status=${aGet.status}`)

const failed = results.filter((r) => !r.pass)
console.log(`\nAUTHZ MATRIX: ${results.length - failed.length}/${results.length} PASS`)
if (failed.length > 0) {
  console.log('FAILED:', failed.map((f) => f.name).join(', '))
  process.exit(1)
}
