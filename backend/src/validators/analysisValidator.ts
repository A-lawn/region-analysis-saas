import { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler";

export function validateCoverageParams(req: Request, _res: Response, next: NextFunction): void {
  const radius = parseInt(req.query.radius as string) || 3000;
  if (radius < 50 || radius > 30000) {
    throw new AppError(400, "半径必须在 50-30000 米之间", "INVALID_RADIUS");
  }
  next();
}

export function validateHeatmapParams(req: Request, _res: Response, next: NextFunction): void {
  const bandwidth = parseInt(req.query.bandwidth as string) || 1000;
  const gridSize = parseInt(req.query.gridSize as string) || 500;
  if (bandwidth < 100 || bandwidth > 10000) {
    throw new AppError(400, "带宽必须在 100-10000 米之间", "INVALID_BANDWIDTH");
  }
  if (gridSize < 50 || gridSize > 5000) {
    throw new AppError(400, "网格大小必须在 50-5000 米之间", "INVALID_GRID_SIZE");
  }
  next();
}

export function validateClusterParams(req: Request, _res: Response, next: NextFunction): void {
  const eps = parseInt(req.query.eps as string) || 500;
  const minPoints = parseInt(req.query.minPoints as string) || 3;
  if (eps < 50 || eps > 10000) {
    throw new AppError(400, "eps 必须在 50-10000 米之间", "INVALID_EPS");
  }
  if (minPoints < 2 || minPoints > 50) {
    throw new AppError(400, "minPoints 必须在 2-50 之间", "INVALID_MIN_POINTS");
  }
  next();
}

export function validateSiteOptimizationParams(req: Request, _res: Response, next: NextFunction): void {
  const { candidates, weights, topK } = req.body;
  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    throw new AppError(400, "请提供至少一个候选位置", "CANDIDATES_REQUIRED");
  }
  if (candidates.length > 100) {
    throw new AppError(400, "候选位置一次最多 100 个", "TOO_MANY_CANDIDATES");
  }
  for (const c of candidates) {
    if (typeof c.lng !== "number" || typeof c.lat !== "number" ||
        isNaN(c.lng) || isNaN(c.lat) ||
        c.lng < -180 || c.lng > 180 || c.lat < -90 || c.lat > 90) {
      throw new AppError(400, "候选位置包含无效坐标", "INVALID_CANDIDATE_COORD");
    }
  }
  if (weights) {
    for (const key of ["distanceWeight", "blindSpotWeight", "densityWeight"]) {
      const val = weights[key];
      if (val !== undefined && (typeof val !== "number" || val < 0 || val > 1)) {
        throw new AppError(400, `权重 ${key} 必须在 0-1 之间`, "INVALID_WEIGHT");
      }
    }
  }
  if (topK !== undefined && (typeof topK !== "number" || topK < 1 || topK > 20)) {
    throw new AppError(400, "topK 必须在 1-20 之间", "INVALID_TOPK");
  }
  next();
}
