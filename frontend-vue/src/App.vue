<template>
  <div id="app-root">
    <nav id="top-nav" v-if="!isReportPage">
      <div class="nav-brand" @click="router.push({ name: 'upload' })">
        <span class="logo-icon">📊</span>
        <span class="logo-text">区域数据分析平台</span>
      </div>
      <div class="nav-actions">
        <template v-if="authStore.isLoggedIn">
          <span class="nav-user">{{ authStore.user?.email }}</span>
          <button class="btn btn-sm" @click="router.push({ name: 'upload' })">新建项目</button>
          <button class="btn btn-sm btn-outline" @click="handleLogout">登出</button>
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