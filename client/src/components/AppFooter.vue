<template>
  <view class="app-footer">
    <view class="footer-grid">
      <button
        :class="['footer-item', active === 'home' ? 'active' : '']"
        hover-class="footer-item-hover"
        @click="() => goHome()"
      >
        <text class="footer-icon">⌂</text>
        <text class="footer-label">主页</text>
      </button>
      <button
        :class="['footer-item', active === 'user' ? 'active' : '']"
        hover-class="footer-item-hover"
        @click="() => openUser()"
      >
        <text class="footer-icon">◇</text>
        <text class="footer-label">用户</text>
      </button>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({
  active: {
    type: String,
    default: 'home'
  }
});

function goHome() {
  if (currentRoute() === 'pages/index/index') {
    return;
  }

  replacePage('/pages/index/index');
}

function openUser() {
  if (currentRoute() === 'pages/user/index') {
    return;
  }

  replacePage('/pages/user/index');
}

function currentRoute() {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  return current?.route || '';
}

function replacePage(url) {
  uni.redirectTo({
    url,
    fail() {
      uni.reLaunch({ url });
    }
  });
}
</script>

<style scoped>
.app-footer {
  flex: 0 0 auto;
  position: sticky;
  bottom: 0;
  z-index: 10;
  border-top: 1px solid rgba(210, 202, 190, 0.78);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(18rpx);
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

.footer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 104rpx;
}

.footer-item {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #777168;
  line-height: normal;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  min-height: 104rpx;
}

.footer-item::after {
  border: 0;
}

.footer-item.active {
  color: #151515;
  background: rgba(248, 244, 237, 0.76);
}

.footer-item-hover {
  color: #5f8f55;
  background: rgba(247, 251, 244, 0.84);
}

.footer-icon,
.footer-label {
  display: block;
  line-height: 1;
}

.footer-icon {
  font-size: 32rpx;
  font-weight: 720;
}

.footer-label {
  font-size: 23rpx;
  font-weight: 680;
}

@media (min-width: 760px) {
  .footer-grid {
    min-height: 62px;
  }

  .footer-item {
    min-height: 62px;
    gap: 4px;
  }

  .footer-icon {
    font-size: 17px;
  }

  .footer-label {
    font-size: 12px;
  }
}
</style>
