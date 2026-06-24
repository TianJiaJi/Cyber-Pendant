/**
 * Cyber-Pendant 二维码缓存服务
 *
 * 实现内存+文件双缓存机制：
 * - 内存缓存：快速访问，有限容量
 * - 文件缓存：持久化存储，容量较大
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, unlinkSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * 内存缓存配置
 */
export const MEMORY_CACHE_MAX_SIZE = 500; // 最多缓存500个二维码
export const MEMORY_CACHE_TTL = 30 * 60 * 1000; // 内存缓存30分钟过期

/**
 * 内存缓存存储
 * Map<key, {data: Buffer, timestamp: number, accessCount: number}>
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
 * 从内存缓存获取
 * @param {string} key - 缓存键
 * @returns {Buffer|null} 二进制数据或null
 */
function getFromMemory(key) {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  // 检查是否过期
  if (Date.now() - entry.timestamp > MEMORY_CACHE_TTL) {
    memoryCache.delete(key);
    return null;
  }

  // 更新访问统计
  entry.accessCount++;
  return entry.data;
}

/**
 * 保存到内存缓存
 * @param {string} key - 缓存键
 * @param {Buffer} data - 二进制数据
 */
function saveToMemory(key, data) {
  // 如果缓存已满，删除最少使用的项
  if (memoryCache.size >= MEMORY_CACHE_MAX_SIZE && !memoryCache.has(key)) {
    let minAccessKey = null;
    let minAccessCount = Infinity;

    for (const [k, v] of memoryCache.entries()) {
      if (v.accessCount < minAccessCount) {
        minAccessCount = v.accessCount;
        minAccessKey = k;
      }
    }

    if (minAccessKey) {
      memoryCache.delete(minAccessKey);
    }
  }

  memoryCache.set(key, {
    data,
    timestamp: Date.now(),
    accessCount: 1
  });
}

/**
 * 获取文件缓存路径
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @param {string} cacheDir - 缓存目录
 * @returns {string} 文件路径
 */
export function getCacheFilePath(sn, type, cacheDir) {
  // 使用两级目录结构避免单个目录文件过多
  const prefix = sn.slice(0, 2);
  const filename = `${sn}_${type}.png`;
  return path.join(cacheDir, prefix, filename);
}

/**
 * 从文件缓存获取
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @param {string} cacheDir - 缓存目录
 * @returns {Buffer|null} 二进制数据或null
 */
function getFromFile(sn, type, cacheDir) {
  try {
    const filePath = getCacheFilePath(sn, type, cacheDir);

    if (!existsSync(filePath)) {
      return null;
    }

    // 读取文件
    const data = readFileSync(filePath);

    // 同时存入内存缓存
    const key = getCacheKey(sn, type);
    saveToMemory(key, data);

    return data;
  } catch (error) {
    console.error(`读取文件缓存失败 [${sn}/${type}]:`, error.message);
    return null;
  }
}

/**
 * 保存到文件缓存
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @param {Buffer} data - 二进制数据
 * @param {string} cacheDir - 缓存目录
 */
function saveToFile(sn, type, data, cacheDir) {
  try {
    const filePath = getCacheFilePath(sn, type, cacheDir);
    const dir = path.dirname(filePath);

    // 确保目录存在
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // 写入文件
    writeFileSync(filePath, data);
  } catch (error) {
    console.error(`保存文件缓存失败 [${sn}/${type}]:`, error.message);
  }
}

/**
 * 获取二维码（优先级：内存 > 文件 > null）
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @param {string} cacheDir - 缓存目录
 * @returns {Buffer|null} 二进制数据或null
 */
export function getQrCode(sn, type = 'url', cacheDir) {
  const key = getCacheKey(sn, type);

  // 1. 先查内存缓存
  const memData = getFromMemory(key);
  if (memData) {
    return memData;
  }

  // 2. 再查文件缓存
  const fileData = getFromFile(sn, type, cacheDir);
  if (fileData) {
    return fileData;
  }

  // 3. 未命中
  return null;
}

/**
 * 保存二维码到双缓存
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @param {Buffer} data - 二进制数据
 * @param {string} cacheDir - 缓存目录
 */
export function setQrCode(sn, type, data, cacheDir) {
  const key = getCacheKey(sn, type);

  // 保存到内存缓存
  saveToMemory(key, data);
  console.log(`[QR Cache] Memory saved: ${key}`);

  // 保存到文件缓存
  saveToFile(sn, type, data, cacheDir);
  const filePath = getCacheFilePath(sn, type, cacheDir);
  console.log(`[QR Cache] File save attempted: ${filePath}`);
}

/**
 * 删除指定二维码缓存
 * @param {string} sn - SN码
 * @param {string} type - 二维码类型
 * @param {string} cacheDir - 缓存目录
 */
export function deleteQrCode(sn, type, cacheDir) {
  const key = getCacheKey(sn, type);

  // 删除内存缓存
  memoryCache.delete(key);

  // 删除文件缓存
  try {
    const filePath = getCacheFilePath(sn, type, cacheDir);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`删除文件缓存失败 [${sn}/${type}]:`, error.message);
  }
}

/**
 * 清空所有缓存
 * @param {string} cacheDir - 缓存目录
 */
export function clearAll(cacheDir) {
  // 清空内存缓存
  memoryCache.clear();

  // 清空文件缓存
  try {
    if (existsSync(cacheDir)) {
      const entries = readdirSync(cacheDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDir = path.join(cacheDir, entry.name);
          // 递归删除子目录及其内容
          rmSync(subDir, { recursive: true, force: true });
        }
      }
    }
  } catch (error) {
    console.error('清空文件缓存失败:', error.message);
  }
}

/**
 * 获取缓存统计信息
 * @param {string} cacheDir - 缓存目录
 * @returns {Object} 统计信息
 */
export function getCacheStats(cacheDir) {
  let fileCount = 0;
  let totalSize = 0;

  try {
    if (existsSync(cacheDir)) {
      const entries = readdirSync(cacheDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDir = path.join(cacheDir, entry.name);
          const files = readdirSync(subDir);

          for (const file of files) {
            if (file.endsWith('.png')) {
              const filePath = path.join(subDir, file);
              const stats = statSync(filePath);
              fileCount++;
              totalSize += stats.size;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('获取缓存统计失败:', error.message);
  }

  return {
    memory: {
      count: memoryCache.size,
      maxSize: MEMORY_CACHE_MAX_SIZE
    },
    file: {
      count: fileCount,
      totalBytes: totalSize,
      totalMB: (totalSize / 1024 / 1024).toFixed(2)
    }
  };
}

/**
 * 清理过期的内存缓存项
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
  return {
    size: memoryCache.size,
    maxSize: MEMORY_CACHE_MAX_SIZE,
    ttl: MEMORY_CACHE_TTL,
    entries: Array.from(memoryCache.entries()).map(([key, value]) => ({
      key,
      timestamp: value.timestamp,
      accessCount: value.accessCount,
      size: value.data?.length || 0
    }))
  };
}
