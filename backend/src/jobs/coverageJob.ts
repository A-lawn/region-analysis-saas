import { computeCoverage } from "../services/spatialAnalysis";

export interface CoverageJobParams {
  projectId: string;
  radiusMeters: number;
}

export async function processCoverageJob(params: CoverageJobParams) {
  return computeCoverage(params.projectId, params.radiusMeters);
}
