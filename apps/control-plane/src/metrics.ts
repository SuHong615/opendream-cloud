// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import type { AppContext } from "./context";

interface Counter { method: string; route: string; status: number; count: number; durationSum: number }
const counters = new Map<string, Counter>();

export function recordHttpRequest(method: string, route: string, status: number, durationMs: number): void {
  const key = `${method}|${route}|${status}`;
  const existing = counters.get(key);
  if (existing) {
    existing.count += 1;
    existing.durationSum += durationMs;
    return;
  }
  counters.set(key, { method, route, status, count: 1, durationSum: durationMs });
}

export function installMetrics(app: FastifyInstance, ctx: AppContext): void {
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions?.url ?? request.url.split("?")[0] ?? "unknown";
    if (route === "/metrics") return;
    recordHttpRequest(request.method, route, reply.statusCode, reply.elapsedTime ?? 0);
  });

  app.get("/metrics", async (request, reply) => {
    const token = ctx.env.METRICS_TOKEN;
    if (token) {
      const auth = request.headers.authorization;
      if (auth !== `Bearer ${token}`) {
        return reply.code(401).type("text/plain").send("unauthorized\n");
      }
    }
    const lines: string[] = [];
    lines.push("# HELP opendream_http_requests_total HTTP requests handled by control-plane");
    lines.push("# TYPE opendream_http_requests_total counter");
    for (const counter of counters.values()) {
      lines.push(`opendream_http_requests_total{method="${counter.method}",route="${counter.route.replace(/"/g, '\\"')}",status="${counter.status}"} ${counter.count}`);
    }
    lines.push("# HELP opendream_http_request_duration_seconds_sum Sum of request durations");
    lines.push("# TYPE opendream_http_request_duration_seconds_sum counter");
    for (const counter of counters.values()) {
      lines.push(`opendream_http_request_duration_seconds_sum{method="${counter.method}",route="${counter.route.replace(/"/g, '\\"')}",status="${counter.status}"} ${(counter.durationSum / 1000).toFixed(6)}`);
    }
    const workspaces = ctx.sqlite.query<{ state: string; c: number }, []>("SELECT state, COUNT(*) AS c FROM workspaces WHERE deleted_at IS NULL GROUP BY state").all();
    lines.push("# HELP opendream_workspaces Active workspaces by state");
    lines.push("# TYPE opendream_workspaces gauge");
    for (const row of workspaces) lines.push(`opendream_workspaces{state="${row.state}"} ${row.c}`);
    const providers = ctx.sqlite.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM model_providers WHERE enabled = 1").get();
    lines.push("# HELP opendream_model_providers_enabled Enabled model providers");
    lines.push("# TYPE opendream_model_providers_enabled gauge");
    lines.push(`opendream_model_providers_enabled ${providers?.c ?? 0}`);
    const outbox = ctx.sqlite.query<{ status: string; c: number }, []>("SELECT status, COUNT(*) AS c FROM outbox_events GROUP BY status").all();
    lines.push("# HELP opendream_outbox_events Outbox events by status");
    lines.push("# TYPE opendream_outbox_events gauge");
    for (const row of outbox) lines.push(`opendream_outbox_events{status="${row.status}"} ${row.c}`);
    return reply.type("text/plain; version=0.0.4").send(`${lines.join("\n")}\n`);
  });
}
