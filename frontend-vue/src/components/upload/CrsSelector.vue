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
  gap: var(--space-3);
  flex-wrap: wrap;
}

.crs-option {
  cursor: pointer;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  transition:
    border-color var(--duration-normal) var(--ease-smooth),
    background var(--duration-normal) var(--ease-smooth);
  flex: 1;
  min-width: 140px;
}

.crs-option input {
  display: none;
}

.crs-option.active {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
}

.crs-card strong {
  display: block;
  font-size: var(--text-base);
  margin-bottom: var(--space-1);
}

.crs-card small {
  color: var(--color-text-tertiary);
  font-size: var(--text-xs);
}
</style>
