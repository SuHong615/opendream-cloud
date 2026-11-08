#!/bin/sh
# OpenDream Cloud workspace entrypoint（task-13 占位版；G5 由 workspace-agent 接管）
#
# 契约：
#  - OPENCODE_SERVER_PASSWORD 必填且非空（空密码 = 上游完全不鉴权，必须 fail-closed）
#  - 显式 --hostname 0.0.0.0 --port 4096（不传端口会 4096+1 漂移）
#  - :8081 提供 /healthz /startupz /livez（占位 agent；K8s 探针指向这里）
#  - SIGTERM 转发给 opencode，优雅退出
set -eu

: "${OPENCODE_SERVER_PASSWORD:?OPENCODE_SERVER_PASSWORD must be set and non-empty (empty password disables upstream auth)}"

OPENCODE_PORT="${OPENCODE_PORT:-4096}"
OPENCODE_HOSTNAME="${OPENCODE_HOSTNAME:-0.0.0.0}"
AGENT_HEALTH_PORT="${AGENT_HEALTH_PORT:-8081}"
WORKSPACE_ID="${WORKSPACE_ID:-unknown}"

# 防御：不允许非预期端口（避免上游自动 +1 导致 Service/探针漂移）
case "$OPENCODE_PORT" in
  4096) ;;
  *) echo "[entrypoint] FATAL: OPENCODE_PORT must be 4096 (got $OPENCODE_PORT)" >&2; exit 1 ;;
esac

log() { echo "[entrypoint] $*"; }

# ---- 占位 workspace-agent：健康端点（G5 替换为真实 agent，含配置/技能/MCP 同步）----
/usr/local/bin/bun -e '
const port = Number(process.env.AGENT_HEALTH_PORT ?? 8081);
Bun.serve({
  port,
  hostname: "127.0.0.1",
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/healthz" || path === "/startupz" || path === "/livez" || path === "/health") {
      return Response.json({
        status: "ok",
        ready: true,
        placeholder: true,
        workspace_id: process.env.WORKSPACE_ID ?? "unknown",
        opencode: { status: "starting", version: process.env.OPENCODE_VERSION ?? "unknown" },
      });
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`[agent-placeholder] health server on 127.0.0.1:${port}`);
' &
AGENT_PID=$!
log "agent placeholder pid=$AGENT_PID port=$AGENT_HEALTH_PORT"

# ---- 优雅停机：把 SIGTERM/SIGINT 转发给 opencode ----
OPENCODE_PID=""
term() {
  log "received signal, stopping opencode (pid=${OPENCODE_PID:-none})"
  if [ -n "$OPENCODE_PID" ] && kill -0 "$OPENCODE_PID" 2>/dev/null; then
    kill -TERM "$OPENCODE_PID" 2>/dev/null || true
    wait "$OPENCODE_PID" 2>/dev/null || true
  fi
  kill -TERM "$AGENT_PID" 2>/dev/null || true
  exit 0
}
trap term INT TERM

log "starting opencode serve on ${OPENCODE_HOSTNAME}:${OPENCODE_PORT} (workspace=${WORKSPACE_ID})"
# 直接以后台子进程启动 opencode，由下面的 trap 转发信号（无 tini 依赖）。
/usr/local/bin/opencode serve \
  --hostname "$OPENCODE_HOSTNAME" \
  --port "$OPENCODE_PORT" &
OPENCODE_PID=$!

wait "$OPENCODE_PID"
STATUS=$?
log "opencode exited with status=$STATUS"
kill -TERM "$AGENT_PID" 2>/dev/null || true
exit "$STATUS"
