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
