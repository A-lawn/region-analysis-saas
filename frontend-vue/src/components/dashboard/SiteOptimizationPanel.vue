<template>
  <div class="panel">
    <h4 class="panel-title">选址优化</h4>

    <!-- Mode selector -->
    <div class="param-group">
      <label>分析模式</label>
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: mode === 'scorecard' }" @click="mode = 'scorecard'">打分评估</button>
        <button class="mode-tab" :class="{ active: mode === 'game' }" @click="mode = 'game'">博弈求解</button>
        <button class="mode-tab" :class="{ active: mode === 'compare' }" @click="mode = 'compare'">A/B 对比</button>
      </div>
    </div>

    <!-- Industry selector -->
    <div class="param-group">
      <label>行业模型</label>
      <IndustrySelector v-model="industry" @change="onIndustryChange" :show-label="false" />
    </div>

    <!-- ===== SCORECARD MODE ===== -->
    <template v-if="mode === 'scorecard'">
      <div class="param-group">
        <label>距离权重</label>
        <input type="range" min="0" max="1" step="0.05" v-model.number="weights.distanceWeight" class="range-input" />
        <span class="param-hint">{{ weights.distanceWeight.toFixed(2) }}</span>
      </div>
      <div class="param-group">
        <label>盲区权重</label>
        <input type="range" min="0" max="1" step="0.05" v-model.number="weights.blindSpotWeight" class="range-input" />
        <span class="param-hint">{{ weights.blindSpotWeight.toFixed(2) }}</span>
      </div>
      <div class="param-group">
        <label>密度权重</label>
        <input type="range" min="0" max="1" step="0.05" v-model.number="weights.densityWeight" class="range-input" />
        <span class="param-hint">{{ weights.densityWeight.toFixed(2) }}</span>
      </div>

      <div class="param-group">
        <label>候选位置 (name,lng,lat)</label>
        <div class="map-hint">在地图上点击直接添加候选坐标</div>
        <textarea v-model="candidatesText" rows="4" placeholder="A,116.40,39.91&#10;B,116.42,39.92"></textarea>
      </div>

      <button class="btn btn-primary btn-block" @click="runScorecard">评估选址</button>

      <div v-if="result" class="result-section">
        <div v-for="(c, i) in result.candidates" :key="c.name" class="site-row" :class="{ top: i === 0 }">
          <span class="site-rank">{{ i + 1 }}</span>
          <div class="site-info">
            <div class="site-header-row">
              <span class="site-name">{{ c.name }}</span>
              <span class="site-score">{{ c.score }}分</span>
            </div>
            <div class="site-dims" v-if="c.dimensions">
              <span class="dim-item" :class="scoreClass(c.dimensions.distanceScore)">距离 {{ c.dimensions.distanceScore }}</span>
              <span class="dim-item" :class="scoreClass(c.dimensions.blindSpotScore)">覆盖 {{ c.dimensions.blindSpotScore }}</span>
              <span class="dim-item" :class="scoreClass(c.dimensions.competitionScore)">竞争 {{ c.dimensions.competitionScore }}</span>
              <span class="dim-item" :class="scoreClass(c.dimensions.densityScore)">密度 {{ c.dimensions.densityScore }}</span>
            </div>
            <div class="site-summary">
              最近点距离 {{ c.dimensions.minDistanceMeters }}m，周边 {{ c.dimensions.nearbyPoints }} 个点
              <span v-if="c.dimensions.competitors500m > 0">，竞争者 {{ c.dimensions.competitors500m }} 家(500m内)</span>
            </div>
            <div class="site-advice" v-if="c.advice && c.advice.length">
              <span v-for="a in c.advice.slice(0,2)" :key="a.message" class="advice-tag" :class="a.priority">{{ a.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== GAME MODE ===== -->
    <template v-if="mode === 'game'">
      <div class="game-section">
        <div class="game-row">
          <div class="game-col">
            <label class="game-label">我方候选点</label>
            <div class="game-count">已选 {{ gameLeaderCandidates.length }} 个</div>
          </div>
          <div class="game-col">
            <label class="game-label">竞品候选点</label>
            <div class="game-count">已选 {{ gameFollowerCandidates.length }} 个</div>
          </div>
        </div>

        <div class="map-hint">点击地图添加候选点（默认为我方候选，点击已有点切换为竞品候选）</div>

        <div class="game-row">
          <div class="game-col">
            <label class="game-label">我方开店数</label>
            <input type="number" v-model.number="gameLeaderP" min="1" max="20" class="game-input" />
          </div>
          <div class="game-col">
            <label class="game-label">竞品开店数</label>
            <input type="number" v-model.number="gameFollowerQ" min="0" max="20" class="game-input" />
          </div>
        </div>

        <!-- Huff params display -->
        <div class="huff-info" v-if="huffParams">
          <div class="huff-row">
            <span class="huff-label">Huff 参数</span>
            <span class="huff-source" :class="huffParams.source">{{ huffSourceLabel }}</span>
          </div>
          <div class="huff-vals">
            <span>λ={{ huffParams.lambda.toFixed(2) }}</span>
            <span>α_area={{ huffParams.alpha_area.toFixed(2) }}</span>
            <span>α_brand={{ huffParams.alpha_brand.toFixed(2) }}</span>
            <span v-if="huffParams.r_squared != null">R²={{ huffParams.r_squared.toFixed(2) }}</span>
          </div>
          <button class="btn btn-sm" @click="loadHuffParams" :disabled="huffLoading">
            {{ huffLoading ? '加载中...' : '刷新参数' }}
          </button>
        </div>

        <button class="btn btn-primary btn-block" @click="runGameSolve" :disabled="gameLoading">
          <span v-if="gameLoading" class="spinner-inline"></span>
          {{ gameLoading ? '推演中...' : '开始推演' }}
        </button>
      </div>

      <!-- Game result -->
      <div v-if="gameResult && !gameResult.fallback" class="result-section game-result">
        <div class="game-result-header">
          <div class="game-result-col">
            <span class="result-label">我方选址</span>
            <span class="result-value result-blue">{{ (gameResult.leader_sites || []).join(', ') }}</span>
          </div>
          <div class="game-result-col">
            <span class="result-label">竞品可能攻击点</span>
            <span class="result-value result-red">{{ (gameResult.follower_sites || []).join(', ') }}</span>
          </div>
        </div>

        <div class="game-metrics">
          <div class="metric">
            <span class="metric-value">¥{{ formatRevenue(gameResult.leader_revenue) }}</span>
            <span class="metric-label">预期月营收</span>
          </div>
          <div class="metric">
            <span class="metric-value" :class="gameResult.cannibalization_pct > 20 ? 'metric-danger' : 'metric-ok'">{{ gameResult.cannibalization_pct }}%</span>
            <span class="metric-label">蚕食损失</span>
          </div>
          <div class="metric">
            <span class="metric-value">{{ (gameResult.market_share?.leader * 100).toFixed(0) }}%</span>
            <span class="metric-label">市场占有率</span>
          </div>
        </div>

        <!-- Robustness -->
        <div v-if="gameResult.robust" class="robust-info">
          <div class="robust-row">
            <span>解稳定性</span>
            <div class="stability-bar">
              <div class="stability-fill" :style="{ width: (gameResult.robust.stability_score * 100) + '%', background: gameResult.robust.stability_score > 0.7 ? 'var(--color-success)' : gameResult.robust.stability_score > 0.4 ? 'var(--color-warning)' : 'var(--color-error)' }"></div>
            </div>
            <span>{{ (gameResult.robust.stability_score * 100).toFixed(0) }}%</span>
          </div>
          <div v-if="gameResult.robust.sensitivity_warning" class="sensitivity-warn">
            ⚠ {{ gameResult.robust.sensitivity_warning }}
          </div>
        </div>
      </div>

      <div v-if="gameResult?.fallback" class="fallback-msg">
        ⚠ 计算引擎未启动，显示静态竞争分析。启动 python-compute 服务以启用博弈推演。
      </div>
    </template>

    <!-- ===== COMPARE MODE ===== -->
    <template v-if="mode === 'compare'">
      <div class="game-section">
        <div class="game-row">
          <div class="game-col">
            <label class="game-label">竞品候选点</label>
            <div class="game-count">已选 {{ gameFollowerCandidates.length }} 个</div>
          </div>
          <div class="game-col">
            <label class="game-label">竞品开店数</label>
            <input type="number" v-model.number="gameFollowerQ" min="0" max="20" class="game-input" />
          </div>
        </div>

        <div class="compare-plans">
          <div class="plan-card">
            <h5>方案 A</h5>
            <textarea v-model="planASitesText" rows="3" placeholder="每个候选点ID一行&#10;L1&#10;L3&#10;L5"></textarea>
          </div>
          <div class="plan-vs">vs</div>
          <div class="plan-card">
            <h5>方案 B</h5>
            <textarea v-model="planBSitesText" rows="3" placeholder="每个候选点ID一行&#10;L2&#10;L4&#10;L6"></textarea>
          </div>
        </div>

        <button class="btn btn-primary btn-block" @click="runCompare" :disabled="compareLoading">
          {{ compareLoading ? '对比中...' : '开始对比' }}
        </button>
      </div>

      <!-- Compare result -->
      <div v-if="compareResult && !compareResult.fallback" class="result-section compare-result">
        <div class="compare-table">
          <div class="compare-header">
            <span>指标</span><span>方案 A</span><span>方案 B</span><span>差异</span>
          </div>
          <div class="compare-row">
            <span>预期月营收</span>
            <span>¥{{ formatRevenue(compareResult.plan_a?.leader_revenue) }}</span>
            <span>¥{{ formatRevenue(compareResult.plan_b?.leader_revenue) }}</span>
            <span :class="diffClass(compareResult.plan_a?.leader_revenue, compareResult.plan_b?.leader_revenue)">{{ revenueDiff() }}</span>
          </div>
          <div class="compare-row">
            <span>竞品蚕食率</span>
            <span>{{ compareResult.plan_a?.cannibalization_pct }}%</span>
            <span>{{ compareResult.plan_b?.cannibalization_pct }}%</span>
            <span :class="diffClass(compareResult.plan_b?.cannibalization_pct, compareResult.plan_a?.cannibalization_pct)">{{ cannDiff() }}</span>
          </div>
          <div class="compare-row">
            <span>覆盖人口</span>
            <span>{{ formatPop(compareResult.plan_a?.coverage_population) }}</span>
            <span>{{ formatPop(compareResult.plan_b?.coverage_population) }}</span>
            <span :class="diffClass(compareResult.plan_a?.coverage_population, compareResult.plan_b?.coverage_population)">{{ popDiff() }}</span>
          </div>
        </div>

        <div class="recommendation" v-if="compareResult.recommendation">
          <div class="rec-badge" :class="compareResult.recommendation.winner === 'plan_a' ? 'rec-a' : 'rec-b'">
            推荐 {{ compareResult.recommendation.winner === 'plan_a' ? '方案 A' : '方案 B' }}
          </div>
          <p class="rec-reason">{{ compareResult.recommendation.reason }}</p>
        </div>
      </div>
    </template>

    <TaskProgress v-if="task" :task="task" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue'
import { getSiteOptimization, solveGame, compareGamePlans, getHuffParams } from '@/api'
import IndustrySelector from '@/components/shared/IndustrySelector.vue'
import { useIndustryStore } from '@/stores/industry'
import TaskProgress from '@/components/shared/TaskProgress.vue'
import type { SiteOptimizationResult, TaskInfo, GameSolveResponse, GameCompareResponse, HuffParams } from '@/types'

const props = defineProps<{
  projectId: string
  clickedCandidate?: { lng: number; lat: number } | null
}>()

const emit = defineEmits<{
  result: [data: any]
}>()

const industryStore = useIndustryStore()
industryStore.fetchIndustries()

// ---- Mode ----
const mode = ref<'scorecard' | 'game' | 'compare'>('game')

// ---- Scorecard state ----
const weights = reactive({ distanceWeight: 0.4, blindSpotWeight: 0.35, densityWeight: 0.25 })
const industry = ref('')
const candidatesText = ref('')
const result = ref<SiteOptimizationResult | null>(null)
const task = ref<TaskInfo | null>(null)

// ---- Game state ----
const gameLeaderCandidates = ref<{ id: string; lng: number; lat: number; area?: number; brand?: number }[]>([])
const gameFollowerCandidates = ref<{ id: string; lng: number; lat: number; area?: number; brand?: number }[]>([])
const gameLeaderP = ref(2)
const gameFollowerQ = ref(2)
const gameResult = ref<GameSolveResponse | null>(null)
const gameLoading = ref(false)
const huffParams = ref<HuffParams | null>(null)
const huffLoading = ref(false)
const addingFor = ref<'leader' | 'follower'>('leader')

// ---- Compare state ----
const planASitesText = ref('')
const planBSitesText = ref('')
const compareResult = ref<GameCompareResponse | null>(null)
const compareLoading = ref(false)

// ---- Map click integration ----
watch(() => props.clickedCandidate, (pt) => {
  if (!pt || mode.value === 'scorecard') return
  const id = `P${Date.now()}`
  if (mode.value === 'game') {
    if (addingFor.value === 'leader') {
      gameLeaderCandidates.value.push({ id, lng: pt.lng, lat: pt.lat, area: 100, brand: 0.5 })
    } else {
      gameFollowerCandidates.value.push({ id, lng: pt.lng, lat: pt.lat, area: 100, brand: 0.5 })
    }
  }
})

// ---- Huff params ----
const huffSourceLabel = computed(() => {
  const s = huffParams.value?.source
  if (s === 'mle') return 'MLE拟合'
  if (s === 'cached_mle') return '拟合(缓存)'
  if (s === 'benchmark') return '行业基准'
  return '默认值'
})

async function loadHuffParams() {
  huffLoading.value = true
  try {
    huffParams.value = await getHuffParams(props.projectId, industry.value || undefined)
  } catch { /* ignore */ }
  finally { huffLoading.value = false }
}

onMounted(() => { loadHuffParams() })

// ---- Industry change ----
function onIndustryChange() {
  if (!industry.value) return
  const cfg = industryStore.getIndustry(industry.value)
  if (cfg?.kpiWeights) {
    const kw = cfg.kpiWeights as Record<string, number>
    weights.distanceWeight = kw.walkableRatio || kw.footTraffic || kw.populationDensity || 0.4
    weights.blindSpotWeight = kw.competitorAvoidance || kw.competitionSweetSpot || kw.competitorDistance || 0.35
    weights.densityWeight = kw.poiDensity || kw.deliveryCoverage || kw.commercialDensity || 0.25
  }
  loadHuffParams()
}

// ---- Scorecard ----
async function runScorecard() {
  if (mode.value !== 'scorecard') { mode.value = 'scorecard'; return }
  // ... existing logic
  const lines = candidatesText.value.split('\n').filter(l => l.trim())
  const candidates = lines.map((line, i) => {
    const parts = line.split(',').map(p => p.trim())
    const name = parts[0] || `P${i+1}`
    const lng = parseFloat(parts[1])
    const lat = parseFloat(parts[2])
    return { name, lng, lat }
  }).filter(c => !isNaN(c.lng) && !isNaN(c.lat))

  if (!candidates.length) {
    task.value = { taskId: '', status: 'failed', error: '请至少输入一个有效候选位置' }
    return
  }

  task.value = { taskId: '', status: 'running' }
  try {
    const data = await getSiteOptimization(props.projectId, candidates, { ...weights }, 5, industry.value)
    result.value = data
    task.value = { taskId: '', status: 'completed', result: data }
    emit('result', data)
  } catch (e: any) {
    const msg = e?.response?.data?.error || e.message
    task.value = { taskId: '', status: 'failed', error: msg }
  }
}

// ---- Game solve ----
async function runGameSolve() {
  if (!gameLeaderCandidates.value.length) {
    task.value = { taskId: '', status: 'failed', error: '请在地图上点击至少1个我方候选点' }
    return
  }

  gameLoading.value = true
  gameResult.value = null
  try {
    const data = await solveGame(
      props.projectId,
      gameLeaderCandidates.value,
      gameFollowerCandidates.value,
      gameLeaderP.value,
      gameFollowerQ.value,
      industry.value || undefined,
      200,
    )
    gameResult.value = data
    emit('result', data)
  } catch (e: any) {
    task.value = { taskId: '', status: 'failed', error: e.message }
  } finally {
    gameLoading.value = false
  }
}

// ---- Compare ----
async function runCompare() {
  const aSites = planASitesText.value.split('\n').map(s => s.trim()).filter(Boolean)
  const bSites = planBSitesText.value.split('\n').map(s => s.trim()).filter(Boolean)

  if (!aSites.length || !bSites.length) {
    task.value = { taskId: '', status: 'failed', error: '请填写方案A和方案B的候选点ID' }
    return
  }

  compareLoading.value = true
  compareResult.value = null
  try {
    const data = await compareGamePlans(
      props.projectId,
      gameLeaderCandidates.value,
      gameFollowerCandidates.value,
      aSites, bSites,
      gameFollowerQ.value,
      industry.value || undefined,
    )
    compareResult.value = data
    emit('result', data)
  } catch (e: any) {
    task.value = { taskId: '', status: 'failed', error: e.message }
  } finally {
    compareLoading.value = false
  }
}

// ---- Helpers ----
function scoreClass(s: number) {
  if (s >= 3) return 'score-high'
  if (s >= 2) return 'score-mid'
  return 'score-low'
}

function formatRevenue(v: number | undefined) {
  if (v == null) return '--'
  if (v >= 10000) return (v / 10000).toFixed(1) + '万'
  return v.toFixed(0)
}

function formatPop(v: number | undefined) {
  if (v == null) return '--'
  if (v >= 10000) return (v / 10000).toFixed(1) + '万'
  return v.toFixed(0)
}

function diffClass(a: number | undefined, b: number | undefined) {
  if (a == null || b == null) return ''
  return a >= b ? 'diff-positive' : 'diff-negative'
}

function revenueDiff() {
  const a = compareResult.value?.plan_a?.leader_revenue
  const b = compareResult.value?.plan_b?.leader_revenue
  if (a == null || b == null || b === 0) return '--'
  return ((a - b) / b * 100).toFixed(1) + '%'
}

function cannDiff() {
  const a = compareResult.value?.plan_a?.cannibalization_pct
  const b = compareResult.value?.plan_b?.cannibalization_pct
  if (a == null || b == null) return '--'
  return (a - b).toFixed(1) + 'pp'
}

function popDiff() {
  const a = compareResult.value?.plan_a?.coverage_population
  const b = compareResult.value?.plan_b?.coverage_population
  if (a == null || b == null || b === 0) return '--'
  return ((a - b) / b * 100).toFixed(1) + '%'
}

const emitResult = () => {}
</script>



<style scoped>
.panel { padding: 0; }
.panel-title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.param-group { margin-bottom: var(--space-2); }
.param-group label {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-1);
}
.param-group input[type='range'] {
  width: 100%;
  -webkit-appearance: none; appearance: none;
  height: 4px; background: var(--color-border);
  border-radius: var(--radius-full); outline: none;
}
.param-group input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--color-accent); cursor: pointer;
  border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.param-group textarea {
  width: 100%; padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm); font-family: var(--font-mono);
  resize: vertical; background: var(--color-bg-card-solid);
  color: var(--color-text-primary);
}
.param-hint { font-size: var(--text-xs); color: var(--color-text-tertiary); }
.btn-block { width: 100%; margin-top: var(--space-2); }

/* Mode tabs */
.mode-tabs { display: flex; gap: 2px; background: var(--color-bg-input); border-radius: var(--radius-sm); padding: 2px; }
.mode-tab {
  flex: 1; padding: 6px 0; border: none; background: transparent;
  border-radius: 6px; font-size: 12px; font-weight: 500;
  color: var(--color-text-secondary); cursor: pointer; transition: all 0.15s;
}
.mode-tab.active { background: var(--color-bg-card-solid); color: var(--color-accent); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

/* Game section */
.game-section { display: flex; flex-direction: column; gap: var(--space-3); }
.game-row { display: flex; gap: var(--space-3); }
.game-col { flex: 1; }
.game-label { font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; display: block; margin-bottom: 2px; }
.game-count { font-size: 13px; color: var(--color-text-secondary); font-weight: 500; }
.game-input {
  width: 100%; padding: 6px 10px; border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); font-size: 14px; font-family: var(--font-mono);
  background: var(--color-bg-card-solid); color: var(--color-text-primary);
}

/* Huff info */
.huff-info {
  padding: var(--space-2) var(--space-3); background: var(--color-accent-subtle);
  border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 4px;
}
.huff-row { display: flex; justify-content: space-between; align-items: center; }
.huff-label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.huff-source { font-size: 11px; padding: 1px 8px; border-radius: 10px; font-weight: 500; }
.huff-source.mle, .huff-source.cached_mle { background: var(--color-success-bg); color: var(--color-success); }
.huff-source.benchmark { background: var(--color-warning-bg); color: var(--color-text-primary); }
.huff-source.default { background: var(--color-bg-input); color: var(--color-text-tertiary); }
.huff-vals { display: flex; gap: var(--space-2); font-size: 11px; color: var(--color-text-secondary); font-family: var(--font-mono); }

/* Game result */
.game-result { padding: var(--space-3); background: var(--color-bg-card-solid); border-radius: var(--radius-md); }
.game-result-header { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
.game-result-col { display: flex; justify-content: space-between; align-items: center; }
.result-label { font-size: 12px; color: var(--color-text-tertiary); }
.result-value { font-size: 14px; font-weight: 600; font-family: var(--font-mono); }
.result-blue { color: var(--color-accent); }
.result-red { color: var(--color-error); }

.game-metrics { display: flex; gap: var(--space-3); margin-bottom: var(--space-2); }
.metric { flex: 1; text-align: center; }
.metric-value { font-size: 18px; font-weight: 700; color: var(--color-text-primary); display: block; }
.metric-label { font-size: 11px; color: var(--color-text-tertiary); }
.metric-danger { color: var(--color-error); }
.metric-ok { color: var(--color-success); }

.robust-info { padding: var(--space-2); background: var(--color-bg-input); border-radius: var(--radius-sm); }
.robust-row { display: flex; align-items: center; gap: var(--space-2); font-size: 12px; }
.stability-bar { flex: 1; height: 6px; background: var(--color-border); border-radius: 3px; overflow: hidden; }
.stability-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.sensitivity-warn { margin-top: 4px; font-size: 11px; color: var(--color-warning); }

/* Compare */
.compare-plans { display: flex; gap: var(--space-2); align-items: flex-start; }
.plan-card { flex: 1; }
.plan-card h5 { font-size: 13px; font-weight: 600; margin: 0 0 4px; color: var(--color-text-primary); }
.plan-card textarea {
  width: 100%; padding: 6px; border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); font-size: 12px; font-family: var(--font-mono);
  resize: vertical; background: var(--color-bg-card-solid); color: var(--color-text-primary);
}
.plan-vs { padding-top: 22px; font-size: 14px; font-weight: 700; color: var(--color-text-tertiary); }

.compare-table { display: flex; flex-direction: column; gap: 1px; background: var(--color-border); border-radius: var(--radius-sm); overflow: hidden; margin-bottom: var(--space-3); }
.compare-header, .compare-row { display: grid; grid-template-columns: 1.2fr 1fr 1fr 0.8fr; gap: var(--space-1); padding: var(--space-1) var(--space-2); background: var(--color-bg-card-solid); font-size: 12px; }
.compare-header { font-weight: 600; color: var(--color-text-secondary); }
.compare-row span { color: var(--color-text-primary); }
.diff-positive { color: var(--color-success); font-weight: 600; }
.diff-negative { color: var(--color-error); font-weight: 600; }

.recommendation { padding: var(--space-3); background: var(--color-accent-subtle); border-radius: var(--radius-md); }
.rec-badge { display: inline-block; padding: 2px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.rec-a { background: var(--color-accent); color: #fff; }
.rec-b { background: var(--color-accent); color: #fff; }
.rec-reason { margin: 0; font-size: 12px; color: var(--color-text-secondary); }

.fallback-msg { padding: var(--space-3); background: var(--color-warning-bg); border-radius: var(--radius-sm); font-size: 12px; color: var(--color-text-primary); }

/* Spinner */
.spinner-inline { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; margin-right: 6px; vertical-align: middle; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Scorecard styles */
.result-section { margin-top: var(--space-3); }
.site-row { display: flex; align-items: flex-start; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); gap: var(--space-3); }
.site-row.top { background: var(--color-success-bg); border-radius: var(--radius-sm); }
.site-rank { width: 24px; height: 24px; border-radius: 50%; background: var(--color-bg-input); display: flex; align-items: center; justify-content: center; font-size: var(--text-xs); font-weight: var(--font-semibold); flex-shrink: 0; }
.site-row.top .site-rank { background: var(--color-success); color: #fff; }
.site-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.site-header-row { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.site-name { font-size: var(--text-sm); font-weight: var(--font-medium); }
.site-score { font-weight: var(--font-bold); color: var(--color-accent); font-size: var(--text-base); }
.site-dims { display: flex; gap: var(--space-1); font-size: var(--text-xs); flex-wrap: wrap; }
.dim-item { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: var(--text-xs); font-weight: var(--font-semibold); }
.dim-item.score-high { background: var(--color-success-bg); color: var(--color-success); }
.dim-item.score-mid { background: var(--color-warning-bg); color: var(--color-text-primary); }
.dim-item.score-low { background: var(--color-error-bg); color: var(--color-error); }
.site-summary { font-size: var(--text-xs); color: var(--color-text-tertiary); }
.site-advice { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.advice-tag { padding: 1px 6px; border-radius: 3px; font-size: var(--text-xs); background: var(--color-bg-input); color: var(--color-text-secondary); }
.advice-tag.high { background: var(--color-error-bg); color: var(--color-error); }
.advice-tag.medium { background: var(--color-warning-bg); color: var(--color-text-primary); }
.advice-tag.low { background: var(--color-success-bg); color: var(--color-success); }
.map-hint {
  background: var(--color-accent-subtle); border: 1px solid var(--color-border-focus);
  border-radius: var(--radius-sm); padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs); color: var(--color-text-accent); margin-bottom: var(--space-1);
}
</style>
