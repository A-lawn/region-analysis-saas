<template>
  <div class="apikeys-view">
    <div class="page-header">
      <button class="btn-back" @click="router.push({ name: 'upload' })">← 返回</button>
      <h2>API Key 管理</h2>
    </div>

    <div class="section">
      <h3>创建 API Key</h3>
      <form @submit.prevent="createKey" class="create-form">
        <div class="field">
          <label>名称</label>
          <input v-model="newKeyName" placeholder="例如: 内部数据管道" required />
        </div>
        <button class="btn btn-primary" :disabled="creating">
          {{ creating ? '创建中...' : '创建' }}
        </button>
      </form>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div class="section">
      <h3>已有 API Key</h3>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="!keys.length" class="empty">暂无 API Key</div>
      <table v-else class="keys-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>Key</th>
            <th>创建时间</th>
            <th>最后使用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="k in keys" :key="k.id">
            <td>{{ k.name }}</td>
            <td><code>{{ k.api_key }}</code></td>
            <td>{{ formatDate(k.created_at) }}</td>
            <td>{{ k.last_used_at ? formatDate(k.last_used_at) : '-' }}</td>
            <td>
              <button class="btn btn-danger btn-sm" @click="deleteKey(k.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import axios from 'axios'

const router = useRouter()
const { show } = useToast()

const newKeyName = ref('')
const creating = ref(false)
const loading = ref(true)
const error = ref('')
const keys = ref<any[]>([])

async function fetchKeys() {
  loading.value = true
  try {
    const { data } = await axios.get('/api/v1/apikeys')
    keys.value = data.keys || []
  } catch (e: any) {
    error.value = e.response?.data?.error || '加载失败'
  } finally {
    loading.value = false
  }
}

async function createKey() {
  creating.value = true
  error.value = ''
  try {
    await axios.post('/api/v1/apikeys', { name: newKeyName.value })
    newKeyName.value = ''
    show('API Key 创建成功', 'success')
    await fetchKeys()
  } catch (e: any) {
    error.value = e.response?.data?.error || '创建失败'
    show(error.value, 'error')
  } finally {
    creating.value = false
  }
}

async function deleteKey(id: string) {
  try {
    await axios.delete(`/api/v1/apikeys/${id}`)
    show('API Key 已删除', 'success')
    await fetchKeys()
  } catch (e: any) {
    show(e.response?.data?.error || '删除失败', 'error')
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('zh-CN')
}

onMounted(fetchKeys)
</script>

<style scoped>
.apikeys-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
}
.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.page-header h2 {
  margin: 0;
}
.btn-back {
  background: none;
  border: none;
  color: #1677ff;
  font-size: 14px;
  cursor: pointer;
}
.section {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}
.section h3 {
  margin: 0 0 16px;
  font-size: 16px;
}
.create-form {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
.field {
  flex: 1;
}
.field label {
  display: block;
  font-size: 13px;
  margin-bottom: 4px;
}
.field input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}
.btn-primary {
  background: #1677ff;
  color: #fff;
}
.btn-primary:disabled {
  opacity: 0.6;
}
.btn-danger {
  background: #ff4d4f;
  color: #fff;
}
.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}
.error-msg {
  color: #ff4d4f;
  font-size: 13px;
  padding: 8px;
  background: #fff2f0;
  border-radius: 6px;
  margin-bottom: 16px;
}
.loading, .empty {
  color: #999;
  text-align: center;
  padding: 20px;
}
.keys-table {
  width: 100%;
  border-collapse: collapse;
}
.keys-table th, .keys-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
}
.keys-table th {
  background: #fafafa;
  font-weight: 600;
}
.keys-table code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
@media (max-width: 768px) {
  .apikeys-view {
    padding: 20px 12px;
  }
  .create-form {
    flex-direction: column;
  }
}