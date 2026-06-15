<template>
  <view class="page-shell admin-page">
    <view class="admin-topbar">
      <view>
        <text class="eyebrow">GARMENT RECORDS</text>
        <text class="admin-title">吊牌数据后台</text>
      </view>
      <view class="topbar-actions">
        <button class="secondary-button" @click="goHome">前台</button>
        <button class="ghost-button" @click="logout">退出</button>
      </view>
    </view>

    <view class="admin-layout">
      <view class="editor-panel">
        <view class="panel-heading">
          <text class="section-title">{{ editingSn ? '编辑吊牌' : '新增吊牌' }}</text>
          <button class="ghost-button small-button" @click="resetForm">清空</button>
        </view>

        <view class="form-grid">
          <view class="form-field sn-field">
            <text class="field-label">SN 码</text>
            <view class="sn-row">
              <input
                v-model="form.sn"
                class="form-input"
                :disabled="Boolean(editingSn)"
                placeholder="自动生成或手动输入"
              />
              <button
                class="secondary-button small-button"
                :disabled="Boolean(editingSn)"
                @click="fillGeneratedSn"
              >
                生成
              </button>
            </view>
          </view>

          <view v-for="field in textFields" :key="field.key" class="form-field">
            <text class="field-label">{{ field.label }}</text>
            <input
              v-model="form[field.key]"
              class="form-input"
              :placeholder="field.placeholder"
            />
          </view>

          <view class="form-field wide-field">
            <text class="field-label">面料</text>
            <textarea v-model="form.fabric" class="form-textarea" placeholder="例如 羊毛 58%，聚酯纤维 38%，氨纶 4%" />
          </view>

          <view class="form-field wide-field">
            <text class="field-label">洗护说明</text>
            <textarea v-model="form.careInstructions" class="form-textarea" placeholder="例如 不可漂白；悬挂晾干；低温熨烫。" />
          </view>

          <view class="form-field wide-field">
            <text class="field-label">备注</text>
            <textarea v-model="form.remark" class="form-textarea" placeholder="内部备注或展示补充信息" />
          </view>

          <view class="form-field">
            <text class="field-label">状态</text>
            <picker :range="statusOptions" range-key="label" @change="changeStatus">
              <view class="form-picker">{{ statusLabel }}</view>
            </picker>
          </view>
        </view>

        <view class="editor-actions">
          <button class="primary-button" :disabled="saving" @click="saveRecord">
            {{ saving ? '保存中' : editingSn ? '保存修改' : '新增记录' }}
          </button>
          <text v-if="formMessage" class="message-text">{{ formMessage }}</text>
        </view>
      </view>

      <view class="records-panel">
        <view class="records-toolbar">
          <input
            v-model="query"
            class="form-input search-input"
            placeholder="搜索 SN、品名、款号、厂家"
            @confirm="loadRecords"
          />
          <button class="secondary-button" @click="loadRecords">刷新</button>
        </view>

        <view v-if="recordsLoading" class="empty-state">正在加载数据...</view>
        <view v-else-if="records.length === 0" class="empty-state">暂无吊牌记录。</view>

        <view v-else class="record-list">
          <view v-for="record in records" :key="record.sn" class="record-item">
            <view class="record-main">
              <text class="record-name">{{ record.productName || '未命名产品' }}</text>
              <text class="record-sn">{{ record.sn }}</text>
              <text :class="['status-pill', record.status === 'inactive' ? 'inactive' : '']">
                {{ record.status === 'active' ? '有效' : '停用' }}
              </text>
            </view>

            <view class="record-meta">
              <text>款号：{{ record.styleNo || '未录入' }}</text>
              <text>厂家：{{ record.manufacturer || '未录入' }}</text>
            </view>

            <view class="qr-section">
              <view class="qr-box">
                <image class="qr-image" :src="qrcodeUrl(record.sn, 'url')" mode="aspectFit" />
                <text>详情页二维码</text>
              </view>
              <view class="qr-box">
                <image class="qr-image" :src="qrcodeUrl(record.sn, 'sn')" mode="aspectFit" />
                <text>纯 SN 二维码</text>
              </view>
            </view>

            <view class="record-actions">
              <button class="secondary-button small-button" @click="editRecord(record)">编辑</button>
              <button class="ghost-button small-button" @click="openDetail(record.sn)">查看</button>
              <button class="ghost-button small-button" @click="downloadQr(record.sn, 'url')">下载链接码</button>
              <button
                :class="record.status === 'active' ? 'danger-button small-button' : 'secondary-button small-button'"
                @click="toggleStatus(record)"
              >
                {{ record.status === 'active' ? '停用' : '启用' }}
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
  createGarment,
  generateSn,
  getToken,
  listGarments,
  qrcodeUrl,
  updateGarment
} from '../../utils/api.js';

const emptyForm = {
  sn: '',
  productName: '',
  styleNo: '',
  color: '',
  size: '',
  fabric: '',
  standard: '',
  safetyCategory: '',
  grade: '',
  manufacturer: '',
  manufacturerAddress: '',
  careInstructions: '',
  batchNo: '',
  productionDate: '',
  remark: '',
  status: 'active'
};

const textFields = [
  { key: 'productName', label: '品名', placeholder: '高级梭织外套' },
  { key: 'styleNo', label: '款号', placeholder: 'CP-JK-2601' },
  { key: 'color', label: '颜色', placeholder: '石墨黑' },
  { key: 'size', label: '尺码', placeholder: 'M' },
  { key: 'standard', label: '执行标准', placeholder: 'GB/T 2664-2017' },
  { key: 'safetyCategory', label: '安全类别', placeholder: 'GB 18401-2010 B 类' },
  { key: 'grade', label: '质量等级', placeholder: '一等品' },
  { key: 'manufacturer', label: '厂家', placeholder: '赛博衣饰制造有限公司' },
  { key: 'manufacturerAddress', label: '厂家地址', placeholder: '广东省深圳市南山区...' },
  { key: 'batchNo', label: '生产批次', placeholder: 'BATCH-202606-A01' },
  { key: 'productionDate', label: '生产日期', placeholder: '2026-06-15' }
];

const statusOptions = [
  { label: '有效', value: 'active' },
  { label: '停用', value: 'inactive' }
];

const form = reactive({ ...emptyForm });
const editingSn = ref('');
const saving = ref(false);
const formMessage = ref('');
const query = ref('');
const records = ref([]);
const recordsLoading = ref(false);

const statusLabel = computed(
  () => statusOptions.find((item) => item.value === form.status)?.label || '有效'
);

onLoad(() => {
  if (!getToken()) {
    uni.redirectTo({
      url: '/pages/admin/login'
    });
    return;
  }

  loadRecords();
});

function assignForm(data) {
  Object.assign(form, emptyForm, data || {});
}

function resetForm() {
  editingSn.value = '';
  formMessage.value = '';
  assignForm();
}

function changeStatus(event) {
  form.status = statusOptions[Number(event.detail.value)]?.value || 'active';
}

async function fillGeneratedSn() {
  formMessage.value = '';
  try {
    const response = await generateSn();
    form.sn = response.sn;
  } catch (error) {
    handleAuthError(error);
    formMessage.value = error.message || '生成 SN 失败。';
  }
}

async function saveRecord() {
  formMessage.value = '';
  saving.value = true;

  try {
    const payload = { ...form, sn: form.sn.trim().toUpperCase() };
    if (editingSn.value) {
      await updateGarment(editingSn.value, payload);
      formMessage.value = '已保存修改。';
    } else {
      await createGarment(payload);
      formMessage.value = '已新增吊牌记录。';
    }

    await loadRecords();
    if (!editingSn.value) {
      resetForm();
    }
  } catch (error) {
    handleAuthError(error);
    formMessage.value = error.message || '保存失败。';
  } finally {
    saving.value = false;
  }
}

async function loadRecords() {
  recordsLoading.value = true;

  try {
    const response = await listGarments(query.value.trim());
    records.value = response.garments || [];
  } catch (error) {
    handleAuthError(error);
    formMessage.value = error.message || '加载记录失败。';
  } finally {
    recordsLoading.value = false;
  }
}

function editRecord(record) {
  editingSn.value = record.sn;
  assignForm(record);
  formMessage.value = '';
  uni.pageScrollTo({
    scrollTop: 0,
    duration: 200
  });
}

async function toggleStatus(record) {
  try {
    await updateGarment(record.sn, {
      status: record.status === 'active' ? 'inactive' : 'active'
    });
    await loadRecords();
  } catch (error) {
    handleAuthError(error);
    formMessage.value = error.message || '状态更新失败。';
  }
}

function openDetail(sn) {
  uni.navigateTo({
    url: `/pages/garment/detail?sn=${encodeURIComponent(sn)}`
  });
}

function downloadQr(sn, type) {
  const url = qrcodeUrl(sn, type);

  // #ifdef H5
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sn}-${type}-qrcode.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // #endif

  // #ifndef H5
  uni.previewImage({
    urls: [url]
  });
  // #endif
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

.sn-row {
  display: grid;
  grid-template-columns: 1fr 140rpx;
  gap: 12rpx;
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

.record-list {
  display: grid;
  gap: 18rpx;
}

.record-item {
  padding: 22rpx;
  border: 1px solid #e3dcd2;
  border-radius: 8rpx;
  background: #fbf8f2;
}

.record-main {
  display: grid;
  gap: 10rpx;
}

.record-name {
  color: #141414;
  font-size: 30rpx;
  font-weight: 650;
}

.record-sn {
  color: #5f5a52;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 24rpx;
}

.record-meta {
  display: grid;
  gap: 8rpx;
  margin-top: 16rpx;
  color: #6b665f;
  font-size: 24rpx;
}

.qr-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
  margin-top: 20rpx;
}

.qr-box {
  display: grid;
  justify-items: center;
  gap: 10rpx;
  padding: 14rpx;
  border: 1px solid #e1d9ce;
  border-radius: 8rpx;
  background: #fffdf9;
  color: #6b665f;
  font-size: 22rpx;
}

.qr-image {
  width: 176rpx;
  height: 176rpx;
}

.record-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12rpx;
  margin-top: 20rpx;
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
    grid-template-columns: minmax(360px, 0.86fr) minmax(0, 1.14fr);
    align-items: start;
    gap: 24px;
  }

  .editor-panel,
  .records-panel {
    border-radius: 8px;
  }

  .editor-panel {
    position: sticky;
    top: 24px;
    padding: 22px;
  }

  .records-panel {
    padding: 18px;
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

  .wide-field,
  .sn-field {
    grid-column: span 2;
  }

  .sn-row {
    grid-template-columns: 1fr 96px;
  }

  .small-button {
    min-height: 38px;
    padding: 0 12px;
    font-size: 13px;
    line-height: 38px;
  }

  .record-item {
    padding: 18px;
  }

  .record-main {
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 14px;
  }

  .record-name {
    font-size: 18px;
  }

  .record-sn {
    font-size: 13px;
  }

  .record-meta {
    grid-template-columns: 1fr 1fr;
    font-size: 13px;
  }

  .qr-section {
    grid-template-columns: 132px 132px;
  }

  .qr-image {
    width: 96px;
    height: 96px;
  }

  .record-actions {
    grid-template-columns: repeat(4, auto);
    justify-content: start;
  }
}
</style>
