// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * G7 备份恢复实测（sqlite；DEGRADED：PVC/快照/多 AZ 不可用）
 * 步骤：VACUUM INTO 备份 → 记录大小/耗时 → 模拟数据丢失（rename 原库+WAL）→ 恢复 → 校验行数
 * 用法：bun tests/g7/backup-restore.ts <dbPath>
 */
import { Database } from 'bun:sqlite'
import { copyFileSync, existsSync, renameSync, statSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const dbPath = resolve(process.argv[2] ?? 'apps/control-plane/.data/g6.sqlite')
if (!existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`)
  process.exit(1)
}
const outDir = join(process.cwd(), 'docs', '05-delivery', 'evidence', 'g7')
mkdirSync(outDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = join(dirname(dbPath), `g7-backup-${stamp}.sqlite`)

const open = (p: string) => new Database(p)
const counts = (p: string) => {
  const db = open(p)
  const rows = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  const res: Record<string, number> = {}
  for (const r of rows) {
    if (r.name === 'schema_migrations') continue
    try {
      res[r.name] = (db.query(`SELECT COUNT(*) AS c FROM "${r.name}"`).get() as { c: number }).c
    } catch {
      res[r.name] = -1
    }
  }
  db.close()
  return res
}

const before = counts(dbPath)
console.log('# G7 backup/restore', new Date().toISOString(), 'db=', dbPath)
console.log('rows before:', JSON.stringify(before))

// 1) 备份（一致性快照；WAL 安全）
const t0 = performance.now()
let db = open(dbPath)
db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`)
db.close()
const backupMs = performance.now() - t0
const backupSize = statSync(backupPath).size
console.log(`backup: ${backupPath} size=${(backupSize / 1024).toFixed(1)}KiB took=${backupMs.toFixed(1)}ms`)

// 2) 模拟数据丢失（rename 原库 + WAL/SHM）
const suffix = `.lost-${stamp}`
let moved: string[] = []
for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  if (existsSync(f)) {
    renameSync(f, `${f}${suffix}`)
    moved.push(`${f}${suffix}`)
  }
}
console.log(`simulated loss: moved ${moved.length} file(s)`)

// 3) 恢复 + 计时
const t1 = performance.now()
copyFileSync(backupPath, dbPath)
const restoreCopyMs = performance.now() - t1
const after = counts(dbPath)
const restoreTotalMs = performance.now() - t1
console.log('rows after:', JSON.stringify(after))
console.log(`restore: copy_ms=${restoreCopyMs.toFixed(1)} verify_total_ms=${restoreTotalMs.toFixed(1)}`)

const same = JSON.stringify(before) === JSON.stringify(after)
console.log(`integrity: rows ${same ? 'MATCH' : 'MISMATCH'}`)
console.log(`RTO(本机局部): 备份 ${backupMs.toFixed(0)}ms + 恢复 ${restoreTotalMs.toFixed(1)}ms（不含 Pod 重建/拉镜像，K8s 项 DEGRADED）`)
console.log('RPO: 备份点=测试时刻（无持续 WAL 归档 → 真实 RPO 受备份周期约束，需 infra 定周期）')
if (!same) process.exit(1)
