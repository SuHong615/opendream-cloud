// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export interface PromptAsset {
  id: string;
  org_id?: string | null;
  name: string;
  description: string;
  content: string;
  variables: string[];
  tags: string[];
  model_ref?: string | null;
  created_by?: string | null;
  created_at?: number | string;
  updated_at?: number | string;
  system?: boolean;
}

export interface PromptInput {
  name: string;
  description?: string;
  content: string;
  variables?: string[];
  tags?: string[];
  model_ref?: string | null;
}
