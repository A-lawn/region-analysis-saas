// Benchmark comparison service — compares analysis results against industry benchmarks
// Benchmarks originate from site_optimization_models.benchbarks JSONB

import { loadIndustryConfig } from "./industryLoader";
import logger from "../../utils/logger";

export interface BenchmarkResult {
  metric: string;
  label: string;
  currentValue: number;
  benchmarkMedian: number;
  benchmarkP75: number;
  benchmarkP90: number;
  percentile: number; // where current value sits in benchmark distribution
  rating: "excellent" | "good" | "average" | "below_average" | "poor";
  interpretation: string;
}

export interface BenchmarkComparison {
  industry: string;
  displayName: string;
  results: BenchmarkResult[];
  overallRating: "excellent" | "good" | "average" | "below_average" | "poor";
  summary: string;
}

/**
 * Calculate approximate percentile of value in benchmark distribution.
 * Uses linear interpolation between median/P75/P90 anchor points.
 */
function estimatePercentile(value: number, median: number, p75: number, p90: number): number {
  if (value >= p90) return 90 + Math.min((value - p90) / (p90 - p75 || 1) * 5, 10);
  if (value >= p75) return 75 + (value - p75) / (p90 - p75 || 1) * 15;
  if (value >= median) return 50 + (value - median) / (p75 - median || 1) * 25;
  return Math.max(0, 50 * value / (median || 1));
}

function ratingFromPercentile(pct: number): BenchmarkResult["rating"] {
  if (pct >= 90) return "excellent";
  if (pct >= 75) return "good";
  if (pct >= 50) return "average";
  if (pct >= 25) return "below_average";
  return "poor";
}

function interpretMetric(metric: string, rating: string): string {
  const interpretations: Record<string, Record<string, string>> = {
    coverage_ratio: {
      excellent: "覆盖率远超行业水平，服务布局优秀",
      good: "覆盖率高于行业平均，服务布局良好",
      average: "覆盖率处于行业中等水平",
      below_average: "覆盖率低于行业平均，存在服务空白",
      poor: "覆盖率严重不足，需优先扩大覆盖范围",
    },
    avg_neighbor_dist_m: {
      excellent: "门店间距合理，密度分布均匀",
      good: "门店间距较为合理",
      average: "门店间距处于行业正常范围",
      below_average: "门店间距偏大，可能存在过度分散",
      poor: "门店间距过大，服务连续性差",
    },
    cannibalization_index_max: {
      excellent: "蚕食控制优秀，门店布局互补性强",
      good: "蚕食指数良好，布局较为合理",
      average: "蚕食指数处于行业平均水平",
      below_average: "蚕食指数偏高，存在门店间竞争",
      poor: "严重蚕食，建议重新规划门店布局",
    },
    competition_density_per_km2: {
      excellent: "竞争环境有利，竞品密度低",
      good: "竞争环境较为有利",
      average: "竞争密度处于行业正常水平",
      below_average: "竞争密度偏高，利润空间受压",
      poor: "竞争过度激烈，建议差异化定位",
    },
    foot_traffic_p50: {
      excellent: "客流热度极高，区位优势明显",
      good: "客流热度高于行业平均",
      average: "客流热度处于行业中等水平",
      below_average: "客流热度偏低，需关注引流策略",
      poor: "客流严重不足，建议更换选址",
    },
    population_density_p50: {
      excellent: "人口密度极高，客源充足",
      good: "人口密度高于行业平均",
      average: "人口密度处于行业正常范围",
      below_average: "人口密度偏低，客源不足风险",
      poor: "人口密度过低，客源严重不足",
    },
  };

  return interpretations[metric]?.[rating] || "指标处于" + rating + "水平";
}

/**
 * Compare analysis results against industry benchmarks.
 */
export async function compareWithBenchmarks(
  industry: string,
  metrics: Record<string, number>
): Promise<BenchmarkComparison | null> {
  const config = await loadIndustryConfig(industry);
  if (!config || !config.benchmarks || Object.keys(config.benchmarks).length === 0) {
    logger.warn({ industry }, "[Benchmark] No benchmark data available");
    return null;
  }

  const bm = config.benchmarks as Record<string, any>;
  const results: BenchmarkResult[] = [];
  const ratings: string[] = [];

  // Metric labels
  const metricLabels: Record<string, string> = {
    coverage_ratio: "覆盖率",
    avg_neighbor_dist_m: "平均邻店距离",
    cannibalization_index_max: "蚕食指数",
    competition_density_per_km2: "竞争密度",
    foot_traffic_p50: "客流热度",
    population_density_p50: "人口密度",
    delivery_coverage_p50: "外卖覆盖",
    visibility_p50: "可见度",
    walkable_ratio_p50: "步行可达比",
    parking_availability_p50: "停车配套",
    traffic_accessibility_p50: "交通可达",
    commercial_density_p50: "商圈密度",
    community_maturity_p50: "社区成熟度",
    competitor_distance_p50: "竞品距离",
  };

  for (const [key, bmData] of Object.entries(bm)) {
    const currentValue = metrics[key] ?? undefined;
    if (currentValue === undefined || typeof bmData !== "object" || !bmData.median) continue;

    const { median, p75, p90 } = bmData as { median: number; p75?: number; p90?: number };
    const p75Val = p75 ?? median * 1.2;
    const p90Val = p90 ?? median * 1.5;
    const pct = estimatePercentile(currentValue, median, p75Val, p90Val);
    const rating = ratingFromPercentile(pct);
    ratings.push(rating);

    results.push({
      metric: key,
      label: metricLabels[key] || key,
      currentValue,
      benchmarkMedian: median,
      benchmarkP75: p75Val,
      benchmarkP90: p90Val,
      percentile: Math.round(pct),
      rating,
      interpretation: interpretMetric(key, rating),
    });
  }

  // Overall rating: weighted average
  const ratingScores: Record<string, number> = { excellent: 5, good: 4, average: 3, below_average: 2, poor: 1 };
  const avgScore = ratings.length > 0
    ? ratings.reduce((sum, r) => sum + (ratingScores[r] || 3), 0) / ratings.length
    : 3;

  let overallRating: BenchmarkComparison["overallRating"] = "average";
  if (avgScore >= 4.2) overallRating = "excellent";
  else if (avgScore >= 3.4) overallRating = "good";
  else if (avgScore >= 2.6) overallRating = "average";
  else if (avgScore >= 1.8) overallRating = "below_average";
  else overallRating = "poor";

  const topImprovement = results
    .filter(r => r.rating === "below_average" || r.rating === "poor")
    .slice(0, 3)
    .map(r => r.label)
    .join("、");

  const summary = overallRating === "excellent" || overallRating === "good"
    ? "整体表现优于行业平均水平，在" + results.filter(r => r.rating === "excellent").length + "项指标中表现突出"
    : overallRating === "below_average" || overallRating === "poor"
      ? "整体表现低于行业平均水平，建议优先改进：" + (topImprovement || "全面优化")
      : "整体表现处于行业中等水平，仍有优化空间";

  logger.info({ industry, overallRating, metricCount: results.length }, "[Benchmark] Comparison complete");

  return {
    industry,
    displayName: config.displayName,
    results,
    overallRating,
    summary,
  };
}
