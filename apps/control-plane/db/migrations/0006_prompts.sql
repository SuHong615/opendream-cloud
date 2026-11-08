CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  model_ref TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prompts_org ON prompts (org_id, updated_at);

INSERT INTO prompts (id, org_id, name, description, content, variables, tags, model_ref, created_by, created_at, updated_at)
SELECT 'prompt-system-invoice', NULL, '发票信息抽取', '从发票文本抽取结构化字段，输出 JSON。',
       '你是财务票据抽取助手。请从以下文本中抽取 invoice_no、date、amount、tax、vendor，仅输出 JSON：\n{{text}}',
       '["text"]', '["finance","extraction"]', 'default-coding', 'system', 1794096000000, 1794096000000
WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE id = 'prompt-system-invoice');

INSERT INTO prompts (id, org_id, name, description, content, variables, tags, model_ref, created_by, created_at, updated_at)
SELECT 'prompt-system-support', NULL, '客服问题分诊', '对客户问题分类并给出处理建议。',
       '你是企业客服分诊助手。将问题分为 billing/technical/account/other，给出优先级与建议回复：\n{{question}}',
       '["question"]', '["support","triage"]', 'default-coding', 'system', 1794096000000, 1794096000000
WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE id = 'prompt-system-support');

INSERT INTO prompts (id, org_id, name, description, content, variables, tags, model_ref, created_by, created_at, updated_at)
SELECT 'prompt-system-code-review', NULL, '代码审查', '按团队规范审查代码变更。',
       '你是资深代码审查员。请审查以下 diff，输出阻塞问题、建议与风险等级：\n{{diff}}',
       '["diff"]', '["sdlc","review"]', 'default-coding', 'system', 1794096000000, 1794096000000
WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE id = 'prompt-system-code-review');

INSERT INTO prompts (id, org_id, name, description, content, variables, tags, model_ref, created_by, created_at, updated_at)
SELECT 'prompt-system-sql', NULL, 'SQL 生成', '根据业务问题生成安全 SQL。',
       '你是数据分析助手。根据表结构 {{schema}} 与问题 {{question}} 生成只读 SQL，禁止 DDL/DML。',
       '["schema","question"]', '["data","sql"]', 'default-coding', 'system', 1794096000000, 1794096000000
WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE id = 'prompt-system-sql');
