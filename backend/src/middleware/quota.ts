import { Request, Response, NextFunction } from "express";
import db from "../db";
import { AppError } from "./errorHandler";

export interface PlanLimits {
  maxProjects: number;
  maxPointsPerProject: number;
  analyses: string[];
}

// Plan limits with DB-backed analysis type access
// Analysis types for each plan are loaded from plan_analysis_access + analysis_types tables
const DEFAULT_PLANS: Record<string, Omit<PlanLimits, "analyses">> = {
  free: { maxProjects: 3, maxPointsPerProject: 500 },
  pro: { maxProjects: 50, maxPointsPerProject: 10000 },
  enterprise: { maxProjects: 999999, maxPointsPerProject: 999999 },
};

// Fallback analysis types per plan (used when DB unavailable)
const FALLBACK_ANALYSES: Record<string, string[]> = {
  free: ["coverage", "cluster"],
  pro: ["coverage", "heatmap", "cluster", "site-optimization"],
  enterprise: ["coverage", "heatmap", "cluster", "site-optimization"],
};

async function getPlanAnalyses(plan: string): Promise<string[]> {
  try {
    const rows = await db.manyOrNone(
      `SELECT at.type FROM plan_analysis_access paa
       JOIN analysis_types at ON at.type = paa.analysis_type
       WHERE paa.plan = \$1 AND at.enabled = true`,
      [plan]
    );
    if (rows && rows.length > 0) {
      return rows.map((r: any) => r.type);
    }
  } catch {
    // DB unavailable — use fallback
  }
  return FALLBACK_ANALYSES[plan] || FALLBACK_ANALYSES.free;
}

async function getPlanLimits(plan: string): Promise<PlanLimits> {
  const base = DEFAULT_PLANS[plan] || DEFAULT_PLANS.free;
  const analyses = await getPlanAnalyses(plan);
  return { ...base, analyses };
}

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
    const limits = await getPlanLimits(plan);
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
    const limits = await getPlanLimits(plan);
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