// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { AppShell } from "@/components/app-shell";
import { Banner, EmptyState } from "@/components/ui";

export function CenterPlaceholder({
  title,
  description,
  testId,
  note,
  eyebrow = "能力中心",
  upcoming = [],
}: {
  title: string;
  description: string;
  testId: string;
  note?: string;
  eyebrow?: string;
  upcoming?: string[];
}) {
  return (
    <AppShell>
      <div data-testid={testId} className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">{eyebrow}</div>
            <h1 className="oc-title">{title}</h1>
            <p className="oc-subtitle">{description}</p>
          </div>
          <span className="oc-badge">即将接入</span>
        </div>

        {upcoming.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {upcoming.map((item) => (
              <div key={item} className="oc-card px-4 py-3 text-sm text-fg-secondary">
                <span aria-hidden="true" className="mr-2 text-primary">
                  ◇
                </span>
                {item}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          <Banner tone="info">
            该中心的能力接口将在后续迭代接入。当前保留导航、空态与错误态，
            你可以先回到工作区使用云端 opencode。
          </Banner>
        </div>

        <div className="mt-6">
          <EmptyState
            title={`${title}还没有数据`}
            description={
              note ||
              "控制面接口接入后，这里会展示列表、筛选与详情。你也可以先返回工作区继续使用 cloud opencode。"
            }
            action={
              <a href="/workspaces" className="oc-btn oc-btn-primary">
                回到工作区
              </a>
            }
          />
        </div>
      </div>
    </AppShell>
  );
}
