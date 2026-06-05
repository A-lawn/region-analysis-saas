import { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler";

export function validateProjectName(req: Request, _res: Response, next: NextFunction): void {
  const name = req.body.fileName || req.body.name;
  if (name && name.length > 255) {
    throw new AppError(400, "项目名称不能超过 255 个字符", "NAME_TOO_LONG");
  }
  // Block dangerous characters
  if (name && /[<>"'&]/.test(name)) {
    throw new AppError(400, "项目名称包含非法字符", "INVALID_NAME_CHARS");
  }
  next();
}
