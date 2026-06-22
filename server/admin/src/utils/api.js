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
export const QRCODE_MODE_MINI_PROGRAM = 'mini-program';

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
  return saved === QRCODE_MODE_MINI_PROGRAM ? QRCODE_MODE_MINI_PROGRAM : QRCODE_MODE_URL;
}

export function saveQrcodeMode(mode) {
  const normalized = mode === QRCODE_MODE_MINI_PROGRAM ? QRCODE_MODE_MINI_PROGRAM : QRCODE_MODE_URL;
  localStorage.setItem(QRCODE_MODE_KEY, normalized);
  return normalized;
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
