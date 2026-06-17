import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import apiClient from '@/api/client'
import type { SystemConfig } from '@/types'

export const useConfigStore = defineStore('config', () => {
  const subscriptionMode = ref<'tiered' | 'full_access'>('tiered')
  const loaded = ref(false)

  const isFullAccessMode = computed(() => subscriptionMode.value === 'full_access')

  async function fetchConfig() {
    try {
      const { data } = await apiClient.get('/system/config')
      subscriptionMode.value = (data as SystemConfig).subscriptionMode || 'tiered'
    } catch {
      subscriptionMode.value = 'tiered'
    } finally {
      loaded.value = true
    }
  }

  return { subscriptionMode, loaded, isFullAccessMode, fetchConfig }
})
