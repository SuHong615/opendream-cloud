// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { HumanTask, WorkflowDefinition, WorkflowRun, WorkflowTemplate } from "./core";
import type { Env } from "./env";
import { BUILTIN_TEMPLATES } from "./templates";

export interface Principal {
  org_id: string;
  user_id: string;
  roles: string[];
}

export class Store {
  readonly workflows = new Map<string, WorkflowDefinition>();
  readonly runs = new Map<string, WorkflowRun>();
  readonly humanTasks = new Map<string, HumanTask>();
  readonly templates: WorkflowTemplate[];

  constructor(options: { seed?: boolean } = {}) {
    this.templates = options.seed === false ? [] : BUILTIN_TEMPLATES.map((template) => structuredClone(template));
  }

  newId(): string {
    return crypto.randomUUID();
  }
}

export interface AppContext {
  env: Env;
  store: Store;
  version: string;
  now: () => Date;
  newId: () => string;
}

export interface BuildOptions {
  env?: Env;
  store?: Store;
  now?: () => Date;
  newId?: () => string;
}
