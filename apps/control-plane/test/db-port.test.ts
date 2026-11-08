// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabasePort, SqlitePort, PostgresPort, type DatabasePort } from "../src/db/port";

const dir = mkdtempSync(join(tmpdir(), "od-port-"));
const sqlitePath = join(dir, "port.sqlite");
const pgUrl = process.env.TEST_POSTGRES_URL;
const ports: DatabasePort[] = [new SqlitePort(sqlitePath)];
if (pgUrl) ports.push(new PostgresPort(pgUrl));

afterAll(async () => {
  for (const port of ports) await port.close();
  rmSync(dir, { recursive: true, force: true });
});

describe.each(ports.map((port, index) => [port.dialect, index] as const))("DatabasePort %s", (name, index) => {
  test("CRUD + transaction rollback", async () => {
    const port = ports[index]!;
    await port.run("DROP TABLE IF EXISTS port_test");
    await port.run("CREATE TABLE port_test (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at BIGINT NOT NULL)");
    const now = Date.now();
    const inserted = await port.run("INSERT INTO port_test (id, name, created_at) VALUES (?, ?, ?)", ["a", name, now]);
    expect(inserted.changes).toBe(1);
    const row = await port.get<{ id: string; name: string }>("SELECT id, name FROM port_test WHERE id = ?", ["a"]);
    expect(row?.name).toBe(name);
    const rows = await port.all<{ id: string }>("SELECT id FROM port_test ORDER BY id");
    expect(rows.length).toBe(1);
    await expect(port.transaction(async (tx) => {
      await tx.run("INSERT INTO port_test (id, name, created_at) VALUES (?, ?, ?)", ["rollback", name, now]);
      throw new Error("force rollback");
    })).rejects.toThrow("force rollback");
    expect((await port.all("SELECT id FROM port_test")).length).toBe(1);
    await port.run("DELETE FROM port_test WHERE id = ?", ["a"]);
    expect((await port.all("SELECT id FROM port_test")).length).toBe(0);
  });
});

test("createDatabasePort selects dialect", async () => {
  if (pgUrl) {
    const pg = await createDatabasePort({ url: pgUrl });
    expect(pg.dialect).toBe("postgres");
    await pg.close();
  }
  const sqlite = await createDatabasePort({ url: join(dir, "selected.sqlite") });
  expect(sqlite.dialect).toBe("sqlite");
  await sqlite.close();
});
