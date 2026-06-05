import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const apiClient = axios.create({
  baseURL: '/api/web',
  timeout: 300000, // 5 min for analyses
  headers: { 'Content-Type': 'application/json' },
})

// Attach auth token
apiClient.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  if (authStore.accessToken) {
    config.headers.Authorization = `Bearer ${authStore.accessToken}`
  }
  return config
})

// Handle 401
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const authStore = useAuthStore()
      authStore.logout()
      window.location.hash = '#/login'
    }
    return Promise.reject(err)
  }
)

export default apiClient
