import logger from "../utils/logger";
﻿// Unified error handling for the application

export class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || "UNKNOWN_ERROR";
    // Capture stack trace, excluding constructor from it
    Error.captureStackTrace(this, this.constructor);
  }
}

import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
    return;
  }

  // Multer file filter errors (file type rejection)
  if (err.message && err.message.startsWith("只支持")) {
    res.status(400).json({ error: err.message, code: "INVALID_FILE_TYPE" });
    return;
  }

  // Multer file size limit
  if ((err as any).code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ error: "文件大小超出限制", code: "FILE_TOO_LARGE" });
    return;
  }

  // Unknown errors
  // Error logged by requestLogger middleware (with trace ID)
  const message = process.env.NODE_ENV === "production"
    ? "服务器内部错误"
    : err.message || "服务器内部错误";

  res.status(500).json({
    error: message,
    code: "INTERNAL_ERROR",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}
