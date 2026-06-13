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
      <!-- 1. 项目概览 -->
      <section class="report-section">
        <h3>1. 项目概览</h3>
        <table class="info-table">
          <tr><td>项目名称</td><td>{{ report.summary?.name }}</td></tr>
          <tr><td>生成时间</td><td>{{ fmtDate }}</td></tr>
          <tr><td>数据点数</td><td>{{ report.summary?.stats?.pointCount }}</td></tr>
          <tr><td>覆盖面积</td><td>{{ fmtArea }} km²</td></tr>
          <tr><td>平均邻近距离</td><td>{{ report.summary?.stats?.avgNeighborDistM }} m</td></tr>
          <tr><td>点密度</td><td>{{ fmtDensity }} 点/km²</td></tr>
          <tr v-if="report.industryInfo"><td>行业模型</td><td>{{ report.industryInfo.displayName || report.industryInfo.industry }}（服务半径 {{ report.industryInfo.serviceRadiusMeters }}m）</td></tr>
        </table>
      </section>

      <!-- 2. 多半径覆盖分析 -->
      <section class="report-section" v-if="report.coverageAnalysis?.radii?.length">
        <h3>2. 覆盖分析（多半径对比）</h3>
        <table class="info-table">
          <thead>
            <tr>
              <th>半径</th><th>覆盖面积(km²)</th><th>有效覆盖率</th><th>重叠率</th><th>盲区比例</th><th>衔接度</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in report.coverageAnalysis.radii" :key="r.radiusMeters">
              <td>{{ (r.radiusMeters / 1000).toFixed(1) }}km</td>
              <td>{{ r.error ? '-' : ((r.coveredAreaSqm || 0) / 1e6).toFixed(2) }}</td>
              <td>{{ r.error ? '-' : (r.effectiveCoverageRatio ?? '-') }}{{ r.effectiveCoverageRatio != null ? '%' : '' }}</td>
              <td :class="overlapClass(r.overlapRatio)">{{ r.error ? '-' : (r.overlapRatio ?? '-') }}{{ r.overlapRatio != null ? '%' : '' }}</td>
              <td :class="gapClass(r.gapRatio)">{{ r.error ? '-' : (r.gapRatio ?? '-') }}{{ r.gapRatio != null ? '%' : '' }}</td>
              <td>{{ r.error ? '-' : (r.connectivity ?? '-') }}{{ r.connectivity != null ? '%' : '' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 3. 决策建议 -->
      <section class="report-section" v-if="report.decisionAdvice?.length">
        <h3>3. 决策建议</h3>
        <div v-for="(adv, i) in report.decisionAdvice" :key="i" class="advice-item" :class="'advice-' + adv.priority">
          <span class="advice-priority">{{ priorityLabel(adv.priority) }}</span>
          {{ adv.message }}
        </div>
      </section>

      <!-- 4. 基准对标 -->
      <section class="report-section" v-if="report.benchmarkComparison && !report.benchmarkComparison.error">
        <h3>4. 行业基准对标</h3>
        <table class="info-table">
          <thead><tr><th>指标</th><th>当前值</th><th>行业中位</th><th>P75</th><th>评级</th></tr></thead>
          <tbody>
            <tr v-for="(bm, key) in report.benchmarkComparison" :key="key">
              <td>{{ kpiDisplayName(key as string) }}</td>
              <td>{{ formatBenchValue(bm) }}</td>
              <td>{{ bm.benchmark?.median ?? '-' }}</td>
              <td>{{ bm.benchmark?.p75 ?? '-' }}</td>
              <td :class="'grade-' + (bm.grade || 'medium')">{{ gradeLabel(bm.grade) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 5. 行业KPI权重 -->
      <section class="report-section" v-if="report.industryInfo?.kpiWeights">
        <h3>5. 权重配置</h3>
        <div class="weight-badges">
          <span class="weight-badge" v-for="(w, k) in report.industryInfo.kpiWeights" :key="k">
            {{ kpiDisplayName(k as string) || k }}: {{ ((w as number) * 100).toFixed(0) }}%
          </span>
        </div>
      </section>

      <!-- 6. 热力图 -->
      <section class="report-section">
        <h3>6. 热力图分析</h3>
        <div v-if="report.heatmap?.error" class="error-msg">{{ report.heatmap.error }}</div>
        <div v-else>
          <p>热力点数: {{ report.heatmap?.points?.length || 0 }}</p>
          <p v-if="report.heatmap?.points?.length">最大强度: {{ report.heatmap.points[0]?.weight || 0 }}</p>
        </div>
      </section>

      <!-- 7. 聚类 -->
      <section class="report-section">
        <h3>7. 聚类分析</h3>
        <div v-if="report.clusters?.error" class="error-msg">{{ report.clusters.error }}</div>
        <div v-else>
          <p>集群数: {{ report.clusters?.clusters?.length || 0 }}, 噪声点: {{ report.clusters?.noise || 0 }}</p>
          <table v-if="report.clusters?.clusters?.length" class="info-table">
            <thead><tr><th>ID</th><th>点数</th><th>中心经度</th><th>中心纬度</th></tr></thead>
            <tbody>
              <tr v-for="c in report.clusters.clusters" :key="c.clusterId">
                <td>{{ c.clusterId }}</td><td>{{ c.pointCount }}</td>
                <td>{{ c.center.lng.toFixed(4) }}</td><td>{{ c.center.lat.toFixed(4) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 8. 选址 -->
      <section v-if="siteData?.candidates?.length" class="report-section">
        <h3>8. 选址优化</h3>
        <table class="info-table">
          <thead><tr><th>排名</th><th>名称</th><th>得分</th><th>竞品500m</th><th>最近距离</th></tr></thead>
          <tbody>
            <tr v-for="(c, i) in siteData.candidates" :key="i">
              <td>{{ i + 1 }}</td><td>{{ c.name }}</td><td>{{ c.score }}</td>
              <td>{{ c.dimensions?.competitors500m || '-' }}</td>
              <td>{{ c.dimensions?.minDistanceMeters || '-' }}m</td>
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
import { useIndustryStore } from '@/stores/industry'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const industryStore = useIndustryStore()
const loading = ref(true)
const error = ref('')
const report = ref<any>(null)
const siteData = ref<any>(null)

const fmtDate = computed(() => report.value?.generatedAt ? new Date(report.value.generatedAt).toLocaleString() : '')
const fmtArea = computed(() => { const v = report.value?.summary?.stats?.areaSqm; return v ? (Number(v) / 1e6).toFixed(2) : '0.00' })
const fmtDensity = computed(() => {
  const s = report.value?.summary?.stats; if (!s?.areaSqm || s.areaSqm <= 0) return '0.00'
  return (Number(s.pointCount || 0) / (Number(s.areaSqm || 1) / 1e6)).toFixed(2)
})

function kpiDisplayName(key: string): string {
  return industryStore.kpiDisplayNames[key] || key
}

function overlapClass(v: number | undefined): string {
  if (v == null) return ''
  if (v > 50) return 'text-danger'
  if (v > 30) return 'text-warning'
  return 'text-ok'
}

function gapClass(v: number | undefined): string {
  if (v == null) return ''
  if (v > 40) return 'text-danger'
  if (v > 25) return 'text-warning'
  return 'text-ok'
}

function priorityLabel(p: string): string {
  return p === 'high' ? '🔴 高优' : p === 'medium' ? '🟡 中优' : '🟢 建议'
}

function gradeLabel(g: string): string {
  return g === 'excellent' ? '优秀' : g === 'good' ? '良好' : g === 'medium' ? '一般' : g === 'poor' ? '较差' : g || '-'
}

function formatBenchValue(bm: any): string {
  if (bm == null) return '-'
  if (typeof bm === 'object' && bm.value != null) return String(bm.value)
  return String(bm)
}

function doPrint() { window.print() }

onMounted(async () => {
  try {
    await industryStore.fetchIndustries()
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
.report-view { max-width: 860px; margin: 0 auto; padding: var(--space-10) var(--space-5); }
.report-header { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-8); flex-wrap: wrap; }
.report-header h2 { flex: 1; margin: 0; font-size: var(--text-xl); font-weight: var(--font-bold); letter-spacing: -0.02em; }
.loading, .error { text-align: center; padding: var(--space-10); color: var(--color-text-secondary); }
.error { color: var(--color-error); }
.report-section {
  background: var(--color-bg-card); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-6);
  margin-bottom: var(--space-4); box-shadow: var(--shadow-card);
}
.report-section h3 { margin: 0 0 var(--space-4); font-size: var(--text-base); font-weight: var(--font-semibold); border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-2); }
.info-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--text-sm); }
.info-table td, .info-table th { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); text-align: left; }
.info-table th { font-size: var(--text-xs); font-weight: var(--font-semibold); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
.info-table td:first-child { color: var(--color-text-secondary); width: 120px; }
.report-section p { font-size: var(--text-sm); color: var(--color-text-secondary); margin: var(--space-1) 0; }

.advice-item { padding: var(--space-2) var(--space-3); margin-bottom: var(--space-2); border-radius: var(--radius-sm); font-size: var(--text-sm); line-height: 1.5; }
.advice-priority { font-weight: var(--font-semibold); margin-right: var(--space-2); }
.advice-high { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.15); }
.advice-medium { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.15); }
.advice-low { background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.12); }

.text-danger { color: #ef4444; font-weight: var(--font-semibold); }
.text-warning { color: #f59e0b; }
.text-ok { color: #22c55e; }
.grade-excellent { color: #22c55e; font-weight: var(--font-semibold); }
.grade-good { color: #3b82f6; }
.grade-medium { color: #6b7280; }
.grade-poor { color: #ef4444; }

.weight-badges { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.weight-badge { font-size: var(--text-xs); padding: var(--space-1) var(--space-2); background: var(--color-accent-subtle); border-radius: var(--radius-sm); color: var(--color-text-primary); }

@media print {
  .no-print { display: none; }
  .report-view { padding: 0; max-width: 100%; }
  .report-section { box-shadow: none; border: 1px solid #ddd; background: #fff; backdrop-filter: none; }
}
</style>
