// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OpenDream Cloud · 企业 AI 工程平台",
  description: "OpenDream Cloud 企业门户：云端工作区 + OpenDream Code 桌面端双引擎，统一模型中心、MCP、Skill、评测与治理。",
};

const CLOUD_FEATURES = [
  ["云端工作区", "4C8G 托管 opencode 环境，退出不销毁，显式释放。"],
  ["模型中心", "企业模型统一接入、密钥加密、测试与自动下发。"],
  ["MCP 中心", "注册、审核、发布、版本、网关与工具级审计。"],
  ["Skill / Prompt", "上传式 Skill、内容/代码/审查/调试/版本/启用。"],
  ["应用中心", "应用权限、分享、协同修改、diff 审批与回滚。"],
  ["数字员工 / 专家小队", "岗位、技能、MCP、记忆、自治与人工门禁。"],
  ["评测 / 实验", "数据集、评测器、A/B 实验与基线。"],
  ["组织与审计", "成员角色、配额、用量、审计与导出。"],
];

const SCENARIOS = [
  ["研发交付", "需求拆解、编码、代码审查、测试生成、发布自查", "缩短交付周期"],
  ["客户服务", "工单分诊、知识检索、回复草稿、7×24 多语言", "降低单票成本"],
  ["财务合规", "发票抽取、对账、合同审查、付款审批", "AI 初筛 + 人工终审"],
];

const SECURITY = [
  ["租户与 RBAC", "org / member / role / quota 隔离"],
  ["全链路审计", "登录、Key、工作区、发布、MCP 调用"],
  ["MCP 安全", "EdDSA ticket、工具级 PEP、破坏性操作门禁"],
  ["可观测", "Prometheus /metrics、健康检查、请求指标"],
];

export default function PublicPortalPage() {
  return (
    <div data-testid="public-portal" className="min-h-screen bg-[var(--oc-bg)] text-[var(--oc-text)]">
      <header className="sticky top-0 z-40 border-b border-[var(--oc-border)] bg-[var(--oc-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-blue-600 to-violet-500 text-sm font-bold text-white shadow-sm">OD</span>
            <span className="text-sm font-semibold">OpenDream Cloud</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-[var(--oc-text-secondary)] md:flex">
            <a href="#engines" className="hover:text-[var(--oc-primary)]">双引擎</a>
            <a href="#cloud" className="hover:text-[var(--oc-primary)]">云端能力</a>
            <a href="#desktop" className="hover:text-[var(--oc-primary)]">桌面端</a>
            <a href="#enterprise" className="hover:text-[var(--oc-primary)]">企业场景</a>
            <a href="#security" className="hover:text-[var(--oc-primary)]">安全治理</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="#download" className="oc-btn oc-btn-sm hidden sm:inline-flex">下载桌面端</a>
            <a href="/workspaces" data-testid="portal-console" className="oc-btn oc-btn-primary">控制台</a>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-[var(--oc-border)] bg-gradient-to-b from-[var(--oc-primary-subtle)] to-[var(--oc-bg)]">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
            <div>
              <div className="oc-badge oc-badge-primary">企业内部 AI 工程平台</div>
              <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                让 AI 成为企业<br /><span className="text-[var(--oc-primary)]">可治理的生产力</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-[var(--oc-text-secondary)]">
                OpenDream Cloud 把模型、企业系统（MCP）、知识、流程与权限组合成数字员工与专家小队；
                云端托管与 OpenDream Code 桌面端双引擎，覆盖从本地编码到企业级交付。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="/workspaces" className="oc-btn oc-btn-primary">进入控制台</a>
                <a href="#download" className="oc-btn">下载 Windows 桌面端</a>
              </div>
              <div className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-[var(--oc-border)] pt-6">
                <div><div className="text-2xl font-semibold">13</div><div className="mt-1 text-xs text-[var(--oc-text-tertiary)]">本地服务</div></div>
                <div><div className="text-2xl font-semibold">2</div><div className="mt-1 text-xs text-[var(--oc-text-tertiary)]">云 + 桌面引擎</div></div>
                <div><div className="text-2xl font-semibold">56/56</div><div className="mt-1 text-xs text-[var(--oc-text-tertiary)]">API 覆盖</div></div>
              </div>
            </div>

            <div className="oc-card p-4">
              <div className="flex items-center justify-between border-b border-[var(--oc-border)] px-2 pb-3 text-xs text-[var(--oc-text-tertiary)]">
                <span>OpenDream 双引擎</span><span className="text-[var(--oc-success-text)]">● 运行中</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-primary-subtle)] p-4">
                  <div className="text-xs font-semibold text-[var(--oc-primary)]">CLOUD</div>
                  <div className="mt-2 text-sm font-semibold">云端工作区</div>
                  <div className="mt-3 space-y-1.5 text-xs text-[var(--oc-text-secondary)]">
                    <div>4C8G · 持久化</div><div>应用中心 / 团队协作</div><div>审计与配额</div>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-surface-hover)] p-4">
                  <div className="text-xs font-semibold text-violet-600">DESKTOP</div>
                  <div className="mt-2 text-sm font-semibold">OpenDream Code</div>
                  <div className="mt-3 space-y-1.5 text-xs text-[var(--oc-text-secondary)]">
                    <div>本地文件 / 终端 / Git</div><div>模型自动同步</div><div>MCP 自动安装</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-[var(--oc-border)]">
                <img src="/portal/desktop.png" alt="OpenDream Code 桌面端" className="w-full" />
              </div>
            </div>
          </div>
        </section>

        <section id="engines" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="oc-eyebrow">双引擎</div>
          <h2 className="oc-title mt-2">一套模型与 MCP，两个执行引擎</h2>
          <p className="oc-subtitle mt-3 max-w-3xl">云端负责托管、协作与治理；桌面端负责本地编码。模型中心与 MCP 注册表同源，配置一次即可两端生效。</p>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="oc-card p-7">
              <div className="oc-badge oc-badge-primary">CLOUD</div>
              <h3 className="mt-4 text-xl font-semibold">OpenDream Cloud</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--oc-text-secondary)]">托管工作区、应用中心、Skill/评测/工作流、数字员工与组织治理；适合团队协作与对外交付。</p>
              <ul className="mt-5 space-y-2 text-sm text-[var(--oc-text-secondary)]">
                <li>✓ 浏览器打开即用，退出不销毁</li><li>✓ 应用中心、共享与发布</li><li>✓ 企业模型、MCP、审计与配额</li>
              </ul>
              <a href="/workspaces" className="oc-btn oc-btn-primary mt-6">进入控制台</a>
            </div>
            <div className="oc-card p-7">
              <div className="oc-badge">DESKTOP</div>
              <h3 className="mt-4 text-xl font-semibold">OpenDream Code</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--oc-text-secondary)]">本地工具引擎，不含应用中心；使用本机文件/终端/Git，专注编码与本地调试。</p>
              <ul className="mt-5 space-y-2 text-sm text-[var(--oc-text-secondary)]">
                <li>✓ 模型中心配置自动下发</li><li>✓ MCP 自动安装与同步</li><li>✓ 设备 token 独立、可随时吊销</li>
              </ul>
              <a href="#download" className="oc-btn mt-6">下载桌面端</a>
            </div>
          </div>
        </section>

        <section id="cloud" className="border-y border-[var(--oc-border)] bg-[var(--oc-surface)]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <div className="oc-eyebrow">云端能力</div>
            <h2 className="oc-title mt-2">从模型接入到企业治理，完整闭环</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CLOUD_FEATURES.map(([title, desc]) => (
                <div key={title} className="oc-card p-5">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-2 text-xs leading-6 text-[var(--oc-text-secondary)]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="desktop" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="oc-eyebrow">OpenDream Code</div>
              <h2 className="oc-title mt-2">面向开发者的本地工具，不夹带应用中心</h2>
              <p className="oc-subtitle mt-3">配对云端账号后，模型与 MCP 自动同步到本地 opencode；文件、终端与 Git 全部留在本机。</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  ["本地优先", "代码与文件不上传云端"],
                  ["模型同源", "沿用模型中心，不手填 Key"],
                  ["MCP 自动装", "filesystem / memory / sequential-thinking"],
                  ["设备可吊销", "独立 token，控制台随时断开"],
                ].map(([t, d]) => (
                  <div key={t} className="oc-card p-4">
                    <div className="text-sm font-semibold">{t}</div><div className="mt-1 text-xs text-[var(--oc-text-secondary)]">{d}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="oc-card p-3">
              <img src="/portal/desktop-synced.png" alt="OpenDream Code 已同步模型与 MCP" className="w-full rounded-lg" />
            </div>
          </div>
        </section>

        <section id="enterprise" className="border-y border-[var(--oc-border)] bg-[var(--oc-surface)]">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <div className="oc-eyebrow">企业价值</div>
            <h2 className="oc-title mt-2">把 AI 落到能提效的业务场景</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {SCENARIOS.map(([domain, scenes, value]) => (
                <div key={domain} className="oc-card p-6">
                  <div className="text-lg font-semibold">{domain}</div>
                  <p className="mt-3 text-sm leading-7 text-[var(--oc-text-secondary)]">{scenes}</p>
                  <div className="mt-5 text-xs font-medium text-[var(--oc-success-text)]">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="oc-eyebrow">安全与治理</div>
              <h2 className="oc-title mt-2">企业级边界，默认写进架构</h2>
              <p className="oc-subtitle mt-3">租户隔离、RBAC、CSRF、审计、配额、MCP 工具级策略、设备 token 吊销，以及可观测指标。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {SECURITY.map(([t, d]) => (
                <div key={t} className="oc-card p-4">
                  <div className="text-sm font-semibold">{t}</div><div className="mt-1 text-xs text-[var(--oc-text-secondary)]">{d}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="download" className="border-t border-[var(--oc-border)] bg-[var(--oc-primary-subtle)]">
          <div className="mx-auto max-w-5xl px-5 py-20 text-center lg:px-8">
            <h2 className="oc-title">开始使用 OpenDream</h2>
            <p className="oc-subtitle mt-3">云端控制台免安装；桌面端下载后安装，首次启动输入配对码即可同步模型与 MCP。</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href="/workspaces" className="oc-btn oc-btn-primary">进入控制台</a>
              <a href="/downloads/OpenDreamCode-Setup.exe" data-testid="portal-download" className="oc-btn">下载 Windows 桌面端</a>
            </div>
            <p className="mt-5 text-xs text-[var(--oc-text-tertiary)]">仅限企业内部员工使用 · 安装包由 IT 统一分发</p>
          </div>
        </section>
      </main>

      <section id="about" className="border-t border-[var(--oc-border)] bg-[var(--oc-surface)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8">
          <div>
            <div className="oc-eyebrow">关于我们</div>
            <h2 className="oc-title mt-2">OpenDream Cloud 开源项目</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--oc-text-secondary)]">
              OpenDream Cloud 是面向企业的开源 AI 工程平台，以 opencode 为执行引擎，
              覆盖云端工作区、模型中心、MCP 中心、Skill / Prompt、应用协同、工作流、数字员工与专家小队，
              以及评测、实验、记忆、可观测与组织治理。
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--oc-text-secondary)]">
              项目采用 Apache-2.0 许可，代码托管在 GitHub。欢迎企业开发者反馈问题、参与共建；
              桌面端 OpenDream Code 与云端共用模型中心与 MCP 注册表。
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-[var(--oc-text-tertiary)]">
              <span className="oc-badge">Apache-2.0</span>
              <span className="oc-badge">opencode engine</span>
              <span className="oc-badge">独立开源项目</span>
            </div>
          </div>
          <div className="oc-card p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--oc-text)] text-sm font-bold text-[var(--oc-surface)]">GH</span>
              <div>
                <div className="text-sm font-semibold">GitHub 开源仓库</div>
                <div className="mt-0.5 font-mono text-xs text-[var(--oc-text-tertiary)]">github.com/SuHong615/opendream-cloud</div>
              </div>
            </div>
            <p className="mt-4 text-xs leading-6 text-[var(--oc-text-secondary)]">
              获取完整文档、部署指南、架构设计与更新记录；问题与建议请通过 Issues 提交。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href="https://github.com/SuHong615/opendream-cloud"
                target="_blank"
                rel="noreferrer"
                data-testid="portal-github"
                className="oc-btn oc-btn-primary"
              >
                访问 GitHub 仓库
              </a>
              <a href="https://github.com/SuHong615/opendream-cloud/issues" target="_blank" rel="noreferrer" className="oc-btn">
                问题反馈
              </a>
            </div>
            <p className="mt-4 text-xs text-[var(--oc-text-tertiary)]">
              注：OpenDream Cloud 是独立项目，不是 opencode 官方发行版，与上游无隶属或背书关系。
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--oc-border)] bg-[var(--oc-surface)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-[var(--oc-text-tertiary)] lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-500 text-xs font-bold text-white">OD</span><span>OpenDream Cloud · 企业内部平台</span></div>
          <div className="flex flex-wrap gap-5">
            <a href="/workspaces" className="hover:text-[var(--oc-text)]">控制台</a>
            <a href="#download" className="hover:text-[var(--oc-text)]">桌面端</a>
            <a href="#security" className="hover:text-[var(--oc-text)]">安全</a>
            <a href="#about" className="hover:text-[var(--oc-text)]">关于我们</a>
            <a href="https://github.com/SuHong615/opendream-cloud" target="_blank" rel="noreferrer" className="hover:text-[var(--oc-text)]">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
