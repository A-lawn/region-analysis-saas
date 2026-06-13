import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getIndustries } from '@/api'
import type { IndustryConfig, IndustryListItem } from '@/types'

export const useIndustryStore = defineStore('industry', () => {
  const industries = ref<IndustryConfig[]>([])
  const kpiDisplayNames = ref<Record<string, string>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  const industryList = computed<IndustryListItem[]>(() =>
    industries.value.map(i => ({
      industry: i.industry,
      label: i.displayName,
      radiusMeters: i.radiusMeters,
    }))
  )

  async function fetchIndustries() {
    if (industries.value.length > 0) return // already loaded
    loading.value = true
    error.value = null
    try {
      const { models } = await getIndustries()
      industries.value = models
    } catch (e: any) {
      error.value = e.message || '加载行业配置失败'
      console.error('[IndustryStore]', e)
    } finally {
      loading.value = false
    }
  }

  function getIndustry(industry: string): IndustryConfig | undefined {
    return industries.value.find(i => i.industry === industry)
  }

  function getRadiusMeters(industry: string): number {
    return getIndustry(industry)?.radiusMeters || 500
  }

  return {
    industries,
    loading,
    error,
    industryList,
    fetchIndustries,
    getIndustry,
    getRadiusMeters,
  }
})
