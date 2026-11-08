// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Env } from "./env";
import type { MemoryStore } from "./store";

export interface AppContext {
  env: Env;
  store: MemoryStore;
  version: string;
}

export interface BuildOptions {
  env?: Env;
  store?: MemoryStore;
  now?: () => Date;
  /** true 时关闭 Fastify 日志（测试默认关闭）。 */
  quiet?: boolean;
}
