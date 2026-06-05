<template>
  <div class="analysis-params">
    <div v-for="param in params" :key="param.key" class="param-group">
      <label>{{ param.label }}</label>
      <template v-if="param.type === 'range'">
        <input
          type="range"
          :min="param.min"
          :max="param.max"
          :step="param.step"
          :value="(values as any)[param.key]"
          @input="onRangeChange(param.key, $event)"
        />
        <span class="param-hint">{{ (values as any)[param.key] }}{{ param.unit }}</span>
      </template>
      <template v-else-if="param.type === 'number'">
        <input
          type="number"
          :min="param.min"
          :max="param.max"
          :value="(values as any)[param.key]"
          @input="onNumberChange(param.key, $event)"
        />
      </template>
    </div>
    <button class="btn btn-primary btn-block" @click="emit('run')">
      {{ runLabel }}
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
  gap: 12px;
}
.param-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.param-group label {
  font-size: 13px;
  font-weight: 500;
  color: #555;
}
.param-group input[type='range'] {
  width: 100%;
}
.param-group input[type='number'] {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
}
.param-hint {
  font-size: 12px;
  color: #999;
  text-align: right;
}
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}
.btn-primary {
  background: #1677ff;
  color: #fff;
}
.btn-primary:hover {
  background: #4096ff;
}
.btn-block {
  width: 100%;
}
</style>