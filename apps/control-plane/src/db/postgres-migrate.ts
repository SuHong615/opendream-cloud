// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const migrationsDir = fileURLToPath(new URL("../../db/migrations", import.meta.url));

/** SQLite→PostgreSQL 的最小 DDL 转换；覆盖当前迁移集。 */
export function toPostgresSql(sql: string): string {
  return sql
    .replace(/^\s*PRAGMA[^;]+;\s*$/gim, "")
    .replace(/\bifnull\s*\(/gi, "coalesce(")
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, "BIGSERIAL PRIMARY KEY")
    .replace(/\bINTEGER\b/gi, "BIGINT");
}

export async function migratePostgres(connectionString: string, dir = migrationsDir): Promise<string[]> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)");
    const applied = new Set((await client.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((row) => row.version));
    const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
    const ran: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = toPostgresSql(readFileSync(join(dir, file), "utf8"));
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)", [file, Date.now()]);
        await client.query("COMMIT");
        ran.push(file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return ran;
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) {
    console.error("DATABASE_URL must be a postgres:// or postgresql:// URL");
    process.exit(1);
  }
  const ran = await migratePostgres(url);
  console.log(`[pg-migrate] ${ran.length ? ran.join(", ") : "already up to date"}`);
}
