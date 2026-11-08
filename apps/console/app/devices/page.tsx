"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime } from "@/lib/api";

interface Device { id: string; name: string; platform: string; last_seen_at: string | null; created_at: string }

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.listDesktopDevices();
      setDevices(result.items);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createPairing() {
    setBusy(true);
    try {
      const result = await api.createDesktopPairing();
      setPairing({ code: result.code, expires_at: result.expires_at });
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "生成配对码失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(device: Device) {
    setBusy(true);
    try {
      await api.revokeDesktopDevice(device.id);
      await load();
      setToastMessage(`已断开 ${device.name}`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "断开设备失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div data-testid="devices-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">治理</div>
            <h1 className="oc-title">设备与桌面端</h1>
            <p className="oc-subtitle">OpenDream Code 使用独立设备 token；在此生成配对码、查看或断开设备。桌面端不含应用中心。</p>
          </div>
          <div className="flex gap-2">
            <a href="https://github.com/SuHong615/opendream-cloud/releases/latest" className="oc-btn oc-btn-sm">下载桌面端</a>
            <Button variant="primary" loading={busy} onClick={() => void createPairing()} data-testid="devices-pair">生成配对码</Button>
          </div>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <section className="oc-card p-5 lg:col-span-2" data-testid="devices-list">
            <div className="flex items-center justify-between">
              <h2 className="text-md font-semibold">已连接设备</h2>
              <span className="oc-badge">{devices.length} 台</span>
            </div>
            {loading ? <div className="mt-4"><Skeleton lines={3} /></div> : devices.length === 0 ? (
              <p className="mt-4 text-sm text-fg-tertiary" data-testid="devices-empty">还没有桌面端连接。生成配对码后在 OpenDream Code 中输入。</p>
            ) : (
              <ul className="mt-4 divide-y" style={{ borderColor: "var(--oc-border)" }}>
                {devices.map((device) => (
                  <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="device-row">
                    <div>
                      <div className="text-sm font-medium">{device.name}</div>
                      <div className="mt-0.5 text-xs text-fg-tertiary">{device.platform || "desktop"} · 最近在线 {device.last_seen_at ? formatTime(device.last_seen_at) : "从未"}</div>
                    </div>
                    <Button className="oc-btn-sm" variant="danger" loading={busy} onClick={() => void revoke(device)} data-testid="device-revoke">断开</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <aside className="oc-card p-5">
            <h2 className="text-md font-semibold">桌面端能力</h2>
            <ul className="mt-3 space-y-2 text-sm text-fg-secondary">
              <li>· 本地文件 / 终端 / Git</li>
              <li>· 模型中心配置自动同步</li>
              <li>· MCP 自动安装（filesystem/memory 等）</li>
              <li>· 不包含应用中心</li>
            </ul>
            <p className="mt-4 text-xs text-fg-tertiary">桌面端源码：apps/desktop；需本机安装 opencode。</p>
          </aside>
        </div>
      </div>

      {pairing && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setPairing(null)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="devices-pairing-drawer">
            <h2 className="text-lg font-semibold">配对 OpenDream Code</h2>
            <p className="mt-2 text-sm text-fg-secondary">在桌面端填写云端地址与配对码；10 分钟内有效。</p>
            <div className="mt-5 rounded-xl border p-4 text-center" style={{ borderColor: "var(--oc-border)" }}>
              <div className="text-xs text-fg-tertiary">配对码</div>
              <div className="mt-2 font-mono text-2xl font-bold tracking-[0.2em]" data-testid="devices-pairing-code">{pairing.code}</div>
            </div>
            <div className="mt-3 text-xs text-fg-tertiary">过期时间：{formatTime(pairing.expires_at)}</div>
            <div className="mt-5 flex gap-2">
              <Button variant="primary" onClick={() => { void navigator.clipboard?.writeText(pairing.code); setToastMessage("配对码已复制"); }}>复制配对码</Button>
              <Button onClick={() => setPairing(null)}>关闭</Button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>}
    </AppShell>
  );
}
