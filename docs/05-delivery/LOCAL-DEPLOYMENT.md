# 本地 Docker 部署验证（D 盘 / 不依赖阿里云）

> 2026-11-07 实机验证：Windows 11 本机，仅使用 D 盘与本地网络，未调用任何云服务。

## 1. 安装位置（全部在 D 盘）

| 项 | 位置 |
| --- | --- |
| Docker Engine 运行环境 | WSL2 发行版 `opencode-docker`，磁盘 `D:\wsl\opencode-docker\ext4.vhdx` |
| Docker 数据（镜像/卷） | `/var/lib/docker`（同上 VHD 内） |
| 项目源码 / Compose / 脚本 | `D:\opencode` |
| 镜像仓库镜像 | `docker.m.daocloud.io`（国内直连） |

Docker 26.1.5 + Compose v2.27.0，`docker info` 显示 `root=/var/lib/docker`（位于 D 盘 VHD）。
> 未使用 Docker Desktop（其安装需要管理员权限且默认落 C 盘）；改用 WSL2 + Docker Engine 等价方案，满足"本机安装到 D 盘"。

## 2. 启动

```powershell
powershell -ExecutionPolicy Bypass -File D:\opencode\deploy\local\start.ps1
```

或手动：

```bash
wsl -d opencode-docker -u root -- sh -c "pgrep dockerd >/dev/null || (nohup dockerd >/var/log/dockerd.log 2>&1 &)"
wsl -d opencode-docker -u root -- sh -c "cd /mnt/d/opencode/deploy/local && docker compose up -d --build"
```

## 3. 实测结果（2026-11-07）

`docker compose ps`：7 个容器全部 `Up`（其中 6 个 healthy，workspace 后也 healthy）：

| 服务 | 端到端验证 |
| --- | --- |
| control-plane :4000 | `/healthz` 200；`bun scripts/smoke-api.ts http://localhost:4000` → **17/17 PASS** |
| console :3000 | `/login` 200；Playwright 真实浏览器 **2/2 PASS**（登录→工作区列表→创建→ready→详情） |
| skill-center :4101 | `/healthz` 200；未知路由 404 两层错误 |
| eval-center :4102 | `/healthz` 200 |
| app-center :4103 | `/healthz` 200 |
| mcp-hub :4104 | `/healthz` 200 |
| workspace :4096 | 无认证 401；Basic 认证 `/api/info` 200（opencode **v2.2.5**）；Web UI 200 |
| gateway :8080 | 工作区访问 `http://w-<id>.localhost:8080/?__ticket=...` → 200 / title=OpenCode |

截图：

- 控制台工作区页：[console-workspaces.png](evidence/local/console-workspaces.png)
- opencode 工作区 UI（网关访问）：[gateway-access.png](evidence/local/gateway-access.png)

## 3.5 模型中心（企业/第三方模型，opencode 不依赖自带模型）

本地栈新增 **mock 企业模型**（OpenAI 兼容）与 **模型配置下发**：

| 组件 | 说明 |
| --- | --- |
| `mock-model` :9100 | `GET /v1/models`（3 个模型）、`POST /v1/chat/completions`；Bearer `sk-mock-key` |
| 控制面 | provider CRUD / test / activate / config preview；API Key AES-256-GCM 加密，接口只回 `sk-****` |
| 共享卷 `oc-config` | 控制面写 `/shared/opencode.json`，workspace 挂载到 `/home/opencode/.config/opencode/` |
| 生成配置 | `providers.<key>` + `settings.baseURL/apiKey` + `models`；`disabled_providers:["opencode"]` 禁用内置模型 |

实测链路（`bun run scripts/verify/model-center-e2e.mjs http://localhost:4000` → **17/17 PASS**）：

1. `/models` 添加供应商（预设 / Base URL / API Key / 模型 / 默认模型）；
2. 「测试连通」→ 拉取模型（mock-model 3 个）；
3. 「设为默认」→ active 唯一；
4. 配置预览：root config、apiKey 掩码、`disabled_providers:["opencode"]`；
5. 工作区 `/api/model` 自动加载企业模型（`gpt-4o-mini` / `qwen2.5-coder-32b`），内置 opencode 模型消失。

重置模型中心数据（清空供应商与下发配置）：

```bash
wsl -d opencode-docker -u root -- sh -c "cd /mnt/d/opencode/deploy/local && docker compose down control-plane workspace && docker volume rm opendream-cloud-local_cp-data opendream-cloud-local_oc-config && docker compose up -d"
```

## 4. 与云版本的差异

| 项 | 本地 | 云端（ACK） |
| --- | --- | --- |
| 编排 | Docker Compose | Kubernetes / Operator |
| 资源 | WSL 8GB，未做 4C8G 硬限制 | 4C8G requests=limits、Guaranteed |
| 存储 | Docker volume（D 盘 VHD） | PVC / ESSD（当前账号余额不足未验证） |
| SSO | dev-login | OIDC（待接 IdP） |
| 模型 | Mock LiteLLM | 真实 LiteLLM（待接供应商） |
| 沙箱 | 无 gVisor | ACK RuntimeClass（集群未提供） |

## 5. 停止 / 数据清理

```powershell
powershell -ExecutionPolicy Bypass -File D:\opencode\deploy\local\stop.ps1   # 保留数据
wsl -d opencode-docker -u root -- sh -c "cd /mnt/d/opencode/deploy/local && docker compose down -v"  # 删数据卷
```

Docker 引擎随 WSL 关闭：`wsl --shutdown`；再次启动执行 start.ps1 即可。

## 6. 已修复：控制台"进入工作区" ERR_CONNECTION_ABORTED

**现象**：控制台点击进入工作区，打开 `https://w-<id>.ws.opencode.local/?__ticket=...`，浏览器报 `ERR_CONNECTION_ABORTED`。

**根因**：
1. 控制面按云端设计生成 `https://w-<id>.ws.opencode.local/`，本地没有 DNS/Ingress/证书；
2. 本地栈缺少工作区网关（ticket → 上游 Basic 注入）；
3. 网关初版转发上游 `Content-Encoding: br` 但 Bun fetch 已解压响应体，浏览器按 br 解码失败/挂起。

**修复**：
1. 新增 `services/local-gateway`（Bun 反向代理，注入 Basic、剥离压缩/长度头、按 Host 转发），Compose 暴露 :8080；
2. 控制面本地配置 `WORKSPACE_HOST_SUFFIX=localhost:8080`、`WORKSPACE_URL_SCHEME=http`，每个工作区生成唯一 host `w-<id>.localhost:8080`（`*.localhost` 由浏览器解析到 127.0.0.1）；
3. 网关删除 `content-encoding/content-length/transfer-encoding`，修复 UI 加载挂起。

**验证**：

```powershell
$url = (bun run scripts/verify/check-local-workspace-url.mjs http://localhost:4000 | ConvertFrom-Json).url
bun run scripts/verify/check-local-url-browser.mjs $url   # goto 200 / title=OpenCode
```

结果：URL 返回 200、opencode Web UI 正常加载（截图 `evidence/local/gateway-access.png`）。
