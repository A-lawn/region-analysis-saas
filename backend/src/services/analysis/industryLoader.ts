// IndustryConfigService — Loads industry configuration from DB
// Replaces hardcoded if-else chains and config.ts industry arrays

import { db } from "../../db";
import logger from "../../utils/logger";
import type { IndustryConfig } from "../../config/industry.config";
import { DEFAULT_ANALYSIS_CONFIG } from "../../config/analysis.config";
import { DEFAULT_INDUSTRY_RADII, INDUSTRY_CATEGORY_MAP } from "../../config/industry.config";

/**
 * Load full industry config from DB.
 * Falls back to DEFAULT_* values when DB unavailable.
 */
export async function loadIndustryConfig(industry: string): Promise<IndustryConfig | null> {
  if (!industry) return null;

  try {
    const result = await db.query(
      `SELECT 
        industry, display_name, radius_meters, weights,
        analysis_params, decision_thresholds, benchbarks, kpi_weights
      FROM site_optimization_models
      WHERE industry = \$1`,
      [industry]
    );

    if (result.rows.length === 0) {
      logger.warn({ industry }, "[IndustryConfig] Industry not found in DB");
      return null;
    }

    const row = result.rows[0];
    const ap = row.analysis_params || {};
    const weightsMapping = (row.kpi_weights && typeof row.kpi_weights === 'object' && Object.keys(row.kpi_weights).length > 0) ? row.kpi_weights : ((row.weights && row.weights.kpi_mapping) || {});

    // Load keywords
    let keywords: string[] = [];
    try {
      const kwResult = await db.query(
        `SELECT keyword FROM industry_keywords WHERE industry = \$1 ORDER BY priority DESC`,
        [industry]
      );
      keywords = (kwResult.rows || []).map((r: any) => r.keyword);
    } catch {
      // keywords lookup failed — use empty
    }

    const config: IndustryConfig = {
      industry: row.industry,
      displayName: row.display_name,
      radiusMeters: row.radius_meters || getDefaultRadius(industry),
      weights: weightsMapping,
      analysisParams: {
        coverage: (ap.coverage) || { radiusMeters: row.radius_meters },
        decay: (ap.decay) || DEFAULT_ANALYSIS_CONFIG.decay,
        competition: (ap.competition) || DEFAULT_ANALYSIS_CONFIG.competition,
        scoring: (ap.scoring) || DEFAULT_ANALYSIS_CONFIG.scoring,
        overlap: (ap.overlap) || DEFAULT_ANALYSIS_CONFIG.overlap,
        kde: (ap.kde) || {
          bandwidthM: DEFAULT_ANALYSIS_CONFIG.kdeBandwidth,
          gridSizeM: DEFAULT_ANALYSIS_CONFIG.kdeGridSize,
          maxGridCells: 80,
          cutoffFactor: 3.0,
        },
        cluster: (ap.cluster) || {
          epsM: DEFAULT_ANALYSIS_CONFIG.dbscanEps,
          minPoints: DEFAULT_ANALYSIS_CONFIG.dbscanMinPoints,
        },
      },
      decisionThresholds: row.decision_thresholds || {},
      benchmarks: row.benchbarks || {},
      kpiWeights: row.kpi_weights || {},
      keywords,
    };

    logger.info({ industry, radiusMeters: config.radiusMeters }, "[IndustryConfig] Loaded from DB");
    return config;

  } catch (err: any) {
    logger.error({ industry, error: err.message }, "[IndustryConfig] DB load failed");
    return null;
  }
}

/**
 * Load all industry config entries (e.g., for dropdown lists).
 */
export async function loadAllIndustryConfigs(): Promise<IndustryConfig[]> {
  try {
    const result = await db.query(
      `SELECT 
        industry, display_name, radius_meters, weights,
        analysis_params, decision_thresholds, benchbarks, kpi_weights
      FROM site_optimization_models
      ORDER BY sort_order ASC, industry ASC`
    );

    const configs: IndustryConfig[] = [];
    for (const row of result.rows) {
      const ap = row.analysis_params || {};
      const weightsMapping = (row.kpi_weights && typeof row.kpi_weights === 'object' && Object.keys(row.kpi_weights).length > 0) ? row.kpi_weights : ((row.weights && row.weights.kpi_mapping) || {});
      configs.push({
        industry: row.industry,
        displayName: row.display_name,
        radiusMeters: row.radius_meters,
        weights: weightsMapping,
        analysisParams: {
          coverage: (ap.coverage) || { radiusMeters: row.radius_meters },
          decay: (ap.decay) || DEFAULT_ANALYSIS_CONFIG.decay,
          competition: (ap.competition) || DEFAULT_ANALYSIS_CONFIG.competition,
          scoring: (ap.scoring) || DEFAULT_ANALYSIS_CONFIG.scoring,
          overlap: (ap.overlap) || DEFAULT_ANALYSIS_CONFIG.overlap,
          kde: (ap.kde) || { bandwidthM: 1000, gridSizeM: 500, maxGridCells: 80, cutoffFactor: 3.0 },
          cluster: (ap.cluster) || { epsM: 500, minPoints: 3 },
        },
        decisionThresholds: row.decision_thresholds || {},
        benchmarks: row.benchbarks || {},
        kpiWeights: row.kpi_weights || {},
        keywords: [],
      });
    }
    return configs;
  } catch (err: any) {
    logger.error({ error: err.message }, "[IndustryConfig] Load all failed");
    return [];
  }
}

/**
 * Auto-detect industry from category name using industry_keywords table.
 * Falls back to local keyword mapping if DB unavailable.
 */
export async function detectIndustry(categoryName: string): Promise<string | null> {
  if (!categoryName) return null;
  const normalized = categoryName.trim();

  try {
    const result = await db.query(
      `SELECT industry FROM industry_keywords
       WHERE \$1 ILIKE '%' || keyword || '%'
       ORDER BY priority DESC
       LIMIT 1`,
      [normalized]
    );
    if (result.rows.length > 0) {
      return result.rows[0].industry;
    }
  } catch (err: any) {
    logger.warn({ error: err.message }, "[IndustryConfig] Keyword detection DB query failed");
  }

  // Fallback: local keyword matching from config
  for (const [industry, keywords] of Object.entries(INDUSTRY_CATEGORY_MAP)) {
    if (keywords.some(kw => normalized.includes(kw))) {
      return industry;
    }
  }

  return null;
}

export function getDefaultRadius(industry: string): number {
  const entry = DEFAULT_INDUSTRY_RADII.find(r => r.industry === industry);
  return entry?.radiusMeters || 500;
}
