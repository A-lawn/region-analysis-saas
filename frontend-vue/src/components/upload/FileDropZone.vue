<template>
  <div
    class="drop-zone"
    :class="{ 'drag-over': isDragging }"
    @dragover.prevent="isDragging = true"
    @dragleave="isDragging = false"
    @drop.prevent="onDrop"
    @click="triggerInput"
  >
    <div class="drop-content" v-if="!fileName">
      <span class="drop-icon">📂</span>
      <p>拖拽文件到此处，或点击选择</p>
      <small>支持 .xlsx .xls .csv，最大 50MB</small>
    </div>
    <div class="drop-content" v-else>
      <span class="drop-icon">📄</span>
      <p>{{ fileName }}</p>
      <small>点击可重新选择</small>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept=".xlsx,.xls,.csv"
      hidden
      @change="onInputChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  file: [file: File]
}>()

const fileInput = ref<HTMLInputElement>()
const isDragging = ref(false)
const fileName = ref('')

function triggerInput() {
  fileInput.value?.click()
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file) selectFile(file)
}

function onInputChange() {
  const file = fileInput.value?.files?.[0]
  if (file) selectFile(file)
}

function selectFile(file: File) {
  fileName.value = file.name
  emit('file', file)
}
</script>

<style scoped>
.drop-zone {
  border: 2px dashed #d9d9d9;
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.drop-zone:hover,
.drop-zone.drag-over {
  border-color: #1677ff;
  background: #f0f5ff;
}
.drop-icon {
  font-size: 36px;
}
.drop-content p {
  margin: 12px 0 4px;
  font-size: 16px;
  color: #333;
}
.drop-content small {
  color: #999;
}
</style>
