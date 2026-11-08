// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/** Memory / Experience 服务共享类型（内存 store）。 */

export interface Tenant {
  orgId: string;
  userId: string;
}

export interface MemoryRecord {
  id: string;
  orgId: string;
  userId: string;
  agentId: string | null;
  memory: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryView {
  id: string;
  memory: string;
  user_id: string;
  agent_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ScoredMemoryView extends MemoryView {
  score: number;
}

export interface ExperienceRecord {
  id: string;
  orgId: string;
  title: string;
  content: string;
  tags: string[];
  source: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExperienceView {
  id: string;
  title: string;
  content: string;
  tags: string[];
  source: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScoredExperienceView extends ExperienceView {
  score: number;
}

/** mem0 `add` 的 message 形态。 */
export interface MemoryMessage {
  role: string;
  content: string;
}
