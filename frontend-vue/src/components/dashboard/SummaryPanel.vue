<template>
  <div class="summary-panel" v-if="summary">
    <div class="summary-item">
      <div class="summary-value">{{ summary.stats.pointCount }}</div>
      <div class="summary-label">点位</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">{{ Math.round(summary.stats.avgNeighborDistM) }}m</div>
      <div class="summary-label">平均间距</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">{{ Math.round(summary.stats.areaSqm / 1000000) }}km²</div>
      <div class="summary-label">覆盖面积</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">{{ summary.sourceCrs.toUpperCase() }}</div>
      <div class="summary-label">坐标系</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ProjectSummary } from '@/types'

defineProps<{
  summary: ProjectSummary | null
}>()
</script>

<style scoped>
.summary-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.summary-item {
  background: #fafafa;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}
.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: #1677ff;
}
.summary-label {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
</style>
