<template>
  <div class="panel">
    <h4 class="panel-title">热力图分析</h4>
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
import { getHeatmap } from '@/api'
import AnalysisParams, { type AnalysisParam } from '@/components/shared/AnalysisParams.vue'
import TaskProgress from '@/components/shared/TaskProgress.vue'
import type { HeatmapPoint, TaskInfo } from '@/types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  result: [data: { points: HeatmapPoint[] }]
}>()

const params: AnalysisParam[] = [
  { key: 'bandwidth', label: '带宽 (m)', type: 'range', min: 200, max: 5000, step: 200, default: 1000, unit: 'm' },
  { key: 'gridSize', label: '网格 (m)', type: 'range', min: 100, max: 2000, step: 100, default: 500, unit: 'm' },
]

const values = ref<any>({ bandwidth: 1000, gridSize: 500 })
const result = ref<{ points: HeatmapPoint[] } | null>(null)
const task = ref<TaskInfo | null>(null)

function onUpdate(v: Record<string, number>) {
  values.value = v
}

async function runAnalysis() {
  task.value = { taskId: '', status: 'running' }
  try {
    const data = await getHeatmap(props.projectId, values.value.bandwidth, values.value.gridSize, props.industry)
    result.value = data
    task.value = { taskId: '', status: 'completed', result: data }
    emit('result', data, values.value.bandwidth)
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

.result-section {
  margin-top: var(--space-3);
}

.result-stat {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.stat-value {
  font-weight: var(--font-semibold);
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
}
</style>
