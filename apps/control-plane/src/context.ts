// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { DatabaseHandle } from "./db/client";
import type { DatabasePort } from "./db/port";
import type { Env } from "./env";
import type { Provisioner } from "./provisioner/types";

export interface AppContext {
  env: Env;
  database: DatabaseHandle;
  sqlite: DatabaseHandle["sqlite"];
  db: DatabaseHandle["db"];
  /** 异步数据库端口：新模块使用；存量路由仍用 sqlite，按 P1 逐步迁移。 */
  dbPort: DatabasePort;
  provisioner: Provisioner;
  version: string;
}
