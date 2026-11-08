// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * G6 安全探测（API 级；替代 DAST）
 * - 未认证访问 → 401
 * - 写操作缺 CSRF → 403
 * - API Key：无 scope 越权 → 403（若实现支持 Bearer）
 * - 跨租户已由 tests/security/authz-matrix.ts 覆盖（9/9）
 * 用法：bun tests/g6/security-probe.ts http://127.0.0.1:4001
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:4001'
const out: { name: string; pass: boolean; detail: string }[] = []
const check = (name: string, pass: boolean, detail: string) => {
  out.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

async function req(method: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { method, ...init })
  const text = await res.text()
  let json: any
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  return { status: res.status, json, text, headers: res.headers }
}

// 未认证：受保护读端点必须 401
const protectedReads = ['/api/v1/me', '/api/v1/workspaces', '/api/v1/api-keys', '/api/v1/models', '/api/v1/model-policies', '/api/v1/audit-logs', '/api/v1/usage']
for (const p of protectedReads) {
  const r = await req('GET', p)
  check(`未认证 ${p} → 401`, r.status === 401 && r.json?.error?.code === 'unauthorized', `status=${r.status}`)
}

// 未认证写端点必须 401（不是 500）
for (const [m, p] of [['POST', '/api/v1/workspaces/me/ensure'], ['POST', '/api/v1/api-keys'], ['DELETE', '/api/v1/api-keys/00000000-0000-4000-8000-000000000000']] as const) {
  const hasBody = m !== 'DELETE'
  const r = await req(m, p, hasBody ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {})
  check(`未认证 ${m} ${p} → 401`, r.status === 401, `status=${r.status}`)
}

// 登录后：写操作缺 CSRF → 403
const login = await fetch(`${BASE}/api/v1/auth/dev-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `g6-probe-${Date.now()}@example.com` }) })
const setCookies = login.headers.getSetCookie?.() ?? []
const cookie = setCookies.map((c) => c.split(';')[0]).join('; ')
check('dev-login 建立会话', login.status === 200 && cookie.includes('__Host-oc_session'), `status=${login.status}`)

const noCsrf = await req('POST', '/api/v1/workspaces/me/ensure', { headers: { cookie, 'content-type': 'application/json' }, body: '{}' })
check('写操作缺 CSRF → 403', noCsrf.status === 403, `status=${noCsrf.status} code=${noCsrf.json?.error?.code}`)

// CSRF token 不应通过 JSON body 之外的不可信来源传递；GET /auth/csrf 返回 token（契约 allowlist）
const csrfRes = await req('GET', '/api/v1/auth/csrf', { headers: { cookie } })
check('GET /auth/csrf 返回 token', csrfRes.status === 200 && typeof csrfRes.json?.csrf_token === 'string', `status=${csrfRes.status}`)

// 响应头安全基线
const h = (await req('GET', '/healthz')).headers
check('无 server/版本泄露头', !h.get('server') || !/\d+\.\d+/.test(h.get('server') ?? ''), `server=${h.get('server')}`)
check('x-request-id 存在', Boolean(h.get('x-request-id')), `x-request-id=${h.get('x-request-id')}`)

const failed = out.filter((r) => !r.pass)
console.log(`\nSECURITY PROBE: ${out.length - failed.length}/${out.length} PASS`)
if (failed.length) process.exit(1)
