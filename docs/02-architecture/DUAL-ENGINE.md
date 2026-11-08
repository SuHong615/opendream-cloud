# 双引擎架构：OpenDream Cloud + OpenDream Code 桌面端

## 1. 目标

把 OpenDream 从“云端控制台”扩展为 **云 + 桌面双引擎**：

| 引擎 | 定位 | 能力 |
| --- | --- | --- |
| **OpenDream Cloud** | 托管与协作 | 云端工作区、应用中心、Skill/评测/工作流、审计与组织治理 |
| **OpenDream Code（桌面端）** | 本地工具 | 本地文件/终端/Git、本地 opencode 引擎、模型与 MCP 自动配置 |

桌面端**不包含应用中心**（不做云端应用运行/发布），只做本地编码工具，避免与云端应用生命周期耦合。

## 2. 企业门户（Portal）

企业门户是**独立于控制台的公开入口**，位于站点根路径 `/`：

- 展示 OpenDream Cloud 云端能力、OpenDream Code 桌面端介绍、下载链接、企业场景与安全治理；
- 右上角「控制台」→ `/workspaces`，未登录自动跳转 `/login`，登录后进入原有全部功能；
- 门户不嵌在控制台 AppShell 内，不使用控制台侧边栏；
- 桌面端配对属于登录后的控制台能力，位于 `/devices`（设备与桌面端）；
- 生产可把门户拆为独立静态站点/CDN，控制台独立域名或子路径；MVP 同一 Next.js 应用内以公共路由实现。

## 3. 配对与设备身份

```
控制台(已登录) ──POST /api/v1/desktop/pairings──▶ 返回配对码
桌面端 ──POST /api/v1/desktop/pairings/claim──▶ 返回设备 token（odc_…）
桌面端 ──GET  /api/v1/desktop/bootstrap (Bearer)──▶ 模型配置 + MCP 配置
```

- 配对码只存 hash，10 分钟过期，一次性使用；
- 设备 token 只存 SHA-256，可单独吊销；
- 桌面端 token 不能访问普通控制台 API（仅 desktop 路由），权限最小化；
- 模型请求经控制面代理，Provider API Key 不落桌面端；代理仅接受设备 token，按 provider 白名单转发。

## 4. 模型自动配置

- 复用控制面 `generateOpencodeConfig()`：从模型中心读取当前组织的 provider/model；
- 生成标准 opencode v2 配置（`providers` / `model` / `disabled_providers`）；
- 桌面端配置的 `baseURL` 指向控制面模型代理 `/api/v1/desktop/model-proxy/{providerId}`，`apiKey` 为设备 token；
- Provider 真实 Key 只在控制面内存/加密存储中使用，**不下发到桌面端**；
- 默认模型按「组织启用 → 全局启用 → 第一个可用」选择。

## 5. MCP 自动安装

bootstrap 返回 opencode `mcp` 配置：

- 内置本地 MCP（首次启动由 `npx -y` 拉取）：
  - `filesystem`（工作目录）
  - `memory`
  - `sequential-thinking`
- 云端 MCP：从 mcp-hub 读取当前组织可见且有 endpoint 的 server，映射为 `remote` 类型；
- 桌面端与云端共享同一套 MCP 注册表，避免重复配置。

## 6. 本地引擎

- 桌面端启动本机 `opencode serve --port 4096`；
- 工作目录由用户选择，本地文件不离开本机；
- 桌面端不代理云端应用中心，不拉取云端应用代码；
- `OPENCODE_BIN` 可指定本地 opencode 可执行文件。

## 7. API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/desktop/pairings` | 生成配对码（session + CSRF，控制台 /devices 使用） |
| POST | `/api/v1/desktop/pairings/claim` | 配对码换设备 token |
| GET | `/api/v1/desktop/devices` | 设备列表 |
| DELETE | `/api/v1/desktop/devices/{id}` | 吊销设备 |
| GET | `/api/v1/desktop/bootstrap` | 模型 + MCP 配置（device token；模型指向控制面代理） |
| ALL | `/api/v1/desktop/model-proxy/{providerId}/*` | 模型请求代理，注入 Provider Key，不下发桌面端 |
| POST | `/api/v1/desktop/heartbeat` | 在线心跳 |

## 8. 安全边界

- 设备 token 与用户 session 分离；
- 吊销立即生效；
- 桌面端配置文件 0600；
- 配对码一次性、限时；
- 生产建议：设备 token 加短期过期 + 刷新；模型 Key 改用云端网关代理（避免本机落盘）。

## 9. 后续

1. 桌面端自动更新与代码签名（Windows Authenticode）。
2. 模型 Key 改为云端网关短期 token（不落本机）。
3. 设备策略：允许的模型、MCP、工作目录白名单。
4. 桌面端 telemetry（匿名、可关闭）。
