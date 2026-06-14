<template>
  <div class="panel">
    <h4 class="panel-title">选址优化</h4>

    <!-- Mode tabs -->
    <div class="segmented-control">
      <button class="seg-btn" :class="{ active: mode === 'scorecard' }" @click="switchMode('scorecard')">打分评估</button>
      <button class="seg-btn" :class="{ active: mode === 'game' }" @click="switchMode('game')">博弈求解</button>
      <button class="seg-btn" :class="{ active: mode === 'compare' }" @click="switchMode('compare')">A/B 对比</button>
    </div>

    <div class="panel-divider"></div>

    <!-- Industry -->
    <div class="field">
      <label class="field-label">行业模型</label>
      <IndustrySelector v-model="industry" @change="onIndustryChange" :show-label="false" />
    </div>

    <!-- ═══ SCORECARD ═══ -->
    <template v-if="mode === 'scorecard'">
      <div class="field">
        <div class="field-row">
          <label class="field-label">距离权重</label>
          <span class="field-hint">{{ weights.distanceWeight.toFixed(2) }}</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" v-model.number="weights.distanceWeight" class="slider" />
      </div>
      <div class="field">
        <div class="field-row">
          <label class="field-label">覆盖权重</label>
          <span class="field-hint">{{ weights.blindSpotWeight.toFixed(2) }}</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" v-model.number="weights.blindSpotWeight" class="slider" />
      </div>
      <div class="field">
        <div class="field-row">
          <label class="field-label">密度权重</label>
          <span class="field-hint">{{ weights.densityWeight.toFixed(2) }}</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" v-model.number="weights.densityWeight" class="slider" />
      </div>

      <div class="field">
        <label class="field-label">候选位置</label>
        <p class="field-caption">在地图上点击添加候选点，或在下方编辑。格式：名称,经度,纬度</p>
        <textarea v-model="candidatesText" rows="5" class="textarea" placeholder="A,116.397428,39.909204
B,116.420000,39.915000"></textarea>
      </div>

      <button class="btn-primary" @click="runScorecard" :disabled="!candidatesText.trim()">评估选址</button>

      <!-- Results -->
      <div v-if="result" class="card-list">
        <div v-for="(c, i) in result.candidates" :key="c.name" class="card" :class="{ 'card-top': i === 0 }">
          <div class="card-rank">{{ i + 1 }}</div>
          <div class="card-body">
            <div class="card-head">
              <span class="card-title">{{ c.name }}</span>
              <span class="card-badge">{{ c.score }}分</span>
            </div>
            <div class="card-meta" v-if="c.dimensions">
              <span class="tag" :class="scoreTagClass(c.dimensions.distanceScore)">距离 {{ c.dimensions.distanceScore }}</span>
              <span class="tag" :class="scoreTagClass(c.dimensions.blindSpotScore)">覆盖 {{ c.dimensions.blindSpotScore }}</span>
              <span class="tag" :class="scoreTagClass(c.dimensions.competitionScore)">竞争 {{ c.dimensions.competitionScore }}</span>
              <span class="tag" :class="scoreTagClass(c.dimensions.densityScore)">密度 {{ c.dimensions.densityScore }}</span>
            </div>
            <div class="card-detail">最近 {{ c.dimensions.minDistanceMeters }}m<span v-if="c.dimensions.competitors500m>0"> · {{ c.dimensions.competitors500m }}竞争者(500m)</span></div>
            <div class="card-advice" v-if="c.advice&&c.advice.length">
              <span v-for="a in c.advice.slice(0,2)" :key="a.message" class="advice" :class="'adv-'+a.priority">{{ a.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══ GAME ═══ -->
    <template v-if="mode === 'game'">
      <div class="panel-divider"></div>

      <!-- Role switch -->
      <div class="field">
        <label class="field-label">添加角色</label>
        <div class="segmented-control sm">
          <button class="seg-btn sm" :class="{ active: addingFor === 'leader' }" @click="addingFor = 'leader'">
            <span class="dot" style="background:#007AFF"></span> 我方
          </button>
          <button class="seg-btn sm" :class="{ active: addingFor === 'follower' }" @click="addingFor = 'follower'">
            <span class="dot" style="background:#FF3B30"></span> 竞品
          </button>
        </div>
      </div>

      <!-- Pool filter -->
      <div class="field" v-if="importedPoints.length > 0">
        <label class="field-label">竞品候选池</label>
        <p class="field-caption">点击地图灰色点切换选中/取消竞品候选</p>
        <select v-model="competitorFilter" class="select">
          <option value="">全部行业 ({{ importedPoints.length }})</option>
          <option v-for="ind in uniqueIndustries" :key="ind" :value="ind">{{ industryLabel(ind) }} ({{ industryCount(ind) }})</option>
        </select>
      </div>

      <!-- Stats bar -->
      <div class="stats-bar">
        <div class="stat"><span class="stat-dot" style="background:#007AFF"></span>我方 {{ gameLeaderCandidates.length }}</div>
        <div class="stat"><span class="stat-dot" style="background:#FF3B30"></span>竞品 {{ gameFollowerCandidates.length }}</div>
        <div class="stat"><span class="stat-dot" style="background:#999"></span>待选 {{ filteredPoolPoints.length }}</div>
      </div>

      <!-- Leader candidate list -->
      <div class="field" v-if="gameLeaderCandidates.length > 0">
        <label class="field-label">我方候选点</label>
        <div class="point-list">
          <div v-for="(c, i) in gameLeaderCandidates" :key="c.id" class="point-row leader-row">
            <span class="point-idx">{{ i + 1 }}</span>
            <input v-model="c.name" class="point-input" placeholder="点位名称" />
            <input v-model.number="c.lng" class="point-input coord" placeholder="经度" step="any" type="number" />
            <input v-model.number="c.lat" class="point-input coord" placeholder="纬度" step="any" type="number" />
            <input v-model.number="c.area" class="point-input coord sm" placeholder="面积" step="any" type="number" />
            <input v-model.number="c.brand" class="point-input coord sm" placeholder="品牌分" step="any" type="number" min="0" max="1" />
            <button class="point-del" @click="removeLeader(i)" title="删除">×</button>
          </div>
        </div>
      </div>

      <!-- Follower candidate list -->
      <div class="field" v-if="gameFollowerCandidates.length > 0">
        <label class="field-label">竞品候选点</label>
        <div class="point-list">
          <div v-for="(c, i) in gameFollowerCandidates" :key="c.id" class="point-row follower-row">
            <span class="point-idx">{{ i + 1 }}</span>
            <span class="point-name">{{ c.name || c.id }}</span>
            <span class="point-coord">{{ c.lng.toFixed(4) }}, {{ c.lat.toFixed(4) }}</span>
            <span class="point-meta" v-if="c.area !== 100 || c.brand !== 0.5">品牌分 {{ c.brand?.toFixed(1) }} 面积 {{ c.area?.toFixed(0) }}㎡</span>
            <button class="point-del" @click="removeFollower(i)" title="移除">×</button>
          </div>
        </div>
      </div>

      <!-- Game params -->
      <div class="inline-row">
        <div class="inline-col">
          <span class="inline-label">我方开店数</span>
          <input type="number" v-model.number="gameLeaderP" min="1" max="20" class="inline-input" />
        </div>
        <div class="inline-col">
          <span class="inline-label">竞品开店数</span>
          <input type="number" v-model.number="gameFollowerQ" min="0" max="20" class="inline-input" />
        </div>
      </div>

      <!-- Huff -->
      <div class="huff-card" v-if="huffParams">
        <div class="huff-head">
          <span class="huff-label">Huff 模型参数</span>
          <span class="huff-badge" :class="huffParams.source">{{ huffSourceLabel }}</span>
        </div>
        <div class="huff-grid">
          <div class="huff-item"><span class="huff-key">λ</span><span class="huff-val">{{ huffParams.lambda.toFixed(2) }}</span></div>
          <div class="huff-item"><span class="huff-key">α_area</span><span class="huff-val">{{ huffParams.alpha_area.toFixed(2) }}</span></div>
          <div class="huff-item"><span class="huff-key">α_brand</span><span class="huff-val">{{ huffParams.alpha_brand.toFixed(2) }}</span></div>
          <div class="huff-item" v-if="huffParams.r_squared != null"><span class="huff-key">R²</span><span class="huff-val">{{ huffParams.r_squared.toFixed(2) }}</span></div>
        </div>
        <div class="huff-footer">
          <button class="btn-text" @click="loadHuffParams" :disabled="huffLoading">刷新参数</button>
        </div>
      </div>

      <button class="btn-primary" @click="runGameSolve" :disabled="gameLoading || !gameLeaderCandidates.length">
        {{ gameLoading ? '推演中...' : '开始推演' }}
      </button>

      <!-- Game result -->
      <div v-if="gameResult && !gameResult.fallback" class="card-list">
        <div class="card">
          <div class="card-body">
            <div class="result-split">
              <div class="result-side">
                <span class="result-tag" style="background:var(--color-accent)">我方选址</span>
                <div class="result-site-list">
                  <div v-for="s in resolvedLeaderSites" :key="s.id" class="result-site-item">
                    <span class="site-name-tag">{{ s.name }}</span>
                    <span class="site-coord-tag">{{ s.lng.toFixed(4) }}, {{ s.lat.toFixed(4) }}</span>
                  </div>
                  <span v-if="!resolvedLeaderSites.length" class="result-sites">—</span>
                </div>
              </div>
              <div class="result-side">
                <span class="result-tag" style="background:var(--color-error)">竞品攻击</span>
                <div class="result-site-list">
                  <div v-for="s in resolvedFollowerSites" :key="s.id" class="result-site-item">
                    <span class="site-name-tag follower-name">{{ s.name }}</span>
                    <span class="site-coord-tag">{{ s.lng.toFixed(4) }}, {{ s.lat.toFixed(4) }}</span>
                  </div>
                  <span v-if="!resolvedFollowerSites.length" class="result-sites">—</span>
                </div>
              </div>
            </div>
            <div class="result-metrics">
              <div class="metric"><span class="metric-val">{{ formatRevenue(gameResult.leader_revenue) }}</span><span class="metric-lbl">预期营收</span></div>
              <div class="metric"><span class="metric-val" :class="gameResult.cannibalization_pct>20?'metric-bad':'metric-good'">{{ gameResult.cannibalization_pct }}%</span><span class="metric-lbl">蚕食率</span></div>
              <div class="metric"><span class="metric-val">{{ (gameResult.market_share?.leader*100).toFixed(0) }}%</span><span class="metric-lbl">市占率</span></div>
            </div>
          </div>
        </div>
        <div v-if="gameResult.robust" class="card card-robust">
          <div class="card-body">
            <div class="robust-row">
              <span>方案稳定性</span>
              <div class="robust-bar"><div class="robust-fill" :style="{width:(gameResult.robust.stability_score*100)+'%'}"></div></div>
              <span class="robust-pct">{{ (gameResult.robust.stability_score*100).toFixed(0) }}%</span>
            </div>
            <div v-if="gameResult.robust.sensitivity_warning" class="sensitivity">⚠ {{ gameResult.robust.sensitivity_warning }}</div>
          </div>
        </div>
      </div>
      <div v-if="gameResult?.fallback" class="notice">⚠ 计算引擎未启动，显示静态分析</div>
    </template>

    <!-- ═══ COMPARE ═══ -->
    <template v-if="mode === 'compare'">
      <div class="panel-divider"></div>

      <!-- Plan switch -->
      <div class="field">
        <label class="field-label">编辑方案</label>
        <div class="segmented-control sm">
          <button class="seg-btn sm" :class="{ active: compareEdit === 'A' }" @click="compareEdit = 'A'">
            <span class="dot" style="background:#34C759"></span> 方案 A
          </button>
          <button class="seg-btn sm" :class="{ active: compareEdit === 'B' }" @click="compareEdit = 'B'">
            <span class="dot" style="background:#FF9500"></span> 方案 B
          </button>
        </div>
      </div>

      <p class="field-caption">在地图上点击添加方案候选点</p>

      <!-- Stats -->
      <div class="stats-bar">
        <div class="stat"><span class="stat-dot" style="background:#34C759"></span>方案 A {{ planACandidates.length }}</div>
        <div class="stat"><span class="stat-dot" style="background:#FF9500"></span>方案 B {{ planBCandidates.length }}</div>
      </div>

      <!-- Plan A points -->
      <div class="field" v-if="planACandidates.length > 0">
        <label class="field-label" style="color:#34C759">方案 A 候选点</label>
        <div class="point-list">
          <div v-for="(c, i) in planACandidates" :key="c.id" class="point-row plan-a-row">
            <span class="point-idx plan-a-idx">{{ i + 1 }}</span>
            <input v-model="c.name" class="point-input" placeholder="点位名称" />
            <input v-model.number="c.lng" class="point-input coord" placeholder="经度" step="any" type="number" />
            <input v-model.number="c.lat" class="point-input coord" placeholder="纬度" step="any" type="number" />
            <input v-model.number="c.area" class="point-input coord sm" placeholder="面积" step="any" type="number" />
            <input v-model.number="c.brand" class="point-input coord sm" placeholder="品牌分" step="any" type="number" min="0" max="1" />
            <button class="point-del" @click="removePlanA(i)" title="删除">×</button>
          </div>
        </div>
      </div>

      <!-- Plan B points -->
      <div class="field" v-if="planBCandidates.length > 0">
        <label class="field-label" style="color:#FF9500">方案 B 候选点</label>
        <div class="point-list">
          <div v-for="(c, i) in planBCandidates" :key="c.id" class="point-row plan-b-row">
            <span class="point-idx plan-b-idx">{{ i + 1 }}</span>
            <input v-model="c.name" class="point-input" placeholder="点位名称" />
            <input v-model.number="c.lng" class="point-input coord" placeholder="经度" step="any" type="number" />
            <input v-model.number="c.lat" class="point-input coord" placeholder="纬度" step="any" type="number" />
            <input v-model.number="c.area" class="point-input coord sm" placeholder="面积" step="any" type="number" />
            <input v-model.number="c.brand" class="point-input coord sm" placeholder="品牌分" step="any" type="number" min="0" max="1" />
            <button class="point-del" @click="removePlanB(i)" title="删除">×</button>
          </div>
        </div>
      </div>

      <!-- Compare params -->
      <div class="inline-row">
        <div class="inline-col">
          <span class="inline-label">竞品开店数</span>
          <input type="number" v-model.number="gameFollowerQ" min="0" max="20" class="inline-input" />
        </div>
        <div class="inline-col">
          <span class="inline-label">竞品候选</span>
          <input type="text" readonly :value="gameFollowerCandidates.length + ' 个'" class="inline-input muted" />
        </div>
      </div>

      <button class="btn-primary" @click="runCompare" :disabled="compareLoading || planACandidates.length<1 || planBCandidates.length<1">
        {{ compareLoading ? '对比中...' : '开始对比' }}
      </button>

      <!-- Compare result -->
      <div v-if="compareResult && !compareResult.fallback" class="card-list">
        <div class="card">
          <div class="card-body">
            <div class="compare-table">
              <div class="cmp-head"><span>指标</span><span>方案 A</span><span>方案 B</span><span>差异</span></div>
              <div class="cmp-row"><span>预期月营收</span><span>{{ formatRevenue(compareResult.plan_a?.leader_revenue) }}</span><span>{{ formatRevenue(compareResult.plan_b?.leader_revenue) }}</span><span :class="diffClass(compareResult.plan_a?.leader_revenue,compareResult.plan_b?.leader_revenue)">{{ revenueDiff() }}</span></div>
              <div class="cmp-row"><span>蚕食率</span><span>{{ compareResult.plan_a?.cannibalization_pct }}%</span><span>{{ compareResult.plan_b?.cannibalization_pct }}%</span><span :class="diffClass(compareResult.plan_b?.cannibalization_pct,compareResult.plan_a?.cannibalization_pct)">{{ cannDiff() }}</span></div>
              <div class="cmp-row"><span>覆盖人口</span><span>{{ formatPop(compareResult.plan_a?.coverage_population) }}</span><span>{{ formatPop(compareResult.plan_b?.coverage_population) }}</span><span :class="diffClass(compareResult.plan_a?.coverage_population,compareResult.plan_b?.coverage_population)">{{ popDiff() }}</span></div>
            </div>
            <div v-if="compareResult.recommendation" class="rec">
              <div class="rec-badge" :class="compareResult.recommendation.winner==='plan_a'?'rec-a':'rec-b'">
                ✓ 推荐 {{ compareResult.recommendation.winner === 'plan_a' ? '方案 A' : '方案 B' }}
              </div>
              <p class="rec-reason">{{ compareResult.recommendation.reason }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Legend -->
    <div class="legend" v-if="mode !== 'scorecard'">
      <span class="leg-item"><span class="leg-dot" style="background:#007AFF"></span>我方</span>
      <span class="leg-item"><span class="leg-dot" style="background:#FF3B30"></span>竞品</span>
      <span v-if="mode==='game'" class="leg-item"><span class="leg-dot" style="background:#999"></span>待选</span>
      <span v-if="mode==='compare'" class="leg-item"><span class="leg-dot" style="background:#34C759"></span>A</span>
      <span v-if="mode==='compare'" class="leg-item"><span class="leg-dot" style="background:#FF9500"></span>B</span>
    </div>

    <TaskProgress v-if="task" :task="task" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted, nextTick } from 'vue'
import { getSiteOptimization, solveGame, compareGamePlans, getHuffParams } from '@/api'
import IndustrySelector from '@/components/shared/IndustrySelector.vue'
import { useIndustryStore } from '@/stores/industry'
import { useProjectStore } from '@/stores/project'
import TaskProgress from '@/components/shared/TaskProgress.vue'
import type { SiteOptimizationResult, TaskInfo, GameSolveResponse, GameCompareResponse, HuffParams, GameCandidate } from '@/types'

interface CandidatePoint extends GameCandidate {
  name?: string
}

const props = defineProps<{ projectId: string; clickedCandidate?: { lng: number; lat: number } | null }>()
const emit = defineEmits<{
  result: [data: any]
  markersUpdate: [groups: { groupId: string; points: { lng: number; lat: number; name?: string; label?: string; color?: string }[] }[]]
}>()

const industryStore = useIndustryStore()
const projectStore = useProjectStore()
industryStore.fetchIndustries()

// ── Core ──
const mode = ref<'scorecard' | 'game' | 'compare'>('game')
const industry = ref('')
const task = ref<TaskInfo | null>(null)

// ── Scorecard ──
const weights = reactive({ distanceWeight: 0.4, blindSpotWeight: 0.35, densityWeight: 0.25 })
const candidatesText = ref('')
const result = ref<SiteOptimizationResult | null>(null)

// ── Game ──
const addingFor = ref<'leader' | 'follower'>('leader')
const gameLeaderCandidates = ref<CandidatePoint[]>([])
const gameFollowerCandidates = ref<CandidatePoint[]>([])
const competitorFilter = ref('')
const gameLeaderP = ref(2)
const gameFollowerQ = ref(2)
const gameResult = ref<GameSolveResponse | null>(null)
const gameLoading = ref(false)
const huffParams = ref<HuffParams | null>(null)
const huffLoading = ref(false)

// ── Compare ──
const compareEdit = ref<'A' | 'B'>('A')
const planACandidates = ref<CandidatePoint[]>([])
const planBCandidates = ref<CandidatePoint[]>([])
const compareResult = ref<GameCompareResponse | null>(null)
const compareLoading = ref(false)

// ── Imported data ──
const importedPoints = computed(() => projectStore.validPoints)
const uniqueIndustries = computed(() => {
  const s = new Set<string>()
  for (const p of importedPoints.value) { const ind = p.metadata?.industry as string; if (ind) s.add(ind) }
  return Array.from(s).sort()
})
function industryCount(ind: string): number { return importedPoints.value.filter(p => p.metadata?.industry === ind).length }
function industryLabel(industryCode: string): string {
  const cfg = industryStore.getIndustry(industryCode)
  return cfg?.displayName || industryCode
}

const filteredPoolPoints = computed(() => {
  const fIds = new Set(gameFollowerCandidates.value.map(c => c.id))
  return importedPoints.value.filter(p => {
    if (fIds.has(p.id)) return false
    if (competitorFilter.value && p.metadata?.industry !== competitorFilter.value) return false
    return true
  })
})

// ── Mode switch ──
function switchMode(m: string) { mode.value = m as any; task.value = null; emitMarkers() }

// ── Candidate removal ──
function removeLeader(i: number) { gameLeaderCandidates.value.splice(i, 1); emitMarkers() }
function removeFollower(i: number) { gameFollowerCandidates.value.splice(i, 1); emitMarkers() }
function removePlanA(i: number) { planACandidates.value.splice(i, 1); emitMarkers() }
function removePlanB(i: number) { planBCandidates.value.splice(i, 1); emitMarkers() }

// ── Map click ──
watch(() => props.clickedCandidate, (pt) => {
  if (!pt) return
  if (mode.value === 'scorecard') {
    const idx = candidatesText.value.split('\n').filter(l => l.trim()).length + 1
    const line = `P${idx},${pt.lng.toFixed(6)},${pt.lat.toFixed(6)}`
    candidatesText.value = candidatesText.value.trim() ? candidatesText.value + '\n' + line : line
  } else if (mode.value === 'game') {
    if (addingFor.value === 'leader') {
      const id = `L${Date.now()}`
      gameLeaderCandidates.value.push({ id, lng: pt.lng, lat: pt.lat, area: 100, brand: 0.5, name: `我方候选 ${gameLeaderCandidates.value.length + 1}` })
    } else {
      handleFollowerClick(pt)
    }
  } else if (mode.value === 'compare') {
    const prefix = compareEdit.value === 'A' ? 'A' : 'B'
    const arr = compareEdit.value === 'A' ? planACandidates : planBCandidates
    const id = `${prefix}${Date.now()}`
    arr.value.push({ id, lng: pt.lng, lat: pt.lat, area: 100, brand: 0.5, name: `方案${prefix}候选 ${arr.value.length + 1}` })
  }
  emitMarkers()
})

function handleFollowerClick(pt: { lng: number; lat: number }) {
  const TOL = 200; let best: CandidatePoint | null = null; let minD = Infinity
  for (const p of filteredPoolPoints.value) {
    const d = haversineM(pt.lat, pt.lng, p.lat, p.lng)
    if (d < TOL && d < minD) { minD = d; best = { id: p.id, lng: p.lng, lat: p.lat, area: parseFloat(p.metadata?.floor_area) || 100, brand: parseFloat(p.metadata?.brand_score) || 0.5, name: p.name || p.id } }
  }
  if (best) {
    const idx = gameFollowerCandidates.value.findIndex(c => c.id === best!.id)
    if (idx >= 0) gameFollowerCandidates.value.splice(idx, 1)
    else gameFollowerCandidates.value.push(best)
  } else {
    // No pool point nearby -- show feedback
    task.value = { taskId: '', status: 'failed', error: `未找到附近候选点 (最近距离: ${minD.toFixed(0)}m). 请点击地图上的灰色待选点. 当前候选池: ${filteredPoolPoints.value.length}个` }
    setTimeout(() => { if (task.value?.status === 'failed') task.value = null }, 3000)
  }
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; const dLat = (lat2 - lat1) * Math.PI / 180; const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── Marker emission ──
function emitMarkers() {
  const groups: { groupId: string; points: { lng: number; lat: number; name?: string; label?: string; color?: string }[] }[] = []

  if (mode.value === 'game' || mode.value === 'compare') {
    groups.push({ groupId: 'pool', points: filteredPoolPoints.value.map(p => ({ lng: p.lng, lat: p.lat, name: p.name||p.id, color: '#999999' })) })
  }
  if (gameLeaderCandidates.value.length) {
    groups.push({ groupId: 'leader', points: gameLeaderCandidates.value.map((c,i) => ({ lng: c.lng, lat: c.lat, name: c.name||c.id, label: 'L'+(i+1), color: '#007AFF' })) })
  }
  if (gameFollowerCandidates.value.length) {
    groups.push({ groupId: 'follower', points: gameFollowerCandidates.value.map((c,i) => ({ lng: c.lng, lat: c.lat, name: c.name||c.id, label: 'F'+(i+1), color: '#FF3B30' })) })
  }
  if (mode.value === 'scorecard' && candidatesText.value.trim()) {
    const cs = parseCandidatesText()
    groups.push({ groupId: 'scorecard', points: cs.map((c,i) => ({ lng: c.lng, lat: c.lat, name: c.name, label: ''+(i+1), color: '#007AFF' })) })
  }
  if (planACandidates.value.length) {
    groups.push({ groupId: 'planA', points: planACandidates.value.map((c,i) => ({ lng: c.lng, lat: c.lat, name: c.name||c.id, label: 'A'+(i+1), color: '#34C759' })) })
  }
  if (planBCandidates.value.length) {
    groups.push({ groupId: 'planB', points: planBCandidates.value.map((c,i) => ({ lng: c.lng, lat: c.lat, name: c.name||c.id, label: 'B'+(i+1), color: '#FF9500' })) })
  }

  emit('markersUpdate', groups)
}

watch([gameLeaderCandidates, gameFollowerCandidates, filteredPoolPoints, planACandidates, planBCandidates, candidatesText, mode], () => emitMarkers(), { deep: true, immediate: true })

// ── Scorecard ──
function parseCandidatesText(): { name: string; lng: number; lat: number }[] {
  return candidatesText.value.split('\n').filter(l => l.trim()).map((line,i) => {
    const p = line.split(',').map(x => x.trim())
    return { name: p[0]||('P'+(i+1)), lng: parseFloat(p[1]), lat: parseFloat(p[2]) }
  }).filter(c => !isNaN(c.lng) && !isNaN(c.lat))
}

const resolvedLeaderSites = computed(() => {
  return (gameResult.value?.leader_sites || []).map(id => {
    const found = gameLeaderCandidates.value.find(c => c.id === id)
    return found || { id, lng: 0, lat: 0, name: id }
  }).filter(s => s.lng !== 0 || s.name !== s.id)
})

const resolvedFollowerSites = computed(() => {
  return (gameResult.value?.follower_sites || []).map(id => {
    const found = gameFollowerCandidates.value.find(c => c.id === id)
    return found || { id, lng: 0, lat: 0, name: id }
  })
})

function scoreTagClass(s: number) { if (s >= 3) return 'tag-high'; if (s >= 2) return 'tag-mid'; return 'tag-low' }

async function runScorecard() {
  const cs = parseCandidatesText()
  if (!cs.length) { task.value = { taskId: '', status: 'failed', error: '请至少输入一个有效候选位置' }; return }
  task.value = { taskId: '', status: 'running' }
  try {
    const data = await getSiteOptimization(props.projectId, cs, { ...weights }, 5, industry.value)
    result.value = data; task.value = { taskId: '', status: 'completed', result: data }; emit('result', data)
  } catch (e: any) { task.value = { taskId: '', status: 'failed', error: e?.response?.data?.error || e.message } }
}

// ── Huff ──
const huffSourceLabel = computed(() => {
  const s = huffParams.value?.source; if (s==='mle') return 'MLE拟合'; if (s==='cached_mle') return '拟合(缓存)'; if (s==='benchmark') return '行业基准'; return '默认'
})

async function loadHuffParams() { huffLoading.value = true; try { huffParams.value = await getHuffParams(props.projectId, industry.value||undefined) } catch {} finally { huffLoading.value = false } }
onMounted(() => {
  loadHuffParams()
  // Emit pool markers on tab activation
  nextTick(() => emitMarkers())
})

function onIndustryChange() {
  if (!industry.value) return
  const cfg = industryStore.getIndustry(industry.value)
  if (cfg?.kpiWeights) {
    const kw = cfg.kpiWeights as Record<string,number>
    weights.distanceWeight = kw.walkableRatio||kw.footTraffic||kw.populationDensity||0.4
    weights.blindSpotWeight = kw.competitorAvoidance||kw.competitionSweetSpot||kw.competitorDistance||0.35
    weights.densityWeight = kw.poiDensity||kw.deliveryCoverage||kw.commercialDensity||0.25
  }
  loadHuffParams()
}

// ── Game solve ──
async function runGameSolve() {
  if (!gameLeaderCandidates.value.length) { task.value = { taskId:'', status:'failed', error:'请至少选择1个我方候选点' }; return }
  gameLoading.value = true; gameResult.value = null
  try {
    const data = await solveGame(props.projectId,
      gameLeaderCandidates.value.map(c=>({id:c.id,lng:c.lng,lat:c.lat,area:c.area,brand:c.brand})),
      gameFollowerCandidates.value.map(c=>({id:c.id,lng:c.lng,lat:c.lat,area:c.area,brand:c.brand})),
      gameLeaderP.value, gameFollowerQ.value, industry.value||undefined, 200)
    gameResult.value = data; emit('result', data)
    const rg: { groupId: string; points: { lng: number; lat: number; name?: string; label?: string; color?: string }[] }[] = []
    if (data.leader_sites) { const pts = gameLeaderCandidates.value.filter(c=>data.leader_sites.includes(c.id)); if (pts.length) rg.push({groupId:'result-leader',points:pts.map((c,i)=>({lng:c.lng,lat:c.lat,name:c.id,label:'SOL_'+c.id,color:'#34C759'}))}) }
    if (data.follower_sites) { const pts = gameFollowerCandidates.value.filter(c=>data.follower_sites.includes(c.id)); if (pts.length) rg.push({groupId:'result-follower',points:pts.map((c,i)=>({lng:c.lng,lat:c.lat,name:c.id,label:'ATK_'+c.id,color:'#FF3B30'}))}) }
    if (rg.length) emit('markersUpdate', rg)
  } catch (e: any) { task.value = { taskId:'', status:'failed', error:e.message } }
  finally { gameLoading.value = false }
}

// ── Compare ──
async function runCompare() {
  if (!planACandidates.value.length || !planBCandidates.value.length) {
    task.value = { taskId:'', status:'failed', error:'请为方案A和方案B至少选择1个候选点' }; return
  }
  compareLoading.value = true; compareResult.value = null
  try {
    const aIds = planACandidates.value.map(c=>c.id); const bIds = planBCandidates.value.map(c=>c.id)
    const all = [...planACandidates.value, ...planBCandidates.value]
    const data = await compareGamePlans(props.projectId,
      all.map(c=>({id:c.id,lng:c.lng,lat:c.lat,area:c.area,brand:c.brand})),
      gameFollowerCandidates.value.map(c=>({id:c.id,lng:c.lng,lat:c.lat,area:c.area,brand:c.brand})),
      aIds, bIds, gameFollowerQ.value, industry.value||undefined)
    compareResult.value = data; emit('result', data)
    const w = data.recommendation?.winner
    emit('markersUpdate', [
      { groupId:'result-planA', points: planACandidates.value.map((c,i)=>({lng:c.lng,lat:c.lat,name:c.id,label:'A'+(i+1),color:w==='plan_a'?'#00FF00':'#34C759'})) },
      { groupId:'result-planB', points: planBCandidates.value.map((c,i)=>({lng:c.lng,lat:c.lat,name:c.id,label:'B'+(i+1),color:w==='plan_b'?'#00FF00':'#FF9500'})) },
    ])
  } catch (e: any) { task.value = { taskId:'', status:'failed', error:e.message } }
  finally { compareLoading.value = false }
}

function formatRevenue(v: number | undefined) { if (v==null) return '--'; return v>=10000?(v/10000).toFixed(1)+'万':v.toFixed(0) }
function formatPop(v: number | undefined) { if (v==null) return '--'; return v>=10000?(v/10000).toFixed(1)+'万':v.toFixed(0) }
function diffClass(a: number|undefined, b: number|undefined) { if (a==null||b==null) return ''; return a>=b?'diff-pos':'diff-neg' }
function revenueDiff() { const a=compareResult.value?.plan_a?.leader_revenue; const b=compareResult.value?.plan_b?.leader_revenue; if (a==null||b==null||b===0) return '--'; return ((a-b)/b*100).toFixed(1)+'%' }
function cannDiff() { const a=compareResult.value?.plan_a?.cannibalization_pct; const b=compareResult.value?.plan_b?.cannibalization_pct; if (a==null||b==null) return '--'; return (a-b).toFixed(1)+'pp' }
function popDiff() { const a=compareResult.value?.plan_a?.coverage_population; const b=compareResult.value?.plan_b?.coverage_population; if (a==null||b==null||b===0) return '--'; return ((a-b)/b*100).toFixed(1)+'%' }
</script>

<style scoped>
/* ── Apple HIG Site Optimization Panel ── */

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.panel-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── Segmented Control ── */
.segmented-control {
  display: flex;
  background: var(--color-bg-input);
  border-radius: 8px;
  padding: 2px;
  gap: 1px;
}
.segmented-control.sm { border-radius: 6px; }
.seg-btn {
  flex: 1;
  padding: 6px 10px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-system);
  color: var(--color-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.seg-btn.sm { font-size: 11px; padding: 5px 8px; border-radius: 5px; }
.seg-btn.active {
  background: var(--color-bg-card-solid);
  color: var(--color-text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04);
}
.seg-btn .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

/* ── Divider ── */
.panel-divider { height: 1px; background: var(--color-border); margin: var(--space-1) 0; }

/* ── Field ── */
.field { display: flex; flex-direction: column; gap: 4px; }
.field-row { display: flex; gap: var(--space-2); align-items: flex-start; }
.field-half { flex: 1; display: flex; flex-direction: column; gap: 4px; }

/* ── Inline row (开店数并排) ── */
.inline-row {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-bg-input);
  border-radius: 10px;
}
.inline-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.inline-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  letter-spacing: -0.01em;
}
.inline-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg-card-solid);
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-system);
  color: var(--color-text-primary);
  text-align: center;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}
.inline-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-subtle);
}
.inline-input.muted {
  color: var(--color-text-tertiary);
  cursor: default;
}
.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
}
.field-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.field-caption {
  margin: 0;
  font-size: 11px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

/* ── Inputs ── */
.input, .select, .textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-card-solid);
  font-size: 12px;
  font-family: var(--font-system);
  color: var(--color-text-primary);
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.input:focus, .select:focus, .textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-subtle);
}
.textarea { resize: vertical; min-height: 80px; line-height: 1.5; }
.select { appearance: none; padding-right: 28px; }
.slider {
  width: 100%;
  -webkit-appearance: none; appearance: none;
  height: 4px; background: var(--color-border);
  border-radius: 2px; outline: none;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--color-accent); cursor: pointer;
  border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.15);
}

/* ── Buttons ── */
.btn-primary {
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  background: var(--color-accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-system);
  cursor: pointer;
  transition: background 0.15s ease;
}
.btn-primary:hover { background: var(--color-accent-hover); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-text {
  border: none; background: none;
  color: var(--color-accent);
  font-size: 11px; cursor: pointer;
  padding: 4px 0;
}

/* ── Stats bar ── */
.stats-bar {
  display: flex;
  gap: var(--space-3);
  padding: 8px 12px;
  background: var(--color-bg-input);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
}
.stat { display: flex; align-items: center; gap: 6px; color: var(--color-text-secondary); }
.stat-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

/* ── Point list (candidate rows) ── */
.point-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.point-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--color-bg-card);
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
  transition: border-color 0.15s ease;
}
.point-row:hover { border-color: var(--color-border); }
.leader-row { border-left: 3px solid var(--color-accent); }
.follower-row { border-left: 3px solid var(--color-error); }
.plan-a-row { border-left: 3px solid #34C759; }
.plan-b-row { border-left: 3px solid #FF9500; }
.point-idx {
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--color-bg-input);
  font-size: 10px; font-weight: 600;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.point-name {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.point-coord {
  font-size: 10px;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.point-input {
  padding: 4px 6px;
  border: 1px solid var(--color-border-light);
  border-radius: 5px;
  font-size: 11px;
  font-family: var(--font-system);
  color: var(--color-text-primary);
  background: var(--color-bg-card-solid);
  flex: 1;
  min-width: 0;
  transition: border-color 0.15s ease;
}
.point-input:focus { outline: none; border-color: var(--color-accent); }
.point-input.coord { max-width: 85px; font-variant-numeric: tabular-nums; }
.point-input.coord.sm { max-width: 58px; }
.point-meta {
  font-size: 10px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  padding: 0 4px;
}
.point-del {
  width: 22px; height: 22px;
  border: none; border-radius: 50%;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.point-del:hover { background: var(--color-error-bg); color: var(--color-error); }

/* ── Huff card ── */
.huff-card {
  padding: 12px;
  background: var(--color-bg-input);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.huff-head { display: flex; justify-content: space-between; align-items: center; }
.huff-label { font-size: 11px; font-weight: 500; color: var(--color-text-secondary); }
.huff-badge {
  font-size: 10px; padding: 2px 8px; border-radius: 10px;
  background: var(--color-accent-subtle); color: var(--color-accent);
}
.huff-badge.mle, .huff-badge.cached_mle { background: var(--color-success-bg); color: var(--color-success); }
.huff-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.huff-item { display: flex; gap: 4px; align-items: baseline; }
.huff-key {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-family: "Times New Roman", "STIX Two Text", "Cambria Math", Georgia, serif;
  font-style: italic;
  letter-spacing: 0.02em;
}
.huff-val {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
  font-family: "Times New Roman", "STIX Two Text", serif;
  font-variant-numeric: tabular-nums;
}
.huff-footer { display: flex; justify-content: flex-end; margin-top: 2px; }

/* ── Card list (results) ── */
.card-list { display: flex; flex-direction: column; gap: 8px; }
.card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: 10px;
  overflow: hidden;
  transition: box-shadow 0.15s ease;
}
.card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.card-top { border-color: var(--color-accent); box-shadow: 0 0 0 1px var(--color-accent); }
.card-rank {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-accent); color: #fff;
  font-size: 12px; font-weight: 700;
  border-radius: 0 0 8px 0;
}
.card-body { padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-size: 13px; font-weight: 600; color: var(--color-text-primary); }
.card-badge {
  font-size: 12px; font-weight: 700;
  padding: 2px 8px; border-radius: 12px;
  background: var(--color-accent-subtle); color: var(--color-accent);
}
.card-meta { display: flex; flex-wrap: wrap; gap: 4px; }
.card-detail { font-size: 11px; color: var(--color-text-secondary); }
.card-advice { display: flex; gap: 4px; flex-wrap: wrap; }

.tag {
  font-size: 10px; padding: 2px 6px; border-radius: 4px;
  font-weight: 500;
}
.tag-high { background: var(--color-success-bg); color: var(--color-success); }
.tag-mid { background: var(--color-warning-bg); color: var(--color-warning); }
.tag-low { background: var(--color-error-bg); color: var(--color-error); }

.advice { font-size: 10px; padding: 2px 6px; border-radius: 4px; }
.adv-high { background: var(--color-error-bg); color: var(--color-error); }
.adv-medium { background: var(--color-warning-bg); color: var(--color-warning); }
.adv-low { background: var(--color-success-bg); color: var(--color-success); }

/* ── Result display ── */
.result-split { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.result-side { display: flex; align-items: center; gap: 8px; }
.result-tag {
  font-size: 10px; font-weight: 600; color: #fff;
  padding: 2px 8px; border-radius: 4px; white-space: nowrap;
}
.result-sites { font-size: 12px; color: var(--color-text-primary); font-weight: 500; }
.result-site-list { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.result-site-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.site-name-tag {
  font-weight: 600; color: var(--color-accent);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;
}
.site-name-tag.follower-name { color: var(--color-error); }
.site-coord-tag {
  font-size: 10px; color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums; white-space: nowrap;
  flex-shrink: 0;
}
.result-metrics { display: flex; gap: 16px; }
.metric { display: flex; flex-direction: column; align-items: center; }
.metric-val { font-size: 16px; font-weight: 700; color: var(--color-text-primary); }
.metric-good { color: var(--color-success); }
.metric-bad { color: var(--color-error); }
.metric-lbl { font-size: 10px; color: var(--color-text-tertiary); margin-top: 2px; }

.card-robust { border-color: var(--color-border); }
.robust-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.robust-bar {
  flex: 1; height: 6px;
  background: var(--color-bg-input); border-radius: 3px; overflow: hidden;
}
.robust-fill {
  height: 100%; border-radius: 3px;
  background: var(--color-accent); transition: width 0.3s ease;
}
.robust-pct { font-weight: 600; color: var(--color-text-primary); }
.sensitivity { font-size: 11px; color: var(--color-error); margin-top: 4px; }

/* ── Compare table ── */
.compare-table { font-size: 12px; }
.cmp-head, .cmp-row { display: grid; grid-template-columns: 1.2fr 1fr 1fr 0.8fr; gap: 4px; padding: 6px 0; }
.cmp-head { font-weight: 600; color: var(--color-text-secondary); font-size: 11px; border-bottom: 1px solid var(--color-border-light); }
.cmp-row { border-bottom: 1px solid var(--color-border-light); }
.cmp-row:last-child { border-bottom: none; }
.cmp-row span { color: var(--color-text-primary); }
.diff-pos { color: var(--color-success); font-weight: 600; }
.diff-neg { color: var(--color-error); font-weight: 600; }

.rec { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--color-border-light); }
.rec-badge {
  display: inline-block; font-size: 12px; font-weight: 600;
  padding: 4px 12px; border-radius: 6px;
  color: #fff;
}
.rec-a { background: var(--color-success); }
.rec-b { background: var(--color-warning); }
.rec-reason { font-size: 11px; color: var(--color-text-secondary); margin: 6px 0 0 0; }

/* ── Notice / fallback ── */
.notice {
  padding: 10px 12px;
  background: var(--color-warning-bg);
  border-radius: 8px;
  font-size: 11px; color: var(--color-warning);
}

/* ── Legend ── */
.legend {
  display: flex; gap: 12px; flex-wrap: wrap;
  padding: 8px 0;
  font-size: 10px; color: var(--color-text-tertiary);
  border-top: 1px solid var(--color-border-light);
}
.leg-item { display: flex; align-items: center; gap: 4px; }
.leg-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
</style>
