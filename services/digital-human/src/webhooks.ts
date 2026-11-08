// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHmac, randomBytes } from "node:crypto";
import type { Env } from "./env";
import type { Tenant } from "./types";

/** Webhook 注册记录（内存；真实实现落 `dh_webhooks` + KMS secret_ref）。 */
export interface WebhookRecord {
  id: string;
  orgId: string;
  userId: string;
  url: string;
  events: string[];
  secret: string;
  status: "active" | "disabled";
  description: string | null;
  createdAt: number;
  updatedAt: number;
  deliveryAttempts: number;
  lastDeliveryAt: number | null;
  lastStatus: number | null;
}

export interface WebhookView {
  webhook_id: string;
  url: string;
  events: string[];
  status: "active" | "disabled";
  description: string | null;
  secret_masked: string;
  created_at: string;
  updated_at: string;
  delivery_attempts: number;
  last_delivery_at: string | null;
  last_status: number | null;
}

export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface WebhookRegisterInput {
  url: string;
  events?: string[];
  description?: string;
}

const ALL_EVENTS = ["dh.session.*", "dh.message"] as const;

export function maskSecret(secret: string): string {
  const tail = secret.slice(-4);
  return `${secret.slice(0, 6)}****${tail}`;
}

/** HMAC-SHA256 签名串：`t=<unix 秒>,v1=<hex>`；被签名内容 `${t}.${rawBody}`。 */
export function signWebhook(secret: string, timestampSeconds: number, rawBody: string): string {
  const digest = createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestampSeconds},v1=${digest}`;
}

function matches(events: string[], eventType: string): boolean {
  return events.some((pattern) => {
    if (pattern === eventType) return true;
    if (pattern.endsWith(".*")) return eventType.startsWith(pattern.slice(0, -1));
    return false;
  });
}

/**
 * Webhook 注册与投递（mock 回调）：注册时返回一次明文 secret，列表只回显掩码；
 * 会话事件异步 POST 到注册 URL，带 HMAC 签名；失败按 env.WEBHOOK_MAX_ATTEMPTS 重试。
 * 注：L1 不校验 URL 私网/SSRF（仅 owner/admin 经门面可注册），见 README KNOWN-GAPS。
 */
export class WebhookRegistry {
  private readonly webhooks = new Map<string, WebhookRecord>();

  constructor(
    private readonly env: Env,
    private readonly now: () => Date = () => new Date(),
  ) {}

  register(tenant: Tenant, input: WebhookRegisterInput): { view: WebhookView; secret: string } {
    const now = this.now().getTime();
    const secret = `whsec_${randomBytes(24).toString("base64url")}`;
    const record: WebhookRecord = {
      id: crypto.randomUUID(),
      orgId: tenant.orgId,
      userId: tenant.userId,
      url: input.url,
      events: input.events && input.events.length > 0 ? [...input.events] : [...ALL_EVENTS],
      secret,
      status: "active",
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
      deliveryAttempts: 0,
      lastDeliveryAt: null,
      lastStatus: null,
    };
    this.webhooks.set(record.id, record);
    return { view: this.view(record), secret };
  }

  list(tenant: Tenant): WebhookView[] {
    return [...this.webhooks.values()]
      .filter((record) => record.orgId === tenant.orgId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((record) => this.view(record));
  }

  get(tenant: Tenant, id: string): WebhookView | undefined {
    const record = this.webhooks.get(id);
    if (!record || record.orgId !== tenant.orgId) return undefined;
    return this.view(record);
  }

  delete(tenant: Tenant, id: string): boolean {
    const record = this.webhooks.get(id);
    if (!record || record.orgId !== tenant.orgId) return false;
    return this.webhooks.delete(id);
  }

  count(): number {
    return this.webhooks.size;
  }

  /** 事件 fan-out（fire-and-forget；失败只记日志，不阻塞会话请求）。 */
  publish(tenant: Tenant, event: WebhookEvent): void {
    const now = this.now().getTime();
    for (const record of this.webhooks.values()) {
      if (record.status !== "active") continue;
      if (record.orgId !== tenant.orgId) continue;
      if (!matches(record.events, event.type)) continue;
      void this.deliver(record, event, now);
    }
  }

  private async deliver(record: WebhookRecord, event: WebhookEvent, timestamp: number): Promise<void> {
    const deliveryId = crypto.randomUUID();
    const body = JSON.stringify({
      id: deliveryId,
      type: event.type,
      created_at: new Date(timestamp).toISOString(),
      data: event.data,
    });
    const signature = signWebhook(record.secret, Math.floor(timestamp / 1000), body);
    for (let attempt = 1; attempt <= this.env.WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(record.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "opendream-cloud-digital-human/0.1",
            "x-dh-event": event.type,
            "x-dh-delivery": deliveryId,
            "x-dh-signature": signature,
            "x-oc-org-id": record.orgId,
          },
          body,
          signal: AbortSignal.timeout(this.env.WEBHOOK_TIMEOUT_MS),
        });
        record.deliveryAttempts += 1;
        record.lastDeliveryAt = this.now().getTime();
        record.lastStatus = response.status;
        if (response.ok) return;
      } catch (error) {
        record.deliveryAttempts += 1;
        record.lastDeliveryAt = this.now().getTime();
        record.lastStatus = null;
        console.warn(`[digital-human] webhook ${record.id} delivery failed (attempt ${attempt}):`, error);
      }
      if (attempt < this.env.WEBHOOK_MAX_ATTEMPTS) await Bun.sleep(20 * attempt);
    }
  }

  private view(record: WebhookRecord): WebhookView {
    return {
      webhook_id: record.id,
      url: record.url,
      events: record.events,
      status: record.status,
      description: record.description,
      secret_masked: maskSecret(record.secret),
      created_at: new Date(record.createdAt).toISOString(),
      updated_at: new Date(record.updatedAt).toISOString(),
      delivery_attempts: record.deliveryAttempts,
      last_delivery_at: record.lastDeliveryAt ? new Date(record.lastDeliveryAt).toISOString() : null,
      last_status: record.lastStatus,
    };
  }
}
