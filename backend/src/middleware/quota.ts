import { Request, Response, NextFunction } from "express";
import db from "../db";
import { AppError } from "./errorHandler";

export interface PlanLimits {
  maxProjects: number;
  maxPointsPerProject: number;
  analyses: string[];
}

const PLANS: Record<string, PlanLimits> = {
  free: { maxProjects: 3, maxPointsPerProject: 500, analyses: ["coverage", "cluster"] },
  pro: { maxProjects: 50, maxPointsPerProject: 10000, analyses: ["coverage", "heatmap", "cluster", "site-optimization"] },
  enterprise: { maxProjects: 999999, maxPointsPerProject: 999999, analyses: ["coverage", "heatmap", "cluster", "site-optimization"] },
};

async function getTenantPlan(tenantId: string): Promise<string> {
  if (!tenantId || tenantId === "default") return "enterprise";
  const sub = await db.oneOrNone(
    `SELECT plan FROM subscriptions
     WHERE tenant_id = $[tenantId]
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    { tenantId }
  );
  return sub?.plan || "free";
}

export async function checkProjectLimit(req: Request, _res: Response, next: NextFunction) {
  try {
    const tenantId = (req as any).tenantId || "default";
    const plan = await getTenantPlan(tenantId);
    const limits = PLANS[plan] || PLANS.free;
    const count = await db.one(
      `SELECT COUNT(*)::INTEGER AS cnt FROM analysis_projects WHERE tenant_id = $[tenantId] AND deleted_at IS NULL`,
      { tenantId }
    );
    if (count.cnt >= limits.maxProjects) {
      throw new AppError(403, "套餐限制：最多 " + limits.maxProjects + " 个项目，请升级套餐", "QUOTA_PROJECTS_EXCEEDED");
    }
    next();
  } catch (err) {
    if (err instanceof AppError) throw err;
    next(err);
  }
}

export async function checkPointLimit(req: Request, _res: Response, next: NextFunction) {
  try {
    const tenantId = (req as any).tenantId || "default";
    const plan = await getTenantPlan(tenantId);
    const limits = PLANS[plan] || PLANS.free;
    const pointCount = (req.body?.rows?.length) || 0;
    if (pointCount > limits.maxPointsPerProject) {
      throw new AppError(403, "套餐限制：每个项目最多 " + limits.maxPointsPerProject + " 个点位", "QUOTA_POINTS_EXCEEDED");
    }
    next();
  } catch (err) {
    if (err instanceof AppError) throw err;
    next(err);
  }
}

export async function logUsage(tenantId: string, endpoint: string, pointsCount: number = 0): Promise<void> {
  try {
    await db.none(
      "INSERT INTO api_usage_logs (tenant_id, endpoint, points_count) VALUES ($1, $2, $3)",
      [tenantId || "default", endpoint, pointsCount]
    );
  } catch {}
}