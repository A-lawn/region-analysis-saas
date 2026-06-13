// Shared types for spatial analysis services

export interface TriangulationMetrics {
  coverageConnectivity: number;
  overlapRatio: number;
  gapRatio: number;
  totalEdges: number;
  connectedEdges: number;
  gappedEdges: number;
  minEdgeM: number;
  maxEdgeM: number;
  avgEdgeM: number;
}

export interface DecayZone {
  zone: string;
  areaSqm: number;
  weight: number;
  geojson: any;
}

export interface OverlapLayers {
  single: number;
  double: number;
  triplePlus: number;
}

export interface CoverageResult {
  coveredArea: number;
  bufferUnionArea: number;
  totalBufferArea: number;
  hullArea: number;
  uncoveredArea: number;
  geojson: any;
  triangulation?: TriangulationMetrics;
  hullType?: string;
  clipAreaSqm?: number;
  networkFallback?: boolean;
  decayBreakdown?: DecayZone[];
  effectiveCoveredArea?: number;
  effectiveCoverageRatio?: number;
  overlapLayers?: OverlapLayers;
  overlapGeojson?: { single: any; double: any; triplePlus: any };
  cannibalizationIndex?: number;
  advice?: { priority: string; message: string }[];
  whiteSpaceGeojson?: any;
}

export interface HeatmapPoint {
  lng: number;
  lat: number;
  weight: number;
}

export interface ClusterResult {
  clusters: { clusterId: number; pointCount: number; center: { lng: number; lat: number }; points: any[] }[];
  noise: number;
}

export interface SiteOptimizationOptions {
  candidates: { name: string; lng: number; lat: number }[];
  weights: Record<string, number> & { distanceWeight?: number; blindSpotWeight?: number; densityWeight?: number };
  topK: number;
  industry?: string;
}
