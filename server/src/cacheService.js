/**
 * 二维码缓存服务
 * 提供统一的缓存管理接口，支持元数据管理、批量操作、预热等功能
 */

import {
  getQrCode as getQrFromCache,
  setQrCode as setQrToCache,
  getCacheStats,
  clearAll as clearAllCache
} from './qrCache.js';
import { openDatabase } from './db.js';
import QRCode from 'qrcode';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const CACHE_METADATA_TABLE = 'qr_cache_metadata';

/**
 * 初始化缓存元数据表
 */
export function initCacheMetadata(db) {
  // 检查表是否存在
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    )
    .get(CACHE_METADATA_TABLE);

  if (!tableExists) {
    db.exec(`
      CREATE TABLE ${CACHE_METADATA_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sn TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'url',
        file_path TEXT NOT NULL,
        file_size INTEGER,
        created_at INTEGER NOT NULL,
        accessed_at INTEGER,
        UNIQUE(sn, type)
      );
      CREATE INDEX idx_${CACHE_METADATA_TABLE}_sn_type ON ${CACHE_METADATA_TABLE}(sn, type);
      CREATE INDEX idx_${CACHE_METADATA_TABLE}_accessed ON ${CACHE_METADATA_TABLE}(accessed_at);
    `);
  }
}

/**
 * 保存缓存元数据
 */
export function saveCacheMetadata(db, sn, type, filePath, fileSize) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${CACHE_METADATA_TABLE} (sn, type, file_path, file_size, created_at, accessed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(sn, type, filePath, fileSize, now, now);
}

/**
 * 更新缓存访问时间
 */
export function updateCacheAccessTime(db, sn, type) {
  const stmt = db.prepare(`
    UPDATE ${CACHE_METADATA_TABLE}
    SET accessed_at = ?
    WHERE sn = ? AND type = ?
  `);
  stmt.run(Date.now(), sn, type);
}

/**
 * 删除缓存元数据
 */
export function deleteCacheMetadata(db, sn, type) {
  const stmt = db.prepare(`
    DELETE FROM ${CACHE_METADATA_TABLE}
    WHERE sn = ? AND type = ?
  `);
  stmt.run(sn, type);
}

/**
 * 检查缓存是否存在（通过元数据）
 */
export function checkCacheExists(db, sn, type) {
  const stmt = db.prepare(`
    SELECT 1 FROM ${CACHE_METADATA_TABLE}
    WHERE sn = ? AND type = ?
    LIMIT 1
  `);
  return stmt.get(sn, type) !== undefined;
}

/**
 * 批量检查缓存
 * @returns {Object} { cached: string[], uncached: string[] }
 */
export function checkCacheBatch(db, sns, type) {
  const cached = [];
  const uncached = [];

  // 构建批量查询
  const placeholders = sns.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT sn FROM ${CACHE_METADATA_TABLE}
    WHERE sn IN (${placeholders}) AND type = ?
  `);

  const cachedSet = new Set();
  const results = stmt.all(...sns, type);
  for (const row of results) {
    cachedSet.add(row.sn);
  }

  for (const sn of sns) {
    if (cachedSet.has(sn)) {
      cached.push(sn);
    } else {
      uncached.push(sn);
    }
  }

  return { cached, uncached };
}

/**
 * 获取缓存列表
 */
export function getCacheList(db, options = {}) {
  const { limit = 100, offset = 0, type = null, snLike = null } = options;

  let whereSql = '1=1';
  const params = [];

  if (type) {
    whereSql += ' AND type = ?';
    params.push(type);
  }

  if (snLike) {
    whereSql += ' AND sn LIKE ?';
    params.push(`%${snLike}%`);
  }

  const stmt = db.prepare(`
    SELECT sn, type, file_path, file_size, created_at, accessed_at
    FROM ${CACHE_METADATA_TABLE}
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);

  return stmt.all(...params, limit, offset);
}

/**
 * 获取缓存统计信息
 */
export function getCacheStatistics(db) {
  const stmt = db.prepare(`
    SELECT
      type,
      COUNT(*) as count,
      SUM(file_size) as total_size
    FROM ${CACHE_METADATA_TABLE}
    GROUP BY type
  `);

  const byType = stmt.all();
  const totalCount = byType.reduce((sum, row) => sum + row.count, 0);
  const totalSize = byType.reduce((sum, row) => sum + (row.total_size || 0), 0);

  return {
    totalCount,
    totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    byType
  };
}

/**
 * 删除缓存元数据并清理文件
 */
export function deleteCacheWithFile(db, sn, type, cacheDir) {
  const stmt = db.prepare(`
    SELECT file_path FROM ${CACHE_METADATA_TABLE}
    WHERE sn = ? AND type = ?
  `);
  const record = stmt.get(sn, type);

  if (record) {
    // 删除元数据
    deleteCacheMetadata(db, sn, type);

    // TODO: 删除文件（需要从 qrCache.js 导入删除函数）
  }

  return record !== undefined;
}

/**
 * 预热缓存 - 批量生成并缓存二维码
 * @param {Object} db - 数据库实例
 * @param {Array} sns - SN列表
 * @param {string} type - 二维码类型
 * @param {Function} generatorFn - 二维码生成函数
 * @param {string} cacheDir - 缓存目录
 * @param {Function} onProgress - 进度回调
 */
export async function preheatCache(db, sns, type, generatorFn, cacheDir, onProgress = null) {
  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  for (let i = 0; i < sns.length; i++) {
    const sn = sns[i];

    try {
      // 检查是否已缓存
      if (checkCacheExists(db, sn, type)) {
        results.skipped.push(sn);
      } else {
        // 生成二维码
        const buffer = await generatorFn(sn, type);

        // 保存到缓存
        await setQrToCache(sn, type, buffer, cacheDir);

        // TODO: 保存元数据（需要获取文件路径和大小）

        results.success.push(sn);
      }
    } catch (error) {
      console.error(`预热缓存失败 [${sn}]:`, error.message);
      results.failed.push({ sn, error: error.message });
    }

    // 报告进度
    if (onProgress) {
      onProgress(i + 1, sns.length, sn);
    }
  }

  return results;
}

/**
 * 迁移现有文件缓存到元数据表
 * 扫描缓存目录，将已存在的文件缓存记录到元数据表
 */
export function migrateFileCacheToMetadata(db, cacheDir) {
  if (!existsSync(cacheDir)) {
    return { imported: 0, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;

  try {
    // 读取缓存目录
    const entries = readdirSync(cacheDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const subDir = path.join(cacheDir, entry.name);

      try {
        const files = readdirSync(subDir);

        for (const file of files) {
          if (!file.endsWith('.png')) continue;

          // 解析文件名: {SN}_{type}.png
          const match = file.match(/^(.+)_(.+)\.png$/);
          if (!match) continue;

          const [, sn, type] = match;

          // 检查是否已存在
          if (checkCacheExists(db, sn, type)) {
            skipped++;
            continue;
          }

          // 获取文件信息
          const filePath = path.join(subDir, file);
          const stats = statSync(filePath);

          // 插入元数据
          saveCacheMetadata(db, sn, type, filePath, stats.size);
          imported++;
        }
      } catch (error) {
        console.error(`处理缓存目录 ${subDir} 失败:`, error.message);
      }
    }

    console.log(`缓存元数据迁移完成: 导入 ${imported} 条，跳过 ${skipped} 条`);
  } catch (error) {
    console.error('缓存元数据迁移失败:', error);
  }

  return { imported, skipped };
}
