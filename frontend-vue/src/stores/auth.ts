import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null)
  const accessToken = ref<string | null>(localStorage.getItem('accessToken'))

  const isLoggedIn = computed(() => !!accessToken.value)
  const isPro = computed(() => user.value?.subscriptionTier === 'pro')
  const isFree = computed(() => isLoggedIn.value && !isPro.value)

  async function restoreUser() {
    if (!accessToken.value) return
    try {
      const resp = await fetch('/api/auth/me', {
        headers: { Authorization: 'Bearer ' + accessToken.value },
      })
      if (resp.ok) {
        const data = await resp.json()
        user.value = data as UserInfo
      } else {
        logout()
      }
    } catch {
      // Network error, keep existing state
    }
  }

  function setAuth(token: string, u: UserInfo) {
    accessToken.value = token
    user.value = u
    localStorage.setItem('accessToken', token)
  }

  function logout() {
    accessToken.value = null
    user.value = null
    localStorage.removeItem('accessToken')
  }

  return { user, accessToken, isLoggedIn, isPro, isFree, setAuth, logout, restoreUser }
})
