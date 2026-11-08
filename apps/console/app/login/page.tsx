"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { Banner, Button } from "@/components/ui";

const HERO_POINTS = [
  "4C8G 云端 opencode 工作区，退出不销毁",
  "企业模型统一接入，密钥不出控制面",
  "Skill / 评测 / 应用 / MCP 全链路能力",
];

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("lilei@xingyun.example");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    message: string;
    reason?: string;
    requestId?: string;
  } | null>(null);
  const [offline, setOffline] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError({ message: "请输入正确的企业邮箱" });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.login(email);
      const returnTo = params.get("return_to");
      const safe =
        returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
          ? returnTo
          : "/workspaces";
      router.push(safe);
    } catch (err) {
      if (err instanceof ApiError) {
        setOffline(err.status >= 500);
        setError({
          message: err.message,
          reason: err.displayReason,
          requestId: err.requestId,
        });
      } else {
        setError({ message: "登录失败，请稍后重试" });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="flex h-16 items-center gap-2.5 border-b px-6 md:px-10"
        style={{ borderColor: "var(--oc-border)" }}
      >
        <span
          aria-hidden="true"
          className="grid h-8 w-8 place-items-center rounded-[10px] text-sm font-bold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg, #2563eb, #7a5af8)" }}
        >
          OD
        </span>
        <span className="text-sm font-semibold">OpenDream Cloud</span>
        <span className="ml-2 hidden oc-badge sm:inline-flex">企业版</span>
        <div className="flex-1" />
        <span className="text-xs text-fg-tertiary">云端 AI 工程平台</span>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-10 px-6 py-10 lg:flex-row lg:gap-16">
        <section className="w-full max-w-xl">
          <div className="oc-eyebrow">OPENDREAM CLOUD</div>
          <h1 className="text-4xl font-semibold leading-[1.2] tracking-tight">
            给每个工程师
            <br />
            一间随身的 AI 工程云工作室
          </h1>
          <p className="mt-5 max-w-lg text-md text-fg-secondary">
            打开浏览器就有 4C8G 的云端 opencode：企业模型、Skill、评测、应用与 MCP
            即取即用，代码与会话长期保留。
          </p>
          <ul className="mt-8 space-y-3">
            {HERO_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-fg-secondary">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-2xs font-semibold"
                  style={{
                    color: "var(--oc-primary)",
                    background: "var(--oc-primary-subtle)",
                  }}
                >
                  ✓
                </span>
                {point}
              </li>
            ))}
          </ul>
          <div
            className="mt-10 hidden rounded-xl border p-4 lg:block"
            style={{
              borderColor: "var(--oc-border)",
              background:
                "linear-gradient(135deg, rgba(37,99,235,.06), rgba(122,90,248,.06))",
            }}
          >
            <div className="font-mono text-xs leading-relaxed text-fg-secondary">
              $ opencode serve
              <br />
              <span style={{ color: "var(--oc-success-text)" }}>✓ workspace ready</span>{" "}
              · 4C8G · persistent PVC
            </div>
          </div>
        </section>

        <form
          onSubmit={submit}
          className="oc-card w-full max-w-sm p-7"
          data-testid="login-form"
          aria-describedby={error ? "login-error" : undefined}
        >
          <h2 className="text-xl font-semibold">登录 OpenDream Cloud</h2>
          <p className="mt-1.5 text-sm text-fg-secondary">
            使用企业账号继续；首次登录将自动创建工作区。
          </p>

          <label className="oc-field-label mt-6" htmlFor="email">
            企业邮箱
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="oc-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="login-email"
            required
            placeholder="name@company.com"
          />
          <p className="oc-field-hint">
            开发环境使用 dev-login；生产环境跳转企业 SSO（OIDC）。
          </p>

          {error && (
            <div
              id="login-error"
              role="alert"
              className="mt-4 rounded-lg px-3 py-2.5 text-sm"
              style={{
                background: "var(--oc-danger-subtle)",
                color: "var(--oc-danger-text)",
              }}
              data-testid="login-error"
            >
              {error.message}
              {error.reason && (
                <div className="mt-1 font-mono text-xs">reason: {error.reason}</div>
              )}
              {error.requestId && (
                <div className="mt-1 font-mono text-xs">
                  request_id: {error.requestId}
                </div>
              )}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            className="mt-5 w-full"
            data-testid="login-submit"
          >
            {loading ? "正在登录…" : "开发登录 / 本地体验"}
          </Button>

          <a
            href="/api/v1/auth/login"
            className="oc-btn mt-3 w-full justify-center"
            data-testid="login-sso"
          >
            企业 SSO 登录（OIDC）
          </a>

          {offline && (
            <div className="mt-4" data-testid="login-offline">
              <Banner tone="warn">
                控制面服务暂不可用。可以稍后重试，或先进入演示控制台查看界面。
              </Banner>
              <a
                href="/workspaces"
                className="oc-btn mt-3 w-full"
                data-testid="login-demo-link"
              >
                进入演示控制台（示例数据）
              </a>
            </div>
          )}

          <p className="mt-5 text-xs leading-relaxed text-fg-tertiary">
            登录即表示同意《服务条款》《隐私政策》。关闭浏览器不会销毁工作区。
          </p>
        </form>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center text-sm text-fg-secondary">
          正在加载登录页…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
