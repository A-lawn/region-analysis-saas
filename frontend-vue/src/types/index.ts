export interface LngLat {
  lng: number
  lat: number
}

export interface Bounds {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

export interface ProjectSummary {
  id: string
  name: string
  sourceCrs: string
  status: string
  createdAt: string
  stats: {
    pointCount: number
    bounds: Bounds
    center: LngLat
    areaSqm: number
    avgNeighborDistM: number
    minNeighborDistM: number
    maxNeighborDistM: number
  }
}

export interface SpatialPoint {
  id: string
  name: string
  address: string
  lng: number
  lat: number
  metadata?: Record<string, any>
}

export interface UploadResult {
  uploadId: string
  fileName: string
  sheetName: string
  sourceCrs: string
  totalRows: number
  headers: string[]
  detectedColumns: {
    nameCol: number | null
    addressCol: number | null
    lngCol: number | null
    latCol: number | null
  }
  warnings: string[]
  preview: any[]
}

export interface DecayZone {
  zone: string
  areaSqm: number
  weight: number
  geojson?: any
}
export interface OverlapLayers {
  single: number
  double: number
  triplePlus: number
}
export interface TriangulationMetrics {
  coverageConnectivity: number
  overlapRatio: number
  gapRatio: number
  totalEdges: number
  connectedEdges: number
  gappedEdges: number
  minEdgeM: number
  maxEdgeM: number
  avgEdgeM: number
}

export interface CoverageResult {
  coveredArea: number
  bufferUnionArea: number
  totalBufferArea: number
  hullArea: number
  uncoveredArea: number
  triangulation?: TriangulationMetrics
  hullType?: 'concave' | 'convex_fallback'
  clipAreaSqm?: number
  networkFallback?: boolean
  geojson: any
  decayBreakdown?: DecayZone[]
  effectiveCoveredArea?: number
  effectiveCoverageRatio?: number
  overlapLayers?: OverlapLayers
  cannibalizationIndex?: number
  advice?: { priority: string; message: string }[]
  whiteSpaceGeojson?: any
}

export interface HeatmapPoint {
  lng: number
  lat: number
  weight: number
}

export interface ClusterResult {
  clusters: {
    clusterId: number
    pointCount: number
    center: LngLat
    points: any[]
  }[]
  noise: number
}

export interface SiteCandidate {
  name: string
  lng: number
  lat: number
  score: number
  dimensions: Record<string, number>
  advice?: { message: string; priority: "high" | "medium" | "low" }[]
}

export interface SiteOptimizationResult {
  candidates: SiteCandidate[]
  weights: Record<string, number>
}

export interface H3Hexagon {
  h3Index: string
  count: number
  boundary: [number, number][]
  areaKm2: number
}

export interface TaskInfo {
  taskId: string
  status: "queued" | "running" | "completed" | "failed"
  result?: any
  error?: string
}

export interface UserInfo {
  id: string
  email: string
  tenantId: string
  role: string
}

export type CrsType = "wgs84" | "gcj02" | "bd09"

// Paginated points response (2.4)
export interface PointsPaginatedResponse {
  points: SpatialPoint[];
  total: number;
  page: number;
  totalPages: number;
}
// Recycle bin / soft-delete
export interface DeletedProject {
  projectName: string
  projectId: string
  deletedAt: string
  pointCount: number
  filePath: string
  expiresAt: string
  daysRemaining: number
  sourceCrs: string
}


// ===== Industry Configuration (v2.0) =====
export interface IndustryConfig {
  industry: string
  displayName: string
  radiusMeters: number
  weights: Record<string, number>
  kpiWeights: Record<string, number>
  keywords: string[]
  analysisParams: {
    coverage: { radiusMeters: number }
    competition: { nearRadiusM: number; farRadiusM: number; normalization: Record<string, any> }
    scoring: { distanceNormalizeM: number; densityNormalizeCount: number; blindspotNormalizeM: number }
    kde: { bandwidthM: number; gridSizeM: number; maxGridCells: number; cutoffFactor: number }
    cluster: { epsM: number; minPoints: number }
  }
  decisionThresholds: Record<string, any>
  benchmarks: Record<string, any>
}

export interface IndustryListItem {
  industry: string
  label: string
  radiusMeters: number
}
