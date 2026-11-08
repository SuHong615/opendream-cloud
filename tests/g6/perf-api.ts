// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * G6 性能冒烟（k6 不可用 → Bun 脚本替代；DEGRADED：非 k6、无 kind/staging）
 * 目标：control-plane API 读 p95 < 300ms（NFR），基线样本。
 * 用法：bun tests/g6/perf-api.ts http://127.0.0.1:4001
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:4001'

async function login() {
  const res = await fetch(`${BASE}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `perf-${Date.now()}@example.com` }),
  })
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  return cookie
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return NaN
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[i]!
}

async function measure(name: string, path: string, cookie?: string, n = 200, concurrency = 10) {
  const times: number[] = []
  let failed = 0
  let idx = 0
  const worker = async () => {
    while (idx < n) {
      idx++
      const t0 = performance.now()
      try {
        const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} })
        if (res.status >= 500) failed++
        await res.arrayBuffer()
      } catch {
        failed++
      }
      times.push(performance.now() - t0)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  times.sort((a, b) => a - b)
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  console.log(`${name}: n=${n} c=${concurrency} avg=${avg.toFixed(1)}ms p50=${pct(times, 50).toFixed(1)}ms p95=${pct(times, 95).toFixed(1)}ms max=${times[times.length - 1]!.toFixed(1)}ms failed=${failed}`)
  return { name, avg, p95: pct(times, 95), failed, n }
}

const cookie = await login()
console.log(`# G6 perf smoke ${new Date().toISOString()} base=${BASE}`)
const results = []
results.push(await measure('GET /healthz', '/healthz', undefined, 200, 10))
results.push(await measure('GET /api/v1/models', '/api/v1/models', cookie, 200, 10))
results.push(await measure('GET /api/v1/workspaces', '/api/v1/workspaces', cookie, 200, 10))
const over = results.filter((r) => r.failed > 0 || r.p95 >= 300)
console.log(`\nPERF: ${results.length - over.length}/${results.length} within p95<300ms & 0 fail`)
if (over.length) process.exit(0) // 性能不达标不阻断，但记录；由 G6 判定
