# Security Policy

## 支持范围

当前为 **Alpha**，不提供生产级安全保证。仅对最新 `main` 分支接受安全修复。

## 报告漏洞

请通过 GitHub Security Advisory（私有）或邮件联系维护者 `suhong`，不要公开提交可利用细节。请包含：

- 影响版本/commit
- 复现步骤
- 影响（越权/密钥泄露/RCE 等）
- 建议修复

## 已知安全边界（Alpha）

- dev-login 仅用于本地开发，生产必须接企业 IdP；
- 多数服务使用内存 store，重启丢失，不适合多租户生产；
- 本地 compose 中的密钥/密码为演示值，禁止用于生产；
- MCP Ticket 本地使用开发密钥，生产必须 EdDSA + KMS/JWKS 轮换；
- 模型 API Key 使用本地 AES-GCM，生产建议 KMS/Vault；
- 无 WAF/速率限制/审计留存合规承诺。

## 安全默认值

- 不提交真实密钥；新增配置使用 `.env.example` 占位；
- 服务默认仅内网访问，对外经 control-plane 门面；
- 破坏性 MCP 工具需显式 `destructive` 标记；
- 人工门禁用于高风险 Agent/工作流操作。
