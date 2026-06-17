-- ============================================================
-- Migration 019: Quick Analysis Project & System Config
-- Adds temporary project flag + system-level configuration table
-- ============================================================

-- 019a: 临时项目标记
ALTER TABLE analysis_projects
    ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN analysis_projects.is_temporary IS '临时项目标记（快速分析生成），定期清理';

-- 019b: 全局系统配置表
CREATE TABLE IF NOT EXISTS system_config (
    config_key VARCHAR(128) PRIMARY KEY,
    config_value JSONB NOT NULL DEFAULT 'null',
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE system_config IS '系统级全局配置，管理员可通过SQL直接修改';

-- 019c: users 表添加 metadata 列
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 019d: 默认配置：分层订阅模式
INSERT INTO system_config (config_key, config_value, description)
VALUES ('subscription_mode', '"tiered"', '订阅模式：tiered=分层, full_access=全员专业')
ON CONFLICT (config_key) DO NOTHING;
