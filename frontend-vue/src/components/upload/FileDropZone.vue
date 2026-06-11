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
      <span class="drop-icon">
        <AppIcon name="upload" :size="32" />
      </span>
      <p>拖拽文件到此处，或点击选择</p>
      <small>支持 .xlsx .xls .csv，最大 50MB</small>
    </div>
    <div class="drop-content" v-else>
      <span class="drop-icon">
        <AppIcon name="doc" :size="32" />
      </span>
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
import AppIcon from '@/components/shared/AppIcon.vue'

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
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-8);
  text-align: center;
  cursor: pointer;
  background: var(--color-bg-card);
  transition:
    transform var(--duration-fast) var(--ease-spring),
    background var(--duration-normal) var(--ease-smooth),
    border-color var(--duration-normal) var(--ease-smooth);
}

.drop-zone:hover {
  border-color: var(--color-accent);
  transform: scale(1.01);
}

.drop-zone.drag-over {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
  transform: scale(1.02);
}

.drop-icon {
  color: var(--color-accent);
  display: block;
  margin-bottom: var(--space-2);
}

.drop-content p {
  margin: var(--space-2) 0 var(--space-1);
  font-size: var(--text-base);
  font-weight: var(--font-medium);
}

.drop-content small {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
}
</style>
