<template>
  <div class="dashboard-view">
    <div v-if="loading" class="loading-overlay">
      <div class="spinner"></div>
      <span>加载项目中...</span>
    </div>

    <template v-else-if="summary">
      <div class="dashboard-header">
        <button class="btn-back" @click="router.push({ name: 'upload' })">
          <AppIcon name="chevron-left" :size="16" />返回
        </button>
        <h2>{{ summary.name }}</h2>
        <div class="header-actions">
          <button class="btn btn-sm" @click="goReport">
            <AppIcon name="printer" :size="14" />导出报告
          </button>
        </div>
      </div>

      <div class="dashboard-grid">
        <aside class="sidebar">
          <SummaryPanel :summary="summary" />
          <div class="tab-bar">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="tab-btn"
              :class="{ active: activeTab === tab.key }"
              @click="switchTab(tab.key)"
            >
              <AppIcon :name="tab.icon" :size="15" />
              {{ tab.label }}
            </button>
          </div>

          <!-- Floating legend -->
          <div v-if="activeTab === 'coverage' || activeTab === 'cluster' || activeTab === 'h3' || activeTab === 'site'" class="map-legend-floating">
            <template v-if="activeTab === 'coverage'">
              <span class="legend-item"><span class="legend-swatch" style="background:rgba(52,199,89,0.4);border:2px solid #34C759"></span>已覆盖</span>
              <span class="legend-item"><span class="legend-swatch" style="background:rgba(255,59,48,0.25);border:2px solid #FF3B30"></span>集群内盲区</span>
            </template>
            <template v-if="activeTab === 'cluster'">
              <span class="legend-item"><span class="legend-dot" style="background:rgba(0,122,255,0.35);border:2px solid #007AFF"></span>聚类中心</span>
              <span class="legend-item">圆圈大小 = 点数</span>
            </template>
            <template v-if="activeTab === 'h3'">
              密度
              <span class="legend-item"><span class="legend-swatch" style="background:#91CF60"></span>低</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#FEE08B"></span>中</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#D73027"></span>高</span>
            </template>
            <template v-if="activeTab === 'site'">
              <span class="legend-item"><span class="legend-dot" style="background:var(--color-error)"></span>问题站点</span>
              <span class="legend-item"><span class="legend-dot" style="background:var(--color-warning)"></span>潜在问题站点</span>
              <span class="legend-item"><span class="legend-dot" style="background:var(--color-accent)"></span>其他</span>
            </template>
          </div>

          <div class="panel-content">
            <Transition name="panel-fade" mode="out-in">
              <CoveragePanel v-if="activeTab === 'coverage'" :project-id="projectId" @result="handleCoverage" :key="'coverage'" />
              <HeatmapPanel v-else-if="activeTab === 'heatmap'" :project-id="projectId" :industry="detectedIndustry" @result="handleHeatmap" :key="'heatmap'" />
              <ClusterPanel v-else-if="activeTab === 'cluster'" :project-id="projectId" @result="handleCluster" :key="'cluster'" />
              <SiteOptimizationPanel v-else-if="activeTab === 'site'" :project-id="projectId" :clicked-candidate="siteClickPoint" @result="handleSite" :key="'site'" />
              <H3HexagonPanel v-else-if="activeTab === 'h3'" :project-id="projectId" @result="handleH3" :key="'h3'" />
            </Transition>
          </div>
        </aside>
        <main class="map-area">
          <MapContainer :points="validPoints" :marker-groups="siteMarkerGroups" :click-enabled="clickEnabled" @ready="onMapReady" @map-click="handleMapClick" />
        </main>
      </div>
    </template>
    <div v-else class="empty">
      <div class="empty-content">
        <AppIcon name="alert" :size="32" color="var(--color-text-tertiary)" />
        <p>项目不存在</p>
        <button class="btn btn-sm btn-primary" @click="router.push({ name: 'upload' })">创建新项目</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useToast } from '@/composables/useToast'
import { useAmap } from '@/composables/useAmap'
import type { CoverageResult, ClusterResult, HeatmapPoint, SiteOptimizationResult } from '@/types'
import MapContainer from '@/components/shared/MapContainer.vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import SummaryPanel from '@/components/dashboard/SummaryPanel.vue'
import CoveragePanel from '@/components/dashboard/CoveragePanel.vue'
import HeatmapPanel from '@/components/dashboard/HeatmapPanel.vue'
import ClusterPanel from '@/components/dashboard/ClusterPanel.vue'
import SiteOptimizationPanel from '@/components/dashboard/SiteOptimizationPanel.vue'
import H3HexagonPanel from '@/components/dashboard/H3HexagonPanel.vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const { show } = useToast()

const projectId = route.params.id as string
const loading = ref(true)
const activeTab = ref('coverage')
const mapInstance = ref<any>(null)
const { clearOverlays, addGeoJSONPolygons, addHeatmapLayer, addCircles, addMarkers, addPolygons, getMap, fitBounds } = useAmap()
const siteMarkerGroups = ref<{ groupId: string; points: { lng: number; lat: number; name?: string; label?: string; color?: string }[] }[]>([])
const siteClickPoint = ref<{ lng: number; lat: number } | null>(null)
const clickEnabled = computed(() => activeTab.value === 'site')
const detectedIndustry = computed(() => {
  const pts = projectStore.validPoints
  if (!pts || pts.length === 0) return undefined
  const counts: Record<string, number> = {}
  for (const p of pts) {
    const ind = p.metadata?.industry as string
    if (ind) counts[ind] = (counts[ind] || 0) + 1
  }
  let best: string | undefined
  let max = 0
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) { max = v; best = k }
  }
  return best
})

const summary = computed(() => projectStore.currentSummary)
const validPoints = computed(() => projectStore.validPoints)

const tabs = [
  { key: 'coverage', label: '覆盖', icon: 'target' },
  { key: 'heatmap', label: '热力', icon: 'heat' },
  { key: 'cluster', label: '聚类', icon: 'cluster' },
  { key: 'h3', label: '等值区', icon: 'hexagon' },
  { key: 'site', label: '选址', icon: 'site' },
] as const

function switchTab(key: string) {
  clearOverlays(); siteMarkerGroups.value = []
  activeTab.value = key
}

function onMapReady(map: any) {
  mapInstance.value = map
}

function handleMapClick(pt: { lng: number; lat: number }) {
  siteClickPoint.value = pt
}

function goReport() {
  router.push({ name: 'report', params: { id: projectId } })
}

function handleCoverage(data: any, voronoiData?: any) {
  clearOverlays(); siteMarkerGroups.value = []
  if (!data) return
  // If data is a task response (queued), ignore it
  if (data.taskId && data.status === 'queued') return
  const hasVoronoi = voronoiData?.polygons?.length > 0

  // Multi-radius mode: data is an array of CoverageResult
  if (Array.isArray(data)) {
    const results = data as any[]
    let anyCovered = false
    const greenAlphas = [0.2, 0.35, 0.5]
    const redAlphas = [0.12, 0.2, 0.28]
    for (let i = 0; i < results.length; i++) {
      const item = results[i]
      const geojson = item.geojson || {}
      let covered = geojson.covered || item.coveredPolygons
      let uncovered = geojson.uncovered || item.gapPolygons
      if (covered && covered.type === 'Feature') covered = covered.geometry
      if (uncovered && uncovered.type === 'Feature') uncovered = uncovered.geometry
      if (covered) {
        addGeoJSONPolygons(covered, 'rgba(52,199,89,' + greenAlphas[i] + ')', '#34C759')
        anyCovered = true
      }
      if (uncovered && uncovered.coordinates && uncovered.coordinates.length) {
        addGeoJSONPolygons(uncovered, 'rgba(255,59,48,' + redAlphas[i] + ')', '#FF3B30')
      }
    }
    const lastItem = results[results.length - 1]
    const wsGeojson = lastItem?.whiteSpaceGeojson
    if (wsGeojson && wsGeojson.coordinates && wsGeojson.coordinates.length) {
      addGeoJSONPolygons(wsGeojson, 'rgba(0,122,255,0.12)', '#007AFF')
    }
    if (hasVoronoi) {
      const pal = voronoiPalette()
      voronoiData.polygons.forEach((p: any, i: number) => {
        try {
          let geom = typeof p.geojson === 'string' ? JSON.parse(p.geojson) : p.geojson
          if (geom?.type === 'Feature') geom = geom.geometry
          if (geom?.coordinates?.length) {
            const [fill, stroke] = pal[i % pal.length]
            addGeoJSONPolygons(geom, fill, stroke, 0.25)
          }
        } catch {}
      })
    }
    if (!anyCovered && !wsGeojson && !hasVoronoi) show('未检测到覆盖数据', 'info')
    return
  }

  // Single-radius mode: data is a CoverageResult object
  let covered: any = null
  const geojson = data.geojson || {}
  covered = geojson.covered || data.coveredPolygons
  let uncovered = geojson.uncovered || data.gapPolygons

  if (covered && covered.type === 'Feature') covered = covered.geometry
  if (uncovered && uncovered.type === 'Feature') uncovered = uncovered.geometry

  if (covered) addGeoJSONPolygons(covered, 'rgba(52,199,89,0.35)', '#34C759')
  if (uncovered && uncovered.coordinates && uncovered.coordinates.length) {
    addGeoJSONPolygons(uncovered, 'rgba(255,59,48,0.2)', '#FF3B30')
  }

  // Overlap layers overlay (always show, even with Voronoi)
  if (data.overlapGeojson) {
    const ol = data.overlapGeojson
    if (ol.triplePlus && ol.triplePlus.coordinates && ol.triplePlus.coordinates.length) {
      addGeoJSONPolygons(ol.triplePlus, 'rgba(255,59,48,0.3)', '#FF3B30', 0.5)
    }
    if (ol.double && ol.double.coordinates && ol.double.coordinates.length) {
      addGeoJSONPolygons(ol.double, 'rgba(255,149,0,0.25)', '#FF9500', 0.4)
    }
    if (ol.single && ol.single.coordinates && ol.single.coordinates.length) {
      addGeoJSONPolygons(ol.single, 'rgba(52,199,89,0.2)', '#34C759', 0.3)
    }
  }

  // White space overlay
  const wsGeojson = data.whiteSpaceGeojson
  if (wsGeojson && wsGeojson.coordinates && wsGeojson.coordinates.length) {
    addGeoJSONPolygons(wsGeojson, 'rgba(0,122,255,0.12)', '#007AFF')
  }

  // Voronoi overlay (shown on top of coverage base layer)
  if (hasVoronoi) {
    const pal = voronoiPalette()
    voronoiData.polygons.forEach((p: any, i: number) => {
      try {
        let geom = typeof p.geojson === 'string' ? JSON.parse(p.geojson) : p.geojson
        if (geom?.type === 'Feature') geom = geom.geometry
        if (geom?.coordinates?.length) {
          const [fill, stroke] = pal[i % pal.length]
          addGeoJSONPolygons(geom, fill, stroke, 0.25)
        }
      } catch {}
    })
  }

  if (!covered && !wsGeojson && !hasVoronoi) show('未检测到覆盖数据', 'info')
}

function voronoiPalette(): string[][] {
  return [
    ['rgba(0,122,255,0.18)', '#007AFF'], ['rgba(52,199,89,0.18)', '#34C759'],
    ['rgba(255,149,0,0.18)', '#FF9500'], ['rgba(255,59,48,0.15)', '#FF3B30'],
    ['rgba(175,82,222,0.18)', '#AF52DE'], ['rgba(90,200,250,0.18)', '#5AC8FA'],
    ['rgba(255,204,0,0.18)', '#FFCC00'], ['rgba(142,142,147,0.18)', '#8E8E93'],
    ['rgba(52,120,246,0.18)', '#3478F6'], ['rgba(48,219,176,0.18)', '#30DBB0'],
  ]
}
function handleHeatmap(data: { points: HeatmapPoint[] }, bandwidthM = 1000) {
  clearOverlays(); siteMarkerGroups.value = []
  if (data.points?.length) addHeatmapLayer(data.points, { bandwidthM })
  else show('热力图数据为空', 'info')
}

function handleCluster(data: ClusterResult) {
  clearOverlays(); siteMarkerGroups.value = []
  if (!data.clusters?.length) { show('未检测到聚类', 'info'); return }
  const map = getMap()
  if (!map) return
  const AMap = (window as any).AMap
  data.clusters.forEach((c: any) => {
    const r = Math.min(c.pointCount * 2 + 10, 50)
    const html = '<div style="width:' + (r * 2) + 'px;height:' + (r * 2) + 'px;border-radius:50%;background:rgba(0,122,255,0.3);border:2px solid #007AFF;display:flex;align-items:center;justify-content:center;color:#007AFF;font-size: 11px; /* Apple HIG caption */font-weight:bold;pointer-events:none">' + c.pointCount + '</div>'
    const marker = new AMap.Marker({
      position: [c.center.lng, c.center.lat],
      content: html,
      offset: new AMap.Pixel(-r, -r),
      zIndex: 100,
    })
    marker.setMap(map)
  })
  show('聚类分析完成: ' + data.clusters.length + ' 个聚类', 'success')
}

function handleSite(data: SiteOptimizationResult) {
  clearOverlays(); siteMarkerGroups.value = []
  if (!data.candidates?.length) { show('未找到候选位置', 'info'); return }
  const colors = [getComputedStyle(document.documentElement).getPropertyValue('--color-error').trim() || '#FF3B30',
    getComputedStyle(document.documentElement).getPropertyValue('--color-warning').trim() || '#FF9500', '#FF9500',
    getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#007AFF', '#007AFF']
  addMarkers(data.candidates.map((c, i) => ({ lng: c.lng, lat: c.lat, label: c.name + ' ' + c.score, color: colors[i] || '#007AFF', name: c.name + ' ' + c.score })))
  fitBounds(data.candidates.map((c: any) => ({ lng: c.lng, lat: c.lat })))
}

async function handleH3(data: any) {
  clearOverlays(); siteMarkerGroups.value = []
  if (!data.hexagons?.length) { show('等值区域数据为空', 'info'); return }
  try {
    const h3 = await import('h3-js')
    const maxCount = Math.max(...data.hexagons.map((h: any) => h.count), 1)
    data.hexagons.forEach((hex: any) => {
      try {
        const boundary = h3.cellToBoundary(hex.h3Index || hex.hex || '')
        if (boundary?.length) {
          const intensity = hex.count / maxCount
          addPolygons([boundary.map(([lat, lng]: number[]) => [lng, lat])], getH3Color(intensity), 0.5)
        }
      } catch {}
    })
    fitBounds(validPoints.value)
  } catch { show('H3渲染失败', 'error') }
}

function getH3Color(i: number): string {
  if (i >= 0.8) return '#D73027'
  if (i >= 0.6) return '#FC8D59'
  if (i >= 0.4) return '#FEE08B'
  if (i >= 0.2) return '#D9EF8B'
  return '#91CF60'
}

onMounted(async () => {
  try {
    await projectStore.loadProject(projectId)
  } catch (e: any) {
    show(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.dashboard-view {
  height: calc(100vh - var(--nav-height));
  display: flex;
  flex-direction: column;
}

.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* ── Header ── */
.dashboard-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-5);
  background: var(--color-bg-glass);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: 0 0.5px 0 var(--color-border);
  flex-shrink: 0;
}

.dashboard-header h2 {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  flex: 1;
  letter-spacing: -0.01em;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* ── Grid ── */
.dashboard-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 340px 1fr;
  overflow: hidden;
}

/* ── Sidebar ── */
.sidebar {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--color-bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-right: 1px solid var(--color-border);
}

/* ── Tab Bar ── */
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-2);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: var(--space-2) 0;
  border: none;
  background: none;
  font-size: var(--text-xs);
  font-family: var(--font-system);
  font-weight: var(--font-medium);
  cursor: pointer;
  color: var(--color-text-secondary);
  border-bottom: 2px solid transparent;
  transition: all var(--duration-fast) var(--ease-smooth);
  position: relative;
}

.tab-btn:hover {
  color: var(--color-text-primary);
}

.tab-btn.active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

/* ── Floating Legend ── */
.map-legend-floating {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-card);
  backdrop-filter: var(--glass-blur-light);
  -webkit-backdrop-filter: var(--glass-blur-light);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  align-items: center;
  flex-wrap: wrap;
  margin: var(--space-2);
  box-shadow: var(--shadow-card);
}

/* ── Panel Content ── */
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

/* ── Map ── */
.map-area {
  position: relative;
  overflow: hidden;
}

/* ── Empty State ── */
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-content {
  text-align: center;
  color: var(--color-text-secondary);
}

.empty-content p {
  margin: var(--space-3) 0;
}

/* ── Panel Transitions ── */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition:
    opacity var(--duration-normal) var(--ease-smooth),
    transform var(--duration-normal) var(--ease-smooth);
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .sidebar {
    order: 2;
    max-height: 50vh;
  }
  .map-area {
    order: 1;
    min-height: 300px;
  }
  .dashboard-header h2 {
    font-size: var(--text-sm);
  }
}
</style>

