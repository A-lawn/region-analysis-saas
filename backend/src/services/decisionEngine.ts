import { loadIndustryConfig } from "./analysis/industryLoader";
import logger from "../utils/logger";

// ================================================================
// Decision Engine v2.0 — 30+ rules with industry awareness
// ================================================================

export interface DecisionRule {
  id: string;
  condition: (context: AnalysisContext) => boolean;
  message: string;
  priority: "high" | "medium" | "low";
  industries?: string[]; // null = all industries
}

export interface AnalysisContext {
  coverageRatio?: number;
  triangulation?: {
    coverageConnectivity?: number;
    overlapRatio?: number;
    gapRatio?: number;
    totalEdges?: number;
    connectedEdges?: number;
    gappedEdges?: number;
    minEdgeM?: number;
    maxEdgeM?: number;
    avgEdgeM?: number;
  };
  noiseRatio?: number;
  clusterCount?: number;
  pointCount?: number;
  topSiteScore?: number;
  competitorGapRatio?: number;
  isConcentrated?: boolean;
  industry?: string;
  cannibalizationIndex?: number;
  competitorDensity?: number;
  nearestCompetitorDistance?: number;
  walkableRatio?: number;
  footTraffic?: number;
  deliveryCoverage?: number;
  populationDensity?: number;
  parkingAvailability?: number;
  roadFrontage?: number;
}

export interface DecisionAdvice {
  priority: "high" | "medium" | "low";
  message: string;
}

// ===== Industry-specific thresholds (fallback; DB values take precedence) =====
interface IndustryThresholds {
  gapRatioCritical: number;
  gapRatioWarning: number;
  overlapCritical: number;
  overlapWarning: number;
  coverageLow: number;
  coverageMedium: number;
  coverageHigh: number;
  topSiteHigh: number;
  topSiteMedium: number;
  cannibalizationCritical: number;
  competitorDistanceCritical: number;
  competitorDistanceWarning: number;
}

const DEFAULT_THRESHOLDS: IndustryThresholds = {
  gapRatioCritical: 40,
  gapRatioWarning: 30,
  overlapCritical: 60,
  overlapWarning: 40,
  coverageLow: 35,
  coverageMedium: 60,
  coverageHigh: 80,
  topSiteHigh: 0.75,
  topSiteMedium: 0.4,
  cannibalizationCritical: 30,
  competitorDistanceCritical: 300,
  competitorDistanceWarning: 500,
};

async function getThresholds(industry?: string): Promise<IndustryThresholds> {
  if (!industry) return DEFAULT_THRESHOLDS;
  try {
    const cfg = await loadIndustryConfig(industry);
    if (cfg?.decisionThresholds) {
      const dt = cfg.decisionThresholds as any;
      return {
        gapRatioCritical: dt.gap_ratio?.critical ?? DEFAULT_THRESHOLDS.gapRatioCritical,
        gapRatioWarning: dt.gap_ratio?.warning ?? DEFAULT_THRESHOLDS.gapRatioWarning,
        overlapCritical: dt.overlap_ratio?.critical ?? DEFAULT_THRESHOLDS.overlapCritical,
        overlapWarning: dt.overlap_ratio?.warning ?? DEFAULT_THRESHOLDS.overlapWarning,
        coverageLow: dt.coverage_ratio?.low ?? DEFAULT_THRESHOLDS.coverageLow,
        coverageMedium: dt.coverage_ratio?.medium ?? DEFAULT_THRESHOLDS.coverageMedium,
        coverageHigh: dt.coverage_ratio?.high ?? DEFAULT_THRESHOLDS.coverageHigh,
        topSiteHigh: dt.top_site_score?.high ?? DEFAULT_THRESHOLDS.topSiteHigh,
        topSiteMedium: dt.top_site_score?.medium ?? DEFAULT_THRESHOLDS.topSiteMedium,
        cannibalizationCritical: dt.cannibalization_index?.critical ?? DEFAULT_THRESHOLDS.cannibalizationCritical,
        competitorDistanceCritical: dt.competitor_distance?.critical ?? DEFAULT_THRESHOLDS.competitorDistanceCritical,
        competitorDistanceWarning: dt.competitor_distance?.warning ?? DEFAULT_THRESHOLDS.competitorDistanceWarning,
      };
    }
  } catch (err: any) {
    logger.warn({ industry, error: err.message }, "[DecisionEngine] Failed to load thresholds");
  }
  return DEFAULT_THRESHOLDS;
}

// ===== Universal Rules (apply to all industries) =====
const UNIVERSAL_RULES: DecisionRule[] = [
  {
    id: "critical-gap",
    condition: (c) => (c.triangulation?.gapRatio ?? 0) > 40 && (c.pointCount ?? 0) >= 3,
    message: "存在严重服务盲区（门店间距过大），建议优先填补未覆盖区域",
    priority: "high",
  },
  {
    id: "warning-gap",
    condition: (c) => {
      const g = c.triangulation?.gapRatio ?? 0;
      return g > 25 && g <= 40 && (c.pointCount ?? 0) >= 3;
    },
    message: "存在服务盲区趋势，建议关注覆盖不足区域",
    priority: "medium",
  },
  {
    id: "random-distribution",
    condition: (c) => (c.noiseRatio ?? 0) > 0.3,
    message: "点位分布随机性较高，建议考虑结构性布局策略",
    priority: "medium",
  },
  {
    id: "high-concentration",
    condition: (c) => (c.isConcentrated ?? false) && (c.triangulation?.gapRatio ?? 0) > 25,
    message: "服务高度集中，外围存在大量未服务人群，建议向外扩展",
    priority: "high",
  },
  {
    id: "site-strongly-recommend",
    condition: (c) => (c.topSiteScore ?? 0) > 0.7,
    message: "Top 1 候选位置评分较高，强烈推荐优先考虑",
    priority: "high",
  },
  {
    id: "site-optional",
    condition: (c) => {
      const s = c.topSiteScore ?? 0;
      return s >= 0.4 && s <= 0.7;
    },
    message: "Top 1 候选位置评分中等，可作为备选方案",
    priority: "medium",
  },
  {
    id: "site-not-recommended",
    condition: (c) => (c.topSiteScore ?? 1) < 0.4,
    message: "Top 1 候选位置评分偏低，建议扩大候选范围或调整权重",
    priority: "medium",
  },
  {
    id: "critical-overlap",
    condition: (c) => (c.triangulation?.overlapRatio ?? 0) > 50 && (c.pointCount ?? 0) >= 3,
    message: "门店间服务区严重重叠（重叠率 > 50%），建议优化间距或关闭冗余门店",
    priority: "high",
  },
  {
    id: "warning-overlap",
    condition: (c) => {
      const o = c.triangulation?.overlapRatio ?? 0;
      return o > 30 && o <= 50 && (c.pointCount ?? 0) >= 3;
    },
    message: "门店服务区存在中等程度重叠，建议监控蚕食风险",
    priority: "medium",
  },
  {
    id: "few-clusters",
    condition: (c) => (c.clusterCount ?? 0) === 1 && (c.pointCount ?? 0) > 10,
    message: "所有点位聚集在同一区域，建议分析是否向周边区域扩展",
    priority: "low",
  },
  {
    id: "critical-cannibalization",
    condition: (c) => (c.cannibalizationIndex ?? 0) > 30,
    message: "门店蚕食指数过高，同品牌门店间竞争严重，建议重新评估布局",
    priority: "high",
  },
  {
    id: "warning-cannibalization",
    condition: (c) => {
      const ci = c.cannibalizationIndex ?? 0;
      return ci > 15 && ci <= 30;
    },
    message: "门店蚕食指数偏高，建议关注门店间距合理性",
    priority: "medium",
  },
];

// ===== Industry-Specific Rules =====
const INDUSTRY_RULES: DecisionRule[] = [
  // ——— Convenience ———
  {
    id: "convenience-walkable-low",
    condition: (c) => (c.walkableRatio ?? 1) < 0.3,
    message: "步行可达比偏低（< 30%），便利店选址应优先考虑高密度居住区",
    priority: "high",
    industries: ["convenience"],
  },
  {
    id: "convenience-competitor-distance",
    condition: (c) => (c.nearestCompetitorDistance ?? 9999) < 100,
    message: "最近竞品距离过近（< 100m），便利店生存空间受限，建议选择300m以上间距",
    priority: "high",
    industries: ["convenience"],
  },

  // ——— Beverage ———
  {
    id: "beverage-traffic-low",
    condition: (c) => (c.footTraffic != null ? c.footTraffic < 15 : false),
    message: "客流热度不足（< 15），茶饮/咖啡选址建议选择人流量>30的商圈或办公区",
    priority: "high",
    industries: ["beverage"],
  },
  {
    id: "beverage-sweet-spot",
    condition: (c) => {
      const d = c.competitorDensity ?? -1;
      return d >= 1 && d <= 3;
    },
    message: "竞品密度处于甜点区间（1-3家），竞争适中有利于形成品类聚集效应",
    priority: "medium",
    industries: ["beverage"],
  },
  {
    id: "beverage-over-competitive",
    condition: (c) => (c.competitorDensity ?? 0) > 6,
    message: "竞品密度过高（> 6家），建议选择差异化品类或寻找竞争空白区域",
    priority: "high",
    industries: ["beverage"],
  },

  // ——— Pharmacy ———
  {
    id: "pharmacy-school-distance",
    condition: (c) => false, // placeholder — requires school proximity data
    message: "药店选址距离学校/幼儿园需>200m（政策硬约束），当前选址不满足要求",
    priority: "high",
    industries: ["pharmacy"],
  },
  {
    id: "pharmacy-medical-coverage",
    condition: (c) => false, // placeholder
    message: "周边医保定点机构密度较低，建议选择医疗资源集中区域",
    priority: "medium",
    industries: ["pharmacy"],
  },

  // ——— Hotel ———
  {
    id: "hotel-traffic-low",
    condition: (c) => (c.footTraffic != null ? c.footTraffic < 5 : false),
    message: "交通便利度不足，酒店选址应靠近地铁/火车站或主干道",
    priority: "high",
    industries: ["hotel"],
  },
  {
    id: "hotel-cluster-optimum",
    condition: (c) => {
      const d = c.competitorDensity ?? 0;
      return d >= 3 && d <= 8;
    },
    message: "酒店集群度处于最优区间（3-8家），品牌聚集有利于提升区域吸引力",
    priority: "medium",
    industries: ["hotel"],
  },

  // ——— Education ———
  {
    id: "education-family-low",
    condition: (c) => (c.populationDensity != null ? c.populationDensity < 3000 : false),
    message: "周边家庭密度偏低，教育培训应选择有孩家庭集中的成熟社区",
    priority: "high",
    industries: ["education"],
  },
  {
    id: "education-competitor-far",
    condition: (c) => (c.nearestCompetitorDistance != null ? c.nearestCompetitorDistance > 800 : false),
    message: "竞品距离较远（> 800m），该区域可能存在市场空白机会",
    priority: "medium",
    industries: ["education"],
  },

  // ——— Auto4S ———
  {
    id: "auto-road-frontage",
    condition: (c) => (c.roadFrontage != null ? c.roadFrontage < 30 : false),
    message: "临路面宽不足（< 30m），4S店需优先选择临主干道且面宽充足的地块",
    priority: "high",
    industries: ["auto4s"],
  },
  {
    id: "auto-land-insufficient",
    condition: (c) => false, // placeholder
    message: "可用地块面积不足，4S店建议选择5000m²以上商业/工业用地",
    priority: "high",
    industries: ["auto4s"],
  },

  // ——— Medical Aesthetics ———
  {
    id: "beauty-income-low",
    condition: (c) => false, // placeholder
    message: "高净值人群密度不足，医美选址应优先高端商务区和高端居住区",
    priority: "high",
    industries: ["medical_aesthetics"],
  },

  // ——— Logistics ———
  {
    id: "logistics-residential-low",
    condition: (c) => (c.populationDensity != null ? c.populationDensity < 5000 : false),
    message: "居住密度偏低，快递驿站应选择人口集中社区（> 5000人/km²）",
    priority: "high",
    industries: ["logistics"],
  },
  {
    id: "logistics-competitor-near",
    condition: (c) => (c.nearestCompetitorDistance != null ? c.nearestCompetitorDistance < 150 : false),
    message: "竞品距离过近（< 150m），快递驿站通常300m内不宜开设第二家",
    priority: "high",
    industries: ["logistics"],
  },

  // ——— Pet Service ———
  {
    id: "pet-residential-low",
    condition: (c) => (c.populationDensity != null ? c.populationDensity < 4000 : false),
    message: "居住密度偏低，宠物服务应选择成熟中高端社区",
    priority: "medium",
    industries: ["pet_service"],
  },
];

// All rules merged
const ALL_RULES: DecisionRule[] = [...UNIVERSAL_RULES, ...INDUSTRY_RULES];

/**
 * Generate decision advice from analysis context with industry awareness.
 */
export async function generateAdvice(context: AnalysisContext): Promise<DecisionAdvice[]> {
  const advice: DecisionAdvice[] = [];
  const industry = context.industry || undefined;

  for (const rule of ALL_RULES) {
    // Skip industry-specific rules that don't match
    if (rule.industries && rule.industries.length > 0 && industry && !rule.industries.includes(industry)) {
      continue;
    }
    try {
      if (rule.condition(context)) {
        advice.push({ priority: rule.priority, message: rule.message });
      }
    } catch (err: any) {
      logger.warn({ ruleId: rule.id, error: err.message }, "[DecisionEngine] Rule evaluation failed");
    }
  }

  // Sort by priority: high > medium > low
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  advice.sort((a, b) => order[a.priority] - order[b.priority]);

  return advice;
}

/**
 * Synchronous version for backward compatibility (uses default thresholds).
 */
export function generateAdviceSync(context: AnalysisContext): DecisionAdvice[] {
  const advice: DecisionAdvice[] = [];
  for (const rule of ALL_RULES) {
    if (rule.industries && rule.industries.length > 0) continue; // skip industry-specific in sync mode
    try {
      if (rule.condition(context)) {
        advice.push({ priority: rule.priority, message: rule.message });
      }
    } catch {}
  }
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  advice.sort((a, b) => order[a.priority] - order[b.priority]);
  return advice;
}
