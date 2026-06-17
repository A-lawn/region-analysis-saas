-- ============================================================
-- Migration 008: Log Retention & Privacy Desensitization
-- Adds log retention config, privacy desensitization rules,
-- and structured logging tables
-- ============================================================

-- ===== 8.1 Log Retention Configuration =====
CREATE TABLE IF NOT EXISTS log_retention_config (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value TEXT NOT NULL,
    config_type VARCHAR(20) NOT NULL DEFAULT 'string',
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO log_retention_config (config_key, config_value, config_type, description) VALUES
    ('api_log_retention_days', '90', 'integer', 'API usage log retention period in days'),
    ('error_log_retention_days', '180', 'integer', 'Error log retention period in days'),
    ('audit_log_retention_days', '365', 'integer', 'Audit log retention period in days'),
    ('analysis_result_retention_days', '30', 'integer', 'Cached analysis result retention in days'),
    ('log_level', 'info', 'string', 'Default log level: debug|info|warn|error'),
    ('structured_logging', 'true', 'boolean', 'Enable structured JSON logging'),
    ('log_to_db', 'true', 'boolean', 'Whether to persist logs to database')
ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    config_type = EXCLUDED.config_type,
    description = EXCLUDED.description;

-- ===== 8.2 Structured Application Log Table =====
CREATE TABLE IF NOT EXISTS application_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level VARCHAR(10) NOT NULL DEFAULT 'info',
    module VARCHAR(100),
    operation VARCHAR(100),
    message TEXT,
    context JSONB DEFAULT '{}',
    trace_id VARCHAR(64),
    user_id VARCHAR(64),
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_timestamp ON application_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON application_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_module ON application_logs(module);
CREATE INDEX IF NOT EXISTS idx_app_logs_trace ON application_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_user ON application_logs(user_id);

COMMENT ON TABLE application_logs IS 'Structured application logs with context and trace support';

-- ===== 8.3 Privacy Desensitization Rules =====
CREATE TABLE IF NOT EXISTS privacy_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_pattern VARCHAR(200) NOT NULL,
    field_type VARCHAR(30) NOT NULL CHECK (field_type IN ('email', 'phone', 'id_card', 'name', 'address', 'ip', 'custom')),
    mask_strategy VARCHAR(30) NOT NULL DEFAULT 'partial_mask' CHECK (mask_strategy IN ('partial_mask', 'full_mask', 'hash', 'replace')),
    mask_char VARCHAR(5) DEFAULT '*',
    keep_prefix INTEGER DEFAULT 3,
    keep_suffix INTEGER DEFAULT 2,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed desensitization rules
INSERT INTO privacy_rules (field_pattern, field_type, mask_strategy, mask_char, keep_prefix, keep_suffix) VALUES
    ('email', 'email', 'partial_mask', '*', 2, 3),
    ('phone', 'phone', 'partial_mask', '*', 3, 4),
    ('id_card', 'id_card', 'partial_mask', '*', 4, 4),
    ('password', 'custom', 'full_mask', '*', 0, 0),
    ('address', 'address', 'partial_mask', '*', 6, 0),
    ('ip_address', 'ip', 'partial_mask', '*', 3, 0),
    ('lat|lng|latitude|longitude', 'custom', 'partial_mask', '*', 2, 2),
    ('name|姓名|contact', 'name', 'partial_mask', '*', 1, 1),
    ('token|secret|key', 'custom', 'full_mask', '*', 0, 0),
    ('metadata|raw_data|payload', 'custom', 'hash', '', 0, 0)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE privacy_rules IS 'Privacy desensitization rules for structured logging';

-- ===== 8.4 Scheduled Cleanup Function =====
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS TABLE(table_name TEXT, rows_deleted BIGINT) AS $$
DECLARE
    retention_days INTEGER;
    row_count BIGINT;
    log_table RECORD;
BEGIN
    FOR log_table IN
        SELECT t.table_name
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_name IN ('api_usage_logs', 'application_logs', 'analysis_results')
    LOOP
        SELECT COALESCE(
            (SELECT config_value::INTEGER FROM log_retention_config
             WHERE config_key = CASE
                WHEN log_table.table_name = 'api_usage_logs' THEN 'api_log_retention_days'
                WHEN log_table.table_name = 'application_logs' THEN 'error_log_retention_days'
                WHEN log_table.table_name = 'analysis_results' THEN 'analysis_result_retention_days'
                ELSE '90'
             END),
            90
        ) INTO retention_days;

        EXECUTE format(
            'WITH deleted AS (DELETE FROM %I WHERE created_at < NOW() - INTERVAL ''%s days'' RETURNING 1)
             SELECT COUNT(*) FROM deleted',
            log_table.table_name, retention_days
        ) INTO row_count;

        table_name := log_table.table_name;
        rows_deleted := row_count;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_logs() IS 'Scheduled cleanup function for log retention policies';
