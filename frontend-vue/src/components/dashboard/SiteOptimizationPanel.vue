<template>
  <div class="panel">
    <h4 class="panel-title">选址优化</h4>

    <div class="param-group">
      <label>行业模型</label>
      <select v-model="industry" class="industry-select">
        <option value="">自定义权重</option>
        <option value="convenience">便利店</option>
        <option value="restaurant">餐饮</option>
        <option value="pharmacy">药店/诊所</option>
      </select>
    </div>
    <div class="param-group">
      <label>距离权重</label>
      <input type="range" min="0" max="1" step="0.05" v-model.number="weights.distanceWeight" />
      <span class="param-hint">{{ weights.distanceWeight.toFixed(2) }}</span>
    </div>
    <div class="param-group">
      <label>盲区权重</label>
      <input type="range" min="0" max="1" step="0.05" v-model.number="weights.blindSpotWeight" />
      <span class="param-hint">{{ weights.blindSpotWeight.toFixed(2) }}</span>
    </div>
    <div class="param-group">
      <label>密度权重</label>
      <input type="range" min="0" max="1" step="0.05" v-model.number="weights.densityWeight" />
      <span class="param-hint">{{ weights.densityWeight.toFixed(2) }}</span>
    </div>

    <div class="param-group">
      <label>候选位置 (name,lng,lat 每行一个)</label>
      <div class="map-hint">提示：在选址模式下，直接点击地图即可自动添加候选坐标</div>
      <textarea v-model="candidatesText" rows="4" placeholder="A,116.40,39.91&#10;B,116.42,39.92"></textarea>
      <button type="button" class="btn btn-sm btn-clear" @click="clearCandidates">清除所有候选</button>
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
            距最近点 {{ c.dimensions.avgDistanceMeters }}m，周边 {{ c.dimensions.nearbyPoints }} 个点
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
import TaskProgress from '@/components/shared/TaskProgress.vue'
import type { SiteOptimizationResult, TaskInfo } from '@/types'
import axios from 'axios'

const props = defineProps<{
  projectId: string
  clickedCandidate?: { lng: number; lat: number } | null
}>()

const emit = defineEmits<{
  result: [data: SiteOptimizationResult]
}>()

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
.panel { padding: 16px; }
.panel-title { margin: 0 0 12px; font-size: 15px; color: #333; }
.param-group { margin-bottom: 10px; }
.param-group label { display: block; font-size: 13px; font-weight: 500; color: #555; margin-bottom: 4px; }
.param-group input[type='range'] { width: 100%; }
.param-group textarea { width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; resize: vertical; }
.param-hint { font-size: 12px; color: #999; }
.btn { padding: 8px 16px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.btn-primary { background: #1677ff; color: #fff; }
.btn-block { width: 100%; }
.result-section { margin-top: 12px; }
.site-row { display: flex; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; gap: 12px; }
.site-row.top { background: #f6ffed; }
.site-rank { width: 24px; height: 24px; border-radius: 50%; background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
.site-row.top .site-rank { background: #52c41a; color: #fff; }
.site-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.site-header-row { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.site-name { font-size: 14px; }
.site-score { font-weight: 700; color: #1677ff; font-size: 15px; }
.site-dims { display: flex; gap: 8px; font-size: 11px; flex-wrap: wrap; }
.dim-item { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; }
.dim-item.score-high { background: #f6ffed; color: #389e0d; }
.dim-item.score-mid { background: #fffbe6; color: #ad8b00; }
.dim-item.score-low { background: #fff2f0; color: #ff4d4f; }
.site-summary { font-size: 11px; color: #888; }
.site-advice { font-size: 11px; display: flex; gap: 4px; flex-wrap: wrap; }
.advice-tag { padding: 2px 6px; border-radius: 3px; background: #f0f0f0; color: #555; }
.advice-tag.high { background: #fff2f0; color: #cf1322; }
.advice-tag.medium { background: #fffbe6; color: #ad8b00; }
.advice-tag.low { background: #f6ffed; color: #389e0d; }
.map-hint { background: #e6f4ff; border: 1px solid #91caff; border-radius: 4px; padding: 6px 10px; font-size: 12px; color: #0958d9; margin-bottom: 6px; }
.industry-select { width: 100%; padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-clear { margin-top: 6px; background: #fff; border: 1px solid #d9d9d9; border-radius: 4px; cursor: pointer; color: #999; }
.btn-clear:hover { border-color: #ff4d4f; color: #ff4d4f; }
</style>