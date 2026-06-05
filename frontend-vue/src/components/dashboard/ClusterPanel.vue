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
  padding: 16px;
}
.panel-title {
  margin: 0 0 12px;
  font-size: 15px;
  color: #333;
}
.result-section {
  margin-top: 12px;
}
.result-stat {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.stat-label {
  color: #666;
}
.stat-value {
  font-weight: 600;
  color: #1677ff;
}
</style>
