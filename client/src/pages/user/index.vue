<template>
  <view class="page-shell user-page">
    <view class="phone-shell">
      <view class="user-topbar">
        <view class="brand-block">
          <text class="brand-mark">用户中心</text>
          <text class="brand-subtitle">绑定与寻物记录</text>
        </view>
        <button v-if="loggedIn" class="ghost-button" hover-class="ghost-button-hover" @click="() => logout()">
          退出
        </button>
      </view>

      <view class="user-content">
        <view v-if="!loggedIn" class="empty-panel">
          <text class="empty-title">登录后查看你的校服</text>
          <text class="empty-copy">绑定、报失和取消报失都会归属到当前微信用户。</text>
          <button class="primary-button" hover-class="primary-button-hover" @click="() => goLogin()">
            微信登录
          </button>
        </view>

        <view v-else>
          <view class="summary-grid">
            <view class="summary-card">
              <text class="summary-value">{{ garments.length }}</text>
              <text class="summary-label">我的校服</text>
            </view>
            <view class="summary-card">
              <text class="summary-value">{{ activeReportCount }}</text>
              <text class="summary-label">有效报失</text>
            </view>
          </view>

          <text v-if="message" class="message-text">{{ message }}</text>

          <view class="section-block">
            <view class="section-heading">
              <text class="section-title">我的校服</text>
              <button class="refresh-button" hover-class="refresh-button-hover" @click="() => loadUserData()">
                刷新
              </button>
            </view>

            <view v-if="loading" class="list-empty">正在加载</view>
            <view v-else-if="garments.length === 0" class="list-empty">暂无绑定校服</view>
            <view v-else class="record-list">
              <button
                v-for="item in garments"
                :key="item.sn"
                class="record-card"
                hover-class="record-card-hover"
                @click="() => openGarment(item.sn)"
              >
                <view class="record-main">
                  <text class="record-title">{{ item.productName || '未命名校服' }}</text>
                  <text class="record-copy">{{ item.owner?.school || '未录入学校' }} · {{ item.owner?.className || '未录入班级' }}</text>
                  <text class="record-code">{{ item.sn }}</text>
                </view>
                <text :class="['record-status', item.lostReport ? 'lost' : '']">
                  {{ item.lostReport ? '报失中' : '正常' }}
                </text>
              </button>
            </view>
          </view>

          <view class="section-block">
            <text class="section-title">我的丢失报告</text>
            <view v-if="reports.length === 0" class="list-empty">暂无丢失报告</view>
            <view v-else class="compact-list">
              <view v-for="item in reports" :key="item.id" class="compact-row">
                <view>
                  <text class="compact-title">{{ item.garmentSn }}</text>
                  <text class="compact-copy">{{ reportStatusText(item.status) }} · {{ formatDate(item.createdAt) }}</text>
                </view>
                <text class="compact-meta">{{ item.contactRevealCount || 0 }} 次查看</text>
              </view>
            </view>
          </view>

          <view class="section-block">
            <text class="section-title">绑定记录</text>
            <view v-if="logs.length === 0" class="list-empty">暂无绑定记录</view>
            <view v-else class="compact-list">
              <view v-for="item in logs" :key="item.id" class="compact-row">
                <view>
                  <text class="compact-title">{{ actionText(item.action) }}</text>
                  <text class="compact-copy">{{ item.garmentSn }} · {{ formatDate(item.createdAt) }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <AppFooter active="user" />
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import AppFooter from '../../components/AppFooter.vue';
import {
  clearUserSession,
  getUserBindingLogs,
  getUserGarments,
  getUserLostReports,
  isLoggedIn
} from '../../utils/api.js';

const loggedIn = ref(isLoggedIn());
const loading = ref(false);
const message = ref('');
const garments = ref([]);
const reports = ref([]);
const logs = ref([]);

const activeReportCount = computed(() =>
  reports.value.filter((item) => item.status === 'active').length
);

onShow(() => {
  loggedIn.value = isLoggedIn();
  if (loggedIn.value) {
    loadUserData();
  }
});

function goLogin() {
  uni.navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent('/pages/user/index')}`
  });
}

function logout() {
  clearUserSession();
  loggedIn.value = false;
  garments.value = [];
  reports.value = [];
  logs.value = [];
}

async function loadUserData() {
  loading.value = true;
  message.value = '';

  try {
    const [garmentPayload, reportPayload, logPayload] = await Promise.all([
      getUserGarments(),
      getUserLostReports(),
      getUserBindingLogs()
    ]);
    garments.value = garmentPayload.garments || [];
    reports.value = reportPayload.reports || [];
    logs.value = logPayload.logs || [];
  } catch (error) {
    if (error.statusCode === 401) {
      clearUserSession();
      loggedIn.value = false;
      message.value = '登录状态已过期，请重新登录。';
      return;
    }
    message.value = error.message || '加载失败，请稍后再试。';
  } finally {
    loading.value = false;
  }
}

function openGarment(sn) {
  uni.navigateTo({
    url: `/pages/garment/detail?sn=${encodeURIComponent(sn)}`
  });
}

function actionText(action) {
  const map = {
    bind: '绑定校服',
    modify: '修改绑定',
    unbind: '解绑校服'
  };
  return map[action] || '绑定记录';
}

function reportStatusText(status) {
  const map = {
    active: '报失中',
    found: '已找回',
    cancelled: '已取消'
  };
  return map[status] || '未知状态';
}

function formatDate(value) {
  if (!value) {
    return '未知时间';
  }

  return String(value).slice(0, 10);
}
</script>

<style scoped>
.user-page {
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

.user-topbar {
  flex: 0 0 auto;
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 108rpx;
  padding: 0 34rpx;
  border-bottom: 1px solid rgba(210, 202, 190, 0.78);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(18rpx);
}

.brand-block,
.brand-mark,
.brand-subtitle {
  display: block;
}

.brand-mark {
  font-size: 32rpx;
  font-weight: 760;
  line-height: 1.2;
}

.brand-subtitle {
  margin-top: 6rpx;
  color: #786f65;
  font-size: 22rpx;
}

.ghost-button,
.primary-button,
.refresh-button,
.record-card {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  line-height: normal;
}

.ghost-button::after,
.primary-button::after,
.refresh-button::after,
.record-card::after {
  border: 0;
}

.ghost-button,
.refresh-button {
  min-height: 62rpx;
  padding: 0 24rpx;
  border: 1px solid rgba(213, 202, 185, 0.9);
  border-radius: 999rpx;
  background: rgba(255, 253, 248, 0.82);
  color: #36312a;
  font-size: 24rpx;
  font-weight: 680;
}

.ghost-button-hover,
.refresh-button-hover {
  border-color: rgba(126, 158, 111, 0.48);
  background: #f8fbf4;
  color: #4f7f46;
}

.user-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 34rpx 32rpx 42rpx;
}

.empty-panel,
.section-block,
.summary-card {
  border: 1px solid #ded5c9;
  border-radius: 16rpx;
  background: rgba(255, 252, 245, 0.94);
  box-shadow: 0 10rpx 28rpx rgba(74, 63, 45, 0.06);
}

.empty-panel {
  padding: 44rpx 36rpx;
}

.empty-title,
.empty-copy,
.message-text,
.section-title,
.summary-value,
.summary-label,
.record-title,
.record-copy,
.record-code,
.record-status,
.compact-title,
.compact-copy,
.compact-meta,
.list-empty {
  display: block;
}

.empty-title {
  font-size: 38rpx;
  font-weight: 760;
}

.empty-copy {
  margin-top: 16rpx;
  color: #655f57;
  font-size: 27rpx;
  line-height: 1.6;
}

.primary-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  margin-top: 32rpx;
  border-radius: 999rpx;
  background: #151515;
  color: #fff;
  font-size: 29rpx;
  font-weight: 760;
}

.primary-button-hover {
  background: #2c3b29;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18rpx;
  margin-bottom: 24rpx;
}

.summary-card {
  padding: 26rpx 24rpx;
}

.summary-value {
  font-size: 42rpx;
  font-weight: 780;
}

.summary-label {
  margin-top: 8rpx;
  color: #70685f;
  font-size: 23rpx;
}

.message-text {
  margin: 0 0 20rpx;
  color: #9a4b38;
  font-size: 25rpx;
}

.section-block {
  padding: 28rpx 24rpx;
  margin-top: 22rpx;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 760;
}

.list-empty {
  padding: 30rpx 0 8rpx;
  color: #7a7167;
  font-size: 25rpx;
}

.record-list,
.compact-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 20rpx;
}

.record-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  width: 100%;
  min-height: 132rpx;
  padding: 22rpx 20rpx;
  border: 1px solid #e1d8cc;
  border-radius: 14rpx;
  background: #fffdf8;
  text-align: left;
}

.record-card-hover {
  border-color: rgba(126, 158, 111, 0.48);
  background: #f8fbf4;
}

.record-main {
  min-width: 0;
}

.record-title {
  font-size: 28rpx;
  font-weight: 720;
}

.record-copy,
.record-code,
.compact-copy,
.compact-meta {
  margin-top: 8rpx;
  color: #70685f;
  font-size: 23rpx;
  line-height: 1.35;
}

.record-status {
  flex: 0 0 auto;
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  background: #edf4e8;
  color: #4d7346;
  font-size: 22rpx;
  font-weight: 720;
}

.record-status.lost {
  background: #fff0e6;
  color: #9a4b38;
}

.compact-row {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  padding: 18rpx 0;
  border-top: 1px solid rgba(222, 213, 201, 0.78);
}

.compact-title {
  font-size: 26rpx;
  font-weight: 700;
}
</style>
