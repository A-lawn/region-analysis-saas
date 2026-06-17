import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'quick-analysis',
      component: () => import('@/views/SiteWorkbenchView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/upload',
      name: 'upload',
      component: () => import('@/views/UploadView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/project/:id',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/report/:id',
      name: 'report',
      component: () => import('@/views/ReportView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/pricing',
      name: 'pricing',
      component: () => import('@/views/PricingView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/apikeys',
      name: 'apikeys',
      component: () => import('@/views/ApiKeysView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/legal/privacy',
      name: 'privacy',
      component: () => import('@/views/legal/PrivacyPolicyView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/legal/terms',
      name: 'terms',
      component: () => import('@/views/legal/TermsOfServiceView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/legal/datasource',
      name: 'datasource',
      component: () => import('@/views/legal/DataSourceView.vue'),
      meta: { requiresAuth: false },
    },
  ],
})

// Auth route guard
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    next({ name: 'login' })
  } else {
    next()
  }
})

export default router
