<template>
  <div class="login-view">
    <div class="login-bg-glow"></div>
    <div class="login-card">
      <h2>区域数据分析平台</h2>
      <p class="login-subtitle">重置密码</p>

      <div class="reset-section">
        <p>请输入新密码，至少8位且必须包含字母和数字。</p>
        <form @submit.prevent="submitReset">
          <div class="field">
            <label>新密码</label>
            <input v-model="password" type="password" placeholder="至少8位，须含字母和数字" required minlength="8" autocomplete="new-password" />
          </div>
          <div class="field">
            <label>确认密码</label>
            <input v-model="confirmPassword" type="password" placeholder="再次输入新密码" required minlength="8" autocomplete="new-password" />
          </div>
          <div v-if="error" class="error-msg">{{ error }}</div>
          <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>
          <button class="btn btn-primary btn-block login-submit" :disabled="submitting">
            {{ submitting ? "重置中..." : "重置密码" }}
          </button>
        </form>
        <p class="link-text">
          <router-link :to="{ name: 'login' }">返回登录</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import axios from "axios"

const route = useRoute()
const router = useRouter()

const token = ref((route.query.token as string) || "")
const password = ref("")
const confirmPassword = ref("")
const error = ref("")
const successMsg = ref("")
const submitting = ref(false)

async function submitReset() {
  error.value = ""
  successMsg.value = ""

  if (!token.value) {
    error.value = "重置链接无效，请重新申请密码重置"
    return
  }

  if (password.value.length < 8) {
    error.value = "密码至少8位"
    return
  }

  const pwRegex = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/
  if (!pwRegex.test(password.value)) {
    error.value = "密码必须同时包含字母和数字"
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = "两次输入的密码不一致"
    return
  }

  submitting.value = true
  try {
    const { data } = await axios.post("/api/auth/reset-password", {
      token: token.value,
      password: password.value,
    })
    successMsg.value = data.message || "密码重置成功"
    setTimeout(() => {
      router.push({ name: "login" })
    }, 2000)
  } catch (e: any) {
    error.value = e.response?.data?.error || "重置失败，请重新申请"
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

.reset-section {
  text-align: center;
}

.reset-section p {
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  margin-bottom: var(--space-5);
  line-height: var(--leading-relaxed);
}

.reset-section form {
  text-align: left;
}
</style>
