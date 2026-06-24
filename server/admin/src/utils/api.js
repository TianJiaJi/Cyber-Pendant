const runtimeConfig = window.__CYBER_PENDANT_ADMIN_CONFIG__ || {};

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || runtimeConfig.apiBaseUrl || '';

export const FRONTEND_BASE_URL =
  import.meta.env.VITE_FRONTEND_BASE_URL ||
  runtimeConfig.frontendBaseUrl ||
  'http://localhost:5173';

const TOKEN_KEY = 'cyber_pendant_admin_token';
export const QRCODE_MODE_KEY = 'cyber_pendant_qrcode_mode';
export const QRCODE_MODE_URL = 'url';
export const QRCODE_MODE_MINIPROGRAM = 'mini-program';
export const QRCODE_MODE_MINIPROGRAM_SQUARE = 'mini-program-square';
export const QRCODE_MODE_SN = 'sn';

function absoluteApiBaseUrl() {
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/$/, '');
  }

  return window.location.origin;
}

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    ...(options.headers || {})
  };

  if (options.data !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  if (token && options.auth !== false) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.data === undefined ? undefined : JSON.stringify(options.data)
    });
  } catch {
    throw {
      statusCode: 0,
      message: '网络连接失败'
    };
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (response.ok) {
    return data;
  }

  throw {
    statusCode: response.status,
    message: data?.message || '请求失败',
    data
  };
}

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getQrcodeMode() {
  const saved = localStorage.getItem(QRCODE_MODE_KEY);
  const validModes = [
    QRCODE_MODE_URL,
    QRCODE_MODE_MINIPROGRAM,
    QRCODE_MODE_MINIPROGRAM_SQUARE,
    QRCODE_MODE_SN
  ];
  if (saved && validModes.includes(saved)) {
    return saved;
  }
  return QRCODE_MODE_URL;
}

export function saveQrcodeMode(mode) {
  const validModes = [
    QRCODE_MODE_URL,
    QRCODE_MODE_MINIPROGRAM,
    QRCODE_MODE_MINIPROGRAM_SQUARE,
    QRCODE_MODE_SN
  ];
  if (validModes.includes(mode)) {
    localStorage.setItem(QRCODE_MODE_KEY, mode);
    return mode;
  }
  return QRCODE_MODE_URL;
}

export function login(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    auth: false,
    data: { username, password }
  });
}

function appendQuery(params, key, value) {
  if (value !== undefined && value !== null && String(value).trim() !== '') {
    params.push(`${key}=${encodeURIComponent(value)}`);
  }
}

function hardDeleteSuffix(hard) {
  return hard ? '?hard=1' : '';
}

export function listClothes(query = '') {
  const params = [];
  appendQuery(params, 'q', query);
  const suffix = params.length ? `?${params.join('&')}` : '';
  return request(`/api/clothes${suffix}`);
}

export function createClothing(data) {
  return request('/api/clothes', {
    method: 'POST',
    data
  });
}

export function getClothing(id) {
  return request(`/api/clothes/${encodeURIComponent(id)}`);
}

export function updateClothing(id, data) {
  return request(`/api/clothes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    data
  });
}

export function deleteClothing(id, hard = false) {
  return request(`/api/clothes/${encodeURIComponent(id)}${hardDeleteSuffix(hard)}`, {
    method: 'DELETE'
  });
}

export function listClothingBatches(clothingId) {
  return request(`/api/clothes/${encodeURIComponent(clothingId)}/batches`);
}

export function createClothingBatch(clothingId, data) {
  return request(`/api/clothes/${encodeURIComponent(clothingId)}/batches`, {
    method: 'POST',
    data
  });
}

export function updateBatch(id, data) {
  return request(`/api/batches/${encodeURIComponent(id)}`, {
    method: 'PUT',
    data
  });
}

export function deleteBatch(id, hard = false) {
  return request(`/api/batches/${encodeURIComponent(id)}${hardDeleteSuffix(hard)}`, {
    method: 'DELETE'
  });
}

export function updateGarment(sn, data) {
  return request(`/api/garments/${encodeURIComponent(sn)}`, {
    method: 'PUT',
    data
  });
}

export function deleteGarment(sn, hard = false) {
  return request(`/api/garments/${encodeURIComponent(sn)}${hardDeleteSuffix(hard)}`, {
    method: 'DELETE'
  });
}

export function unbindGarmentBinding(sn) {
  return request(`/api/garments/${encodeURIComponent(sn)}/binding`, {
    method: 'DELETE'
  });
}

export function getAdminStats() {
  return request('/api/admin/stats');
}

export function listAdminUsers() {
  return request('/api/admin/users');
}

export function banAdminUser(id) {
  return request(`/api/admin/users/${encodeURIComponent(id)}/ban`, {
    method: 'POST'
  });
}

export function unbanAdminUser(id) {
  return request(`/api/admin/users/${encodeURIComponent(id)}/unban`, {
    method: 'POST'
  });
}

export async function downloadAdminExport(type) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL}/api/admin/export/${encodeURIComponent(type)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    throw {
      statusCode: response.status,
      message: '导出失败'
    };
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${type}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function publicGarmentDetailUrl(sn) {
  const baseUrl = FRONTEND_BASE_URL.replace(/\/$/, '');
  return `${baseUrl}/#/pages/garment/detail?sn=${encodeURIComponent(sn)}`;
}

export function qrcodeUrl(sn, type = QRCODE_MODE_URL) {
  return `${absoluteApiBaseUrl()}/api/qrcode/${encodeURIComponent(sn)}?type=${encodeURIComponent(type)}`;
}

/**
 * 验证二维码是否在服务器上缓存（单个）
 * 通过 HEAD 请求检查文件是否存在
 */
export async function verifyQrCache(sn, type = QRCODE_MODE_URL) {
  const token = localStorage.getItem(TOKEN_KEY);
  const url = `${absoluteApiBaseUrl()}/api/qrcode/${encodeURIComponent(sn)}?type=${encodeURIComponent(type)}`;

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    // 200 表示文件存在（有缓存），404 表示不存在
    return response.ok;
  } catch (error) {
    console.error('验证缓存失败:', error);
    return false;
  }
}

/**
 * 批量检查缓存状态（推荐使用）
 * @param {Array} sns - SN 列表
 * @param {string} type - 二维码类型
 * @returns {Promise<Object>} { cached: string[], uncached: string[] }
 */
export async function checkQrCacheBatch(sns, type = QRCODE_MODE_URL) {
  return request('/api/admin/qrcode/cache/check-batch', {
    method: 'POST',
    data: { sns, type }
  });
}

/**
 * 获取缓存列表
 */
export async function getQrCacheList(options = {}) {
  const params = [];
  if (options.limit) params.push(`limit=${options.limit}`);
  if (options.offset) params.push(`offset=${options.offset}`);
  if (options.type) params.push(`type=${encodeURIComponent(options.type)}`);
  if (options.snLike) params.push(`snLike=${encodeURIComponent(options.snLike)}`);

  const suffix = params.length ? `?${params.join('&')}` : '';
  return request(`/api/admin/qrcode/cache/list${suffix}`);
}

/**
 * 获取缓存统计
 */
export async function getQrCacheStatistics() {
  return request('/api/admin/qrcode/cache/statistics');
}

/**
 * 创建进度任务
 */
export async function createProgress(total = 0) {
  return request('/api/progress/create', {
    method: 'POST',
    data: { total }
  });
}

/**
 * 获取进度状态
 */
export async function getProgressStatus(progressId) {
  return request(`/api/progress/${encodeURIComponent(progressId)}`);
}

/**
 * 轮询监听进度
 * @param {string} progressId - 进度ID
 * @param {Function} onProgress - 进度回调函数
 * @param {number} interval - 轮询间隔（毫秒）
 * @returns {Function} 取消轮询的函数
 */
export function pollProgress(progressId, onProgress, interval = 3000) {
  let active = true;
  let timeoutId = null;

  const poll = async () => {
    if (!active) return;

    try {
      const progress = await getProgressStatus(progressId);

      if (progress) {
        onProgress(progress);

        // 如果完成或失败，停止轮询
        if (progress.status === 'completed' || progress.status === 'failed') {
          active = false;
          return;
        }
      }

      // 继续轮询
      if (active) {
        timeoutId = setTimeout(poll, interval);
      }
    } catch (error) {
      console.error('获取进度失败:', error);
      // 出错时停止轮询
      active = false;
      onProgress({ status: 'failed', message: '获取进度失败' });
    }
  };

  // 开始轮询
  poll();

  // 返回取消轮询的函数
  return () => {
    active = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}

export async function downloadBatchQrCodes(batchId, type = QRCODE_MODE_URL, progressId = null) {
  const token = localStorage.getItem(TOKEN_KEY);
  const params = new URLSearchParams({ batchId: String(batchId), type });
  if (progressId) {
    params.set('progressId', progressId);
  }
  const response = await fetch(`${API_BASE_URL}/api/qrcode/batch?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const error = await response.text();
    throw {
      statusCode: response.status,
      message: error || '下载失败'
    };
  }

  // 从响应头获取文件名
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `batch-${batchId}-qrcodes.zip`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match && match[1]) {
      filename = decodeURIComponent(match[1].replace(/['"]/g, ''));
    }
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
