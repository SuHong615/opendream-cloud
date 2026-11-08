// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { buildApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const { app } = buildApp({ env });
await app.listen({ host: env.HOST, port: env.PORT });
console.log(`[digital-human] listening on http://${env.HOST}:${env.PORT}`);
