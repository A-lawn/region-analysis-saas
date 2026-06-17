// ================================================================
// Insight Engine — 行业洞察规则引擎
// 加载行业洞察配置 → 评估候选点 → 输出淘汰/惩罚/加分/洞察标签
// ================================================================

import { loadIndustryConfig } from "./analysis/industryLoader";
import logger from "../utils/logger";
import type {
  IndustryInsightConfig,
  HardConstraint,
  SoftPenalty,
  NonlinearRule,
  InsightCondition,
  InsightResult,
  CandidateInsight,
  CandidateKpiContext,
} from "./analysis/types";

/** 评估单个条件 */
function evaluateCondition(ctx: CandidateKpiContext, cond: InsightCondition): boolean {
  const val = (ctx as any)[cond.field];
  if (val === undefined || val === null) return false;
  switch (cond.op) {
    case "gte": return val >= (cond.value ?? 0);
    case "lte": return val <= (cond.value ?? 0);
    case "eq": return val === cond.value;
    case "gt": return val > (cond.value ?? 0);
    case "lt": return val < (cond.value ?? 0);
    case "between": return val >= (cond.min ?? 0) && val <= (cond.max ?? 0);
    default: return false;
  }
}

/** 从 DB 加载行业洞察配置，fallback 到空配置 */
async function loadInsightConfig(industry: string): Promise<IndustryInsightConfig> {
  try {
    const cfg = await loadIndustryConfig(industry);
    const thresholds = cfg?.decisionThresholds || {};
    // insights 可能存储在 decisionThresholds.insights 或独立的 insights 字段
    const insights = (thresholds as any).insights || {};
    return {
      hard_constraints: insights.hard_constraints || [],
      soft_penalties: insights.soft_penalties || [],
      nonlinear_rules: insights.nonlinear_rules || [],
    };
  } catch (err: any) {
    logger.warn({ industry, error: err.message }, "[InsightEngine] Failed to load, using empty config");
    return { hard_constraints: [], soft_penalties: [], nonlinear_rules: [] };
  }
}

/** 评估单个候选点 */
async function evaluateCandidate(
  ctx: CandidateKpiContext,
  config: IndustryInsightConfig
): Promise<InsightResult> {
  const result: InsightResult = {
    candidateName: ctx.name,
    eliminated: false,
    penaltyFactors: [],
    bonuses: [],
    insights: [],
  };

  // 1. 硬约束评估（任一条触发即淘汰）
  for (const rule of config.hard_constraints) {
    if (evaluateCondition(ctx, rule.condition)) {
      result.eliminated = true;
      result.eliminationReason = rule.message;
      result.insights.push({ type: "eliminated", message: rule.message });
      break; // 已淘汰，不再评估其他硬约束
    }
  }

  // 2. 如果未淘汰，评估软惩罚
  if (!result.eliminated) {
    for (const rule of config.soft_penalties) {
      if (evaluateCondition(ctx, rule.condition)) {
        result.penaltyFactors.push({
          id: rule.id,
          factor: rule.penalty,
          message: rule.message,
        });
        result.insights.push({ type: "warning", message: rule.message });
      }
    }
  }

  // 3. 非线性加分（甜点区/集群效应等，淘汰点也可以有——用于报告展示"虽然不符合但如果在其他情境..."）
  for (const rule of config.nonlinear_rules) {
    if (evaluateCondition(ctx, rule.condition)) {
      result.bonuses.push({
        id: rule.id,
        bonus: rule.bonus,
        message: rule.message,
      });
      result.insights.push({ type: "positive", message: rule.message });
    }
  }

  return result;
}

/** 对外接口：对一批候选点进行评估 */
export async function evaluateCandidates(
  industry: string,
  candidates: CandidateKpiContext[]
): Promise<Map<string, CandidateInsight>> {
  const results = new Map<string, CandidateInsight>();
  if (!industry || candidates.length === 0) return results;

  const config = await loadInsightConfig(industry);

  for (const ctx of candidates) {
    const r = await evaluateCandidate(ctx, config);
    results.set(ctx.name, {
      eliminated: r.eliminated,
      eliminationReason: r.eliminationReason,
      insights: r.insights,
    });
  }

  const eliminated = [...results.values()].filter(r => r.eliminated).length;
  logger.info({ industry, total: candidates.length, eliminated }, "[InsightEngine] Evaluation complete");
  return results;
}

/** 应用洞察修正到评分：淘汰归零、软惩罚乘系数、非线性加分 */
export function applyInsightToScore(
  score: number,
  insight: InsightResult
): number {
  if (insight.eliminated) return 0;
  let adjusted = score;
  for (const p of insight.penaltyFactors) {
    adjusted *= (1 - p.factor);
  }
  for (const b of insight.bonuses) {
    adjusted *= (1 + b.bonus);
  }
  return Math.max(0, adjusted);
}
