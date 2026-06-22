export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787';

export const USER_TOKEN_KEY = 'cyber_pendant_user_token';
export const USER_PROFILE_KEY = 'cyber_pendant_user_profile';

export function getUserToken() {
  return uni.getStorageSync(USER_TOKEN_KEY) || '';
}

export function getStoredUser() {
  return uni.getStorageSync(USER_PROFILE_KEY) || null;
}

export function saveUserSession(payload) {
  uni.setStorageSync(USER_TOKEN_KEY, payload.token);
  uni.setStorageSync(USER_PROFILE_KEY, payload.user);
}

export function clearUserSession() {
  uni.removeStorageSync(USER_TOKEN_KEY);
  uni.removeStorageSync(USER_PROFILE_KEY);
}

export function isLoggedIn() {
  return Boolean(getUserToken());
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const token = getUserToken();
    const headers = {
      ...(options.header || {})
    };

    if (token && options.auth !== false) {
      headers.Authorization = `Bearer ${token}`;
    }

    const fullUrl = `${API_BASE_URL}${path}`;

    uni.request({
      url: fullUrl,
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

export function loginWechat(code) {
  return request('/api/auth/wechat/login', {
    method: 'POST',
    auth: false,
    data: { code }
  });
}

export function getPublicGarment(sn, options = {}) {
  const suffix = options.track === false ? '?track=0' : '';
  return request(`/api/garments/${encodeURIComponent(sn)}${suffix}`);
}

export function bindPublicGarment(sn, data) {
  return request(`/api/garments/${encodeURIComponent(sn)}/binding`, {
    method: 'POST',
    data
  });
}

export function updateGarmentBinding(sn, data) {
  return request(`/api/garments/${encodeURIComponent(sn)}/binding`, {
    method: 'PUT',
    data
  });
}

export function unbindGarment(sn) {
  return request(`/api/garments/${encodeURIComponent(sn)}/binding`, {
    method: 'DELETE'
  });
}

export function reportLostGarment(sn, data = {}) {
  return request(`/api/garments/${encodeURIComponent(sn)}/report-lost`, {
    method: 'POST',
    data
  });
}

export function cancelLostReport(sn) {
  return request(`/api/garments/${encodeURIComponent(sn)}/report-lost`, {
    method: 'DELETE'
  });
}

export function revealGarmentContact(sn, data = {}) {
  return request(`/api/garments/${encodeURIComponent(sn)}/contact-reveal`, {
    method: 'POST',
    data
  });
}

export function getUserGarments() {
  return request('/api/user/garments');
}

export function getUserLostReports() {
  return request('/api/user/lost-reports');
}

export function getUserBindingLogs() {
  return request('/api/user/binding-logs');
}

export function qrcodeUrl(sn, type = 'url') {
  return `${API_BASE_URL}/api/qrcode/${encodeURIComponent(sn)}?type=${type}`;
}
