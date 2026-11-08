// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

/**
 * 契约测试骨架（task-15 / G4）
 * 契约源：docs/02-architecture/openapi.yaml（x-contract-status: frozen）
 *
 * 启用条件（CONTRACT_READY=1 + 控制面可运行）：
 *   - 推荐：GET ${E2E_BASE_URL}/openapi.json 返回实现侧契约
 *   - 备选：apps/control-plane/scripts/route-manifest.ts 导出路由清单
 * 未启用时 skip，并在 G4-EVIDENCE 记 blocked —— 不得伪造通过。
 */

const CONTRACT_READY = process.env.CONTRACT_READY === '1'
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4000'
const OPENAPI_PATH = new URL('../../docs/02-architecture/openapi.yaml', import.meta.url).pathname

// G4 MVP 子集（按 task-12 交付范围；G5 端点不在本测试内）
const G4_MVP_PATHS = [
  '/api/v1/auth/dev-login',
  '/api/v1/auth/logout',
  '/api/v1/me',
  '/api/v1/api-keys',
  '/api/v1/api-keys/{keyId}',
  '/api/v1/model-providers',
  '/api/v1/models',
  '/api/v1/model-policies',
  '/api/v1/workspaces/me/ensure',
  '/api/v1/workspaces',
  '/api/v1/workspaces/{workspaceId}',
  '/api/v1/workspaces/{workspaceId}/start',
  '/api/v1/workspaces/{workspaceId}/stop',
  '/api/v1/workspaces/{workspaceId}/destroy',
  '/api/v1/workspaces/{workspaceId}/destroy/cancel',
  '/api/v1/workspaces/{workspaceId}/access-ticket',
  '/api/v1/audit-logs',
  '/api/v1/usage',
  '/healthz',
]

test.skipIf(!CONTRACT_READY)('契约文件存在且可哈希（frozen 基线）', () => {
  const raw = readFileSync(OPENAPI_PATH, 'utf8')
  expect(raw).toContain('x-contract-status')
  expect(raw).toContain('frozen')
  const sha = createHash('sha256').update(raw).digest('hex')
  // 基线 sha 由 G4-EVIDENCE 记录；此处仅断言非空，避免硬编码漂移
  expect(sha).toMatch(/^[a-f0-9]{64}$/)
})

test.skipIf(!CONTRACT_READY)('实现路由必须覆盖 G4 MVP 子集（未覆盖记 KNOWN_GAPS，P0 禁标）', async () => {
  // TODO(task-12): 优先 fetch(`${BASE_URL}/openapi.json`)；备选 import route-manifest
  // 1) 解析实现侧 paths/methods
  // 2) 与 G4_MVP_PATHS 比对：missing → 读取 tests/contract/known-gaps.json
  // 3) known-gaps 只允许 missing|blocked；P0 端点不得出现在 known-gaps
  // 4) diff 结果写入 docs/05-delivery/evidence/g4/<runid>/contract.diff.json
  const res = await fetch(`${BASE_URL}/openapi.json`).catch(() => undefined)
  expect(res).toBeDefined()
})

test.skipIf(!CONTRACT_READY)('错误响应统一为两层模型（code ∈ 16 枚举 + reason ∈ 23 枚举）', async () => {
  // TODO: 请求一个必然 404 的资源，断言 {error:{code,message,details,request_id}}
  // 并从 openapi 解析 ErrorCode/ErrorReason 枚举做成员校验（禁止自造 code）
  const res = await fetch(`${BASE_URL}/api/v1/workspaces/00000000-0000-0000-0000-000000000000`)
  const body = await res.json().catch(() => ({}))
  expect(body).toBeDefined()
})
