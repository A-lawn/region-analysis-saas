/**
 * AES-256-GCM 信封加密工具
 *
 * 加密链路：
 *   ENC_KEY(env) → AES-256-GCM → secret_encrypted(DB)
 * 解密链路：
 *   secret_encrypted(DB) → AES-256-GCM → secret(内存明文)
 *
 * 安全保证：
 *   - 秘钥原文永不出现在数据库、日志、备份中
 *   - 必须同时获取 ENC_KEY + DB 才能恢复原文
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * 从环境变量加载信封加密主密钥
 * 格式：base64编码的32字节随机串
 */
function loadEncKey(): Buffer {
  const raw = process.env.ENC_KEY;
  if (!raw) {
    console.error(
      "FATAL: ENC_KEY not set. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
    process.exit(1);
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    console.error(`FATAL: ENC_KEY must be 32 bytes (got ${buf.length})`);
    process.exit(1);
  }
  return buf;
}

const ENC_KEY = loadEncKey();

/**
 * 加密明文 → base64密文
 * 格式: iv(12B) + authTag(16B) + ciphertext → base64
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * 解密base64密文 → 原文
 */
export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Invalid ciphertext: too short");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/**
 * 生成新的JWT签名密钥（明文，用于首次入库）
 */
export function generateSigningSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}
