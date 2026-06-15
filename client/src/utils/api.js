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

export function getPublicGarment(sn) {
  return request(`/api/garments/${encodeURIComponent(sn)}`, {
    auth: false
  });
}

export function listGarments(query = '') {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
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

export function generateSn() {
  return request('/api/sn/generate', {
    method: 'POST'
  });
}

export function qrcodeUrl(sn, type = 'url') {
  return `${API_BASE_URL}/api/qrcode/${encodeURIComponent(sn)}?type=${type}`;
}
