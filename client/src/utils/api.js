export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

const TOKEN_KEY = 'cyber_pendant_admin_token';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync(TOKEN_KEY);
    const headers = {
      ...(options.header || {})
    };

    if (token && options.auth !== false) {
      headers.Authorization = `Bearer ${token}`;
    }

    uni.request({
      url: `${API_BASE_URL}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: headers,
      success(response) {
        const ok = response.statusCode >= 200 && response.statusCode < 300;
        if (ok) {
          resolve(response.data);
          return;
        }

        reject({
          statusCode: response.statusCode,
          message: response.data?.message || '请求失败',
          data: response.data
        });
      },
      fail(error) {
        reject({
          statusCode: 0,
          message: error.errMsg || '网络连接失败'
        });
      }
    });
  });
}

export function saveToken(token) {
  uni.setStorageSync(TOKEN_KEY, token);
}

export function getToken() {
  return uni.getStorageSync(TOKEN_KEY);
}

export function clearToken() {
  uni.removeStorageSync(TOKEN_KEY);
}

export function login(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    auth: false,
    data: { username, password }
  });
}

export function getPublicGarment(sn, options = {}) {
  const suffix = options.track === false ? '?track=0' : '';
  return request(`/api/garments/${encodeURIComponent(sn)}${suffix}`, {
    auth: false
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

export function listGarments(filters = {}) {
  const params = [];
  const query = typeof filters === 'string' ? filters : filters.query;
  const clothingId = typeof filters === 'string' ? '' : filters.clothingId;
  const batchId = typeof filters === 'string' ? '' : filters.batchId;

  appendQuery(params, 'q', query);
  appendQuery(params, 'clothingId', clothingId);
  appendQuery(params, 'batchId', batchId);

  const suffix = params.length ? `?${params.join('&')}` : '';
  return request(`/api/garments${suffix}`);
}

export function createGarment(data) {
  return request('/api/garments', {
    method: 'POST',
    data
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

export function generateSn() {
  return request('/api/sn/generate', {
    method: 'POST'
  });
}

export function qrcodeUrl(sn, type = 'url') {
  return `${API_BASE_URL}/api/qrcode/${encodeURIComponent(sn)}?type=${type}`;
}
