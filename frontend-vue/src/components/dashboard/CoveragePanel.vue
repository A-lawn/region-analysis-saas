<template>
  <div class="panel">
    <h4 class="panel-title">覆盖范围分析</h4>
    <AnalysisParams
      :params="params"
      run-label="运行分析"
      @update="onUpdate"
      @run="runAnalysis"
    />
    <div class="param-group" style="margin-top: var(--space-2)">
      <label class="checkbox-label">
        <input type="checkbox" v-model="multiRadius" />
        多半径对比 (2km / 3km / 5km)
      </label>
    </div>
    <TaskProgress v-if="task" :task="task" />
    <div v-if="result" class="result-section">
      <template v-if="Array.isArray(result)">
        <div v-for="(r, i) in result" :key="i" class="result-stat">
          <span class="stat-label">{{ [2000, 3000, 5000][i] }}m</span>
          <span class="stat-value">{{ r.coverageRatio }}% ({{ ((r.coveredArea || 0) / 1000000).toFixed(2) }} km²)</span>
        </div>
      </template>
      <template v-else>
        <div class="result-stat">
          <span class="stat-label">覆盖面积</span>
          <span class="stat-value">{{ ((result.coveredArea || 0) / 1000000).toFixed(2) }} km²</span>
        </div>
        <div class="result-stat">
          <span class="stat-label">点位集群内覆盖率</span>
          <span class="stat-value">{{ result.coverageRatio || 0 }}%</span>
        </div>
      </template>
      <div class="map-hint">绿色为覆盖范围，红色为点位集群内的服务盲区；多半径时颜色越深代表半径越大</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getCoverage } from '@/api'
import AnalysisParams, { type AnalysisParam } from '@/components/shared/AnalysisParams.vue'
import TaskProgress from '@/components/shared/TaskProgress.vue'
import type { CoverageResult, TaskInfo } from '@/types'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  result: [data: CoverageResult | CoverageResult[]]
}>()

const params: AnalysisParam[] = [
  { key: 'radius', label: '半径 (m)', type: 'range', min: 500, max: 10000, step: 500, default: 3000, unit: 'm' },
]

const values = ref<any>({ radius: 3000 })
const multiRadius = ref(false)
const result = ref<CoverageResult | CoverageResult[] | null>(null)
const task = ref<TaskInfo | null>(null)

function onUpdate(v: Record<string, number>) {
  values.value = v
}

async function runAnalysis() {
  task.value = { taskId: '', status: 'running' }
  try {
    if (multiRadius.value) {
      const radii = [2000, 3000, 5000]
      const results = await Promise.all(radii.map(r => getCoverage(props.projectId, r)))
      result.value = results
      task.value = { taskId: '', status: 'completed', result: results }
      emit('result', results as any)
    } else {
      const data = await getCoverage(props.projectId, values.value.radius)
      result.value = data as CoverageResult
      task.value = { taskId: '', status: 'completed', result: data }
      emit('result', data as CoverageResult)
    }
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
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  cursor: pointer;
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

.map-hint {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-warning-bg);
  border: 1px solid rgba(255, 149, 0, 0.12);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}
</style>
