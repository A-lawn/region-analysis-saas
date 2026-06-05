import { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler";

const VALID_CRS = ["wgs84", "gcj02", "bd09"] as const;
const VALID_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export function validateUpload(req: Request, _res: Response, next: NextFunction): void {
  if (!req.file) {
    throw new AppError(400, "请上传文件", "FILE_REQUIRED");
  }

  const ext = req.file.originalname.toLowerCase();
  const hasValidExt = VALID_EXTENSIONS.some((validExt) => ext.endsWith(validExt));
  if (!hasValidExt) {
    throw new AppError(400, "只支持 .xlsx, .xls, .csv 格式", "INVALID_FILE_TYPE");
  }

  const sourceCrs = (req.body.source_crs || "gcj02") as string;
  if (!VALID_CRS.includes(sourceCrs as any)) {
    throw new AppError(400, "无效的坐标系，可选值为 wgs84, gcj02, bd09", "INVALID_CRS");
  }

  next();
}
