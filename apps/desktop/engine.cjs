// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

let child = null;

function configPath(userDataDir) {
  return path.join(userDataDir, "config.json");
}

function loadConfig(userDataDir) {
  try {
    return JSON.parse(fs.readFileSync(configPath(userDataDir), "utf8"));
  } catch {
    return { apiUrl: "http://localhost:4000", token: null, deviceId: null };
  }
}

function saveConfig(userDataDir, config) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(configPath(userDataDir), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function normalizeApi(input) {
  const raw = String(input || "").trim().replace(/\/+$/u, "");
  if (!/^https?:\/\//u.test(raw)) throw new Error("云端地址必须以 http:// 或 https:// 开头");
  return raw;
}

async function pair(apiUrl, code, name, platform, userDataDir) {
  const base = normalizeApi(apiUrl);
  const response = await fetch(`${base}/api/v1/desktop/pairings/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: String(code).trim().toUpperCase(), name: name || os.hostname(), platform: platform || process.platform }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `配对失败（${response.status}）`);
  const config = {
    apiUrl: base,
    token: body.token,
    deviceId: body.device_id,
    consoleUrl: body.console_url || base,
    pairedAt: new Date().toISOString(),
  };
  saveConfig(userDataDir, config);
  return { ...config, token: `${body.token.slice(0, 12)}…` };
}
function opencodeConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR;
  return path.join(os.homedir(), ".config", "opencode");
}

async function bootstrap(config, workspaceDir) {
  if (!config.token) throw new Error("请先完成云端配对");
  const dir = workspaceDir || process.cwd();
  const target = `${normalizeApi(config.apiUrl)}/api/v1/desktop/bootstrap?workspace_dir=${encodeURIComponent(dir)}`;
  const response = await fetch(target, { headers: { authorization: `Bearer ${config.token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `同步失败（${response.status}）`);
  const configDir = opencodeConfigDir();
  fs.mkdirSync(configDir, { recursive: true });
  const configFile = path.join(configDir, "opencode.json");
  fs.writeFileSync(configFile, `${JSON.stringify(body.opencode, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return {
    configFile,
    models: body.models || [],
    mcp: Object.keys(body.opencode?.mcp || {}),
    defaultModel: body.opencode?.model || "",
    syncedAt: body.synced_at,
  };
}

function findOpencode() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["opencode"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/u)[0];
  const candidates = [
    path.join(os.homedir(), ".bun", "bin", process.platform === "win32" ? "opencode.exe" : "opencode"),
    path.join(os.homedir(), ".opencode", "bin", process.platform === "win32" ? "opencode.exe" : "opencode"),
    "/usr/local/bin/opencode",
    "/opt/homebrew/bin/opencode",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function waitForHealth(url, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return resolve();
      } catch {
        // 继续等待
      }
      if (Date.now() - started > timeoutMs) return reject(new Error("本地 opencode 引擎启动超时"));
      setTimeout(tick, 500);
    };
    void tick();
  });
}

async function startLocalEngine(config, workspaceDir, port = 4096) {
  const dir = workspaceDir || process.cwd();
  const bin = findOpencode();
  if (!bin) {
    throw new Error("未找到 opencode 可执行文件。请先安装：npm i -g @opencode/cli，或设置 OPENCODE_BIN 环境变量。");
  }
  fs.mkdirSync(dir, { recursive: true });
  if (child && !child.killed) {
    try { child.kill(); } catch { /* ignore */ }
  }
  child = spawn(bin, ["serve", "--port", String(port)], {
    cwd: dir,
    env: { ...process.env, OPENCODE_DISABLE_AUTOUPDATE: "1" },
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("exit", () => { child = null; });
  const url = `http://127.0.0.1:${port}`;
  await waitForHealth(url);
  return url;
}

function stopLocalEngine() {
  if (child && !child.killed) child.kill();
  child = null;
}

module.exports = { loadConfig, saveConfig, pair, bootstrap, startLocalEngine, stopLocalEngine, findOpencode, opencodeConfigDir };
