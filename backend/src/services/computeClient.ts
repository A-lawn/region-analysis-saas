/**
 * Python计算引擎 HTTP客户端
 * 统一接口：所有请求通过此客户端发送到 compute-engine
 * 支持：签名、超时、降级、日志记录
 */
import crypto from "crypto";
import { config } from "../config";
import logger from "../utils/logger";

const COMPUTE_URL = config.pythonComputeUrl;
const REQUEST_TIMEOUT_MS = 120_000; // 选址优化可能较慢

// ================================================================
// 通用请求
// ================================================================

export interface ComputeResponse<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: Record<string, any>;
}

function signBody(body: Record<string, unknown>): string {
  return crypto
    .createHmac("sha256", config.jwtSecret)
    .update(JSON.stringify(body))
    .digest("hex");
}

export async function computeRequest<TRes = any>(
  path: string,
  body: Record<string, unknown>
): Promise<ComputeResponse<TRes>> {
  const signature = signBody(body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const startMs = Date.now();

  try {
    const resp = await fetch(`${COMPUTE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Signature": signature,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const elapsed = Date.now() - startMs;

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      logger.warn({
        path,
        status: resp.status,
        elapsed,
        error: errBody,
      }, "[ComputeClient] Python engine returned error");
      return { success: false, error: errBody?.error || { code: "HTTP_ERROR", message: `HTTP ${resp.status}` } };
    }

    const result: ComputeResponse<TRes> = await resp.json();

    logger.info({
      path,
      elapsed,
      success: result.success,
      meta: result.meta || {},
    }, "[ComputeClient] Request completed");

    return result;
  } catch (err: any) {
    const elapsed = Date.now() - startMs;
    logger.error({
      path,
      elapsed,
      error: err.message,
    }, "[ComputeClient] Python engine unreachable");

    return {
      success: false,
      error: {
        code: "ENGINE_UNAVAILABLE",
        message: `计算引擎不可用: ${err.message}`,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ================================================================
// 类型化请求函数
// ================================================================

export interface GameSolveRequest {
  project_id: string;
  industry?: string;
  leader_candidates: { id: string; lng: number; lat: number; area?: number; brand?: number }[];
  follower_candidates: { id: string; lng: number; lat: number; area?: number; brand?: number }[];
  leader_p: number;
  follower_q: number;
  h3_demand: { h3: string; lng: number; lat: number; population: number; consumption?: number }[];
  huff_params: Record<string, number>;
  iterations?: number;
}

export interface GameSolveResponse {
  leader_sites: string[];
  leader_revenue: number;
  follower_sites: string[];
  follower_revenue: number;
  cannibalization_pct: number;
  market_share: Record<string, number>;
  solver_stats: Record<string, any>;
}

export interface ScenarioItem {
  label: string;
  type: string;
  follower_q_override?: number;
}

export interface CompareRequest {
  project_id: string;
  leader_candidates: { id: string; lng: number; lat: number; area?: number; brand?: number }[];
  follower_candidates: { id: string; lng: number; lat: number; area?: number; brand?: number }[];
  h3_demand: { h3: string; lng: number; lat: number; population: number; consumption?: number }[];
  huff_params: Record<string, number>;
  plan_a_sites: string[];
  plan_b_sites: string[];
  follower_q: number;
  iterations?: number;
}

export interface HuffFitRequest {
  project_id: string;
  store_attributes: Record<string, Record<string, number>>;
  demand_points: string[];
  observations: { demand_id: string; store_id: string; weight: number; distance_m: number }[];
  extra_attr_names?: string[];
}

export interface HuffFitResponse {
  fitted_params: Record<string, number>;
  r_squared: number;
  aic: number;
  bic: number;
  convergence: boolean;
  standard_errors: Record<string, number>;
  predicted_shares: Record<string, number>;
  n_observations: number;
}

// ================================================================
// 公开函数
// ================================================================

export async function solveGame(body: GameSolveRequest) {
  return computeRequest<GameSolveResponse>("/compute/game/solve", body as any);
}

export async function runScenarios(body: GameSolveRequest & { scenarios: ScenarioItem[] }) {
  return computeRequest<any>("/compute/game/scenarios", body as any);
}

export async function comparePlans(body: CompareRequest) {
  return computeRequest<any>("/compute/game/compare", body as any);
}

export async function fitHuffModel(body: HuffFitRequest) {
  return computeRequest<HuffFitResponse>("/model/huff-fit", body as any);
}

export async function prepareGameData(projectId: string, industry?: string) {
  return computeRequest<any>("/compute/data/prepare", { project_id: projectId, industry });
}

/**
 * 健康检查 — 验证Python引擎是否可达
 */
export async function checkEngineHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${COMPUTE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return resp.ok;
  } catch {
    return false;
  }
}
