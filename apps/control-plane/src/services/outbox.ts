// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { connect, JSONCodec, type NatsConnection } from "nats";
import type { AppContext } from "../context";
import { randomId } from "../lib/crypto";
import { closeRedis, getRedis, withRedisLock } from "./redis";

interface OutboxRow {
  id: string;
  org_id: string | null;
  topic: string;
  payload: string;
  attempts: number;
}

let timer: ReturnType<typeof setInterval> | undefined;
let connection: NatsConnection | undefined;
const codec = JSONCodec();

/** 与业务写在同一事务中的事件入队（SQLite 单语句天然原子；Postgres 需包事务）。 */
export function enqueueOutbox(ctx: AppContext, topic: string, payload: Record<string, unknown>, orgId?: string | null): string {
  const id = randomId();
  const now = Date.now();
  ctx.sqlite
    .query("INSERT INTO outbox_events (id, org_id, topic, payload, status, attempts, available_at, created_at) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)")
    .run(id, orgId ?? null, topic, JSON.stringify(payload), now, now);
  return id;
}

async function ensureConnection(ctx: AppContext): Promise<NatsConnection | null> {
  if (!ctx.env.NATS_URL) return null;
  if (connection && !connection.isClosed()) return connection;
  try {
    connection = await connect({ servers: ctx.env.NATS_URL, maxReconnectAttempts: -1, reconnectTimeWait: 1000, name: "opendream-outbox-publisher" });
    return connection;
  } catch {
    connection = undefined;
    return null;
  }
}

async function publishOne(ctx: AppContext, row: OutboxRow): Promise<void> {
  const claimed = ctx.sqlite
    .query("UPDATE outbox_events SET status = 'publishing' WHERE id = ? AND status = 'pending'")
    .run(row.id);
  if (claimed.changes === 0) return;
  const nc = await ensureConnection(ctx);
  try {
    if (!nc) {
      // 本地无 NATS：保留事件但标记为 published-local，避免无限重试；接入 NATS 后可重放。
      ctx.sqlite
        .query("UPDATE outbox_events SET status = 'published', published_at = ?, last_error = 'nats_disabled' WHERE id = ?")
        .run(Date.now(), row.id);
      return;
    }
    nc.publish(row.topic, codec.encode({ id: row.id, org_id: row.org_id, topic: row.topic, ...JSON.parse(row.payload) }));
    ctx.sqlite.query("UPDATE outbox_events SET status = 'published', published_at = ? WHERE id = ?").run(Date.now(), row.id);
  } catch (error) {
    const attempts = row.attempts + 1;
    const failed = attempts >= 10;
    const backoff = Math.min(300_000, 1000 * 2 ** Math.min(attempts, 8));
    ctx.sqlite
      .query("UPDATE outbox_events SET status = ?, attempts = ?, available_at = ?, last_error = ? WHERE id = ?")
      .run(failed ? "failed" : "pending", attempts, Date.now() + backoff, error instanceof Error ? error.message : String(error), row.id);
  }
}

export async function drainOutbox(ctx: AppContext): Promise<number> {
  const redis = getRedis(ctx.env);
  const result = await withRedisLock(redis, "opendream:outbox:publisher", 30_000, () => drainRows(ctx));
  return result ?? 0;
}

async function drainRows(ctx: AppContext): Promise<number> {
  // 恢复长时间停留在 publishing 的事件（进程崩溃）
  ctx.sqlite
    .query("UPDATE outbox_events SET status = 'pending' WHERE status = 'publishing' AND available_at < ?")
    .run(Date.now() - 60_000);
  const rows = ctx.sqlite
    .query<OutboxRow, [number]>("SELECT id, org_id, topic, payload, attempts FROM outbox_events WHERE status = 'pending' AND available_at <= ? ORDER BY created_at LIMIT 50")
    .all(Date.now());
  for (const row of rows) await publishOne(ctx, row);
  return rows.length;
}

export function startOutboxPublisher(ctx: AppContext): void {
  if (timer) return;
  timer = setInterval(() => {
    void drainOutbox(ctx).catch((error) => console.error("[outbox] drain failed", error));
  }, ctx.env.OUTBOX_POLL_MS);
  timer.unref?.();
}

export async function stopOutboxPublisher(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = undefined;
  if (connection && !connection.isClosed()) await connection.drain().catch(() => undefined);
  connection = undefined;
  await closeRedis();
}
