<template>
  <view class="page-shell admin-page">
    <view class="admin-topbar">
      <view>
        <text class="eyebrow">CLOTHING MASTER DATA</text>
        <text class="admin-title">衣服主档后台</text>
      </view>
      <view class="topbar-actions">
        <button class="secondary-button" @click="goHome">前台</button>
        <button class="ghost-button" @click="logout">退出</button>
      </view>
    </view>

    <view class="admin-layout">
      <view class="editor-panel">
        <view class="panel-heading">
          <text class="section-title">新增衣服</text>
          <button class="ghost-button small-button" @click="resetForm">清空</button>
        </view>

        <view class="form-grid">
          <view v-for="field in clothingTextFields" :key="field.key" class="form-field">
            <text class="field-label">{{ field.label }}</text>
            <input
              v-model="clothingForm[field.key]"
              class="form-input"
              :placeholder="field.placeholder"
            />
          </view>

          <view class="form-field wide-field">
            <text class="field-label">面料</text>
            <textarea
              v-model="clothingForm.fabric"
              class="form-textarea"
              placeholder="例如 羊毛 58%，聚酯纤维 38%，氨纶 4%"
            />
          </view>

          <view class="form-field wide-field">
            <text class="field-label">洗护说明</text>
            <textarea
              v-model="clothingForm.careInstructions"
              class="form-textarea"
              placeholder="例如 不可漂白；悬挂晾干；低温熨烫。"
            />
          </view>

          <view class="form-field wide-field">
            <text class="field-label">备注</text>
            <textarea
              v-model="clothingForm.remark"
              class="form-textarea"
              placeholder="衣服主档备注，不包含款号、颜色、尺码、批次。"
            />
          </view>
        </view>

        <view class="editor-actions">
          <button class="primary-button" :disabled="saving" @click="saveClothing">
            {{ saving ? '保存中' : '新增衣服' }}
          </button>
          <text v-if="message" class="message-text">{{ message }}</text>
        </view>
      </view>

      <view class="records-panel">
        <view class="records-toolbar">
          <input
            v-model="query"
            class="form-input search-input"
            placeholder="搜索衣服名称、面料、厂家、执行标准"
            @confirm="loadClothes"
          />
          <button class="secondary-button" @click="loadClothes">刷新</button>
        </view>

        <view v-if="loading" class="empty-state">正在加载衣服主档...</view>
        <view v-else-if="clothes.length === 0" class="empty-state">暂无衣服，先在左侧新增。</view>

        <view v-else class="clothing-list">
          <view
            v-for="item in clothes"
            :key="item.id"
            class="clothing-card"
            @click="goDetail(item.id)"
          >
            <view class="clothing-card-head">
              <view>
                <text class="clothing-name">{{ item.productName || '未命名衣服' }}</text>
                <text class="clothing-subtitle">{{ item.manufacturer || '未录入厂家' }}</text>
              </view>
              <text :class="['status-pill', item.status === 'inactive' ? 'inactive' : '']">
                {{ item.status === 'active' ? '有效' : '停用' }}
              </text>
            </view>

            <view class="clothing-meta">
              <text>面料：{{ item.fabric || '未录入' }}</text>
              <text>执行标准：{{ item.standard || '未录入' }}</text>
              <text>安全类别：{{ item.safetyCategory || '未录入' }}</text>
              <text>质量等级：{{ item.grade || '未录入' }}</text>
            </view>

            <view class="clothing-footer">
              <text>{{ item.batchCount || 0 }} 个批次</text>
              <text>{{ item.garmentCount || 0 }} 个 SN</text>
              <button class="secondary-button small-button" @click.stop="goDetail(item.id)">
                进入详情
              </button>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  clearToken,
  createClothing,
  getToken,
  listClothes
} from '../../utils/api.js';

const emptyClothingForm = {
  productName: '',
  fabric: '',
  standard: '',
  safetyCategory: '',
  grade: '',
  manufacturer: '',
  manufacturerAddress: '',
  careInstructions: '',
  remark: ''
};

const clothingTextFields = [
  { key: 'productName', label: '衣服名称', placeholder: '高级梭织外套' },
  { key: 'standard', label: '执行标准', placeholder: 'GB/T 2664-2017' },
  { key: 'safetyCategory', label: '安全类别', placeholder: 'GB 18401-2010 B 类' },
  { key: 'grade', label: '质量等级', placeholder: '一等品' },
  { key: 'manufacturer', label: '厂家', placeholder: '赛博衣饰制造有限公司' },
  { key: 'manufacturerAddress', label: '厂家地址', placeholder: '广东省深圳市南山区...' }
];

const clothingForm = reactive({ ...emptyClothingForm });
const clothes = ref([]);
const query = ref('');
const loading = ref(false);
const saving = ref(false);
const message = ref('');

onLoad(() => {
  if (!getToken()) {
    uni.redirectTo({
      url: '/pages/admin/login'
    });
    return;
  }

  loadClothes();
});

function resetForm() {
  Object.assign(clothingForm, emptyClothingForm);
  message.value = '';
}

async function saveClothing() {
  message.value = '';
  saving.value = true;

  try {
    const response = await createClothing({ ...clothingForm });
    resetForm();
    message.value = '已新增衣服，可在右侧进入详情生成批次 SN。';
    await loadClothes();

    if (response.clothing?.id) {
      uni.pageScrollTo({
        scrollTop: 0,
        duration: 160
      });
    }
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '新增衣服失败。';
  } finally {
    saving.value = false;
  }
}

async function loadClothes() {
  loading.value = true;

  try {
    const response = await listClothes(query.value.trim());
    clothes.value = response.clothes || [];
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '加载衣服失败。';
  } finally {
    loading.value = false;
  }
}

function goDetail(id) {
  uni.navigateTo({
    url: `/pages/admin/clothing-detail?id=${encodeURIComponent(id)}`
  });
}

function handleAuthError(error) {
  if (error.statusCode === 401) {
    clearToken();
    uni.redirectTo({
      url: '/pages/admin/login'
    });
  }
}

function logout() {
  clearToken();
  uni.redirectTo({
    url: '/pages/admin/login'
  });
}

function goHome() {
  uni.reLaunch({
    url: '/pages/index/index'
  });
}
</script>

<style scoped>
.admin-page {
  padding: 28rpx;
}

.admin-topbar {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  max-width: 1320px;
  margin: 0 auto 26rpx;
}

.eyebrow {
  display: block;
  color: #746e65;
  font-size: 22rpx;
  font-weight: 700;
}

.admin-title {
  display: block;
  margin-top: 8rpx;
  color: #121212;
  font-size: 42rpx;
  font-weight: 680;
}

.topbar-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}

.admin-layout {
  display: grid;
  gap: 24rpx;
  max-width: 1320px;
  margin: 0 auto;
}

.editor-panel,
.records-panel {
  border: 1px solid #ddd6cc;
  border-radius: 8rpx;
  background: #fffdf9;
}

.editor-panel {
  padding: 26rpx;
}

.records-panel {
  padding: 20rpx;
}

.panel-heading,
.records-toolbar {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-bottom: 22rpx;
}

.form-grid {
  display: grid;
  gap: 20rpx;
}

.wide-field {
  grid-column: 1 / -1;
}

.editor-actions {
  display: grid;
  gap: 16rpx;
  margin-top: 24rpx;
}

.small-button {
  min-height: 74rpx;
  padding: 0 20rpx;
  font-size: 24rpx;
  line-height: 74rpx;
}

.message-text {
  color: #8d3c22;
  font-size: 24rpx;
}

.empty-state {
  padding: 42rpx 0;
  color: #746e65;
  text-align: center;
}

.clothing-list {
  display: grid;
  gap: 18rpx;
}

.clothing-card {
  display: grid;
  gap: 18rpx;
  padding: 22rpx;
  border: 1px solid #e3dcd2;
  border-radius: 8rpx;
  background: #fbf8f2;
}

.clothing-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.clothing-name {
  display: block;
  color: #141414;
  font-size: 32rpx;
  font-weight: 650;
}

.clothing-subtitle {
  display: block;
  margin-top: 8rpx;
  color: #6b665f;
  font-size: 24rpx;
}

.clothing-meta {
  display: grid;
  gap: 8rpx;
  color: #6b665f;
  font-size: 24rpx;
}

.clothing-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12rpx;
  align-items: center;
  color: #5f5a52;
  font-size: 24rpx;
}

.clothing-footer .small-button {
  grid-column: 1 / -1;
}

@media (min-width: 980px) {
  .admin-page {
    padding: 32px;
  }

  .admin-topbar {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .admin-title {
    font-size: 32px;
  }

  .topbar-actions {
    grid-template-columns: auto auto;
    gap: 10px;
  }

  .admin-layout {
    grid-template-columns: minmax(360px, 0.74fr) minmax(0, 1.26fr);
    align-items: start;
    gap: 24px;
  }

  .editor-panel {
    position: sticky;
    top: 24px;
    padding: 22px;
  }

  .records-panel {
    padding: 18px;
  }

  .editor-panel,
  .records-panel {
    border-radius: 8px;
  }

  .panel-heading,
  .records-toolbar {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .records-toolbar .search-input {
    flex: 1;
  }

  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .small-button {
    min-height: 38px;
    padding: 0 12px;
    font-size: 13px;
    line-height: 38px;
  }

  .clothing-card {
    padding: 18px;
  }

  .clothing-name {
    font-size: 19px;
  }

  .clothing-subtitle,
  .clothing-meta,
  .clothing-footer {
    font-size: 13px;
  }

  .clothing-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .clothing-footer {
    grid-template-columns: auto auto 1fr;
    justify-items: start;
  }

  .clothing-footer .small-button {
    grid-column: auto;
    justify-self: end;
  }
}
</style>
