<template>
  <div class="summary-panel" v-if="summary">
    <div class="summary-item">
      <div class="summary-value">{{ summary.stats.pointCount.toLocaleString() }}</div>
      <div class="summary-label">点位</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">{{ Math.round(summary.stats.avgNeighborDistM) }}<span class="summary-unit">m</span></div>
      <div class="summary-label">平均间距</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">{{ Math.round(summary.stats.areaSqm / 1000000) }}<span class="summary-unit">km²</span></div>
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
  gap: 0;
  padding: var(--space-4) var(--space-4) 0;
}

.summary-item {
  padding: var(--space-3) var(--space-4);
  border-bottom: 0.5px solid var(--color-border);
}

.summary-item:nth-child(odd) {
  border-right: 0.5px solid var(--color-border);
}

.summary-value {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--color-accent);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.summary-unit {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-tertiary);
}

.summary-label {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
