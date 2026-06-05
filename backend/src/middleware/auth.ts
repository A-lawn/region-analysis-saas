import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./errorHandler";

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret) {
  console.error("FATAL: JWT_SECRET not set. Please configure it in .env file.");
  process.exit(1);
}
const JWT_SECRET: string = _jwtSecret;

export interface AuthPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

// Extend Express Request to include auth info
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

export function authRequired(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError(401, "未登录，请先登录", "UNAUTHORIZED");
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as AuthPayload;
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

// Optional auth - sets user info if token present, but doesn't require it
export function authOptional(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as unknown as AuthPayload;
      req.userId = payload.userId;
      req.tenantId = payload.tenantId;
      req.userEmail = payload.email;
      req.userRole = payload.role;
    } catch (err) {
      // Token invalid, continue without auth
    }
  }
  next();
}

export function generateAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30m" });
}

export function generateRefreshToken(userId: string): string {
  const crypto = require("crypto");
  return crypto.randomBytes(40).toString("hex");
}