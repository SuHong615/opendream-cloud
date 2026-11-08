// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * 模型供应商 API Key 加密存储（AES-256-GCM）。
 * 格式：`v1.<iv-b64url>.<tag-b64url>.<ciphertext-b64url>`；密钥从 MODEL_SECRET_KEY 或 SESSION_SECRET 派生。
 */
const VERSION = "v1";

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecret(secret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(secret: string, payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const data = Buffer.from(parts[3]!, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** `sk-****abcd` 风格掩码；绝不返回明文。 */
export function maskSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  if (plaintext.length <= 8) return `****${plaintext.slice(-2)}`;
  return `${plaintext.slice(0, 3)}****${plaintext.slice(-4)}`;
}

/** 用同一个 secret 对旧数据解密；失败时返回 null（由调用方降级/报错）。 */
export function secretKeyFor(env: { MODEL_SECRET_KEY?: string; SESSION_SECRET: string }): string {
  return env.MODEL_SECRET_KEY ?? env.SESSION_SECRET;
}
