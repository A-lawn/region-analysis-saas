<template>
  <div class="report-view">
    <div class="report-header no-print">
      <button class="btn btn-back" @click="router.push({ name: 'dashboard', params: { id: projectId } })">返回</button>
      <h2>分析报告</h2>
      <button class="btn btn-primary" @click="doPrint">打印 / 导出 PDF</button>
    </div>

    <div v-if="loading" class="loading">加载报告数据...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="report-content">
      <section class="report-section">
        <h3>1. 项目概览</h3>
        <table class="info-table">
          <tr><td>项目名称</td><td>{{ report.summary?.name }}</td></tr>
          <tr><td>生成时间</td><td>{{ fmtDate }}</td></tr>
          <tr><td>数据点数</td><td>{{ report.summary?.stats?.pointCount }}</td></tr>
          <tr><td>覆盖面积</td><td>{{ fmtArea }} km²</td></tr>
          <tr><td>平均邻近距离</td><td>{{ report.summary?.stats?.avgNeighborDistM }} m</td></tr>
          <tr><td>点密度</td><td>{{ fmtDensity }} 点/km²</td></tr>
        </table>
      </section>

      <section class="report-section">
        <h3>2. 覆盖分析</h3>
        <div v-if="report.coverage?.error" class="error-msg">{{ report.coverage.error }}</div>
        <table v-else class="info-table">
          <tr><td>覆盖率</td><td>{{ report.coverage?.coverageRatio }}%</td></tr>
          <tr><td>覆盖面积</td><td>{{ fmtCovArea }} km²</td></tr>
          <tr><td>未覆盖面积</td><td>{{ fmtUncovArea }} km²</td></tr>
        </table>
      </section>

      <section class="report-section">
        <h3>3. 热力图分析</h3>
        <div v-if="report.heatmap?.error" class="error-msg">{{ report.heatmap.error }}</div>
        <div v-else>
          <p>热力点数: {{ report.heatmap?.points?.length || 0 }}</p>
          <p v-if="report.heatmap?.points?.length">最大强度: {{ report.heatmap.points[0]?.weight || 0 }}</p>
        </div>
      </section>

      <section class="report-section">
        <h3>4. 聚类分析</h3>
        <div v-if="report.clusters?.error" class="error-msg">{{ report.clusters.error }}</div>
        <div v-else>
          <p>集群数: {{ report.clusters?.clusters?.length || 0 }}, 噪声点: {{ report.clusters?.noise || 0 }}</p>
          <table v-if="report.clusters?.clusters?.length" class="info-table">
            <thead><tr><th>ID</th><th>点数</th><th>经度</th><th>纬度</th></tr></thead>
            <tbody>
              <tr v-for="c in report.clusters.clusters" :key="c.clusterId">
                <td>{{ c.clusterId }}</td><td>{{ c.pointCount }}</td>
                <td>{{ c.center.lng.toFixed(4) }}</td><td>{{ c.center.lat.toFixed(4) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

            <section v-if="h3Data?.hexagons?.length" class="report-section">
        <h3>5. 等值区域分析</h3>
        <p>分辨率: {{ h3Data.resolution }}, 六边形数: {{ h3Data.hexagons.length }}</p>
        <table class="info-table">
          <thead><tr><th>六边形索引</th><th>点数</th></tr></thead>
          <tbody>
            <tr v-for="h in h3Data.hexagons.slice(0, 20)" :key="h.h3Index">
              <td><code>{{ h.h3Index }}</code></td><td>{{ h.count }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="h3Data.hexagons.length > 20">... 仅显示前20个六边形</p>
      </section>\n<section v-if="siteData?.candidates?.length" class="report-section">
        <h3>5. 选址优化</h3>
        <table class="info-table">
          <thead><tr><th>排名</th><th>名称</th><th>得分</th></tr></thead>
          <tbody>
            <tr v-for="(c, i) in siteData.candidates" :key="i">
              <td>{{ Number(i) + 1 }}</td><td>{{ c.name }}</td><td>{{ c.score }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const loading = ref(true)
const error = ref('')
const report = ref<any>(null)
const siteData = ref<any>(null)
const h3Data = ref<any>(null)

const fmtDate = computed(() => report.value?.generatedAt ? new Date(report.value.generatedAt).toLocaleString() : '')
const fmtArea = computed(() => { const v = report.value?.summary?.stats?.areaSqm; return v ? (Number(v) / 1e6).toFixed(2) : '0.00' })
const fmtDensity = computed(() => {
  const s = report.value?.summary?.stats; if (!s?.areaSqm || s.areaSqm <= 0) return '0.00'
  return (Number(s.pointCount || 0) / (Number(s.areaSqm || 1) / 1e6)).toFixed(2)
})
const fmtCovArea = computed(() => { const v = report.value?.coverage?.coveredArea; return v ? (Number(v) / 1e6).toFixed(2) : '0.00' })
const fmtUncovArea = computed(() => { const v = report.value?.coverage?.uncoveredArea; return v ? (Number(v) / 1e6).toFixed(2) : '0.00' })

function doPrint() { window.print() }

onMounted(async () => {
  try {
    const { data } = await axios.get('/api/web/projects/' + projectId + '/export/report')
    report.value = data
    try {
      const stored = sessionStorage.getItem('site_data_' + projectId)
      if (stored) siteData.value = JSON.parse(stored)
    } catch {}
  } catch (e: any) {
    error.value = '报告加载失败: ' + (e.response?.data?.error || e.message)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.report-view { max-width: 860px; margin: 0 auto; padding: 40px 20px; }
.report-header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
.report-header h2 { flex: 1; margin: 0; }
.btn { padding: 8px 16px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; cursor: pointer; background: #fff; }
.btn-primary { background: #1677ff; color: #fff; border-color: #1677ff; }
.btn-back { background: none; border: none; color: #1677ff; cursor: pointer; padding: 0; }
.loading, .error { text-align: center; padding: 40px; color: #999; }
.error-msg { color: #ff4d4f; padding: 8px; background: #fff2f0; border-radius: 6px; font-size: 13px; margin-bottom: 8px; }
.report-section { background: #fff; border: 1px solid #e8e8e8; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
.report-section h3 { margin: 0 0 16px; font-size: 16px; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px; }
.info-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.info-table td, .info-table th { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; text-align: left; }
.info-table td:first-child, .info-table th:first-child { color: #666; width: 140px; }
.report-section p { font-size: 13px; color: #333; margin: 4px 0; }
@media print { .no-print { display: none; } .report-view { padding: 0; max-width: 100%; } }
</style>