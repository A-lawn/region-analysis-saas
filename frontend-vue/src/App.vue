<template>
  <div id="app-root">
    <nav id="top-nav" v-if="!isReportPage">
      <div class="nav-brand" @click="router.push({ name: 'quick-analysis' })">
        <span class="logo-icon">
          <AppIcon name="chart" :size="22" />
        </span>
        <span class="logo-text">区域数据分析平台</span>
      </div>
      <div class="nav-actions">
        <template v-if="authStore.isLoggedIn">
          <span class="nav-user">{{ authStore.user?.email }}</span>
          <button class="btn btn-sm" @click="router.push({ name: 'quick-analysis' })">
            <AppIcon name="target" :size="14" />快速分析
          </button>
          <button class="btn btn-sm btn-outline" @click="router.push({ name: 'upload' })">
            <AppIcon name="plus" :size="14" />我的数据
          </button>
          <button class="btn btn-sm btn-outline" @click="handleLogout">
            <AppIcon name="logout" :size="14" />登出
          </button>
        </template>
        <button v-else class="btn btn-sm btn-primary" @click="router.push({ name: 'login' })">登录</button>
      </div>
    </nav>
    <main id="app-container">
      <router-view />
    </main>
    <footer id="app-footer" v-if="!isReportPage">
      <div class="footer-links">
        <router-link to="/legal/privacy">隐私政策</router-link>
        <router-link to="/legal/terms">服务协议</router-link>
        <router-link to="/legal/datasource">数据来源与算法说明</router-link>
      </div>
      <span class="footer-copy">&copy; 2026 区域数据分析平台。分析结果仅供参考，不构成商业承诺。</span>
      <span class="footer-icp" v-if="icpNumber">
        <a :href="'https://beian.miit.gov.cn/'" target="_blank" rel="noopener">{{ icpNumber }}</a>
      </span>
    </footer>
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import ToastContainer from '@/components/shared/ToastContainer.vue'
import AppIcon from '@/components/shared/AppIcon.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const configStore = useConfigStore()

const isReportPage = computed(() => (route.name as string) === 'report')

onMounted(() => { configStore.fetchConfig(); authStore.restoreUser() })
const icpNumber = ref('') // 备案后填入，如 "陕ICP备2026XXXXXX号"


async function handleLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authStore.accessToken },
    })
  } catch {}
  authStore.logout()
  router.push({ name: 'login' })
}
</script>

<style scoped>
#app-footer {
  border-top: 1px solid var(--color-border-light);
  padding: var(--space-3) var(--space-4);
  text-align: center;
  background: var(--color-bg-card);
}
.footer-links {
  display: flex; justify-content: center; gap: var(--space-4);
  margin-bottom: var(--space-1);
}
.footer-links a {
  font-size: var(--text-xs); color: var(--color-text-tertiary); text-decoration: none;
}
.footer-links a:hover { color: var(--color-accent); text-decoration: underline; }
.footer-copy {
  font-size: 11px; color: var(--color-text-tertiary);
}

.footer-icp { font-size: 11px; color: var(--color-text-tertiary); }
.footer-icp a { color: var(--color-text-tertiary); text-decoration: none; }
.footer-icp a:hover { color: var(--color-accent); }
</style>
