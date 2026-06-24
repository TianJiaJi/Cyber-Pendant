<template>
  <div class="page-shell cache-manage-page">
    <div class="admin-topbar">
      <div>
        <span class="eyebrow">CACHE MANAGEMENT</span>
        <span class="admin-title">二维码缓存管理</span>
        <span class="admin-subtitle">查看和管理二维码缓存文件</span>
      </div>
      <div class="topbar-actions">
        <button class="secondary-button" @click="goBack">返回</button>
        <button class="ghost-button" @click="logout">退出</button>
      </div>
    </div>

    <div v-if="loading" class="state-block">正在加载缓存信息...</div>
    <div v-else class="cache-layout">
      <!-- 缓存统计 -->
      <div class="summary-card">
        <div class="summary-head">
          <div>
            <span class="summary-kicker">缓存统计</span>
            <span class="summary-title">缓存概览</span>
          </div>
        </div>

        <div class="summary-metrics">
          <div class="metric-item">
            <span class="metric-value">{{ stats.totalCount || 0 }}</span>
            <span class="metric-label">总缓存数</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">{{ formatSize(stats.totalSize) }}</span>
            <span class="metric-label">总大小</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">{{ stats.byType?.length || 0 }}</span>
            <span class="metric-label">类型数</span>
          </div>
        </div>
      </div>

      <!-- 操作面板 -->
      <div class="editor-panel">
        <div class="panel-heading">
          <div>
            <span class="section-title">批量操作</span>
            <span class="section-copy">管理缓存文件，执行批量操作</span>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <span class="field-label">类型筛选</span>
            <select v-model="filterType" class="form-select">
              <option value="">全部类型</option>
              <option value="url">H5 链接二维码</option>
              <option value="mini-program">微信小程序码</option>
              <option value="mini-program-square">微信小程序二维码</option>
              <option value="sn">原始 SN 码</option>
            </select>
          </div>

          <div class="form-field">
            <span class="field-label">SN 搜索</span>
            <input v-model="filterSnLike" class="form-input" placeholder="输入 SN 关键词..." />
          </div>
        </div>

        <div class="action-buttons">
          <button class="secondary-button" @click="loadCacheList">刷新列表</button>
          <button class="warning-button" @click="confirmRepair">修复缓存</button>
          <button class="danger-button" @click="confirmClearAll">清空所有缓存</button>
        </div>
      </div>

      <!-- 缓存列表 -->
      <div class="list-panel">
        <div class="panel-heading">
          <div>
            <span class="section-title">缓存记录</span>
            <span class="section-copy">共 {{ cacheList.length }} 条记录</span>
          </div>
        </div>

        <div v-if="cacheList.length === 0" class="empty-state">暂无缓存记录</div>

        <div v-else class="cache-list">
          <div v-for="item in cacheList" :key="`${item.sn}_${item.type}`" class="cache-item">
            <div class="cache-item-info">
              <span class="cache-item-sn">{{ item.sn }}</span>
              <span class="cache-item-type">{{ getTypeLabel(item.type) }}</span>
              <span class="cache-item-size">{{ formatSize(item.file_size) }}</span>
            </div>
            <button class="ghost-button small-button" @click="deleteCache(item.sn, item.type)">删除</button>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="hasMore" class="pagination">
          <button class="ghost-button small-button" @click="loadMore" :disabled="loadingMore">
            {{ loadingMore ? '加载中...' : '加载更多' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 确认弹窗 -->
    <div v-if="showConfirm" class="modal-overlay" @click="showConfirm = false">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <span class="modal-title">{{ confirmTitle }}</span>
          <button class="modal-close-button" @click="showConfirm = false">✕</button>
        </div>
        <div class="modal-body">
          <span>{{ confirmMessage }}</span>
        </div>
        <div class="modal-footer">
          <button class="ghost-button" @click="showConfirm = false">取消</button>
          <button class="danger-button" @click="executeConfirm">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  getQrCacheList,
  getQrCacheStatistics,
  clearQrCache,
  deleteQrCache,
  repairQrCache,
  clearToken
} from '../utils/api.js';

const router = useRouter();

const loading = ref(false);
const loadingMore = ref(false);
const stats = ref({ totalCount: 0, totalSize: 0, byType: [] });
const cacheList = ref([]);
const filterType = ref('');
const filterSnLike = ref('');
const offset = ref(0);
const limit = 50;
const hasMore = ref(false);

// 确认弹窗
const showConfirm = ref(false);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmAction = ref(null);

onMounted(() => {
  loadStatistics();
  loadCacheList();
});

function goBack() {
  router.push('/dashboard');
}

function logout() {
  clearToken();
  router.push('/login');
}

async function loadStatistics() {
  try {
    const data = await getQrCacheStatistics();
    stats.value = data;
  } catch (error) {
    console.error('加载缓存统计失败:', error);
  }
}

async function loadCacheList() {
  offset.value = 0;
  cacheList.value = [];
  await loadMore();
}

async function loadMore() {
  if (loadingMore.value) return;

  loadingMore.value = true;
  try {
    const data = await getQrCacheList({
      limit,
      offset: offset.value,
      type: filterType.value || null,
      snLike: filterSnLike.value || null
    });

    if (offset.value === 0) {
      cacheList.value = data.list || [];
    } else {
      cacheList.value.push(...(data.list || []));
    }

    offset.value += limit;
    hasMore.value = (data.list || []).length >= limit;
  } catch (error) {
    console.error('加载缓存列表失败:', error);
  } finally {
    loadingMore.value = false;
  }
}

async function deleteCache(sn, type) {
  confirmTitle.value = '删除缓存';
  confirmMessage.value = `确定要删除 ${sn} (${getTypeLabel(type)}) 的缓存吗？`;
  confirmAction.value = async () => {
    try {
      await deleteQrCache(sn, type);
      await loadStatistics();
      await loadCacheList();
    } catch (error) {
      console.error('删除缓存失败:', error);
      alert('删除失败: ' + (error.message || '未知错误'));
    }
  };
  showConfirm.value = true;
}

function confirmClearAll() {
  confirmTitle.value = '清空所有缓存';
  confirmMessage.value = '确定要清空所有二维码缓存吗？此操作不可恢复。';
  confirmAction.value = async () => {
    try {
      await clearQrCache();
      await loadStatistics();
      await loadCacheList();
    } catch (error) {
      console.error('清空缓存失败:', error);
      alert('清空失败: ' + (error.message || '未知错误'));
    }
  };
  showConfirm.value = true;
}

function confirmRepair() {
  confirmTitle.value = '修复缓存';
  confirmMessage.value = '将扫描文件系统并同步元数据表，是否继续？';
  confirmAction.value = async () => {
    try {
      const result = await repairQrCache();
      alert(`修复完成：删除 ${result.deleted} 条无效记录，新增 ${result.added} 条记录`);
      await loadStatistics();
      await loadCacheList();
    } catch (error) {
      console.error('修复缓存失败:', error);
      alert('修复失败: ' + (error.message || '未知错误'));
    }
  };
  showConfirm.value = true;
}

async function executeConfirm() {
  showConfirm.value = false;
  if (confirmAction.value) {
    await confirmAction.value();
    confirmAction.value = null;
  }
}

function getTypeLabel(type) {
  switch (type) {
    case 'mini-program':
      return '微信小程序码';
    case 'mini-program-square':
      return '微信小程序二维码';
    case 'sn':
      return '原始 SN 码';
    default:
      return 'H5 链接二维码';
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const mb = bytes / 1024 / 1024;
  if (mb < 1) {
    return (bytes / 1024).toFixed(2) + ' KB';
  }
  return mb.toFixed(2) + ' MB';
}
</script>

<style scoped>
.cache-manage-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.cache-layout {
  display: grid;
  gap: 16px;
}

.form-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd6cc;
  border-radius: 4px;
  background: #fffdf9;
  font-size: 14px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.warning-button {
  padding: 8px 16px;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  color: #856404;
  font-size: 14px;
  cursor: pointer;
}

.warning-button:hover {
  background: #ffe69c;
}

.warning-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.danger-button {
  padding: 8px 16px;
  background: #f8d7da;
  border: 1px solid #dc3545;
  border-radius: 4px;
  color: #721c24;
  font-size: 14px;
  cursor: pointer;
}

.danger-button:hover {
  background: #f5c6cb;
}

.danger-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.list-panel {
  background: #fffdf9;
  border: 1px solid #ddd6cc;
  border-radius: 8px;
  padding: 16px;
}

.empty-state {
  text-align: center;
  color: #6b665f;
  padding: 40px 20px;
}

.cache-list {
  display: grid;
  gap: 8px;
}

.cache-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #fbf8f2;
  border: 1px solid #e5ded4;
  border-radius: 4px;
}

.cache-item-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.cache-item-sn {
  font-weight: 600;
  color: #171717;
  font-size: 14px;
}

.cache-item-type {
  color: #6b665f;
  font-size: 12px;
  padding: 2px 8px;
  background: #e5ded4;
  border-radius: 10px;
}

.cache-item-size {
  color: #6b665f;
  font-size: 12px;
  margin-left: auto;
  margin-right: 12px;
}

.pagination {
  margin-top: 16px;
  text-align: center;
}

/* 确认弹窗 */
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
  max-width: 400px;
  background: #fffdf9;
  border: 1px solid #ddd6cc;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid #e5ded4;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #121212;
}

.modal-close-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: #6b665f;
  font-size: 16px;
  cursor: pointer;
}

.modal-body {
  padding: 16px 18px;
  color: #6b665f;
  font-size: 14px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 18px;
  border-top: 1px solid #e5ded4;
}

@media (min-width: 680px) {
  .cache-manage-page {
    padding: 20px;
  }

  .cache-layout {
    gap: 20px;
  }

  .list-panel {
    padding: 20px;
  }
}
</style>
