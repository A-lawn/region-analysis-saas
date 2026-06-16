<template>
  <div id="app-root">
    <nav id="top-nav" v-if="!isReportPage">
      <div class="nav-brand" @click="router.push({ name: 'site-workbench' })">
        <span class="logo-icon">
          <AppIcon name="chart" :size="22" />
        </span>
        <span class="logo-text">区域数据分析平台</span>
      </div>
      <div class="nav-actions">
        <template v-if="authStore.isLoggedIn">
          <span class="nav-user">{{ authStore.user?.email }}</span>
          <button class="btn btn-sm" @click="router.push({ name: 'site-workbench' })">
            <AppIcon name="target" :size="14" />选址分析
          </button>
          <button class="btn btn-sm btn-outline" @click="router.push({ name: 'upload' })">
            <AppIcon name="plus" :size="14" />导入数据
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
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ToastContainer from '@/components/shared/ToastContainer.vue'
import AppIcon from '@/components/shared/AppIcon.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isReportPage = computed(() => (route.name as string) === 'report')

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
