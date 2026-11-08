// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Redis from "ioredis";
import type { Env } from "../env";
import { randomId } from "../lib/crypto";

let client: Redis | undefined;
let unavailable = false;

/** Redis 可选：未配置/不可达时不影响核心功能，仅跳过分布式锁。 */
export function getRedis(env: Env): Redis | null {
  if (!env.REDIS_URL || unavailable) return null;
  if (client) return client;
  client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  client.on("error", () => { unavailable = true; });
  void client.connect().catch(() => { unavailable = true; });
  return client;
}

export async function withRedisLock<T>(redis: Redis | null, key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  if (!redis) return fn();
  const token = randomId();
  const acquired = await redis.set(key, token, "PX", ttlMs, "NX").catch(() => null);
  if (acquired !== "OK") return null;
  try {
    return await fn();
  } finally {
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      token,
    ).catch(() => undefined);
  }
}

export async function closeRedis(): Promise<void> {
  if (client) await client.quit().catch(() => undefined);
  client = undefined;
  unavailable = false;
}
