<template>
  <div class="panel">
    <h4 class="panel-title">聚类分析</h4>
    <AnalysisParams
      :params="params"
      run-label="运行聚类"
      @update="onUpdate"
      @run="runAnalysis"
    />
    <TaskProgress v-if="task" :task="task" />
    <div v-if="result" class="result-section">
      <div class="result-stat">
        <span class="stat-label">聚类数</span>
        <span class="stat-value">{{ result.clusters.length }}</span>
      </div>
      <div class="result-stat">
        <span class="stat-label">噪声点</span>
        <span class="stat-value">{{ result.noise }}</span>
      </div>
      <div v-for="c in result.clusters" :key="c.clusterId" class="result-stat">
        <span class="stat-label">聚类 {{ c.clusterId }}</span>
        <span class="stat-value">{{ c.pointCount }} 点</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getClusters } from '@/api'
import AnalysisParams, { type AnalysisParam } from '@/components/shared/AnalysisParams.vue'
import TaskProgress from '@/components/shared/TaskProgress.vue'
import type { ClusterResult, TaskInfo } from '@/types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  result: [data: ClusterResult]
}>()

const params: AnalysisParam[] = [
  { key: 'eps', label: 'eps (m)', type: 'range', min: 100, max: 5000, step: 100, default: 500, unit: 'm' },
  { key: 'minPoints', label: 'minPts', type: 'number', min: 2, max: 20, step: 1, default: 3 },
]

const values = ref<any>({ eps: 500, minPoints: 3 })
const result = ref<ClusterResult | null>(null)
const task = ref<TaskInfo | null>(null)

function onUpdate(v: Record<string, number>) {
  values.value = v
}

async function runAnalysis() {
  task.value = { taskId: '', status: 'running' }
  try {
    const data = await getClusters(props.projectId, values.value.eps, values.value.minPoints)
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
