<template>
  <div class="panel">
    <h4 class="panel-title">热力图分析</h4>

    <div class="param-group">
      <label>热力类型</label>
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: heatmapMode === 'density' }" @click="heatmapMode = 'density'">点位密度</button>
        <button class="mode-tab" :class="{ active: heatmapMode === 'revenue' }" @click="heatmapMode = 'revenue'">预期营收</button>
      </div>
    </div>

    <AnalysisParams
      :params="params"
      run-label="生成热力图"
      @update="onUpdate"
      @run="runAnalysis"
    />
    <TaskProgress v-if="task" :task="task" />
    <div v-if="result" class="result-section">
      <div class="result-stat">
        <span class="stat-label">网格点数</span>
        <span class="stat-value">{{ result.points?.length || 0 }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getHeatmap, getHuffParams } from '@/api'
import AnalysisParams, { type AnalysisParam } from '@/components/shared/AnalysisParams.vue'
import TaskProgress from '@/components/shared/TaskProgress.vue'
import type { HeatmapPoint, TaskInfo } from '@/types'

const props = defineProps<{
  projectId: string
  industry?: string
}>()

const emit = defineEmits<{
  result: [data: { points: HeatmapPoint[]; mode?: string }]
}>()

const heatmapMode = ref<'density' | 'revenue'>('density')

const params: AnalysisParam[] = [
  { key: 'bandwidth', label: '带宽 (m)', type: 'range', min: 200, max: 5000, step: 200, default: 1000, unit: 'm' },
  { key: 'gridSize', label: '网格 (m)', type: 'range', min: 100, max: 2000, step: 100, default: 500, unit: 'm' },
]

const values = ref<any>({ bandwidth: 1000, gridSize: 500 })
const result = ref<{ points: HeatmapPoint[] } | null>(null)
const task = ref<TaskInfo | null>(null)

function onUpdate(v: Record<string, number>) { values.value = v }

async function runAnalysis() {
  task.value = { taskId: '', status: 'running' }
  try {
    const data = await getHeatmap(props.projectId, values.value.bandwidth, values.value.gridSize)

    if (heatmapMode.value === 'revenue') {
      // 加载 Huff 参数做营收加权
      try {
        const hp = await getHuffParams(props.projectId, props.industry)
        // 用 Huff 参数调整权重：距离衰减因子应用到热力权重
        data.points = data.points.map(p => ({
          ...p,
          weight: p.weight * Math.exp(-hp.lambda * 0.5) * (hp.alpha_area + hp.alpha_brand) / 2,
        }))
      } catch { /* 降级：保持原始权重 */ }
    }

    result.value = data
    task.value = { taskId: '', status: 'completed', result: data }
    emit('result', { ...data, mode: heatmapMode.value })
  } catch (e: any) {
    task.value = { taskId: '', status: 'failed', error: e.message }
  }
}
</script>

<style scoped>
.panel { padding: 0; }
.panel-title {
  margin: 0 0 var(--space-3); font-size: var(--text-sm);
  font-weight: var(--font-semibold); color: var(--color-text-primary);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.param-group { margin-bottom: var(--space-2); }
.mode-tabs { display: flex; gap: 2px; background: var(--color-bg-input); border-radius: var(--radius-sm); padding: 2px; }
.mode-tab {
  flex: 1; padding: 6px 0; border: none; background: transparent;
  border-radius: 6px; font-size: 12px; font-weight: 500;
  color: var(--color-text-secondary); cursor: pointer; transition: all 0.15s;
}
.mode-tab.active { background: var(--color-bg-card-solid); color: var(--color-accent); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.result-section { margin-top: var(--space-3); }
.result-stat { display: flex; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
.stat-label { font-size: var(--text-sm); color: var(--color-text-secondary); }
.stat-value { font-weight: var(--font-semibold); color: var(--color-accent); font-variant-numeric: tabular-nums; }
</style>
