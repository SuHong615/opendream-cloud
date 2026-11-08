// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { buildApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const { app } = buildApp({ env });

const shutdown = async (signal: string) => {
  app.log.info?.(`received ${signal}, shutting down`);
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  console.log(`[control-plane] listening http://${env.HOST}:${env.PORT} (env=${env.NODE_ENV})`);
} catch (error) {
  console.error("[control-plane] failed to start", error);
  process.exit(1);
}
