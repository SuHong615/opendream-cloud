// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { buildApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const { app } = buildApp({ env });

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[memory-service] ${signal} received, shutting down`);
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: env.HOST, port: env.PORT });
console.log(`[memory-service] listening on http://${env.HOST}:${env.PORT} (mem0-compatible + experience, version=0.1.0-m5)`);
