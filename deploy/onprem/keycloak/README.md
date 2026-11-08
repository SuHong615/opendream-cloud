# Keycloak（企业 IdP）接入

## 1. 启动 Keycloak

使用 `deploy/onprem/helmfile.yaml` 的 `keycloak` release，或用企业现有 IdP（AD/LDAP/Keycloak/IDaaS）。

## 2. 导入 Realm

```bash
kcadm.sh config credentials --server https://keycloak.example.com --realm master --user admin
kcadm.sh create realms -f deploy/onprem/keycloak/realm-opendream.json
```

生产环境务必：

- 修改 `demo` 用户密码；
- 将 `redirectUris` / `webOrigins` 改为企业域名；
- 通过 Keycloak 管理台为 `opendream-cloud` client 设置真实 `client_secret`；
- 对接企业 AD/LDAP 或 OIDC 联邦。

## 3. 控制面配置

```bash
OIDC_ENABLED=1
OIDC_MOCK=0
OIDC_ISSUER=https://keycloak.example.com/realms/opendream
OIDC_CLIENT_ID=opendream-cloud
OIDC_CLIENT_SECRET=<client_secret>
OIDC_REDIRECT_URI=https://opendream.example.com/api/v1/auth/callback
CONSOLE_BASE_URL=https://opendream.example.com
```

控制面会通过 OIDC discovery、authorization_code + PKCE、userinfo 建立会话；`/api/v1/auth/login` 与 `/api/v1/auth/callback` 已实现。

## 4. 验证

1. 打开 `https://opendream.example.com/login`；
2. 点击“企业 SSO 登录（OIDC）”；
3. 跳转 Keycloak 登录；
4. 回跳后进入控制台。

> 当前控制面以邮箱作为用户主键，首次 OIDC 登录会自动创建本地用户/组织（与 dev-login 相同）。
> 生产建议补齐 SCIM/LDAP 同步与组织映射。
