import { computeClusters } from "../services/spatialAnalysis";

export interface ClusterJobParams {
  projectId: string;
  epsMeters: number;
  minPoints: number;
}

export async function processClusterJob(params: ClusterJobParams) {
  return computeClusters(params.projectId, params.epsMeters, params.minPoints);
}
