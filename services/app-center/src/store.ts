// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash, generateKeyPairSync, randomUUID, sign, verify } from "node:crypto";
import type {
  AccessRequestRecord,
  AppMemberRecord,
  AppRecord,
  AppVersionRecord,
  BuildRecord,
  CollabJobRecord,
  CollabMessageRecord,
  CollabSessionRecord,
  DeploymentRecord,
  DomainRecord,
  ProposalRecord,
  ShareRecord,
  TicketRecord,
} from "./core";

export class Store {
  readonly apps = new Map<string, AppRecord>();
  readonly builds = new Map<string, BuildRecord>();
  readonly deployments = new Map<string, DeploymentRecord>();
  readonly shares = new Map<string, ShareRecord>();
  readonly domains = new Map<string, DomainRecord>();
  readonly accessRequests = new Map<string, AccessRequestRecord>();
  readonly tickets = new Map<string, TicketRecord>();
  readonly members = new Map<string, AppMemberRecord>();
  readonly collabSessions = new Map<string, CollabSessionRecord>();
  readonly collabMessages = new Map<string, CollabMessageRecord>();
  readonly proposals = new Map<string, ProposalRecord>();
  readonly versions = new Map<string, AppVersionRecord>();
  readonly collabJobs = new Map<string, CollabJobRecord>();

  newId(): string {
    return randomUUID();
  }

  appBySlug(orgId: string, slug: string): AppRecord | undefined {
    for (const app of this.apps.values()) {
      if (app.org_id === orgId && app.slug === slug && !app.deleted) return app;
    }
    return undefined;
  }

  hostTaken(host: string): boolean {
    for (const app of this.apps.values()) if (app.host === host && !app.deleted) return true;
    for (const domain of this.domains.values()) if (domain.hostname === host) return true;
    return false;
  }

  sharesOf(appId: string): ShareRecord[] {
    return [...this.shares.values()].filter((share) => share.app_id === appId);
  }

  domainsOf(appId: string): DomainRecord[] {
    return [...this.domains.values()].filter((domain) => domain.app_id === appId);
  }

  buildsOf(appId: string): BuildRecord[] {
    return [...this.builds.values()].filter((build) => build.app_id === appId).sort((a, b) => a.build_no - b.build_no);
  }

  deploymentsOf(appId: string): DeploymentRecord[] {
    return [...this.deployments.values()]
      .filter((deployment) => deployment.app_id === appId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  membersOf(appId: string): AppMemberRecord[] {
    return [...this.members.values()]
      .filter((member) => member.app_id === appId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  messagesOf(appId: string): CollabMessageRecord[] {
    return [...this.collabMessages.values()]
      .filter((message) => message.app_id === appId)
      .sort((a, b) => a.seq - b.seq);
  }

  proposalsOf(appId: string): ProposalRecord[] {
    return [...this.proposals.values()]
      .filter((proposal) => proposal.app_id === appId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  versionsOf(appId: string): AppVersionRecord[] {
    return [...this.versions.values()]
      .filter((version) => version.app_id === appId)
      .sort((a, b) => a.version - b.version);
  }
}

export class TicketSigner {
  private readonly privateKey;
  readonly publicKey;
  constructor() {
    const pair = generateKeyPairSync("ed25519");
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
  }

  sign(payload: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = sign(null, Buffer.from(body), this.privateKey).toString("base64url");
    return `v1.${body}.${signature}`;
  }

  verify(ticket: string): Record<string, unknown> | null {
    const parts = ticket.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return null;
    const body = parts[1]!;
    const ok = verify(null, Buffer.from(body), this.publicKey, Buffer.from(parts[2]!, "base64url"));
    if (!ok) return null;
    try {
      return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export function contentDigest(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}
