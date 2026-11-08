// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Env } from "./env";
import type { BuildKitClient, Deployer } from "./infra";
import type { Store, TicketSigner } from "./store";

export interface AppContext {
  env: Env;
  store: Store;
  buildkit: BuildKitClient;
  deployer: Deployer;
  signer: TicketSigner;
  version: string;
  now: () => Date;
  newId: () => string;
}

export interface BuildOptions {
  env?: Env;
  store?: Store;
  buildkit?: BuildKitClient;
  deployer?: Deployer;
  signer?: TicketSigner;
  now?: () => Date;
  newId?: () => string;
}
