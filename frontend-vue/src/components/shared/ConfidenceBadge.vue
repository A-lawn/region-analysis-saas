<template>
  <span class="confidence-badge" :class="'conf-' + level" :title="tooltip">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ level: 'high' | 'medium' | 'low' }>()
const label = computed(() => ({ high: '高置信', medium: '中置信', low: '低置信' }[props.level]))
const tooltip = computed(() => ({
  high: '数据覆盖完整，模型拟合良好',
  medium: '部分数据为估算值，建议结合实地考察',
  low: '数据缺口较多，评分仅作参考',
}[props.level]))
</script>

<style scoped>
.confidence-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--text-xs); padding: 1px 8px; border-radius: var(--radius-full);
  font-weight: var(--font-medium);
}
.conf-high { background: var(--color-success-bg); color: var(--color-success); }
.conf-medium { background: var(--color-warning-bg); color: var(--color-warning); }
.conf-low { background: var(--color-error-bg); color: var(--color-error); }
</style>
