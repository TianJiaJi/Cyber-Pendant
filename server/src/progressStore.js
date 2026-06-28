/**
 * 进度存储服务
 * 用于长时间运行任务的进度跟踪和 SSE 推送
 */

/**
 * 进度任务存储
 * Map<progressId, {current, total, status, message, timestamp}>
 */
const progressStore = new Map();

/**
 * 创建进度任务
 * @param {number} total - 总任务数
 * @returns {string} 进度ID
 */
export function createProgress(total = 0) {
  const progressId = `progress_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  progressStore.set(progressId, {
    current: 0,
    total,
    status: 'pending',
    message: '准备中...',
    timestamp: Date.now()
  });
  return progressId;
}

/**
 * 更新进度
 * @param {string} progressId - 进度ID
 * @param {Object} updates - 更新数据
 */
export function updateProgress(progressId, updates = {}) {
  const entry = progressStore.get(progressId);
  if (!entry) {
    return;
  }

  progressStore.set(progressId, {
    ...entry,
    ...updates,
    timestamp: Date.now()
  });
}

/**
 * 增加进度计数
 * @param {string} progressId - 进度ID
 * @param {number} increment - 增加量（默认1）
 */
export function incrementProgress(progressId, increment = 1) {
  const entry = progressStore.get(progressId);
  if (!entry) {
    return;
  }

  progressStore.set(progressId, {
    ...entry,
    current: entry.current + increment,
    timestamp: Date.now()
  });
}

/**
 * 完成进度任务
 * @param {string} progressId - 进度ID
 * @param {string} message - 完成消息
 */
export function completeProgress(progressId, message = '完成') {
  const entry = progressStore.get(progressId);
  if (!entry) {
    return;
  }

  progressStore.set(progressId, {
    ...entry,
    status: 'completed',
    current: entry.total,
    message,
    timestamp: Date.now()
  });
}

/**
 * 标记进度任务失败
 * @param {string} progressId - 进度ID
 * @param {string} error - 错误消息
 */
export function failProgress(progressId, error) {
  const entry = progressStore.get(progressId);
  if (!entry) {
    return;
  }

  progressStore.set(progressId, {
    ...entry,
    status: 'failed',
    message: error,
    timestamp: Date.now()
  });
}

/**
 * 获取进度状态
 * @param {string} progressId - 进度ID
 * @returns {Object|null} 进度状态
 */
export function getProgress(progressId) {
  return progressStore.get(progressId) || null;
}

/**
 * 删除进度任务
 * @param {string} progressId - 进度ID
 */
export function deleteProgress(progressId) {
  progressStore.delete(progressId);
}
