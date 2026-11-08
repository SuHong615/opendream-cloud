// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { describe, expect, test } from "bun:test";
import { Client } from "pg";
import { migratePostgres, toPostgresSql } from "../src/db/postgres-migrate";

const url = process.env.TEST_POSTGRES_URL;

test("SQLite→Postgres DDL 转换", () => {
  expect(toPostgresSql("PRAGMA foreign_keys = ON;\nCREATE TABLE t (seq INTEGER PRIMARY KEY AUTOINCREMENT);")).toContain("BIGSERIAL PRIMARY KEY");
  expect(toPostgresSql("PRAGMA foreign_keys = ON;")).not.toContain("PRAGMA");
});

describe.skipIf(!url)("Postgres schema 迁移", () => {
  test("全量迁移可幂等执行", async () => {
    const first = await migratePostgres(url!);
    const second = await migratePostgres(url!);
    expect(Array.isArray(first)).toBe(true);
    expect(second).toEqual([]);
    const client = new Client({ connectionString: url! });
    await client.connect();
    try {
      const tables = await client.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
      const names = new Set(tables.rows.map((row) => row.table_name));
      for (const table of ["users", "orgs", "workspaces", "model_providers", "mcp_tool_policies", "audit_logs", "credentials", "desktop_devices", "outbox_events"]) {
        if (!names.has(table)) throw new Error(`missing table: ${table}; have: ${[...names].sort().join(",")}`);
        expect(names.has(table)).toBe(true);
      }
    } finally {
      await client.end();
    }
  });
});
