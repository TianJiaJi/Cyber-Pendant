<template>
  <div class="page-shell detail-admin-page">
    <div class="admin-topbar">
      <div>
        <span class="eyebrow">CLOTHING DETAIL</span>
        <span class="admin-title">{{ clothing?.productName || '衣服详情' }}</span>
        <span class="admin-subtitle">维护主档信息，生成批次 SN，并处理绑定与二维码。</span>
      </div>
      <div class="topbar-actions">
        <button class="secondary-button" @click="goBack">返回主档</button>
        <button class="ghost-button" @click="logout">退出</button>
      </div>
    </div>

    <div v-if="loading" class="state-block">正在加载衣服详情...</div>
    <div v-else-if="pageMessage && !clothing" class="state-block">{{ pageMessage }}</div>

    <div v-else class="detail-layout">
      <div class="workspace-stack">
        <div class="summary-card">
          <div class="summary-head">
            <div>
              <span class="summary-kicker">当前主档</span>
              <span class="summary-title">{{ clothing?.productName || '未命名衣服' }}</span>
              <span class="summary-copy">{{ clothing?.manufacturer || '未录入厂家' }}</span>
            </div>
            <span :class="['status-pill', clothingForm.status === 'inactive' ? 'inactive' : '']">
              {{ statusText(clothingForm.status) }}
            </span>
          </div>

          <div class="summary-metrics">
            <div class="metric-item">
              <span class="metric-value">{{ batches.length }}</span>
              <span class="metric-label">批次</span>
            </div>
            <div class="metric-item">
              <span class="metric-value">{{ totalSnCount }}</span>
              <span class="metric-label">SN</span>
            </div>
            <div class="metric-item wide-metric">
              <span class="metric-value">{{ formatDateTime(clothing?.updatedAt) }}</span>
              <span class="metric-label">最近更新</span>
            </div>
          </div>
        </div>

        <div class="editor-panel">
          <div class="panel-heading">
            <div>
              <span class="section-title">基本信息</span>
              <span class="section-copy">主档信息会同步到该衣服下的公开吊牌页。</span>
            </div>
            <button
              :class="clothingEditorOpen ? 'ghost-button small-button' : 'secondary-button small-button'"
              @click="toggleClothingEditor"
            >
              {{ clothingEditorOpen ? '取消编辑' : '编辑信息' }}
            </button>
          </div>

          <div v-if="!clothingEditorOpen" class="info-grid">
            <div v-for="item in clothingInfoRows" :key="item.label" class="info-item">
              <span class="info-label">{{ item.label }}</span>
              <div
                v-if="item.type === 'standards' && splitStandardList(item.value).length > 1"
                class="standard-list"
              >
                <span
                  v-for="(standard, index) in splitStandardList(item.value)"
                  :key="`${standard}-${index}`"
                  class="standard-chip"
                >
                  {{ standard }}
                </span>
              </div>
              <span v-else class="info-value">
                {{ item.type === 'standards' ? standardDisplayText(item.value) || '未录入' : item.value || '未录入' }}
              </span>
            </div>
          </div>

          <div v-else class="form-grid">
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
              <textarea v-model="clothingForm.fabric" class="form-textarea" />
            </div>

            <div class="form-field wide-field">
              <span class="field-label">洗护说明</span>
              <textarea v-model="clothingForm.careInstructions" class="form-textarea" />
            </div>

            <div class="form-field wide-field">
              <span class="field-label">备注</span>
              <textarea v-model="clothingForm.remark" class="form-textarea" />
            </div>

            <div class="editor-actions wide-field">
              <button class="primary-button" :disabled="savingClothing" @click="saveClothing">
                {{ savingClothing ? '保存中' : '保存衣服信息' }}
              </button>
            </div>
          </div>

          <span v-if="clothingMessage" class="message-text panel-message">{{ clothingMessage }}</span>
        </div>

        <div class="editor-panel">
          <div class="panel-heading">
            <div>
              <span class="section-title">生成批次 SN</span>
              <span class="section-copy">录入款号、颜色、尺码和批次标签后批量生成二维码。</span>
            </div>
            <button class="ghost-button small-button" @click="resetBatchForm">清空</button>
          </div>

          <div class="helper-strip">
            至少填写款号、颜色、尺码或批次标签之一；单次最多生成 500 个 SN。
          </div>

          <div class="form-grid">
            <div v-for="field in batchTextFields" :key="field.key" class="form-field">
              <span class="field-label">{{ field.label }}</span>
              <div v-if="field.key === 'productionDate'" class="date-picker-row">
                <div class="form-picker date-picker-value">
                  {{ batchForm.productionDate || todayDateString() }}
                </div>
                <button class="secondary-button date-picker-button" @click="(e) => openDatePicker('create', e)">
                  选择日期
                </button>
              </div>
              <input
                v-else
                v-model="batchForm[field.key]"
                class="form-input"
                :placeholder="field.placeholder"
              />
            </div>

            <div class="form-field">
              <span class="field-label">生成数量</span>
              <input v-model="batchForm.count" class="form-input" type="number" />
            </div>

            <div class="form-field wide-field">
              <span class="field-label">批次备注</span>
              <textarea
                v-model="batchForm.remark"
                class="form-textarea compact-textarea"
                placeholder="本批次特殊说明"
              />
            </div>
          </div>

          <div class="editor-actions">
            <button class="primary-button" :disabled="creatingBatch" @click="createBatch">
              {{ creatingBatch ? '生成中' : '生成批次 SN' }}
            </button>
          </div>

          <span v-if="batchMessage" class="message-text panel-message">{{ batchMessage }}</span>
        </div>

        <div class="danger-zone">
          <div>
            <span class="danger-title">主档危险操作</span>
            <span class="danger-copy">停用会让该衣服下所有 SN 扫码返回停用；真删除会让已印刷二维码查不到。</span>
          </div>
          <div class="danger-actions">
            <button
              :class="clothingForm.status === 'active' ? 'danger-button small-button' : 'secondary-button small-button'"
              @click="toggleClothingStatus"
            >
              {{ clothingForm.status === 'active' ? '停用衣服' : '启用衣服' }}
            </button>
            <button class="danger-button small-button" @click="hardDeleteClothing">
              真删除衣服
            </button>
          </div>
        </div>
      </div>

        <div class="batches-panel">
          <div class="records-toolbar">
            <div>
              <span class="section-title">批次与 SN</span>
              <span class="toolbar-meta">{{ batches.length }} 个批次，{{ totalSnCount }} 个 SN</span>
            </div>
            <button class="secondary-button" @click="loadAll">刷新</button>
          </div>

          <div class="qr-mode-panel">
            <div>
              <span class="tool-title">二维码模式</span>
              <span class="section-copy">{{ qrModeHelp }}</span>
            </div>
            <div class="qr-mode-options">
              <label
                v-for="option in qrModeOptions"
                :key="option.value"
                :class="['qr-mode-option', qrMode === option.value ? 'active' : '']"
              >
                <input
                  v-model="qrMode"
                  class="qr-mode-radio"
                  type="radio"
                  :value="option.value"
                  @change="setQrMode(option.value)"
                />
                <span class="qr-mode-label">{{ option.label }}</span>
                <span class="qr-mode-description">{{ option.description }}</span>
              </label>
            </div>
          </div>

          <span v-if="snMessage" class="message-text panel-message">{{ snMessage }}</span>
          <span v-if="pageMessage && clothing" class="message-text panel-message">{{ pageMessage }}</span>

        <div v-if="batchesLoading" class="empty-state">正在加载批次...</div>
        <div v-else-if="batches.length === 0" class="empty-state">
          <span class="empty-title">暂无批次</span>
          <span class="empty-copy">左侧生成一批 SN 后，这里会出现批次和二维码管理入口。</span>
        </div>

        <div v-else class="batch-list">
          <div v-for="batch in batches" :key="batch.id" class="batch-card">
            <div class="batch-head">
              <div>
                <span class="batch-title">批次：{{ batchLabel(batch) }}</span>
                <span class="batch-subtitle">{{ batchSummary(batch) }}</span>
              </div>
              <span :class="['status-pill', batch.status === 'inactive' ? 'inactive' : '']">
                {{ batch.status === 'active' ? '有效批次' : '停用批次' }}
              </span>
            </div>

            <div class="batch-meta">
              <span>生产日期：{{ batch.productionDate || '未录入' }}</span>
              <span>SN 数量：{{ batchSnCount(batch) }}</span>
              <span>备注：{{ batch.remark || '未录入' }}</span>
            </div>

            <div class="batch-actions">
              <button class="secondary-button small-button" @click="toggleBatchExpanded(batch.id)">
                {{ isBatchExpanded(batch.id) ? '收起 SN' : `展开 SN (${batchSnCount(batch)})` }}
              </button>
              <button class="ghost-button small-button" @click="chooseExportFormat(batch)">
                导出本批
              </button>
              <button class="ghost-button small-button" @click="toggleBatchTools(batch.id)">
                {{ isBatchToolsOpen(batch.id) ? '收起管理' : '批次管理' }}
              </button>
            </div>

            <div v-if="isBatchToolsOpen(batch.id)" class="batch-tools">
              <div class="tool-head">
                <span class="tool-title">批次管理</span>
                <button class="secondary-button small-button" @click="startEditBatch(batch)">
                  编辑批次
                </button>
              </div>

              <div v-if="editingBatchId === batch.id" class="batch-editor">
                <div class="form-grid">
                  <div v-for="field in batchTextFields" :key="field.key" class="form-field">
                    <span class="field-label">{{ field.label }}</span>
                    <div v-if="field.key === 'productionDate'" class="date-picker-row">
                      <div class="form-picker date-picker-value">
                        {{ batchEditForm.productionDate || todayDateString() }}
                      </div>
                      <button class="secondary-button date-picker-button" @click="(e) => openDatePicker('edit', e)">
                        选择日期
                      </button>
                    </div>
                    <input v-else v-model="batchEditForm[field.key]" class="form-input" />
                  </div>

                  <div class="form-field wide-field">
                    <span class="field-label">批次备注</span>
                    <textarea v-model="batchEditForm.remark" class="form-textarea compact-textarea" />
                  </div>
                </div>

                <div class="batch-edit-actions">
                  <button class="primary-button small-button" :disabled="savingBatch" @click="saveBatch">
                    {{ savingBatch ? '保存中' : '保存批次' }}
                  </button>
                  <button class="ghost-button small-button" @click="cancelEditBatch">取消</button>
                </div>
              </div>

              <div class="tool-danger">
                <span class="danger-copy">停用批次会让本批 SN 扫码返回停用；真删除会移除本批所有 SN。</span>
                <div class="danger-actions">
                  <button
                    :class="batch.status === 'active' ? 'danger-button small-button' : 'secondary-button small-button'"
                    @click="toggleBatchStatus(batch)"
                  >
                    {{ batch.status === 'active' ? '停用批次' : '启用批次' }}
                  </button>
                  <button class="danger-button small-button" @click="hardDeleteBatch(batch)">
                    真删除批次
                  </button>
                </div>
              </div>
            </div>

            <div v-if="isBatchExpanded(batch.id)" class="sn-section">
              <div class="sn-toolbar">
                <span class="sn-toolbar-title">SN 明细</span>
                <span class="sn-toolbar-meta">{{ batchSnCount(batch) }} 个</span>
              </div>

              <div v-if="!batch.garments?.length" class="empty-state compact-empty">该批次暂无 SN。</div>

              <div v-else class="sn-list">
                <div v-for="record in batch.garments" :key="record.sn" class="sn-row">
                  <div class="sn-main">
                    <div class="sn-code-group">
                      <span class="sn-code">{{ record.sn }}</span>
                      <button class="sn-copy-button" @click.stop="copySn(record.sn)">复制</button>
                    </div>
                    <span :class="['status-pill', record.snStatus === 'inactive' ? 'inactive' : '']">
                      {{ record.snStatus === 'active' ? '有效' : '停用' }}
                    </span>
                  </div>

                  <div class="sn-meta">
                    <span :class="['binding-status-text', record.isBound ? 'bound' : '']">
                      绑定：{{ record.isBound ? '已绑定' : '未绑定' }}
                    </span>
                    <span>二维码：{{ qrModeLabel }}</span>
                    <template v-if="record.isBound && isBindingExpanded(record.sn)">
                      <span>学生：{{ bindingField(record, 'studentName') }}</span>
                      <span>学校：{{ bindingField(record, 'school') }}</span>
                      <span>班级：{{ bindingField(record, 'className') }}</span>
                      <span>联系人：{{ bindingField(record, 'contactName') }}</span>
                      <span>联系电话：{{ bindingPhone(record) }}</span>
                      <span>绑定时间：{{ bindingTime(record) }}</span>
                    </template>
                  </div>

                  <div class="sn-actions">
                    <button class="secondary-button small-button" @click="openDetail(record.sn)">
                      查看
                    </button>
                    <button class="ghost-button small-button" @click="downloadQr(record.sn)">
                      二维码
                    </button>
                    <button
                      v-if="record.isBound"
                      class="ghost-button small-button"
                      @click="toggleBindingExpanded(record.sn)"
                    >
                      {{ isBindingExpanded(record.sn) ? '收起绑定' : '绑定详情' }}
                    </button>
                    <button
                      :class="record.snStatus === 'active' ? 'danger-button small-button' : 'secondary-button small-button'"
                      @click="toggleGarmentStatus(record)"
                    >
                      {{ record.snStatus === 'active' ? '停用 SN' : '启用 SN' }}
                    </button>
                    <button
                      v-if="record.isBound"
                      class="danger-button small-button"
                      @click="unbindBinding(record)"
                    >
                      解绑
                    </button>
                    <button class="danger-button small-button" @click="hardDeleteGarment(record)">
                      真删除
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="collapsed-summary">
              SN 明细已收起，共 {{ batchSnCount(batch) }} 个。展开后可查看、复制、导出和停用。
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <ExportModal
    :is-open="exportModalOpen"
    :batch="selectedBatchForExport"
    :qr-mode="qrMode"
    :clothing="clothing"
    @close="closeExportModal"
    @export-complete="handleExportComplete"
    @export-error="handleExportError"
  />
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ExportModal from '../components/ExportModal.vue';
import {
  clearToken,
  createClothingBatch,
  deleteBatch,
  deleteClothing,
  deleteGarment,
  getClothing,
  getQrcodeMode,
  listClothingBatches,
  publicGarmentDetailUrl,
  qrcodeUrl,
  QRCODE_MODE_MINIPROGRAM,
  QRCODE_MODE_MINIPROGRAM_SQUARE,
  QRCODE_MODE_SN,
  QRCODE_MODE_URL,
  saveQrcodeMode,
  unbindGarmentBinding as unbindGarmentBindingApi,
  updateBatch,
  updateClothing,
  updateGarment
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
  remark: '',
  status: 'active'
};

function createEmptyBatchForm() {
  return {
    styleNo: '',
    color: '',
    size: '',
    batchNo: '',
    productionDate: todayDateString(),
    remark: '',
    count: '1'
  };
}

const clothingTextFields = [
  { key: 'productName', label: '衣服名称', placeholder: '高级梭织外套' },
  { key: 'safetyCategory', label: '安全类别', placeholder: 'GB 18401-2010 B 类' },
  { key: 'grade', label: '质量等级', placeholder: '一等品' },
  { key: 'manufacturer', label: '厂家', placeholder: '赛博衣饰制造有限公司' },
  { key: 'manufacturerAddress', label: '厂家地址', placeholder: '广东省深圳市南山区...' }
];

const batchTextFields = [
  { key: 'styleNo', label: '款号', placeholder: 'CP-JK-2601' },
  { key: 'color', label: '颜色', placeholder: '石墨黑' },
  { key: 'size', label: '尺码', placeholder: 'M' },
  { key: 'batchNo', label: '批次标签', placeholder: 'BATCH-202606-A01' },
  { key: 'productionDate', label: '生产日期', placeholder: todayDateString() }
];

const standardPlaceholder = [
  'GB/T 2664-2017',
  'GB 18401-2010 B 类',
  'GB 31701-2015'
].join('\n');

const clothingId = ref('');
const clothing = ref(null);
const batches = ref([]);
const loading = ref(true);
const batchesLoading = ref(false);
const savingClothing = ref(false);
const creatingBatch = ref(false);
const savingBatch = ref(false);
const clothingEditorOpen = ref(false);
const editingBatchId = ref('');
const expandedBatchIds = ref([]);
const openBatchToolsId = ref('');
const expandedBindingSns = ref([]);
const qrMode = ref(getQrcodeMode());
const exportModalOpen = ref(false);
const selectedBatchForExport = ref(null);
const pageMessage = ref('');
const clothingMessage = ref('');
const batchMessage = ref('');
const snMessage = ref('');
const clothingForm = reactive({ ...emptyClothingForm });
const batchForm = reactive(createEmptyBatchForm());
const batchEditForm = reactive(createEmptyBatchForm());
const route = useRoute();
const router = useRouter();

const totalSnCount = computed(() =>
  batches.value.reduce((total, batch) => total + batchSnCount(batch), 0)
);

const clothingInfoRows = computed(() => [
  { label: '衣服名称', value: clothingForm.productName },
  { label: '厂家', value: clothingForm.manufacturer },
  { label: '厂家地址', value: clothingForm.manufacturerAddress },
  { label: '执行标准', value: clothingForm.standard, type: 'standards' },
  { label: '安全类别', value: clothingForm.safetyCategory },
  { label: '质量等级', value: clothingForm.grade },
  { label: '面料', value: clothingForm.fabric },
  { label: '洗护说明', value: clothingForm.careInstructions },
  { label: '备注', value: clothingForm.remark }
]);

const qrModeOptions = [
  {
    value: QRCODE_MODE_URL,
    label: 'H5 链接二维码',
    description: '普通正方形二维码，内容为 H5 详情页链接，微信扫码打开浏览器。'
  },
  {
    value: QRCODE_MODE_MINIPROGRAM_SQUARE,
    label: '微信小程序二维码',
    description: '正方形微信小程序二维码，微信扫码直接进入小程序；需要配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET。'
  },
  {
    value: QRCODE_MODE_MINIPROGRAM,
    label: '微信小程序码',
    description: '圆形微信小程序码，微信扫码直接进入小程序；需要配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET。'
  },
  {
    value: QRCODE_MODE_SN,
    label: '原始 SN 码',
    description: '二维码内容仅为 SN 文本，适合内部扫描设备使用。'
  }
];

const qrModeLabel = computed(() => {
  const mode = qrModeOptions.find(o => o.value === qrMode.value);
  return mode?.label || 'H5 链接二维码';
});

const qrModeHelp = computed(() => {
  switch (qrMode.value) {
    case QRCODE_MODE_MINIPROGRAM:
      return '当前导出生成圆形微信小程序码，微信扫码直接进入小程序；需要配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET。';
    case QRCODE_MODE_MINIPROGRAM_SQUARE:
      return '当前导出生成正方形微信小程序二维码，微信扫码直接进入小程序；需要配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET。';
    case QRCODE_MODE_SN:
      return '当前导出生成原始 SN 码二维码，内容仅为 SN 文本。';
    default:
      return '当前导出会生成 H5 链接二维码，扫码内容为详情页链接；微信扫码打开浏览器。';
  }
});

onMounted(() => {
  clothingId.value = String(route.params.id || '').trim();
  if (!clothingId.value) {
    loading.value = false;
    pageMessage.value = '缺少衣服 ID。';
    return;
  }

  loadAll();
});

async function loadAll() {
  await Promise.all([loadClothing(), loadBatches()]);
}

async function loadClothing() {
  loading.value = true;

  try {
    const response = await getClothing(clothingId.value);
    clothing.value = response.clothing;
    Object.assign(clothingForm, emptyClothingForm, response.clothing || {});
  } catch (error) {
    handleAuthError(error);
    pageMessage.value = error.message || '加载衣服失败。';
  } finally {
    loading.value = false;
  }
}

async function loadBatches() {
  batchesLoading.value = true;

  try {
    const response = await listClothingBatches(clothingId.value);
    batches.value = response.batches || [];
    const existingIds = new Set(batches.value.map((batch) => String(batch.id)));
    expandedBatchIds.value = expandedBatchIds.value.filter((id) => existingIds.has(id));
  } catch (error) {
    handleAuthError(error);
    pageMessage.value = error.message || '加载批次失败。';
  } finally {
    batchesLoading.value = false;
  }
}

function toggleClothingEditor() {
  clothingEditorOpen.value = !clothingEditorOpen.value;
  clothingMessage.value = '';
  if (!clothingEditorOpen.value) {
    Object.assign(clothingForm, emptyClothingForm, clothing.value || {});
  }
}

function statusText(status) {
  return status === 'inactive' ? '停用' : '有效';
}

function formatDateTime(value) {
  return value ? value.replace('T', ' ').slice(0, 16) : '未记录';
}

function batchLabel(batch) {
  return batch?.batchNo || batch?.styleNo || `批次 ${batch?.id || ''}`.trim() || '未命名批次';
}

function batchSummary(batch) {
  const summary = [
    batch?.styleNo ? `款号：${batch.styleNo}` : '',
    batch?.color ? `颜色：${batch.color}` : '',
    batch?.size ? `尺码：${batch.size}` : '',
    `SN：${batchSnCount(batch)}`
  ].filter(Boolean);

  return summary.join(' / ');
}

function batchSnCount(batch) {
  return Number(batch?.garmentCount ?? batch?.garments?.length ?? 0);
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


function isBatchExpanded(batchId) {
  return expandedBatchIds.value.includes(String(batchId));
}

function toggleBatchExpanded(batchId) {
  const id = String(batchId);

  if (expandedBatchIds.value.includes(id)) {
    expandedBatchIds.value = expandedBatchIds.value.filter((item) => item !== id);
    return;
  }

  expandedBatchIds.value = [...expandedBatchIds.value, id];
}

function isBatchToolsOpen(batchId) {
  return openBatchToolsId.value === String(batchId);
}

function toggleBatchTools(batchId) {
  const id = String(batchId);
  openBatchToolsId.value = openBatchToolsId.value === id ? '' : id;
}

function isBindingExpanded(sn) {
  return expandedBindingSns.value.includes(String(sn));
}

function toggleBindingExpanded(sn) {
  const id = String(sn);

  if (expandedBindingSns.value.includes(id)) {
    expandedBindingSns.value = expandedBindingSns.value.filter((item) => item !== id);
    return;
  }

  expandedBindingSns.value = [...expandedBindingSns.value, id];
}

function todayDateString(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeDateValue(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    return '';
  }

  const [, year, month, day] = match;
  const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(`${normalized}T00:00:00`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day)
  ) {
    return '';
  }

  return normalized;
}

function openDatePicker(target, event) {
  const form = target === 'edit' ? batchEditForm : batchForm;
  const fallbackDate = normalizeDateValue(form.productionDate) || todayDateString();

  if (typeof document === 'undefined') {
    form.productionDate = fallbackDate;
    batchMessage.value = '当前平台暂不支持原生日期选择。';
    return;
  }

  const input = document.createElement('input');
  input.type = 'date';
  input.value = fallbackDate;

  // 获取按钮位置，在按钮附近显示日历
  let top = '50%';
  let left = '50%';

  if (event && event.target) {
    const rect = event.target.getBoundingClientRect();
    top = `${rect.bottom + 8}px`;
    left = `${rect.left}px`;
  }

  input.style.position = 'fixed';
  input.style.top = top;
  input.style.left = left;
  input.style.width = '280px';
  input.style.height = '40px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'auto';
  input.style.zIndex = '9999';

  const removeInput = () => {
    if (input.parentNode) {
      input.parentNode.removeChild(input);
    }
  };

  input.addEventListener('change', () => {
    form.productionDate = normalizeDateValue(input.value) || todayDateString();
    removeInput();
  });

  input.addEventListener('blur', () => {
    setTimeout(removeInput, 250);
  });

  document.body.appendChild(input);
  input.focus();

  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.click();
    }
  } catch {
    input.click();
  }
}

async function saveClothing() {
  savingClothing.value = true;
  clothingMessage.value = '';

  try {
    const response = await updateClothing(clothingId.value, { ...clothingForm });
    clothing.value = response.clothing;
    Object.assign(clothingForm, emptyClothingForm, response.clothing || {});
    clothingEditorOpen.value = false;
    clothingMessage.value = '已保存衣服信息。';
    await loadBatches();
  } catch (error) {
    handleAuthError(error);
    clothingMessage.value = error.message || '保存衣服失败。';
  } finally {
    savingClothing.value = false;
  }
}

async function toggleClothingStatus() {
  const nextStatus = clothingForm.status === 'active' ? 'inactive' : 'active';
  const confirmed = await confirmAction(
    nextStatus === 'active'
      ? '确认启用该衣服？'
      : '确认停用该衣服？停用后该衣服下所有 SN 扫码会返回停用。'
  );

  if (!confirmed) {
    return;
  }

  try {
    if (nextStatus === 'inactive') {
      await deleteClothing(clothingId.value);
    } else {
      await updateClothing(clothingId.value, { status: 'active' });
    }
    clothingMessage.value = nextStatus === 'active' ? '衣服已启用。' : '衣服已停用。';
    await loadAll();
  } catch (error) {
    handleAuthError(error);
    clothingMessage.value = error.message || '状态更新失败。';
  }
}

async function hardDeleteClothing() {
  const confirmed = await confirmAction(
    '真删除会级联删除该衣服下所有批次和 SN，已印刷二维码将查不到。确认继续？',
    '危险操作'
  );

  if (!confirmed) {
    return;
  }

  try {
    await deleteClothing(clothingId.value, true);
    router.replace('/dashboard');
  } catch (error) {
    handleAuthError(error);
    clothingMessage.value = error.message || '真删除衣服失败。';
  }
}

function resetBatchForm() {
  Object.assign(batchForm, createEmptyBatchForm());
  batchMessage.value = '';
}

async function createBatch() {
  const count = Number(batchForm.count);
  batchMessage.value = '';

  if (!Number.isInteger(count) || count <= 0) {
    batchMessage.value = '生成数量必须大于 0。';
    return;
  }

  creatingBatch.value = true;

  try {
    const response = await createClothingBatch(clothingId.value, {
      ...batchForm,
      productionDate: normalizeDateValue(batchForm.productionDate) || todayDateString(),
      count
    });
    const createdCount = response.batch?.garments?.length || 0;
    const createdBatchId = response.batch?.id ? String(response.batch.id) : '';
    batchMessage.value = `已创建批次并生成 ${createdCount} 个 SN。`;
    resetBatchForm();
    await loadAll();
    if (createdBatchId && !expandedBatchIds.value.includes(createdBatchId)) {
      expandedBatchIds.value = [createdBatchId, ...expandedBatchIds.value];
    }
  } catch (error) {
    handleAuthError(error);
    batchMessage.value = error.message || '生成批次失败。';
  } finally {
    creatingBatch.value = false;
  }
}

function startEditBatch(batch) {
  openBatchToolsId.value = String(batch.id);
  editingBatchId.value = batch.id;
  batchMessage.value = '';
  Object.assign(batchEditForm, createEmptyBatchForm(), {
    styleNo: batch.styleNo || '',
    color: batch.color || '',
    size: batch.size || '',
    batchNo: batch.batchNo || '',
    productionDate: normalizeDateValue(batch.productionDate) || todayDateString(),
    remark: batch.remark || '',
    count: '1'
  });
}

function cancelEditBatch() {
  editingBatchId.value = '';
  Object.assign(batchEditForm, createEmptyBatchForm());
}

async function saveBatch() {
  if (!editingBatchId.value) {
    return;
  }

  savingBatch.value = true;
  batchMessage.value = '';

  try {
    await updateBatch(editingBatchId.value, {
      styleNo: batchEditForm.styleNo,
      color: batchEditForm.color,
      size: batchEditForm.size,
      batchNo: batchEditForm.batchNo,
      productionDate: normalizeDateValue(batchEditForm.productionDate) || todayDateString(),
      remark: batchEditForm.remark
    });
    batchMessage.value = '已保存批次。';
    cancelEditBatch();
    await loadBatches();
  } catch (error) {
    handleAuthError(error);
    batchMessage.value = error.message || '保存批次失败。';
  } finally {
    savingBatch.value = false;
  }
}

async function toggleBatchStatus(batch) {
  const nextStatus = batch.status === 'active' ? 'inactive' : 'active';
  const confirmed = await confirmAction(
    nextStatus === 'active'
      ? '确认启用该批次？'
      : '确认停用该批次？停用后该批次下 SN 扫码会返回停用。'
  );

  if (!confirmed) {
    return;
  }

  try {
    if (nextStatus === 'inactive') {
      await deleteBatch(batch.id);
    } else {
      await updateBatch(batch.id, { status: 'active' });
    }
    batchMessage.value = nextStatus === 'active' ? '批次已启用。' : '批次已停用。';
    await loadBatches();
  } catch (error) {
    handleAuthError(error);
    batchMessage.value = error.message || '批次状态更新失败。';
  }
}

async function hardDeleteBatch(batch) {
  const confirmed = await confirmAction(
    '真删除会删除该批次和批次下所有 SN，已印刷二维码将查不到。确认继续？',
    '危险操作'
  );

  if (!confirmed) {
    return;
  }

  try {
    await deleteBatch(batch.id, true);
    batchMessage.value = '批次已真删除。';
    openBatchToolsId.value = '';
    await loadAll();
  } catch (error) {
    handleAuthError(error);
    batchMessage.value = error.message || '真删除批次失败。';
  }
}

async function toggleGarmentStatus(record) {
  const nextStatus = record.snStatus === 'active' ? 'inactive' : 'active';
  const confirmed = await confirmAction(
    nextStatus === 'active' ? '确认启用该 SN？' : '确认停用该 SN？'
  );

  if (!confirmed) {
    return;
  }

  try {
    if (nextStatus === 'inactive') {
      await deleteGarment(record.sn);
    } else {
      await updateGarment(record.sn, { status: 'active' });
    }
    snMessage.value = nextStatus === 'active' ? 'SN 已启用。' : 'SN 已停用。';
    await loadBatches();
  } catch (error) {
    handleAuthError(error);
    snMessage.value = error.message || 'SN 状态更新失败。';
  }
}

async function unbindBinding(record) {
  const confirmed = await confirmAction(
    `确认解绑 ${record.sn} 的学生绑定信息？解绑后公开页会显示为未绑定。`,
    '解绑确认'
  );

  if (!confirmed) {
    return;
  }

  try {
    await unbindGarmentBindingApi(record.sn);
    snMessage.value = `${record.sn} 已解绑学生信息。`;
    await loadBatches();
  } catch (error) {
    handleAuthError(error);
    snMessage.value = error.message || '解绑失败。';
  }
}

async function hardDeleteGarment(record) {
  const confirmed = await confirmAction(
    '真删除该 SN 后，已印刷二维码将查不到。确认继续？',
    '危险操作'
  );

  if (!confirmed) {
    return;
  }

  try {
    await deleteGarment(record.sn, true);
    snMessage.value = 'SN 已真删除。';
    await loadAll();
  } catch (error) {
    handleAuthError(error);
    snMessage.value = error.message || '真删除 SN 失败。';
  }
}

function chooseExportFormat(batch) {
  if (!batch.garments?.length) {
    batchMessage.value = '该批次暂无 SN 可导出。';
    return;
  }
  selectedBatchForExport.value = batch;
  exportModalOpen.value = true;
}

function handleExportComplete(result) {
  const batch = selectedBatchForExport.value;
  if (batch) {
    batchMessage.value = `成功导出 ${batchLabel(batch)}！`;
    setTimeout(() => {
      batchMessage.value = '';
    }, 3000);
  }
}

function handleExportError(error) {
  batchMessage.value = `导出失败：${error.message || '未知错误'}`;
}

function closeExportModal() {
  exportModalOpen.value = false;
  selectedBatchForExport.value = null;
}

function detailPageUrl(sn) {
  return publicGarmentDetailUrl(sn);
}

function openDetail(sn) {
  window.open(detailPageUrl(sn), '_blank', 'noopener,noreferrer');
}

async function copySn(sn) {
  const text = String(sn || '').trim();

  if (!text) {
    snMessage.value = 'SN 为空，无法复制。';
    return;
  }

  try {
    await copyTextToClipboard(text);
    snMessage.value = `已复制 SN：${text}`;
  } catch {
    snMessage.value = '复制失败，请手动复制 SN。';
  }
}

async function copyTextToClipboard(text) {
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    textarea.remove();

    if (copied) {
      return;
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Continue to platform fallback below.
    }
  }

  throw new Error('Clipboard API unavailable');
}

function bindingData(record) {
  return record?.binding || record?.owner || {};
}

function bindingField(record, key) {
  return bindingData(record)?.[key] || '未录入';
}

function bindingPhone(record) {
  const binding = bindingData(record);
  if (binding.contactPhone) {
    return binding.contactPhone;
  }

  return binding.phoneTail ? `尾号 ${binding.phoneTail}` : '未录入';
}

function bindingTime(record) {
  const value = bindingData(record).boundAt;
  return value ? value.replace('T', ' ').slice(0, 19) : '未记录';
}

function setQrMode(mode) {
  qrMode.value = saveQrcodeMode(mode);
}

function downloadQr(sn) {
  const url = qrcodeUrl(sn, qrMode.value);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${sn}-${qrMode.value}-qrcode.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function confirmAction(content, title = '确认操作') {
  return Promise.resolve(window.confirm(`${title}\n\n${content}`));
}

function handleAuthError(error) {
  if (error.statusCode === 401) {
    clearToken();
    router.replace('/login');
  }
}

function goBack() {
  router.push('/dashboard');
}

function logout() {
  clearToken();
  router.replace('/login');
}
</script>

<style scoped>
.detail-admin-page {
  padding: 14px;
}

.admin-topbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 1380px;
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
.danger-actions,
.editor-actions,
.batch-actions,
.batch-edit-actions,
.sn-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.state-block,
.detail-layout {
  max-width: 1380px;
  margin: 0 auto;
}

.state-block {
  padding: 24px 0;
  color: #746e65;
  text-align: center;
}

.detail-layout,
.workspace-stack,
.batch-list {
  display: grid;
  gap: 12px;
}

.summary-card,
.editor-panel,
.batches-panel,
.danger-zone {
  border: 1px solid #ddd6cc;
  border-radius: 4px;
  background: #fffdf9;
}

.summary-card,
.editor-panel,
.batches-panel,
.danger-zone {
  padding: 12px;
}

.summary-head,
.panel-heading,
.records-toolbar,
.batch-head,
.tool-head,
.sn-main,
.sn-toolbar {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.summary-kicker,
.summary-title,
.summary-copy,
.section-copy,
.metric-value,
.metric-label,
.info-label,
.info-value,
.danger-title,
.danger-copy,
.toolbar-meta,
.empty-title,
.empty-copy,
.batch-title,
.batch-subtitle,
.tool-title,
.sn-toolbar-title,
.sn-toolbar-meta {
  display: block;
}

.summary-kicker {
  color: #746e65;
  font-size: 11px;
  font-weight: 700;
}

.summary-title {
  margin-top: 4px;
  color: #121212;
  font-size: 19px;
  font-weight: 740;
  line-height: 1.25;
}

.summary-copy,
.section-copy,
.danger-copy,
.toolbar-meta,
.batch-subtitle,
.sn-toolbar-meta {
  margin-top: 4px;
  color: #6b665f;
  font-size: 12px;
  line-height: 1.5;
}

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 11px;
}

.metric-item {
  padding: 8px;
  border: 1px solid #e5ded4;
  border-radius: 4px;
  background: #fbf8f2;
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

.info-grid {
  display: grid;
  gap: 7px;
}

.info-item {
  display: grid;
  gap: 4px;
  padding-bottom: 7px;
  border-bottom: 1px solid #ebe4da;
}

.info-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.info-label {
  color: #746e65;
  font-size: 11px;
}

.info-value {
  color: #151515;
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
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

.date-picker-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
}

.date-picker-value {
  display: flex;
  align-items: center;
  color: #181818;
}

.date-picker-button {
  min-height: 42px;
  padding: 0 11px;
  font-size: 12px;
  line-height: 42px;
  white-space: nowrap;
}

.compact-textarea {
  min-height: 60px;
}

.helper-strip,
.collapsed-summary {
  padding: 8px 9px;
  border: 1px dashed #d8d1c7;
  border-radius: 4px;
  background: #fffdf9;
  color: #6b665f;
  font-size: 12px;
  line-height: 1.5;
}

.qr-mode-panel {
  display: grid;
  gap: 10px;
  margin: 10px 0 12px;
  padding: 10px;
  border: 1px solid #e1d9ce;
  border-radius: 4px;
  background: #fbf8f2;
}

.qr-mode-options {
  display: grid;
  gap: 7px;
}

.qr-mode-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 3px 8px;
  align-items: start;
  padding: 9px;
  border: 1px solid #ddd6cc;
  border-radius: 4px;
  background: #fffdf9;
}

.qr-mode-option.active {
  border-color: #b9cbb2;
  background: #f7fbf4;
}

.qr-mode-radio {
  grid-row: span 2;
  margin-top: 2px;
}

.qr-mode-label,
.qr-mode-description {
  display: block;
}

.qr-mode-label {
  color: #171717;
  font-size: 13px;
  font-weight: 700;
}

.qr-mode-description {
  color: #6b665f;
  font-size: 12px;
  line-height: 1.45;
}

.editor-actions {
  margin-top: 12px;
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
  margin-top: 9px;
}

.danger-zone,
.tool-danger {
  display: grid;
  gap: 9px;
  border-color: #e4c8be;
  background: #fff9f6;
}

.danger-title {
  color: #8d2e22;
  font-size: 14px;
  font-weight: 700;
}

.batches-panel {
  align-self: start;
}

.empty-state {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 21px 0;
  color: #746e65;
  text-align: center;
}

.empty-title {
  color: #151515;
  font-size: 15px;
  font-weight: 700;
}

.empty-copy {
  max-width: 260px;
  color: #746e65;
  font-size: 12px;
  line-height: 1.6;
}

.compact-empty {
  padding: 10px 0;
}

.batch-card {
  display: grid;
  gap: 9px;
  padding: 11px;
  border: 1px solid #e3dcd2;
  border-radius: 4px;
  background: #fbf8f2;
}

.batch-title {
  color: #141414;
  font-size: 16px;
  font-weight: 650;
}

.batch-meta,
.sn-meta {
  display: grid;
  gap: 4px;
  color: #6b665f;
  font-size: 12px;
}

.batch-tools,
.sn-section {
  display: grid;
  gap: 9px;
  padding-top: 9px;
  border-top: 1px solid #e2dbd1;
}

.tool-head {
  align-items: start;
}

.tool-title,
.sn-toolbar-title {
  color: #151515;
  font-size: 14px;
  font-weight: 700;
}

.batch-editor {
  display: grid;
  gap: 9px;
}

.sn-list {
  display: grid;
  gap: 7px;
}

.sn-row {
  display: grid;
  gap: 7px;
  padding: 8px;
  border: 1px solid #e5ded4;
  border-radius: 4px;
  background: #fffdf9;
}

.sn-code-group {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: 5px;
}

.sn-code {
  min-width: 0;
  color: #5f5a52;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.sn-copy-button {
  flex: 0 0 auto;
  min-height: 26px;
  margin: 0;
  padding: 0 8px;
  border: 1px solid #d7d1c8;
  border-radius: 3px;
  background: #fff;
  color: #171717;
  font-size: 11px;
  line-height: 26px;
}

.sn-copy-button::after {
  border: 0;
}

.binding-status-text.bound {
  color: #4f874d;
  font-weight: 650;
}

@media (min-width: 980px) {
  .detail-admin-page {
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
  .summary-copy,
  .section-copy,
  .danger-copy,
  .toolbar-meta,
  .batch-subtitle,
  .batch-meta,
  .sn-meta,
  .message-text,
  .helper-strip,
  .collapsed-summary,
  .empty-copy {
    font-size: 13px;
  }

  .topbar-actions,
  .danger-actions,
  .editor-actions,
  .batch-edit-actions {
    grid-template-columns: repeat(2, auto);
    justify-content: end;
    gap: 10px;
  }

  .detail-layout {
    grid-template-columns: minmax(390px, 0.7fr) minmax(0, 1.3fr);
    align-items: start;
    gap: 24px;
  }

  .workspace-stack {
    position: sticky;
    top: 24px;
    gap: 18px;
  }

  .summary-card,
  .editor-panel,
  .batches-panel,
  .danger-zone,
  .batch-card,
  .sn-row {
    border-radius: 8px;
  }

  .summary-card,
  .editor-panel,
  .batches-panel,
  .danger-zone {
    padding: 22px;
  }

  .summary-head,
  .panel-heading,
  .records-toolbar,
  .batch-head,
  .tool-head,
  .sn-main,
  .sn-toolbar {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .summary-title {
    font-size: 24px;
  }

  .summary-metrics {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 18px;
  }

  .metric-item {
    padding: 12px;
  }

  .metric-value {
    font-size: 18px;
  }

  .metric-label,
  .info-label {
    font-size: 12px;
  }

  .info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
  }

  .info-item {
    padding-bottom: 12px;
  }

  .info-value {
    font-size: 14px;
  }

  .standard-chip {
    padding: 2px 8px;
    font-size: 12px;
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

  .date-picker-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .date-picker-button {
    min-height: 44px;
    padding: 0 14px;
    font-size: 13px;
    line-height: 44px;
  }

  .danger-zone {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .danger-title,
  .tool-title,
  .sn-toolbar-title {
    font-size: 16px;
  }

  .batch-card {
    padding: 18px;
  }

  .batch-title {
    font-size: 18px;
  }

  .batch-meta {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .batch-actions {
    grid-template-columns: repeat(3, auto);
    justify-content: start;
  }

  .tool-danger {
    padding: 14px;
    border: 1px solid #e4c8be;
    border-radius: 8px;
  }

  .sn-row {
    grid-template-columns: minmax(190px, 0.72fr) minmax(210px, 1fr) minmax(260px, auto);
    align-items: start;
    padding: 14px;
  }

  .sn-actions {
    grid-template-columns: repeat(2, auto);
    justify-content: end;
    align-content: start;
    gap: 8px;
  }

  .sn-code-group {
    gap: 8px;
  }

  .sn-code {
    font-size: 13px;
  }

  .sn-copy-button {
    min-height: 28px;
    padding: 0 9px;
    font-size: 12px;
    line-height: 28px;
  }
}
</style>
