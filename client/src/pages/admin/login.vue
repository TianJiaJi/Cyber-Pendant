<template>
  <view class="page-shell login-page">
    <view class="login-panel">
      <text class="eyebrow">ADMIN CONSOLE</text>
      <text class="login-title">Cyber-Pendant 管理后台</text>
      <text class="muted-text">录入吊牌信息，生成 SN 码和二维码。</text>

      <view class="login-form">
        <view>
          <text class="field-label">用户名</text>
          <input v-model="username" class="form-input" placeholder="admin" />
        </view>
        <view>
          <text class="field-label">密码</text>
          <input
            v-model="password"
            class="form-input"
            password
            placeholder="admin123456"
            @confirm="submit"
          />
        </view>
        <button class="primary-button" :disabled="loading" @click="submit">
          {{ loading ? '登录中' : '登录后台' }}
        </button>
        <button class="ghost-button" @click="goHome">返回前台</button>
        <text v-if="message" class="message-text">{{ message }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getToken, login, saveToken } from '../../utils/api.js';

const username = ref('admin');
const password = ref('');
const loading = ref(false);
const message = ref('');

onLoad(() => {
  if (getToken()) {
    uni.redirectTo({
      url: '/pages/admin/dashboard'
    });
  }
});

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
    uni.redirectTo({
      url: '/pages/admin/dashboard'
    });
  } catch (error) {
    message.value = error.message || '登录失败。';
  } finally {
    loading.value = false;
  }
}

function goHome() {
  uni.reLaunch({
    url: '/pages/index/index'
  });
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 36rpx;
}

.login-panel {
  width: 100%;
  max-width: 760rpx;
  padding: 42rpx;
  border: 1px solid #ddd6cc;
  border-radius: 8rpx;
  background: #fffdf9;
}

.eyebrow {
  display: block;
  color: #746e65;
  font-size: 22rpx;
  font-weight: 700;
}

.login-title {
  display: block;
  margin: 24rpx 0 14rpx;
  color: #121212;
  font-size: 44rpx;
  font-weight: 680;
}

.login-form {
  display: grid;
  gap: 22rpx;
  margin-top: 36rpx;
}

.message-text {
  color: #8d3c22;
  font-size: 24rpx;
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
