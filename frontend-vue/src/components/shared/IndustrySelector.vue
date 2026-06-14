<template>
  <div class="industry-selector">
    <label class="selector-label" v-if="showLabel">行业类型</label>
    <div class="selector-row">
      <select
        v-model="selectedIndustry"
        class="form-select"
        :disabled="loading"
        @change="onChange"
      >
        <option value="">全部行业（不分行业）</option>
        <option
          v-for="ind in store.industryList"
          :key="ind.industry"
          :value="ind.industry"
        >
          {{ ind.label }}（{{ ind.radiusMeters }}m 服务半径）
        </option>
      </select>
      <span class="loading-indicator" v-if="loading">加载中...</span>
    </div>
    <div class="industry-meta" v-if="selectedIndustry && currentConfig">
      <span class="meta-badge" v-for="(w, k) in currentConfig.kpiWeights" :key="k">
        {{ store.kpiDisplayNames[k] || k }}: {{ (w * 100).toFixed(0) }}%
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useIndustryStore } from '@/stores/industry'

const props = defineProps<{
  modelValue?: string
  showLabel?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', industry: string): void
}>()

const store = useIndustryStore()
const selectedIndustry = ref(props.modelValue || '')

const loading = computed(() => store.loading)

const currentConfig = computed(() => {
  if (!selectedIndustry.value) return null
  return store.getIndustry(selectedIndustry.value)
})

onMounted(() => {
  store.fetchIndustries()
})

watch(() => props.modelValue, (val) => {
  if (val !== undefined) selectedIndustry.value = val
})

watch(selectedIndustry, (val) => {
  emit('update:modelValue', val)
})

function onChange() {
  emit('change', selectedIndustry.value)
}
</script>

<style scoped>
.industry-selector {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.selector-label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
  letter-spacing: -0.01em;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.form-select {
  width: 100%;
  padding: 8px 10px;
  padding-right: 28px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: var(--text-sm);
  font-family: var(--font-system);
  font-weight: var(--font-regular);
  color: var(--color-text-primary);
  background: var(--color-bg-card-solid);
  appearance: none;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.form-select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-subtle);
}

.form-select:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.loading-indicator {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.industry-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.meta-badge {
  font-size: 10px;
  padding: 3px 8px;
  background: var(--color-bg-input);
  border-radius: 6px;
  color: var(--color-text-secondary);
  font-weight: var(--font-medium);
  letter-spacing: -0.01em;
}
</style>
