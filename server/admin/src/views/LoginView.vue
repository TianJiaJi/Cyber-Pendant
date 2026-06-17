<template>
  <div class="page-shell login-page">
    <div class="login-panel">
      <span class="eyebrow">ADMIN CONSOLE</span>
      <span class="login-title">Cyber-Pendant 管理后台</span>
      <span class="muted-text">录入吊牌信息，生成 SN 码和二维码。</span>

      <div class="login-form">
        <div>
          <span class="field-label">用户名</span>
          <input v-model="username" class="form-input" placeholder="admin" />
        </div>
        <div>
          <span class="field-label">密码</span>
          <input
            v-model="password"
            class="form-input"
            type="password"
            placeholder="admin123456"
            @keyup.enter="submit"
          />
        </div>
        <button class="primary-button" :disabled="loading" @click="submit">
          {{ loading ? '登录中' : '登录后台' }}
        </button>
        <button class="ghost-button" @click="goHome">返回前台</button>
        <span v-if="message" class="message-text">{{ message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { FRONTEND_BASE_URL, login, saveToken } from '../utils/api.js';

const username = ref('admin');
const password = ref('');
const loading = ref(false);
const message = ref('');
const route = useRoute();
const router = useRouter();

async function submit() {
  message.value = '';

  if (!username.value.trim() || !password.value) {
    message.value = '请输入用户名和密码。';
    return;
  }

  loading.value = true;
  try {
    const response = await login(username.value.trim(), password.value);
    saveToken(response.token);
    router.replace(String(route.query.redirect || '/dashboard'));
  } catch (error) {
    message.value = error.message || '登录失败。';
  } finally {
    loading.value = false;
  }
}

function goHome() {
  window.open(FRONTEND_BASE_URL, '_blank', 'noopener,noreferrer');
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 18px;
}

.login-panel {
  width: 100%;
  max-width: 380px;
  padding: 21px;
  border: 1px solid #ddd6cc;
  border-radius: 4px;
  background: #fffdf9;
}

.eyebrow {
  display: block;
  color: #746e65;
  font-size: 11px;
  font-weight: 700;
}

.login-title {
  display: block;
  margin: 12px 0 7px;
  color: #121212;
  font-size: 22px;
  font-weight: 680;
}

.login-form {
  display: grid;
  gap: 11px;
  margin-top: 18px;
}

.message-text {
  color: #8d3c22;
  font-size: 12px;
}

@media (min-width: 760px) {
  .login-panel {
    max-width: 420px;
    padding: 32px;
  }

  .login-title {
    font-size: 30px;
  }
}
</style>
