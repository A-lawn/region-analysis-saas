import { computeKDEHeatmap } from "../services/spatialAnalysis";

export interface HeatmapJobParams {
  projectId: string;
  bandwidthMeters: number;
  gridSizeMeters: number;
}

export async function processHeatmapJob(params: HeatmapJobParams) {
  return computeKDEHeatmap(params.projectId, params.bandwidthMeters, params.gridSizeMeters);
}
