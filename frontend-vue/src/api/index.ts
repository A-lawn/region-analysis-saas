import apiClient from './client'
import type {
  UploadResult,
  ProjectSummary,
  SpatialPoint,
  CoverageResult,
  HeatmapPoint,
  ClusterResult,
  SiteOptimizationResult,
  H3Hexagon,
  TaskInfo,
  PointsPaginatedResponse,
} from '@/types'

export async function uploadFile(file: File, sourceCrs: string): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('source_crs', sourceCrs)
  const { data } = await apiClient.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function confirmUpload(payload: { uploadId: string; columnMapping: Record<string, number | null> }): Promise<{ projectId: string; rowsInserted: number; errors?: string[] }> {
  const { data } = await apiClient.post('/upload/confirm', payload)
  return data
}

export async function downloadTemplate(): Promise<void> {
  const res = await apiClient.get('/upload/template', { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = '数据上传模板.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

export async function listProjects(opts?: { search?: string; page?: number; limit?: number }): Promise<{ projects: any[]; total: number; page: number; limit: number; totalPages: number }> {
  const { data } = await apiClient.get('/projects', { params: opts })
  return data
}

export async function getProjectSummary(id: string): Promise<ProjectSummary> {
  const { data } = await apiClient.get('/projects/' + id + '/summary')
  return data
}

export async function getPoints(id: string, page = 1, limit = 500): Promise<PointsPaginatedResponse> {
  const { data } = await apiClient.get('/projects/' + id + '/points', { params: { page, limit } })
  return data
}

export async function getCoverage(id: string, radius: number, decay?: boolean, whitespace?: boolean, clipGeojson?: any, networkMode?: string, industry?: string): Promise<CoverageResult> {
  const params: any = { radius }
  if (decay) params.decay = 'true'
  if (whitespace) params.whitespace = 'true'
  if (industry) params.industry = industry
  const { data } = await apiClient.get('/projects/' + id + '/analysis/coverage', { params })
  return data
}

export async function getHeatmap(id: string, bandwidth: number, gridSize: number): Promise<{ points: HeatmapPoint[] }> {
  const { data } = await apiClient.get('/projects/' + id + '/analysis/heatmap', { params: { bandwidth, gridSize } })
  return data
}

export async function getClusters(id: string, eps: number, minPoints: number): Promise<ClusterResult> {
  const { data } = await apiClient.get('/projects/' + id + '/analysis/clusters', { params: { eps, minPoints } })
  return data
}

export async function getSiteOptimization(
  id: string,
  candidates: { name: string; lng: number; lat: number }[],
  weights: Record<string, number>,
  topK: number,
  industry?: string
): Promise<SiteOptimizationResult> {
  const { data } = await apiClient.post('/projects/' + id + '/analysis/site-optimization', { candidates, weights, topK, industry })
  return data
}


export async function getH3Hexagons(id: string, resolution: number): Promise<{ hexagons: H3Hexagon[]; resolution: number }> {
  const { data } = await apiClient.get('/projects/' + id + '/analysis/h3-hexagons', { params: { resolution } })
  return data
}

export async function getTaskStatus(taskId: string): Promise<TaskInfo> {
  const { data } = await apiClient.get('/tasks/' + taskId)
  return data
}


export interface IndustryRadius {
  industry: string
  label: string
  radiusMeters: number
}

export async function getIndustryRadii(): Promise<{ industries: IndustryRadius[] }> {
  const { data } = await apiClient.get('/coverage/industry-radii')
  return data
}

// ---- Delete / Restore / Purge ----

export interface DeletedProject {
  projectName: string
  projectId: string
  deletedAt: string
  pointCount: number
  expiresAt: string
  daysRemaining: number
  sourceCrs: string
}

export async function deleteProject(id: string): Promise<{ deleted: boolean }> {
  const { data } = await apiClient.delete('/projects/' + id)
  return data
}

export async function listDeletedProjects(): Promise<{ backups: DeletedProject[] }> {
  const { data } = await apiClient.get('/projects/deleted')
  return data
}

export async function restoreProject(projectId: string): Promise<{ projectId: string; name: string }> {
  const { data } = await apiClient.post('/projects/' + projectId + '/restore', { projectId })
  return data
}

export async function purgeProject(projectId: string): Promise<{ purged: boolean }> {
  const { data } = await apiClient.delete('/projects/deleted/purge', { data: { projectId } })
  return data
}

export async function purgeAllDeletedProjects(): Promise<{ purged: number }> {
  const { data } = await apiClient.delete('/projects/deleted/purge-all')
  return data
}



// ===== Platform Data APIs (v3.1 — 数据底座接口) =====

export interface PoiPoint {
  id: string
  name: string
  industry: string
  lng: number
  lat: number
  address: string
  city: string
  district: string
  brandChain: string | null
  source: string
  collectedAt: string
}

export interface PoiSearchResult {
  points: PoiPoint[]
  total: number
  dataCoverageNote: string
}

export async function searchPoi(opts: { industry: string; city: string; bounds?: string; limit?: number }): Promise<PoiSearchResult> {
  const { data } = await apiClient.get('/poi/search', { params: opts })
  return data
}

export interface DemandCell {
  h3: string
  lng: number
  lat: number
  population: number
  consumptionIndex: number
  residentialRatio: number
  commercialRatio: number
  dataSource: string
  dataYear: number
}

export interface DemandGridResult {
  cells: DemandCell[]
  total: number
  resolution: number
  dataCoverageNote: string
}

export async function getDemandGrid(bounds: string, resolution?: number): Promise<DemandGridResult> {
  const { data } = await apiClient.get('/demand/h3-grid', { params: { bounds, resolution } })
  return data
}

export interface DemandStats {
  totalPopulation: number
  cellCount: number
  avgConsumptionIndex: number
  avgResidentialRatio: number
}

export async function getDemandStats(bounds: string): Promise<DemandStats> {
  const { data } = await apiClient.get('/demand/stats', { params: { bounds } })
  return data
}

// ===== Game Theory APIs (v3.0) =====
import type { GameSolveResponse, GameCompareResponse, HuffParams, GameCandidate, ScenarioItem } from '@/types'

export async function solveGame(
  projectId: string,
  leaderCandidates: GameCandidate[],
  followerCandidates: GameCandidate[],
  leaderP: number,
  followerQ: number,
  industry?: string,
  iterations?: number,
  huffParamsOverride?: { lambda: number; alpha_area: number; alpha_brand: number },
): Promise<GameSolveResponse> {
  const { data } = await apiClient.post(`/projects/${projectId}/game/solve`, {
    leader_candidates: leaderCandidates,
    follower_candidates: followerCandidates,
    leader_p: leaderP,
    follower_q: followerQ,
    industry,
    iterations,
    huff_params: huffParamsOverride,
  })
  return data
}

export async function runGameScenarios(
  projectId: string,
  leaderCandidates: GameCandidate[],
  followerCandidates: GameCandidate[],
  leaderP: number,
  followerQ: number,
  industry: string | undefined,
  scenarios: ScenarioItem[],
  iterations?: number,
): Promise<GameSolveResponse> {
  const { data } = await apiClient.post(`/projects/${projectId}/game/solve`, {
    leader_candidates: leaderCandidates,
    follower_candidates: followerCandidates,
    leader_p: leaderP,
    follower_q: followerQ,
    industry,
    scenarios,
    iterations,
  })
  return data
}

export async function compareGamePlans(
  projectId: string,
  leaderCandidates: GameCandidate[],
  followerCandidates: GameCandidate[],
  planASites: string[],
  planBSites: string[],
  followerQ: number,
  industry?: string,
  huffParamsOverride?: { lambda: number; alpha_area: number; alpha_brand: number },
): Promise<GameCompareResponse> {
  const { data } = await apiClient.post(`/projects/${projectId}/game/compare`, {
    leader_candidates: leaderCandidates,
    follower_candidates: followerCandidates,
    plan_a_sites: planASites,
    plan_b_sites: planBSites,
    follower_q: followerQ,
    industry,
    huff_params: huffParamsOverride,
  })
  return data
}

export async function getHuffParams(projectId: string, industry?: string): Promise<HuffParams> {
  const { data } = await apiClient.get(`/projects/${projectId}/game/huff-params`, {
    params: { industry },
  })
  return data
}

export async function checkComputeHealth(): Promise<{ engine: string }> {
  const { data } = await apiClient.get('/compute/health')
  return data
}

// ===== Industry APIs (v2.0) =====
export async function getIndustries(): Promise<{ models: any[]; kpiDisplayNames?: Record<string, string> }> {
  const { data } = await apiClient.get('/industries')
  return data
}

export async function getIndustryConfig(industry: string): Promise<any> {
  const { data } = await apiClient.get('/industries/' + industry + '/model')
  return data
}
