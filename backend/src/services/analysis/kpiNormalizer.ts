// KPI Normalization Engine v2.0
// Consumes kpi_category_map.normalization_type + normalization_params
// to independently normalize each KPI value to [0, 1] before weighted sum.

import logger from "../../utils/logger";

export type NormalizationType =
  | "linearUp"
  | "linearDown"
  | "sweetSpot"
  | "step"
  | "clusterU"
  | "binary"
  | "hardFilter";

export interface NormalizationParams {
  min?: number;
  max?: number | string;   // string = computed at runtime (e.g. "city_p95", "median_of_project")
  peak?: number;
  low?: number;
  best?: number;
  high?: number;
  steps?: [number, number][];  // step type: [threshold, score]
  true_val?: number;
  false_val?: number;
  threshold?: number;        // hardFilter threshold
  direction?: string;        // hardFilter direction: "lt" | "gt"
}

export interface KpiNormalizerEntry {
  kpiName: string;
  category: string;
  normalizationType: NormalizationType;
  normalizationParams: NormalizationParams;
}

export interface KpiValueMap {
  [kpiName: string]: number;
}

/**
 * Normalize a single KPI value using its registered type and params.
 * Returns { score: number, passed: boolean }.
 * - score is always in [0, 1]
 * - passed is false only for hardFilter failures
 */
export function normalizeKpi(
  value: number,
  type: NormalizationType,
  params: NormalizationParams = {}
): { score: number; passed: boolean } {
  switch (type) {
    // === Linear Up: higher is better, normalize to [0,1] ===
    case "linearUp": {
      const max = resolveParam(params.max, 1);
      const min = params.min ?? 0;
      if (max <= min) return { score: 1, passed: true };
      const clamped = Math.max(min, Math.min(max, value));
      return { score: (clamped - min) / (max - min), passed: true };
    }

    // === Linear Down: lower is better, normalize to [0,1] ===
    case "linearDown": {
      const max = resolveParam(params.max, 1);
      const min = params.min ?? 0;
      if (max <= min) return { score: 1, passed: true };
      const clamped = Math.max(min, Math.min(max, value));
      return { score: 1 - (clamped - min) / (max - min), passed: true };
    }

    // === Sweet Spot: value near peak = 1, decays both sides ===
    case "sweetSpot": {
      const min = params.min ?? 0;
      const max = resolveParam(params.max, 10);
      const peak = params.peak ?? (min + max) / 2;
      if (value <= min || value >= max) return { score: 0, passed: true };
      if (value <= peak) {
        return { score: (value - min) / (peak - min), passed: true };
      }
      return { score: 1 - (value - peak) / (max - peak), passed: true };
    }

    // === Step: discrete threshold mapping ===
    case "step": {
      const steps = params.steps || [[0, 1]];
      // steps sorted by threshold ascending; find highest matching step
      let score = 1;
      for (const [threshold, s] of steps) {
        if (value >= threshold) score = s;
      }
      return { score, passed: true };
    }

    // === Cluster U: inverted-U for cluster effects (low=bad, medium=best, high=bad) ===
    case "clusterU": {
      const low = params.low ?? 0;
      const best = params.best ?? 5;
      const high = params.high ?? 20;
      if (value <= low || value >= high) return { score: 0, passed: true };
      if (value <= best) {
        return { score: (value - low) / (best - low), passed: true };
      }
      return { score: 1 - (value - best) / (high - best), passed: true };
    }

    // === Binary: boolean check ===
    case "binary": {
      const trueVal = params.true_val ?? 1;
      const falseVal = params.false_val ?? 0;
      return { score: value > 0 ? trueVal : falseVal, passed: true };
    }

    // === Hard Filter: fail = candidate eliminated ===
    case "hardFilter": {
      const threshold = params.threshold ?? 0;
      const direction = params.direction ?? "lt";
      const passed = direction === "lt" ? value < threshold : value > threshold;
      return { score: passed ? 1 : 0, passed };
    }

    default:
      logger.warn({ type }, "[KpiNormalizer] Unknown normalization type, treating as linearUp");
      return { score: Math.min(1, Math.max(0, value)), passed: true };
  }
}

/**
 * Resolve a param that may be a runtime-computed string (e.g. "city_p95").
 * For now, string values return a reasonable constant; extend later with actual DB queries.
 */
function resolveParam(value: number | string | undefined, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number") return value;
  // String values like "city_p95", "median_of_project" — resolve at runtime
  // For now, use sensible defaults per metric type
  if (value === "city_p95") return 100;    // population percentile
  if (value === "city_p90") return 80;
  if (value === "city_max") return 500;
  if (value === "city_median") return 50;
  if (value === "median_of_project") return 50;
  if (value === "highest_in_project") return 100;
  if (value === "median_x2") return 60;
  if (value === "project_p90") return 80;
  logger.warn({ value }, "[KpiNormalizer] Unknown runtime param, using fallback");
  return fallback;
}

/**
 * Batch normalize all KPIs given raw values and the kpi_category_map entries.
 * Returns { scores, hardFilterPassed }.
 */
export function batchNormalizeKpis(
  rawValues: KpiValueMap,
  normalizers: KpiNormalizerEntry[]
): { scores: KpiValueMap; hardFilterPassed: boolean } {
  const scores: KpiValueMap = {};
  let hardFilterPassed = true;

  for (const entry of normalizers) {
    const rawValue = rawValues[entry.kpiName];
    if (rawValue === undefined || rawValue === null) {
      // No data for this KPI → skip (don't penalize)
      continue;
    }
    const result = normalizeKpi(rawValue, entry.normalizationType, entry.normalizationParams);
    scores[entry.kpiName] = result.score;
    if (!result.passed) {
      hardFilterPassed = false;
      logger.info({ kpiName: entry.kpiName, rawValue }, "[KpiNormalizer] Hard filter failed, candidate eliminated");
    }
  }

  return { scores, hardFilterPassed };
}

/**
 * Compute weighted sum from normalized KPI scores and industry weights.
 */
export function weightedSum(
  normalizedScores: KpiValueMap,
  kpiWeights: Record<string, number>
): number {
  let total = 0;
  let weightSum = 0;
  for (const [kpiName, weight] of Object.entries(kpiWeights)) {
    const score = normalizedScores[kpiName];
    if (score === undefined) continue; // KPI not computed → skip
    total += score * weight;
    weightSum += weight;
  }
  // If no KPI could be computed, fall back to weights that WERE computed
  // Weighted average of available KPIs
  if (weightSum === 0) return 0;
  return total / weightSum;
}
