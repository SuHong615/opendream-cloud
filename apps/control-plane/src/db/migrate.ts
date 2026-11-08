// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Sqlite } from "./client";

const migrationsDir = fileURLToPath(new URL("../../db/migrations", import.meta.url));

export function migrate(sqlite: Sqlite, dir = migrationsDir): string[] {
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);");
  const applied = new Set(
    sqlite
      .query<{ version: string }, []>("SELECT version FROM schema_migrations")
      .all()
      .map((row) => row.version),
  );
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(file, Date.now());
    })();
    ran.push(file);
  }
  return ran;
}

if (import.meta.main) {
  const { openDatabase } = await import("./client");
  const { loadEnv } = await import("../env");
  const env = loadEnv();
  const handle = openDatabase(env.DATABASE_PATH);
  const ran = migrate(handle.sqlite);
  console.log(`[migrate] ${ran.length ? ran.join(", ") : "already up to date"} (${handle.path})`);
}
