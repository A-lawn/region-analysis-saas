import { computeCoverage } from "../services/spatialAnalysis";

export interface CoverageJobParams {
  projectId: string;
  radiusMeters: number;
  opts?: {
    decayMode?: boolean;
    includeWhiteSpace?: boolean;
    clipGeojson?: any;
    networkMode?: 'walking' | 'driving';
  };
}

export async function processCoverageJob(params: CoverageJobParams) {
  return computeCoverage(params.projectId, params.radiusMeters, params.opts);
}
