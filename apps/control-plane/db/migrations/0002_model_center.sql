-- 0002_model_center.sql — 企业/第三方模型中心（G4+）
-- 说明：SQLite 无法在保留 FK 数据的前提下修改 CHECK（DROP TABLE 会触发 FK），
-- 因此本迁移采用 ALTER ADD COLUMN；kind 的新取值（deepseek/qwen/kimi/glm/ollama/vllm）
-- 在 DB 层归一化为 `custom`，原始值存 `preset_id`，API/配置生成使用 preset_id 还原 kind。
ALTER TABLE model_providers ADD COLUMN api_key_cipher TEXT;
ALTER TABLE model_providers ADD COLUMN default_model_id TEXT;
ALTER TABLE model_providers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model_providers ADD COLUMN preset_id TEXT;
ALTER TABLE model_providers ADD COLUMN models_synced_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_active_per_org
  ON model_providers(ifnull(org_id,'')) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_provider_preset ON model_providers(preset_id);
