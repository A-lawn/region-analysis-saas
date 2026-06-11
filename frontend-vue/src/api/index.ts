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

export async function getCoverage(id: string, radius: number): Promise<CoverageResult> {
  const { data } = await apiClient.get('/projects/' + id + '/analysis/coverage', { params: { radius } })
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

// ---- Delete / Restore / Purge ----

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

export async function purgeProject(projectId: string, removeBackup: boolean = false): Promise<{ purged: boolean }> {
  const { data } = await apiClient.delete('/projects/deleted/purge', { data: { projectId, removeBackup } })
  return data
}

