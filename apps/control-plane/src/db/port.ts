// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { Database } from "bun:sqlite";
import { Pool, type PoolClient } from "pg";

/**
 * 异步数据库端口。SQLite 适配器用于本地/测试；PostgreSQL 适配器用于私有化 HA。
 * 新模块应只依赖 DatabasePort，禁止直接使用 bun:sqlite。
 *
 * 说明（P1 进度）：本文件与双适配器测试已落地；存量路由仍使用同步 ctx.sqlite，
 * 按 POSTGRES-MIGRATION.md 的 P1-1/P1-2 逐步迁移，避免一次性大爆炸重构。
 */
export interface DatabasePort {
  readonly dialect: "sqlite" | "postgres";
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | null>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function pgSql(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export class SqlitePort implements DatabasePort {
  readonly dialect = "sqlite" as const;
  private readonly db: Database;
  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.query(sql).all(...(params as never[])) as T[];
  }
  async get<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    return (this.db.query(sql).get(...(params as never[])) as T | undefined) ?? null;
  }
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const result = this.db.query(sql).run(...(params as never[]));
    return { changes: result.changes };
  }
  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    this.db.exec("BEGIN");
    try {
      const result = await fn(this);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async close(): Promise<void> {
    this.db.close();
  }
}

export class PostgresPort implements DatabasePort {
  readonly dialect = "postgres" as const;
  private readonly pool: Pool | null;
  constructor(connectionString: string, private readonly client?: PoolClient) {
    this.pool = client ? null : new Pool({ connectionString, max: 10 });
  }
  private get executor(): Pool | PoolClient {
    return this.client ?? this.pool!;
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.executor.query(pgSql(sql), params);
    return result.rows as T[];
  }
  async get<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.all<T>(sql, params);
    return rows[0] ?? null;
  }
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const result = await this.executor.query(pgSql(sql), params);
    return { changes: result.rowCount ?? 0 };
  }
  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    if (this.client) return fn(this);
    const client = await this.pool!.connect();
    try {
      await client.query("BEGIN");
      const tx = new PostgresPort("", client);
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    if (!this.client && this.pool) await this.pool.end();
  }
}

export async function createDatabasePort(config: { url: string }): Promise<DatabasePort> {
  if (config.url.startsWith("postgres://") || config.url.startsWith("postgresql://")) {
    const port = new PostgresPort(config.url);
    await port.all("SELECT 1");
    return port;
  }
  return new SqlitePort(config.url.startsWith("file:") ? config.url.slice(5) : config.url);
}
