<template>
  <view class="page-shell login-page">
    <view class="phone-shell">
      <view class="login-topbar">
        <button class="nav-button" hover-class="nav-button-hover" @click="() => goBack()">
          <text class="nav-chevron">‹</text>
          <text class="nav-text">返回</text>
        </button>
        <text class="topbar-title">微信登录</text>
        <view class="topbar-spacer"></view>
      </view>

      <view class="login-content">
        <view class="login-panel">
          <text class="eyebrow">CYBER-PENDANT</text>
          <text class="login-title">登录后管理校服绑定</text>
          <text class="login-copy">绑定、报失和取消报失会记录到当前微信用户。</text>

          <button
            class="login-button"
            :disabled="submitting"
            hover-class="login-button-hover"
            @click="() => handleLogin()"
          >
            {{ submitting ? '登录中' : '微信一键登录' }}
          </button>

          <text v-if="message" class="message-text">{{ message }}</text>
        </view>
      </view>

      <AppFooter active="user" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import AppFooter from '../../components/AppFooter.vue';
import { loginWechat, saveUserSession } from '../../utils/api.js';

const submitting = ref(false);
const message = ref('');
const redirectUrl = ref('/pages/user/index');

onLoad((query) => {
  const redirect = String(query?.redirect || '').trim();
  if (redirect) {
    redirectUrl.value = decodeURIComponent(redirect);
  }
});

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    uni.navigateBack();
    return;
  }

  uni.reLaunch({
    url: '/pages/index/index'
  });
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: resolve,
      fail: reject
    });
  });
}

function returnAfterLogin() {
  const target = redirectUrl.value || '/pages/user/index';

  if (target === '/pages/index/index') {
    uni.reLaunch({ url: target });
    return;
  }

  uni.redirectTo({ url: target });
}

async function handleLogin() {
  message.value = '';
  submitting.value = true;

  try {
    const loginResult = await wxLogin();
    const code = loginResult?.code;
    if (!code) {
      throw new Error('微信登录未返回授权码');
    }

    const session = await loginWechat(code);
    saveUserSession(session);
    uni.showToast({
      title: '登录成功',
      icon: 'success'
    });
    setTimeout(returnAfterLogin, 450);
  } catch (error) {
    message.value = error.message || error.errMsg || '登录失败，请稍后再试。';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: #f7f3ec;
}

.phone-shell {
  height: 100vh;
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, #f7f3ec 100%);
  color: #151515;
  padding-top: constant(safe-area-inset-top);
  padding-top: env(safe-area-inset-top);
}

/* #ifdef MP-WEIXIN */
.phone-shell {
  padding-top: 88rpx;
}
/* #endif */

.login-topbar {
  flex: 0 0 auto;
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 128rpx minmax(0, 1fr) 128rpx;
  align-items: center;
  min-height: 108rpx;
  padding: 0 34rpx;
  border-bottom: 1px solid rgba(210, 202, 190, 0.78);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(18rpx);
}

.nav-button,
.login-button {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  line-height: normal;
}

.nav-button::after,
.login-button::after {
  border: 0;
}

.nav-button {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  min-width: 118rpx;
  min-height: 74rpx;
  padding: 0 20rpx 0 14rpx;
  border: 1px solid rgba(213, 202, 185, 0.9);
  border-radius: 999rpx;
  background: rgba(255, 253, 248, 0.82);
  color: #36312a;
  font-size: 26rpx;
  font-weight: 600;
}

.nav-button-hover {
  border-color: rgba(126, 158, 111, 0.48);
  background: #f8fbf4;
  color: #4f7f46;
}

.nav-chevron,
.nav-text,
.topbar-title {
  display: block;
  line-height: 1;
}

.nav-chevron {
  margin-top: -2rpx;
  font-size: 38rpx;
}

.nav-text {
  font-size: 25rpx;
  font-weight: 670;
}

.topbar-title {
  text-align: center;
  font-size: 32rpx;
  font-weight: 680;
  line-height: 1.2;
}

.login-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  align-items: center;
  padding: 42rpx 36rpx;
}

.login-panel {
  width: 100%;
  padding: 48rpx 38rpx;
  border: 1px solid #ded5c9;
  border-radius: 16rpx;
  background: rgba(255, 252, 245, 0.94);
  box-shadow: 0 14rpx 34rpx rgba(74, 63, 45, 0.08);
}

.eyebrow,
.login-title,
.login-copy,
.message-text {
  display: block;
}

.eyebrow {
  margin-bottom: 14rpx;
  color: #7a7167;
  font-size: 22rpx;
  font-weight: 760;
}

.login-title {
  font-size: 42rpx;
  font-weight: 760;
  line-height: 1.2;
}

.login-copy {
  margin-top: 18rpx;
  color: #655f57;
  font-size: 27rpx;
  line-height: 1.65;
}

.login-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 92rpx;
  margin-top: 38rpx;
  border-radius: 999rpx;
  background: #151515;
  color: #fff;
  font-size: 29rpx;
  font-weight: 760;
}

.login-button-hover {
  background: #2c3b29;
}

.message-text {
  margin-top: 22rpx;
  color: #9a4b38;
  font-size: 25rpx;
  line-height: 1.5;
}
</style>
