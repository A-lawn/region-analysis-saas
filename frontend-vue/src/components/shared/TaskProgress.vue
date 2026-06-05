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
  padding: 12px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
}
.task-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-dot.queued {
  background: #faad14;
}
.status-dot.running {
  background: #1677ff;
  animation: pulse 1s infinite;
}
.status-dot.completed {
  background: #52c41a;
}
.status-dot.failed {
  background: #ff4d4f;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
.progress-bar {
  margin-top: 8px;
  height: 4px;
  background: #e8e8e8;
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  width: 60%;
  background: #1677ff;
  animation: progress 2s ease-in-out infinite;
  border-radius: 2px;
}
@keyframes progress {
  0% {
    width: 10%;
  }
  50% {
    width: 70%;
  }
  100% {
    width: 10%;
  }
}
.task-error {
  margin-top: 8px;
  color: #ff4d4f;
  font-size: 13px;
  padding: 6px 8px;
  background: #fff2f0;
  border-radius: 4px;
}
</style>
