export interface DecisionRule {
  id: string;
  condition: (context: AnalysisContext) => boolean;
  message: string;
  priority: "high" | "medium" | "low";
}

export interface AnalysisContext {
  coverageRatio?: number;
  noiseRatio?: number;
  clusterCount?: number;
  pointCount?: number;
  topSiteScore?: number;
  competitorGapRatio?: number;
  isConcentrated?: boolean;
}

export interface DecisionAdvice {
  priority: "high" | "medium" | "low";
  message: string;
}

const rules: DecisionRule[] = [
  {
    id: "low-coverage",
    condition: (c) => (c.coverageRatio ?? 100) < 60,
    message: "存在显著服务盲区，建议优先填补未覆盖区域",
    priority: "high",
  },
  {
    id: "random-distribution",
    condition: (c) => (c.noiseRatio ?? 0) > 0.3,
    message: "点位分布随机性较高，建议考虑结构性布局策略",
    priority: "medium",
  },
  {
    id: "high-concentration",
    condition: (c) => (c.isConcentrated ?? false) && (c.coverageRatio ?? 100) < 70,
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
    id: "market-saturated",
    condition: (c) => (c.competitorGapRatio ?? 1) < 0.5 && (c.coverageRatio ?? 0) > 70,
    message: "市场趋于饱和（竞品密集且自身覆盖率高），建议差异化选址",
    priority: "high",
  },
  {
    id: "market-underserved",
    condition: (c) => (c.competitorGapRatio ?? 1) > 2,
    message: "竞品缺口显著，该区域存在明显市场机会",
    priority: "high",
  },
  {
    id: "few-clusters",
    condition: (c) => (c.clusterCount ?? 0) === 1 && (c.pointCount ?? 0) > 10,
    message: "所有点位聚集在同一区域，建议分析是否向周边区域扩展",
    priority: "low",
  },
];

/**
 * Generate decision advice from analysis context.
 */
export function generateAdvice(context: AnalysisContext): DecisionAdvice[] {
  const advice: DecisionAdvice[] = [];

  for (const rule of rules) {
    try {
      if (rule.condition(context)) {
        advice.push({ priority: rule.priority, message: rule.message });
      }
    } catch {}
  }

  // Sort by priority
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  advice.sort((a, b) => order[a.priority] - order[b.priority]);

  return advice;
}