<template>
  <div class="crs-selector">
    <label
      v-for="opt in options"
      :key="opt.value"
      class="crs-option"
      :class="{ active: modelValue === opt.value }"
    >
      <input
        type="radio"
        :value="opt.value"
        :checked="modelValue === opt.value"
        @change="emit('update:modelValue', opt.value as any)"
      />
      <div class="crs-card">
        <strong>{{ opt.label }}</strong>
        <small>{{ opt.desc }}</small>
      </div>
    </label>
  </div>
</template>

<script setup lang="ts">
import type { CrsType } from '@/types'

defineProps<{
  modelValue: CrsType
}>()

const emit = defineEmits<{
  'update:modelValue': [value: CrsType]
}>()

const options = [
  { value: 'gcj02' as CrsType, label: 'GCJ-02', desc: '国测局坐标（高德地图）' },
  { value: 'wgs84' as CrsType, label: 'WGS-84', desc: 'GPS 原始坐标' },
  { value: 'bd09' as CrsType, label: 'BD-09', desc: '百度地图坐标' },
]
</script>

<style scoped>
.crs-selector {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.crs-option {
  cursor: pointer;
  border: 2px solid #e8e8e8;
  border-radius: 8px;
  padding: 12px 16px;
  transition: border-color 0.2s;
  flex: 1;
  min-width: 140px;
}
.crs-option input {
  display: none;
}
.crs-option.active {
  border-color: #1677ff;
  background: #f0f5ff;
}
.crs-card strong {
  display: block;
  font-size: 16px;
  margin-bottom: 4px;
}
.crs-card small {
  color: #999;
  font-size: 12px;
}
</style>
