"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { Button } from "@/components/ui";
import type { CollabProposal } from "@/lib/app-collab-types";

export function DiffModal({
  proposal,
  onClose,
  onApprove,
  onReject,
  approving,
}: {
  proposal: CollabProposal;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  approving?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="diff-title"
        className="oc-card relative flex max-h-[88vh] w-full max-w-4xl flex-col"
        data-testid="diff-modal"
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 id="diff-title" className="text-lg font-semibold">
              Patch 提案 · {proposal.id.slice(0, 10)}
            </h2>
            <p className="mt-1 text-sm text-fg-secondary">
              基于 {proposal.base_version} · {proposal.files.length} 个文件 ·{" "}
              {proposal.files.reduce((sum, file) => sum + file.additions, 0)} 增 /{" "}
              {proposal.files.reduce((sum, file) => sum + file.deletions, 0)} 删
            </p>
          </div>
          <button
            type="button"
            className="oc-icon-btn"
            aria-label="关闭 diff"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {proposal.test_suggestions && proposal.test_suggestions.length > 0 && (
            <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--oc-info-subtle)", color: "var(--oc-info-text)" }}>
              测试建议：{proposal.test_suggestions.join(" · ")}
            </div>
          )}
          {proposal.files.map((file) => (
            <section key={file.path} className="mb-4" data-testid="diff-file">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-medium">{file.path}</span>
                <span className="oc-badge">{file.status}</span>
                <span style={{ color: "var(--oc-success-text)" }}>
                  +{file.additions}
                </span>
                <span style={{ color: "var(--oc-danger-text)" }}>
                  −{file.deletions}
                </span>
              </div>
              <pre
                className="overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed"
                style={{ borderColor: "var(--oc-border)", background: "var(--oc-bg)" }}
              >
                {file.unified_diff.split("\n").map((line, index) => {
                  const isAdd = line.startsWith("+") && !line.startsWith("+++");
                  const isDel = line.startsWith("-") && !line.startsWith("---");
                  return (
                    <div
                      key={`${file.path}-${index}`}
                      data-testid={isAdd ? "diff-line-add" : isDel ? "diff-line-del" : undefined}
                      style={{
                        color: isAdd
                          ? "var(--oc-success-text)"
                          : isDel
                            ? "var(--oc-danger-text)"
                            : "var(--oc-text-secondary)",
                        background: isAdd
                          ? "var(--oc-success-subtle)"
                          : isDel
                            ? "var(--oc-danger-subtle)"
                            : "transparent",
                      }}
                    >
                      {line || " "}
                    </div>
                  );
                })}
              </pre>
            </section>
          ))}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
          <Button variant="ghost" onClick={onReject} data-testid="diff-reject">
            拒绝
          </Button>
          <Button
            variant="primary"
            loading={approving}
            onClick={onApprove}
            data-testid="diff-approve"
          >
            批准并生成新版本
          </Button>
        </footer>
      </div>
    </div>
  );
}
