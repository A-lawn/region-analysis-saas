-- 018: 用户注册协议同意记录 & IP/UA 合规采集
-- 新增字段：terms_agreed_at（同意时间）、terms_version（协议版本号）、
--          agreement_ip（原始IP，内部合规用）、agreement_ua（User-Agent）

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS terms_version VARCHAR(16),
    ADD COLUMN IF NOT EXISTS agreement_ip VARCHAR(45),
    ADD COLUMN IF NOT EXISTS agreement_ua TEXT;

COMMENT ON COLUMN users.terms_agreed_at IS '用户最近一次同意服务协议和隐私政策的时间';
COMMENT ON COLUMN users.terms_version IS '用户同意的协议版本号，如 v1.0';
COMMENT ON COLUMN users.agreement_ip IS '用户同意协议时的客户端IP地址（仅内部合规记录，不在界面展示）';
COMMENT ON COLUMN users.agreement_ua IS '用户同意协议时的浏览器 User-Agent（仅内部合规记录，不在界面展示）';
