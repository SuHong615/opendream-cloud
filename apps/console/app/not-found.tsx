// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="oc-card max-w-md p-8 text-center">
        <h1 className="text-2xl font-semibold">页面不存在</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          链接可能已失效，或资源已被删除。可以返回工作区继续。
        </p>
        <a href="/workspaces" className="oc-btn oc-btn-primary mt-4 inline-flex">
          返回工作区
        </a>
      </div>
    </div>
  );
}
