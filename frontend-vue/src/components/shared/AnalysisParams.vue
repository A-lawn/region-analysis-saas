<template>
  <div class="analysis-params">
    <div v-for="param in params" :key="param.key" class="param-group">
      <label>{{ param.label }}</label>
      <template v-if="param.type === 'range'">
        <div class="range-row">
          <input
            type="range"
            :min="param.min"
            :max="param.max"
            :step="param.step"
            :value="(values as any)[param.key]"
            class="range-input"
            @input="onRangeChange(param.key, $event)"
          />
          <span class="param-hint">{{ (values as any)[param.key] }}{{ param.unit || '' }}</span>
        </div>
      </template>
      <template v-else-if="param.type === 'number'">
        <input
          type="number"
          :min="param.min"
          :max="param.max"
          :value="(values as any)[param.key]"
          class="number-input"
          @input="onNumberChange(param.key, $event)"
        />
      </template>
    </div>
    <button class="btn btn-primary btn-block analysis-run" @click="emit('run')">
      {{ runLabel || '运行分析' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'

export interface AnalysisParam {
  key: string
  label: string
  type: 'range' | 'number'
  min: number
  max: number
  step: number
  default: number
  unit?: string
}

const props = defineProps<{
  params: AnalysisParam[]
  runLabel?: string
}>()

const emit = defineEmits<{
  update: [values: any]
  run: []
}>()

const values = reactive<Record<string, number>>({})

watch(
  () => props.params,
  (p) => {
    for (const param of p) {
      if (!(param.key in values)) {
        values[param.key] = param.default
      }
    }
  },
  { immediate: true }
)

function onRangeChange(key: string, e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  ;(values as any)[key] = val
  emit('update', { ...values })
}

function onNumberChange(key: string, e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  ;(values as any)[key] = val
  emit('update', { ...values })
}
</script>

<style scoped>
.analysis-params {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.param-group label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
}

.range-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.range-input {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  outline: none;
}

.range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-accent);
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  transition: transform var(--duration-fast) var(--ease-spring);
}

.range-input::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.number-input {
  width: 100%;
  padding: 6px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-family: var(--font-system);
  color: var(--color-text-primary);
  background: var(--color-bg-card-solid);
  outline: none;
  transition:
    border-color var(--duration-normal) var(--ease-smooth),
    box-shadow var(--duration-normal) var(--ease-smooth);
}

.number-input:focus {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-focus-ring);
}

.param-hint {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.analysis-run {
  margin-top: var(--space-2);
}
</style>
