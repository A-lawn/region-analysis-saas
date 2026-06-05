import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getTaskStatus } from '@/api'
import type { TaskInfo } from '@/types'

export const useAnalysisStore = defineStore('analysis', () => {
  const activeTasks = ref<Map<string, TaskInfo>>(new Map())
  const results = ref<Record<string, any>>({})

  // Cache key: type + params hash
  function cacheKey(projectId: string, type: string, params: Record<string, any>): string {
    return `${projectId}:${type}:${JSON.stringify(params)}`
  }

  function getCachedResult(projectId: string, type: string, params: Record<string, any>) {
    return results.value[cacheKey(projectId, type, params)] || null
  }

  function setCachedResult(projectId: string, type: string, params: Record<string, any>, data: any) {
    results.value[cacheKey(projectId, type, params)] = data
  }

  async function pollTask(taskId: string): Promise<TaskInfo> {
    const task = await getTaskStatus(taskId)
    activeTasks.value.set(taskId, task)
    return task
  }

  async function pollUntilComplete(taskId: string, intervalMs = 2000, timeoutMs = 300000): Promise<TaskInfo> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const task = await pollTask(taskId)
      if (task.status === 'completed' || task.status === 'failed') {
        return task
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    throw new Error('任务超时')
  }

  return { activeTasks, results, getCachedResult, setCachedResult, pollTask, pollUntilComplete }
})
