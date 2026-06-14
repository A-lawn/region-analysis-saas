-- ============================================================
-- Migration 014: JWT signing keys with envelope encryption
-- Replaces single JWT_SECRET env var with DB-stored encrypted
-- key pairs, supporting key rotation without mass logout.
-- ============================================================

CREATE TABLE IF NOT EXISTS jwt_signing_keys (
    kid             VARCHAR(20) PRIMARY KEY,
    secret_encrypted TEXT NOT NULL,
    algorithm       VARCHAR(10) NOT NULL DEFAULT 'HS256',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    rotated_at      TIMESTAMPTZ
);

COMMENT ON TABLE jwt_signing_keys IS 'JWT签名密钥对 — AES-256-GCM信封加密存储';
COMMENT ON COLUMN jwt_signing_keys.kid IS '密钥ID，写入JWT Header供验签时查找';
COMMENT ON COLUMN jwt_signing_keys.secret_encrypted IS 'AES-256-GCM加密的HMAC密钥';
COMMENT ON COLUMN jwt_signing_keys.is_active IS 'true=签发新token用此密钥';
COMMENT ON COLUMN jwt_signing_keys.expires_at IS '过期后不再用于验签，可安全删除';
COMMENT ON COLUMN jwt_signing_keys.rotated_at IS '被轮换时间，用于清理旧密钥';
