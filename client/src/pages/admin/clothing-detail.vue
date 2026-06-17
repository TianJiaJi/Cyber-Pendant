<template>
  <view class="page-shell detail-admin-page">
    <view class="admin-topbar">
      <view>
        <text class="eyebrow">CLOTHING DETAIL</text>
        <text class="admin-title">{{ clothing?.productName || '衣服详情' }}</text>
      </view>
      <view class="topbar-actions">
        <button class="secondary-button" @click="goBack">返回主档</button>
        <button class="ghost-button" @click="logout">退出</button>
      </view>
    </view>

    <view v-if="loading" class="state-block">正在加载衣服详情...</view>
    <view v-else-if="message && !clothing" class="state-block">{{ message }}</view>

    <view v-else class="detail-layout">
      <view class="workspace-stack">
        <view class="editor-panel">
          <view class="panel-heading">
            <view>
              <text class="section-title">衣服信息</text>
              <text :class="['status-pill inline-status', clothingForm.status === 'inactive' ? 'inactive' : '']">
                {{ clothingForm.status === 'active' ? '有效' : '停用' }}
              </text>
            </view>
            <view class="panel-actions">
              <button
                :class="clothingForm.status === 'active' ? 'danger-button small-button' : 'secondary-button small-button'"
                @click="toggleClothingStatus"
              >
                {{ clothingForm.status === 'active' ? '停用衣服' : '启用衣服' }}
              </button>
              <button class="danger-button small-button" @click="hardDeleteClothing">
                真删除
              </button>
            </view>
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
              <textarea v-model="clothingForm.fabric" class="form-textarea" />
            </view>

            <view class="form-field wide-field">
              <text class="field-label">洗护说明</text>
              <textarea v-model="clothingForm.careInstructions" class="form-textarea" />
            </view>

            <view class="form-field wide-field">
              <text class="field-label">备注</text>
              <textarea v-model="clothingForm.remark" class="form-textarea" />
            </view>
          </view>

          <view class="editor-actions">
            <button class="primary-button" :disabled="savingClothing" @click="saveClothing">
              {{ savingClothing ? '保存中' : '保存衣服信息' }}
            </button>
          </view>
        </view>

        <view class="editor-panel">
          <view class="panel-heading">
            <text class="section-title">生成新批次 SN</text>
            <button class="ghost-button small-button" @click="resetBatchForm">清空</button>
          </view>

          <view class="form-grid">
            <view v-for="field in batchTextFields" :key="field.key" class="form-field">
              <text class="field-label">{{ field.label }}</text>
              <view v-if="field.key === 'productionDate'" class="date-picker-row">
                <view class="form-picker date-picker-value">
                  {{ batchForm.productionDate || todayDateString() }}
                </view>
                <button class="secondary-button date-picker-button" @click="openDatePicker('create')">
                  选择日期
                </button>
              </view>
              <input
                v-else
                v-model="batchForm[field.key]"
                class="form-input"
                :placeholder="field.placeholder"
              />
            </view>

            <view class="form-field">
              <text class="field-label">数量</text>
              <input v-model="batchForm.count" class="form-input" type="number" />
            </view>

            <view class="form-field wide-field">
              <text class="field-label">批次备注</text>
              <textarea
                v-model="batchForm.remark"
                class="form-textarea"
                placeholder="本批次特殊说明"
              />
            </view>
          </view>

          <view class="editor-actions">
            <button class="primary-button" :disabled="creatingBatch" @click="createBatch">
              {{ creatingBatch ? '生成中' : '创建批次并生成 SN' }}
            </button>
          </view>
        </view>
      </view>

      <view class="batches-panel">
        <view class="records-toolbar">
          <view>
            <text class="section-title">批次与 SN</text>
            <text class="toolbar-meta">{{ batches.length }} 个批次</text>
          </view>
          <button class="secondary-button" @click="loadAll">刷新</button>
        </view>

        <text v-if="message" class="message-text panel-message">{{ message }}</text>

        <view v-if="batchesLoading" class="empty-state">正在加载批次...</view>
        <view v-else-if="batches.length === 0" class="empty-state">暂无批次，先生成一批 SN。</view>

        <view v-else class="batch-list">
          <view v-for="batch in batches" :key="batch.id" class="batch-card">
            <view class="batch-head" @click="toggleBatchExpanded(batch.id)">
              <view>
                <text class="batch-title">批次标签：{{ batchLabel(batch) }}</text>
                <text class="batch-subtitle">
                  {{ batchSummary(batch) }}
                </text>
              </view>
              <text :class="['status-pill', batch.status === 'inactive' ? 'inactive' : '']">
                {{ batch.status === 'active' ? '有效批次' : '停用批次' }}
              </text>
            </view>

            <view class="batch-meta">
              <text>颜色：{{ batch.color || '未录入' }}</text>
              <text>尺码：{{ batch.size || '未录入' }}</text>
              <text>批次标签：{{ batch.batchNo || '未录入' }}</text>
              <text>生产日期：{{ batch.productionDate || '未录入' }}</text>
              <text>SN 数量：{{ batchSnCount(batch) }}</text>
              <text>备注：{{ batch.remark || '未录入' }}</text>
            </view>

            <view class="batch-actions">
              <button class="secondary-button small-button" @click="toggleBatchExpanded(batch.id)">
                {{ isBatchExpanded(batch.id) ? '收起 SN' : `展开 SN (${batchSnCount(batch)})` }}
              </button>
              <button class="secondary-button small-button" @click="startEditBatch(batch)">
                编辑批次
              </button>
              <button class="ghost-button small-button" @click="chooseExportFormat(batch)">
                导出本批
              </button>
              <button
                :class="batch.status === 'active' ? 'danger-button small-button' : 'secondary-button small-button'"
                @click="toggleBatchStatus(batch)"
              >
                {{ batch.status === 'active' ? '停用批次' : '启用批次' }}
              </button>
              <button class="danger-button small-button" @click="hardDeleteBatch(batch)">
                真删除批次
              </button>
            </view>

            <view v-if="editingBatchId === batch.id" class="batch-editor">
              <view class="form-grid">
                <view v-for="field in batchTextFields" :key="field.key" class="form-field">
                  <text class="field-label">{{ field.label }}</text>
                  <view v-if="field.key === 'productionDate'" class="date-picker-row">
                    <view class="form-picker date-picker-value">
                      {{ batchEditForm.productionDate || todayDateString() }}
                    </view>
                    <button class="secondary-button date-picker-button" @click="openDatePicker('edit')">
                      选择日期
                    </button>
                  </view>
                  <input v-else v-model="batchEditForm[field.key]" class="form-input" />
                </view>

                <view class="form-field wide-field">
                  <text class="field-label">批次备注</text>
                  <textarea v-model="batchEditForm.remark" class="form-textarea" />
                </view>
              </view>

              <view class="batch-edit-actions">
                <button class="primary-button small-button" :disabled="savingBatch" @click="saveBatch">
                  {{ savingBatch ? '保存中' : '保存批次' }}
                </button>
                <button class="ghost-button small-button" @click="cancelEditBatch">取消</button>
              </view>
            </view>

            <view v-if="!isBatchExpanded(batch.id)" class="collapsed-summary">
              SN 明细已折叠，共 {{ batchSnCount(batch) }} 个。
            </view>

            <view v-else class="sn-list">
              <view v-for="record in batch.garments" :key="record.sn" class="sn-row">
                <view class="sn-main">
                  <view class="sn-code-group">
                    <text class="sn-code">{{ record.sn }}</text>
                    <button class="sn-copy-button" @click.stop="copySn(record.sn)">复制</button>
                  </view>
                  <text :class="['status-pill', record.status === 'inactive' ? 'inactive' : '']">
                    {{ record.status === 'active' ? '有效' : '停用' }}
                  </text>
                </view>

                <view class="sn-meta">
                  <text>SN 状态：{{ record.snStatus === 'active' ? '有效' : '停用' }}</text>
                  <text>二维码：链接码</text>
                  <text :class="['binding-status-text', record.isBound ? 'bound' : '']">
                    绑定状态：{{ record.isBound ? '已绑定' : '未绑定' }}
                  </text>
                  <template v-if="record.isBound">
                    <text>学生：{{ bindingField(record, 'studentName') }}</text>
                    <text>学校：{{ bindingField(record, 'school') }}</text>
                    <text>班级：{{ bindingField(record, 'className') }}</text>
                    <text>联系人：{{ bindingField(record, 'contactName') }}</text>
                    <text>联系电话：{{ bindingPhone(record) }}</text>
                    <text>绑定时间：{{ bindingTime(record) }}</text>
                  </template>
                </view>

                <view class="sn-actions">
                  <button class="secondary-button small-button" @click="openDetail(record.sn)">
                    查看
                  </button>
                  <button class="ghost-button small-button" @click="downloadQr(record.sn, 'url')">
                    下载二维码
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
                </view>
              </view>
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
import * as XLSX from 'xlsx';
import {
  API_BASE_URL,
  clearToken,
  createClothingBatch,
  deleteBatch,
  deleteClothing,
  deleteGarment,
  getClothing,
  getToken,
  listClothingBatches,
  qrcodeUrl,
  unbindGarmentBinding as unbindGarmentBindingApi,
  updateBatch,
  updateClothing,
  updateGarment
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
  { key: 'standard', label: '执行标准', placeholder: 'GB/T 2664-2017' },
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

const exportColumns = [
  { key: 'clothingName', label: '衣服名称' },
  { key: 'styleNo', label: '款号' },
  { key: 'color', label: '颜色' },
  { key: 'size', label: '尺码' },
  { key: 'sn', label: 'SN' },
  { key: 'batchNo', label: '批次标签' },
  { key: 'productionDate', label: '生产日期' },
  { key: 'detailUrl', label: '详情页链接' },
  { key: 'qrUrl', label: '二维码链接' }
];

const clothingId = ref('');
const clothing = ref(null);
const batches = ref([]);
const loading = ref(true);
const batchesLoading = ref(false);
const savingClothing = ref(false);
const creatingBatch = ref(false);
const savingBatch = ref(false);
const editingBatchId = ref('');
const expandedBatchIds = ref([]);
const message = ref('');
const clothingForm = reactive({ ...emptyClothingForm });
const batchForm = reactive(createEmptyBatchForm());
const batchEditForm = reactive(createEmptyBatchForm());

onLoad((query) => {
  if (!getToken()) {
    uni.redirectTo({
      url: '/pages/admin/login'
    });
    return;
  }

  clothingId.value = String(query?.id || '').trim();
  if (!clothingId.value) {
    loading.value = false;
    message.value = '缺少衣服 ID。';
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
    message.value = error.message || '加载衣服失败。';
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
    message.value = error.message || '加载批次失败。';
  } finally {
    batchesLoading.value = false;
  }
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

function openDatePicker(target) {
  const form = target === 'edit' ? batchEditForm : batchForm;
  const fallbackDate = normalizeDateValue(form.productionDate) || todayDateString();

  if (typeof document === 'undefined') {
    form.productionDate = fallbackDate;
    message.value = '当前平台暂不支持原生日期选择。';
    return;
  }

  const input = document.createElement('input');
  input.type = 'date';
  input.value = fallbackDate;
  input.style.position = 'fixed';
  input.style.left = '0';
  input.style.bottom = '0';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';

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
  message.value = '';

  try {
    const response = await updateClothing(clothingId.value, { ...clothingForm });
    clothing.value = response.clothing;
    Object.assign(clothingForm, emptyClothingForm, response.clothing || {});
    message.value = '已保存衣服信息。';
    await loadBatches();
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '保存衣服失败。';
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
    message.value = nextStatus === 'active' ? '衣服已启用。' : '衣服已停用。';
    await loadAll();
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '状态更新失败。';
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
    uni.redirectTo({
      url: '/pages/admin/dashboard'
    });
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '真删除衣服失败。';
  }
}

function resetBatchForm() {
  Object.assign(batchForm, createEmptyBatchForm());
}

async function createBatch() {
  const count = Number(batchForm.count);
  message.value = '';

  if (!Number.isInteger(count) || count <= 0) {
    message.value = '生成数量必须大于 0。';
    return;
  }

  creatingBatch.value = true;

  try {
    const response = await createClothingBatch(clothingId.value, {
      ...batchForm,
      productionDate: normalizeDateValue(batchForm.productionDate) || todayDateString(),
      count
    });
    message.value = `已创建批次并生成 ${response.batch?.garments?.length || 0} 个 SN。`;
    resetBatchForm();
    await loadAll();
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '生成批次失败。';
  } finally {
    creatingBatch.value = false;
  }
}

function startEditBatch(batch) {
  editingBatchId.value = batch.id;
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
  message.value = '';

  try {
    await updateBatch(editingBatchId.value, {
      styleNo: batchEditForm.styleNo,
      color: batchEditForm.color,
      size: batchEditForm.size,
      batchNo: batchEditForm.batchNo,
      productionDate: normalizeDateValue(batchEditForm.productionDate) || todayDateString(),
      remark: batchEditForm.remark
    });
    message.value = '已保存批次。';
    cancelEditBatch();
    await loadBatches();
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '保存批次失败。';
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
    message.value = nextStatus === 'active' ? '批次已启用。' : '批次已停用。';
    await loadBatches();
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '批次状态更新失败。';
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
    message.value = '批次已真删除。';
    await loadAll();
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '真删除批次失败。';
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
    message.value = nextStatus === 'active' ? 'SN 已启用。' : 'SN 已停用。';
    await loadBatches();
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || 'SN 状态更新失败。';
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
    message.value = `${record.sn} 已解绑学生信息。`;
    await loadBatches();
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '解绑失败。';
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
    message.value = 'SN 已真删除。';
    await loadAll();
  } catch (error) {
    handleAuthError(error);
    message.value = error.message || '真删除 SN 失败。';
  }
}

function chooseExportFormat(batch) {
  if (!batch.garments?.length) {
    message.value = '该批次暂无 SN 可导出。';
    return;
  }

  uni.showActionSheet({
    itemList: ['Excel 表格', 'CSV 清单'],
    success(result) {
      if (result.tapIndex === 0) {
        exportExcel(batch);
      } else {
        exportCsv(batch);
      }
    }
  });
}

function getExportRows(batch) {
  return (batch.garments || []).map((record) => ({
    clothingName: clothing.value?.productName || record.productName || '',
    styleNo: batch.styleNo || record.styleNo || '',
    color: batch.color || record.color || '',
    size: batch.size || record.size || '',
    sn: record.sn,
    batchNo: batch.batchNo || record.batchNo || '',
    productionDate: batch.productionDate || record.productionDate || '',
    detailUrl: detailPageUrl(record.sn),
    qrUrl: qrcodeUrl(record.sn, 'url')
  }));
}

function exportCsv(batch) {
  const rows = getExportRows(batch);
  const header = exportColumns.map((column) => column.label);
  const body = rows.map((row) => exportColumns.map((column) => csvCell(row[column.key])));
  const csv = `\uFEFF${[header, ...body].map((line) => line.join(',')).join('\r\n')}`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${exportFileName(batch)}.csv`);
}

function exportExcel(batch) {
  const rows = getExportRows(batch);
  const sheetData = [
    exportColumns.map((column) => column.label),
    ...rows.map((row) => exportColumns.map((column) => row[column.key] || ''))
  ];
  const sheet = XLSX.utils.aoa_to_sheet(sheetData);
  sheet['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
    { wch: 22 },
    { wch: 20 },
    { wch: 14 },
    { wch: 52 },
    { wch: 52 }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '批次吊牌码');
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    `${exportFileName(batch)}.xlsx`
  );
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function detailPageUrl(sn) {
  const encoded = encodeURIComponent(sn);

  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}${window.location.pathname}#/pages/garment/detail?sn=${encoded}`;
  }

  return `${API_BASE_URL}/#/pages/garment/detail?sn=${encoded}`;
}

function exportFileName(batch) {
  const name = batch.styleNo || clothing.value?.productName || '未命名衣服';
  return `吊牌码-${sanitizeFilePart(name)}-${formatTimestamp(new Date())}`;
}

function sanitizeFilePart(value) {
  return String(value || '未命名衣服')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-');
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function downloadBlob(blob, filename) {
  if (typeof document === 'undefined') {
    message.value = '当前平台暂不支持文件下载。';
    return;
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function openDetail(sn) {
  uni.navigateTo({
    url: `/pages/garment/detail?sn=${encodeURIComponent(sn)}`
  });
}

async function copySn(sn) {
  const text = String(sn || '').trim();

  if (!text) {
    message.value = 'SN 为空，无法复制。';
    return;
  }

  try {
    await copyTextToClipboard(text);
    message.value = `已复制 SN：${text}`;
    uni.showToast({
      title: '已复制 SN',
      icon: 'success'
    });
  } catch {
    message.value = '复制失败，请手动复制 SN。';
    uni.showToast({
      title: '复制失败',
      icon: 'none'
    });
  }
}

async function copyTextToClipboard(text) {
  if (typeof uni !== 'undefined' && typeof uni.setClipboardData === 'function') {
    try {
      await new Promise((resolve, reject) => {
        uni.setClipboardData({
          data: text,
          success: resolve,
          fail: reject
        });
      });
      return;
    } catch {
      // Continue to browser fallbacks below.
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    textarea.remove();

    if (copied) {
      return;
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

function confirmAction(content, title = '确认操作') {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content,
      confirmText: '确认',
      cancelText: '取消',
      success(result) {
        resolve(Boolean(result.confirm));
      },
      fail() {
        resolve(false);
      }
    });
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

function goBack() {
  uni.redirectTo({
    url: '/pages/admin/dashboard'
  });
}

function logout() {
  clearToken();
  uni.redirectTo({
    url: '/pages/admin/login'
  });
}
</script>

<style scoped>
.detail-admin-page {
  padding: 28rpx;
}

.admin-topbar {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  max-width: 1380px;
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

.state-block,
.detail-layout {
  max-width: 1380px;
  margin: 0 auto;
}

.state-block {
  padding: 48rpx 0;
  color: #746e65;
  text-align: center;
}

.detail-layout,
.workspace-stack,
.batch-list {
  display: grid;
  gap: 24rpx;
}

.editor-panel,
.batches-panel {
  border: 1px solid #ddd6cc;
  border-radius: 8rpx;
  background: #fffdf9;
}

.editor-panel,
.batches-panel {
  padding: 24rpx;
}

.panel-heading,
.records-toolbar {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-bottom: 22rpx;
}

.panel-actions,
.batch-actions,
.sn-actions,
.batch-edit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12rpx;
}

.inline-status {
  margin-top: 12rpx;
}

.form-grid {
  display: grid;
  gap: 20rpx;
}

.wide-field {
  grid-column: 1 / -1;
}

.date-picker-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12rpx;
  align-items: center;
}

.date-picker-value {
  display: flex;
  align-items: center;
  color: #181818;
}

.date-picker-button {
  min-height: 84rpx;
  padding: 0 22rpx;
  font-size: 24rpx;
  line-height: 84rpx;
  white-space: nowrap;
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

.panel-message {
  display: block;
  margin-bottom: 18rpx;
}

.toolbar-meta {
  display: block;
  margin-top: 8rpx;
  color: #6b665f;
  font-size: 24rpx;
}

.empty-state {
  padding: 42rpx 0;
  color: #746e65;
  text-align: center;
}

.batch-card {
  display: grid;
  gap: 18rpx;
  padding: 22rpx;
  border: 1px solid #e3dcd2;
  border-radius: 8rpx;
  background: #fbf8f2;
}

.batch-head,
.sn-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.batch-head {
  cursor: pointer;
}

.batch-title {
  display: block;
  color: #141414;
  font-size: 32rpx;
  font-weight: 650;
}

.batch-subtitle {
  display: block;
  margin-top: 8rpx;
  color: #6b665f;
  font-size: 24rpx;
}

.batch-meta,
.sn-meta {
  display: grid;
  gap: 8rpx;
  color: #6b665f;
  font-size: 24rpx;
}

.binding-status-text.bound {
  color: #4f874d;
  font-weight: 650;
}

.batch-editor {
  display: grid;
  gap: 18rpx;
  padding-top: 18rpx;
  border-top: 1px solid #e2dbd1;
}

.collapsed-summary {
  padding: 16rpx 18rpx;
  border: 1px dashed #d8d1c7;
  border-radius: 8rpx;
  background: #fffdf9;
  color: #6b665f;
  font-size: 24rpx;
}

.sn-list {
  display: grid;
  gap: 14rpx;
}

.sn-row {
  display: grid;
  gap: 14rpx;
  padding-top: 16rpx;
  border-top: 1px solid #e2dbd1;
}

.sn-code-group {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: 10rpx;
}

.sn-code {
  min-width: 0;
  color: #5f5a52;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 24rpx;
  overflow-wrap: anywhere;
}

.sn-copy-button {
  flex: 0 0 auto;
  min-height: 52rpx;
  margin: 0;
  padding: 0 16rpx;
  border: 1px solid #d7d1c8;
  border-radius: 6rpx;
  background: #fff;
  color: #171717;
  font-size: 22rpx;
  line-height: 52rpx;
}

.sn-copy-button::after {
  border: 0;
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

  .topbar-actions {
    grid-template-columns: auto auto;
    gap: 10px;
  }

  .detail-layout {
    grid-template-columns: minmax(400px, 0.82fr) minmax(0, 1.18fr);
    align-items: start;
    gap: 24px;
  }

  .workspace-stack {
    position: sticky;
    top: 24px;
    gap: 18px;
  }

  .editor-panel,
  .batches-panel {
    border-radius: 8px;
    padding: 22px;
  }

  .panel-heading,
  .records-toolbar {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-actions,
  .batch-edit-actions {
    grid-template-columns: repeat(2, auto);
    justify-content: end;
  }

  .batch-actions {
    grid-template-columns: repeat(5, auto);
    justify-content: end;
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
    gap: 10px;
  }

  .date-picker-button {
    min-height: 44px;
    padding: 0 14px;
    font-size: 13px;
    line-height: 44px;
  }

  .toolbar-meta,
  .batch-subtitle,
  .batch-meta,
  .sn-meta,
  .message-text,
  .collapsed-summary {
    font-size: 13px;
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

  .sn-row {
    grid-template-columns: minmax(170px, 0.7fr) minmax(250px, 1fr) minmax(250px, auto);
    align-items: start;
  }

  .sn-main {
    justify-content: start;
    align-items: center;
  }

  .sn-code-group {
    gap: 8px;
  }

  .sn-actions {
    grid-template-columns: repeat(2, auto);
    justify-content: end;
    align-content: start;
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
