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
  padding: 12px;
}
.param-row {
  margin-bottom: 12px;
}
.param-row label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
}
.param-row select {
  width: 100%;
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
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
.btn-primary:disabled {
  opacity: 0.6;
}
.btn-block {
  width: 100%;
}
.error-msg {
  color: #ff4d4f;
  font-size: 13px;
  margin-top: 8px;
}
.result-info {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}
</style>