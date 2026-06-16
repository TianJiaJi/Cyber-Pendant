<template>
  <view class="page-shell detail-page">
    <view class="detail-topbar">
      <button class="ghost-button" @click="goHome">返回查询</button>
    </view>

    <view v-if="loading" class="state-block">
      <text class="section-title">正在读取吊牌信息</text>
      <text class="muted-text">请稍候。</text>
    </view>

    <view v-else-if="errorMessage" class="state-block">
      <text class="section-title">{{ inactiveGarment ? '吊牌已停用' : '未找到吊牌' }}</text>
      <text class="muted-text">{{ errorMessage }}</text>
      <view v-if="inactiveGarment" class="inactive-preview">
        <text class="preview-sn">{{ inactiveGarment.sn }}</text>
        <text class="preview-name">{{ inactiveGarment.productName }}</text>
      </view>
    </view>

    <view v-else-if="garment" class="detail-layout">
      <view class="identity-panel">
        <text class="eyebrow">AUTHENTIC GARMENT RECORD</text>
        <text class="product-name">{{ garment.productName || '未命名产品' }}</text>
        <text class="sn-code">{{ garment.sn }}</text>
        <text :class="['status-pill', garment.status === 'inactive' ? 'inactive' : '']">
          {{ garment.status === 'active' ? '有效吊牌' : '已停用' }}
        </text>
      </view>

      <view class="detail-grid">
        <view v-for="item in fields" :key="item.label" class="detail-row">
          <text class="detail-label">{{ item.label }}</text>
          <text class="detail-value">{{ item.value || '未录入' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getPublicGarment } from '../../utils/api.js';

const loading = ref(true);
const garment = ref(null);
const inactiveGarment = ref(null);
const errorMessage = ref('');

const fields = computed(() => {
  const current = garment.value || inactiveGarment.value;
  if (!current) {
    return [];
  }

  return [
    { label: '款号', value: current.styleNo },
    { label: '颜色', value: current.color },
    { label: '尺码', value: current.size },
    { label: '面料', value: current.fabric },
    { label: '执行标准', value: current.standard },
    { label: '安全类别', value: current.safetyCategory },
    { label: '质量等级', value: current.grade },
    { label: '厂家', value: current.manufacturer },
    { label: '厂家地址', value: current.manufacturerAddress },
    { label: '洗护说明', value: current.careInstructions },
    { label: '批次标签', value: current.batchNo },
    { label: '生产日期', value: current.productionDate },
    { label: '备注', value: current.remark }
  ];
});

onLoad(async (query) => {
  const sn = String(query?.sn || '').trim().toUpperCase();

  if (!sn) {
    loading.value = false;
    errorMessage.value = '链接中没有 SN 参数，请返回首页重新输入。';
    return;
  }

  try {
    const response = await getPublicGarment(sn);
    garment.value = response.garment;
  } catch (error) {
    if (error.statusCode === 423) {
      inactiveGarment.value = error.data?.garment;
      errorMessage.value = error.message || '该吊牌已停用。';
    } else {
      errorMessage.value = error.message || '未找到该吊牌信息。';
    }
  } finally {
    loading.value = false;
  }
});

function goHome() {
  uni.reLaunch({
    url: '/pages/index/index'
  });
}

</script>

<style scoped>
.detail-page {
  padding: 36rpx;
}

.detail-topbar {
  display: flex;
  justify-content: flex-start;
  gap: 18rpx;
  max-width: 1080px;
  margin: 0 auto 32rpx;
}

.state-block,
.detail-layout {
  max-width: 1080px;
  margin: 0 auto;
}

.state-block {
  padding: 48rpx 0;
}

.state-block .muted-text {
  display: block;
  margin-top: 18rpx;
}

.inactive-preview {
  margin-top: 30rpx;
  padding: 28rpx;
  border: 1px solid #e0c4bc;
  border-radius: 8rpx;
  background: #fff9f6;
}

.preview-sn {
  display: block;
  color: #8d3c22;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 24rpx;
}

.preview-name {
  display: block;
  margin-top: 8rpx;
  color: #1a1a1a;
  font-size: 32rpx;
}

.detail-layout {
  display: grid;
  gap: 28rpx;
}

.identity-panel {
  padding: 34rpx;
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

.product-name {
  display: block;
  margin-top: 26rpx;
  color: #111;
  font-size: 50rpx;
  font-weight: 680;
  line-height: 1.18;
}

.sn-code {
  display: block;
  margin: 24rpx 0;
  color: #5f5a52;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 28rpx;
}

.detail-grid {
  display: grid;
  gap: 16rpx;
}

.detail-row {
  padding: 26rpx;
  border: 1px solid #e2dbd1;
  border-radius: 8rpx;
  background: rgba(255, 253, 249, 0.86);
}

.detail-label {
  display: block;
  color: #7a746b;
  font-size: 24rpx;
}

.detail-value {
  display: block;
  margin-top: 10rpx;
  color: #181818;
  font-size: 30rpx;
  line-height: 1.65;
}

@media (min-width: 860px) {
  .detail-page {
    padding: 38px 42px;
  }

  .detail-layout {
    grid-template-columns: 360px minmax(0, 1fr);
    align-items: start;
    gap: 28px;
  }

  .identity-panel {
    position: sticky;
    top: 32px;
    padding: 28px;
  }

  .product-name {
    font-size: 36px;
  }

  .sn-code {
    font-size: 15px;
  }

  .detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .detail-row {
    padding: 18px;
  }

  .detail-value {
    font-size: 15px;
  }
}
</style>
