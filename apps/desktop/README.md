# OpenDream Code 桌面端

OpenDream 的**本地工具引擎**（Electron），与云端工作区组成双引擎：

- 云端：托管工作区、应用中心、团队协作、审计
- 桌面端：本地文件/终端/Git、opencode 本地引擎；**不含应用中心**
- 模型：从云端模型中心自动同步到 `~/.config/opencode/opencode.json`，请求经控制面模型代理，本机不落 Provider API Key
- MCP：自动写入配置，首次使用由 `npx` 自动安装（filesystem/memory/sequential-thinking + 云端已发布 MCP）

## 开发

```bash
cd apps/desktop
npm install
npm start
```

需要本机已安装 `opencode`（`npm i -g @opencode/cli`），或在环境变量中指定：

```bash
OPENCODE_BIN=C:\path\to\opencode.exe
```

## 配对流

1. 控制台 → 设备与桌面端 → 「生成配对码」
2. 桌面端填写云端地址与配对码 → 连接
3. 「同步模型与 MCP」→ 写入本地 opencode 配置
4. 「启动本地引擎」→ 打开本地工作台

## 打包

```bash
npm run dist:win
```

产物在 `apps/desktop/dist/`。

## 安装包分发

`npm run dist:win` 生成 `dist/OpenDreamCode-Setup-0.1.0.exe`，复制到
`apps/console/public/downloads/OpenDreamCode-Setup.exe`；生产建议上传制品库/CDN，由 IT 统一分发。

## 安全

- 设备使用独立 token（`odc_…`），可在控制台随时断开
- 桌面端只保存设备 token；模型 Provider Key 不落本机，由控制面代理注入
- 桌面端不代理云端应用中心，不会拉取云端应用代码
