<template>
  <view class="page-shell admin-page">
    <view class="admin-topbar">
      <view>
        <text class="eyebrow">ADMIN WORKSPACE</text>
        <text class="admin-title">校服吊牌后台</text>
        <text class="admin-subtitle">先找到衣服主档，再进入详情生成批次 SN。</text>
      </view>
      <view class="topbar-actions">
        <button class="secondary-button" @click="goHome">前台</button>
        <button class="ghost-button" @click="logout">退出</button>
      </view>
    </view>

    <view class="admin-workspace">
      <view class="summary-grid">
        <view v-for="item in summaryCards" :key="item.label" class="summary-card">
          <text class="summary-value">{{ item.value }}</text>
          <text class="summary-label">{{ item.label }}</text>
        </view>
      </view>

      <view class="records-panel">
        <view class="records-heading">
          <view>
            <text class="section-title">衣服主档</text>
            <text class="toolbar-meta">{{ clothes.length }} 条记录</text>
          </view>
          <view class="records-actions">
            <button class="primary-button small-button" @click="openCreatePanel">
              新增衣服
            </button>
            <button class="secondary-button small-button" @click="loadClothes">刷新</button>
          </view>
        </view>

        <view class="search-row">
          <input
            v-model="query"
            class="form-input search-input"
            confirm-type="search"
            placeholder="搜索衣服名称、面料、厂家、执行标准"
            @confirm="loadClothes"
          />
          <button class="secondary-button small-button" @click="loadClothes">搜索</button>
        </view>

        <view v-if="showCreatePanel" class="create-panel">
          <view class="create-panel-head">
            <view>
              <text class="panel-title">新增衣服主档</text>
              <text class="panel-copy">录入通用信息后，到详情页生成具体批次和 SN。</text>
            </view>
            <button class="ghost-button small-button" @click="closeCreatePanel">收起</button>
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
              <text class="field-label">执行标准</text>
              <textarea
                v-model="clothingForm.standard"
                class="form-textarea standard-textarea"
                :placeholder="standardPlaceholder"
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
              {{ saving ? '保存中' : '保存衣服主档' }}
            </button>
            <button class="ghost-button" @click="resetForm">清空</button>
          </view>
          <text v-if="formMessage" class="message-text">{{ formMessage }}</text>
        </view>

        <view v-if="lastCreatedClothing" class="next-step-banner">
          <view>
            <text class="next-step-title">已新增：{{ lastCreatedClothing.productName || '未命名衣服' }}</text>
            <text class="next-step-copy">下一步进入详情，生成颜色、尺码和批次 SN。</text>
          </view>
          <button class="primary-button small-button" @click="goDetail(lastCreatedClothing.id)">
            进入详情
          </button>
        </view>

        <text v-if="listMessage" class="message-text panel-message">{{ listMessage }}</text>

        <view v-if="loading" class="empty-state">正在加载衣服主档...</view>
        <view v-else-if="clothes.length === 0" class="empty-state">
          <text class="empty-title">暂无衣服主档</text>
          <text class="empty-copy">先新增一个衣服主档，再到详情页生成批次 SN。</text>
          <button class="primary-button small-button" @click="openCreatePanel">新增衣服</button>
        </view>

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
                {{ statusText(item.status) }}
              </text>
            </view>

            <view class="clothing-metrics">
              <view class="metric-item">
                <text class="metric-value">{{ item.batchCount || 0 }}</text>
                <text class="metric-label">批次</text>
              </view>
              <view class="metric-item">
                <text class="metric-value">{{ item.garmentCount || 0 }}</text>
                <text class="metric-label">SN</text>
              </view>
              <view class="metric-item wide-metric">
                <text class="metric-value">{{ formatDateTime(item.updatedAt) }}</text>
                <text class="metric-label">最近更新</text>
              </view>
            </view>

            <view class="clothing-meta">
              <view class="meta-row standard-meta">
                <text class="meta-label">执行标准：</text>
                <view v-if="splitStandardList(item.standard).length > 1" class="standard-list">
                  <text
                    v-for="(standard, index) in splitStandardList(item.standard)"
                    :key="`${standard}-${index}`"
                    class="standard-chip"
                  >
                    {{ standard }}
                  </text>
                </view>
                <text v-else>{{ standardDisplayText(item.standard) || '未录入' }}</text>
              </view>
              <text>安全类别：{{ item.safetyCategory || '未录入' }}</text>
              <text>质量等级：{{ item.grade || '未录入' }}</text>
              <text>面料：{{ item.fabric || '未录入' }}</text>
            </view>

            <view class="clothing-footer">
              <text class="footer-hint">
                {{ item.batchCount ? '可继续管理批次和 SN' : '还没有批次，进入详情生成 SN' }}
              </text>
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
import { computed, reactive, ref } from 'vue';
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
  { key: 'safetyCategory', label: '安全类别', placeholder: 'GB 18401-2010 B 类' },
  { key: 'grade', label: '质量等级', placeholder: '一等品' },
  { key: 'manufacturer', label: '厂家', placeholder: '赛博衣饰制造有限公司' },
  { key: 'manufacturerAddress', label: '厂家地址', placeholder: '广东省深圳市南山区...' }
];

const standardPlaceholder = [
  'GB/T 2664-2017',
  'GB 18401-2010 B 类',
  'GB 31701-2015'
].join('\n');

const clothingForm = reactive({ ...emptyClothingForm });
const clothes = ref([]);
const query = ref('');
const loading = ref(false);
const saving = ref(false);
const showCreatePanel = ref(false);
const formMessage = ref('');
const listMessage = ref('');
const lastCreatedClothing = ref(null);

const summaryCards = computed(() => {
  const activeCount = clothes.value.filter((item) => item.status !== 'inactive').length;
  const batchCount = clothes.value.reduce((total, item) => total + Number(item.batchCount || 0), 0);
  const garmentCount = clothes.value.reduce((total, item) => total + Number(item.garmentCount || 0), 0);

  return [
    { label: '衣服主档', value: clothes.value.length },
    { label: '有效主档', value: activeCount },
    { label: '批次总数', value: batchCount },
    { label: 'SN 总数', value: garmentCount }
  ];
});

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
  formMessage.value = '';
}

function openCreatePanel() {
  showCreatePanel.value = true;
  formMessage.value = '';
}

function closeCreatePanel() {
  showCreatePanel.value = false;
  formMessage.value = '';
}

async function saveClothing() {
  formMessage.value = '';
  listMessage.value = '';
  saving.value = true;

  try {
    const response = await createClothing({ ...clothingForm });
    resetForm();
    showCreatePanel.value = false;
    lastCreatedClothing.value = response.clothing || null;
    await loadClothes();

    if (response.clothing?.id) {
      uni.pageScrollTo({
        scrollTop: 0,
        duration: 160
      });
    }
  } catch (error) {
    handleAuthError(error);
    formMessage.value = error.message || '新增衣服失败。';
  } finally {
    saving.value = false;
  }
}

async function loadClothes() {
  loading.value = true;
  listMessage.value = '';

  try {
    const response = await listClothes(query.value.trim());
    clothes.value = response.clothes || [];
  } catch (error) {
    handleAuthError(error);
    listMessage.value = error.message || '加载衣服失败。';
  } finally {
    loading.value = false;
  }
}

function statusText(status) {
  return status === 'inactive' ? '停用' : '有效';
}

function formatDateTime(value) {
  return value ? value.replace('T', ' ').slice(0, 16) : '未记录';
}

function splitStandardList(value) {
  return String(value || '')
    .split(/[\n\r；;、,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function standardDisplayText(value) {
  const items = splitStandardList(value);
  return items.length ? items.join('；') : '';
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

.admin-subtitle {
  display: block;
  margin-top: 10rpx;
  color: #6b665f;
  font-size: 24rpx;
  line-height: 1.5;
}

.topbar-actions,
.records-actions,
.editor-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}

.admin-workspace {
  display: grid;
  gap: 24rpx;
  max-width: 1320px;
  margin: 0 auto;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
}

.summary-card,
.records-panel,
.create-panel,
.next-step-banner {
  border: 1px solid #ddd6cc;
  border-radius: 8rpx;
  background: #fffdf9;
}

.summary-card {
  padding: 22rpx;
}

.summary-value,
.summary-label,
.toolbar-meta,
.panel-title,
.panel-copy,
.next-step-title,
.next-step-copy,
.empty-title,
.empty-copy,
.metric-value,
.metric-label,
.footer-hint {
  display: block;
}

.summary-value {
  color: #141414;
  font-size: 38rpx;
  font-weight: 720;
}

.summary-label {
  margin-top: 8rpx;
  color: #6b665f;
  font-size: 24rpx;
}

.records-panel {
  padding: 22rpx;
}

.records-heading {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-bottom: 20rpx;
}

.toolbar-meta {
  margin-top: 8rpx;
  color: #6b665f;
  font-size: 24rpx;
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12rpx;
  margin-bottom: 20rpx;
  align-items: center;
}

.create-panel {
  display: grid;
  gap: 22rpx;
  margin-bottom: 20rpx;
  padding: 22rpx;
  background: #fbf8f2;
}

.create-panel-head {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.panel-title {
  color: #151515;
  font-size: 30rpx;
  font-weight: 700;
}

.panel-copy {
  margin-top: 8rpx;
  color: #6b665f;
  font-size: 24rpx;
  line-height: 1.5;
}

.form-grid {
  display: grid;
  gap: 20rpx;
}

.wide-field {
  grid-column: 1 / -1;
}

.standard-textarea {
  min-height: 186rpx;
  font-family: "SFMono-Regular", Consolas, monospace;
}

.small-button {
  min-height: 74rpx;
  padding: 0 20rpx;
  font-size: 24rpx;
  line-height: 74rpx;
  white-space: nowrap;
}

.message-text {
  color: #8d3c22;
  font-size: 24rpx;
  line-height: 1.5;
}

.panel-message {
  display: block;
  margin-bottom: 18rpx;
}

.next-step-banner {
  display: grid;
  gap: 18rpx;
  margin-bottom: 20rpx;
  padding: 22rpx;
  border-color: #cfdcc8;
  background: #fbfff8;
}

.next-step-title {
  color: #223d1f;
  font-size: 28rpx;
  font-weight: 700;
}

.next-step-copy {
  margin-top: 8rpx;
  color: #5f7558;
  font-size: 24rpx;
  line-height: 1.5;
}

.empty-state {
  display: grid;
  justify-items: center;
  gap: 14rpx;
  padding: 48rpx 20rpx;
  color: #746e65;
  text-align: center;
}

.empty-title {
  color: #151515;
  font-size: 30rpx;
  font-weight: 700;
}

.empty-copy {
  color: #746e65;
  font-size: 24rpx;
  line-height: 1.6;
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

.clothing-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
}

.metric-item {
  padding: 16rpx;
  border: 1px solid #e5ded4;
  border-radius: 8rpx;
  background: #fffdf9;
}

.wide-metric {
  grid-column: 1 / -1;
}

.metric-value {
  color: #171717;
  font-size: 28rpx;
  font-weight: 700;
}

.metric-label {
  margin-top: 6rpx;
  color: #746e65;
  font-size: 22rpx;
}

.clothing-meta {
  display: grid;
  gap: 8rpx;
  color: #6b665f;
  font-size: 24rpx;
}

.meta-row {
  min-width: 0;
}

.standard-meta {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6rpx;
  align-items: start;
}

.meta-label {
  white-space: nowrap;
}

.standard-list {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.standard-chip {
  max-width: 100%;
  padding: 4rpx 12rpx;
  border: 1px solid #d8dfd1;
  border-radius: 999rpx;
  background: #f7fbf4;
  color: #415f37;
  font-size: 22rpx;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.clothing-footer {
  display: grid;
  gap: 14rpx;
  align-items: center;
  color: #5f5a52;
  font-size: 24rpx;
}

.footer-hint {
  color: #6b665f;
  font-size: 24rpx;
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

  .admin-subtitle,
  .toolbar-meta,
  .summary-label,
  .panel-copy,
  .next-step-copy,
  .empty-copy,
  .clothing-subtitle,
  .clothing-meta,
  .clothing-footer,
  .footer-hint,
  .message-text {
    font-size: 13px;
  }

  .topbar-actions,
  .records-actions,
  .editor-actions {
    grid-template-columns: repeat(2, auto);
    gap: 10px;
  }

  .summary-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .summary-card,
  .records-panel,
  .create-panel,
  .next-step-banner,
  .clothing-card {
    border-radius: 8px;
  }

  .summary-card {
    padding: 18px;
  }

  .summary-value {
    font-size: 28px;
  }

  .records-panel {
    padding: 20px;
  }

  .records-heading,
  .create-panel-head,
  .next-step-banner,
  .clothing-footer {
    grid-template-columns: minmax(0, 1fr) auto;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .records-heading,
  .create-panel-head {
    display: flex;
  }

  .search-row {
    gap: 10px;
    margin-bottom: 18px;
  }

  .create-panel,
  .next-step-banner {
    padding: 18px;
  }

  .panel-title,
  .empty-title {
    font-size: 18px;
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

  .clothing-list {
    gap: 14px;
  }

  .clothing-card {
    padding: 18px;
  }

  .clothing-name {
    font-size: 19px;
  }

  .clothing-metrics {
    grid-template-columns: 120px 120px minmax(160px, 1fr);
  }

  .wide-metric {
    grid-column: auto;
  }

  .metric-item {
    padding: 12px;
  }

  .metric-value {
    font-size: 18px;
  }

  .metric-label {
    font-size: 12px;
  }

  .clothing-meta {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .standard-chip {
    padding: 2px 8px;
    font-size: 12px;
  }
}
</style>
