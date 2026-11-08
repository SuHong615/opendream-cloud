#!/usr/bin/env bun
/**
 * 本地 compose 静态校验（task-43）：
 *  - 解析 `deploy/local/docker-compose.yml`（Bun.YAML，无需 Docker）；
 *  - 校验新增服务 workflow-engine:4105 / digital-human:4106 的 build/ports/healthcheck/depends_on；
 *  - 校验 control-plane 注入 WORKFLOW_URL / DIGITAL_HUMAN_URL；
 *  - 校验端口唯一、depends_on 目标存在、healthcheck 命令非空。
 *
 * 用途：`bun run deploy/local/validate-compose.mjs`（docker 不可用时的 DEGRADED 证据；
 *       docker 可用时仍应跑 `docker compose -f deploy/local/docker-compose.yml config`）。
 * 退出码：0=通过；1=失败。
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const COMPOSE = join(ROOT, "deploy/local/docker-compose.yml");
const problems = [];
const notes = [];

if (!existsSync(COMPOSE)) {
  console.error(`[validate-compose] missing ${COMPOSE}`);
  process.exit(1);
}
const doc = Bun.YAML.parse(readFileSync(COMPOSE, "utf8"));
const services = doc?.services ?? {};
const names = Object.keys(services);

const requireService = (name, port, dockerfile, { requireControlPlaneDep = true } = {}) => {
  const svc = services[name];
  if (!svc) {
    problems.push(`missing service: ${name}`);
    return;
  }
  if (svc.build?.dockerfile !== dockerfile) problems.push(`${name}.build.dockerfile != ${dockerfile}`);
  if (svc.build?.context !== "../..") problems.push(`${name}.build.context != ../..`);
  const portMaps = (svc.ports ?? []).map(String);
  if (!portMaps.some((p) => p.startsWith(`${port}:`))) problems.push(`${name}.ports missing ${port}`);
  if (!svc.environment?.PORT || String(svc.environment.PORT) !== String(port)) {
    problems.push(`${name}.environment.PORT != ${port}`);
  }
  if (!svc.healthcheck?.test) problems.push(`${name}.healthcheck.test missing`);
  else if (!JSON.stringify(svc.healthcheck.test).includes(String(port))) {
    problems.push(`${name}.healthcheck not targeting :${port}`);
  }
  if (requireControlPlaneDep && !svc.depends_on?.["control-plane"]) {
    problems.push(`${name}.depends_on missing control-plane`);
  }
};

requireService("workflow-engine", "4105", "deploy/local/Dockerfile.workflow-engine");
requireService("digital-human", "4106", "deploy/local/Dockerfile.digital-human");
// memory-service 独立启动（不依赖 control-plane），仅健康检查
requireService("memory-service", "4107", "deploy/local/Dockerfile.memory-service", {
  requireControlPlaneDep: false,
});

// 服务代码并行开发：目录暂缺时只提示（compose 仍可校验），不阻塞
for (const name of ["workflow-engine", "digital-human", "memory-service"]) {
  if (!existsSync(join(ROOT, "services", name))) {
    notes.push(`services/${name} 尚未落盘（代码并行开发）；Dockerfile/compose 已就绪`);
  }
}

// control-plane 注入
const cpEnv = services["control-plane"]?.environment ?? {};
if (cpEnv.WORKFLOW_URL !== "http://workflow-engine:4105") problems.push("control-plane.WORKFLOW_URL mismatch");
if (cpEnv.DIGITAL_HUMAN_URL !== "http://digital-human:4106") problems.push("control-plane.DIGITAL_HUMAN_URL mismatch");
if (cpEnv.EVAL_CENTER_URL !== "http://eval-center:4102") problems.push("control-plane.EVAL_CENTER_URL mismatch");
if (cpEnv.MEMORY_URL !== "http://memory-service:4107") problems.push("control-plane.MEMORY_URL mismatch");
if (cpEnv.MEMORY_API_KEY !== "local-memory-key") problems.push("control-plane.MEMORY_API_KEY mismatch");

// 端口唯一性
const portSeen = new Map();
for (const [name, svc] of Object.entries(services)) {
  for (const p of (svc.ports ?? []).map(String)) {
    const hostPort = p.split(":")[0];
    if (portSeen.has(hostPort)) problems.push(`duplicate host port ${hostPort}: ${portSeen.get(hostPort)} & ${name}`);
    else portSeen.set(hostPort, name);
  }
}

// depends_on 目标存在
for (const [name, svc] of Object.entries(services)) {
  for (const dep of Object.keys(svc.depends_on ?? {})) {
    if (!services[dep]) problems.push(`${name}.depends_on -> ${dep} (service not found)`);
  }
}

// Dockerfile 存在
for (const rel of [
  "deploy/local/Dockerfile.workflow-engine",
  "deploy/local/Dockerfile.digital-human",
  "deploy/local/Dockerfile.memory-service",
]) {
  if (!existsSync(join(ROOT, rel))) problems.push(`dockerfile missing: ${rel}`);
}

notes.push(`services: ${names.length} (${names.join(", ")})`);

console.log(`[validate-compose] YAML parsed: ${COMPOSE}`);
for (const n of notes) console.log(`  · ${n}`);
if (problems.length > 0) {
  console.error(`\n[validate-compose] FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log("[validate-compose] ok（workflow-engine:4105 / digital-human:4106 已接入；control-plane 门面注入就绪）");
