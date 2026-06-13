<template>
  <div class="report-view">
    <div class="report-header no-print">
      <button class="btn-back" @click="router.push({ name: 'dashboard', params: { id: projectId } })">
        <AppIcon name="chevron-left" :size="16" />返回
      </button>
      <h2>分析报告</h2>
      <button class="btn btn-primary btn-sm" @click="doPrint">
        <AppIcon name="printer" :size="14" />打印 / 导出 PDF
      </button>
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
      </section>

      <section v-if="siteData?.candidates?.length" class="report-section">
        <h3>6. 选址优化</h3>
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
import AppIcon from '@/components/shared/AppIcon.vue'
import apiClient from '@/api/client'

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
    const { data } = await apiClient.get('/projects/' + projectId + '/export/report')
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
.report-view {
  max-width: 860px;
  margin: 0 auto;
  padding: var(--space-10) var(--space-5);
}

.report-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-8);
  flex-wrap: wrap;
}

.report-header h2 {
  flex: 1;
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  letter-spacing: -0.02em;
}

.loading,
.error {
  text-align: center;
  padding: var(--space-10);
  color: var(--color-text-secondary);
}

.error {
  color: var(--color-error);
}

.report-section {
  background: var(--color-bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  margin-bottom: var(--space-4);
  box-shadow: var(--shadow-card);
}

.report-section h3 {
  margin: 0 0 var(--space-4);
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--space-2);
}

/* ── Tables ── */
.info-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
}

.info-table td,
.info-table th {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.info-table th {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-table td:first-child,
.info-table th:first-child {
  color: var(--color-text-secondary);
  width: 120px;
}

.report-section p {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: var(--space-1) 0;
}

.report-section code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-accent);
  background: var(--color-accent-subtle);
  padding: 1px 4px;
  border-radius: 3px;
}

@media print {
  .no-print { display: none; }
  .report-view { padding: 0; max-width: 100%; }
  .report-section {
    box-shadow: none;
    border: 1px solid #ddd;
    background: #fff;
    backdrop-filter: none;
  }
}
</style>

