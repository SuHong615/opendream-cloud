// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export interface CookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
}

const COOKIE_JAR = Symbol("oc-cookie-jar");
export function setCookie(reply: FastifyReply, name: string, value: string, options: CookieOptions = {}): void {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) segments.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly !== false) segments.push("HttpOnly");
  if (options.secure !== false) segments.push("Secure");
  segments.push(`SameSite=${options.sameSite ?? "Lax"}`);
  const holder = reply as unknown as { [COOKIE_JAR]?: string[] };
  holder[COOKIE_JAR] = [...(holder[COOKIE_JAR] ?? []), segments.join("; ")];
}

export function flushCookies(reply: FastifyReply): void {
  const holder = reply as unknown as { [COOKIE_JAR]?: string[] };
  const jar = holder[COOKIE_JAR];
  if (jar && jar.length > 0) {
    reply.header("set-cookie", jar);
    holder[COOKIE_JAR] = [];
  }
}

export function clearCookie(reply: FastifyReply, name: string, path = "/"): void {
  setCookie(reply, name, "", { maxAge: 0, path });
}

export function requestIdOf(request: FastifyRequest | undefined | null): string {
  const header = request?.headers?.["x-request-id"];
  return typeof header === "string" && header.length > 0 ? header : crypto.randomUUID();
}

export function clientIp(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0]!.trim();
  return request.ip;
}

export function iso(ms: number | null | undefined): string | null {
  return typeof ms === "number" ? new Date(ms).toISOString() : null;
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function pageLimit(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isInteger(n) || n < 1) return 20;
  return Math.min(n, 100);
}
