<template>
  <div class="panel">
    <h4 class="panel-title">覆盖范围分析</h4>
    <div class="param-group">
      <IndustrySelector v-model="selectedIndustry" @change="onIndustryChange" />
      <div v-if="selectedIndustry" class="preset-hint">
        预设半径 {{ getPresetRadius() }}m · 滑动滑块将切换为自定义
      </div>
    </div>
    <AnalysisParams
      :params="params"
      :model-value="values"
      run-label="运行分析"
      @update="onUpdate"
      @run="runAnalysis"
    />
    <div class="param-group" style="margin-top: var(--space-2)">
      <label class="checkbox-label">
        <input type="checkbox" v-model="multiRadius" />
        多半径对比 (2km / 3km / 5km)
      </label>
    </div>
    <div class="param-group">
      <label class="checkbox-label">
        <input type="checkbox" v-model="decayMode" />
        距离衰减（核心/过渡/边缘三圈层）
      </label>
    </div>
    <div class="param-group">
      <label class="checkbox-label">
        <input type="checkbox" v-model="showWhiteSpace" />
        显示白空间
      </label>
    </div>
    <div class="param-group">
      <label class="checkbox-label">
        <input type="checkbox" v-model="showVoronoi" />
        叠加服务域（泰森多边形）
      </label>
    </div>
    <div class="param-group">
      <div class="param-group-row">
        <label class="checkbox-label">
          <input type="checkbox" v-model="enableClip" />
          自定义分析边界
        </label>
        <span v-if="clipBoundaryName" class="clip-badge">{{ clipBoundaryName }}</span>
      </div>
      <div v-if="enableClip" class="clip-controls">
        <input type="file" accept=".geojson,.json" @change="onClipFileChange" class="clip-file-input" />
        <span class="clip-hint">上传 GeoJSON 文件定义分析边界</span>
      </div>
    </div>
    <div class="param-group">
      <label class="param-group-label">路网等时圈 (OSRM)</label>
      <div class="radio-row">
        <label class="radio-label">
          <input type="radio" v-model="networkMode" value="" />
          不启用
        </label>
        <label class="radio-label">
          <input type="radio" v-model="networkMode" value="walking" />
          步行
        </label>
        <label class="radio-label">
          <input type="radio" v-model="networkMode" value="driving" />
          驾车
        </label>
      </div>
    </div>
    <TaskProgress v-if="task" :task="task" />
    <div v-if="result" class="result-section">
      <template v-if="Array.isArray(result)">
        <div v-if="selectedIndustry && !result[0]?.triangulation?.totalEdges" class="empty-industry-warn">
          ⚠ 当前项目中没有找到"{{ industryLabel(selectedIndustry) }}"行业的门店数据
          <div class="empty-industry-hint">请确认数据导入时 metadata 中已设置 industry 字段，或切换为"自定义半径"进行分析。</div>
        </div>
        <div v-for="(r, i) in result" :key="i" class="multi-radius-card">
          <div class="multi-radius-header">
            <span class="multi-radius-badge">{{ [2000, 3000, 5000][i] / 1000 }}km 半径</span>
            <span class="multi-radius-toggle" @click="toggleRadius(i)">{{ expandedRadii[i] ? '收起' : '展开' }}</span>
          </div>
          <template v-if="expandedRadii[i]">
            <div class="kpi-grid kpi-grid-3col">
              <div class="kpi-card kpi-primary">
                <div class="kpi-value" :class="connectClass(r)">{{ r.triangulation?.coverageConnectivity ?? '-' }}%</div>
                <div class="kpi-label">覆盖衔接度</div>
                <div class="kpi-sub" v-if="r.triangulation?.totalEdges">{{ r.triangulation?.connectedEdges }}/{{ r.triangulation?.totalEdges }} 边已衔接 · 均距 {{ ((r.triangulation?.avgEdgeM ?? 0) / 1000).toFixed(1) }}km</div>
              </div>
              <div class="kpi-card kpi-secondary">
                <div class="kpi-value" :class="overlapClass(r)">{{ r.triangulation?.overlapRatio ?? '-' }}%</div>
                <div class="kpi-label">重叠率</div>
                <div class="kpi-sub">{{ overlapHint(r) }}</div>
              </div>
              <div class="kpi-card kpi-secondary">
                <div class="kpi-value" :class="gapClass(r)">{{ r.triangulation?.gapRatio ?? '-' }}%</div>
                <div class="kpi-label">盲区比例</div>
                <div class="kpi-sub" v-if="r.triangulation?.gappedEdges">{{ r.triangulation?.gappedEdges }} 条边存在缝隙 · 最远 {{ ((r.triangulation?.maxEdgeM ?? 0) / 1000).toFixed(1) }}km</div>
              </div>
            </div>
            <div v-if="r.overlapLayers" class="result-stat">
              <span class="stat-label">覆盖层级</span>
              <span class="stat-value">独家 {{ ((r.overlapLayers.single || 0) / 1000000).toFixed(1) }} · 双重 {{ ((r.overlapLayers.double || 0) / 1000000).toFixed(1) }} · 三重+ {{ ((r.overlapLayers.triplePlus || 0) / 1000000).toFixed(1) }} km²</span>
            </div>
            <div v-if="r.effectiveCoverageRatio != null" class="result-stat">
              <span class="stat-label">有效覆盖率</span>
              <span class="stat-value">{{ r.effectiveCoverageRatio }}%</span>
            </div>
          </template>
        </div>
        <div v-if="result.length >= 2" class="insight-card">
          <div class="insight-title">📊 多半径对比洞察</div>
          <div class="insight-text">{{ radiusInsight }}</div>
        </div>
      </template>
      <template v-else>
        <div class="export-bar">
          <button class="btn btn-sm btn-export" @click="downloadExport('geojson')">GeoJSON</button>
          <button class="btn btn-sm btn-export" @click="downloadExport('excel')">数据导出</button>
        </div>
        <div v-if="selectedIndustry && !(result as CoverageResult).triangulation?.totalEdges" class="empty-industry-warn">
          ⚠ 当前项目中没有找到"{{ selectedIndustry }}"行业的门店数据
          <div class="empty-industry-hint">请确认数据导入时 metadata 中已设置 industry 字段，或切换为"自定义半径"进行分析。</div>
        </div>
        <div class="section-divider">L1 · 覆盖质量</div>
        <div class="kpi-grid kpi-grid-3col">
          <div class="kpi-card kpi-primary">
            <div class="kpi-value" :class="connectClass(result as any)">{{ result.triangulation?.coverageConnectivity ?? '-' }}%</div>
            <div class="kpi-label">覆盖衔接度 <span class="kpi-tip" title="基于三角剖分：相邻门店间距与服务半径的加权覆盖率">ⓘ</span></div>
            <div class="kpi-sub" v-if="result.triangulation?.totalEdges">{{ result.triangulation?.connectedEdges }}/{{ result.triangulation?.totalEdges }} 边已衔接 · 均距 {{ ((result.triangulation?.avgEdgeM ?? 0) / 1000).toFixed(1) }}km</div>
            <div class="kpi-sub" v-else>门店数不足3，无法计算三角指标</div>
          </div>
          <div class="kpi-card kpi-secondary">
            <div class="kpi-value" :class="overlapClass(result as any)">{{ result.triangulation?.overlapRatio ?? '-' }}%</div>
            <div class="kpi-label">重叠率 <span class="kpi-tip" title="相邻门店服务区重叠程度的加权平均值">ⓘ</span></div>
            <div class="kpi-sub">{{ overlapHint((result as any)) }}</div>
          </div>
          <div class="kpi-card kpi-secondary">
            <div class="kpi-value" :class="gapClass(result as any)">{{ result.triangulation?.gapRatio ?? '-' }}%</div>
            <div class="kpi-label">盲区比例 <span class="kpi-tip" title="存在缝隙的边长占总边长的比例">ⓘ</span></div>
            <div class="kpi-sub" v-if="result.triangulation?.gappedEdges">{{ result.triangulation?.gappedEdges }} 条边存在缝隙 · 最远 {{ ((result.triangulation?.maxEdgeM ?? 0) / 1000).toFixed(1) }}km</div>
          </div>
        </div>
        <div class="result-stat">
          <span class="stat-label">总覆盖并集面积</span>
          <span class="stat-value">{{ ((result.coveredArea || 0) / 1000000).toFixed(2) }} km²</span>
        </div>
        <template v-if="result.overlapLayers">
          <div class="section-divider">L2 · 门店效率</div>
          <div class="result-stat">
            <span class="stat-label">独家覆盖</span>
            <span class="stat-value" style="color: #34C759">{{ ((result.overlapLayers.single || 0) / 1000000).toFixed(2) }} km²</span>
          </div>
          <div class="result-stat">
            <span class="stat-label">双重覆盖</span>
            <span class="stat-value" style="color: #FF9500">{{ ((result.overlapLayers.double || 0) / 1000000).toFixed(2) }} km²</span>
          </div>
          <div class="result-stat">
            <span class="stat-label">三重及以上</span>
            <span class="stat-value" style="color: #FF3B30">{{ ((result.overlapLayers.triplePlus || 0) / 1000000).toFixed(2) }} km²</span>
          </div>
          <div :class="['map-hint', { 'map-hint-warn': (result.cannibalizationIndex || 0) > 50 }]">
            蚕食指数 {{ result.cannibalizationIndex || 0 }}%<template v-if="(result.cannibalizationIndex || 0) > 50"> —— 建议优化门店间距以减少互相竞争</template><template v-else> —— 你的门店互相抢占了 {{ result.cannibalizationIndex || 0 }}% 的服务区域</template>
          </div>
        </template>
        <div class="section-divider">L3 · 深度分析</div>
        <template v-if="result.effectiveCoveredArea != null">
          <div class="result-stat" v-for="z in result.decayBreakdown" :key="z.zone">
            <span class="stat-label">{{ z.zone }}</span>
            <span class="stat-value">{{ ((z.areaSqm || 0) / 1000000).toFixed(2) }} km² <small class="weight-hint">权重{{ z.weight }}</small></span>
          </div>
          <div class="result-stat">
            <span class="stat-label">有效覆盖面积</span>
            <span class="stat-value">{{ ((result.effectiveCoveredArea || 0) / 1000000).toFixed(2) }} km²</span>
          </div>
          <div class="result-stat">
            <span class="stat-label">有效覆盖率</span>
            <span class="stat-value">{{ result.effectiveCoverageRatio || 0 }}%</span>
          </div>
        </template>
        <template v-else>
          <div class="kpi-hint">请勾选"距离衰减"以查看核心圈/过渡圈/边缘圈分析</div>
        </template>
        <template v-if="result.advice && result.advice.length">
          <div class="section-divider">决策建议</div>
          <div v-for="(a, i) in result.advice" :key="i" :class="['advice-card', 'advice-' + a.priority]">
            <span :class="['advice-dot', 'dot-' + a.priority]"></span>
            <span class="advice-text">{{ a.message }}</span>
          </div>
        </template>
        <template v-if="voronoiResult && voronoiResult.polygons?.length">
          <div class="section-divider">服务域划分（泰森多边形）</div>
          <div class="result-stat">
            <span class="stat-label">服务域数量</span>
            <span class="stat-value">{{ voronoiResult.polygons.length }} 个</span>
          </div>
          <div class="voronoi-legend">
            <div class="legend-title">各色块含义：</div>
            <div class="legend-intro">每个色块代表一个门店的独占服务域，颜色仅用于区分相邻门店。</div>
            <div class="legend-samples">
              <span v-for="(p, i) in voronoiResult.polygons.slice(0, 10)" :key="p.pointId" class="legend-swatch-row">
                <span class="legend-swatch-box" :style="{ background: voronoiPalette[Number(i) % 10][0], borderColor: voronoiPalette[Number(i) % 10][1] }"></span>
                <span class="legend-swatch-name">{{ p.pointName || '门店' + (Number(i)+1) }}</span>
              </span>
              <span v-if="voronoiResult.polygons.length > 10" class="legend-swatch-more">…等{{ voronoiResult.polygons.length }}个门店</span>
            </div>
          </div>
        </template>
        <div class="map-hint">绿色为覆盖范围，红色为分布范围内盲区，蓝色虚线 = 白空间</div>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getCoverage, getIndustryRadii, type IndustryRadius } from '@/api'
import IndustrySelector from '@/components/shared/IndustrySelector.vue'
import AnalysisParams, { type AnalysisParam } from '@/components/shared/AnalysisParams.vue'
import TaskProgress from '@/components/shared/TaskProgress.vue'
import type { CoverageResult, TaskInfo } from '@/types'
import apiClient from '@/api/client'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  result: [data: CoverageResult | CoverageResult[], voronoiData?: any]
}>()

const params: AnalysisParam[] = [
  { key: 'radius', label: '半径 (m)', type: 'range', min: 50, max: 15000, step: 50, default: 1000, unit: 'm' },
]

const values = ref<any>({ radius: 1000 })
const multiRadius = ref(false)
const decayMode = ref(false)
const showWhiteSpace = ref(false)
const showVoronoi = ref(false)
const voronoiResult = ref<any>(null)
const enableClip = ref(false)
const clipGeojson = ref<any>(null)
const clipBoundaryName = ref('')
const networkMode = ref('')
const industryRadii = ref<IndustryRadius[]>([])
const selectedIndustry = ref('')
const result = ref<CoverageResult | CoverageResult[] | null>(null)
const expandedRadii = ref<boolean[]>([true, true, true])

const voronoiPalette: string[][] = [
  ["rgba(0,122,255,0.18)", "#007AFF"], ["rgba(52,199,89,0.18)", "#34C759"],
  ["rgba(255,149,0,0.18)", "#FF9500"], ["rgba(255,59,48,0.15)", "#FF3B30"],
  ["rgba(175,82,222,0.18)", "#AF52DE"], ["rgba(90,200,250,0.18)", "#5AC8FA"],
  ["rgba(255,204,0,0.18)", "#FFCC00"], ["rgba(142,142,147,0.18)", "#8E8E93"],
  ["rgba(52,120,246,0.18)", "#3478F6"], ["rgba(48,219,176,0.18)", "#30DBB0"],
]

onMounted(async () => {
  try {
    const { industries } = await getIndustryRadii()
    industryRadii.value = industries
  } catch {}
})

function onIndustryChange() {
  const match = industryRadii.value.find(i => i.industry === selectedIndustry.value)
  if (match) {
    values.value.radius = match.radiusMeters
  }
}
function getPresetRadius(): number | null {
  const match = industryRadii.value.find(i => i.industry === selectedIndustry.value)
  return match ? match.radiusMeters : null
}
function industryLabel(code: string): string {
  const match = industryRadii.value.find(i => i.industry === code)
  return match ? match.label : code
}

const task = ref<TaskInfo | null>(null)

function onClipFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  clipBoundaryName.value = file.name
  const reader = new FileReader()
  reader.onload = () => {
    try { clipGeojson.value = JSON.parse(reader.result as string) } catch { clipBoundaryName.value = ""; clipGeojson.value = null }
  }
  reader.readAsText(file)
}

async function pollTask(taskId: string): Promise<{ status: string; result?: any; error?: string }> {
  const maxAttempts = 120
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 2000))
    try {
      const { data } = await apiClient.get("/tasks/" + taskId)
      if (data.status === "completed" || data.status === "failed") return data
    } catch {}
  }
  return { status: "failed", error: "分析超时" }
}

async function downloadExport(format: string) {
  const params: Record<string, string> = { format, radius: String(values.value.radius) };
  if (decayMode.value) params.decay = 'true';
  if (showWhiteSpace.value) params.whitespace = 'true';
  if (networkMode.value) params.network = networkMode.value;
  if (selectedIndustry.value) params.industry = selectedIndustry.value;
  try {
    const resp = await apiClient.get(
      "/projects/" + props.projectId + "/analysis/coverage/export",
      { params, responseType: "blob" }
    );
    const ext = format === "geojson" ? "geojson" : "xlsx";
    const mime = format === "geojson" ? "application/geo+json" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const blob = new Blob([resp.data], { type: mime });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "coverage_" + props.projectId + "." + ext;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (e: any) {
    console.error("Export failed:", e);
    alert("导出失败：" + (e.response?.data?.message || e.message));
  }
}

function connectClass(r: CoverageResult): string {
  const v = r.triangulation?.coverageConnectivity
  if (v == null) return ''
  if (v > 85) return 'stat-value-good'
  if (v > 60) return 'stat-value-mid'
  return 'stat-value-warn'
}

function overlapClass(r: CoverageResult): string {
  const v = r.triangulation?.overlapRatio
  if (v == null) return ''
  if (v < 15) return 'stat-value-good'
  if (v < 40) return 'stat-value-mid'
  return 'stat-value-warn'
}

function gapClass(r: CoverageResult): string {
  const v = r.triangulation?.gapRatio
  if (v == null) return ''
  if (v < 10) return 'stat-value-good'
  if (v < 30) return 'stat-value-mid'
  return 'stat-value-warn'
}

function overlapHint(r: CoverageResult): string {
  const v = r.triangulation?.overlapRatio
  if (v == null) return ''
  if (v < 15) return '门店间轻微重叠'
  if (v < 40) return '门店间中度重叠'
  return '门店间严重重叠'
}

const radiusInsight = computed(() => {
  const arr = result.value as CoverageResult[]
  if (!arr || arr.length < 2) return ''
  const tri0 = arr[0]?.triangulation
  const tri2 = arr[arr.length - 1]?.triangulation
  if (!tri0 || !tri2) return ''
  const dConn = (tri2.coverageConnectivity - tri0.coverageConnectivity).toFixed(0)
  const dOvr = (tri2.overlapRatio - tri0.overlapRatio).toFixed(0)
  const dGap = (tri2.gapRatio - tri0.gapRatio).toFixed(0)
  let suggestion = ''
  if (arr.length >= 2) {
    const tri1 = arr[1]?.triangulation
    if (tri1 && tri1.coverageConnectivity > 80 && tri1.overlapRatio < 20) {
      suggestion = ' 建议：3km 是平衡点（衔接度 ' + tri1.coverageConnectivity.toFixed(0) + '%，重叠率 ' + tri1.overlapRatio.toFixed(0) + '%）'
    }
  }
  return '2km → 5km：衔接度 ' + (Number(dConn) > 0 ? '+' : '') + dConn + '%，重叠率 ' + (Number(dOvr) > 0 ? '+' : '') + dOvr + '%，盲区 ' + (Number(dGap) > 0 ? '+' : '') + dGap + '%。' + suggestion
})

function toggleRadius(i: number) {
  const arr = [...expandedRadii.value]
  arr[i] = !arr[i]
  expandedRadii.value = arr
}

function onUpdate(v: Record<string, number>) {
  values.value = v
  // Bidirectional sync: slider matches a preset → auto-select it; otherwise → custom
  const match = industryRadii.value.find(i => i.radiusMeters === v.radius)
  if (match) {
    selectedIndustry.value = match.industry
  } else {
    selectedIndustry.value = ''
  }
}

async function runAnalysis() {
  task.value = { taskId: '', status: 'running' }
  try {
    const clip = enableClip.value ? clipGeojson.value : undefined
    const net = networkMode.value || undefined
    if (multiRadius.value) {
      const radii = [2000, 3000, 5000]
      const results = await Promise.all(radii.map(r => getCoverage(props.projectId, r, decayMode.value, showWhiteSpace.value, clip, net, selectedIndustry.value || undefined)))
      result.value = results
      task.value = { taskId: '', status: 'completed', result: results }
      emit('result', results as any, voronoiResult.value)
    } else {
      const data = await getCoverage(props.projectId, values.value.radius, decayMode.value, showWhiteSpace.value, clip, net, selectedIndustry.value || undefined)
      if ((data as any).taskId && (data as any).status === 'queued') {
        task.value = { taskId: (data as any).taskId, status: 'running' }
        const pollResult = await pollTask((data as any).taskId)
        if (pollResult.status === 'completed' && pollResult.result) {
          result.value = pollResult.result as CoverageResult
          task.value = { taskId: (data as any).taskId, status: 'completed', result: pollResult.result }
          emit('result', pollResult.result as CoverageResult, voronoiResult.value)
        } else {
          task.value = { taskId: (data as any).taskId, status: 'failed', error: pollResult.error || '分析超时' }
        }
      } else {
        result.value = data as CoverageResult
        task.value = { taskId: '', status: 'completed', result: data }
        emit('result', data as CoverageResult, voronoiResult.value)
      }
      if (showVoronoi.value) {
        try {
          const { data: vData } = await apiClient.get('/projects/' + props.projectId + '/analysis/voronoi')
          voronoiResult.value = vData
          const currentResult = result.value
          if (currentResult && !Array.isArray(currentResult)) {
            emit('result', currentResult as CoverageResult, vData)
          }
        } catch {}
      }
    }
  } catch (e: any) {
    task.value = { taskId: '', status: 'failed', error: e.message }
  }
}
</script>
<style scoped>
.panel { padding: 0; }
.panel-title { margin: 0 0 var(--space-3); font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--color-text-primary); text-transform: uppercase; letter-spacing: 0.04em; }
.param-group { margin-bottom: var(--space-2); }
.param-group label { font-size: var(--text-sm); font-weight: var(--font-medium); color: var(--color-text-secondary); }
.param-group-label { display: block; font-size: var(--text-xs); font-weight: var(--font-semibold); color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-1); }
.param-group-row { display: flex; justify-content: space-between; align-items: center; }
.checkbox-label { display: flex; align-items: center; gap: var(--space-1); cursor: pointer; }
.industry-select { width: 100%; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-card-solid); color: var(--color-text-primary); font-size: var(--text-sm); font-family: var(--font-system); }
.clip-badge { font-size: var(--text-xs); color: var(--color-accent); background: var(--color-accent-subtle); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--color-border-focus); }
.clip-controls { margin-top: var(--space-1); display: flex; flex-direction: column; gap: var(--space-1); }
.clip-file-input { font-size: var(--text-xs); font-family: var(--font-system); }
.clip-hint { font-size: var(--text-xs); color: var(--color-text-tertiary); }
.radio-row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.radio-label { display: inline-flex; align-items: center; gap: 4px; font-size: var(--text-sm); color: var(--color-text-secondary); cursor: pointer; }
.radio-label input[type="radio"] { accent-color: var(--color-accent); }
.result-section { margin-top: var(--space-3); }
.export-bar { display: flex; gap: var(--space-1); margin-bottom: var(--space-3); }
.btn-export { background: var(--color-bg-card-solid); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 4px 10px; font-size: var(--text-xs); font-family: var(--font-system); cursor: pointer; color: var(--color-text-secondary); transition: all var(--duration-fast); }
.btn-export:hover { border-color: var(--color-accent); color: var(--color-accent); background: var(--color-accent-subtle); }
.kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-bottom: var(--space-3); }
.kpi-grid-3col { grid-template-columns: 1fr 1fr 1fr; }
.kpi-card { padding: var(--space-3); border-radius: var(--radius-sm); border: 1px solid var(--color-border); }
.kpi-primary { background: var(--color-accent-subtle); border-color: var(--color-border-focus); }
.kpi-secondary { background: var(--color-bg-card-solid); }
.kpi-value { font-size: var(--text-2xl); font-weight: var(--font-bold); color: var(--color-accent); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.kpi-label { font-size: var(--text-xs); color: var(--color-text-secondary); margin-top: 2px; }
.kpi-tip { font-size: var(--text-xs); cursor: help; color: var(--color-text-tertiary); }
.kpi-sub { font-size: var(--text-xs); color: var(--color-text-tertiary); margin-top: 4px; }
.kpi-hint { font-size: var(--text-xs); color: var(--color-text-tertiary); margin-bottom: var(--space-2); font-style: italic; }
.result-stat { display: flex; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
.stat-label { font-size: var(--text-sm); color: var(--color-text-secondary); }
.stat-value { font-weight: var(--font-semibold); color: var(--color-accent); font-variant-numeric: tabular-nums; }
.stat-value-warn { color: #FF3B30 !important; }
.stat-value-mid { color: #FF9500 !important; }
.stat-value-good { color: #34C759 !important; }
.section-divider { padding: var(--space-3) 0 var(--space-1); font-size: var(--text-xs); font-weight: var(--font-semibold); color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--color-border); margin-bottom: var(--space-1); }
.weight-hint { font-size: var(--text-xs); color: var(--color-text-tertiary); font-weight: var(--font-normal); margin-left: var(--space-1); }
.advice-card { display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-2) var(--space-3); margin-top: var(--space-2); background: var(--color-bg-card-solid); border-radius: var(--radius-sm); border-left: 3px solid var(--color-border); }
.advice-high { border-left-color: #FF3B30; }
.advice-medium { border-left-color: #FF9500; }
.advice-low { border-left-color: var(--color-text-tertiary); }
.advice-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.dot-high { background: #FF3B30; }
.dot-medium { background: #FF9500; }
.dot-low { background: var(--color-text-tertiary); }
.advice-text { font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.4; }
.map-hint-warn { background: rgba(255, 59, 48, 0.08) !important; border-color: rgba(255, 59, 48, 0.2) !important; }
.map-hint { margin-top: var(--space-3); padding: var(--space-2) var(--space-3); background: var(--color-warning-bg); border: 1px solid rgba(255, 149, 0, 0.12); border-radius: var(--radius-sm); font-size: var(--text-xs); color: var(--color-text-secondary); }
.voronoi-legend { margin-top: var(--space-2); padding: var(--space-2) var(--space-3); background: var(--color-bg-card-solid); border-radius: var(--radius-sm); border: 1px solid var(--color-border); }
.legend-title { font-size: var(--text-xs); font-weight: var(--font-semibold); color: var(--color-text-primary); margin-bottom: var(--space-1); }
.legend-intro { font-size: var(--text-xs); color: var(--color-text-tertiary); line-height: 1.5; margin-bottom: var(--space-2); }
.legend-samples { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); }
.legend-swatch-row { display: inline-flex; align-items: center; gap: 4px; }
.legend-swatch-box { width: 12px; height: 12px; border-radius: 2px; border: 1.5px solid; flex-shrink: 0; }
.legend-swatch-name { font-size: 11px; color: var(--color-text-secondary); white-space: nowrap; }
.legend-swatch-more { font-size: 11px; color: var(--color-text-tertiary); }
.multi-radius-card { padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
.multi-radius-header { display: flex; justify-content: space-between; align-items: center; }
.multi-radius-badge { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--color-accent); }
.multi-radius-toggle { font-size: var(--text-xs); color: var(--color-text-tertiary); cursor: pointer; }
.insight-card { margin-top: var(--space-3); padding: var(--space-3); background: var(--color-bg-card-solid); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.insight-title { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--color-text-primary); margin-bottom: var(--space-1); }
.insight-text { font-size: var(--text-xs); color: var(--color-text-secondary); line-height: 1.5; }
.preset-hint { font-size: var(--text-xs); color: var(--color-text-tertiary); margin-top: 2px; font-style: italic; }
.empty-industry-warn { margin: var(--space-3) 0; padding: var(--space-3); background: rgba(255,149,0,0.08); border: 1px solid rgba(255,149,0,0.2); border-radius: var(--radius-sm); font-size: var(--text-sm); color: var(--color-text-primary); line-height: 1.5; }
.empty-industry-hint { margin-top: var(--space-1); font-size: var(--text-xs); color: var(--color-text-tertiary); }
</style>