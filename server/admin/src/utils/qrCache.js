/**
 * 二维码缓存服务
 * 使用 IndexedDB 永久存储生成的二维码图片
 */

const DB_NAME = 'CyberPendantQRCache';
const DB_VERSION = 1;
const STORE_NAME = 'qrcodes';

let dbInstance = null;

/**
 * 打开 IndexedDB 数据库
 */
async function openDB() {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('无法打开二维码缓存数据库'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * 生成缓存键
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型 (url, mini-program, sn)
 */
function getCacheKey(sn, type = 'url') {
  return `${sn}_${type}`;
}

/**
 * 从 IndexedDB 获取缓存的二维码
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @returns {Promise<string|null>} base64 图片数据或 null
 */
async function getQrCode(sn, type = 'url') {
  try {
    const db = await openDB();
    const key = getCacheKey(sn, type);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };

      request.onerror = () => {
        reject(new Error('获取二维码缓存失败'));
      };
    });
  } catch (error) {
    console.error('获取二维码缓存出错:', error);
    return null;
  }
}

/**
 * 保存二维码到 IndexedDB
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @param {string} data - base64 图片数据
 * @returns {Promise<boolean>} 是否成功
 */
async function setQrCode(sn, type, data) {
  try {
    const db = await openDB();
    const key = getCacheKey(sn, type);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({
        key,
        sn,
        type,
        data,
        timestamp: Date.now()
      });

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(new Error('保存二维码缓存失败'));
      };
    });
  } catch (error) {
    console.error('保存二维码缓存出错:', error);
    return false;
  }
}

/**
 * 删除指定二维码缓存
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 */
async function deleteQrCode(sn, type) {
  try {
    const db = await openDB();
    const key = getCacheKey(sn, type);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(new Error('删除二维码缓存失败'));
      };
    });
  } catch (error) {
    console.error('删除二维码缓存出错:', error);
    return false;
  }
}

/**
 * 清空所有缓存
 */
async function clearAll() {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(new Error('清空缓存失败'));
      };
    });
  } catch (error) {
    console.error('清空缓存出错:', error);
    return false;
  }
}

/**
 * 获取所有缓存的信息（不含图片数据）
 */
async function getAllCacheInfo() {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        resolve(items.map(item => ({
          sn: item.sn,
          type: item.type,
          timestamp: item.timestamp,
          date: new Date(item.timestamp).toLocaleString('zh-CN')
        })));
      };

      request.onerror = () => {
        reject(new Error('获取缓存信息失败'));
      };
    });
  } catch (error) {
    console.error('获取缓存信息出错:', error);
    return [];
  }
}

/**
 * 获取缓存统计信息
 */
async function getCacheStats() {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();

      countRequest.onsuccess = () => {
        resolve({
          total: countRequest.result
        });
      };

      countRequest.onerror = () => {
        reject(new Error('获取缓存统计失败'));
      };
    });
  } catch (error) {
    console.error('获取缓存统计出错:', error);
    return { total: 0 };
  }
}

/**
 * 批量获取二维码，未缓存的返回 null
 * @param {Array} items - [{sn, type}, ...]
 * @returns {Promise<Map>} sn -> base64 或 null
 */
async function batchGetQrCodes(items) {
  const results = new Map();

  await Promise.all(
    items.map(async ({ sn, type = 'url' }) => {
      const data = await getQrCode(sn, type);
      results.set(`${sn}_${type}`, data);
    })
  );

  return results;
}

/**
 * 批量保存二维码
 * @param {Array} items - [{sn, type, data}, ...]
 */
async function batchSetQrCodes(items) {
  await Promise.all(
    items.map(({ sn, type, data }) => setQrCode(sn, type, data))
  );
}

/**
 * 获取或下载二维码（优先使用缓存）
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @param {string} url - 二维码API URL
 * @returns {Promise<string>} base64 图片数据
 */
async function getOrDownloadQrCode(sn, type, url) {
  // 先尝试从缓存获取
  const cached = await getQrCode(sn, type);
  if (cached) {
    return cached;
  }

  // 缓存未命中，下载图片
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }

    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    // 保存到缓存
    await setQrCode(sn, type, base64);

    return base64;
  } catch (error) {
    console.error(`下载二维码 ${sn} 失败:`, error);
    throw error;
  }
}

/**
 * 将 Blob 转换为 Base64
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 检查批量缓存状态（使用服务器批量验证）
 * @param {Array} garments - SN列表
 * @param {string} type - 二维码类型
 * @param {Function} batchCheckFn - 批量检查函数（可选）
 * @returns {Promise<Object>} { cached: Set, uncached: Set }
 */
async function checkCacheStatus(garments, type = 'url', batchCheckFn = null) {
  const cached = new Set();
  const uncached = new Set();

  if (batchCheckFn) {
    // 使用批量检查接口（高效）
    const sns = garments.map(g => typeof g === 'string' ? g : g.sn);
    try {
      const result = await batchCheckFn(sns, type);
      // 结果是 { cached: string[], uncached: string[] }
      if (result && Array.isArray(result.cached)) {
        result.cached.forEach(sn => cached.add(sn));
      }
      if (result && Array.isArray(result.uncached)) {
        result.uncached.forEach(sn => uncached.add(sn));
      }
    } catch (error) {
      console.error('批量检查缓存失败:', error);
      // 失败时回退到逐个检查本地缓存
      await fallbackCheckCache();
    }
  } else {
    // 回退到逐个检查本地缓存
    await fallbackCheckCache();
  }

  async function fallbackCheckCache() {
    await Promise.all(
      garments.map(async (garment) => {
        const sn = typeof garment === 'string' ? garment : garment.sn;
        const localData = await getQrCode(sn, type);
        if (localData) {
          cached.add(sn);
        } else {
          uncached.add(sn);
        }
      })
    );
  }

  return { cached, uncached };
}

export {
  getQrCode,
  setQrCode,
  deleteQrCode,
  clearAll,
  getAllCacheInfo,
  getCacheStats,
  batchGetQrCodes,
  batchSetQrCodes,
  getOrDownloadQrCode,
  checkCacheStatus,
  getCacheKey
};
