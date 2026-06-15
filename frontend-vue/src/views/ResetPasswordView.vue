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
          <router-link :to="{ name: `login` }">返回登录</router-link>
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
