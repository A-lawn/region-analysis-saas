<template>
  <div class="dashboard-view">
    <div v-if="loading" class="loading-overlay"><div class="spinner"></div><span>加载项目中...</span></div>

    <template v-else-if="summary">
      <div class="dashboard-header">
        <button class="btn-back" @click="router.push({ name: 'upload' })">返回</button>
        <h2>{{ summary.name }}</h2>
        <div class="header-actions"><button class="btn btn-sm" @click="goReport">导出报告</button></div>
      </div>

      <div class="dashboard-grid">
        <aside class="sidebar">
          <SummaryPanel :summary="summary" />
          <div class="tab-bar">
            <button v-for="tab in tabs" :key="tab.key" class="tab-btn" :class="{ active: activeTab === tab.key }" @click="switchTab(tab.key)">{{ tab.label }}</button>
          </div>

          <div v-if="activeTab === 'coverage' || activeTab === 'cluster' || activeTab === 'h3' || activeTab === 'site'" class="map-legend">
            <template v-if="activeTab === 'coverage'">
              <span class="legend-item"><span class="legend-swatch" style="background:rgba(82,196,26,0.5);border:2px solid #237804"></span>已覆盖</span>
              <span class="legend-item"><span class="legend-swatch" style="background:rgba(255,77,79,0.3);border:2px solid #a8071a"></span>集群内盲区</span>
            </template>
            <template v-if="activeTab === 'cluster'">
              <span class="legend-item"><span class="legend-dot" style="background:rgba(22,119,255,0.4);border:2px solid #0958d9"></span>聚类中心</span>
              <span class="legend-item">圆圈大小 = 点数</span>
            </template>
            <template v-if="activeTab === 'h3'">
              密度 <span class="legend-item"><span class="legend-swatch" style="background:#91cf60"></span>低</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#fee08b"></span></span>
              <span class="legend-item"><span class="legend-swatch" style="background:#d73027"></span>高</span>
            </template>
            <template v-if="activeTab === 'site'">
              <span class="legend-item"><span class="legend-dot" style="background:#f5222d"></span>第1</span>
              <span class="legend-item"><span class="legend-dot" style="background:#fa8c16"></span>第2-3</span>
              <span class="legend-item"><span class="legend-dot" style="background:#1677ff"></span>其他</span>
            </template>
          </div>

          <div class="panel-content">
            <CoveragePanel v-if="activeTab === 'coverage'" :project-id="projectId" @result="handleCoverage" />
            <HeatmapPanel v-if="activeTab === 'heatmap'" :project-id="projectId" @result="handleHeatmap" />
            <ClusterPanel v-if="activeTab === 'cluster'" :project-id="projectId" @result="handleCluster" />
            <SiteOptimizationPanel v-if="activeTab === 'site'" :project-id="projectId" :clicked-candidate="siteClickPoint" @result="handleSite" />
            <H3HexagonPanel v-if="activeTab === 'h3'" :project-id="projectId" @result="handleH3" />
          </div>
        </aside>
        <main class="map-area"><MapContainer :points="validPoints" :click-enabled="clickEnabled" @ready="onMapReady" @map-click="handleMapClick" /></main>
      </div>
    </template>
    <div v-else class="empty">项目不存在</div>
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
const siteClickPoint = ref<{ lng: number; lat: number } | null>(null)
const clickEnabled = computed(() => activeTab.value === 'site')

const summary = computed(() => projectStore.currentSummary)
const validPoints = computed(() => projectStore.validPoints)

const tabs = [
  { key: 'coverage', label: '覆盖范围' },
  { key: 'heatmap', label: '热力图' },
  { key: 'cluster', label: '聚类分析' },
  { key: 'site', label: '选址优化' },
  { key: 'h3', label: '等值区域' },
]

function onMapReady(map: any) { mapInstance.value = map }
function switchTab(key: string) { activeTab.value = key; clearOverlays() }
function goReport() { router.push({ name: 'report', params: { id: projectId } }) }

function handleMapClick(pt: { lng: number; lat: number }) {
  siteClickPoint.value = { lng: pt.lng, lat: pt.lat }
}

function handleCoverage(data: CoverageResult | CoverageResult[]) {
  clearOverlays()
  const list = Array.isArray(data) ? data : [data]
  // Multi-radius: different shades for different radii
  const colors = [
    { fill: 'rgba(82,196,26,0.25)', stroke: '#237804' },
    { fill: 'rgba(82,196,26,0.40)', stroke: '#389e0d' },
    { fill: 'rgba(82,196,26,0.55)', stroke: '#52c41a' },
  ]
  let totalCovered = 0
  let totalUncovered = 0
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (!item?.geojson) continue
    const c = colors[i] || colors[0]
    try {
      if (item.geojson.covered) totalCovered += addGeoJSONPolygons(item.geojson.covered, c.fill, c.stroke, 0.35)
    } catch (e: any) {}
    try {
      if (item.geojson.uncovered) totalUncovered += addGeoJSONPolygons(item.geojson.uncovered, 'rgba(255,77,79,0.3)', '#a8071a', 0.2)
    } catch (e: any) {}
  }
  if (list.length > 1) {
    show('多半径对比完成: ' + list.length + ' 层, 颜色越深半径越大 (2km浅/3km中/5km深)', 'success')
  } else if (totalCovered === 0 && totalUncovered === 0) {
    show('覆盖率: ' + (list[0]?.coverageRatio || 0) + '% (无区域数据可渲染)', 'info')
  } else {
    show('覆盖分析完成: 绿色=已覆盖(' + totalCovered + ') 红色=集群内盲区(' + totalUncovered + ')', 'success')
  }
}

function handleHeatmap(data: { points: HeatmapPoint[] }) {
  clearOverlays()
  if (data.points?.length) addHeatmapLayer(data.points)
  else show('热力图数据为空', 'info')
}

function handleCluster(data: ClusterResult) {
  clearOverlays()
  if (!data.clusters?.length) { show('未检测到聚类', 'info'); return }
  const map = getMap()
  if (!map) return
  const AMap = (window as any).AMap
  data.clusters.forEach((c: any) => {
    const r = Math.min(c.pointCount * 2 + 10, 50)
    const html = '<div style="width:' + (r*2) + 'px;height:' + (r*2) + 'px;border-radius:50%;background:rgba(22,119,255,0.3);border:2px solid #0958d9;display:flex;align-items:center;justify-content:center;color:#0958d9;font-size:11px;font-weight:bold;pointer-events:none">' + c.pointCount + '</div>'
    const marker = new AMap.Marker({
      position: [c.center.lng, c.center.lat],
      content: html,
      offset: new AMap.Pixel(-r, -r),
      zIndex: 100,
    })
    marker.setMap(map)
  })
  show('聚类分析完成: ' + data.clusters.length + ' 个聚类, 蓝色圆大小=点数(固定像素)', 'success')
}

function handleSite(data: SiteOptimizationResult) {
  clearOverlays()
  if (!data.candidates?.length) { show('未找到候选位置', 'info'); return }
  const colors = ['#f5222d', '#fa8c16', '#faad14', '#1677ff', '#1677ff']
  addMarkers(data.candidates.map((c, i) => ({ lng: c.lng, lat: c.lat, label: c.name + ' ' + c.score, color: colors[i] || '#1677ff', name: c.name + ' ' + c.score })))
  fitBounds(data.candidates.map((c: any) => ({ lng: c.lng, lat: c.lat })))
}

async function handleH3(data: any) {
  clearOverlays()
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
  } catch { show('H3渲染失败', 'error') }
}

function getH3Color(i: number): string { if(i>=0.8)return'#d73027';if(i>=0.6)return'#fc8d59';if(i>=0.4)return'#fee08b';if(i>=0.2)return'#d9ef8b';return'#91cf60' }

onMounted(async () => {
  try { await projectStore.loadProject(projectId) }
  catch (e: any) { show(e.message || '加载失败', 'error') }
  finally { loading.value = false }
})
</script>

<style scoped>
.dashboard-view { height: calc(100vh - 60px); display: flex; flex-direction: column; }
.loading-overlay { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; }
.spinner { width: 32px; height: 32px; border: 3px solid #e8e8e8; border-top-color: #1677ff; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.dashboard-header { display: flex; align-items: center; gap: 16px; padding: 12px 20px; border-bottom: 1px solid #e8e8e8; background: #fff; }
.dashboard-header h2 { margin: 0; font-size: 18px; flex: 1; }
.header-actions { display: flex; gap: 8px; }
.btn-back { background: none; border: none; color: #1677ff; font-size: 14px; cursor: pointer; }
.btn { padding: 6px 14px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; cursor: pointer; background: #fff; }
.btn-sm { font-size: 12px; }
.btn:hover { border-color: #1677ff; color: #1677ff; }
.dashboard-grid { flex: 1; display: grid; grid-template-columns: 340px 1fr; overflow: hidden; }
.sidebar { overflow-y: auto; border-right: 1px solid #e8e8e8; background: #fff; }
.tab-bar { display: flex; border-bottom: 1px solid #e8e8e8; }
.tab-btn { flex: 1; padding: 10px 0; border: none; background: none; font-size: 13px; cursor: pointer; color: #666; border-bottom: 2px solid transparent; }
.tab-btn.active { color: #1677ff; border-bottom-color: #1677ff; }
.map-legend { display: flex; gap: 10px; padding: 6px 12px; background: #fafafa; border-bottom: 1px solid #e8e8e8; font-size: 11px; align-items: center; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 3px; color: #555; }
.legend-swatch { display: inline-block; width: 18px; height: 10px; border-radius: 2px; }
.legend-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; }
.panel-content { padding: 0; }
.map-area { position: relative; overflow: hidden; }
.empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #999; }
</style>
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
    font-size: 15px;
  }
}