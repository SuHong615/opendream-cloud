// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type {
  AppAuditEvent,
  AppMember,
  AppShare,
  AppSummary,
  AppVersion,
  CollabMessage,
  CollabProposal,
  CollabSession,
  PatchFile,
} from "@/lib/app-collab-types";

const now = Date.now();
const iso = (minutesAgo: number) =>
  new Date(now - minutesAgo * 60_000).toISOString();

export const mockApps: AppSummary[] = [
  {
    id: "app-invoice-demo",
    org_id: "org-1",
    name: "发票助手",
    slug: "invoice-helper",
    state: "running",
    host: "invoice-helper.apps.opencode.local",
    url: "http://invoice-helper.apps.opencode.local",
    description: "识别发票并生成报销清单，支持导出与审批备注。",
    visibility: "org",
    template: "node",
    my_role: "owner",
    created_at: iso(60 * 24 * 20),
    updated_at: iso(12),
    resources: { cpu: "1", memory: "2Gi" },
    source_workspace_id: "00000000-0000-4000-8000-000000000001",
    current_version: "v3",
  },
  {
    id: "app-weekly-demo",
    org_id: "org-1",
    name: "周报生成",
    slug: "weekly-report",
    state: "building",
    host: "weekly-report.apps.opencode.local",
    url: "http://weekly-report.apps.opencode.local",
    description: "从项目动态生成团队周报草稿。",
    visibility: "public",
    template: "python",
    my_role: "viewer",
    created_at: iso(60 * 24 * 8),
    updated_at: iso(5),
    resources: { cpu: "1", memory: "2Gi" },
    current_version: "v1",
  },
];

export const mockMembers: AppMember[] = [
  {
    id: "mem-1",
    app_id: mockApps[0].id,
    subject_type: "user",
    subject_id: "u-lilei",
    name: "李雷",
    email: "lilei@xingyun.example",
    role: "owner",
    created_at: iso(60 * 24 * 20),
  },
  {
    id: "mem-2",
    app_id: mockApps[0].id,
    subject_type: "user",
    subject_id: "u-zhangwei",
    name: "张伟",
    email: "zhangwei@xingyun.example",
    role: "admin",
    created_at: iso(60 * 24 * 12),
  },
  {
    id: "mem-3",
    app_id: mockApps[0].id,
    subject_type: "user",
    subject_id: "u-wangfang",
    name: "王芳",
    email: "wangfang@xingyun.example",
    role: "editor",
    created_at: iso(60 * 24 * 6),
  },
  {
    id: "mem-4",
    app_id: mockApps[0].id,
    subject_type: "user",
    subject_id: "u-chenchen",
    name: "陈晨",
    email: "chenchen@xingyun.example",
    role: "operator",
    created_at: iso(60 * 24 * 3),
  },
  {
    id: "mem-5",
    app_id: mockApps[0].id,
    subject_type: "team",
    subject_id: "team-design",
    name: "产品设计组",
    role: "viewer",
    created_at: iso(60 * 24 * 2),
  },
];

export const mockShares: AppShare[] = [
  {
    id: "shr-org",
    app_id: mockApps[0].id,
    scope: "org",
    role: "use",
    subject_name: "星云科技 · 组织内",
    expires_at: null,
    created_by: "李雷",
    created_at: iso(60 * 24 * 10),
  },
  {
    id: "shr-team",
    app_id: mockApps[0].id,
    scope: "team",
    subject_type: "team",
    subject_id: "team-product",
    subject_name: "产品设计组",
    role: "view",
    expires_at: iso(-60 * 24 * 30),
    created_by: "李雷",
    created_at: iso(60 * 24),
  },
];

export const mockVersions: AppVersion[] = [
  {
    id: "ver-3",
    app_id: mockApps[0].id,
    version: "v3",
    status: "active",
    is_current: true,
    hash: "a1b2c3d4",
    summary: "导出 CSV、中文表头与空数据提示",
    created_by: "u-lilei",
    created_by_name: "李雷",
    created_at: iso(12),
    build_state: "succeeded",
  },
  {
    id: "ver-2",
    app_id: mockApps[0].id,
    version: "v2",
    status: "superseded",
    hash: "9f8e7d6c",
    summary: "支持批量上传发票并解析",
    created_by: "u-wangfang",
    created_by_name: "王芳",
    created_at: iso(60 * 24 * 3),
    build_state: "succeeded",
  },
  {
    id: "ver-1",
    app_id: mockApps[0].id,
    version: "v1",
    status: "superseded",
    hash: "1a2b3c4d",
    summary: "初始版本：单张发票识别",
    created_by: "u-lilei",
    created_by_name: "李雷",
    created_at: iso(60 * 24 * 18),
    build_state: "succeeded",
  },
];

export const mockCollabSession: CollabSession = {
  session_id: "collab-invoice-01",
  app_id: mockApps[0].id,
  base_version: "v3",
  status: "active",
  updated_at: iso(3),
  participants: 2,
};

export const mockCollabMessages: CollabMessage[] = [
  {
    id: "msg-1",
    role: "user",
    sender_name: "李雷",
    content: "把导出按钮改成 CSV，并加一行说明。",
    created_at: iso(8),
  },
  {
    id: "msg-2",
    role: "assistant",
    sender_name: "opencode",
    content:
      "已读取应用代码。可以参考 src/export.ts 的导出逻辑，改动会涉及导出按钮与空数据提示。",
    created_at: iso(7),
  },
];

export const mockAuditEvents: AppAuditEvent[] = [
  {
    id: "aud-1",
    action: "app.share.update",
    actor_name: "李雷",
    resource_name: "发票助手",
    outcome: "success",
    created_at: iso(10),
  },
  {
    id: "aud-2",
    action: "app.member.add",
    actor_name: "李雷",
    resource_name: "产品设计组",
    outcome: "success",
    created_at: iso(60 * 24),
  },
  {
    id: "aud-3",
    action: "app.version.publish",
    actor_name: "王芳",
    resource_name: "v2",
    outcome: "success",
    created_at: iso(60 * 24 * 3),
  },
];

export function buildMockProposal(
  prompt: string,
  baseVersion: string,
): CollabProposal {
  const files: PatchFile[] = [
    {
      path: "src/App.tsx",
      status: "modified",
      additions: 12,
      deletions: 3,
      unified_diff: `--- a/src/App.tsx
+++ b/src/App.tsx
@@ -42,7 +42,16 @@ export function App() {
   return (
     <main>
-      <ExportButton format="xlsx" />
+      <ExportButton format="csv" />
+      <p className="hint">
+        导出为 CSV，可用 Excel 打开；
+        空数据时不会生成文件。
+      </p>
     </main>
   );
 }`,
    },
    {
      path: "src/export.ts",
      status: "modified",
      additions: 6,
      deletions: 1,
      unified_diff: `--- a/src/export.ts
+++ b/src/export.ts
@@ -8,6 +8,11 @@ export async function exportInvoices(rows: Invoice[]) {
-  return toXlsx(rows);
+  if (rows.length === 0) {
+    throw new Error("没有可导出的发票数据");
+  }
+  return toCsv(rows, { bom: true, headers: ["发票号", "金额", "状态"] });
 }`,
    },
  ];
  return {
    id: `prop-${Date.now()}`,
    base_version: baseVersion,
    status: "open",
    summary: `根据「${prompt}」生成修改：导出改为 CSV，并补充空数据提示。`,
    files,
    test_suggestions: ["导出空数据", "中文表头在 Excel 中不出现乱码", "导出文件名包含日期"],
    created_by_name: "opencode",
    created_at: new Date().toISOString(),
  };
}

export const mockMemberDirectory = [
  { id: "u-zhaoliu", name: "赵六", email: "zhaoliu@xingyun.example" },
  { id: "u-sunqi", name: "孙七", email: "sunqi@xingyun.example" },
  { id: "u-zhouba", name: "周八", email: "zhouba@xingyun.example" },
];

export const mockTeamDirectory = [
  { id: "team-product", name: "产品设计组" },
  { id: "team-backend", name: "后端平台组" },
];
