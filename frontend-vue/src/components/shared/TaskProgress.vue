<template>
  <div class="task-progress">
    <div class="task-status">
      <span class="status-dot" :class="task.status"></span>
      <span>{{ statusText }}</span>
    </div>
    <div v-if="task.status === 'running'" class="progress-bar">
      <div class="progress-fill"></div>
    </div>
    <div v-if="task.status === 'failed'" class="task-error">
      {{ task.error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TaskInfo } from '@/types'

const props = defineProps<{
  task: TaskInfo
}>()

const statusText = computed(() => {
  switch (props.task.status) {
    case 'queued':
      return '排队中...'
    case 'running':
      return '分析中...'
    case 'completed':
      return '分析完成'
    case 'failed':
      return '分析失败'
    default:
      return '未知'
  }
})
</script>

<style scoped>
.task-progress {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-card);
}

.task-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-primary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.queued {
  background: var(--color-warning);
}

.status-dot.running {
  background: var(--color-accent);
  animation: pulse 1.2s infinite;
}

.status-dot.completed {
  background: var(--color-success);
}

.status-dot.failed {
  background: var(--color-error);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.progress-bar {
  margin-top: var(--space-2);
  height: 4px;
  background: var(--color-border-light);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  width: 60%;
  background: var(--color-accent);
  animation: progress 2s ease-in-out infinite;
  border-radius: var(--radius-full);
}

@keyframes progress {
  0% { width: 10%; }
  50% { width: 70%; }
  100% { width: 10%; }
}

.task-error {
  margin-top: var(--space-2);
  color: var(--color-error);
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-2);
  background: var(--color-error-bg);
  border-radius: var(--radius-sm);
}
</style>
