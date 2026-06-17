<template>
  <div class="page-shell admin-page">
    <div class="admin-topbar">
      <div>
        <span class="eyebrow">ADMIN WORKSPACE</span>
        <span class="admin-title">校服吊牌后台</span>
        <span class="admin-subtitle">先找到衣服主档，再进入详情生成批次 SN。</span>
      </div>
      <div class="topbar-actions">
        <button class="secondary-button" @click="goHome">前台</button>
        <button class="ghost-button" @click="logout">退出</button>
      </div>
    </div>

    <div class="admin-workspace">
      <div class="summary-grid">
        <div v-for="item in summaryCards" :key="item.label" class="summary-card">
          <span class="summary-value">{{ item.value }}</span>
          <span class="summary-label">{{ item.label }}</span>
        </div>
      </div>

      <div class="records-panel">
        <div class="records-heading">
          <div>
            <span class="section-title">衣服主档</span>
            <span class="toolbar-meta">{{ clothes.length }} 条记录</span>
          </div>
          <div class="records-actions">
            <button class="primary-button small-button" @click="openCreatePanel">
              新增衣服
            </button>
            <button class="secondary-button small-button" @click="loadClothes">刷新</button>
          </div>
        </div>

        <div class="search-row">
          <input
            v-model="query"
            class="form-input search-input"
            placeholder="搜索衣服名称、面料、厂家、执行标准"
            @keyup.enter="loadClothes"
          />
          <button class="secondary-button small-button" @click="loadClothes">搜索</button>
        </div>

        <div v-if="showCreatePanel" class="create-panel">
          <div class="create-panel-head">
            <div>
              <span class="panel-title">新增衣服主档</span>
              <span class="panel-copy">录入通用信息后，到详情页生成具体批次和 SN。</span>
            </div>
            <button class="ghost-button small-button" @click="closeCreatePanel">收起</button>
          </div>

          <div class="form-grid">
            <div v-for="field in clothingTextFields" :key="field.key" class="form-field">
              <span class="field-label">{{ field.label }}</span>
              <input
                v-model="clothingForm[field.key]"
                class="form-input"
                :placeholder="field.placeholder"
              />
            </div>

            <div class="form-field wide-field">
              <span class="field-label">执行标准</span>
              <textarea
                v-model="clothingForm.standard"
                class="form-textarea standard-textarea"
                :placeholder="standardPlaceholder"
              />
            </div>

            <div class="form-field wide-field">
              <span class="field-label">面料</span>
              <textarea
                v-model="clothingForm.fabric"
                class="form-textarea"
                placeholder="例如 羊毛 58%，聚酯纤维 38%，氨纶 4%"
              />
            </div>

            <div class="form-field wide-field">
              <span class="field-label">洗护说明</span>
              <textarea
                v-model="clothingForm.careInstructions"
                class="form-textarea"
                placeholder="例如 不可漂白；悬挂晾干；低温熨烫。"
              />
            </div>

            <div class="form-field wide-field">
              <span class="field-label">备注</span>
              <textarea
                v-model="clothingForm.remark"
                class="form-textarea"
                placeholder="衣服主档备注，不包含款号、颜色、尺码、批次。"
              />
            </div>
          </div>

          <div class="editor-actions">
            <button class="primary-button" :disabled="saving" @click="saveClothing">
              {{ saving ? '保存中' : '保存衣服主档' }}
            </button>
            <button class="ghost-button" @click="resetForm">清空</button>
          </div>
          <span v-if="formMessage" class="message-text">{{ formMessage }}</span>
        </div>

        <div v-if="lastCreatedClothing" class="next-step-banner">
          <div>
            <span class="next-step-title">已新增：{{ lastCreatedClothing.productName || '未命名衣服' }}</span>
            <span class="next-step-copy">下一步进入详情，生成颜色、尺码和批次 SN。</span>
          </div>
          <button class="primary-button small-button" @click="goDetail(lastCreatedClothing.id)">
            进入详情
          </button>
        </div>

        <span v-if="listMessage" class="message-text panel-message">{{ listMessage }}</span>

        <div v-if="loading" class="empty-state">正在加载衣服主档...</div>
        <div v-else-if="clothes.length === 0" class="empty-state">
          <span class="empty-title">暂无衣服主档</span>
          <span class="empty-copy">先新增一个衣服主档，再到详情页生成批次 SN。</span>
          <button class="primary-button small-button" @click="openCreatePanel">新增衣服</button>
        </div>

        <div v-else class="clothing-list">
          <div
            v-for="item in clothes"
            :key="item.id"
            class="clothing-card"
            @click="goDetail(item.id)"
          >
            <div class="clothing-card-head">
              <div>
                <span class="clothing-name">{{ item.productName || '未命名衣服' }}</span>
                <span class="clothing-subtitle">{{ item.manufacturer || '未录入厂家' }}</span>
              </div>
              <span :class="['status-pill', item.status === 'inactive' ? 'inactive' : '']">
                {{ statusText(item.status) }}
              </span>
            </div>

            <div class="clothing-metrics">
              <div class="metric-item">
                <span class="metric-value">{{ item.batchCount || 0 }}</span>
                <span class="metric-label">批次</span>
              </div>
              <div class="metric-item">
                <span class="metric-value">{{ item.garmentCount || 0 }}</span>
                <span class="metric-label">SN</span>
              </div>
              <div class="metric-item wide-metric">
                <span class="metric-value">{{ formatDateTime(item.updatedAt) }}</span>
                <span class="metric-label">最近更新</span>
              </div>
            </div>

            <div class="clothing-meta">
              <div class="meta-row standard-meta">
                <span class="meta-label">执行标准：</span>
                <div v-if="splitStandardList(item.standard).length > 1" class="standard-list">
                  <span
                    v-for="(standard, index) in splitStandardList(item.standard)"
                    :key="`${standard}-${index}`"
                    class="standard-chip"
                  >
                    {{ standard }}
                  </span>
                </div>
                <span v-else>{{ standardDisplayText(item.standard) || '未录入' }}</span>
              </div>
              <span>安全类别：{{ item.safetyCategory || '未录入' }}</span>
              <span>质量等级：{{ item.grade || '未录入' }}</span>
              <span>面料：{{ item.fabric || '未录入' }}</span>
            </div>

            <div class="clothing-footer">
              <span class="footer-hint">
                {{ item.batchCount ? '可继续管理批次和 SN' : '还没有批次，进入详情生成 SN' }}
              </span>
              <button class="secondary-button small-button" @click.stop="goDetail(item.id)">
                进入详情
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  clearToken,
  createClothing,
  FRONTEND_BASE_URL,
  listClothes
} from '../utils/api.js';

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
const router = useRouter();

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

onMounted(() => {
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
  router.push(`/clothes/${encodeURIComponent(id)}`);
}

function handleAuthError(error) {
  if (error.statusCode === 401) {
    clearToken();
    router.replace('/login');
  }
}

function logout() {
  clearToken();
  router.replace('/login');
}

function goHome() {
  window.open(FRONTEND_BASE_URL, '_blank', 'noopener,noreferrer');
}
</script>

<style scoped>
.admin-page {
  padding: 14px;
}

.admin-topbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 1320px;
  margin: 0 auto 13px;
}

.eyebrow {
  display: block;
  color: #746e65;
  font-size: 11px;
  font-weight: 700;
}

.admin-title {
  display: block;
  margin-top: 4px;
  color: #121212;
  font-size: 21px;
  font-weight: 680;
}

.admin-subtitle {
  display: block;
  margin-top: 5px;
  color: #6b665f;
  font-size: 12px;
  line-height: 1.5;
}

.topbar-actions,
.records-actions,
.editor-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.admin-workspace {
  display: grid;
  gap: 12px;
  max-width: 1320px;
  margin: 0 auto;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.summary-card,
.records-panel,
.create-panel,
.next-step-banner {
  border: 1px solid #ddd6cc;
  border-radius: 4px;
  background: #fffdf9;
}

.summary-card {
  padding: 11px;
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
  font-size: 19px;
  font-weight: 720;
}

.summary-label {
  margin-top: 4px;
  color: #6b665f;
  font-size: 12px;
}

.records-panel {
  padding: 11px;
}

.records-heading {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-bottom: 10px;
}

.toolbar-meta {
  margin-top: 4px;
  color: #6b665f;
  font-size: 12px;
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  margin-bottom: 10px;
  align-items: center;
}

.create-panel {
  display: grid;
  gap: 11px;
  margin-bottom: 10px;
  padding: 11px;
  background: #fbf8f2;
}

.create-panel-head {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.panel-title {
  color: #151515;
  font-size: 15px;
  font-weight: 700;
}

.panel-copy {
  margin-top: 4px;
  color: #6b665f;
  font-size: 12px;
  line-height: 1.5;
}

.form-grid {
  display: grid;
  gap: 10px;
}

.wide-field {
  grid-column: 1 / -1;
}

.standard-textarea {
  min-height: 93px;
  font-family: "SFMono-Regular", Consolas, monospace;
}

.small-button {
  min-height: 37px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 37px;
  white-space: nowrap;
}

.message-text {
  color: #8d3c22;
  font-size: 12px;
  line-height: 1.5;
}

.panel-message {
  display: block;
  margin-bottom: 9px;
}

.next-step-banner {
  display: grid;
  gap: 9px;
  margin-bottom: 10px;
  padding: 11px;
  border-color: #cfdcc8;
  background: #fbfff8;
}

.next-step-title {
  color: #223d1f;
  font-size: 14px;
  font-weight: 700;
}

.next-step-copy {
  margin-top: 4px;
  color: #5f7558;
  font-size: 12px;
  line-height: 1.5;
}

.empty-state {
  display: grid;
  justify-items: center;
  gap: 7px;
  padding: 24px 10px;
  color: #746e65;
  text-align: center;
}

.empty-title {
  color: #151515;
  font-size: 15px;
  font-weight: 700;
}

.empty-copy {
  color: #746e65;
  font-size: 12px;
  line-height: 1.6;
}

.clothing-list {
  display: grid;
  gap: 9px;
}

.clothing-card {
  display: grid;
  gap: 9px;
  padding: 11px;
  border: 1px solid #e3dcd2;
  border-radius: 4px;
  background: #fbf8f2;
}

.clothing-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.clothing-name {
  display: block;
  color: #141414;
  font-size: 16px;
  font-weight: 650;
}

.clothing-subtitle {
  display: block;
  margin-top: 4px;
  color: #6b665f;
  font-size: 12px;
}

.clothing-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.metric-item {
  padding: 8px;
  border: 1px solid #e5ded4;
  border-radius: 4px;
  background: #fffdf9;
}

.wide-metric {
  grid-column: 1 / -1;
}

.metric-value {
  color: #171717;
  font-size: 14px;
  font-weight: 700;
}

.metric-label {
  margin-top: 3px;
  color: #746e65;
  font-size: 11px;
}

.clothing-meta {
  display: grid;
  gap: 4px;
  color: #6b665f;
  font-size: 12px;
}

.meta-row {
  min-width: 0;
}

.standard-meta {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 3px;
  align-items: start;
}

.meta-label {
  white-space: nowrap;
}

.standard-list {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.standard-chip {
  max-width: 100%;
  padding: 2px 6px;
  border: 1px solid #d8dfd1;
  border-radius: 499.5px;
  background: #f7fbf4;
  color: #415f37;
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.clothing-footer {
  display: grid;
  gap: 7px;
  align-items: center;
  color: #5f5a52;
  font-size: 12px;
}

.footer-hint {
  color: #6b665f;
  font-size: 12px;
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
