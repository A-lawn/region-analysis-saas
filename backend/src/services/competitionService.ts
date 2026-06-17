import db from "../db";
import { loadIndustryConfig } from "./analysis/industryLoader";
import logger from "../utils/logger";

export interface CompetitionResult {
  candidateName: string;
  lng: number;
  lat: number;
  competitorCount500m: number;
  competitorCount1000m: number;
  ownerCount500m: number;
  ownerCount1000m: number;
  gapRatio: number;
  saturation: "low" | "medium" | "high";
}

interface CompetitionConfig {
  nearRadiusM: number;
  farRadiusM: number;
  saturationThresholds: {
    highCompetitorsNear: number;
    highGapRatioMax: number;
    highCompetitorsFar: number;
    mediumCompetitorsNear: number;
    mediumCompetitorsFar: number;
  };
}

const DEFAULT_COMPETITION: CompetitionConfig = {
  nearRadiusM: 500,
  farRadiusM: 1000,
  saturationThresholds: {
    highCompetitorsNear: 5,
    highGapRatioMax: 0.5,
    highCompetitorsFar: 3,
    mediumCompetitorsNear: 2,
    mediumCompetitorsFar: 5,
  },
};

async function getCompetitionConfig(industry?: string): Promise<CompetitionConfig> {
  if (!industry) return DEFAULT_COMPETITION;
  try {
    const config = await loadIndustryConfig(industry);
    if (config?.analysisParams?.competition) {
      const comp = config.analysisParams.competition;
      const thresholds = config.decisionThresholds || {};
      return {
        nearRadiusM: comp.nearRadiusM || 500,
        farRadiusM: comp.farRadiusM || 1000,
        saturationThresholds: {
          highCompetitorsNear: (thresholds.high_competitors_near as number) || 5,
          highGapRatioMax: (thresholds.high_gap_ratio_max as number) || 0.5,
          highCompetitorsFar: (thresholds.high_competitors_far as number) || 3,
          mediumCompetitorsNear: (thresholds.medium_competitors_near as number) || 2,
          mediumCompetitorsFar: (thresholds.medium_competitors_far as number) || 5,
        },
      };
    }
  } catch (err: any) {
    logger.warn({ industry, error: err.message }, "[Competition] Failed to load industry config, using defaults");
  }
  return DEFAULT_COMPETITION;
}

function competitorSQL(projectId: string, lng: number, lat: number, radiusM: number): string {
  return "SELECT COUNT(*)::INTEGER AS cnt FROM spatial_points WHERE project_id = \$1 AND source = 'competitor' AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(\$2, \$3), 4326)::geography, " + radiusM + ")";
}

function ownerSQL(projectId: string, lng: number, lat: number, radiusM: number): string {
  return "SELECT COUNT(*)::INTEGER AS cnt FROM spatial_points WHERE project_id = \$1 AND source = 'owner' AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(\$2, \$3), 4326)::geography, " + radiusM + ")";
}

export async function computeCompetitionAnalysis(
  projectId: string,
  candidate: { name: string; lng: number; lat: number },
  industry?: string
): Promise<CompetitionResult> {
  const cc = await getCompetitionConfig(industry);
  const nearM = cc.nearRadiusM;
  const farM = cc.farRadiusM;
  const t = cc.saturationThresholds;

  try {
    const [compNear, compFar, ownerNear, ownerFar] = await Promise.all([
      db.one(competitorSQL(projectId, candidate.lng, candidate.lat, nearM), [projectId, candidate.lng, candidate.lat]),
      db.one(competitorSQL(projectId, candidate.lng, candidate.lat, farM), [projectId, candidate.lng, candidate.lat]),
      db.one(ownerSQL(projectId, candidate.lng, candidate.lat, nearM), [projectId, candidate.lng, candidate.lat]),
      db.one(ownerSQL(projectId, candidate.lng, candidate.lat, farM), [projectId, candidate.lng, candidate.lat]),
    ]);

    const cNear = compNear.cnt || 0;
    const cFar = compFar.cnt || 0;
    const oNear = ownerNear.cnt || 0;
    const oFar = ownerFar.cnt || 0;

    // gapRatio = owner / competitor within far radius
    const gapRatio = cFar > 0 ? oFar / cFar : (oFar > 0 ? 999 : 1);

    let saturation: CompetitionResult["saturation"] = "low";
    if (cNear >= t.highCompetitorsNear || (gapRatio < t.highGapRatioMax && cFar >= t.highCompetitorsFar)) {
      saturation = "high";
    } else if (cNear >= t.mediumCompetitorsNear || cFar >= t.mediumCompetitorsFar) {
      saturation = "medium";
    }

    return {
      candidateName: candidate.name,
      lng: candidate.lng,
      lat: candidate.lat,
      competitorCount500m: cNear,
      competitorCount1000m: cFar,
      ownerCount500m: oNear,
      ownerCount1000m: oFar,
      gapRatio: Math.round(gapRatio * 100) / 100,
      saturation,
    };
  } catch (err: any) {
    logger.error({ error: err.message, candidate: candidate.name }, "[Competition] Analysis error");
    return {
      candidateName: candidate.name,
      lng: candidate.lng,
      lat: candidate.lat,
      competitorCount500m: 0,
      competitorCount1000m: 0,
      ownerCount500m: 0,
      ownerCount1000m: 0,
      gapRatio: 1,
      saturation: "low",
    };
  }
}

export async function batchCompetitionAnalysis(
  projectId: string,
  candidates: { name: string; lng: number; lat: number }[],
  industry?: string
): Promise<CompetitionResult[]> {
  return Promise.all(candidates.map(c => computeCompetitionAnalysis(projectId, c, industry)));
}


// ================================================================
// Business Metrics — commercial body data from public_poi.metadata
// ================================================================

export interface BusinessMetrics {
  /** 周边500m竞品评分均值 (0-5) */
  avgRating: number;
  /** 周边500m人均消费均值 */
  avgCost: number;
  /** 周边500m商圈内POI占比 (0-1) */
  businessAreaRatio: number;
  /** 周边500m深夜营业(22:00后)占比 (0-1) */
  lateNightRatio: number;
  /** 周边500m支持外卖的POI占比 (0-1) */
  deliveryRatio: number;
  /** 周边500m高评分(≥4.0)竞品数 */
  highRatedCount: number;
  /** 周边500m竞品图片数中位数（线上运营活跃度代理） */
  medianPhotoCount: number;
  /** 周边500m有标签的POI占比 (0-1) */
  taggedRatio: number;
  /** 周边500m采样POI数（分母） */
  sampleSize: number;
}

/**
 * 从 public_poi 查询候选点周边的商业体聚合指标
 * @param candidate 候选点位
 * @param industry 行业代码（只统计同类竞品）
 * @param radiusM 查询半径（默认500m）
 */
export async function computeBusinessMetrics(
  candidate: { lng: number; lat: number },
  industry: string,
  radiusM: number = 500
): Promise<BusinessMetrics> {
  const defaultResult: BusinessMetrics = {
    avgRating: 0, avgCost: 0, businessAreaRatio: 0,
    lateNightRatio: 0, deliveryRatio: 0, highRatedCount: 0,
    medianPhotoCount: 0, taggedRatio: 0, sampleSize: 0,
  };

  try {
    const row = await db.oneOrNone(
      `SELECT
        COUNT(*)::INTEGER AS sample_size,
        ROUND(AVG(NULLIF(metadata->>'rating','')::numeric), 1) AS avg_rating,
        ROUND(AVG(NULLIF(metadata->>'cost','')::numeric), 0) AS avg_cost,
        ROUND(
          COUNT(*) FILTER (WHERE metadata->>'business_area' IS NOT NULL
                                AND metadata->>'business_area' != '')
          / NULLIF(COUNT(*), 0)::numeric, 2
        ) AS business_area_ratio,
        ROUND(
          COUNT(*) FILTER (WHERE metadata->>'opentime' ~ '2[2-4]:|0[0-5]:')
          / NULLIF(COUNT(*), 0)::numeric, 2
        ) AS late_night_ratio,
        ROUND(
          COUNT(*) FILTER (WHERE metadata->>'meal_ordering' = '1')
          / NULLIF(COUNT(*), 0)::numeric, 2
        ) AS delivery_ratio,
        COUNT(*) FILTER (WHERE NULLIF(metadata->>'rating','')::numeric >= 4.0)::INTEGER AS high_rated_count,
        COALESCE(
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY NULLIF(metadata->>'photo_count','')::integer
          ), 0
        )::INTEGER AS median_photo_count,
        ROUND(
          COUNT(*) FILTER (WHERE metadata->'tags' IS NOT NULL)
          / NULLIF(COUNT(*), 0)::numeric, 2
        ) AS tagged_ratio
      FROM public_poi
      WHERE industry = $[industry]
        AND city = '西安'
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($[lng], $[lat]), 4326)::geography,
          $[radius]
        )`,
      { industry, lng: candidate.lng, lat: candidate.lat, radius: radiusM }
    );

    if (!row || row.sample_size === 0) return defaultResult;

    return {
      avgRating: parseFloat(row.avg_rating) || 0,
      avgCost: parseInt(row.avg_cost) || 0,
      businessAreaRatio: parseFloat(row.business_area_ratio) || 0,
      lateNightRatio: parseFloat(row.late_night_ratio) || 0,
      deliveryRatio: parseFloat(row.delivery_ratio) || 0,
      highRatedCount: parseInt(row.high_rated_count) || 0,
      medianPhotoCount: parseInt(row.median_photo_count) || 0,
      taggedRatio: parseFloat(row.tagged_ratio) || 0,
      sampleSize: parseInt(row.sample_size) || 0,
    };
  } catch (err: any) {
    logger.error({ error: err.message, candidate }, "[BusinessMetrics] Query failed");
    return defaultResult;
  }
}

/**
 * 批量版本：对多个候选点并行查询商业体指标
 */
export async function batchBusinessMetrics(
  candidates: { name: string; lng: number; lat: number }[],
  industry: string,
  radiusM: number = 500
): Promise<Map<string, BusinessMetrics>> {
  const results = new Map<string, BusinessMetrics>();
  const metricsList = await Promise.all(
    candidates.map(c => computeBusinessMetrics(c, industry, radiusM))
  );
  candidates.forEach((c, i) => results.set(c.name, metricsList[i]));
  return results;
}
