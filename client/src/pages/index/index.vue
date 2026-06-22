<template>
  <view class="page-shell home-page">
    <view class="phone-shell">
      <view class="home-topbar">
        <view class="brand-block">
          <text class="brand-mark">Cyber Pendant</text>
          <text class="brand-subtitle">校服安全防伪码</text>
        </view>
        <text class="status-chip">官方溯源</text>
      </view>

      <view class="home-content">
        <view class="verification-intro">
          <view class="intro-copy">
            <text class="eyebrow">GARMENT TRACE</text>
            <text class="hero-title">核验校服吊牌真伪</text>
            <text class="hero-text">
              输入 SN 码或扫描二维码，查看面料、执行标准、生产批次与企业信息。
            </text>
          </view>

          <view class="hero-media">
            <image class="hero-image" src="/static/tag-hero.png" mode="aspectFill" />
            <view class="hero-caption">
              <text class="caption-label">VERIFY</text>
              <text class="caption-value">扫码复验</text>
            </view>
          </view>
        </view>

        <view class="query-panel">
          <view class="query-heading">
            <text class="query-title">吊牌查询</text>
            <text class="query-subtitle">SN 码通常印在吊牌二维码下方</text>
          </view>

          <view class="sn-field">
            <text class="field-label">SN 码</text>
            <input
              v-model="sn"
              class="sn-input"
              placeholder="例如 CP20260615DEMO01"
              maxlength="16"
            />
          </view>

          <view class="actions">
            <button
              class="home-button primary-query-button"
              :disabled="loading"
              hover-class="primary-query-button-hover"
              @click="() => lookup()"
            >
              {{ loading ? '查询中' : '查询吊牌' }}
            </button>
            <button
              class="home-button scan-button"
              hover-class="scan-button-hover"
              @click="() => handleScan()"
            >
              {{ scannerVisible ? '关闭扫码' : '扫描二维码' }}
            </button>
          </view>

          <text v-if="message" class="message-text">{{ message }}</text>
        </view>

        <view v-if="scannerVisible" class="scanner-shell">
          <!-- #ifdef H5 -->
          <view id="qr-reader" class="qr-reader"></view>
          <text class="scanner-note">H5 摄像头扫码需要在 localhost 或 HTTPS 环境下使用。</text>
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <text class="scanner-note">当前平台将调用系统扫码能力。</text>
          <!-- #endif -->
        </view>

        <view class="trust-list">
          <view v-for="item in trustItems" :key="item.title" class="trust-item">
            <text class="trust-kicker">{{ item.kicker }}</text>
            <text class="trust-title">{{ item.title }}</text>
            <text class="trust-copy">{{ item.copy }}</text>
          </view>
        </view>
      </view>

      <AppFooter active="home" />
    </view>
  </view>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue';
import AppFooter from '../../components/AppFooter.vue';
import { getPublicGarment } from '../../utils/api.js';
import { extractSnFromScan, scanWithPlatform } from '../../utils/scanner.js';

// Debug: Log when page is loaded
console.log('[Page Init] Home page loaded');
console.log('[Page Init] Current platform:', process.env.UNI_PLATFORM);

const sn = ref('');
const loading = ref(false);
const message = ref('');
const scannerVisible = ref(false);
let html5Scanner = null;

// 防抖控制
let queryTimer = null;
const QUERY_DEBOUNCE_MS = 1000; // 1秒内不能重复查询
let lastQueryTime = 0;

// SN 码验证规则（简化版，允许数据库中的各种 SN 码）
function validateSN(sn) {
  const code = sn.trim().toUpperCase();
  if (!code) {
    return { valid: false, error: '请输入 SN 码' };
  }
  if (!code.startsWith('CP')) {
    return { valid: false, error: 'SN 码必须以 CP 开头' };
  }
  if (code.length < 12) {
    return { valid: false, error: 'SN 码长度不足' };
  }
  if (code.length > 20) {
    return { valid: false, error: 'SN 码过长' };
  }
  // 基本格式检查：CP + 至少10位字符
  const snPattern = /^CP[A-Z0-9]{10,}$/;
  if (!snPattern.test(code)) {
    return { valid: false, error: 'SN 码格式不正确' };
  }
  return { valid: true, code };
}

const trustItems = [
  {
    kicker: '01',
    title: '正品核验',
    copy: '校验吊牌状态，停用或异常会在详情页提示。'
  },
  {
    kicker: '02',
    title: '批次溯源',
    copy: '同步展示款号、颜色尺码、生产日期与执行标准。'
  },
  {
    kicker: '03',
    title: '扫码复验',
    copy: '二维码和 SN 输入共用同一套溯源结果。'
  }
];

function normalizeInput() {
  return sn.value.trim().toUpperCase();
}

async function lookup() {
  console.log('[Lookup] Function called');

  // 防抖检查
  const now = Date.now();
  if (now - lastQueryTime < QUERY_DEBOUNCE_MS) {
    const remaining = Math.ceil((QUERY_DEBOUNCE_MS - (now - lastQueryTime)) / 1000);
    console.log(`[Lookup] Debounce active, please wait ${remaining}s`);
    message.value = `请等待 ${remaining} 秒后再试`;
    setTimeout(() => {
      if (message.value === `请等待 ${remaining} 秒后再试`) {
        message.value = '';
      }
    }, remaining * 1000);
    return;
  }

  const inputCode = normalizeInput();
  console.log('[Lookup] Normalized SN:', inputCode);
  message.value = '';

  // 验证 SN 码
  const validation = validateSN(inputCode);
  if (!validation.valid) {
    console.log('[Lookup] Validation failed:', validation.error);
    message.value = validation.error;
    return;
  }

  const code = validation.code;
  console.log('[Lookup] Validation passed, SN:', code);

  // 更新最后查询时间
  lastQueryTime = now;

  console.log('[Lookup] Starting query for SN:', code);
  loading.value = true;

  try {
    console.log('[Lookup] Calling getPublicGarment...');
    await getPublicGarment(code, { track: false });
    console.log('[Lookup] Query successful, navigating to detail page');
    uni.navigateTo({
      url: `/pages/garment/detail?sn=${encodeURIComponent(code)}`
    });
  } catch (error) {
    console.log('[Lookup] Query failed:', error);
    if (error.statusCode === 423) {
      console.log('[Lookup] Status 423, navigating to detail page anyway');
      uni.navigateTo({
        url: `/pages/garment/detail?sn=${encodeURIComponent(code)}`
      });
      return;
    }
    message.value = error.message || '未找到该吊牌信息。';
  } finally {
    console.log('[Lookup] Setting loading to false');
    loading.value = false;
  }
}

async function handleScan() {
  console.log('[Scan] Handle scan called');
  message.value = '';

  // #ifdef H5
  console.log('[Scan] H5 platform detected');
  if (scannerVisible.value) {
    console.log('[Scan] Stopping H5 scanner');
    await stopH5Scanner();
    return;
  }

  console.log('[Scan] Starting H5 scanner');
  scannerVisible.value = true;
  await nextTick();
  await startH5Scanner();
  // #endif

  // #ifndef H5
  console.log('[Scan] Non-H5 platform, calling platform scan API');
  try {
    const scanned = await scanWithPlatform();
    console.log('[Scan] Scan result:', scanned);
    const extracted = extractSnFromScan(scanned);
    console.log('[Scan] Extracted SN:', extracted);
    sn.value = extracted;
    await lookup();
  } catch (error) {
    console.log('[Scan] Scan failed:', error);
    message.value = error.message || '扫码失败，请手动输入 SN。';
  }
  // #endif
}

async function startH5Scanner() {
  // #ifdef H5
  try {
    const { Html5Qrcode } = await import('html5-qrcode');
    html5Scanner = new Html5Qrcode('qr-reader');
    await html5Scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 240, height: 240 }
      },
      async (decodedText) => {
        sn.value = extractSnFromScan(decodedText);
        await stopH5Scanner();
        await lookup();
      }
    );
  } catch (error) {
    scannerVisible.value = false;
    message.value = '无法打开摄像头，请检查浏览器权限，或手动输入 SN。';
  }
  // #endif
}

async function stopH5Scanner() {
  // #ifdef H5
  if (html5Scanner) {
    try {
      await html5Scanner.stop();
      html5Scanner.clear();
    } catch {
      // Scanner may already be stopped by the browser.
    }
    html5Scanner = null;
  }
  scannerVisible.value = false;
  // #endif
}

onBeforeUnmount(() => {
  stopH5Scanner();
});
</script>

<style scoped>
.home-page {
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
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(248, 244, 237, 0.98) 23%, #f7f3ec 100%);
  color: #151515;
  box-shadow: 0 0 0 1px rgba(36, 31, 24, 0.04);
  /* 微信小程序状态栏安全区域 */
  padding-top: constant(safe-area-inset-top);
  padding-top: env(safe-area-inset-top);
}

/* 微信小程序额外安全区域补偿 */
/* #ifdef MP-WEIXIN */
.phone-shell {
  padding-top: 88rpx; /* 状态栏 + 导航栏空间 */
}
/* #endif */

.home-topbar {
  flex: 0 0 auto;
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  min-height: 108rpx;
  padding: 0 34rpx;
  border-bottom: 1px solid rgba(210, 202, 190, 0.78);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18rpx);
}

.brand-block {
  min-width: 0;
}

.brand-mark {
  display: block;
  color: #151515;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0;
  text-transform: uppercase;
}

.brand-subtitle {
  display: block;
  margin-top: 8rpx;
  color: #777168;
  font-size: 22rpx;
  line-height: 1.2;
}

.status-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  min-height: 46rpx;
  padding: 0 18rpx;
  border: 1px solid rgba(122, 160, 111, 0.38);
  border-radius: 999rpx;
  background: rgba(250, 255, 247, 0.76);
  color: #5f8f55;
  font-size: 22rpx;
  font-weight: 690;
}

.home-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 38rpx 34rpx 56rpx;
}

.verification-intro {
  display: grid;
  gap: 28rpx;
}

.intro-copy {
  min-width: 0;
}

.eyebrow {
  display: block;
  color: #7b756c;
  font-size: 22rpx;
  font-weight: 700;
  letter-spacing: 0;
}

.hero-title {
  display: block;
  margin-top: 18rpx;
  color: #121212;
  font-size: 48rpx;
  font-weight: 760;
  line-height: 1.16;
}

.hero-text {
  display: block;
  margin-top: 22rpx;
  color: #656058;
  font-size: 28rpx;
  line-height: 1.65;
}

.hero-media {
  position: relative;
  overflow: hidden;
  min-height: 248rpx;
  border: 1px solid #ded5c9;
  border-radius: 18rpx;
  background: #ebe6de;
  box-shadow: 0 14rpx 32rpx rgba(74, 63, 45, 0.08);
}

.hero-image {
  width: 100%;
  height: 276rpx;
  display: block;
}

.hero-caption {
  position: absolute;
  left: 22rpx;
  bottom: 20rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-height: 50rpx;
  padding: 0 18rpx;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 999rpx;
  background: rgba(255, 253, 249, 0.88);
  box-shadow: 0 8rpx 20rpx rgba(43, 36, 25, 0.12);
}

.caption-label {
  color: #5f8f55;
  font-size: 18rpx;
  font-weight: 780;
}

.caption-value {
  color: #171717;
  font-size: 22rpx;
  font-weight: 690;
}

.query-panel {
  margin-top: 30rpx;
  padding: 32rpx;
  border: 1px solid #ded5c9;
  border-radius: 18rpx;
  background: rgba(255, 252, 245, 0.94);
  box-shadow: 0 18rpx 34rpx rgba(80, 68, 45, 0.12);
}

.query-heading {
  margin-bottom: 26rpx;
}

.query-title,
.query-subtitle {
  display: block;
}

.query-title {
  color: #151515;
  font-size: 34rpx;
  font-weight: 740;
  line-height: 1.25;
}

.query-subtitle {
  margin-top: 10rpx;
  color: #777168;
  font-size: 24rpx;
  line-height: 1.5;
}

.sn-field {
  min-width: 0;
}

.field-label {
  display: block;
  margin-bottom: 12rpx;
  color: #625d55;
  font-size: 24rpx;
}

.sn-input {
  width: 100%;
  min-height: 92rpx;
  padding: 0 24rpx;
  border: 1px solid #d5cab9;
  border-radius: 10rpx;
  background: #fffdf9;
  color: #161616;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 28rpx;
  line-height: 92rpx;
}

.home-button {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  line-height: normal;
}

.home-button::after {
  border: 0;
}

.actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18rpx;
  margin-top: 24rpx;
}

.primary-query-button,
.scan-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  border-radius: 10rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.primary-query-button {
  background: #171717;
  color: #fff;
}

.primary-query-button-hover {
  background: #2c2c2c;
}

.primary-query-button[disabled] {
  opacity: 0.66;
}

.scan-button {
  border: 1px solid #d5cab9;
  background: #fffdf9;
  color: #171717;
}

.scan-button-hover {
  border-color: #7aa06f;
  color: #5f8f55;
}

.message-text {
  display: block;
  margin-top: 18rpx;
  color: #8d3c22;
  font-size: 24rpx;
  line-height: 1.5;
}

.scanner-shell {
  margin-top: 22rpx;
  padding: 20rpx;
  border: 1px solid #ded5c9;
  border-radius: 16rpx;
  background: rgba(255, 252, 245, 0.94);
}

.qr-reader {
  overflow: hidden;
  min-height: 500rpx;
  border-radius: 10rpx;
}

.scanner-note {
  display: block;
  margin-top: 16rpx;
  color: #6b665f;
  font-size: 24rpx;
  line-height: 1.5;
}

.trust-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14rpx;
  margin-top: 28rpx;
}

.trust-item {
  display: grid;
  grid-template-columns: 56rpx minmax(0, 1fr);
  column-gap: 18rpx;
  row-gap: 6rpx;
  padding: 22rpx 0;
  border-bottom: 1px solid rgba(216, 207, 193, 0.82);
}

.trust-item:last-child {
  border-bottom: 0;
}

.trust-kicker {
  grid-row: 1 / span 2;
  color: #6e965f;
  font-size: 22rpx;
  font-weight: 780;
  line-height: 1.4;
}

.trust-title,
.trust-copy {
  display: block;
  min-width: 0;
}

.trust-title {
  color: #151515;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 1.35;
}

.trust-copy {
  color: #777168;
  font-size: 24rpx;
  line-height: 1.55;
}

@media (min-width: 760px) {
  .home-page {
    background: #f0ebe3;
  }

  .phone-shell {
    min-height: 100vh;
  }

  .home-topbar {
    min-height: 72px;
    padding: 0 24px;
  }

  .brand-mark {
    font-size: 13px;
  }

  .brand-subtitle,
  .status-chip,
  .eyebrow {
    font-size: 12px;
  }

  .status-chip {
    min-height: 26px;
    padding: 0 10px;
  }

  .home-content {
    padding: 28px 24px 42px;
  }

  .verification-intro {
    gap: 18px;
  }

  .hero-title {
    margin-top: 12px;
    font-size: 32px;
  }

  .hero-text {
    font-size: 16px;
    margin-top: 14px;
  }

  .hero-media {
    min-height: 170px;
    border-radius: 12px;
  }

  .hero-image {
    height: 190px;
  }

  .hero-caption {
    left: 14px;
    bottom: 14px;
    min-height: 30px;
    padding: 0 12px;
  }

  .caption-label {
    font-size: 10px;
  }

  .caption-value {
    font-size: 12px;
  }

  .query-panel {
    margin-top: 22px;
    padding: 22px;
    border-radius: 12px;
  }

  .query-title {
    font-size: 20px;
  }

  .query-subtitle,
  .field-label,
  .message-text,
  .scanner-note,
  .trust-copy {
    font-size: 13px;
  }

  .sn-input {
    min-height: 52px;
    padding: 0 14px;
    border-radius: 8px;
    font-size: 15px;
    line-height: 52px;
  }

  .actions {
    gap: 10px;
  }

  .primary-query-button,
  .scan-button {
    min-height: 48px;
    border-radius: 8px;
    font-size: 15px;
  }

  .scanner-shell {
    padding: 14px;
  }

  .qr-reader {
    min-height: 320px;
  }

  .trust-list {
    gap: 0;
    margin-top: 22px;
  }

  .trust-item {
    grid-template-columns: 38px minmax(0, 1fr);
    column-gap: 12px;
    padding: 15px 0;
  }

  .trust-kicker {
    font-size: 12px;
  }

  .trust-title {
    font-size: 15px;
  }
}

@media (min-width: 960px) {
  .phone-shell {
    margin-top: 0;
    margin-bottom: 0;
  }
}
</style>
