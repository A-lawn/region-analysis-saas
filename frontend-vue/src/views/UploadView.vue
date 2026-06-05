<template>
  <div class="upload-view">
    <div class="hero">
      <h1>上传数据，开始分析</h1>
      <p>支持 Excel (.xlsx, .xls, .csv) 格式，智能识别列名</p>
    </div>

    <div class="upload-card">
      <div class="step">
        <div class="step-header">
          <span class="step-num">1</span>
          <span class="step-title">选择坐标系</span>
        </div>
        <CrsSelector v-model="sourceCrs" />
      </div>

      <div class="step">
        <div class="step-header">
          <span class="step-num">2</span>
          <span class="step-title">上传文件</span>
        </div>
        <FileDropZone @file="handleFile" />
        <div v-if="uploading" class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
      </div>

      <div v-if="uploadData" class="step">
        <div class="step-header">
          <span class="step-num">3</span>
          <span class="step-title">确认列映射（共 {{ uploadData.totalRows }} 行）</span>
        </div>
        <ColumnMapper v-model="columnMapping" :headers="uploadData.headers" />
        <div v-if="uploadData.warnings.length" class="warnings">
          <p v-for="w in uploadData.warnings" :key="w">⚠ {{ w }}</p>
        </div>
        <DataPreviewTable :headers="uploadData.headers" :rows="previewRows" />
        <button class="btn btn-primary btn-block" :disabled="importing" @click="confirmUpload">
          {{ importing ? '导入中...' : '确认并导入' }}
        </button>
        <div v-if="importError" class="error-msg">{{ importError }}</div>
      </div>
    </div>

    <div v-if="projects.length" class="projects-section">
      <h3>历史项目</h3>
      <div class="project-list">
        <div
          v-for="p in projects"
          :key="p.id"
          class="project-card"
          @click="router.push({ name: 'dashboard', params: { id: p.id } })"
        >
          <strong>{{ p.name }}</strong>
          <span>{{ p.point_count }} 点 · {{ p.source_crs }}</span>
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

onMounted(async () => {
  try {
    const data = await listProjects()
    projects.value = data.projects || []
  } catch {}
})
</script>

<style scoped>
.upload-view { max-width: 720px; margin: 0 auto; padding:40px 20px; }
.hero { text-align: center; margin-bottom: 32px; }
.hero h1 { font-size: 28px; margin: 0 0 8px; }
.hero p { color: #999; margin: 0; }
.upload-card { background: #fff; border: 1px solid #e8e8e8; border-radius: 16px; padding: 24px; }
.step { margin-bottom: 24px; }
.step-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.step-num { width: 28px; height: 28px; border-radius: 50%; background: #1677ff; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; }
.step-title { font-size: 16px; font-weight: 600; }
.progress-bar { margin-top: 12px; height: 4px; background: #e8e8e8; border-radius: 2px; }
.progress-fill { height: 100%; background: #1677ff; border-radius: 2px; transition: width 0.3s; }
.warnings { background: #fffbe6; border: 1px solid #ffe58f; padding: 8px 12px; border-radius: 6px; margin: 8px 0; font-size: 13px; color: #ad8b00; }
.warnings p { margin: 0; }
.error-msg { color: #ff4d4f; font-size: 13px; margin-top: 8px; padding: 8px; background: #fff2f0; border-radius: 6px; }
.btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; margin-top: 12px; }
.btn-primary { background: #1677ff; color: #fff; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-block { width: 100%; }
.projects-section { margin-top: 40px; }
.project-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.project-card { padding: 16px; border: 1px solid #e8e8e8; border-radius: 10px; cursor: pointer; transition: border-color 0.2s; }
.project-card:hover { border-color: #1677ff; }
.project-card strong { display: block; margin-bottom: 4px; }
.project-card span { font-size: 13px; color: #999; }
</style>
@media (max-width: 768px) {
  .upload-view {
    padding: 20px 12px;
  }
  .hero h1 {
    font-size: 20px;
  }
  .project-list {
    grid-template-columns: 1fr;
  }
}