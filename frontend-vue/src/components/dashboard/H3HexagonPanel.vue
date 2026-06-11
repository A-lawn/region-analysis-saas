<template>
  <div class="h3-hex-panel">
    <div class="param-row">
      <label>分辨率 (0-15)</label>
      <select v-model.number="resolution" @change="load">
        <option :value="7">7 (~1.2km)</option>
        <option :value="8">8 (~460m)</option>
        <option :value="9" selected>9 (~174m)</option>
        <option :value="10">10 (~65m)</option>
      </select>
    </div>
    <button class="btn btn-primary btn-block" :disabled="loading" @click="load">
      {{ loading ? '加载中...' : '生成等值区域' }}
    </button>
    <div v-if="error" class="error-msg">{{ error }}</div>
    <div v-if="result" class="result-info">
      共 {{ result.hexagons?.length || 0 }} 个六边形区域
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getH3Hexagons } from '@/api'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  result: [data: any]
}>()

const { show } = useToast()
const resolution = ref(9)
const loading = ref(false)
const result = ref<any>(null)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await getH3Hexagons(props.projectId, resolution.value)
    result.value = data
    emit('result', data)
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message
    show(error.value, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.h3-hex-panel {
  padding: 0;
}

.param-row {
  margin-bottom: var(--space-3);
}

.param-row label {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-1);
}

.param-row select {
  width: 100%;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-family: var(--font-system);
  background: var(--color-bg-card-solid);
  color: var(--color-text-primary);
}

.btn-block {
  width: 100%;
}

.error-msg {
  color: var(--color-error);
  font-size: var(--text-sm);
  margin-top: var(--space-2);
  padding: var(--space-1) var(--space-2);
  background: var(--color-error-bg);
  border-radius: var(--radius-sm);
}

.result-info {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
