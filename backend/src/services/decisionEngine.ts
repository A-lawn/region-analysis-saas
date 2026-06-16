import { loadIndustryConfig } from "./analysis/industryLoader";
import logger from "../utils/logger";

// ================================================================
// Decision Engine v3.1 — industry-aware with parametric advice + legal disclaimer
// ================================================================

// Per-advice disclaimer suffix (legal firewall)
const DISCLAIMER = "以上分析基于当前数据模型，实际经营效果受市场变化、运营能力、政策环境等多种因素影响。最终选址决策请结合实地考察，由用户自行做出。平台不构成商业承诺，不承担经营结果连带责任。";

export interface DecisionRule {
  id: string;
  condition: (context: AnalysisContext, thresholds: IndustryThresholds) => boolean;
  messageTemplate: string;  // parametric: use {value} placeholders
  priority: "high" | "medium" | "low";
  industries?: string[];
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
  // Candidate-specific fields
  candidateScore?: number;
  candidateName?: string;
  competitorCount300m?: number;
  competitorCount500m?: number;
  competitorCount1000m?: number;
  area?: number;
  brand?: number;
  nearMetro?: boolean;
  nearHospital?: boolean;
  nearSchool?: boolean;
  isCommercialZone?: boolean;
  isResidentialZone?: boolean;
  // Confidence metadata
  confidence?: "high" | "medium" | "low";
  dataGaps?: string[];
}

export interface DecisionAdvice {
  priority: "high" | "medium" | "low";
  message: string;
  candidateName?: string;  // which candidate this advice is for
  confidence?: "high" | "medium" | "low";
}

export interface DecisionResult {
  advice: DecisionAdvice[];
  eliminated?: boolean;
  eliminationReason?: string;
  insights?: { type: "eliminated" | "warning" | "positive" | "info"; message: string }[];
  dataGaps?: string[];
}

// ===== Industry-specific thresholds =====
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
  gapRatioCritical: 40, gapRatioWarning: 30, overlapCritical: 60, overlapWarning: 40,
  coverageLow: 35, coverageMedium: 60, coverageHigh: 80,
  topSiteHigh: 0.75, topSiteMedium: 0.4, cannibalizationCritical: 30,
  competitorDistanceCritical: 300, competitorDistanceWarning: 500,
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

// ===== Utility: fill template with context values =====
function fillTemplate(tmpl: string, ctx: AnalysisContext, thresholds: IndustryThresholds): string {
  const gap = ctx.triangulation?.gapRatio ?? 0;
  const overlap = ctx.triangulation?.overlapRatio ?? 0;
  const coverage = ctx.coverageRatio ?? 0;
  return tmpl
    .replace(/{candidateName}/g, ctx.candidateName || "该候选点")
    .replace(/{pointCount}/g, String(ctx.pointCount ?? 0))
    .replace(/{gapRatio}/g, gap.toFixed(0) + "%")
    .replace(/{overlapRatio}/g, overlap.toFixed(0) + "%")
    .replace(/{coverageRatio}/g, coverage.toFixed(0) + "%")
    .replace(/{topSiteScore}/g, ((ctx.topSiteScore ?? 0) * 100).toFixed(0))
    .replace(/{competitorDensity}/g, String(ctx.competitorDensity ?? 0))
    .replace(/{competitorCount500m}/g, String(ctx.competitorCount500m ?? 0))
    .replace(/{competitorCount1000m}/g, String(ctx.competitorCount1000m ?? 0))
    .replace(/{nearestCompetitorDistance}/g, String(ctx.nearestCompetitorDistance ?? 0) + "m")
    .replace(/{walkableRatio}/g, ((ctx.walkableRatio ?? 0) * 100).toFixed(0) + "%")
    .replace(/{cannibalizationIndex}/g, String(ctx.cannibalizationIndex ?? 0) + "%")
    .replace(/{populationDensity}/g, String(ctx.populationDensity ?? 0))
    .replace(/{footTraffic}/g, String(ctx.footTraffic ?? 0))
    .replace(/{roadFrontage}/g, String(ctx.roadFrontage ?? 0) + "m")
    .replace(/{gapCritical}/g, String(thresholds.gapRatioCritical) + "%")
    .replace(/{gapWarning}/g, String(thresholds.gapRatioWarning) + "%")
    .replace(/{overlapCritical}/g, String(thresholds.overlapCritical) + "%")
    .replace(/{compDistCritical}/g, String(thresholds.competitorDistanceCritical) + "m");
}

// ===== Universal Rules (all industries) — language neutralized =====
const UNIVERSAL_RULES: DecisionRule[] = [
  {
    id: "critical-gap",
    condition: (c, t) => (c.triangulation?.gapRatio ?? 0) > t.gapRatioCritical && (c.pointCount ?? 0) >= 3,
    messageTemplate: "数据表明存在较大服务盲区（门店间空隙率 {gapRatio}，超过临界值 {gapCritical}）。该数据可作为优先考虑新点位布局的参考方向。",
    priority: "high",
  },
  {
    id: "warning-gap",
    condition: (c, t) => {
      const g = c.triangulation?.gapRatio ?? 0;
      return g > t.gapRatioWarning && g <= t.gapRatioCritical && (c.pointCount ?? 0) >= 3;
    },
    messageTemplate: "数据表明存在一定服务盲区趋势（空隙率 {gapRatio}，高于预警值 {gapWarning}）。建议关注覆盖不足的区域。",
    priority: "medium",
  },
  {
    id: "high-noise-ratio",
    condition: (c, t) => (c.noiseRatio ?? 0) > 0.4,
    messageTemplate: "点位分布随机性较高，现有布局的结构性较弱。如计划扩展，可考虑更系统的选址策略。",
    priority: "low",
  },
  {
    id: "concentrated-expansion",
    condition: (c, t) => (c.triangulation?.coverageConnectivity ?? 0) > 0.7 && (c.pointCount ?? 0) >= 5 && (c.isConcentrated ?? false),
    messageTemplate: "现有{pointCount}个点位高度集中在同一区域。数据表明外围可能存在未充分服务的市场空间。",
    priority: "medium",
  },
  {
    id: "top-site-excellent",
    condition: (c, t) => (c.topSiteScore ?? 0) > t.topSiteHigh,
    messageTemplate: "候选点「{candidateName}」综合评分排名第1位（{topSiteScore}分）。在当前数据条件下该点位表现最优。",
    priority: "high",
  },
  {
    id: "top-site-moderate",
    condition: (c, t) => {
      const s = c.topSiteScore ?? 0;
      return s >= t.topSiteMedium && s <= t.topSiteHigh;
    },
    messageTemplate: "候选点「{candidateName}」综合评分中等的{topSiteScore}分，在当前候选点中排名靠前。可作为备选方向，建议结合实地调研进一步判断。",
    priority: "medium",
  },
  {
    id: "top-site-low",
    condition: (c, t) => (c.topSiteScore ?? 1) < t.topSiteMedium,
    messageTemplate: "候选点「{candidateName}」综合评分偏低（{topSiteScore}分）。在当前数据条件下，该点位竞争力较弱。建议扩大候选范围或调整对目标区域的预期。",
    priority: "high",
  },
  {
    id: "critical-overlap",
    condition: (c, t) => (c.triangulation?.overlapRatio ?? 0) > t.overlapCritical && (c.pointCount ?? 0) >= 3,
    messageTemplate: "门店间服务区重叠率较高（{overlapRatio}，超过临界值 {overlapCritical}），同品牌门店可能存在相互分流风险。数据可作为优化门店间距的参考。",
    priority: "high",
  },
  {
    id: "warning-overlap",
    condition: (c, t) => {
      const o = c.triangulation?.overlapRatio ?? 0;
      return o > t.overlapWarning && o <= t.overlapCritical && (c.pointCount ?? 0) >= 3;
    },
    messageTemplate: "门店服务区存在中等程度重叠（{overlapRatio}），建议关注门店间均衡布局。",
    priority: "medium",
  },
  {
    id: "all-same-cluster",
    condition: (c, t) => (c.clusterCount ?? 2) <= 1 && (c.pointCount ?? 0) >= 5,
    messageTemplate: "所有{pointCount}个点位聚集在同一区域。数据表明其他方向可能存在未覆盖的市场需求。",
    priority: "low",
  },
  {
    id: "high-cannibalization",
    condition: (c, t) => (c.cannibalizationIndex ?? 0) > t.cannibalizationCritical,
    messageTemplate: "同品牌门店间客流分流指数偏高（{cannibalizationIndex}，超过临界值）。现有布局下部分门店可能面临收入稀释。",
    priority: "high",
  },
];

// ===== Industry-Specific Rules — parametric + language neutralized =====
const INDUSTRY_RULES: DecisionRule[] = [
  // ——— Convenience ———
  {
    id: "convenience-walkable-low",
    condition: (c, t) => (c.walkableRatio != null ? c.walkableRatio < 0.3 : false),
    messageTemplate: "步行可达比偏低（{walkableRatio}），数据表明便利店选址在高密度居住区的表现通常更优。",
    priority: "high",
    industries: ["convenience"],
  },
  {
    id: "convenience-competitor-too-close",
    condition: (c, t) => (c.nearestCompetitorDistance != null ? c.nearestCompetitorDistance < 100 : false),
    messageTemplate: "最近竞品距离仅{nearestCompetitorDistance}，在该距离范围内小店生存空间可能受限。便利店行业通常建议保持300m以上间距。",
    priority: "high",
    industries: ["convenience"],
  },

  // ——— Beverage ———
  {
    id: "beverage-traffic-low",
    condition: (c, t) => (c.footTraffic != null ? c.footTraffic < 15 : false),
    messageTemplate: "周边热度指数偏低（{footTraffic}），茶饮/咖啡业态通常在选择人流量较高的商圈或办公区时表现更佳。",
    priority: "high",
    industries: ["beverage"],
  },
  {
    id: "beverage-sweet-spot",
    condition: (c, t) => {
      const d = c.competitorDensity ?? -1;
      return d >= 1 && d <= 3;
    },
    messageTemplate: "竞品密度处于适中区间（{competitorDensity}家），适度的竞争环境有助于形成品类聚集效应。",
    priority: "medium",
    industries: ["beverage"],
  },
  {
    id: "beverage-over-competitive",
    condition: (c, t) => (c.competitorDensity ?? 0) > 6,
    messageTemplate: "竞品密度偏高（{competitorDensity}家），该区域茶饮/咖啡品类竞争较激烈。数据表明选择差异化品类或寻找竞争相对稀疏的区域可能更有利。",
    priority: "high",
    industries: ["beverage"],
  },

  // ——— Pharmacy ———
  {
    id: "pharmacy-school-distance",
    condition: (c, t) => false,
    messageTemplate: "药店选址距学校/幼儿园的距离是行业政策的硬约束（通常要求>200m）。当前系统尚未接入学校位置数据，建议人工核实。",
    priority: "high",
    industries: ["pharmacy"],
  },
  {
    id: "pharmacy-medical-coverage",
    condition: (c, t) => false,
    messageTemplate: "周边医保定点机构的密度数据暂未接入，建议人工评估医疗资源集中度。",
    priority: "medium",
    industries: ["pharmacy"],
  },

  // ——— Hotel ———
  {
    id: "hotel-traffic-low",
    condition: (c, t) => (c.footTraffic != null ? c.footTraffic < 5 : false),
    messageTemplate: "交通枢纽可达性偏低（{footTraffic}），酒店业态通常受益于靠近地铁/火车站或主干道的位置。",
    priority: "high",
    industries: ["hotel"],
  },
  {
    id: "hotel-cluster-optimum",
    condition: (c, t) => {
      const d = c.competitorDensity ?? 0;
      return d >= 3 && d <= 8;
    },
    messageTemplate: "酒店集群度处于适中区间（{competitorDensity}家），品牌聚集可能提升区域住宿吸引力。",
    priority: "medium",
    industries: ["hotel"],
  },

  // ——— Education ———
  {
    id: "education-family-low",
    condition: (c, t) => (c.populationDensity != null ? c.populationDensity < 3000 : false),
    messageTemplate: "周边常住人口密度偏低（{populationDensity}人/km²），教育培训业态通常在有孩家庭集中的社区中表现更优。",
    priority: "high",
    industries: ["education"],
  },
  {
    id: "education-competitor-far",
    condition: (c, t) => (c.nearestCompetitorDistance != null ? c.nearestCompetitorDistance > 800 : false),
    messageTemplate: "最近竞品距离{nearestCompetitorDistance}，该区域当前竞争压力较小，可能存在市场进入机会。",
    priority: "medium",
    industries: ["education"],
  },

  // ——— Auto4S ———
  {
    id: "auto-road-frontage",
    condition: (c, t) => (c.roadFrontage != null ? c.roadFrontage < 30 : false),
    messageTemplate: "临路面宽{roadFrontage}，4S店通常需要较宽的临街面以支持车辆进出和展示。",
    priority: "high",
    industries: ["auto4s"],
  },
  {
    id: "auto-land-insufficient",
    condition: (c, t) => false,
    messageTemplate: "地块面积数据暂未接入。4S店行业通常需要5000m²以上的商业/工业用地，建议人工核实。",
    priority: "high",
    industries: ["auto4s"],
  },

  // ——— Medical Aesthetics ———
  {
    id: "beauty-income-low",
    condition: (c, t) => false,
    messageTemplate: "周边高消费力人群的密度数据暂未接入。医美/口腔选址通常优先考虑高端商务区和高端居住区，建议人工评估。",
    priority: "high",
    industries: ["medical_aesthetics"],
  },

  // ——— Logistics ———
  {
    id: "logistics-residential-low",
    condition: (c, t) => (c.populationDensity != null ? c.populationDensity < 5000 : false),
    messageTemplate: "居住密度偏低（{populationDensity}人/km²），快递驿站通常需要较高的人口密度（>5000人/km²）来维持单量。",
    priority: "high",
    industries: ["logistics"],
  },
  {
    id: "logistics-competitor-near",
    condition: (c, t) => (c.nearestCompetitorDistance != null ? c.nearestCompetitorDistance < t.competitorDistanceCritical : false),
    messageTemplate: "最近竞品距离仅{nearestCompetitorDistance}（低于{compDistCritical}临界值），快递驿站行业通常要求300m以上间距以避免市场过度饱和。",
    priority: "high",
    industries: ["logistics"],
  },

  // ——— Pet Service ———
  {
    id: "pet-residential-low",
    condition: (c, t) => (c.populationDensity != null ? c.populationDensity < 4000 : false),
    messageTemplate: "居住密度偏低（{populationDensity}人/km²），宠物服务通常在高品质社区中需求更旺盛。",
    priority: "medium",
    industries: ["pet_service"],
  },
];

const ALL_RULES: DecisionRule[] = [...UNIVERSAL_RULES, ...INDUSTRY_RULES];

// ================================================================
// Main: generate advice for a single candidate point
// ================================================================
export async function generateAdviceForCandidate(
  context: AnalysisContext
): Promise<DecisionAdvice[]> {
  const advice: DecisionAdvice[] = [];
  const industry = context.industry || undefined;
  const thresholds = await getThresholds(industry);

  for (const rule of ALL_RULES) {
    if (rule.industries && rule.industries.length > 0 && industry && !rule.industries.includes(industry)) {
      continue;
    }
    try {
      if (rule.condition(context, thresholds)) {
        const filledMsg = fillTemplate(rule.messageTemplate, context, thresholds);
        // Append legal disclaimer to every advice
        advice.push({
          priority: rule.priority,
          message: filledMsg + "\n（" + DISCLAIMER + "）",
          candidateName: context.candidateName,
          confidence: context.confidence || "medium",
        });
      }
    } catch (err: any) {
      logger.warn({ ruleId: rule.id, error: err.message }, "[DecisionEngine] Rule evaluation failed");
    }
  }

  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  advice.sort((a, b) => order[a.priority] - order[b.priority]);
  return advice;
}

// ================================================================
// Legacy: generate advice for a project context (backward compat)
// ================================================================
export async function generateAdvice(context: AnalysisContext): Promise<DecisionAdvice[]> {
  return generateAdviceForCandidate(context);
}

// ================================================================
// Synchronous fallback for backward compatibility
// ================================================================
export function generateAdviceSync(context: AnalysisContext): DecisionAdvice[] {
  const advice: DecisionAdvice[] = [];
  const thresholds = DEFAULT_THRESHOLDS;
  for (const rule of ALL_RULES) {
    if (rule.industries && rule.industries.length > 0) continue;
    try {
      if (rule.condition(context, thresholds)) {
        const filledMsg = fillTemplate(rule.messageTemplate, context, thresholds);
        advice.push({
          priority: rule.priority,
          message: filledMsg + "\n（" + DISCLAIMER + "）",
          candidateName: context.candidateName,
        });
      }
    } catch {}
  }
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  advice.sort((a, b) => order[a.priority] - order[b.priority]);
  return advice;
}
