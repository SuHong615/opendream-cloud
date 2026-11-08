"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  hint?: string;
};

function Svg({
  children,
  size = 17,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  workspaces: (
    <Svg>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  ),
  skills: (
    <Svg>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </Svg>
  ),
  prompts: (
    <Svg>
      <path d="M5 3h11l4 4v14H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v5h5M8 12h7M8 16h5" />
    </Svg>
  ),
  apps: (
    <Svg>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </Svg>
  ),
  models: (
    <Svg>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </Svg>
  ),
  mcp: (
    <Svg>
      <path d="M12 2l8.5 5v10L12 22l-8.5-5V7L12 2z" />
      <path d="M12 8v8M8.5 10l7 4M15.5 10l-7 4" />
    </Svg>
  ),
  audit: (
    <Svg>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
  usage: (
    <Svg>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Svg>
  ),
  workflows: (
    <Svg>
      <rect x="3" y="3" width="6" height="5" rx="1.2" />
      <rect x="15" y="3" width="6" height="5" rx="1.2" />
      <rect x="9" y="16" width="6" height="5" rx="1.2" />
      <path d="M6 8v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8M12 13v3" />
    </Svg>
  ),
  digitalHuman: (
    <Svg>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" />
      <path d="M7 4.5L9.5 2M17 4.5L14.5 2" />
    </Svg>
  ),
  squads: (
    <Svg>
      <circle cx="8" cy="8" r="2.8" />
      <circle cx="16" cy="8" r="2.8" />
      <path d="M2.5 20c.5-3.2 2.8-5 5.5-5s5 1.8 5.5 5" />
      <path d="M13 15.2c1-.8 2.2-1.2 3-1.2 2.7 0 5 1.8 5.5 5" />
    </Svg>
  ),
  eval: (
    <Svg>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />
      <path d="M7 15h10" />
    </Svg>
  ),
  experiments: (
    <Svg>
      <path d="M7 3h4M9 3v5l-4 9a2 2 0 0 0 1.8 3h4.4A2 2 0 0 0 13 17l-4-9V3" />
      <path d="M14 9h3M15.5 9v4l-3 6a1.5 1.5 0 0 0 1.3 2h4.4a1.5 1.5 0 0 0 1.3-2l-3-6V9" />
    </Svg>
  ),
  memory: (
    <Svg>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
    </Svg>
  ),
  observability: (
    <Svg>
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </Svg>
  ),
  org: (
    <Svg>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <path d="M16 8.5a2.5 2.5 0 1 0 0-5M18 20c-.2-2.2-1-3.7-2.4-4.6" />
    </Svg>
  ),
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "工作",
    items: [{ href: "/workspaces", label: "工作区", icon: ICONS.workspaces }],
  },
  {
    group: "能力",
    items: [
      { href: "/models", label: "模型中心", icon: ICONS.models },
      { href: "/skills", label: "Skill 中心", icon: ICONS.skills },
      { href: "/prompts", label: "Prompt 库", icon: ICONS.prompts },
      { href: "/apps", label: "应用中心", icon: ICONS.apps },
      { href: "/mcp", label: "MCP 中心", icon: ICONS.mcp },
      { href: "/workflows", label: "工作流中心", icon: ICONS.workflows },
      { href: "/employees", label: "数字员工", icon: ICONS.digitalHuman },
      { href: "/agent-templates", label: "Agent 模板", icon: ICONS.digitalHuman },
      { href: "/squads", label: "专家小队", icon: ICONS.squads },
      { href: "/eval", label: "评测中心", icon: ICONS.eval },
      { href: "/experiments", label: "实验中心", icon: ICONS.experiments },
    ],
  },
  {
    group: "治理",
    items: [
      { href: "/observability", label: "可观测", icon: ICONS.observability },
      { href: "/outbox", label: "事件与 DLQ", icon: ICONS.observability },
      { href: "/memory", label: "记忆与经验", icon: ICONS.memory },
      { href: "/org", label: "组织与配额", icon: ICONS.org },
      { href: "/devices", label: "设备与桌面端", icon: ICONS.org },
      { href: "/credentials", label: "凭证管理", icon: ICONS.org },
      { href: "/api-keys", label: "API Key", icon: ICONS.org },
      { href: "/audit", label: "审计日志", icon: ICONS.audit },
      { href: "/usage", label: "用量与配额", icon: ICONS.usage },
    ],
  },
];

function findCurrent(pathname: string): NavItem | undefined {
  return NAV.flatMap((section) => section.items).find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [orgName, setOrgName] = useState("星云科技");
  const current = findCurrent(pathname);

  useEffect(() => {
    const stored = window.localStorage.getItem("oc.theme");
    const prefers =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = stored === "dark" || (!stored && prefers) ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    const org = window.localStorage.getItem("oc.orgName");
    if (org) setOrgName(org);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("oc.theme", next);
    setTheme(next);
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-4">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-sm font-bold text-white shadow-sm"
          style={{
            background: "linear-gradient(135deg, #2563eb, #7a5af8)",
          }}
        >
          OD
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">OpenDream Cloud</div>
            <div className="truncate text-2xs text-fg-tertiary">
              云端 AI 工程平台
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="mx-3 mb-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--oc-border)", background: "var(--oc-surface)" }}>
          <div className="text-2xs text-fg-tertiary">当前组织</div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium" data-testid="org-name">
              {orgName}
            </span>
            <span className="oc-badge oc-badge-primary">开发者</span>
          </div>
        </div>
      )}

      <nav className="oc-scroll flex-1 overflow-y-auto px-2 pb-4" aria-label="主导航">
        {NAV.map((section) => (
          <div key={section.group} className="mb-4">
            {!collapsed && (
              <div className="px-3 pb-1.5 pt-2 text-2xs font-semibold tracking-wider text-fg-tertiary">
                {section.group.toUpperCase()}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      data-testid={`nav-${item.href.replace("/", "")}`}
                      title={collapsed ? item.label : undefined}
                      className={`group relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors ${
                        active
                          ? "font-medium text-primary"
                          : "text-fg-secondary hover:bg-hover hover:text-fg"
                      }`}
                      style={
                        active
                          ? { background: "var(--oc-primary-subtle)" }
                          : undefined
                      }
                    >
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r"
                          style={{ background: "var(--oc-primary)" }}
                        />
                      )}
                      <span className={active ? "text-primary" : "text-fg-tertiary group-hover:text-fg-secondary"}>
                        {item.icon}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t p-3" style={{ borderColor: "var(--oc-border)" }}>
        {!collapsed ? (
          <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
              style={{
                background: "var(--oc-primary-subtle)",
                color: "var(--oc-primary)",
              }}
            >
              李
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">李雷</div>
              <div className="truncate text-2xs text-fg-tertiary">
                开发者 · 星云科技
              </div>
            </div>
            <button
              type="button"
              className="oc-icon-btn"
              onClick={toggleTheme}
              aria-label="切换明暗主题"
              data-testid="theme-toggle"
              title="切换明暗主题"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="oc-icon-btn mx-auto"
            onClick={toggleTheme}
            aria-label="切换明暗主题"
            data-testid="theme-toggle"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        )}
        <button
          type="button"
          className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs text-fg-tertiary hover:bg-hover"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
          data-testid="sidebar-collapse"
        >
          <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
          {!collapsed && "折叠侧栏"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="oc-skip">
        跳到主内容
      </a>

      <aside
        data-testid="sidebar"
        className={`sticky top-0 hidden h-screen shrink-0 border-r bg-surface transition-[width] duration-200 md:flex md:flex-col ${
          collapsed ? "w-[72px]" : "w-[248px]"
        }`}
        style={{ borderColor: "var(--oc-border)" }}
      >
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="关闭导航"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="relative h-full w-[270px] border-r bg-surface"
            style={{ borderColor: "var(--oc-border)" }}
          >
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-surface/95 px-4 backdrop-blur md:px-8"
          style={{ borderColor: "var(--oc-border)" }}
        >
          <button
            type="button"
            className="oc-icon-btn md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="打开导航"
          >
            ☰
          </button>
          <div className="min-w-0">
            <div className="text-2xs text-fg-tertiary">控制台</div>
            <div className="truncate text-sm font-medium">
              {current?.label ?? "OpenDream Cloud"}
            </div>
          </div>
          <div className="flex-1" />
          <span className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs text-fg-secondary sm:inline-flex" style={{ borderColor: "var(--oc-border)" }}>
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--oc-primary)" }}
              aria-hidden="true"
            />
            企业版
          </span>
          <Link
            href="/workspaces"
            className="oc-btn oc-btn-ghost oc-btn-sm hidden sm:inline-flex"
          >
            工作区
          </Link>
          <div
            className="grid h-9 w-9 place-items-center rounded-full text-xs font-semibold"
            style={{
              background: "var(--oc-primary-subtle)",
              color: "var(--oc-primary)",
            }}
            title="李雷"
            data-testid="user-avatar"
          >
            李
          </div>
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
