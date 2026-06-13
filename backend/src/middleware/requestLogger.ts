// Request logging middleware with privacy desensitization
// Integrates structured logging + sensitive field masking

import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { desensitize } from "../utils/desensitize";
import { v4 as uuidv4 } from "uuid";

function getTraceId(req: Request): string {
  const header = req.headers["x-trace-id"];
  if (typeof header === "string" && header.length > 0) return header;
  return uuidv4();
}

function safeReqInfo(req: Request): Record<string, any> {
  return {
    method: req.method,
    path: req.path,
    query: desensitize(req.query),
    ip: req.ip,
    userAgent: req.headers["user-agent"]?.substring(0, 200),
  };
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const traceId = getTraceId(req);
  (req as any).traceId = traceId;
  res.setHeader("X-Trace-Id", traceId);

  const start = Date.now();
  const info = safeReqInfo(req);
  info.traceId = traceId;

  logger.info(info, "[HTTP] --> " + req.method + " " + req.path);

  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
    logger[level](
      { traceId, statusCode, durationMs: duration, method: req.method, path: req.path },
      "[HTTP] <-- " + req.method + " " + req.path + " " + statusCode + " " + duration + "ms"
    );
  });

  next();
}

export function bodyLogger(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && Object.keys(req.body).length > 0) {
    const traceId = (req as any).traceId || "unknown";
    logger.debug(
      { traceId, body: desensitize(req.body) },
      "[HTTP] Body: " + req.method + " " + req.path
    );
  }
  next();
}
