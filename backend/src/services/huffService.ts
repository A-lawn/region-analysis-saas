/**
 * Huff参数服务 — 获取行业/项目级别的Huff引力模型参数
 *
 * 优先级：
 * 1. project_huff_params 表中已有拟合结果 → 直接返回
 * 2. 项目有交易数据(>=5条) → 拟合并缓存到DB
 * 3. 查 site_optimization_models.benchbarks.huff_params → 行业基准
 * 4. 返回行业默认值
 */
import db from "../db";
import { fitHuffModel } from "./computeClient";
import { loadIndustryConfig } from "./analysis/industryLoader";
import logger from "../utils/logger";

export interface HuffParams {
  lambda: number;      // 距离衰减系数 (正数, 越大越不愿走远路)
  alpha_area: number;  // 面积弹性
  alpha_brand: number; // 品牌弹性
  source: "mle" | "cached_mle" | "benchmark" | "default";
  r_squared?: number;
  aic?: number;
  n_observations?: number;
}

// ================================================================
// 行业默认参数
// ================================================================

const INDUSTRY_DEFAULT_HUFF: Record<string, HuffParams> = {
  convenience:    { lambda: 3.0, alpha_area: 0.5, alpha_brand: 0.5, source: "default" },
  beverage:       { lambda: 2.5, alpha_area: 0.3, alpha_brand: 0.9, source: "default" },
  restaurant:     { lambda: 1.5, alpha_area: 0.8, alpha_brand: 0.7, source: "default" },
  pharmacy:       { lambda: 1.2, alpha_area: 0.4, alpha_brand: 0.6, source: "default" },
  fresh_grocery:  { lambda: 1.0, alpha_area: 1.0, alpha_brand: 0.5, source: "default" },
  supermarket:    { lambda: 0.3, alpha_area: 1.2, alpha_brand: 0.8, source: "default" },
  hotel:          { lambda: 0.15, alpha_area: 0.9, alpha_brand: 1.2, source: "default" },
  medical_aesthetics: { lambda: 0.2, alpha_area: 0.4, alpha_brand: 1.5, source: "default" },
  education:      { lambda: 1.0, alpha_area: 0.3, alpha_brand: 0.8, source: "default" },
  pet_service:    { lambda: 1.0, alpha_area: 0.5, alpha_brand: 0.6, source: "default" },
  auto4s:         { lambda: 0.05, alpha_area: 1.5, alpha_brand: 1.0, source: "default" },
  logistics:      { lambda: 0.8, alpha_area: 0.2, alpha_brand: 0.3, source: "default" },
};

// ================================================================
// 主函数
// ================================================================

export async function getHuffParams(
  projectId: string,
  industry?: string
): Promise<HuffParams> {
  // 1. 检查 project_huff_params 缓存
  try {
    const cached = await db.oneOrNone(
      `SELECT lambda, alpha_area, alpha_brand, r_squared, aic, n_observations, source
       FROM project_huff_params
       WHERE project_id = $[projectId]
         AND fitted_at > NOW() - INTERVAL '7 days'
       ORDER BY fitted_at DESC LIMIT 1`,
      { projectId }
    );

    if (cached) {
      logger.info({ projectId, source: cached.source, r_squared: cached.r_squared },
        "[Huff] 使用DB缓存参数");
      return {
        lambda: parseFloat(cached.lambda),
        alpha_area: parseFloat(cached.alpha_area),
        alpha_brand: parseFloat(cached.alpha_brand),
        r_squared: cached.r_squared ? parseFloat(cached.r_squared) : undefined,
        aic: cached.aic ? parseFloat(cached.aic) : undefined,
        n_observations: cached.n_observations,
        source: cached.source === "mle" ? "cached_mle" : cached.source,
      };
    }
  } catch (err: any) {
    logger.warn({ projectId, error: err.message }, "[Huff] DB缓存读取失败");
  }

  // 2. 检查是否有交易数据 → MLE拟合
  try {
    const hasRevenue = await db.oneOrNone(
      `SELECT COUNT(*)::INTEGER AS cnt
       FROM spatial_points
       WHERE project_id = $[projectId]
         AND metadata->>'daily_revenue' IS NOT NULL
         AND (metadata->>'daily_revenue')::numeric > 0`,
      { projectId }
    );

    if (hasRevenue?.cnt >= 5) {
      // 构建观测数据
      const points = await db.manyOrNone(
        `SELECT id, ST_X(geom)::numeric AS lng, ST_Y(geom)::numeric AS lat,
                COALESCE(metadata->>'daily_revenue', '0')::numeric AS daily_revenue,
                COALESCE(metadata->>'floor_area', '100')::numeric AS floor_area,
                COALESCE(metadata->>'brand_score', '0.5')::numeric AS brand_score
         FROM spatial_points
         WHERE project_id = $[projectId]
           AND metadata->>'daily_revenue' IS NOT NULL
           AND (metadata->>'daily_revenue')::numeric > 0`,
        { projectId }
      );

      if (points && points.length >= 5) {
        // 构建Huff拟合请求
        const observations = points.map((p: any) => ({
          demand_id: `h3_${Math.round(parseFloat(p.lat) * 100)}_${Math.round(parseFloat(p.lng) * 100)}`,
          store_id: String(p.id),
          weight: parseFloat(p.daily_revenue),
          distance_m: 0,
        }));

        const storeAttrs: Record<string, Record<string, number>> = {};
        for (const p of points) {
          storeAttrs[String(p.id)] = {
            area: parseFloat(p.floor_area) || 100,
            brand: parseFloat(p.brand_score) || 0.5,
          };
        }

        const result = await fitHuffModel({
          project_id: projectId,
          store_attributes: storeAttrs,
          demand_points: observations.map((o: any) => o.demand_id),
          observations,
        });

        if (result.success && result.data) {
          const fitted = result.data;
          const params: HuffParams = {
            lambda: Math.abs(fitted.fitted_params.dist || 2.0),
            alpha_area: fitted.fitted_params.area || 1.0,
            alpha_brand: fitted.fitted_params.brand || 0.8,
            r_squared: fitted.r_squared,
            aic: fitted.aic,
            n_observations: fitted.n_observations,
            source: "mle",
          };

          // 缓存到DB
          await cacheHuffParams(projectId, params, fitted.r_squared, fitted.aic, fitted.n_observations);

          return params;
        }
      }
    }
  } catch (err: any) {
    logger.warn({ projectId, error: err.message }, "[Huff] MLE拟合失败，降级到基准参数");
  }

  // 3. 查行业 benchmark
  if (industry) {
    try {
      const bench = await db.oneOrNone(
        `SELECT benchbarks->'huff_params' AS huff
         FROM site_optimization_models
         WHERE industry = $[industry]`,
        { industry }
      );

      if (bench?.huff) {
        const hp = typeof bench.huff === "string" ? JSON.parse(bench.huff) : bench.huff;
        if (hp.lambda) {
          logger.info({ industry, source: "benchmark" }, "[Huff] 使用行业基准参数");
          return {
            lambda: hp.lambda,
            alpha_area: hp.alpha_area || 1.0,
            alpha_brand: hp.alpha_brand || 0.8,
            source: "benchmark",
          };
        }
      }
    } catch (err: any) {
      logger.warn({ industry, error: err.message }, "[Huff] 行业基准读取失败");
    }
  }

  // 4. 行业默认值
  const defaults = (industry && INDUSTRY_DEFAULT_HUFF[industry]) || INDUSTRY_DEFAULT_HUFF.convenience;
  logger.info({ industry, source: "default" }, "[Huff] 使用行业默认参数");
  return { ...defaults };
}

// ================================================================
// 缓存
// ================================================================

async function cacheHuffParams(
  projectId: string,
  params: HuffParams,
  r_squared?: number,
  aic?: number,
  n_observations?: number,
): Promise<void> {
  try {
    await db.none(
      `INSERT INTO project_huff_params (project_id, lambda, alpha_area, alpha_brand, r_squared, aic, n_observations, source)
       VALUES ($[projectId], $[lambda], $[alpha_area], $[alpha_brand], $[r_squared], $[aic], $[n], 'mle')
       ON CONFLICT (project_id) DO UPDATE SET
         lambda = EXCLUDED.lambda,
         alpha_area = EXCLUDED.alpha_area,
         alpha_brand = EXCLUDED.alpha_brand,
         r_squared = EXCLUDED.r_squared,
         aic = EXCLUDED.aic,
         n_observations = EXCLUDED.n_observations,
         source = 'mle',
         fitted_at = NOW()`,
      {
        projectId,
        lambda: params.lambda,
        alpha_area: params.alpha_area,
        alpha_brand: params.alpha_brand,
        r_squared: r_squared ?? null,
        aic: aic ?? null,
        n: n_observations ?? null,
      }
    );

    logger.info({ projectId, r_squared }, "[Huff] 参数已缓存到DB");
  } catch (err: any) {
    // 表可能还不存在，不阻塞主流程
    logger.warn({ projectId, error: err.message }, "[Huff] 缓存写入失败(可能表未建)");
  }
}
