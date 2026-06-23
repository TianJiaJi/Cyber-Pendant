<template>
  <teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div class="modal-container">
        <div class="modal-header">
          <div>
            <span class="modal-eyebrow">导出批次</span>
            <span class="modal-title">{{ batchLabel }}</span>
            <span class="modal-subtitle">{{ batchSummary }}</span>
          </div>
          <button class="modal-close-button" @click="close">
            <text>✕</text>
          </button>
        </div>

        <div class="modal-body">
          <!-- 导出格式选择 -->
          <div class="export-section">
            <span class="section-label">导出格式</span>
            <div class="format-options">
              <label
                v-for="format in formatOptions"
                :key="format.value"
                :class="['format-option', { active: selectedFormat === format.value }]"
              >
                <input v-model="selectedFormat" :value="format.value" type="radio" class="format-radio" />
                <span class="format-icon">{{ format.icon }}</span>
                <div class="format-info">
                  <span class="format-label">{{ format.label }}</span>
                  <span class="format-description">{{ format.description }}</span>
                </div>
              </label>
            </div>
          </div>

          <!-- Excel 选项 -->
          <div v-if="selectedFormat === 'excel'" class="export-section">
            <span class="section-label">Excel 选项</span>
            <div class="excel-options">
              <label class="checkbox-option">
                <input v-model="includeQrImages" type="checkbox" class="checkbox-input" />
                <span class="checkbox-text">
                  <span class="checkbox-label">包含二维码图片列</span>
                  <span class="checkbox-description">在表格中增加一列显示二维码图片</span>
                </span>
              </label>
            </div>
          </div>

          <!-- 缓存状态 -->
          <div v-if="showCacheStatus" class="export-section">
            <span class="section-label">二维码缓存状态</span>
            <div class="cache-status">
              <div class="cache-status-item">
                <span class="cache-status-label">已缓存</span>
                <span class="cache-status-value cached">{{ cacheStatus.cachedCount }} 个</span>
              </div>
              <div class="cache-status-item">
                <span class="cache-status-label">未缓存</span>
                <span class="cache-status-value uncached">{{ cacheStatus.uncachedCount }} 个</span>
              </div>
              <div v-if="cacheStatus.uncachedCount > 0" class="cache-warning">
                未缓存的二维码将在导出时实时生成，可能需要较长时间
              </div>
            </div>
          </div>

          <!-- 导出进度 -->
          <div v-if="isExporting" class="export-section">
            <span class="section-label">导出进度</span>
            <div class="export-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
              </div>
              <span class="progress-text">{{ progressText }}</span>
            </div>
          </div>

          <!-- 错误信息 -->
          <div v-if="errorMessage" class="export-error">
            <span class="error-icon">⚠</span>
            <span>{{ errorMessage }}</span>
          </div>
        </div>

        <div class="modal-footer">
          <button class="ghost-button" :disabled="isExporting" @click="close">取消</button>
          <button
            class="primary-button"
            :disabled="isExporting || !canExport"
            @click="handleExport"
          >
            {{ isExporting ? '导出中...' : exportButtonText }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { checkCacheStatus, getOrDownloadQrCode } from '../utils/qrCache.js';
import { qrcodeUrl, QRCODE_MODE_URL, QRCODE_MODE_MINIPROGRAM, QRCODE_MODE_MINIPROGRAM_SQUARE, QRCODE_MODE_SN } from '../utils/api.js';
import ExcelJS from 'exceljs';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  batch: {
    type: Object,
    default: null
  },
  qrMode: {
    type: String,
    default: QRCODE_MODE_URL
  },
  clothing: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['close', 'export-start', 'export-complete', 'export-error']);

const selectedFormat = ref('excel');
const includeQrImages = ref(true);
const isExporting = ref(false);
const progressCurrent = ref(0);
const progressTotal = ref(0);
const errorMessage = ref('');
const cacheStatus = ref({ cachedCount: 0, uncachedCount: 0 });

const formatOptions = [
  {
    value: 'excel',
    icon: '📊',
    label: 'Excel 表格',
    description: '导出为 .xlsx 格式电子表格'
  },
  {
    value: 'csv',
    icon: '📄',
    label: 'CSV 清单',
    description: '导出为 .csv 格式文本文件'
  },
  {
    value: 'zip',
    icon: '📦',
    label: '批量二维码',
    description: '下载所有二维码的 ZIP 压缩包'
  }
];

const batchLabel = computed(() => {
  if (!props.batch) return '';
  const batch = props.batch;
  return batch?.batchNo || batch?.styleNo || `批次 ${batch?.id || ''}`.trim() || '未命名批次';
});

const batchSummary = computed(() => {
  if (!props.batch) return '';
  const batch = props.batch;
  const garments = batch.garments || [];
  const count = garments.length;
  return `${count} 个 SN`;
});

const showCacheStatus = computed(() => {
  return (selectedFormat.value === 'excel' && includeQrImages.value) || selectedFormat.value === 'zip';
});

const progressPercent = computed(() => {
  if (progressTotal.value === 0) return 0;
  return Math.round((progressCurrent.value / progressTotal.value) * 100);
});

const progressText = computed(() => {
  if (progressTotal.value === 0) return '准备中...';
  return `正在处理 ${progressCurrent.value} / ${progressTotal.value}`;
});

const exportButtonText = computed(() => {
  if (selectedFormat.value === 'excel') {
    return includeQrImages.value ? '导出 Excel (含二维码)' : '导出 Excel';
  }
  if (selectedFormat.value === 'csv') return '导出 CSV';
  return '下载 ZIP';
});

const canExport = computed(() => {
  if (!props.batch?.garments?.length) return false;
  if (selectedFormat.value === 'excel' && includeQrImages.value) {
    return true;
  }
  return true;
});

// 监听批次和二维码模式变化，更新缓存状态
watch(
  () => [props.batch, props.qrMode, includeQrImages.value],
  async () => {
    if (props.isOpen && props.batch?.garments && (includeQrImages.value || selectedFormat.value === 'zip')) {
      await updateCacheStatus();
    }
  },
  { immediate: true }
);

watch(selectedFormat, async () => {
  if (props.isOpen && props.batch?.garments) {
    await updateCacheStatus();
  }
});

async function updateCacheStatus() {
  const garments = props.batch?.garments || [];
  const type = props.qrMode;

  if (selectedFormat.value === 'zip' || (selectedFormat.value === 'excel' && includeQrImages.value)) {
    const status = await checkCacheStatus(garments, type);
    cacheStatus.value = {
      cachedCount: status.cached.size,
      uncachedCount: status.uncached.size
    };
  } else {
    cacheStatus.value = { cachedCount: 0, uncachedCount: 0 };
  }
}

function close() {
  errorMessage.value = '';
  isExporting.value = false;
  progressCurrent.value = 0;
  progressTotal.value = 0;
  emit('close');
}

async function handleExport() {
  if (!props.batch?.garments?.length || isExporting.value) return;

  errorMessage.value = '';
  isExporting.value = true;
  emit('export-start');

  try {
    const garments = props.batch.garments;
    progressTotal.value = garments.length;
    progressCurrent.value = 0;

    if (selectedFormat.value === 'excel') {
      await exportExcel(garments);
    } else if (selectedFormat.value === 'csv') {
      await exportCsv(garments);
    } else if (selectedFormat.value === 'zip') {
      await exportZip(garments);
    }

    emit('export-complete', { format: selectedFormat.value });
    setTimeout(() => close(), 1500);
  } catch (error) {
    console.error('导出失败:', error);
    errorMessage.value = error.message || '导出失败，请重试';
    emit('export-error', error);
  } finally {
    isExporting.value = false;
  }
}

async function exportExcel(garments) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('批次吊牌码');

  // 定义列
  const columns = [
    { header: '衣服名称', key: 'clothingName', width: 20 },
    { header: '执行标准', key: 'standard', width: 30 },
    { header: '款号', key: 'styleNo', width: 14 },
    { header: '颜色', key: 'color', width: 10 },
    { header: '尺码', key: 'size', width: 8 },
    { header: 'SN', key: 'sn', width: 20 },
    { header: '批次标签', key: 'batchNo', width: 18 },
    { header: '生产日期', key: 'productionDate', width: 12 },
    { header: '详情页链接', key: 'detailUrl', width: 40 },
    { header: '二维码模式', key: 'qrModeLabel', width: 14 },
    { header: '二维码链接', key: 'qrUrl', width: 50 }
  ];

  // 如果包含二维码图片，增加一列
  if (includeQrImages.value) {
    columns.push({ header: '二维码', key: 'qrImage', width: 15 });
  }

  worksheet.columns = columns;

  // 添加数据行
  for (let i = 0; i < garments.length; i++) {
    const record = garments[i];
    progressCurrent.value = i + 1;

    const clothingName = props.clothing?.productName || record.productName || '';
    const standard = formatStandard(props.clothing?.standard || record.standard || '');
    const styleNo = props.batch?.styleNo || record.styleNo || '';
    const color = props.batch?.color || record.color || '';
    const size = props.batch?.size || record.size || '';
    const sn = record.sn;
    const batchNo = props.batch?.batchNo || record.batchNo || '';
    const productionDate = props.batch?.productionDate || record.productionDate || '';
    const detailUrl = `${window.location.origin}/#/pages/garment/detail?sn=${encodeURIComponent(sn)}`;
    const qrModeLabel = getQrModeLabel(props.qrMode);
    const qrUrl = qrcodeUrl(sn, props.qrMode);

    const rowData = {
      clothingName,
      standard,
      styleNo,
      color,
      size,
      sn,
      batchNo,
      productionDate,
      detailUrl,
      qrModeLabel,
      qrUrl
    };

    worksheet.addRow(rowData);

    // 如果需要二维码图片
    if (includeQrImages.value) {
      try {
        // 获取或下载二维码
        const base64 = await getOrDownloadQrCode(sn, props.qrMode, qrUrl);

        // 提取 base64 数据
        const base64Data = base64.split(',')[1];

        // 添加图片到工作簿
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'png'
        });

        // 计算图片位置（在最后一列）
        const rowIndex = i + 2; // +2 因为有标题行且从1开始
        const colIndex = columns.length;

        worksheet.addImage(imageId, {
          tl: { col: colIndex - 1, row: rowIndex - 1 },
          ext: { width: 100, height: 100 }
        });
      } catch (error) {
        console.error(`获取二维码 ${sn} 失败:`, error);
        worksheet.getCell(rowIndex, columns.length).value = '加载失败';
      }
    }
  }

  // 设置行高以适应图片
  if (includeQrImages.value) {
    for (let i = 2; i <= garments.length + 1; i++) {
      worksheet.getRow(i).height = 80;
    }
  }

  // 生成文件
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  downloadBlob(blob, getFileName('xlsx'));
}

async function exportCsv(garments) {
  const columns = [
    { key: 'clothingName', label: '衣服名称' },
    { key: 'standard', label: '执行标准' },
    { key: 'styleNo', label: '款号' },
    { key: 'color', label: '颜色' },
    { key: 'size', label: '尺码' },
    { key: 'sn', label: 'SN' },
    { key: 'batchNo', label: '批次标签' },
    { key: 'productionDate', label: '生产日期' },
    { key: 'detailUrl', label: '详情页链接' },
    { key: 'qrModeLabel', label: '二维码模式' },
    { key: 'qrUrl', label: '二维码图片链接' }
  ];

  const rows = garments.map((record) => {
    const clothingName = props.clothing?.productName || record.productName || '';
    const standard = formatStandard(props.clothing?.standard || record.standard || '');
    const styleNo = props.batch?.styleNo || record.styleNo || '';
    const color = props.batch?.color || record.color || '';
    const size = props.batch?.size || record.size || '';
    const sn = record.sn;
    const batchNo = props.batch?.batchNo || record.batchNo || '';
    const productionDate = props.batch?.productionDate || record.productionDate || '';
    const detailUrl = `${window.location.origin}/#/pages/garment/detail?sn=${encodeURIComponent(sn)}`;
    const qrModeLabel = getQrModeLabel(props.qrMode);
    const qrUrl = qrcodeUrl(sn, props.qrMode);

    return {
      clothingName,
      standard,
      styleNo,
      color,
      size,
      sn,
      batchNo,
      productionDate,
      detailUrl,
      qrModeLabel,
      qrUrl
    };
  });

  const header = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])));
  const csv = `﻿${[header, ...body].map((line) => line.join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, getFileName('csv'));
}

async function exportZip(garments) {
  // 调用API下载ZIP
  const { downloadBatchQrCodes } = await import('../utils/api.js');
  await downloadBatchQrCodes(props.batch.id, props.qrMode);
}

function formatStandard(value) {
  return String(value || '')
    .split(/[\n\r；;、,，]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join('；');
}

function getQrModeLabel(mode) {
  switch (mode) {
    case QRCODE_MODE_MINIPROGRAM:
      return '微信小程序码';
    case QRCODE_MODE_MINIPROGRAM_SQUARE:
      return '微信小程序二维码';
    case QRCODE_MODE_SN:
      return '原始 SN 码';
    default:
      return 'H5 链接二维码';
  }
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function getFileName(ext) {
  const name = props.batch?.styleNo || props.clothing?.productName || '未命名衣服';
  const safeName = String(name)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-');
  const timestamp = formatTimestamp(new Date());
  return `吊牌码-${safeName}-${timestamp}.${ext}`;
}

function formatTimestamp(date) {
  const pad = (v) => String(v).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function downloadBlob(blob, filename) {
  if (typeof document === 'undefined') return;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 18px;
}

.modal-container {
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  overflow-y: auto;
  border: 1px solid #ddd6cc;
  border-radius: 8px;
  background: #fffdf9;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.modal-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid #e5ded4;
}

.modal-eyebrow {
  display: block;
  color: #746e65;
  font-size: 11px;
  font-weight: 700;
}

.modal-title {
  display: block;
  margin-top: 4px;
  color: #121212;
  font-size: 18px;
  font-weight: 680;
}

.modal-subtitle {
  display: block;
  margin-top: 3px;
  color: #6b665f;
  font-size: 12px;
}

.modal-close-button {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: #6b665f;
  font-size: 18px;
  line-height: 32px;
  text-align: center;
}

.modal-close-button:active {
  opacity: 0.6;
}

.modal-body {
  padding: 18px 20px;
  display: grid;
  gap: 16px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #e5ded4;
}

.export-section {
  display: grid;
  gap: 10px;
}

.section-label {
  display: block;
  color: #625d55;
  font-size: 12px;
  font-weight: 650;
}

.format-options {
  display: grid;
  gap: 8px;
}

.format-option {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
  padding: 12px;
  border: 1px solid #ddd6cc;
  border-radius: 6px;
  background: #fffdf9;
  cursor: pointer;
}

.format-option.active {
  border-color: #b9cbb2;
  background: #f7fbf4;
}

.format-radio {
  grid-row: span 2;
  margin-top: 2px;
}

.format-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid #e5ded4;
  border-radius: 6px;
  background: #fbf8f2;
  font-size: 16px;
}

.format-info {
  display: grid;
  gap: 2px;
}

.format-label {
  color: #171717;
  font-size: 14px;
  font-weight: 600;
}

.format-description {
  color: #6b665f;
  font-size: 12px;
}

.excel-options {
  display: grid;
  gap: 8px;
}

.checkbox-option {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e5ded4;
  border-radius: 6px;
  background: #fffdf9;
  cursor: pointer;
}

.checkbox-option:has(.checkbox-input:checked) {
  border-color: #b9cbb2;
  background: #f7fbf4;
}

.checkbox-input {
  margin-top: 2px;
}

.checkbox-text {
  display: grid;
  gap: 2px;
}

.checkbox-label {
  color: #171717;
  font-size: 14px;
  font-weight: 500;
}

.checkbox-description {
  color: #6b665f;
  font-size: 12px;
}

.cache-status {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.cache-status-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid #e5ded4;
  border-radius: 6px;
  background: #fbf8f2;
}

.cache-status-label {
  color: #6b665f;
  font-size: 11px;
}

.cache-status-value {
  font-size: 18px;
  font-weight: 700;
}

.cache-status-value.cached {
  color: #4f874d;
}

.cache-status-value.uncached {
  color: #8d3c22;
}

.cache-warning {
  grid-column: 1 / -1;
  padding: 8px 10px;
  background: #fff9f6;
  border: 1px solid #e4c8be;
  border-radius: 4px;
  color: #8d3c22;
  font-size: 12px;
}

.export-progress {
  display: grid;
  gap: 8px;
}

.progress-bar {
  height: 8px;
  background: #e5ded4;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #4f874d;
  border-radius: 4px;
  transition: width 0.2s ease;
}

.progress-text {
  color: #6b665f;
  font-size: 12px;
}

.export-error {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  background: #fff9f6;
  border: 1px solid #e4c8be;
  border-radius: 6px;
  color: #8d3c22;
  font-size: 13px;
}

.error-icon {
  flex: 0 0 auto;
  font-size: 16px;
}

@media (min-width: 680px) {
  .modal-container {
    max-width: 600px;
  }

  .modal-header,
  .modal-footer {
    padding: 20px 24px;
  }

  .modal-body {
    padding: 20px 24px;
  }
}
</style>
