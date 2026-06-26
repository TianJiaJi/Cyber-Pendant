const SN_RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export function generateSn(date = new Date()) {
  let randomPart = '';

  for (let index = 0; index < 6; index += 1) {
    randomPart +=
      SN_RANDOM_ALPHABET[Math.floor(Math.random() * SN_RANDOM_ALPHABET.length)];
  }

  return `CP${formatLocalDate(date)}${randomPart}`;
}

export function generateUniqueSn(db) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const sn = generateSn();
    const existing = db.prepare('SELECT id FROM garments WHERE sn = ?').get(sn);

    if (!existing) {
      return sn;
    }
  }

  throw new Error('Unable to generate a unique SN code.');
}

/**
 * 路径遍历危险字符模式
 * 用于检测和阻止包含路径遍历攻击的 SN
 */
const PATH_TRAVERSAL_PATTERN = /[..\\/]/;

/**
 * 标准化 SN 码
 *
 * 安全注意事项：
 * - 拒绝包含路径遍历字符的输入（.., /, \）
 * - 这可以防止在文件操作中使用恶意 SN 进行路径遍历攻击
 * - 例如：ZIP 导出时将 SN 作为文件名的情况
 *
 * @param {*} value - 要标准化的 SN 值
 * @returns {string} 标准化后的 SN，如果包含危险字符则抛出错误
 * @throws {Error} 如果 SN 包含路径遍历字符
 */
export function normalizeSn(value) {
  const sn = String(value || '').trim().toUpperCase();

  // 安全检查：拒绝路径遍历字符
  if (PATH_TRAVERSAL_PATTERN.test(sn)) {
    throw new Error('SN 包含非法字符（路径遍历字符）');
  }

  return sn;
}
