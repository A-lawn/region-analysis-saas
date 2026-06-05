<template>
  <div class="login-view">
    <div class="login-card">
      <h2>区域数据分析平台</h2>

      <!-- Tab: login / register -->
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
        <div v-if="error" class="error-msg">{{ error }}</div>
        <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>
        <button class="btn btn-primary btn-block" :disabled="submitting">
          {{ submitting ? '处理中...' : mode === 'login' ? '登录' : '注册' }}
        </button>
        <p v-if="mode === 'login'" class="link-text">
          <a href="#" @click.prevent="openForgot">忘记密码？</a>
        </p>
      </form>

      <!-- OTP verification screen -->
      <div v-if="showVerify" class="verify-section">
        <div class="verify-icon">📧</div>
        <h3>验证邮箱</h3>
        <p>验证码已发送至 <strong>{{ email }}</strong>，请查收邮件并输入6位验证码。</p>
        <form @submit.prevent="verifyEmail">
          <div class="field">
            <label>邮箱验证码</label>
            <input v-model="otpCode" type="text" placeholder="6位数字验证码" maxlength="6" required autocomplete="one-time-code" />
          </div>
          <div v-if="error" class="error-msg">{{ error }}</div>
          <button class="btn btn-primary btn-block" :disabled="verifying">
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
          <button class="btn btn-primary btn-block" :disabled="submitting">
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

onMounted(refreshCaptcha)

async function submit() {
  if (!captchaCode.value) { error.value = '请输入验证码'; return }
  error.value = ''
  successMsg.value = ''
  submitting.value = true
  try {
    if (mode.value === 'register') {
      const { data } = await axios.post('/api/auth/register', {
        email: email.value.trim(),
        password: password.value,
        captchaId: captchaId.value,
        captchaCode: captchaCode.value,
      })
      if (data.requiresVerification) {
        showVerify.value = true
        successMsg.value = '注册成功！验证码已发送至您的邮箱'
        return
      }
      authStore.setAuth(data.accessToken, data.user)
      show('注册成功', 'success')
      router.push({ name: 'upload' })
    } else {
      const { data } = await axios.post('/api/auth/login', {
        email: email.value.trim(),
        password: password.value,
        captchaId: captchaId.value,
        captchaCode: captchaCode.value,
      })
      authStore.setAuth(data.accessToken, data.user)
      show('登录成功', 'success')
      router.push({ name: 'upload' })
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
    router.push({ name: 'upload' })
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
</script>

<style scoped>
.login-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f5f5f5;
}
.login-card {
  background: #fff;
  padding: 40px;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  width: min(420px, 95vw);
  max-width: 95vw;
}
.login-card h2 { text-align: center; margin: 0 0 24px; font-size: 22px; }
.tabs { display: flex; margin-bottom: 20px; border-bottom: 2px solid #f0f0f0; }
.tabs button { flex: 1; padding: 10px; border: none; background: none; font-size: 15px; cursor: pointer; color: #999; }
.tabs button.active { color: #1677ff; border-bottom: 2px solid #1677ff; margin-bottom: -2px; }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #333; }
.field input { width: 100%; padding: 10px 12px; border: 1px solid #d9d9d9; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
.captcha-field { margin-bottom: 16px; }
.captcha-row { display: flex; gap: 10px; align-items: center; }
.captcha-row input { flex: 1; min-width: 0; }
.captcha-img { height: 42px; cursor: pointer; border: 1px solid #d9d9d9; border-radius: 8px; overflow: hidden; flex-shrink: 0; }
.captcha-img:hover { border-color: #1677ff; }
.captcha-img :deep(svg) { height: 40px; width: auto; }
.error-msg { color: #ff4d4f; font-size: 13px; margin-bottom: 12px; padding: 8px 12px; background: #fff2f0; border-radius: 6px; border: 1px solid #ffccc7; }
.success-msg { color: #389e0d; font-size: 13px; margin-bottom: 12px; padding: 8px 12px; background: #f6ffed; border-radius: 6px; border: 1px solid #b7eb8f; }
.btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
.btn-primary { background: #1677ff; color: #fff; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-block { width: 100%; }
.link-text { text-align: center; margin-top: 14px; font-size: 13px; color: #999; }
.link-text a { color: #1677ff; text-decoration: none; }
.link-text a:hover { text-decoration: underline; }
.verify-section, .forgot-section { text-align: center; }
.verify-icon { font-size: 48px; margin-bottom: 8px; }
.verify-section h3, .forgot-section h3 { margin: 0 0 12px; font-size: 18px; }
.verify-section p, .forgot-section p { color: #666; font-size: 14px; margin-bottom: 20px; line-height: 1.6; }
.verify-section form, .forgot-section form { text-align: left; }
</style>