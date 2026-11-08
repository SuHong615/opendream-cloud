// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * mock 相似度：词法 token 重合 + 子串命中加成（确定性，无外部 embedding 依赖）。
 * 真实实现接 embedding 模型 / 向量库（mem0 vector store），见 README 已知限制。
 */
export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]/gu);
  return matches ?? [];
}

export function scoreText(query: string, text: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedText = text.toLowerCase();
  if (!normalizedQuery || !normalizedText) return 0;
  const queryTokens = tokenize(normalizedQuery);
  if (queryTokens.length === 0) return 0;
  const textTokens = new Set(tokenize(normalizedText));
  const overlap = queryTokens.filter((token) => textTokens.has(token)).length / queryTokens.length;
  const substringBonus = normalizedText.includes(normalizedQuery) ? 0.2 : 0;
  return Math.min(1, Math.round((overlap * 0.8 + substringBonus) * 1000) / 1000);
}

/** 按 score 阈值过滤 + 降序 + top_k 截断。 */
export function rankByScore<T>(items: T[], query: string, textOf: (item: T) => string, topK: number, threshold: number): Array<T & { score: number }> {
  return items
    .map((item) => ({ item, score: scoreText(query, textOf(item)) }))
    .filter((entry) => entry.score > 0 && entry.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry) => ({ ...entry.item, score: entry.score }));
}
