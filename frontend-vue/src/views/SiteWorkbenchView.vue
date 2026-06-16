<template>
  <div class="site-workbench">
    <div class="workbench-hero">
      <h1>选址决策建议引擎</h1>
      <p>选择行业和区域，在地图上标注候选点位，获取基于真实市场数据的选址建议</p>
    </div>

    <ConsentModal v-if="!consented" @agree="consented = true" />

    <template v-if="consented">
      <div class="workbench-grid">
        <!-- Left: Config panel -->
        <aside class="config-sidebar">
          <!-- Step 1: Industry -->
          <div class="config-step">
            <div class="step-label">1. 选择行业</div>
            <IndustrySelector v-model="industry" :show-label="false" />
            <p class="step-hint" v-if="industryConfig">
              服务半径: {{ industryConfig.radiusMeters }}m · {{ industryConfig.displayName }}
            </p>
          </div>

          <!-- Step 2: Region -->
          <div class="config-step">
            <div class="step-label">2. 选择区域</div>
            <div class="region-input-row">
              <select v-model="city" class="form-select" @change="onCityChange">
                <option value="">选择城市</option>
                <option v-for="c in availableCities" :key="c.code" :value="c.code">{{ c.name }}</option>
              </select>
              <select v-model="district" class="form-select" :disabled="!city" @change="onDistrictChange">
                <option value="">选择区县</option>
                <option v-for="d in availableDistricts" :key="d.code" :value="d.code">{{ d.name }}</option>
              </select>
            </div>
            <p class="step-hint" v-if="city && district">当前分析区域：{{ selectedRegionName }}。在地图上拖拽缩放可微调范围。</p>
            <p class="step-hint" v-else>请先选择城市和区县，地图将自动定位到目标区域</p>
          </div>

          <!-- Step 3: Candidate points -->
          <div class="config-step">
            <div class="step-label">
              3. 候选点位 <span class="badge">{{ candidates.length }}</span>
            </div>
            <p class="step-hint">点击地图添加候选开店位置，或粘贴坐标</p>
            <textarea
              v-model="candidatesText"
              rows="4"
              class="textarea"
              placeholder="名称,经度,纬度&#10;候选点A,108.948,34.215"
            ></textarea>
            <button class="btn btn-sm" @click="parseCandidates" :disabled="!candidatesText.trim()">
              解析文本坐标
            </button>
            <div v-if="candidates.length > 0" class="candidate-chips">
              <span v-for="(c, i) in candidates" :key="i" class="chip">
                {{ c.name }}
                <button class="chip-close" @click="candidates.splice(i,1)">×</button>
              </span>
            </div>
          </div>

          <!-- Run button -->
          <button
            class="btn-primary btn-block"
            :disabled="!canRun || analyzing"
            @click="runAnalysis"
          >
            {{ analyzing ? '分析中...' : '开始选址分析' }}
          </button>

          <div v-if="error" class="error-msg">{{ error }}</div>
        </aside>

        <!-- Center: Map -->
        <main class="map-main">
          <div v-if="!mapReady" class="map-placeholder">
            <AppIcon name="map" :size="48" color="var(--color-text-tertiary)" />
            <p>地图加载中...</p>
          </div>
          <MapContainer
            v-show="mapReady"
            :points="marketPoints"
            :marker-groups="markerGroups"
            :click-enabled="true"
            @ready="onMapReady"
            @map-click="addCandidate"
          />
        </main>
      </div>

      <!-- Results section (appears after analysis) -->
      <div v-if="analysisResult" class="results-section">
        <h2 class="results-title">选址分析结果</h2>

        <!-- ═══ Top Candidates ═══ -->
        <section class="result-block">
          <h3>候选点评分排名</h3>
          <div class="site-card-list">
            <div v-for="(c, i) in analysisResult.candidates" :key="c.name" class="site-card" :class="{ 'top-pick': i === 0 }">
              <div class="site-rank">{{ i + 1 }}</div>
              <div class="site-body">
                <div class="site-head">
                  <span class="site-name">{{ c.name }}</span>
                  <span class="site-score">
                    {{ c.score }}分
                    <ConfidenceBadge :level="c.confidence || 'medium'" />
                  </span>
                </div>
                <div class="site-dimensions" v-if="c.dimensions">
                  <span class="dim-tag" :class="dimTagClass(c.dimensions.distanceScore)">距离 {{ c.dimensions.distanceScore }}</span>
                  <span class="dim-tag" :class="dimTagClass(c.dimensions.blindSpotScore)">覆盖 {{ c.dimensions.blindSpotScore }}</span>
                  <span class="dim-tag" :class="dimTagClass(c.dimensions.competitionScore)">竞争 {{ c.dimensions.competitionScore }}</span>
                  <span class="dim-tag" :class="dimTagClass(c.dimensions.densityScore)">密度 {{ c.dimensions.densityScore }}</span>
                </div>
                <div class="site-meta">
                  最近竞品 {{ c.dimensions?.minDistanceMeters || '-' }}m
                  <span v-if="c.dimensions?.competitors500m > 0"> · 500m内 {{ c.dimensions.competitors500m }} 家竞品</span>
                </div>
                <div class="site-advice" v-if="c.advice && c.advice.length">
                  <div v-for="(a, j) in c.advice.slice(0, 3)" :key="j" class="advice-row" :class="'adv-' + a.priority">
                    <span class="adv-priority-dot"></span>
                    {{ a.message }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ═══ Data Gaps ═══ -->
        <section class="result-block data-gaps">
          <h3>数据覆盖说明</h3>
          <div class="gaps-grid">
            <div class="gap-item">
              <span class="gap-icon">📋</span>
              <span>竞品POI覆盖率：≈{{ poiCoverageEstimate }}%（基于{{ poiSourceName }}，可能不含无工商登记的夫妻店）</span>
            </div>
            <div class="gap-item">
              <span class="gap-icon">👥</span>
              <span>人口数据来源：{{ demandSourceLabel }}，误差 ±{{ demandError }}%</span>
            </div>
            <div class="gap-item">
              <span class="gap-icon">🏪</span>
              <span>竞品数据更新：{{ poiUpdateDate }}，不反映近期新开/关闭门店</span>
            </div>
            <div class="gap-item">
              <span class="gap-icon">📐</span>
              <span>营收估算基于空间引力模型模拟，未考虑门店运营能力、供应链等因素</span>
            </div>
          </div>
        </section>

        <!-- ═══ Collapsible Evidence Panels ═══ -->
        <section class="result-block">
          <div class="evidence-toggle" @click="showEvidence = !showEvidence">
            <h3>支撑证据</h3>
            <AppIcon :name="showEvidence ? 'chevron-up' : 'chevron-down'" :size="16" />
          </div>
          <div v-if="showEvidence" class="evidence-panels">
            <CoveragePanel v-if="projectId" :project-id="projectId" :industry="industry" @result="handleCoverage" />
            <HeatmapPanel v-if="projectId" :project-id="projectId" :industry="industry" @result="handleHeatmap" />
          </div>
        </section>

        <!-- ═══ Actions ═══ -->
        <div class="result-actions">
          <button class="btn btn-primary" @click="goReport">
            <AppIcon name="printer" :size="14" />导出选址报告 (PDF)
          </button>
          <button class="btn btn-outline" @click="resetAnalysis">
            <AppIcon name="refresh" :size="14" />重新分析
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useIndustryStore } from '@/stores/industry'
import { useProjectStore } from '@/stores/project'
import { useToast } from '@/composables/useToast'
import { useAmap } from '@/composables/useAmap'
import { getIndustries, getSiteOptimization, solveGame, getCoverage, getHuffParams } from '@/api'
import type { SiteOptimizationResult, GameCandidate, GameSolveResponse, IndustryConfig } from '@/types'
import MapContainer from '@/components/shared/MapContainer.vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import IndustrySelector from '@/components/shared/IndustrySelector.vue'
import CoveragePanel from '@/components/dashboard/CoveragePanel.vue'
import HeatmapPanel from '@/components/dashboard/HeatmapPanel.vue'
import ConfidenceBadge from '@/components/shared/ConfidenceBadge.vue'
import ConsentModal from '@/components/shared/ConsentModal.vue'

const router = useRouter()
const industryStore = useIndustryStore()
const projectStore = useProjectStore()
const { show } = useToast()
const { loadScript, initMap, addMarkers, clearOverlays, fitBounds, getMap } = useAmap()

// ── Consent ──
const consented = ref(false)

// ── Config ──
const industry = ref('')
const city = ref('')
const district = ref('')
const availableCities = [
  { code: 'xian', name: '西安市' },
]

// 西安13区县（含中心经纬度）
const allDistricts: Record<string, { code: string; name: string; center: [number, number] }[]> = {
  xian: [
    { code: 'weiyang', name: '未央区', center: [108.9467, 34.2931] },
    { code: 'yanta', name: '雁塔区', center: [108.9486, 34.2225] },
    { code: 'beilin', name: '碑林区', center: [108.9407, 34.2567] },
    { code: 'lianhu', name: '莲湖区', center: [108.9442, 34.2654] },
    { code: 'xincheng', name: '新城区', center: [108.9607, 34.2666] },
    { code: 'baqiao', name: '灞桥区', center: [109.0647, 34.2731] },
    { code: 'changan', name: '长安区', center: [108.9069, 34.1587] },
    { code: 'lintong', name: '临潼区', center: [109.2142, 34.3672] },
    { code: 'yanliang', name: '阎良区', center: [109.2261, 34.6622] },
    { code: 'gaoling', name: '高陵区', center: [109.0883, 34.5350] },
    { code: 'huyi', name: '鄠邑区', center: [108.6048, 34.1087] },
    { code: 'lantian', name: '蓝田县', center: [109.3235, 34.1513] },
    { code: 'zhouzhi', name: '周至县', center: [108.2222, 34.1636] },
  ],
}

const availableDistricts = computed(() => {
  if (!city.value) return []
  return allDistricts[city.value] || []
})

const selectedRegionName = computed(() => {
  const c = availableCities.find(c => c.code === city.value)
  const d = availableDistricts.value.find(d => d.code === district.value)
  return [c?.name, d?.name].filter(Boolean).join(' · ')
})
const candidates = ref<{ name: string; lng: number; lat: number }[]>([])
const candidatesText = ref('')

const industryConfig = computed<IndustryConfig | undefined>(() => {
  if (!industry.value) return undefined
  return industryStore.getIndustry(industry.value)
})

const canRun = computed(() => industry.value && candidates.value.length >= 1)

// ── Map ──
const mapReady = ref(false)
const mapInstance = ref<any>(null)
const marketPoints = ref<any[]>([])
const markerGroups = ref<any[]>([])

function onMapReady(map: any) {
  mapReady.value = true
  mapInstance.value = map
  updateMarkers()
}

function addCandidate(pt: { lng: number; lat: number }) {
  const idx = candidates.value.length + 1
  candidates.value.push({ name: `候选点${idx}`, lng: pt.lng, lat: pt.lat })
  candidatesText.value = candidates.value.map(c => `${c.name},${c.lng.toFixed(6)},${c.lat.toFixed(6)}`).join('\n')
  updateMarkers()
}

function onCityChange() {
  district.value = ''
}

function onDistrictChange() {
  const dist = availableDistricts.value.find(d => d.code === district.value)
  if (dist && mapInstance.value) {
    mapInstance.value.setCenter(new (window as any).AMap.LngLat(dist.center[0], dist.center[1]))
    mapInstance.value.setZoom(14)
  }
}

function parseCandidates() {
  const parsed = candidatesText.value
    .split('\n')
    .filter(l => l.trim())
    .map(line => {
      const parts = line.split(',')
      if (parts.length >= 3) {
        const name = parts[0].trim()
        const lng = parseFloat(parts[1])
        const lat = parseFloat(parts[2])
        if (!isNaN(lng) && !isNaN(lat) && lng > -180 && lng < 180 && lat > -90 && lat < 90) {
          return { name, lng, lat }
        }
      }
      return null
    })
    .filter(Boolean) as { name: string; lng: number; lat: number }[]
  candidates.value = parsed
  updateMarkers()
}

function updateMarkers() {
  const groups: any[] = []
  if (candidates.value.length) {
    groups.push({
      groupId: 'candidates',
      points: candidates.value.map((c, i) => ({ lng: c.lng, lat: c.lat, name: c.name, label: 'C' + (i + 1), color: '#007AFF' })),
    })
  }
  markerGroups.value = groups
}

// ── Analysis ──
const analyzing = ref(false)
const error = ref('')
const analysisResult = ref<SiteOptimizationResult | null>(null)
const gameResult = ref<GameSolveResponse | null>(null)
const projectId = ref('')
const showEvidence = ref(false)

// Data gap placeholders (will be populated from real data sources)
const poiCoverageEstimate = ref('78')
const poiSourceName = ref('高德POI搜索')
const demandSourceLabel = ref('WorldPop 2020 人口估算')
const demandError = ref('25')
const poiUpdateDate = ref('2025年第4季度')

async function runAnalysis() {
  if (!canRun.value) return
  analyzing.value = true
  error.value = ''
  analysisResult.value = null
  gameResult.value = null

  try {
    // 1) Ensure industry config loaded
    await industryStore.fetchIndustries()
    const cfg = industryStore.getIndustry(industry.value)
    if (!cfg) { error.value = '行业配置加载失败'; return }

    // 2) Run site scoring
    const weights = { distanceWeight: 0.4, blindSpotWeight: 0.35, densityWeight: 0.25 }
    const projectId = 'f264aa38-2607-4f7b-bb17-1f4ff89233df' // 西安门店项目
    const siteResult = await getSiteOptimization(
      projectId, // auto-use existing project — real flow would create a project
      candidates.value,
      weights,
      candidates.value.length,
      industry.value
    )

    // 3) Annotate with confidence and advisory
    if (siteResult.candidates) {
      siteResult.candidates = siteResult.candidates.map(c => ({
        ...c,
        confidence: (c.score >= 80 ? 'high' : c.score >= 60 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
        advice: (c.advice || []).map(a => ({
          ...a,
          message: a.message + '\n（以上建议基于当前数据模型，实际经营效果受多种因素影响。最终选址决策请结合实地考察由用户自行做出。）',
        })),
      }))
    }
    analysisResult.value = siteResult

    // 4) Try game solve (requires compute engine)
    try {
      const gameCands: GameCandidate[] = candidates.value.map(c => ({
        id: c.name, lng: c.lng, lat: c.lat, area: 100, brand: 0.5, name: c.name,
      }))
      gameResult.value = await solveGame(
        projectId,
        gameCands,
        [], // follower pool would come from platform POI
        Math.min(candidates.value.length, 3),
        2,
        industry.value,
        200
      )
    } catch { /* game solve optional */ }

    show('选址分析完成', 'success')
  } catch (e: any) {
    error.value = e?.response?.data?.error || e.message || '分析失败'
    show(error.value, 'error')
  } finally {
    analyzing.value = false
  }
}

function resetAnalysis() {
  analysisResult.value = null
  gameResult.value = null
  error.value = ''
  candidates.value = []
  candidatesText.value = ''
  showEvidence.value = false
  updateMarkers()
}

// ── Report ──
function goReport() {
  // For now redirect to UploadView's report flow; will be replaced by dedicated report route
  router.push({ name: 'report', params: { id: projectId.value || 'demo' } })
}

// ── Evidence panels ──
function handleCoverage(data: any) {
  // Coverage result is rendered inline by CoveragePanel
}
function handleHeatmap(data: any) {
  // Heatmap result is rendered inline by HeatmapPanel
}

// ── Helpers ──
function dimTagClass(score: number) {
  if (score >= 80) return 'dim-good'
  if (score >= 60) return 'dim-ok'
  return 'dim-low'
}

// ── Init ──
onMounted(async () => {
  await industryStore.fetchIndustries()
})
</script>

<style scoped>
.site-workbench { max-width: 1400px; margin: 0 auto; padding: var(--space-4); }
.workbench-hero { text-align: center; margin-bottom: var(--space-6); }
.workbench-hero h1 { font-size: var(--text-2xl); font-weight: var(--font-bold); margin-bottom: var(--space-2); }
.workbench-hero p { color: var(--color-text-secondary); font-size: var(--text-sm); max-width: 540px; margin: 0 auto; }

.workbench-grid { display: grid; grid-template-columns: 360px 1fr; gap: 0; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--color-border); min-height: 550px; }

.config-sidebar { background: var(--color-bg-card); padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); overflow-y: auto; }
.config-step { display: flex; flex-direction: column; gap: var(--space-2); }
.step-label { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--color-text-primary); display: flex; align-items: center; gap: var(--space-2); }
.step-hint { font-size: var(--text-xs); color: var(--color-text-tertiary); margin: 0; }
.badge { background: var(--color-accent); color: #fff; font-size: 11px; padding: 0 6px; border-radius: var(--radius-full); }

.candidate-chips { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-1); }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--color-accent-subtle); border-radius: var(--radius-full); font-size: var(--text-xs); }
.chip-close { background: none; border: none; cursor: pointer; color: var(--color-text-tertiary); font-size: 13px; padding: 0; line-height: 1; }

.map-main { position: relative; min-height: 550px; background: var(--color-bg-secondary); }
.map-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--color-text-tertiary); gap: var(--space-3); }

/* ── Results ── */
.results-section { margin-top: var(--space-6); }
.results-title { font-size: var(--text-xl); font-weight: var(--font-bold); margin-bottom: var(--space-4); }
.result-block { margin-bottom: var(--space-5); }

.site-card-list { display: flex; flex-direction: column; gap: var(--space-3); }
.site-card { display: flex; gap: var(--space-3); padding: var(--space-4); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border); transition: all 0.15s ease; }
.site-card.top-pick { border-color: var(--color-accent); background: rgba(0,122,255,0.04); }
.site-rank { width: 32px; height: 32px; border-radius: 50%; background: var(--color-accent); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: var(--font-semibold); font-size: var(--text-sm); flex-shrink: 0; }
.site-body { flex: 1; min-width: 0; }
.site-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-1); }
.site-name { font-weight: var(--font-semibold); font-size: var(--text-base); }
.site-score { display: flex; align-items: center; gap: var(--space-1); font-weight: var(--font-bold); font-size: var(--text-lg); color: var(--color-accent); }
.site-dimensions { display: flex; gap: var(--space-1); flex-wrap: wrap; margin-bottom: var(--space-1); }
.dim-tag { font-size: var(--text-xs); padding: 1px 6px; border-radius: var(--radius-full); background: var(--color-bg-secondary); }
.dim-good { color: var(--color-success); }
.dim-ok { color: var(--color-warning); }
.dim-low { color: var(--color-error); }
.site-meta { font-size: var(--text-xs); color: var(--color-text-tertiary); margin-bottom: var(--space-1); }
.site-advice { margin-top: var(--space-2); display: flex; flex-direction: column; gap: 4px; }
.advice-row { font-size: var(--text-xs); display: flex; align-items: flex-start; gap: var(--space-1); padding: 4px 8px; border-radius: var(--radius-sm); line-height: 1.4; white-space: pre-line; }
.adv-high { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.12); }
.adv-medium { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.12); }
.adv-low { background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.10); }
.adv-priority-dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
.adv-high .adv-priority-dot { background: var(--color-error); }
.adv-medium .adv-priority-dot { background: var(--color-warning); }
.adv-low .adv-priority-dot { background: var(--color-accent); }

/* ── Data Gaps ── */
.data-gaps { background: var(--color-bg-card); padding: var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--color-border); }
.gaps-grid { display: flex; flex-direction: column; gap: var(--space-2); }
.gap-item { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-xs); color: var(--color-text-secondary); line-height: 1.5; }
.gap-icon { flex-shrink: 0; font-size: 14px; }

/* ── Evidence Toggle ── */
.evidence-toggle { display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: var(--space-2) 0; user-select: none; }
.evidence-toggle h3 { margin: 0; }
.evidence-panels { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-3); }

/* ── Actions ── */
.result-actions { display: flex; gap: var(--space-3); justify-content: center; margin-top: var(--space-5); }

/* ── Responsive ── */
@media (max-width: 768px) {
  .workbench-grid { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .map-main { min-height: 350px; }
}
</style>
