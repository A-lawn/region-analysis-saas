/**
 * JWT 认证中间件 — v3.0 双密钥信封加密
 *
 * 变更 (v2.0→v3.0):
 *   - JWT_SECRET → jwt_signing_keys 表（支持密钥轮换）
 *   - kid 写入 JWT Header，验签时按 kid 查找对应密钥
 *   - 密钥落库使用 AES-256-GCM 信封加密
 *   - 启动时不再检查 JWT_SECRET 环境变量
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import db from "../db";
import { decrypt } from "../utils/cryptoUtils";
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
// 内部：从DB加载并解密签名密钥
// ================================================================

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
    // 首次启动，自动用旧 JWT_SECRET 初始化
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
 * 首次启动：如果 jwt_signing_keys 表为空，用环境变量 JWT_SECRET 或自动生成
 */
async function bootstrapFirstKey(): Promise<{ kid: string; secret: string }> {
  const legacySecret = process.env.JWT_SECRET || "";
  const secret =
    legacySecret && legacySecret.length >= 32
      ? legacySecret
      : require("crypto").randomBytes(32).toString("hex");

  const { encrypt } = require("../utils/cryptoUtils");
  const kid = `k1`;
  const encrypted = encrypt(secret);

  await db.none(
    `INSERT INTO jwt_signing_keys (kid, secret_encrypted, is_active)
     VALUES ($[kid], $[secret], true)
     ON CONFLICT (kid) DO NOTHING`,
    { kid, secret: encrypted }
  );

  logger.info({ kid }, "[Auth] Bootstrapped first JWT signing key");
  return { kid, secret };
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
  const crypto = require("crypto");
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
    // 兼容旧token（无kid → 用旧JWT_SECRET直接验）
    const legacySecret = process.env.JWT_SECRET;
    if (!legacySecret) throw new Error("Legacy token but no JWT_SECRET configured");
    return jwt.verify(token, legacySecret) as unknown as AuthPayload;
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

