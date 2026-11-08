// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
const $ = (id) => document.getElementById(id);
const logEl = $("log");
let paired = false;
let localUrl = null;

function log(message, tone = "") {
  const line = document.createElement("div");
  if (tone) line.className = tone;
  line.textContent = `[${new Date().toLocaleTimeString("zh-CN")}] ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function setBadge(text, ok = false) {
  const badge = $("conn-badge");
  badge.textContent = text;
  badge.classList.toggle("ok", ok);
}

function enableAfterPair() {
  paired = true;
  $("sync").disabled = false;
  $("pair-code").value = "";
  $("pair-code").placeholder = "已配对";
}

async function init() {
  const config = await window.opendream.config();
  if (config.apiUrl) $("api-url").value = config.apiUrl;
  if (config.paired) {
    enableAfterPair();
    setBadge("已配对 · 待同步", true);
    log(`已连接设备：${config.deviceId || "已配对"}`, "ok");
  }
}

$("pick-dir").addEventListener("click", async () => {
  const dir = await window.opendream.pickDir();
  if (dir) $("workspace").value = dir;
});

$("pair").addEventListener("click", async () => {
  const apiUrl = $("api-url").value.trim();
  const code = $("pair-code").value.trim();
  if (!apiUrl || !code) return log("请填写云端地址与配对码", "err");
  log("正在配对…");
  try {
    const result = await window.opendream.pair({ apiUrl, code, name: navigator.userAgent.includes("Windows") ? "Windows 桌面端" : "Desktop" });
    enableAfterPair();
    setBadge("已配对", true);
    log(`配对成功：${result.deviceId}`, "ok");
  } catch (error) {
    log(error.message || String(error), "err");
  }
});

$("sync").addEventListener("click", async () => {
  if (!paired) return log("请先完成配对", "err");
  const workspaceDir = $("workspace").value.trim();
  if (!workspaceDir) return log("请选择本地项目目录", "err");
  log("正在从云端模型中心同步配置…");
  try {
    const result = await window.opendream.bootstrap({ workspaceDir });
    $("sync-result").hidden = false;
    $("default-model").textContent = result.defaultModel || "—";
    $("config-file").textContent = result.configFile;
    $("models").innerHTML = result.models.map((m) => `<span class="chip">${m.provider_name} / ${m.display_name}</span>`).join("");
    $("mcp").innerHTML = result.mcp.map((name) => `<span class="chip mcp">MCP · ${name}</span>`).join("");
    $("start").disabled = false;
    log(`同步完成：${result.models.length} 个模型，${result.mcp.length} 个 MCP；配置已写入`, "ok");
  } catch (error) {
    log(error.message || String(error), "err");
  }
});

$("start").addEventListener("click", async () => {
  const workspaceDir = $("workspace").value.trim();
  log("正在启动本地 opencode 引擎…");
  try {
    const result = await window.opendream.start({ workspaceDir });
    localUrl = result.url;
    $("open-local").disabled = false;
    $("engine-dot").classList.add("on");
    $("engine-text").textContent = `本地引擎运行中 · ${result.url}`;
    log(`本地引擎已启动：${result.url}`, "ok");
  } catch (error) {
    log(error.message || String(error), "err");
  }
});

$("open-local").addEventListener("click", () => {
  if (localUrl) void window.opendream.openLocal(localUrl);
});

void init();
