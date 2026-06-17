export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      ...(options.header || {})
    };

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

export function qrcodeUrl(sn, type = 'url') {
  return `${API_BASE_URL}/api/qrcode/${encodeURIComponent(sn)}?type=${type}`;
}
