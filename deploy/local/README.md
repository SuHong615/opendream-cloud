# 本地部署（D 盘 / Docker / 不依赖阿里云）

目标：在你的 Windows 本机把整套 OpenDream Cloud 跑起来，所有程序、数据、镜像都落在 **D 盘**，不依赖任何云服务。

## 1. 本机 Docker 方案

Windows 上安装 Docker Desktop 需要管理员权限且默认写 C 盘。本次采用等价方案：

- 导入一个 **WSL2 发行版** `opencode-docker`，磁盘文件在 **`D:\wsl\opencode-docker\ext4.vhdx`**；
- 在发行版内安装 Docker Engine 26.1.5 + Compose v2；
- Docker 数据目录：`/var/lib/docker`（即上述 VHD 内，物理位置 D 盘）；
- 镜像仓库镜像：`https://docker.m.daocloud.io`（国内可访问）。

验证：

```powershell
wsl -d opencode-docker -u root -- sh -c "docker info --format '{{.ServerVersion}} root={{.DockerRootDir}}'"
# 26.1.5 root=/var/lib/docker
```

## 2. 一键启动 / 停止

```powershell
# 启动 Docker Engine + 整栈
powershell -ExecutionPolicy Bypass -File D:\opencode\deploy\local\start.ps1

# 停止
powershell -ExecutionPolicy Bypass -File D:\opencode\deploy\local\stop.ps1
```

手动方式：

```bash
wsl -d opencode-docker -u root -- sh -c "pgrep dockerd >/dev/null || (nohup dockerd >/var/log/dockerd.log 2>&1 &); sleep 5"
wsl -d opencode-docker -u root -- sh -c "cd /mnt/d/opencode/deploy/local && docker compose up -d --build"
```

## 3. 服务与端口

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| 控制台 | http://localhost:3000 | 登录任意邮箱（dev-login） |
| 控制面 API | http://localhost:4000 | `/healthz`、`/api/v1/*` |
| opencode 工作区 | http://localhost:4096 | Basic `opencode` / `Local-Demo-Pass-123` |
| 工作区网关 | http://localhost:8080 | 控制台"进入工作区"链接 `http://w-<id>.localhost:8080/`（`*.localhost` → 127.0.0.1） |
| Skill 中心 | http://localhost:4101 | `/healthz` |
| 评测中心 | http://localhost:4102 | |
| 应用中心 | http://localhost:4103 | |
| MCP 中心 | http://localhost:4104 | |
| 工作流引擎（内网） | http://localhost:4105 | `/healthz`；对外只经 control-plane 门面 `/api/v1/workflows/*` |
| 数字人控制面（内网） | http://localhost:4106 | `/healthz`；对外只经 control-plane 门面 `/api/v1/dh/*`（RTC 媒体流本地不启用） |
| 记忆服务（内网） | http://localhost:4107 | `/healthz`；对外只经 control-plane 门面 `/api/v1/memory/*`（内部 `MEMORY_API_KEY`） |

> **v3 新服务路由决策（task-43）**：`workflow-engine`、`digital-human` **只经 control-plane 门面**暴露（`/api/v1/workflows/*`、`/api/v1/dh/*`），
> **不新增** local-gateway 的 `/workflows/*`、`/dh/*` 直路由（避免绕开 RBAC/审计）。生产同理：Higress 只把 `api.<domain>` 路由到 control-plane。
> 本地 compose 静态校验：`bun run deploy/local/validate-compose.mjs`；真实 compose 校验：`docker compose config -q`（WSL `opencode-docker`）。
| 企业模型占位（mock-model） | http://localhost:9100 | OpenAI 兼容，Bearer `sk-mock-key`；模型中心「测试连通」用 |

快速验证：

```powershell
curl.exe http://localhost:4000/healthz
curl.exe -u "opencode:Local-Demo-Pass-123" http://localhost:4096/api/info
bun scripts/smoke-api.ts http://localhost:4000
```

## 4. 数据持久化位置

| 数据 | Docker volume | 物理位置 |
| --- | --- | --- |
| 控制面 SQLite | `cp-data` | `D:\wsl\opencode-docker\ext4.vhdx` 内 |
| 工作区 home/项目 | `ws-home` / `ws-project` | 同上 |
| 镜像层 | `/var/lib/docker` | 同上 |

WSL 发行版整体可备份：`wsl --export opencode-docker D:\wsl\opencode-docker-backup.tar`。

## 5. 资源与限制

- WSL 默认分配约 8GB 内存、CPU 按宿主；如需调整，可在 **`C:\Users\<you>\.wslconfig`** 写：
  ```ini
  [wsl2]
  memory=12GB
  processors=8
  ```
  然后 `wsl --shutdown` 重启（这是 WSL 全局配置，不在 D 盘）。
- 本机未启用 gVisor/Kata、未接真实 OIDC/LiteLLM；控制面使用 SQLite 单副本（ADR-016 的 MVP 降级）。
- 端口若被占用，改 `docker-compose.yml` 左侧端口映射即可。

## 6. 清理

```powershell
powershell -ExecutionPolicy Bypass -File D:\opencode\deploy\local\stop.ps1
# 彻底删除（含数据卷/镜像）
wsl -d opencode-docker -u root -- sh -c "cd /mnt/d/opencode/deploy/local && docker compose down -v --rmi local"
# 删除 WSL 发行版（会删除 D:\wsl\opencode-docker 下的 VHD）
wsl --unregister opencode-docker
```
