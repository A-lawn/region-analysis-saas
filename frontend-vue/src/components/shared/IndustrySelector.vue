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
        {{ k }}: {{ (w * 100).toFixed(0) }}%
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
  gap: 4px;
}
.selector-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}
.selector-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.form-select {
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  min-width: 220px;
}
.loading-indicator {
  font-size: 12px;
  color: #94a3b8;
}
.industry-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.meta-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: #f1f5f9;
  border-radius: 4px;
  color: #475569;
}
</style>
