<template>
  <div class="apikeys-view">
    <div class="page-header">
      <button class="btn-back" @click="router.push({ name: 'upload' })">
        <AppIcon name="chevron-left" :size="16" />返回
      </button>
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
      <div v-else-if="!keys.length" class="empty-state">
        <AppIcon name="key" :size="28" color="var(--color-text-tertiary)" />
        <p>暂无 API Key</p>
      </div>
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
              <button class="btn btn-sm" style="color: var(--color-error)" @click="deleteKey(k.id)">
                <AppIcon name="trash" :size="12" />删除
              </button>
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
import AppIcon from '@/components/shared/AppIcon.vue'
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
  padding: var(--space-10) var(--space-5);
}

.page-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.page-header h2 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  letter-spacing: -0.02em;
}

.section {
  background: var(--color-bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
  box-shadow: var(--shadow-card);
}

.section h3 {
  margin: 0 0 var(--space-4);
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
}

.create-form {
  display: flex;
  gap: var(--space-3);
  align-items: flex-end;
}

.field {
  flex: 1;
}

.field label {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  margin-bottom: var(--space-1);
  color: var(--color-text-secondary);
}

.loading {
  color: var(--color-text-tertiary);
  text-align: center;
  padding: var(--space-5);
}

.empty-state {
  text-align: center;
  padding: var(--space-8);
  color: var(--color-text-tertiary);
}

.empty-state p {
  margin-top: var(--space-2);
}

.keys-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
}

.keys-table th,
.keys-table td {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.keys-table th {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.keys-table code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-accent);
  background: var(--color-accent-subtle);
  padding: 1px 6px;
  border-radius: 4px;
}

@media (max-width: 768px) {
  .apikeys-view {
    padding: var(--space-5) var(--space-3);
  }
  .create-form {
    flex-direction: column;
  }
}
</style>
