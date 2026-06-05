<template>
  <div class="column-mapper">
    <div v-for="field in fields" :key="field.key" class="mapping-row">
      <span class="mapping-label">
        {{ field.label }}
        <span v-if="field.required" class="required">*</span>
      </span>
      <select
        class="mapping-select"
        :value="modelValue[field.key] ?? ''"
        @change="onChange(field.key, $event)"
      >
        <option value="">-- 不选择 --</option>
        <option
          v-for="(header, i) in headers"
          :key="i"
          :value="i"
          :selected="modelValue[field.key] === i"
        >
          {{ header || '列' + (i + 1) }}
        </option>
      </select>
      <span class="mapping-status" :class="{ detected: modelValue[field.key] !== null }">
        {{ modelValue[field.key] !== null ? '已识别' : '未识别' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: Record<string, number | null>
  headers: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, number | null>]
}>()

const fields = [
  { key: 'nameCol', label: '名称', required: false },
  { key: 'addressCol', label: '地址', required: false },
  { key: 'lngCol', label: '经度', required: true },
  { key: 'latCol', label: '纬度', required: true },
]

function onChange(key: string, event: Event) {
  const val = (event.target as HTMLSelectElement).value
  emit('update:modelValue', {
    ...((arguments[2] as any)?.modelValue || {}),
    [key]: val !== '' ? parseInt(val) : null,
  })
}
</script>

<style scoped>
.column-mapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mapping-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mapping-label {
  width: 60px;
  font-size: 14px;
  font-weight: 500;
}
.required {
  color: #ff4d4f;
}
.mapping-select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
}
.mapping-status {
  width: 60px;
  font-size: 12px;
  color: #999;
}
.mapping-status.detected {
  color: #52c41a;
}
</style>
