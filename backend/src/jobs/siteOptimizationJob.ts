import { computeSiteOptimization } from "../services/spatialAnalysis";
import type { SiteOptimizationOptions } from "../services/spatialAnalysis";

export interface SiteOptimizationJobParams {
  projectId: string;
  options: SiteOptimizationOptions;
}

export async function processSiteOptimizationJob(params: SiteOptimizationJobParams) {
  return computeSiteOptimization(params.projectId, params.options);
}
