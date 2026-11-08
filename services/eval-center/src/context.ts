// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Env } from "./env";
import type { JobScheduler } from "./jobs";
import type { Store } from "./store";

export interface AppContext {
  env: Env;
  store: Store;
  scheduler: JobScheduler;
  version: string;
  now: () => Date;
  newId: () => string;
}

export interface BuildOptions {
  env?: Env;
  store?: Store;
  scheduler?: JobScheduler;
  now?: () => Date;
  newId?: () => string;
}
