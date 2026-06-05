import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null)
  const accessToken = ref<string | null>(localStorage.getItem('accessToken'))

  const isLoggedIn = computed(() => !!accessToken.value)

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

  return { user, accessToken, isLoggedIn, setAuth, logout }
})
