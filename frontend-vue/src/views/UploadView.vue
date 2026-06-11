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
          <button
            v-if="projectStore.deletedProjects.length > 0"
            class="recycle-bin-btn"
            @click.stop="openRecycleBin"
            title="回收站"
          >
            <AppIcon name="trash" :size="14" />
            <span class="recycle-count">{{ projectStore.deletedProjects.length }}</span>
          </button>
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
            <button
              class="project-delete-btn"
              @click.stop="confirmDeleteProject(p)"
              title="删除项目"
            >
              <AppIcon name="trash" :size="14" />
            </button>
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

      <!-- Delete Confirm Sheet -->
      <Teleport to="#app-root">
        <Transition name="sheet">
          <div v-if="showDeleteConfirm" class="sheet-overlay" @click.self="showDeleteConfirm = null">
            <div class="delete-confirm-panel">
              <div class="delete-confirm-icon">
                <AppIcon name="trash" :size="24" color="var(--color-error)" />
              </div>
              <p class="delete-confirm-title">确认删除项目？</p>
              <p class="delete-confirm-name">{{ showDeleteConfirm?.name }}</p>
              <span class="delete-confirm-meta">
                {{ showDeleteConfirm?.point_count }} 个点位 · {{ fmtTime(showDeleteConfirm?.created_at) }}
              </span>
              <p class="delete-confirm-hint">删除后将移至回收站，可随时恢复</p>
              <div class="delete-confirm-actions">
                <button class="btn btn-cancel" @click="showDeleteConfirm = null">取消</button>
                <button class="btn btn-delete" @click="doDeleteProject">确认删除</button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Recycle Bin Sheet -->
      <Teleport to="#app-root">
        <Transition name="sheet">
          <div v-if="showRecycleBin" class="sheet-overlay" @click.self="showRecycleBin = false">
            <div class="sheet-panel sheet-panel-lg">
              <div class="sheet-header">
                <span class="sheet-title">回收站</span>
                <button class="sheet-close-btn" @click="showRecycleBin = false">
                  <AppIcon name="chevron-left" :size="16" />
                </button>
              </div>
              <div class="sheet-body sheet-scroll">
                <div v-if="projectStore.deletedProjects.length === 0" class="recycle-empty">
                  <AppIcon name="trash" :size="24" color="var(--color-text-tertiary)" />
                  <p>回收站为空</p>
                </div>
                <div
                  v-for="d in projectStore.deletedProjects"
                  :key="d.projectId"
                  class="recycle-card"
                >
                  <div class="recycle-card-info">
                    <strong>{{ d.projectName }}</strong>
                    <span>{{ d.pointCount }} 点 · {{ d.sourceCrs?.toUpperCase() }} · {{ fmtDaysAgo(d.deletedAt) }}</span>
                    <span
                      v-if="d.daysRemaining <= 7"
                      class="expiry-warning"
                    >
                      <AppIcon name="clock" :size="12" color="var(--color-warning)" />
                      {{ d.daysRemaining }} 天后过期
                    </span>
                  </div>
                  <div class="recycle-card-actions">
                    <button
                      class="btn btn-sm"
                      @click.stop="doRestore(d)"
                      :disabled="restoringId === d.projectId"
                    >
                      <AppIcon name="undo" :size="14" />
                      {{ restoringId === d.projectId ? '恢复中...' : '恢复' }}
                    </button>
                    <button
                      class="btn btn-sm btn-outline btn-danger"
                      @click.stop="showPurgeConfirm = d"
                    >
                      <AppIcon name="trash" :size="14" />
                      彻底删除
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="projectStore.deletedProjects.length > 0" class="sheet-footer">
                备份文件将在 {{ retentionDays }} 天后自动清理
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Purge Confirm Sheet -->
      <Teleport to="#app-root">
        <Transition name="sheet">
          <div v-if="showPurgeConfirm" class="sheet-overlay" @click.self="showPurgeConfirm = null">
            <div class="delete-confirm-panel">
              <div class="delete-confirm-icon">
                <AppIcon name="alert" :size="24" color="var(--color-error)" />
              </div>
              <p class="delete-confirm-title">永久删除项目</p>
              <p class="delete-confirm-name">{{ showPurgeConfirm.projectName }}</p>
              <p class="delete-confirm-danger">此操作不可逆，所有关联数据将被永久删除</p>
              <label class="delete-confirm-checkbox">
                <input type="checkbox" v-model="purgeRemoveBackup" />
                同时删除备份文件
              </label>
              <div class="delete-confirm-actions">
                <button class="btn btn-cancel" @click="showPurgeConfirm = null; purgeRemoveBackup = false">取消</button>
                <button class="btn btn-delete btn-delete-danger" @click="doPurgeProject">确认删除</button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { useProjectStore } from '@/stores/project'
import type { CrsType, UploadResult } from '@/types'
import { uploadFile, confirmUpload as confirmUploadApi, listProjects } from '@/api'
import CrsSelector from '@/components/upload/CrsSelector.vue'
import FileDropZone from '@/components/upload/FileDropZone.vue'
import ColumnMapper from '@/components/upload/ColumnMapper.vue'
import DataPreviewTable from '@/components/upload/DataPreviewTable.vue'
import AppIcon from '@/components/shared/AppIcon.vue'

const router = useRouter()
const { show } = useToast()
const projectStore = useProjectStore()

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

// Recycle bin state
const showDeleteConfirm = ref<any>(null)
const showRecycleBin = ref(false)
const showPurgeConfirm = ref<DeletedProject | null>(null)
const purgeRemoveBackup = ref(false)
const restoringId = ref<string | null>(null)
const retentionDays = ref(180)
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
// Recycle bin functions
async function confirmDeleteProject(p: any) {
  showDeleteConfirm.value = p
}

async function doDeleteProject() {
  if (!showDeleteConfirm.value) return
  const p = showDeleteConfirm.value
  showDeleteConfirm.value = null
  try {
    await projectStore.deleteProject(p.id)
    show('已移至回收站', 'info')
    await projectStore.fetchDeletedProjects()
    await loadProjects(currentPage.value)
  } catch (e: any) {
    show(e.message || '删除失败', 'error')
  }
}

async function openRecycleBin() {
  showRecycleBin.value = true
  await projectStore.fetchDeletedProjects()
}

async function doRestore(d: any) {
  restoringId.value = d.projectId
  try {
    await projectStore.restoreDeletedProject(d.projectId)
    show('项目已恢复', 'success')
    await loadProjects(1)
  } catch (e: any) {
    show(e.message || '恢复失败', 'error')
  } finally {
    restoringId.value = null
  }
}

async function doPurgeProject() {
  if (!showPurgeConfirm.value) return
  const d = showPurgeConfirm.value
  showPurgeConfirm.value = null
  try {
    await projectStore.purgeDeletedProject(d.projectId, purgeRemoveBackup.value)
    show('项目已永久删除', 'success')
  } catch (e: any) {
    show(e.message || '删除失败', 'error')
  } finally {
    purgeRemoveBackup.value = false
  }
}

function fmtDaysAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (24 * 3600 * 1000))
  if (days <= 0) return '今天'
  if (days === 1) return '1 天前'
  if (days < 30) return days + ' 天前'
  if (days < 365) return Math.floor(days / 30) + ' 个月前'
  return Math.floor(days / 365) + ' 年前'
}

onMounted(async () => {
  await projectStore.fetchDeletedProjects()
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
/* ── Sheet Overlay ── */
/* ── Delete Confirm Panel ── */
.delete-confirm-panel {
  width: 100%;
  max-width: 380px;
  background: var(--color-bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-floating);
  border: 1px solid var(--color-border);
  padding: var(--space-8) var(--space-6) var(--space-6);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.delete-confirm-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-error-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-2);
}

.delete-confirm-title {
  font-size: var(--text-md);
  font-weight: var(--font-semibold);
  margin: 0;
  letter-spacing: -0.01em;
  color: var(--color-text-primary);
}

.delete-confirm-name {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  margin: 0;
  color: var(--color-text-secondary);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-confirm-meta {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.delete-confirm-hint {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin: 0;
  line-height: var(--leading-relaxed);
}

.delete-confirm-danger {
  font-size: var(--text-sm);
  color: var(--color-error);
  margin: 0;
  line-height: var(--leading-relaxed);
}

.delete-confirm-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.delete-confirm-checkbox input[type="checkbox"] {
  width: auto;
  accent-color: var(--color-accent);
}

.delete-confirm-actions {
  display: flex;
  gap: var(--space-3);
  width: 100%;
  margin-top: var(--space-4);
}

.btn-cancel {
  flex: 1;
  padding: 10px 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card-solid);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  font-family: var(--font-system);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-smooth);
}

.btn-cancel:hover {
  background: var(--color-bg-hover);
}

.btn-delete {
  flex: 1;
  padding: 10px 0;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-error);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  font-family: var(--font-system);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-smooth);
}

.btn-delete:hover {
  background: #D63029;
}

.btn-delete-danger {
  background: var(--color-error);
}

/* ── Sheet Overlay ── */
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.sheet-panel-lg {
  width: 100%;
  max-width: 480px;
  max-height: 70vh;
  background: var(--color-bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-floating);
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.sheet-title {
  font-size: var(--text-md);
  font-weight: var(--font-semibold);
  letter-spacing: -0.01em;
}

.sheet-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: background var(--duration-fast) var(--ease-smooth);
}

.sheet-close-btn:hover {
  background: var(--color-bg-hover);
}

.sheet-body.sheet-scroll {
  overflow-y: auto;
  flex: 1;
  padding: var(--space-4) var(--space-5);
}

.sheet-footer {
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border);
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  text-align: center;
}

/* ── Sheet Transition ── */
.sheet-enter-active {
  transition: all var(--duration-normal) var(--ease-spring);
}

.sheet-leave-active {
  transition: all var(--duration-fast) var(--ease-smooth);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .delete-confirm-panel,
.sheet-leave-to .delete-confirm-panel,
.sheet-enter-from .sheet-panel-lg,
.sheet-leave-to .sheet-panel-lg {
  transform: scale(0.96);
  opacity: 0;
}

/* ── Recycle Bin Button ── */
.recycle-bin-btn {
  display: flex;
  align-items: center;
  gap: 2px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-tertiary);
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  transition: color var(--duration-fast) var(--ease-smooth);
}

.recycle-bin-btn:hover {
  color: var(--color-accent);
}

.recycle-count {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  font-family: var(--font-system);
}

/* ── Project Delete Button ── */
.project-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-tertiary);
  opacity: 0;
  transition:
    opacity var(--duration-normal) var(--ease-smooth),
    color var(--duration-fast) var(--ease-smooth),
    background var(--duration-fast) var(--ease-smooth);
  flex-shrink: 0;
}

.project-card:hover .project-delete-btn {
  opacity: 1;
}

.project-delete-btn:hover {
  color: var(--color-error);
  background: var(--color-error-bg);
}

/* ── Recycle Bin Card ── */
.recycle-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-2);
  background: var(--color-bg-card-solid);
  box-shadow: var(--shadow-card);
}

.recycle-card-info {
  flex: 1;
  min-width: 0;
}

.recycle-card-info strong {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recycle-card-info span {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  display: block;
}

.expiry-warning {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-warning) !important;
  margin-top: 2px;
}

.recycle-card-actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.btn-danger:hover {
  color: var(--color-error) !important;
  border-color: var(--color-error) !important;
  background: var(--color-error-bg) !important;
}

.btn-danger-solid {
  background: var(--color-error) !important;
  color: var(--color-text-inverse) !important;
}

.btn-danger-solid:hover {
  background: #D63029 !important;
}

/* ── Recycle Empty ── */
.recycle-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-8) 0;
  color: var(--color-text-tertiary);
  font-size: var(--text-sm);
}

.recycle-empty p {
  margin: 0;
}
</style>





