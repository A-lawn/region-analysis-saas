<template>
  <div class="panel">
    <h4 class="panel-title">选址优化</h4>

    <div class="param-group">
      <label>行业模型</label>
      <IndustrySelector v-model="industry" @change="onIndustryChange" />
    </div>
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
      <label>候选位置 (name,lng,lat 每行一个)</label>
      <div class="map-hint">提示：在选址模式下，直接点击地图即可自动添加候选坐标</div>
      <textarea v-model="candidatesText" rows="4" placeholder="A,116.40,39.91&#10;B,116.42,39.92"></textarea>
      <button type="button" class="btn btn-sm" style="margin-top: var(--space-1); color: var(--color-error)" @click="clearCandidates">清除所有候选</button>
    </div>

    <button class="btn btn-primary btn-block" @click="runAnalysis">评估选址</button>

    <TaskProgress v-if="task" :task="task" />

    <div v-if="result" class="result-section">
      <div
        v-for="(c, i) in result.candidates"
        :key="c.name"
        class="site-row"
        :class="{ top: i === 0 }"
      >
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
            <span v-if="c.dimensions.competitors500m > 0">
              ，竞争者 {{ c.dimensions.competitors500m }} 家(500m内)
            </span>
          </div>
          <div class="site-advice" v-if="c.advice && c.advice.length">
            <span v-for="a in c.advice.slice(0, 2)" :key="a.message" class="advice-tag" :class="a.priority">{{ a.message }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { getSiteOptimization } from '@/api'
import IndustrySelector from '@/components/shared/IndustrySelector.vue'
import { useIndustryStore } from '@/stores/industry'
import TaskProgress from '@/components/shared/TaskProgress.vue'
import type { SiteOptimizationResult, TaskInfo } from '@/types'
import axios from 'axios'

industryStore.fetchIndustries()

const props = defineProps<{
  projectId: string
  clickedCandidate?: { lng: number; lat: number } | null
}>()

const emit = defineEmits<{
  result: [data: SiteOptimizationResult]
}>()


const industryStore = useIndustryStore()

function onIndustryChange() {
  if (!industry.value) return
  const cfg = industryStore.getIndustry(industry.value)
  if (cfg && cfg.kpiWeights) {
    // Auto-fill weights from industry KPI config
    // Map common KPI names to our 3-dimensional weight system
    const kw = cfg.kpiWeights as Record<string, number>
    weights.distanceWeight = kw.walkableRatio || kw.footTraffic || kw.populationDensity || 0.4
    weights.blindSpotWeight = kw.competitorAvoidance || kw.competitionSweetSpot || kw.competitorDistance || 0.35
    weights.densityWeight = kw.poiDensity || kw.deliveryCoverage || kw.commercialDensity || 0.25
  }
}

const weights = reactive({ distanceWeight: 0.4, blindSpotWeight: 0.35, densityWeight: 0.25 })
const industry = ref('')
const candidatesText = ref('')
const result = ref<SiteOptimizationResult | null>(null)
const task = ref<TaskInfo | null>(null)

function clearCandidates() {
  candidatesText.value = ''
}

function scoreClass(score: number): string {
  if (score >= 70) return 'score-high'
  if (score >= 40) return 'score-mid'
  return 'score-low'
}

let clickCounter = 0
watch(() => props.clickedCandidate, async (pt) => {
  if (!pt) return
  clickCounter++
  try {
    const { data } = await axios.post('/api/web/reverse-geocode', { lng: pt.lng, lat: pt.lat })
    const name = data.address || ('点' + clickCounter)
    const line = name + ',' + pt.lng.toFixed(6) + ',' + pt.lat.toFixed(6)
    candidatesText.value = candidatesText.value ? candidatesText.value + '\n' + line : line
  } catch {
    const line = '点' + clickCounter + ',' + pt.lng.toFixed(6) + ',' + pt.lat.toFixed(6)
    candidatesText.value = candidatesText.value ? candidatesText.value + '\n' + line : line
  }
})

async function runAnalysis() {
  const lines = candidatesText.value.trim().split('\n').filter(Boolean)
  const candidates = lines
    .map((line) => {
      const parts = line.split(',')
      return { name: (parts[0] || '').trim() || 'P', lng: parseFloat(parts[1]), lat: parseFloat(parts[2]) }
    })
    .filter((c) => !isNaN(c.lng) && !isNaN(c.lat))

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
    task.value = { taskId: '', status: 'failed', error: e.message }
  }
}
</script>

<style scoped>
.panel {
  padding: 0;
}

.panel-title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.param-group {
  margin-bottom: var(--space-2);
}

.param-group label {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-1);
}

.param-group input[type='range'] {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  outline: none;
}

.param-group input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-accent);
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}

.param-group textarea {
  width: 100%;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  resize: vertical;
  background: var(--color-bg-card-solid);
  color: var(--color-text-primary);
}

.param-hint {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.btn-block {
  width: 100%;
  margin-top: var(--space-2);
}

.result-section {
  margin-top: var(--space-3);
}

.site-row {
  display: flex;
  align-items: flex-start;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  gap: var(--space-3);
}

.site-row.top {
  background: var(--color-success-bg);
  border-radius: var(--radius-sm);
}

.site-rank {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-bg-input);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  flex-shrink: 0;
}

.site-row.top .site-rank {
  background: var(--color-success);
  color: #fff;
}

.site-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.site-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.site-name {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}

.site-score {
  font-weight: var(--font-bold);
  color: var(--color-accent);
  font-size: var(--text-base);
}

.site-dims {
  display: flex;
  gap: var(--space-1);
  font-size: var(--text-xs);
  flex-wrap: wrap;
}

.dim-item {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}

.dim-item.score-high {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.dim-item.score-mid {
  background: var(--color-warning-bg);
  color: var(--color-text-primary);
}

.dim-item.score-low {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.site-summary {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.site-advice {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.advice-tag {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: var(--text-xs);
  background: var(--color-bg-input);
  color: var(--color-text-secondary);
}

.advice-tag.high {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.advice-tag.medium {
  background: var(--color-warning-bg);
  color: var(--color-text-primary);
}

.advice-tag.low {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.map-hint {
  background: var(--color-accent-subtle);
  border: 1px solid var(--color-border-focus);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-accent);
  margin-bottom: var(--space-1);
}

.industry-select {
  width: 100%;
  padding: 6px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-family: var(--font-system);
  background: var(--color-bg-card-solid);
  color: var(--color-text-primary);
}
</style>

