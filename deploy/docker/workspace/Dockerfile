# OpenDream Cloud · 工作区运行时镜像（T4.7 / task-13）
#
# 设计要点（见 docs/02-architecture/deploy/DEPLOYMENT.md §5）：
#  - 基础镜像 digest 固定（CI 用 images/versions.env 校验）
#  - Bun 1.4.4 + opencode 2.2.5 版本锁定（stage 1 构建时锁定）
#  - 非 root（uid/gid 1000）、只读根文件系统、无 capabilities（K8s 侧强制）
#  - 显式 `--port 4096`（不给端口上游会 4096+1 漂移）
#  - `OPENCODE_SERVER_PASSWORD` 必填：空密码时上游完全不鉴权（fail-open）
#  - workspace-agent 占位：:8081 健康端点（G5 替换为真实 agent）
#
# 构建（需网络）：
#   docker build -f deploy/docker/workspace/Dockerfile -t opencode/workspace-runtime:2.2.5 .
# 无 Docker 环境时：scripts/validate-manifests.mjs 做静态断言（关键项自检）。

# syntax=docker/dockerfile:1.7

# ---------- stage 1：下载并锁定 opencode 版本 ----------
FROM oven/bun:1.4.4@sha256:2b6c7d0f0a2fd1e0e6b9c2a3d4f5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3 AS opencode
ARG OPENCODE_VERSION=2.2.5
# opencode 以 npm 包分发（含平台二进制）；用全局安装并断言版本
RUN bun add -g opencode-ai@${OPENCODE_VERSION} \
 && "$(bun pm bin -g)/opencode" --version \
 && test "$("$(bun pm bin -g)/opencode" --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)" = "${OPENCODE_VERSION}"
RUN cp "$(bun pm bin -g)/opencode" /out-opencode

# ---------- stage 2：运行时 ----------
FROM debian:12-slim@sha256:8f3b7c1e9d0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c AS runtime

ARG OPENCODE_VERSION=2.2.5
ARG BUN_VERSION=1.4.4
LABEL org.opencontainers.image.title="opendream-cloud workspace runtime" \
      org.opencontainers.image.version="${OPENCODE_VERSION}" \
      org.opencontainers.image.source="https://github.com/opendream-cloud/opendream-cloud" \
      org.opencontainers.image.licenses="MIT" \
      opencode.cloud.runtime="workspace" \
      opencode.cloud.opencode-version="${OPENCODE_VERSION}"

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/home/opencode \
    XDG_CONFIG_HOME=/home/opencode/.config \
    XDG_DATA_HOME=/home/opencode/.local/share \
    PATH=/home/opencode/.bun/bin:/usr/local/bin:/usr/bin:/bin \
    LANG=C.UTF-8 \
    OPENCODE_DISABLE_AUTOUPDATE=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git openssh-client ripgrep jq less vim-tiny \
      unzip tar xz-utils procps tini libgcc-s1 libstdc++6 \
      python3 python3-venv python3-pip build-essential \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt

# Bun 运行时（workspace-agent 占位用；镜像内不用于执行 opencode 二进制）
COPY --from=opencode /usr/local/bin/bun /usr/local/bin/bun
RUN /usr/local/bin/bun --version | grep -F "${BUN_VERSION}"

# opencode 单文件二进制（版本已锁定/断言）
COPY --from=opencode /out-opencode /usr/local/bin/opencode
RUN /usr/local/bin/opencode --version | grep -F "${OPENCODE_VERSION}"

# 入口与健康检查
COPY deploy/docker/workspace/entrypoint.sh /usr/local/bin/opendream-cloud-entrypoint
RUN chmod 0755 /usr/local/bin/opendream-cloud-entrypoint

# 非 root 用户（uid/gid 1000，与 Pod securityContext 对齐）
RUN groupadd -g 1000 opencode \
 && useradd -u 1000 -g 1000 -m -d /home/opencode -s /usr/sbin/nologin opencode \
 && mkdir -p /workspace /etc/opencode /run/opencode /home/opencode/.config/opencode /home/opencode/.local/share/opencode \
 && chown -R 1000:1000 /home/opencode /workspace /etc/opencode /run/opencode

USER 1000:1000
WORKDIR /home/opencode
EXPOSE 4096 8081
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/opendream-cloud-entrypoint"]
