// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Env } from "./env";
import type { Store } from "./store";
import type { TicketService } from "./tickets";

export interface AppContext {
  env: Env;
  store: Store;
  version: string;
  now: () => Date;
  newId: () => string;
  tickets: TicketService;
}

export interface BuildOptions {
  env?: Env;
  store?: Store;
  now?: () => Date;
  newId?: () => string;
  tickets?: TicketService;
}
