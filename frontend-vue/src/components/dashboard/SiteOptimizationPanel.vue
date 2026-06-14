<template>
  <div class="panel">
    <h4 class="panel-title">选址优化</h4>
    <div class="param-group">
      <label>分析模式</label>
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: mode === 'scorecard' }" @click="switchMode('scorecard')">打分评估</button>
        <button class="mode-tab" :class="{ active: mode === 'game' }" @click="switchMode('game')">博弈求解</button>
        <button class="mode-tab" :class="{ active: mode === 'compare' }" @click="switchMode('compare')">A/B 对比</button>
      </div>
    </div>
    <div class="param-group">
      <label>行业模型</label>
      <IndustrySelector v-model="industry" @change="onIndustryChange" :show-label="false" />
    </div>

    <!-- SCORECARD MODE -->
    <template v-if="mode === 'scorecard'">
      <div class="param-group"><label>距离权重</label><input type="range" min="0" max="1" step="0.05" v-model.number="weights.distanceWeight" class="range-input" /><span class="param-hint">{{ weights.distanceWeight.toFixed(2) }}</span></div>
      <div class="param-group"><label>覆盖权重</label><input type="range" min="0" max="1" step="0.05" v-model.number="weights.blindSpotWeight" class="range-input" /><span class="param-hint">{{ weights.blindSpotWeight.toFixed(2) }}</span></div>
      <div class="param-group"><label>密度权重</label><input type="range" min="0" max="1" step="0.05" v-model.number="weights.densityWeight" class="range-input" /><span class="param-hint">{{ weights.densityWeight.toFixed(2) }}</span></div>
      <div class="param-group"><label>候选位置 <span class="param-hint">(地图点击+手动编辑)</span></label><div class="map-hint">地图点击任意位置添加，格式: 名称,经度,纬度</div><textarea v-model="candidatesText" rows="4" placeholder="A,116.40,39.91&#10;B,116.42,39.92"></textarea></div>
      <button class="btn btn-primary btn-block" @click="runScorecard" :disabled="!candidatesText.trim()">评估选址</button>
      <div v-if="result" class="result-section">
        <div v-for="(c, i) in result.candidates" :key="c.name" class="site-row" :class="{ top: i === 0 }">
          <span class="site-rank">{{ i + 1 }}</span>
          <div class="site-info">
            <div class="site-header-row"><span class="site-name">{{ c.name }}</span><span class="site-score">{{ c.score }}分</span></div>
            <div class="site-dims" v-if="c.dimensions">
              <span class="dim-item" :class="scoreClass(c.dimensions.distanceScore)">距离{{ c.dimensions.distanceScore }}</span>
              <span class="dim-item" :class="scoreClass(c.dimensions.blindSpotScore)">覆盖{{ c.dimensions.blindSpotScore }}</span>
              <span class="dim-item" :class="scoreClass(c.dimensions.competitionScore)">竞争{{ c.dimensions.competitionScore }}</span>
              <span class="dim-item" :class="scoreClass(c.dimensions.densityScore)">密度{{ c.dimensions.densityScore }}</span>
            </div>
            <div class="site-summary">最近{{ c.dimensions.minDistanceMeters }}m<span v-if="c.dimensions.competitors500m>0">,竞争者{{c.dimensions.competitors500m}}家</span></div>
            <div class="site-advice" v-if="c.advice&&c.advice.length"><span v-for="a in c.advice.slice(0,2)" :key="a.message" class="advice-tag" :class="a.priority">{{ a.message }}</span></div>
          </div>
        </div>
      </div>
    </template>

    <!-- GAME MODE -->
    <template v-if="mode === 'game'">
      <div class="game-section">
        <div class="game-role-switch"><label>当前添加角色</label><div class="role-tabs"><button class="role-tab leader" :class="{ active: addingFor==='leader' }" @click="addingFor='leader'">我方候选</button><button class="role-tab follower" :class="{ active: addingFor==='follower' }" @click="addingFor='follower'">竞品候选</button></div></div>
        <div class="game-role-switch" v-if="importedPoints.length>0"><label>竞品候选池筛选 (地图点击灰色点选中/取消)</label><select v-model="competitorFilter" class="game-select"><option value="">全部 ({{importedPoints.length}})</option><option v-for="ind in uniqueIndustries" :key="ind" :value="ind">{{ind}} ({{industryCount(ind)}})</option></select></div>
        <div class="candidate-summary"><div class="cand-count leader-count"><span class="cand-dot leader-dot"></span> 我方 {{gameLeaderCandidates.length}}</div><div class="cand-count follower-count"><span class="cand-dot follower-dot"></span> 竞品 {{gameFollowerCandidates.length}}</div><div class="cand-count pool-count"><span class="cand-dot pool-dot"></span> 待选 {{filteredPoolPoints.length}}</div></div>
        <div class="game-row"><div class="game-col"><label class="game-label">我方开店数</label><input type="number" v-model.number="gameLeaderP" min="1" max="20" class="game-input" /></div><div class="game-col"><label class="game-label">竞品开店数</label><input type="number" v-model.number="gameFollowerQ" min="0" max="20" class="game-input" /></div></div>
        <div class="huff-info" v-if="huffParams"><div class="huff-row"><span class="huff-label">Huff参数</span><span class="huff-source" :class="huffParams.source">{{huffSourceLabel}}</span></div><div class="huff-vals"><span>λ={{huffParams.lambda.toFixed(2)}}</span><span>α_area={{huffParams.alpha_area.toFixed(2)}}</span><span>α_brand={{huffParams.alpha_brand.toFixed(2)}}</span><span v-if="huffParams.r_squared!=null">R²={{huffParams.r_squared.toFixed(2)}}</span></div><button class="btn btn-sm" @click="loadHuffParams" :disabled="huffLoading">刷新参数</button></div>
        <button class="btn btn-primary btn-block" @click="runGameSolve" :disabled="gameLoading||!gameLeaderCandidates.length">{{gameLoading?'推演中...':'开始推演'}}</button>
      </div>
      <div v-if="gameResult&&!gameResult.fallback" class="result-section game-result">
        <div class="game-result-header"><div class="game-result-col"><span class="result-label">我方选址</span><span class="result-value result-blue">{{(gameResult.leader_sites||[]).join(', ')}}</span></div><div class="game-result-col"><span class="result-label">竞品攻击点</span><span class="result-value result-red">{{(gameResult.follower_sites||[]).join(', ')}}</span></div></div>
        <div class="game-metrics"><div class="metric"><span class="metric-value">{{formatRevenue(gameResult.leader_revenue)}}</span><span class="metric-label">预期月营收</span></div><div class="metric"><span class="metric-value" :class="gameResult.cannibalization_pct>20?'metric-danger':'metric-ok'">{{gameResult.cannibalization_pct}}%</span><span class="metric-label">蚕食损失</span></div><div class="metric"><span class="metric-value">{{(gameResult.market_share?.leader*100).toFixed(0)}}%</span><span class="metric-label">市场占有率</span></div></div>
        <div v-if="gameResult.robust" class="robust-info"><div class="robust-row"><span>解稳定性</span><div class="stability-bar"><div class="stability-fill" :style="{width:(gameResult.robust.stability_score*100)+'%',background:gameResult.robust.stability_score>0.7?'var(--color-success)':gameResult.robust.stability_score>0.4?'var(--color-warning)':'var(--color-error)'}"></div></div><span>{{(gameResult.robust.stability_score*100).toFixed(0)}}%</span></div><div v-if="gameResult.robust.sensitivity_warning" class="sensitivity-warn">⚠ {{gameResult.robust.sensitivity_warning}}</div></div>
      </div>
      <div v-if="gameResult?.fallback" class="fallback-msg">⚠ 计算引擎未启动</div>
    </template>

    <!-- COMPARE MODE -->
    <template v-if="mode === 'compare'">
      <div class="game-section">
        <div class="game-role-switch"><label>当前编辑方案</label><div class="role-tabs"><button class="role-tab plan-a" :class="{ active: compareEdit==='A' }" @click="compareEdit='A'">方案 A</button><button class="role-tab plan-b" :class="{ active: compareEdit==='B' }" @click="compareEdit='B'">方案 B</button></div></div>
        <div class="map-hint">地图点击任意位置添加, 再次点击已有候选点撤销</div>
        <div class="candidate-summary"><div class="cand-count plan-a-count"><span class="cand-dot plan-a-dot"></span> 方案A {{planACandidates.length}}</div><div class="cand-count plan-b-count"><span class="cand-dot plan-b-dot"></span> 方案B {{planBCandidates.length}}</div></div>
        <div class="game-row"><div class="game-col"><label class="game-label">竞品开店数</label><input type="number" v-model.number="gameFollowerQ" min="0" max="20" class="game-input" /></div><div class="game-col"><label class="game-label">竞品候选</label><div class="game-count">{{gameFollowerCandidates.length}}个(博弈模式选择)</div></div></div>
        <button class="btn btn-primary btn-block" @click="runCompare" :disabled="compareLoading||planACandidates.length<1||planBCandidates.length<1">{{compareLoading?'对比中...':'开始对比'}}</button>
      </div>
      <div v-if="compareResult&&!compareResult.fallback" class="result-section compare-result">
        <div class="compare-table">
          <div class="compare-header"><span>指标</span><span>方案A</span><span>方案B</span><span>差异</span></div>
          <div class="compare-row"><span>预期月营收</span><span>{{formatRevenue(compareResult.plan_a?.leader_revenue)}}</span><span>{{formatRevenue(compareResult.plan_b?.leader_revenue)}}</span><span :class="diffClass(compareResult.plan_a?.leader_revenue,compareResult.plan_b?.leader_revenue)">{{revenueDiff()}}</span></div>
          <div class="compare-row"><span>竞品蚕食率</span><span>{{compareResult.plan_a?.cannibalization_pct}}%</span><span>{{compareResult.plan_b?.cannibalization_pct}}%</span><span :class="diffClass(compareResult.plan_b?.cannibalization_pct,compareResult.plan_a?.cannibalization_pct)">{{cannDiff()}}</span></div>
          <div class="compare-row"><span>覆盖人口</span><span>{{formatPop(compareResult.plan_a?.coverage_population)}}</span><span>{{formatPop(compareResult.plan_b?.coverage_population)}}</span><span :class="diffClass(compareResult.plan_a?.coverage_population,compareResult.plan_b?.coverage_population)">{{popDiff()}}</span></div>
        </div>
        <div class="recommendation" v-if="compareResult.recommendation"><div class="rec-badge" :class="compareResult.recommendation.winner==='plan_a'?'rec-a':'rec-b'">推荐 {{compareResult.recommendation.winner==='plan_a'?'方案A':'方案B'}}</div><p class="rec-reason">{{compareResult.recommendation.reason}}</p></div>
      </div>
    </template>

    <div class="site-legend" v-if="mode!=='scorecard'">
      <span class="legend-item"><span class="leg-dot" style="background:#007AFF"></span> 我方</span>
      <span class="legend-item"><span class="leg-dot" style="background:#FF3B30"></span> 竞品</span>
      <span v-if="mode==='game'" class="legend-item"><span class="leg-dot" style="background:#999"></span> 待选</span>
      <span v-if="mode==='compare'" class="legend-item"><span class="leg-dot" style="background:#34C759"></span> A</span>
      <span v-if="mode==='compare'" class="legend-item"><span class="leg-dot" style="background:#FF9500"></span> B</span>
    </div>

    <TaskProgress v-if="task" :task="task" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue'
import { getSiteOptimization, solveGame, compareGamePlans, getHuffParams } from '@/api'
import IndustrySelector from '@/components/shared/IndustrySelector.vue'
import { useIndustryStore } from '@/stores/industry'
import { useProjectStore } from '@/stores/project'
import TaskProgress from '@/components/shared/TaskProgress.vue'
import type { SiteOptimizationResult, TaskInfo, GameSolveResponse, GameCompareResponse, HuffParams, GameCandidate, SpatialPoint } from '@/types'

interface CandidatePoint extends GameCandidate { name?: string }

const props = defineProps<{ projectId: string; clickedCandidate?: { lng: number; lat: number } | null }>()
const emit = defineEmits<{ result: [data: any]; markersUpdate: [groups: { groupId: string; points: { lng: number; lat: number; name?: string; label?: string; color?: string }[] }[]] }>()

const industryStore = useIndustryStore()
const projectStore = useProjectStore()
industryStore.fetchIndustries()

const mode = ref<'scorecard' | 'game' | 'compare'>('game')
const industry = ref('')
const task = ref<TaskInfo | null>(null)
const weights = reactive({ distanceWeight: 0.4, blindSpotWeight: 0.35, densityWeight: 0.25 })
const candidatesText = ref('')
const result = ref<SiteOptimizationResult | null>(null)

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

const compareEdit = ref<'A' | 'B'>('A')
const planACandidates = ref<CandidatePoint[]>([])
const planBCandidates = ref<CandidatePoint[]>([])
const compareResult = ref<GameCompareResponse | null>(null)
const compareLoading = ref(false)

const importedPoints = computed(() => projectStore.validPoints)
const uniqueIndustries = computed(() => {
  const inds = new Set<string>()
  for (const p of importedPoints.value) { const ind = p.metadata?.industry as string; if (ind) inds.add(ind) }
  return Array.from(inds).sort()
})
function industryCount(ind: string): number { return importedPoints.value.filter(p => p.metadata?.industry === ind).length }
const filteredPoolPoints = computed(() => {
  const followerIds = new Set(gameFollowerCandidates.value.map(c => c.id))
  return importedPoints.value.filter(p => { if (followerIds.has(p.id)) return false; if (competitorFilter.value && p.metadata?.industry !== competitorFilter.value) return false; return true })
})

function switchMode(newMode: string) { mode.value = newMode as any; task.value = null; emitMarkers() }

watch(() => props.clickedCandidate, (pt) => {
  if (!pt) return
  if (mode.value === 'scorecard') {
    const idx = candidatesText.value.split('\n').filter(l => l.trim()).length + 1
    const line = 'P' + idx + ',' + pt.lng.toFixed(6) + ',' + pt.lat.toFixed(6)
    candidatesText.value = candidatesText.value.trim() ? candidatesText.value + '\n' + line : line
  } else if (mode.value === 'game') {
    if (addingFor.value === 'leader') {
      const id = 'L' + Date.now()
      gameLeaderCandidates.value.push({ id, lng: pt.lng, lat: pt.lat, area: 100, brand: 0.5, name: id })
    } else { handleFollowerClick(pt) }
  } else if (mode.value === 'compare') {
    const id = (compareEdit.value === 'A' ? 'A' : 'B') + Date.now()
    const cand: CandidatePoint = { id, lng: pt.lng, lat: pt.lat, area: 100, brand: 0.5, name: id }
    if (compareEdit.value === 'A') planACandidates.value.push(cand); else planBCandidates.value.push(cand)
  }
  emitMarkers()
})

function handleFollowerClick(pt: { lng: number; lat: number }) {
  const TOL = 80; let best: CandidatePoint | null = null; let minD = Infinity
  for (const p of filteredPoolPoints.value) {
    const d = haversineM(pt.lat, pt.lng, p.lat, p.lng)
    if (d < TOL && d < minD) { minD = d; best = { id: p.id, lng: p.lng, lat: p.lat, area: 100, brand: 0.5, name: p.name || p.id } }
  }
  if (best) { const idx = gameFollowerCandidates.value.findIndex(c => c.id === best!.id); if (idx >= 0) gameFollowerCandidates.value.splice(idx, 1); else gameFollowerCandidates.value.push(best) }
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; const dLat = (lat2 - lat1) * Math.PI / 180; const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function emitMarkers() {
  const groups: { groupId: string; points: { lng: number; lat: number; name?: string; label?: string; color?: string }[] }[] = []
  if (mode.value === 'game') groups.push({ groupId: 'pool', points: filteredPoolPoints.value.map(p => ({ lng: p.lng, lat: p.lat, name: p.name||p.id, color: '#999999' })) })
  if (gameLeaderCandidates.value.length) groups.push({ groupId: 'leader', points: gameLeaderCandidates.value.map((c,i) => ({ lng: c.lng, lat: c.lat, name: c.name||c.id, label: 'L'+(i+1), color: '#007AFF' })) })
  if (gameFollowerCandidates.value.length) groups.push({ groupId: 'follower', points: gameFollowerCandidates.value.map((c,i) => ({ lng: c.lng, lat: c.lat, name: c.name||c.id, label: 'F'+(i+1), color: '#FF3B30' })) })
  if (mode.value === 'scorecard' && candidatesText.value.trim()) { const cs = parseCandidatesText(); groups.push({ groupId: 'scorecard', points: cs.map((c,i) => ({ lng: c.lng, lat: c.lat, name: c.name, label: ''+(i+1), color: '#007AFF' })) }) }
  if (planACandidates.value.length) groups.push({ groupId: 'planA', points: planACandidates.value.map((c,i) => ({ lng: c.lng, lat: c.lat, name: c.name||c.id, label: 'A'+(i+1), color: '#34C759' })) })
  if (planBCandidates.value.length) groups.push({ groupId: 'planB', points: planBCandidates.value.map((c,i) => ({ lng: c.lng, lat: c.lat, name: c.name||c.id, label: 'B'+(i+1), color: '#FF9500' })) })
  emit('markersUpdate', groups)
}

watch([gameLeaderCandidates, gameFollowerCandidates, filteredPoolPoints, planACandidates, planBCandidates, candidatesText, mode], () => emitMarkers(), { deep: true })

function parseCandidatesText(): { name: string; lng: number; lat: number }[] {
  return candidatesText.value.split('\n').filter(l => l.trim()).map((line,i) => { const p = line.split(',').map(x => x.trim()); return { name: p[0]||('P'+(i+1)), lng: parseFloat(p[1]), lat: parseFloat(p[2]) } }).filter(c => !isNaN(c.lng) && !isNaN(c.lat))
}

function scoreClass(s: number) { if (s >= 3) return 'score-high'; if (s >= 2) return 'score-mid'; return 'score-low' }

async function runScorecard() {
  const cs = parseCandidatesText()
  if (!cs.length) { task.value = { taskId: '', status: 'failed', error: '请至少输入一个有效候选位置' }; return }
  task.value = { taskId: '', status: 'running' }
  try { const data = await getSiteOptimization(props.projectId, cs, { ...weights }, 5, industry.value); result.value = data; task.value = { taskId: '', status: 'completed', result: data }; emit('result', data) }
  catch (e: any) { task.value = { taskId: '', status: 'failed', error: e?.response?.data?.error || e.message } }
}

const huffSourceLabel = computed(() => { const s = huffParams.value?.source; if (s==='mle') return 'MLE拟合'; if (s==='cached_mle') return '拟合(缓存)'; if (s==='benchmark') return '行业基准'; return '默认值' })

async function loadHuffParams() { huffLoading.value = true; try { huffParams.value = await getHuffParams(props.projectId, industry.value||undefined) } catch {} finally { huffLoading.value = false } }
onMounted(() => { loadHuffParams() })

function onIndustryChange() {
  if (!industry.value) return
  const cfg = industryStore.getIndustry(industry.value)
  if (cfg?.kpiWeights) { const kw = cfg.kpiWeights as Record<string,number>; weights.distanceWeight = kw.walkableRatio||kw.footTraffic||kw.populationDensity||0.4; weights.blindSpotWeight = kw.competitorAvoidance||kw.competitionSweetSpot||kw.competitorDistance||0.35; weights.densityWeight = kw.poiDensity||kw.deliveryCoverage||kw.commercialDensity||0.25 }
  loadHuffParams()
}

async function runGameSolve() {
  if (!gameLeaderCandidates.value.length) { task.value = { taskId:'', status:'failed', error:'请至少选择1个我方候选点' }; return }
  gameLoading.value = true; gameResult.value = null
  try {
    const data = await solveGame(props.projectId, gameLeaderCandidates.value.map(c=>({id:c.id,lng:c.lng,lat:c.lat,area:c.area,brand:c.brand})), gameFollowerCandidates.value.map(c=>({id:c.id,lng:c.lng,lat:c.lat,area:c.area,brand:c.brand})), gameLeaderP.value, gameFollowerQ.value, industry.value||undefined, 200)
    gameResult.value = data; emit('result', data)
    const rg: { groupId: string; points: { lng: number; lat: number; name?: string; label?: string; color?: string }[] }[] = []
    if (data.leader_sites) { const pts = gameLeaderCandidates.value.filter(c=>data.leader_sites.includes(c.id)); if (pts.length) rg.push({groupId:'result-leader',points:pts.map((c,i)=>({lng:c.lng,lat:c.lat,name:c.id,label:'SOL_'+c.id,color:'#34C759'}))}) }
    if (data.follower_sites) { const pts = gameFollowerCandidates.value.filter(c=>data.follower_sites.includes(c.id)); if (pts.length) rg.push({groupId:'result-follower',points:pts.map((c,i)=>({lng:c.lng,lat:c.lat,name:c.id,label:'ATK_'+c.id,color:'#FF3B30'}))}) }
    if (rg.length) emit('markersUpdate', rg)
  } catch (e: any) { task.value = { taskId:'', status:'failed', error:e.message } }
  finally { gameLoading.value = false }
}

async function runCompare() {
  if (!planACandidates.value.length || !planBCandidates.value.length) { task.value = { taskId:'', status:'failed', error:'请为方案A和B至少选择1个候选点' }; return }
  compareLoading.value = true; compareResult.value = null
  try {
    const aIds = planACandidates.value.map(c=>c.id); const bIds = planBCandidates.value.map(c=>c.id)
    const all = [...planACandidates.value, ...planBCandidates.value]
    const data = await compareGamePlans(props.projectId, all.map(c=>({id:c.id,lng:c.lng,lat:c.lat,area:c.area,brand:c.brand})), gameFollowerCandidates.value.map(c=>({id:c.id,lng:c.lng,lat:c.lat,area:c.area,brand:c.brand})), aIds, bIds, gameFollowerQ.value, industry.value||undefined)
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
function diffClass(a: number|undefined, b: number|undefined) { if (a==null||b==null) return ''; return a>=b?'diff-positive':'diff-negative' }
function revenueDiff() { const a=compareResult.value?.plan_a?.leader_revenue; const b=compareResult.value?.plan_b?.leader_revenue; if (a==null||b==null||b===0) return '--'; return ((a-b)/b*100).toFixed(1)+'%' }
function cannDiff() { const a=compareResult.value?.plan_a?.cannibalization_pct; const b=compareResult.value?.plan_b?.cannibalization_pct; if (a==null||b==null) return '--'; return (a-b).toFixed(1)+'pp' }
function popDiff() { const a=compareResult.value?.plan_a?.coverage_population; const b=compareResult.value?.plan_b?.coverage_population; if (a==null||b==null||b===0) return '--'; return ((a-b)/b*100).toFixed(1)+'%' }
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
