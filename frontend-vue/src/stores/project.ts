import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ProjectSummary, SpatialPoint } from '@/types'
import { listProjects, getProjectSummary, getPoints } from '@/api'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<any[]>([])
  const currentProjectId = ref<string | null>(null)
  const currentSummary = ref<ProjectSummary | null>(null)
  const currentPoints = ref<SpatialPoint[]>([])
  // 2.4 Pagination state
  const pointsPage = ref(1)
  const pointsLimit = ref(500)
  const pointsTotal = ref(0)
  const pointsTotalPages = ref(0)
  const loading = ref(false)

  const validPoints = computed(() =>
    currentPoints.value.filter(
      (p) => p && !isNaN(p.lng) && !isNaN(p.lat) && isFinite(p.lng) && isFinite(p.lat)
    )
  )

  async function fetchProjects() {
    loading.value = true
    try {
      const { projects: data } = await listProjects()
      projects.value = data
    } finally {
      loading.value = false
    }
  }

  async function loadProject(id: string) {
    currentProjectId.value = id
    loading.value = true
    pointsPage.value = 1
    try {
      const [summary, pts] = await Promise.all([
        getProjectSummary(id),
        getPoints(id, 1, pointsLimit.value),
      ])
      currentSummary.value = summary
      currentPoints.value = pts.points || []
      pointsTotal.value = pts.total
      pointsTotalPages.value = pts.totalPages
    } finally {
      loading.value = false
    }
  }

  // 2.4 Load next page of points
  async function loadMorePoints() {
    if (!currentProjectId.value || pointsPage.value >= pointsTotalPages.value) return
    loading.value = true
    try {
      const nextPage = pointsPage.value + 1
      const pts = await getPoints(currentProjectId.value, nextPage, pointsLimit.value)
      currentPoints.value = [...currentPoints.value, ...(pts.points || [])]
      pointsPage.value = pts.page
      pointsTotal.value = pts.total
      pointsTotalPages.value = pts.totalPages
    } finally {
      loading.value = false
    }
  }

  function clearProject() {
    currentProjectId.value = null
    currentSummary.value = null
    currentPoints.value = []
    pointsPage.value = 1
    pointsTotal.value = 0
    pointsTotalPages.value = 0
  }

  return {
    projects,
    currentProjectId,
    currentSummary,
    currentPoints,
    validPoints,
    pointsPage,
    pointsLimit,
    pointsTotal,
    pointsTotalPages,
    loading,
    fetchProjects,
    loadProject,
    loadMorePoints,
    clearProject,
  }
})