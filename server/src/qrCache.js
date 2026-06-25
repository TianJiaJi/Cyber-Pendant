/**
 * Cyber-Pendant 二维码缓存服务
 *
 * 实现内存 + SQLite BLOB 双层缓存：
 * - 内存缓存：快速访问，有限容量，真正的 LRU 算法
 * - 数据库缓存：持久化存储，支持元数据查询和 TTL 清理
 */

/**
 * 内存缓存配置
 */
export const MEMORY_CACHE_MAX_SIZE = 500; // 最多缓存500个二维码
export const MEMORY_CACHE_TTL = 30 * 60 * 1000; // 内存缓存30分钟过期

/**
 * 内存缓存存储
 * Map<key, {data: Buffer, timestamp: number}>
 *
 * 使用 Map.keys() 迭代顺序实现 LRU：
 * - 新插入的键在最后
 * - 访问时重新插入，将键移到末尾
 * - 淘汰时删除第一个键（最久未使用）
 */
const memoryCache = new Map();

/**
 * 获取缓存键
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @returns {string} 缓存键
 */
export function getCacheKey(sn, type = 'url') {
  return `${sn}_${type}`;
}

/**
 * 从内存缓存获取（LRU 实现）
 * @param {string} key - 缓存键
 * @returns {Buffer|null} 二进制数据或null
 */
function getFromMemory(key) {
  if (!memoryCache.has(key)) {
    return null;
  }

  const entry = memoryCache.get(key);

  // 检查是否过期
  if (Date.now() - entry.timestamp > MEMORY_CACHE_TTL) {
    memoryCache.delete(key);
    return null;
  }

  // LRU：重新插入以更新访问顺序（将键移到末尾）
  const data = entry.data;
  memoryCache.delete(key);
  memoryCache.set(key, { data, timestamp: Date.now() });

  return data;
}

/**
 * 保存到内存缓存（LRU 实现）
 * @param {string} key - 缓存键
 * @param {Buffer} data - 二进制数据
 */
function saveToMemory(key, data) {
  // 如果缓存已满，删除最旧的项（第一个键）
  if (memoryCache.size >= MEMORY_CACHE_MAX_SIZE && !memoryCache.has(key)) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) {
      memoryCache.delete(firstKey);
    }
  }

  memoryCache.set(key, { data, timestamp: Date.now() });
}

/**
 * 获取二维码（优先级：内存 > 数据库 > null）
 * @param {Object} db - 数据库实例
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @returns {Promise<Buffer|null>} 二进制数据或null
 */
export async function getQrCode(db, sn, type = 'url') {
  const key = getCacheKey(sn, type);

  // 1. 先查内存缓存
  const memData = getFromMemory(key);
  if (memData) {
    return memData;
  }

  // 2. 再查数据库缓存
  if (db) {
    const { getQrCache } = await import('./db.js');
    const dbData = getQrCache(db, sn, type);
    if (dbData) {
      // 同时存入内存缓存
      saveToMemory(key, dbData);
      return dbData;
    }
  }

  // 3. 未命中
  return null;
}

/**
 * 保存二维码到双层缓存
 * @param {Object} db - 数据库实例
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @param {Buffer} data - 二进制数据
 */
export async function setQrCode(db, sn, type, data) {
  const key = getCacheKey(sn, type);

  // 保存到内存缓存
  saveToMemory(key, data);

  // 保存到数据库
  if (db) {
    const { setQrCache } = await import('./db.js');
    setQrCache(db, sn, type, data);
  }
}

/**
 * 删除指定二维码缓存
 * @param {Object} db - 数据库实例
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 */
export async function deleteQrCode(db, sn, type) {
  const key = getCacheKey(sn, type);

  // 删除内存缓存
  memoryCache.delete(key);

  // 删除数据库缓存
  if (db) {
    const { deleteQrCache } = await import('./db.js');
    deleteQrCache(db, sn, type);
  }
}

/**
 * 清空所有缓存
 * @param {Object} db - 数据库实例
 */
export async function clearAll(db) {
  // 清空内存缓存
  memoryCache.clear();

  // 清空数据库缓存
  if (db) {
    const { clearQrCache } = await import('./db.js');
    clearQrCache(db);
  }
}

/**
 * 获取缓存统计信息
 * @param {Object} db - 数据库实例
 * @returns {Promise<Object>} 统计信息
 */
export async function getCacheStats(db) {
  const stats = {
    memory: {
      count: memoryCache.size,
      maxSize: MEMORY_CACHE_MAX_SIZE
    }
  };

  if (db) {
    const { getQrCacheStats } = await import('./db.js');
    const dbStats = getQrCacheStats(db);
    stats.database = dbStats;
  }

  return stats;
}

/**
 * 清理过期的内存缓存项
 * @returns {number} 清理数量
 */
export function cleanupMemoryCache() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of memoryCache.entries()) {
    if (now - entry.timestamp > MEMORY_CACHE_TTL) {
      memoryCache.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * 获取内存缓存信息（用于调试）
 * @returns {Object} 内存缓存信息
 */
export function getMemoryCacheInfo() {
  const entries = [];
  for (const [key, value] of memoryCache.entries()) {
    entries.push({
      key,
      timestamp: value.timestamp,
      size: value.data?.length || 0
    });
  }

  return {
    size: memoryCache.size,
    maxSize: MEMORY_CACHE_MAX_SIZE,
    ttl: MEMORY_CACHE_TTL,
    entries
  };
}
