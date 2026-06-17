<template>
  <view class="page-shell home-page">
    <view class="topbar">
      <text class="brand-mark">Cyber Pendant</text>
    </view>

    <view class="hero-layout">
      <view class="hero-copy">
        <text class="eyebrow">DIGITAL GARMENT ID</text>
        <text class="hero-title">每一件衣服，都有自己的数字吊牌。</text>
        <text class="hero-text">
          输入 SN 码或扫描吊牌二维码，查看面料、执行标准、厂家、洗护说明与生产批次。
        </text>

        <view class="query-panel">
          <text class="field-label">SN 码</text>
          <input
            v-model="sn"
            class="form-input sn-input"
            confirm-type="search"
            placeholder="例如 CP20260615DEMO01"
            @confirm="lookup"
          />
          <view class="actions">
            <button class="primary-button" :disabled="loading" @click="lookup">
              {{ loading ? '查询中' : '查询吊牌' }}
            </button>
            <button class="secondary-button" @click="handleScan">
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
      </view>

      <view class="hero-media">
        <image class="hero-image" src="/static/tag-hero.png" mode="aspectFill" />
      </view>
    </view>

    <view class="info-band">
      <view class="info-item">
        <text class="info-label">Fabric</text>
        <text class="info-value">面料成分</text>
      </view>
      <view class="info-item">
        <text class="info-label">Standard</text>
        <text class="info-value">执行标准</text>
      </view>
      <view class="info-item">
        <text class="info-label">Factory</text>
        <text class="info-value">厂家信息</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { getPublicGarment } from '../../utils/api.js';
import { extractSnFromScan, scanWithPlatform } from '../../utils/scanner.js';

const sn = ref('');
const loading = ref(false);
const message = ref('');
const scannerVisible = ref(false);
let html5Scanner = null;

function normalizeInput() {
  return sn.value.trim().toUpperCase();
}

async function lookup() {
  const code = normalizeInput();
  message.value = '';

  if (!code) {
    message.value = '请输入 SN 码。';
    return;
  }

  loading.value = true;

  try {
    await getPublicGarment(code, { track: false });
    uni.navigateTo({
      url: `/pages/garment/detail?sn=${encodeURIComponent(code)}`
    });
  } catch (error) {
    if (error.statusCode === 423) {
      uni.navigateTo({
        url: `/pages/garment/detail?sn=${encodeURIComponent(code)}`
      });
      return;
    }
    message.value = error.message || '未找到该吊牌信息。';
  } finally {
    loading.value = false;
  }
}

async function handleScan() {
  message.value = '';

  // #ifdef H5
  if (scannerVisible.value) {
    await stopH5Scanner();
    return;
  }

  scannerVisible.value = true;
  await nextTick();
  await startH5Scanner();
  // #endif

  // #ifndef H5
  try {
    const scanned = await scanWithPlatform();
    sn.value = extractSnFromScan(scanned);
    await lookup();
  } catch (error) {
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
  padding: 36rpx;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  max-width: 1180px;
  margin: 0 auto 42rpx;
}

.brand-mark {
  color: #151515;
  font-size: 26rpx;
  font-weight: 700;
}

.hero-layout {
  display: flex;
  flex-direction: column;
  gap: 44rpx;
  max-width: 1180px;
  margin: 0 auto;
}

.hero-copy {
  min-width: 0;
}

.eyebrow {
  display: block;
  color: #6f6a62;
  font-size: 22rpx;
  font-weight: 700;
  letter-spacing: 0;
  margin-bottom: 24rpx;
}

.hero-title {
  display: block;
  max-width: 720rpx;
  color: #121212;
  font-size: 62rpx;
  font-weight: 680;
  line-height: 1.12;
}

.hero-text {
  display: block;
  max-width: 660rpx;
  margin-top: 26rpx;
  color: #5f5a52;
  font-size: 28rpx;
  line-height: 1.8;
}

.query-panel {
  max-width: 720rpx;
  margin-top: 42rpx;
  padding: 30rpx;
  border: 1px solid #ded7ce;
  border-radius: 8rpx;
  background: rgba(255, 253, 249, 0.92);
}

.sn-input {
  font-family: "SFMono-Regular", Consolas, monospace;
}

.actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20rpx;
  margin-top: 22rpx;
}

.message-text {
  display: block;
  margin-top: 20rpx;
  color: #8d3c22;
  font-size: 24rpx;
}

.scanner-shell {
  max-width: 720rpx;
  margin-top: 24rpx;
  padding: 20rpx;
  border: 1px solid #d8d1c7;
  border-radius: 8rpx;
  background: #fffdf9;
}

.qr-reader {
  overflow: hidden;
  min-height: 520rpx;
  border-radius: 6rpx;
}

.scanner-note {
  display: block;
  margin-top: 16rpx;
  color: #6b665f;
  font-size: 24rpx;
}

.hero-media {
  overflow: hidden;
  min-height: 520rpx;
  border-radius: 8rpx;
  border: 1px solid #e4ded6;
  background: #ebe6de;
}

.hero-image {
  width: 100%;
  height: 620rpx;
}

.info-band {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20rpx;
  max-width: 1180px;
  margin: 42rpx auto 0;
  padding-top: 28rpx;
  border-top: 1px solid #ddd6cc;
}

.info-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24rpx;
}

.info-label {
  color: #8a8379;
  font-size: 22rpx;
  text-transform: uppercase;
}

.info-value {
  color: #242424;
  font-size: 28rpx;
}

@media (min-width: 760px) {
  .home-page {
    padding: 36px 42px;
  }

  .topbar {
    margin-bottom: 56px;
  }

  .brand-mark {
    font-size: 14px;
  }

  .hero-layout {
    display: grid;
    grid-template-columns: minmax(0, 0.92fr) minmax(420px, 1fr);
    align-items: center;
    gap: 52px;
  }

  .eyebrow {
    font-size: 12px;
  }

  .hero-title {
    max-width: 620px;
    font-size: 54px;
  }

  .hero-text {
    max-width: 560px;
    font-size: 16px;
  }

  .query-panel {
    max-width: 540px;
    margin-top: 34px;
    padding: 24px;
  }

  .actions {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .scanner-shell {
    max-width: 540px;
    padding: 16px;
  }

  .qr-reader {
    min-height: 320px;
  }

  .hero-media {
    min-height: 560px;
  }

  .hero-image {
    height: 620px;
  }

  .info-band {
    grid-template-columns: repeat(3, 1fr);
    margin-top: 48px;
  }

  .info-item {
    display: block;
  }

  .info-value {
    display: block;
    margin-top: 8px;
    font-size: 18px;
  }
}
</style>
