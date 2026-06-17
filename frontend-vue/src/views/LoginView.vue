<template>
  <div class="login-view">
    <div class="login-bg-glow"></div>
    <div class="login-card">
      <h2>区域数据分析平台</h2>
      <p class="login-subtitle">空间智能分析工具</p>

      <!-- Tab: login / register as pill group -->
      <div v-if="!showVerify && !showForgot" class="tabs">
        <button :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</button>
        <button :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</button>
      </div>

      <!-- Register/Login form -->
      <form v-if="!showVerify && !showForgot" @submit.prevent="submit">
        <div class="field">
          <label>邮箱</label>
          <input v-model="email" type="email" placeholder="your@email.com" required autocomplete="email" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="至少8位，须含字母和数字" required minlength="8" autocomplete="current-password" />
        </div>
        <!-- Captcha -->
        <div class="field captcha-field">
          <label>验证码</label>
          <div class="captcha-row">
            <input v-model="captchaCode" type="text" placeholder="图片验证码" maxlength="4" required autocomplete="off" />
            <div class="captcha-img" v-html="captchaSvg" @click="refreshCaptcha" title="点击刷新"></div>
          </div>
        </div>
        <!-- 注册协议勾选 -->
        <div v-if="mode === 'register'" class="consent-field">
          <label class="consent-label">
            <input type="checkbox" v-model="agreedToTerms" class="consent-checkbox" />
            <span class="consent-text">
              我已阅读并同意
              <router-link to="/legal/privacy" target="_blank">《隐私政策》</router-link>和
              <router-link to="/legal/terms" target="_blank">《服务协议》</router-link>
            </span>
          </label>
        </div>
        <div v-if="error" class="error-msg">{{ error }}</div>
        <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>
        <button class="btn btn-primary btn-block login-submit" :disabled="submitting || (mode === 'register' && !agreedToTerms)">
          {{ submitting ? '处理中...' : mode === 'login' ? '登录' : '注册' }}
        </button>
        <p v-if="mode === 'login'" class="link-text">
          <a href="#" @click.prevent="openForgot">忘记密码？</a>
        </p>
      </form>

      <!-- OTP verification screen -->
      <div v-if="showVerify" class="verify-section">
        <div class="verify-icon">
          <AppIcon name="mail" :size="40" />
        </div>
        <h3>验证邮箱</h3>
        <p>验证码已发送至 <strong>{{ email }}</strong>，请查收邮件并输入6位验证码。</p>
        <form @submit.prevent="verifyEmail">
          <div class="field">
            <label>邮箱验证码</label>
            <input v-model="otpCode" type="text" placeholder="6位数字验证码" maxlength="6" required autocomplete="one-time-code" />
          </div>
          <div v-if="error" class="error-msg">{{ error }}</div>
          <button class="btn btn-primary btn-block login-submit" :disabled="verifying">
            {{ verifying ? '验证中...' : '确认验证' }}
          </button>
        </form>
        <p class="link-text">
          未收到邮件？
          <a href="#" @click.prevent="resendOtp">重新发送</a>
          &nbsp;|&nbsp;
          <a href="#" @click.prevent="switchMode('login')">返回登录</a>
        </p>
      </div>

      <!-- Forgot password screen -->
      <div v-if="showForgot" class="forgot-section">
        <h3>重置密码</h3>
        <p>输入注册邮箱，我们将发送重置链接。</p>
        <form @submit.prevent="submitForgot">
          <div class="field">
            <label>注册邮箱</label>
            <input v-model="email" type="email" placeholder="your@email.com" required />
          </div>
          <div v-if="error" class="error-msg">{{ error }}</div>
          <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>
          <button class="btn btn-primary btn-block login-submit" :disabled="submitting">
            {{ submitting ? '发送中...' : '发送重置邮件' }}
          </button>
        </form>
        <p class="link-text">
          <a href="#" @click.prevent="switchMode('login')">返回登录</a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import AppIcon from '@/components/shared/AppIcon.vue'
import axios from 'axios'

const router = useRouter()
const authStore = useAuthStore()
const { show } = useToast()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const captchaCode = ref('')
const captchaId = ref('')
const captchaSvg = ref('')
const error = ref('')
const successMsg = ref('')
const submitting = ref(false)

// OTP state
const showVerify = ref(false)
const otpCode = ref('')
const agreedToTerms = ref(false)
const verifying = ref(false)

// Forgot password state
const showForgot = ref(false)

async function refreshCaptcha() {
  try {
    const { data } = await axios.get('/api/auth/captcha')
    captchaId.value = data.captchaId
    captchaSvg.value = data.svg
  } catch {}
}

function switchMode(m: 'login' | 'register') {
  mode.value = m
  error.value = ''
  successMsg.value = ''
  showVerify.value = false
  showForgot.value = false
  captchaCode.value = ''
  otpCode.value = ''
  refreshCaptcha()
}

function openForgot() {
  showForgot.value = true
  error.value = ''
  successMsg.value = ''
}

async function submit() {
  error.value = ''
  successMsg.value = ''
  if (!email.value || !password.value || !captchaCode.value) {
    error.value = '请填写所有字段'
    return
  }
  submitting.value = true
  try {
    if (mode.value === 'register') {
      const { data } = await axios.post('/api/auth/register', {
        email: email.value.trim(),
        password: password.value,
        captchaId: captchaId.value,
        captchaCode: captchaCode.value,
        agreedToTerms: mode.value === 'register' ? true : undefined,
      })
      if (data.requiresVerification) {
        showVerify.value = true
        successMsg.value = '注册成功！验证码已发送至您的邮箱'
        return
      }
      authStore.setAuth(data.accessToken, data.user)
      show('注册成功', 'success')
      const t1 = data.user.subscriptionTier === 'pro' ? 'upload' : 'quick-analysis'
      router.push({ name: t1 })
    } else {
      const { data } = await axios.post('/api/auth/login', {
        email: email.value.trim(),
        password: password.value,
        captchaId: captchaId.value,
        captchaCode: captchaCode.value,

      })
      authStore.setAuth(data.accessToken, data.user)
      show('登录成功', 'success')
      const t2 = data.user.subscriptionTier === 'pro' ? 'upload' : 'quick-analysis'
      router.push({ name: t2 })
    }
  } catch (e: any) {
    error.value = e.response?.data?.error || '操作失败'
    refreshCaptcha()
  } finally {
    submitting.value = false
  }
}

async function verifyEmail() {
  if (otpCode.value.length !== 6) { error.value = '请输入6位验证码'; return }
  error.value = ''
  verifying.value = true
  try {
    const { data } = await axios.post('/api/auth/verify-email', {
      email: email.value.trim(),
      otp: otpCode.value,
    })
    authStore.setAuth(data.accessToken, data.user)
    show('注册成功！', 'success')
    const t3 = data.user.subscriptionTier === 'pro' ? 'upload' : 'quick-analysis'
    router.push({ name: t3 })
  } catch (e: any) {
    error.value = e.response?.data?.error || '验证失败'
  } finally {
    verifying.value = false
  }
}

async function resendOtp() {
  error.value = ''
  submitting.value = true
  try {
    await axios.post('/api/auth/register', {
      email: email.value.trim(),
      password: password.value,
      captchaId: captchaId.value,
      captchaCode: captchaCode.value,
      agreedToTerms: true,

    })
    successMsg.value = '验证码已重新发送，请查收邮件'
    refreshCaptcha()
  } catch (e: any) {
    error.value = e.response?.data?.error || '发送失败'
  } finally {
    submitting.value = false
  }
}

async function submitForgot() {
  error.value = ''
  successMsg.value = ''
  submitting.value = true
  try {
    const { data } = await axios.post('/api/auth/forgot-password', { email: email.value.trim() })
    successMsg.value = data.message || '重置邮件已发送'
  } catch (e: any) {
    error.value = e.response?.data?.error || '发送失败'
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  refreshCaptcha()
})
</script>

<style scoped>
.login-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--color-bg-primary);
  position: relative;
  overflow: hidden;
}

.login-bg-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 600px;
  height: 600px;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(0, 122, 255, 0.06) 0%, transparent 70%);
  pointer-events: none;
}

.login-card {
  position: relative;
  background: var(--color-bg-card);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  padding: var(--space-10);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  width: min(420px, 90vw);
  max-width: 90vw;
  border: 1px solid var(--color-border);
}

.login-card h2 {
  text-align: center;
  margin: 0 0 var(--space-1);
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  letter-spacing: -0.01em;
}

.login-subtitle {
  text-align: center;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-6);
}

.tabs {
  display: flex;
  margin-bottom: var(--space-5);
  background: var(--color-bg-input);
  border-radius: var(--radius-full);
  padding: 3px;
}

.tabs button {
  flex: 1;
  padding: 8px var(--space-4);
  border: none;
  background: none;
  font-size: var(--text-sm);
  font-family: var(--font-system);
  font-weight: var(--font-medium);
  cursor: pointer;
  color: var(--color-text-secondary);
  border-radius: var(--radius-full);
  transition: all var(--duration-fast) var(--ease-smooth);
}

.tabs button.active {
  background: var(--color-bg-card-solid);
  color: var(--color-text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.field {
  margin-bottom: var(--space-4);
}

.field label {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  margin-bottom: var(--space-1);
  color: var(--color-text-secondary);
}

.captcha-field {
  margin-bottom: var(--space-4);
}

.captcha-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.captcha-row input {
  flex: 1;
  min-width: 0;
}

.captcha-img {
  height: 42px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
  transition: border-color var(--duration-fast) var(--ease-smooth);
}

.captcha-img:hover {
  border-color: var(--color-accent);
}

.captcha-img :deep(svg) {
  height: 40px;
  width: auto;
}

.login-submit {
  margin-top: var(--space-2);
  padding: 12px;
  font-size: var(--text-base);
}

.link-text {
  text-align: center;
  margin-top: var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.verify-section,
.forgot-section {
  text-align: center;
}

.verify-icon {
  color: var(--color-accent);
  margin-bottom: var(--space-2);
}

.verify-section h3,
.forgot-section h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
}

.verify-section p,
.forgot-section p {
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  margin-bottom: var(--space-5);
  line-height: var(--leading-relaxed);
}

.verify-section form,
.forgot-section form {
  text-align: left;
}

.login-legal {
  margin-top: var(--space-4);
  text-align: center;
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  display: flex; justify-content: center; gap: var(--space-2);
}
.login-legal a { color: var(--color-text-tertiary); text-decoration: none; }
.login-legal a:hover { color: var(--color-accent); text-decoration: underline; }

/* 注册协议勾选 */
.consent-field { margin-bottom: var(--space-4); }
.consent-label { display: flex; align-items: flex-start; gap: var(--space-2); cursor: pointer; font-size: var(--text-sm); color: var(--color-text-secondary); }
.consent-checkbox { margin-top: 2px; flex-shrink: 0; accent-color: var(--color-accent); width: 16px; height: 16px; }
.consent-text a { color: var(--color-accent); text-decoration: none; }
.consent-text a:hover { text-decoration: underline; }
</style>