/**
 * JWT 认证中间件 — v3.0 双密钥信封加密 + v3.1 自动轮换
 *
 * 变更 (v2.0→v3.0):
 *   - JWT_SECRET → jwt_signing_keys 表（支持密钥轮换）
 *   - kid 写入 JWT Header，验签时按 kid 查找对应密钥
 *   - 密钥落库使用 AES-256-GCM 信封加密
 *   - 启动时不再检查 JWT_SECRET 环境变量
 *
 * 变更 (v3.1):
 *   - kid 格式：自增 k1 → 随机 UUID v4
 *   - 自动轮换：服务启动后每 7 天检查一次，30天后轮换
 *   - 旧密钥保留 90 天用于验签，过期自动清理
 *   - expires_at / rotated_at 自动维护
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import db from "../db";
import { decrypt, encrypt } from "../utils/cryptoUtils";
import { AppError } from "./errorHandler";
import logger from "../utils/logger";

export interface AuthPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      tenantId?: string;
      userEmail?: string;
      userRole?: string;
    }
  }
}

// ================================================================
// 常量
// ================================================================

/** 密钥最长有效期（超过后不再用于签发，仅验签） */
const KEY_MAX_AGE_DAYS = 30;

/** 旧密钥保留天数（超过后从 DB 删除） */
const KEY_RETENTION_DAYS = 90;

/** 自动轮换检查间隔 */
const ROTATION_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

// ================================================================
// 内部：从DB加载并解密签名密钥
// ================================================================

/**
 * 生成随机 kid（UUID v4）
 */
function generateKid(): string {
  return crypto.randomUUID();
}

/**
 * 生成随机 JWT 签名密钥（256-bit hex）
 */
function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * 获取当前活跃的签名密钥（用于签发新token）
 */
async function getActiveKey(): Promise<{ kid: string; secret: string }> {
  const row = await db.oneOrNone(
    `SELECT kid, secret_encrypted
     FROM jwt_signing_keys
     WHERE is_active = true
     ORDER BY created_at DESC
     LIMIT 1`
  );

  if (!row) {
    return await bootstrapFirstKey();
  }

  return {
    kid: row.kid,
    secret: decrypt(row.secret_encrypted),
  };
}

/**
 * 按 kid 查找密钥（用于验签）
 */
async function getKeyByKid(kid: string): Promise<string | null> {
  const row = await db.oneOrNone(
    `SELECT secret_encrypted FROM jwt_signing_keys WHERE kid = $[kid]`,
    { kid }
  );
  if (!row) return null;
  return decrypt(row.secret_encrypted);
}

/**
 * 首次启动：如果 jwt_signing_keys 表为空，自动初始化
 */
async function bootstrapFirstKey(): Promise<{ kid: string; secret: string }> {
  const secret = generateSecret();
  const kid = generateKid();
  const encrypted = encrypt(secret);
  const expiresAt = new Date(Date.now() + KEY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  await db.none(
    `INSERT INTO jwt_signing_keys (kid, secret_encrypted, is_active, created_at, expires_at)
     VALUES ($[kid], $[secret], true, NOW(), $[expiresAt])
     ON CONFLICT (kid) DO NOTHING`,
    { kid, secret: encrypted, expiresAt }
  );

  logger.info({ kid }, "[Auth] Bootstrapped first JWT signing key (auto-generated)");
  return { kid, secret };
}

// ================================================================
// 密钥轮换
// ================================================================

/**
 * 轮换签名密钥（零停机）
 *
 * 1. 生成新密钥 → 写入 DB，is_active=true，expires_at=NOW()+30天
 * 2. 旧密钥 → is_active=false，rotated_at=NOW()
 * 3. 清理超过保留期的旧密钥
 */
export async function rotateKey(): Promise<{ kid: string; rotated: boolean }> {
  const activeRow = await db.oneOrNone(
    `SELECT kid, created_at FROM jwt_signing_keys
     WHERE is_active = true
     ORDER BY created_at DESC LIMIT 1`
  );

  // 距离上次轮换未超过最小轮换间隔，跳过
  if (activeRow) {
    const ageDays = (Date.now() - new Date(activeRow.created_at).getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays < KEY_MAX_AGE_DAYS) {
      return { kid: activeRow.kid, rotated: false };
    }
  }

  // 1. 生成新密钥
  const newKid = generateKid();
  const newSecret = generateSecret();
  const encrypted = encrypt(newSecret);
  const expiresAt = new Date(Date.now() + KEY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  await db.none(
    `INSERT INTO jwt_signing_keys (kid, secret_encrypted, is_active, created_at, expires_at)
     VALUES ($[kid], $[secret], true, NOW(), $[expiresAt])`,
    { kid: newKid, secret: encrypted, expiresAt }
  );

  // 2. 旧密钥标记为非活跃
  await db.none(
    `UPDATE jwt_signing_keys
     SET is_active = false, rotated_at = NOW(), expires_at = NOW()
     WHERE is_active = true AND kid != $[kid]`,
    { kid: newKid }
  );

  // 3. 清理超过保留期的旧密钥
  await db.none(
    `DELETE FROM jwt_signing_keys
     WHERE is_active = false
       AND rotated_at < NOW() - INTERVAL '${KEY_RETENTION_DAYS} days'`
  );

  logger.info({ oldKid: activeRow?.kid, newKid }, "[Auth] JWT signing key rotated");
  return { kid: newKid, rotated: true };
}

/**
 * 启动定时轮换任务
 */
export function startKeyRotation(): NodeJS.Timeout {
  logger.info({ intervalMs: ROTATION_CHECK_INTERVAL_MS, maxAgeDays: KEY_MAX_AGE_DAYS }, "[Auth] Key rotation scheduler started");

  // 首次启动后延迟 10 秒检查一次（避免刚初始化就轮换）
  setTimeout(() => rotateKey().catch(err => logger.error({ err }, "[Auth] Initial rotation check failed")), 10_000);

  // 之后每 7 天检查一次
  return setInterval(() => {
    rotateKey().catch(err => logger.error({ err }, "[Auth] Key rotation failed"));
  }, ROTATION_CHECK_INTERVAL_MS);
}

// ================================================================
// 公开API：签发
// ================================================================

export async function generateAccessToken(payload: AuthPayload): Promise<string> {
  const { kid, secret } = await getActiveKey();
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: "30m",
    header: { kid } as unknown as jwt.JwtHeader,
  } as jwt.SignOptions);
}

export function generateRefreshToken(userId: string): string {
  return crypto.randomBytes(40).toString("hex");
}

// ================================================================
// 公开API：验签
// ================================================================

async function verifyToken(token: string): Promise<AuthPayload> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string") {
    throw new Error("Invalid token format");
  }

  const kid = (decoded.header as any)?.kid;
  if (!kid) {
    throw new Error("Token missing kid header");
  }

  const secret = await getKeyByKid(kid);
  if (!secret) throw new Error("Unknown signing key");

  return jwt.verify(token, secret, { algorithms: ["HS256"] }) as unknown as AuthPayload;
}

// ================================================================
// 中间件
// ================================================================

export async function authRequired(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError(401, "未登录，请先登录", "UNAUTHORIZED");
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyToken(token);
    req.userId = payload.userId;
    req.tenantId = payload.tenantId;
    req.userEmail = payload.email;
    req.userRole = payload.role;
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw new AppError(401, "登录已过期，请重新登录", "TOKEN_EXPIRED");
    }
    throw new AppError(401, "无效的登录凭证", "INVALID_TOKEN");
  }
}

export async function authOptional(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const payload = await verifyToken(token);
      req.userId = payload.userId;
      req.tenantId = payload.tenantId;
      req.userEmail = payload.email;
      req.userRole = payload.role;
    } catch {
      // Token invalid, continue without auth
    }
  }
  next();
}