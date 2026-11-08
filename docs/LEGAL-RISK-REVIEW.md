# 法律风险审视（Legal Risk Review）

> **非法律意见。** 本文用于开源发布前的风险识别与整改，不替代律师对目标市场、业务模式、数据与商标的正式审查。
> 结论：**当前代码可以作为 Apache-2.0 开源项目发布，但上传 Git 历史前必须先处理“运行期数据库进入过 Git 历史”的高风险项；品牌名需加免责声明或调整。**

## 1. 风险总览

| # | 风险 | 等级 | 现状 | 处置 |
| --- | --- | --- | --- | --- |
| 1 | **Git 历史包含运行期 SQLite 数据库** | **已处置** | 历史 `.data/`、`apps/control-plane/.data/` 曾被提交，含测试用户/邮箱、密码哈希、加密密钥等 | **已重建 `main` 为单提交干净历史，旧历史已删除、未保留** |
| 2 | 新品牌名 “OpenDream Cloud” 的商标可用性/显著性 | **中** | 已从 “OpenCode Cloud” 改为独立名称；但 “OpenDream” 是常见词/可能有同名产品，需检索 | 商业发布前做目标市场商标检索；保留非官方声明；必要时换更具显著性的名称（避免 AgentCore 等已有大厂商标） |
| 3 | MIT/Apache 第三方许可证合规 | 中 | 根 LICENSE/NOTICE、THIRD_PARTY 已补；`@opencode/cli` 为 MIT | 发布物附完整许可证/NOTICE；Docker 镜像内也附 |
| 4 | 传递依赖/Go 依赖许可证未全量审计 | 中 | 仅做了 Node 顶层扫描（MIT/Apache，无 GPL/AGPL 命中） | 发布前跑 `license-checker`、`go-licenses`；CI 加许可证门禁 |
| 5 | Docker 镜像分发含 opencode/Bun | 中 | 镜像内安装 `@opencode/cli`、基于 Bun 镜像 | 镜像内复制 MIT/Apache 许可证；文档标注来源 |
| 6 | AI 生成代码/内容的知识产权归属 | 中 | 仓库为自研+AI 辅助；未引入第三方源码 | 贡献者 DCO；不声称对 AI 输出独家版权；商业前做代码来源审查 |
| 7 | 截图/文档中的第三方商标、UI 版权 | 低-中 | 截图多为本项目 UI/少量 opencode UI；无客户真实数据 | 保留归属说明；不使用第三方 Logo 暗示背书 |
| 8 | 示例数据/PII | 中 | 演示账号/姓名/邮箱为虚构；但历史 DB 含测试邮箱 | 清理历史；文档明确“演示数据为虚构” |
| 9 | 第三方模型/API 条款 | 中 | 不内置模型权重/密钥；用户自行接供应商 | 文档要求用户遵守供应商条款；不承诺模型输出合规 |
| 10 | 安全/无 warranty | 低-中 | Alpha、README/ SECURITY 已声明 | 保留免责声明；不宣称生产级/等保合规 |
| 11 | 专利风险 | 低-中 | Apache-2.0 含专利授权；未做 FTO 检索 | 商业规模前做专利检索；保留专利条款 |
| 12 | 出口管制/加密 | 低 | 使用标准 AES/Ed25519/TLS | 如向受制裁地区分发，咨询出口合规 |
| 13 | 贡献者授权链 | 中 | 目前 CONTRIBUTING 未明确 inbound license | 增加 DCO + Apache-2.0 inbound 声明 |
| 14 | 名称/Logo 与第三方品牌 | 低 | 文档提及 Alibaba/Higress/K8s/Docker 等 | 仅指示性使用；加商标声明 |

## 2. 逐项说明

### 2.1 已处置：Git 历史中的运行期数据库

此前 `.data/`、`apps/control-plane/.data/` 曾进入 Git 历史，可能包含：

- 测试用户邮箱、显示名、组织名；
- 密码哈希、会话密钥、加密后的模型 API Key；
- 工作区 ticket、审计日志、Mock 数据。

**已按方案 A 完成处置**：当前仓库 `main` 为单提交 `Initial public release v0.1.0-alpha`，不包含任何 `.data`/SQLite 历史；旧历史已删除、未保留，避免任何误上传或恢复导致 PII/密钥泄露。

### 2.2 中：项目名称与商标

- 已按整改方案把项目名从 “OpenCode Cloud” 改为 **“OpenDream Cloud”**，包名/镜像/文案已同步，移除与上游名称的直接混淆；
- 上游 opencode 使用 MIT，**MIT 不授予商标权**；“opencode” 仅作上游依赖的指示性引用；
- **命名原则**：不使用上游 “opencode” 作为产品名前缀（避免商标/来源混淆）；不使用 “AgentCore”（AWS 已有同名产品）；“OpenDream” 是常见词，需做商标检索与同名产品排查。商业发布前若发现冲突，应换更具显著性的名称，同时保留 “built on opencode” 的说明。
- README、官网、Release 需明确：
  > Independent project built on the open-source opencode engine. Not affiliated with or endorsed by the opencode project.
- 如收到名称异议，优先改为更具显著性的中性品牌名，保留 “built on opencode” 描述。

### 2.3 中：许可证合规

已做：

- 自研代码 Apache-2.0 + NOTICE + SPDX/author 头；
- `LICENSES/APACHE-2.0.txt`、`LICENSES/MIT.txt`、`LICENSES/opencode-MIT.txt`；
- 第三方清单 `THIRD_PARTY_NOTICES.md`；
- `@opencode/cli@2.2.5` 经 npm 元数据确认 **MIT**；Bun 基础镜像 MIT；
- Node 顶层依赖扫描：Apache-2.0 / MIT，未发现 GPL/AGPL/SSPL（**非全量传递依赖结论**）。

仍需：

- 全量依赖审计（含传递依赖、Go modules、Docker 基础镜像）；
- 分发 Docker 镜像时，把 `LICENSES/` 与 `THIRD_PARTY_NOTICES.md` 复制进镜像；
- 保留所有 MIT 版权声明，不得把第三方代码标为 Apache-2.0。

### 2.4 中：AI 生成内容与代码来源

- 本项目代码为自研 + AI 辅助；未 vendor 上游 opencode 源码；
- AI 生成内容在某些法域可能不受版权保护或权属不清，本项目不对其作独家权利保证；
- 贡献者需确认其提交不包含前雇主/第三方专有代码；
- 建议启用 DCO，要求贡献者声明有权按 Apache-2.0 提交。

### 2.5 中：数据与隐私

- 演示账号、姓名、邮箱均为虚构示例；
- 生产部署需完成数据分类分级、脱敏、GDPR/PIPL/等保评估；
- 不要在 Issue/截图/示例中提交真实客户数据、真实 API Key、身份证/手机号；
- 历史数据库清理见 §3。

### 2.6 低-中：安全与生产使用

- 项目为 Alpha：无高可用、无 KMS、无企业 SSO、无合规认证；
- Apache-2.0 已含“AS IS”免责；
- README/SECURITY 明确“不提供生产级保证”，避免虚假宣传。

### 2.7 低：第三方模型/服务条款

- 仓库不含模型权重与供应商密钥；
- 使用者接入 OpenAI/DeepSeek/通义等需自行遵守供应商条款、数据跨境与内容政策；
- 平台不承诺模型输出的准确性/合法性。

### 2.8 低：专利、出口与加密

- Apache-2.0 提供专利授权与终止条款；
- 未做专利 FTO（自由实施）检索；商业规模化前建议专项检索；
- 标准密码学（AES-GCM/Ed25519/TLS）通常不属于强出口管制，但跨境分发仍需按当地法规确认。

## 3. 上传前必须做：清理 Git 历史

> 推荐 **方案 A（最简单、最安全）**：新建一个干净仓库/单提交发布，不带历史。
> 若必须保留历史，用 **方案 B** 过滤路径并强推。

### 方案 A：干净发布（推荐）

```bash
# 在现有工作区，确认工作树干净
git status

# 新建无历史分支
git checkout --orphan public-main
git add -A
git commit -m "Initial public release v0.1.0-alpha"

# 用 public-main 替换 main
git branch -D main 2>/dev/null || true
git branch -m main

# 推送（先在 GitHub 建空仓库）
git remote add origin https://github.com/<account>/opendream-cloud.git
git push -u origin main
```

优点：不会泄露任何历史数据库/密钥；缺点：丢失提交历史。

### 方案 B：过滤历史（保留大部分历史）

```bash
# 安装 git-filter-repo（需 Python）
python -m pip install git-filter-repo

# 删除历史中的数据库/临时文件/上游目录
git filter-repo \
  --path .data --path apps/control-plane/.data \
  --path .tmp-cp.sqlite-shm --path .tmp-cp.sqlite-wal \
  --path test-results --path upstream \
  --invert-paths

# 清理并复核
git reflog expire --expire=now --all
git gc --aggressive --prune=now
git rev-list --objects --all | grep -E 'sqlite|\.data/|tmp-cp' || echo "OK: no runtime DB in history"
```

如历史中曾出现真实密钥，**密钥必须轮换**，仅删历史不够。

### 强制推送（如仓库已存在）

```bash
git push --force-with-lease origin main
```

并通知协作者重新克隆。

## 4. 发布前检查清单

- [ ] 已按 §3 清理历史，`git rev-list --objects --all` 无 sqlite/.data
- [ ] `.env`、真实 API Key、私钥、客户数据未进入历史
- [ ] `LICENSE` / `NOTICE` / `THIRD_PARTY_NOTICES.md` / `LICENSES/` 已提交
- [ ] README 首屏含“非官方/非生产级”声明
- [ ] `TRADEMARK.md` 已提交
- [ ] 贡献者 DCO/inbound license 已写
- [ ] 全量依赖许可证审计完成（Node + Go + Docker 基础镜像）
- [ ] 截图/示例不含真实客户数据
- [ ] Release 说明包含 “Alpha / not production” 与上游归属

## 5. 结论

- **代码许可层面**：Apache-2.0 + 第三方许可证保留，整体可控；
- **最大风险已处置**：当前 `main` 为单提交干净历史，运行期数据库不在 Git 历史中；旧历史备份在本地仓库外，禁止上传；
- **品牌风险**：已从 “OpenCode Cloud” 改为 **“OpenDream Cloud”**，上游混淆风险显著降低；但 “OpenDream” 为常见词，正式商业发布前必须做同名产品/商标检索；避免使用 AgentCore、opencode-* 等高风险名称；
- **生产风险**：Alpha 功能与安全边界已在 README/指引声明，不能宣称生产级/合规认证；
- 完成以上整改后，开源发布风险可降到可接受水平（仍建议正式商业发布前由律师复核）。
