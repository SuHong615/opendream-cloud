// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Env } from "./env";
import type { DhService } from "./service";
import type { WebhookRegistry } from "./webhooks";

export interface AppContext {
  env: Env;
  service: DhService;
  webhooks: WebhookRegistry;
  version: string;
}

export interface BuildOptions {
  env?: Env;
  now?: () => Date;
  service?: DhService;
  webhooks?: WebhookRegistry;
  /** true 时关闭 Fastify 日志（测试默认关闭）。 */
  quiet?: boolean;
}
