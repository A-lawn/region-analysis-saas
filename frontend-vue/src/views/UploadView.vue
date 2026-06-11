<template>
  <div class="upload-view">
    <div class="hero">
      <h1>上传数据，开始分析</h1>
      <p>支持 Excel (.xlsx, .xls, .csv) 格式，智能识别列名</p>
    </div>

    <div class="upload-card">
      <!-- Timeline step 1: CRS -->
      <div class="step" :class="{ 'step-active': !uploadData, 'step-done': !!uploadData }">
        <div class="step-marker">
          <span class="step-ring" :class="{ filled: !!uploadData }">
            <AppIcon v-if="uploadData" name="check" :size="14" color="#fff" />
            <span v-else>1</span>
          </span>
        </div>
        <div class="step-body">
          <div class="step-header">
            <span class="step-title">选择坐标系</span>
          </div>
          <CrsSelector v-model="sourceCrs" />
        </div>
      </div>

      <!-- Timeline connector -->
      <div class="timeline-line" :class="{ 'line-done': !!uploadData }"></div>

      <!-- Timeline step 2: Upload -->
      <div class="step" :class="{ 'step-active': true, 'step-done': !!uploadData }">
        <div class="step-marker">
          <span class="step-ring" :class="{ filled: !!uploadData }">
            <AppIcon v-if="uploadData" name="check" :size="14" color="#fff" />
            <span v-else>2</span>
          </span>
        </div>
        <div class="step-body">
          <div class="step-header">
            <span class="step-title">上传文件</span>
          </div>
          <FileDropZone @file="handleFile" />
          <div v-if="uploading" class="progress-bar" style="margin-top: var(--space-3)">
            <div class="progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- Timeline connector -->
      <div v-if="uploadData" class="timeline-line line-done"></div>

      <!-- Timeline step 3: Column mapping -->
      <div v-if="uploadData" class="step step-active">
        <div class="step-marker">
          <span class="step-ring">
            <span>3</span>
          </span>
        </div>
        <div class="step-body">
          <div class="step-header">
            <span class="step-title">确认列映射（共 {{ uploadData.totalRows }} 行）</span>
          </div>
          <ColumnMapper v-model="columnMapping" :headers="uploadData.headers" />
          <div v-if="uploadData.warnings.length" class="warnings">
            <p v-for="w in uploadData.warnings" :key="w">
              <AppIcon name="alert" :size="14" />{{ w }}
            </p>
          </div>
          <DataPreviewTable :headers="uploadData.headers" :rows="previewRows" />
          <button class="btn btn-primary btn-block" :disabled="importing" @click="confirmUpload" style="margin-top: var(--space-4)">
            {{ importing ? '导入中...' : '确认并导入' }}
          </button>
          <div v-if="importError" class="error-msg" style="margin-top: var(--space-2)">{{ importError }}</div>
        </div>
      </div>
    </div>

    <!-- History Projects -->
    <div v-if="projects.length" class="projects-section">
      <div class="projects-header" @click="historyCollapsed = !historyCollapsed">
        <h3>历史项目</h3>
        <div class="projects-header-right">
          <span class="projects-count">{{ totalProjects }} 个项目</span>
          <AppIcon
            name="chevron-right"
            :size="14"
            color="var(--color-text-tertiary)"
            class="chevron-toggle"
            :class="{ expanded: !historyCollapsed }"
          />
        </div>
      </div>

      <div v-if="!historyCollapsed">
        <!-- Search field (visible when unfolded + more than 5 projects) -->
        <div v-if="totalProjects > 5" class="project-search">
          <AppIcon name="search" :size="14" color="var(--color-text-tertiary)" />
          <input
            :value="projectFilter" @input="onSearchInput($event)"
            type="search"
            placeholder="搜索项目..."
            class="search-input"
          />
        </div>

        <div class="project-list">
          <div
            v-for="p in visibleProjects"
            :key="p.id"
            class="project-card"
            @click="router.push({ name: 'dashboard', params: { id: p.id } })"
          >
            <div class="project-card-icon">
              <AppIcon name="chart" :size="18" />
            </div>
            <div class="project-card-info">
              <strong>{{ p.name }}</strong>
              <span>
                {{ p.point_count }} 点 · {{ p.source_crs.toUpperCase() }} · {{ fmtTime(p.created_at) }}
              </span>
            </div>
            <AppIcon name="chevron-right" :size="14" color="var(--color-text-tertiary)" />
          </div>

          <!-- Empty search result -->
          <div v-if="projects.length === 0 && projectFilter" class="project-empty">
            <AppIcon name="search" :size="20" color="var(--color-text-tertiary)" />
            <p>没有匹配"{{ projectFilter }}"的项目</p>
          </div>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="project-pagination">
            <button class="btn btn-sm" :disabled="currentPage <= 1" @click="loadProjects(1)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="11 5 4 12 11 19"/><polyline points="18 5 11 12 18 19"/></svg>
            </button>
            <button class="btn btn-sm" :disabled="currentPage <= 1" @click="loadProjects(currentPage - 1)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="14 5 7 12 14 19"/></svg>
            </button>
            <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
            <button class="btn btn-sm" :disabled="currentPage >= totalPages" @click="loadProjects(currentPage + 1)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 5 16 12 9 19"/></svg>
            </button>
            <button class="btn btn-sm" :disabled="currentPage >= totalPages" @click="loadProjects(totalPages)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="12 5 19 12 12 19"/><polyline points="5 5 12 12 5 19"/></svg>
            </button>
          </div>

          <!-- "Show all" only when without filter -->
          <div v-if="!projectFilter && totalProjects > defaultShowCount" class="project-list-actions">
            <button class="btn btn-sm" @click="showAll = !showAll">
              {{ showAll ? '收起 — 只显示最近 ' + defaultShowCount + ' 个' : '查看全部 ' + totalProjects + ' 个项目' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import type { CrsType, UploadResult } from '@/types'
import { uploadFile, confirmUpload as confirmUploadApi, listProjects } from '@/api'
import CrsSelector from '@/components/upload/CrsSelector.vue'
import FileDropZone from '@/components/upload/FileDropZone.vue'
import ColumnMapper from '@/components/upload/ColumnMapper.vue'
import DataPreviewTable from '@/components/upload/DataPreviewTable.vue'
import AppIcon from '@/components/shared/AppIcon.vue'

const router = useRouter()
const { show } = useToast()

const sourceCrs = ref<CrsType>('gcj02')
const uploading = ref(false)
const progress = ref(0)
const uploadData = ref<UploadResult | null>(null)
const columnMapping = ref<Record<string, number | null>>({})
const importing = ref(false)
const importError = ref('')
const projects = ref<any[]>([])

// History list controls
const defaultShowCount = 5
const showAll = ref(false)
const historyCollapsed = ref(false)
const projectFilter = ref('')
const loadingProjects = ref(false)
const totalProjects = ref(0)
const currentPage = ref(1)
const totalPages = ref(0)

// Projects already paginated by backend. "Show all" toggles between
// showing first 5 (default preview) and full current page (up to limit)
const visibleProjects = computed(() => {
  if (showAll.value) return projects.value
  return projects.value.slice(0, Math.min(defaultShowCount, projects.value.length))
})

// Reset showAll when page/search changes
function resetShowAll() {
  showAll.value = false
}

function fmtTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return diffMin + ' 分钟前'
  if (diffHr < 24) return diffHr + ' 小时前'
  if (diffDay < 7) return diffDay + ' 天前'
  if (diffDay < 30) return Math.floor(diffDay / 7) + ' 周前'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const previewRows = computed(() => {
  if (!uploadData.value) return []
  return uploadData.value.preview.map((r: any) => r.values.map((v: any) => v.value))
})

async function handleFile(file: File) {
  uploading.value = true
  progress.value = 30
  importError.value = ''
  try {
    const data = await uploadFile(file, sourceCrs.value)
    uploadData.value = data
    columnMapping.value = { ...data.detectedColumns }
    progress.value = 100
    show('文件解析完成', 'success')
  } catch (e: any) {
    show(e.response?.data?.error || e.message, 'error')
  } finally {
    uploading.value = false
  }
}

async function confirmUpload() {
  if (columnMapping.value.lngCol === null || columnMapping.value.latCol === null) {
    importError.value = '请指定经度和纬度列'
    return
  }
  if (!uploadData.value) return
  importing.value = true
  importError.value = ''
  try {
    const result = await confirmUploadApi({
      uploadId: uploadData.value.uploadId,
      columnMapping: columnMapping.value,
    })
    if (result.projectId) {
      show('成功导入 ' + result.rowsInserted + ' 条数据', 'success')
      router.push({ name: 'dashboard', params: { id: result.projectId } })
    } else if (result.errors?.length) {
      importError.value = result.errors.join('; ')
    }
  } catch (e: any) {
    importError.value = e.response?.data?.error || '导入失败'
    show(importError.value, 'error')
  } finally {
    importing.value = false
  }
}

async function loadProjects(page = 1) {
  loadingProjects.value = true
  resetShowAll()
  try {
    const data = await listProjects({
      search: projectFilter.value || undefined,
      page,
      limit: 10,
    })
    projects.value = data.projects || []
    totalProjects.value = data.total
    currentPage.value = data.page
    totalPages.value = data.totalPages
  } catch {
    // silent fail
  } finally {
    loadingProjects.value = false
  }
}

// Debounced search
let searchTimer: ReturnType<typeof setTimeout>
function onSearchInput(e: Event) { projectFilter.value = (e.target as HTMLInputElement).value
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadProjects(1)
  }, 300)
}

onMounted(() => {
  loadProjects(1)
})
</script>

<style scoped>
.upload-view {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-10) var(--space-5);
}

.hero {
  text-align: center;
  margin-bottom: var(--space-8);
}

.hero h1 {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  letter-spacing: -0.02em;
  margin: 0 0 var(--space-2);
}

.hero p {
  color: var(--color-text-secondary);
  font-size: var(--text-base);
  margin: 0;
}

.upload-card {
  background: var(--color-bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  padding: var(--space-8);
}

/* ── Timeline Step ── */
.step {
  display: flex;
  gap: var(--space-4);
  position: relative;
}

.step-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 32px;
}

.step-ring {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  border: 2px solid var(--color-border);
  background: var(--color-bg-card-solid);
  color: var(--color-text-secondary);
  transition: all var(--duration-normal) var(--ease-smooth);
  flex-shrink: 0;
}

.step-active .step-ring {
  border-color: var(--color-accent);
  color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-subtle);
}

.step-ring.filled {
  background: var(--color-success);
  border-color: var(--color-success);
  color: #fff;
}

.step-body {
  flex: 1;
  min-width: 0;
  padding-bottom: var(--space-4);
}

.step-header {
  margin-bottom: var(--space-3);
}

.step-title {
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  letter-spacing: -0.01em;
}

/* ── Timeline Connector ── */
.timeline-line {
  width: 2px;
  height: 20px;
  margin-left: 15px;
  background: var(--color-border);
  transition: background var(--duration-normal) var(--ease-smooth);
}

.timeline-line.line-done {
  background: var(--color-success);
}

/* ── Warnings ── */
.warnings {
  background: var(--color-warning-bg);
  border: 1px solid rgba(255, 149, 0, 0.12);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  margin: var(--space-2) 0;
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.warnings p {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

/* ── Projects Section ── */
.projects-section {
  margin-top: var(--space-10);
}

.projects-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 var(--space-3);
  cursor: pointer;
  user-select: none;
  padding: var(--space-1) var(--space-1);
  border-radius: var(--radius-sm);
  transition: background var(--duration-fast) var(--ease-smooth);
}

.projects-header:hover {
  background: var(--color-bg-hover);
}

.projects-header h3 {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  margin: 0;
  letter-spacing: -0.01em;
}

.projects-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.projects-count {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.chevron-toggle {
  transition: transform var(--duration-normal) var(--ease-smooth);
}

.chevron-toggle.expanded {
  transform: rotate(90deg);
}

/* ── Search Field ── */
.project-search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-input);
  border-radius: var(--radius-full);
  margin-bottom: var(--space-3);
  border: 1px solid transparent;
  transition: border-color var(--duration-normal) var(--ease-smooth);
}

.project-search:focus-within {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-focus-ring);
}

.search-input {
  flex: 1;
  border: none;
  background: none;
  font-size: var(--text-sm);
  font-family: var(--font-system);
  color: var(--color-text-primary);
  outline: none;
  padding: 2px 0;
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

/* ── Project List ── */
.project-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.project-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    transform var(--duration-fast) var(--ease-spring),
    box-shadow var(--duration-normal) var(--ease-smooth);
}

.project-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-elevated);
}

.project-card-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--color-accent-subtle);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.project-card-info {
  flex: 1;
  min-width: 0;
}

.project-card-info strong {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-card-info span {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.project-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-8) 0;
  color: var(--color-text-tertiary);
  font-size: var(--text-sm);
}

.project-empty p {
  margin: 0;
}

.project-list-actions {
  padding-top: var(--space-2);
  display: flex;
  justify-content: center;
}

/* ── Pagination ── */
.project-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding-top: var(--space-3);
}

.page-info {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.project-pagination .btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .upload-view {
    padding: var(--space-5) var(--space-3);
  }
  .upload-card {
    padding: var(--space-5);
  }
  .hero h1 {
    font-size: var(--text-xl);
  }
}
</style>





