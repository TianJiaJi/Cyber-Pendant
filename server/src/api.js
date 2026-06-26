import { createReadStream, existsSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import archiver from 'archiver';
import QRCode from 'qrcode';
import ExcelJS from 'exceljs';
import {
  code2Openid,
  createToken,
  createUserToken,
  getWechatAccessToken,
  getWechatQRCode,
  getWechatUnlimitedQRCode,
  verifyPassword,
  verifyToken
} from './auth.js';
import { createConfig } from './config.js';
import {
  createRateLimit,
  escapeCsvValue,
  getClientId,
  setCorsHeaders,
  setSecurityHeaders,
  validatePasswordStrength
} from './security.js';
import {
  cleanupMemoryCache,
  deleteQrCode,
  getCacheKey,
  getCacheStats,
  getMemoryCacheInfo,
  getQrCode,
  MEMORY_CACHE_TTL,
  setQrCode
} from './qrCache.js';
import {
  completeProgress,
  createProgress,
  deleteProgress,
  failProgress,
  getAllProgress,
  getProgress,
  incrementProgress,
  updateProgress
} from './progressStore.js';
import {
  bindGarmentOwner,
  closeLostReport,
  createLostReport,
  deleteBatchHard,
  deleteClothingHard,
  deleteGarmentHard,
  exportRows,
  findAdminByUsername,
  findActiveLostReportByGarmentId,
  findBatchById,
  findClothingById,
  findGarmentBySn,
  findGarmentDetailBySn,
  findUserById,
  findUserByOpenid,
  sanitizeString,
  getAdminStats,
  incrementGarmentQueryCount,
  insertBatch,
  insertClothing,
  insertGarment,
  listAdminUsers,
  listBatchesByClothingId,
  listClothes,
  listGarments,
  listGarmentsByBatchId,
  listUserBindingLogs,
  listUserGarments,
  listUserLostReports,
  migrateDatabase,
  normalizeBatchInput,
  normalizeClothingInput,
  normalizeGarmentInput,
  openDatabase,
  recordContactReveal,
  setBatchStatus,
  setClothingStatus,
  setUserStatus,
  toBatchDto,
  toBindingLogDto,
  toClothingDto,
  toGarmentDto,
  toLostReportDto,
  toUserDto,
  unbindGarmentOwner,
  updateBatch,
  updateClothing,
  updateGarment,
  updateGarmentOwnerBinding,
  updateUserLastLogin,
  createUser,
  validateBatchForCreate,
  validateClothingForCreate,
  checkQrCacheBatch,
  deleteQrCache,
  getQrCacheStats,
  listQrCache
} from './db.js';
import { generateUniqueSn, normalizeSn } from './sn.js';

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// 速率限制器实例
const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  maxAttempts: 5,            // 最多5次失败尝试
  skipSuccessfulRequests: true
});

const apiRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1分钟
  maxAttempts: 100     // 每分钟100次请求
});

const contactRevealRateLimit = createRateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24小时
  maxAttempts: 10                 // 每天最多10次查看
});

const snQueryRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1分钟
  maxAttempts: 30     // 每分钟30次查询
});

const wechatLoginRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  maxAttempts: 20            // 每小时最多20次登录尝试
});

function sendJson(req, res, config, status, payload) {
  setSecurityHeaders(res, { isHttps: req.headers['x-forwarded-proto'] === 'https' });
  setCorsHeaders(req, res, config);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendNoContent(req, res, config) {
  setSecurityHeaders(res, { isHttps: req.headers['x-forwarded-proto'] === 'https' });
  setCorsHeaders(req, res, config);
  res.writeHead(204);
  res.end();
}

async function readJson(req) {
  let raw = '';

  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024 * 1024) {
      throw new HttpError(413, '请求体过大');
    }
  }

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, '请求体必须是 JSON 格式');
  }
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function requireAdmin(req, context) {
  const config = context.config;
  const token = bearerToken(req);
  const payload = verifyToken(token, config.tokenSecret);

  if (!payload || (payload.type && payload.type !== 'admin')) {
    throw new HttpError(401, '请先登录后台');
  }

  return payload;
}

function requireUser(req, context) {
  const config = context.config;
  const db = context.db;
  const token = bearerToken(req);
  const payload = verifyToken(token, config.userTokenSecret);

  if (!payload || payload.type !== 'user') {
    throw new HttpError(401, '请先登录');
  }

  // 检查用户状态（修复封禁绕过漏洞）
  const user = findUserById(db, payload.sub);
  if (!user) {
    throw new HttpError(401, '用户不存在');
  }
  if (user.status === 'banned') {
    throw new HttpError(403, '该账号已被禁用');
  }

  return payload;
}

function readActor(req, context) {
  const config = context.config;
  const db = context.db;
  const token = bearerToken(req);
  const user = verifyToken(token, config.userTokenSecret);

  if (user?.type === 'user') {
    // 检查用户状态（修复封禁绕过漏洞）
    const userData = findUserById(db, user.sub);
    if (!userData) {
      throw new HttpError(401, '用户不存在');
    }
    if (userData.status === 'banned') {
      throw new HttpError(403, '该账号已被禁用');
    }
    return { type: 'user', payload: user };
  }

  const admin = verifyToken(token, config.tokenSecret);
  if (admin && (!admin.type || admin.type === 'admin')) {
    return { type: 'admin', payload: admin };
  }

  throw new HttpError(401, '请先登录');
}

function requestMeta(req) {
  return {
    ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null
  };
}

function detailUrl(config, sn) {
  return `${config.frontendBaseUrl.replace(/\/$/, '')}/#/pages/garment/detail?sn=${encodeURIComponent(sn)}`;
}

function normalizeQrType(value) {
  if (value === 'sn') {
    return 'sn';
  }

  if (value === 'mini-program-square' || value === 'miniprogram-square') {
    return 'mini-program-square';
  }

  if (value === 'mini-program' || value === 'miniprogram') {
    return 'mini-program';
  }

  return 'url';
}

/**
 * 生成安全的 ZIP 文件名
 *
 * 防御路径遍历攻击：移除或替换所有可能被用于路径遍历的字符
 * 这是一个防御性安全措施，即使 SN 已经通过 normalizeSn() 验证
 *
 * @param {string} sn - SN 码
 * @returns {string} 安全的文件名
 */
function safeZipFileName(sn) {
  // 移除所有路径分隔符和点序列
  // Windows 路径分隔符: \ 和 /
  // Unix 路径分隔符: /
  // 路径遍历序列: .. 和 ...
  let safe = sn.replace(/[..\\/]/g, '_');

  // 移除控制字符
  safe = safe.replace(/[\x00-\x1f\x80-\x9f]/g, '_');

  // 移除 Windows 保留字符 (<>:"|?*)
  safe = safe.replace(/[<>:"|?*]/g, '_');

  // 确保文件名不为空
  if (!safe) {
    safe = 'invalid_sn';
  }

  return `${safe}.png`;
}

function parsePathSn(pathname, prefix) {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const value = pathname.slice(prefix.length);
  return value ? normalizeSn(decodeURIComponent(value)) : null;
}

function parsePathId(pathname, prefix) {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const value = pathname.slice(prefix.length);
  return /^\d+$/.test(value) ? Number(value) : null;
}

function parseClothingBatchesPath(pathname) {
  const match = pathname.match(/^\/api\/clothes\/(\d+)\/batches$/);
  return match ? Number(match[1]) : null;
}

function parseGarmentBindingPath(pathname) {
  const match = pathname.match(/^\/api\/garments\/([^/]+)\/binding$/);
  return match ? normalizeSn(decodeURIComponent(match[1])) : null;
}

function parseGarmentLostReportPath(pathname) {
  const match = pathname.match(/^\/api\/garments\/([^/]+)\/report-lost$/);
  return match ? normalizeSn(decodeURIComponent(match[1])) : null;
}

function parseGarmentContactRevealPath(pathname) {
  const match = pathname.match(/^\/api\/garments\/([^/]+)\/contact-reveal$/);
  return match ? normalizeSn(decodeURIComponent(match[1])) : null;
}

function readPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function wantsHardDelete(searchParams) {
  return searchParams.get('hard') === '1' || searchParams.get('hard') === 'true';
}

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function contentTypeFor(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function isWithinDirectory(rootDir, filePath) {
  const relative = path.relative(rootDir, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safeStaticPath(rootDir, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  if (decoded.includes('\0')) {
    return null;
  }

  const filePath = path.resolve(rootDir, decoded || 'index.html');
  return isWithinDirectory(rootDir, filePath) ? filePath : null;
}

function adminRelativePath(pathname, adminBasePath) {
  if (adminBasePath === '/') {
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return null;
    }

    return pathname.replace(/^\/+/, '') || 'index.html';
  }

  if (pathname === adminBasePath) {
    return '';
  }

  if (!pathname.startsWith(`${adminBasePath}/`)) {
    return null;
  }

  return pathname.slice(adminBasePath.length + 1) || 'index.html';
}

function sendAdminIndex(req, res, context) {
  const indexPath = path.join(context.config.adminStaticDir, 'index.html');

  if (!existsSync(indexPath)) {
    return false;
  }

  const runtimeConfig = {
    apiBaseUrl: '',
    frontendBaseUrl: context.config.frontendBaseUrl,
    adminBasePath: context.config.adminBasePath
  };
  const configScript = `<script>window.__CYBER_PENDANT_ADMIN_CONFIG__=${JSON.stringify(runtimeConfig).replace(/</g, '\\u003c')};</script>`;
  const html = readFileSync(indexPath, 'utf8');
  const body = html.includes('</head>')
    ? html.replace('</head>', `  ${configScript}\n  </head>`)
    : `${configScript}\n${html}`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  res.end(body);
  return true;
}

function sendStaticFile(req, res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const isHashedAsset = extension && !['.html'].includes(extension);

  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-store'
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  createReadStream(filePath)
    .on('error', () => {
      res.destroy();
    })
    .pipe(res);
  return true;
}

function handleAdminStatic(req, res, context, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  const relativePath = adminRelativePath(pathname, context.config.adminBasePath);
  if (relativePath === null) {
    return false;
  }

  if (relativePath === '') {
    const location =
      context.config.adminBasePath === '/' ? '/' : `${context.config.adminBasePath}/`;
    res.writeHead(308, { Location: location });
    res.end();
    return true;
  }

  const filePath = safeStaticPath(context.config.adminStaticDir, relativePath);
  if (!filePath) {
    throw new HttpError(404, '管理后台资源不存在');
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    if (path.basename(filePath) === 'index.html') {
      return sendAdminIndex(req, res, context);
    }

    return sendStaticFile(req, res, filePath);
  }

  if (path.extname(relativePath)) {
    throw new HttpError(404, '管理后台资源不存在');
  }

  if (sendAdminIndex(req, res, context)) {
    return true;
  }

  throw new HttpError(404, '管理后台尚未构建，请先运行 npm run build:admin');
}

function batchWithGarments(context, batch) {
  const garments = listGarmentsByBatchId(context.db, batch.id).map((row) =>
    toGarmentDto(row, { privateBinding: true })
  );
  return toBatchDto(batch, garments);
}

async function handleLogin(req, res, context) {
  const clientId = getClientId(req);

  // 检查登录限流
  const loginRateLimitResult = loginRateLimit.check(clientId);
  if (!loginRateLimitResult.allowed) {
    throw new HttpError(429, '登录尝试次数过多，请15分钟后再试');
  }

  const body = await readJson(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const admin = findAdminByUsername(context.db, username);

  if (!admin || !verifyPassword(password, admin.password_hash)) {
    // 记录失败尝试
    loginRateLimit.recordFailure(clientId);
    throw new HttpError(401, '用户名或密码错误');
  }

  // 成功登录，清除失败记录
  loginRateLimit.clear(clientId);

  const token = createToken(admin, context.config.tokenSecret);
  sendJson(req, res, context.config, 200, {
    token,
    user: {
      id: admin.id,
      username: admin.username,
      needsPasswordChange: Boolean(admin.force_password_change)
    }
  });
}

async function handleAdminPasswordChange(req, res, context) {
  const adminPayload = requireAdmin(req, context);
  const body = await readJson(req);

  const oldPassword = String(body.oldPassword || '');
  const newPassword = String(body.newPassword || '');

  if (!oldPassword) {
    throw new HttpError(400, '请输入当前密码');
  }

  if (!newPassword) {
    throw new HttpError(400, '请输入新密码');
  }

  // 验证当前密码
  const admin = findAdminByUsername(context.db, adminPayload.username);
  if (!admin || !verifyPassword(oldPassword, admin.password_hash)) {
    throw new HttpError(401, '当前密码错误');
  }

  // 验证新密码强度
  try {
    validatePasswordStrength(newPassword);
  } catch (error) {
    throw new HttpError(400, error.message);
  }

  // 检查新密码是否与当前密码相同
  if (oldPassword === newPassword) {
    throw new HttpError(400, '新密码不能与当前密码相同');
  }

  // 更新密码
  const timestamp = new Date().toISOString();
  context.db
    .prepare(
      'UPDATE admins SET password_hash = ?, force_password_change = 0, last_password_change = ? WHERE username = ?'
    )
    .get(hashPassword(newPassword), timestamp, adminPayload.username);

  sendJson(req, res, context.config, 200, {
    success: true,
    message: '密码修改成功'
  });
}

async function handleWechatLogin(req, res, context) {
  const clientId = getClientId(req);

  // 检查微信登录限流
  const rateLimitResult = wechatLoginRateLimit.check(clientId);
  if (!rateLimitResult.allowed) {
    throw new HttpError(429, '登录尝试次数过多，请稍后再试');
  }

  const body = await readJson(req);
  const code = String(body.code || '').trim();

  if (!code) {
    throw new HttpError(400, '缺少微信登录 code');
  }

  const code2Session = context.config.wechatCode2Session || code2Openid;
  let wechatResult;
  try {
    wechatResult = await code2Session(
      code,
      context.config.wechatAppId,
      context.config.wechatAppSecret
    );
  } catch (error) {
    wechatLoginRateLimit.recordFailure(clientId);
    throw new HttpError(error.status || 401, error.message || '微信登录失败', error.details);
  }

  if (wechatResult.errcode) {
    wechatLoginRateLimit.recordFailure(clientId);
    throw new HttpError(401, wechatResult.errmsg || '微信登录失败', {
      errcode: wechatResult.errcode
    });
  }

  const openid = String(wechatResult.openid || '').trim();
  if (!openid) {
    throw new HttpError(502, '微信登录未返回 openid');
  }

  let user = findUserByOpenid(context.db, openid);
  let isNewUser = false;

  if (!user) {
    user = createUser(context.db, {
      openid,
      nickname: '微信用户',
      status: 'active'
    });
    isNewUser = true;
  }

  if (user.status === 'banned') {
    throw new HttpError(403, '该用户已被禁用');
  }

  user = updateUserLastLogin(context.db, user.id);
  const token = createUserToken(
    user,
    context.config.userTokenSecret,
    context.config.userTokenTtlDays
  );

  sendJson(req, res, context.config, 200, {
    token,
    user: toUserDto(user),
    isNewUser
  });
}

function shouldTrackLookup(searchParams) {
  const track = searchParams.get('track');
  return track !== '0' && track !== 'false';
}

function normalizeBindingInput(body) {
  // 使用 sanitizeString 防止 XSS 攻击
  const studentName = sanitizeString(body.studentName || body.ownerName || '');
  const studentSchool = sanitizeString(body.studentSchool || body.school || '');
  const studentClass = sanitizeString(body.studentClass || body.className || '');
  const contactName = sanitizeString(body.contactName || '');
  const contactPhone = String(body.contactPhone || body.phone || '')
    .replace(/\D/g, '');

  if (!studentName) {
    throw new HttpError(400, '请输入学生姓名');
  }

  if (studentName.length > 24) {
    throw new HttpError(400, '学生姓名不能超过 24 个字符');
  }

  if (!studentSchool) {
    throw new HttpError(400, '请输入学校');
  }

  if (studentSchool.length > 80) {
    throw new HttpError(400, '学校不能超过 80 个字符');
  }

  if (!studentClass) {
    throw new HttpError(400, '请输入班级');
  }

  if (studentClass.length > 40) {
    throw new HttpError(400, '班级不能超过 40 个字符');
  }

  if (contactName && contactName.length > 24) {
    throw new HttpError(400, '联系人不能超过 24 个字符');
  }

  if (!/^\d{6,20}$/.test(contactPhone)) {
    throw new HttpError(400, '请输入 6-20 位联系电话');
  }

  return {
    studentName,
    studentSchool,
    studentClass,
    contactName,
    contactPhone,
    ownerName: studentName,
    ownerPhoneTail: contactPhone.slice(-4)
  };
}

function handlePublicGarment(req, res, context, sn, searchParams) {
  // 检查SN查询限流
  const clientId = getClientId(req);
  const rateLimitResult = snQueryRateLimit.check(clientId);
  if (!rateLimitResult.allowed) {
    throw new HttpError(429, '查询过于频繁，请稍后再试');
  }

  let viewerUserId = null;
  try {
    viewerUserId = requireUser(req, context).sub;
  } catch (error) {
    if (error.status !== 401) {
      throw error;
    }
  }

  let row = findGarmentDetailBySn(context.db, sn);

  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  if (shouldTrackLookup(searchParams)) {
    row = incrementGarmentQueryCount(context.db, sn);
  }

  const garment = toGarmentDto(row, {
    viewerUserId,
    showOwnerSummary: Boolean(viewerUserId)
  });
  if (garment.status !== 'active') {
    sendJson(req, res, context.config, 423, {
      message: '该吊牌已停用',
      garment
    });
    return;
  }

  sendJson(req, res, context.config, 200, { garment });
}

async function handleBindGarment(req, res, context, sn) {
  const userPayload = requireUser(req, context);
  const row = findGarmentDetailBySn(context.db, sn);

  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  const garment = toGarmentDto(row);
  if (garment.status !== 'active') {
    throw new HttpError(400, '该吊牌已停用，不能绑定学生信息');
  }

  if (garment.isBound) {
    throw new HttpError(409, '该吊牌已绑定学生信息');
  }

  const binding = normalizeBindingInput(await readJson(req));
  const updated = bindGarmentOwner(context.db, sn, binding, {
    userId: userPayload.sub,
    actorType: 'user',
    ...requestMeta(req)
  });

  if (!updated.changed) {
    throw new HttpError(409, '该吊牌已绑定学生信息');
  }

  sendJson(req, res, context.config, 200, {
    garment: toGarmentDto(updated.garment, {
      privateBinding: true,
      viewerUserId: userPayload.sub
    })
  });
}

async function handleUpdateBinding(req, res, context, sn) {
  const userPayload = requireUser(req, context);
  const row = findGarmentDetailBySn(context.db, sn);

  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  if (!row.owner_bound_at || !row.bound_by_user_id) {
    throw new HttpError(409, '该吊牌尚未绑定学生信息');
  }

  if (Number(row.bound_by_user_id) !== Number(userPayload.sub)) {
    throw new HttpError(403, '只有绑定用户可以修改绑定信息');
  }

  const binding = normalizeBindingInput(await readJson(req));
  const updated = updateGarmentOwnerBinding(context.db, sn, binding, {
    userId: userPayload.sub,
    actorType: 'user',
    ...requestMeta(req)
  });

  sendJson(req, res, context.config, 200, {
    garment: toGarmentDto(updated.garment, {
      privateBinding: true,
      viewerUserId: userPayload.sub
    })
  });
}

function handleUnbindGarment(req, res, context, sn) {
  const actor = readActor(req, context);
  const row = findGarmentDetailBySn(context.db, sn);

  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  if (
    actor.type === 'user' &&
    (!row.bound_by_user_id || Number(row.bound_by_user_id) !== Number(actor.payload.sub))
  ) {
    throw new HttpError(403, '只有绑定用户可以解绑');
  }

  const updated = unbindGarmentOwner(context.db, sn, {
    userId: actor.type === 'user' ? actor.payload.sub : row.bound_by_user_id,
    actorType: actor.type,
    ...requestMeta(req)
  });
  sendJson(req, res, context.config, 200, {
    garment: toGarmentDto(updated.garment, {
      privateBinding: true,
      viewerUserId: actor.type === 'user' ? actor.payload.sub : null
    })
  });
}

function handleUserGarments(req, res, context) {
  const userPayload = requireUser(req, context);
  const garments = listUserGarments(context.db, userPayload.sub).map((row) =>
    toGarmentDto(row, {
      viewerUserId: userPayload.sub,
      showOwnerSummary: true
    })
  );

  sendJson(req, res, context.config, 200, { garments });
}

function handleUserBindingLogs(req, res, context) {
  const userPayload = requireUser(req, context);
  const logs = listUserBindingLogs(context.db, userPayload.sub).map(toBindingLogDto);

  sendJson(req, res, context.config, 200, { logs });
}

function handleUserLostReports(req, res, context) {
  const userPayload = requireUser(req, context);
  const reports = listUserLostReports(context.db, userPayload.sub).map(toLostReportDto);

  sendJson(req, res, context.config, 200, { reports });
}

async function handleCreateLostReport(req, res, context, sn) {
  const userPayload = requireUser(req, context);
  const row = findGarmentDetailBySn(context.db, sn);

  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  if (!row.bound_by_user_id || Number(row.bound_by_user_id) !== Number(userPayload.sub)) {
    throw new HttpError(403, '只有绑定用户可以报告丢失');
  }

  const body = await readJson(req);
  const report = createLostReport(context.db, sn, userPayload.sub, body.note);
  const garment = findGarmentDetailBySn(context.db, sn);

  sendJson(req, res, context.config, 201, {
    report: toLostReportDto(report),
    garment: toGarmentDto(garment, {
      viewerUserId: userPayload.sub,
      showOwnerSummary: true
    })
  });
}

function handleCloseLostReport(req, res, context, sn) {
  const actor = readActor(req, context);
  const row = findGarmentDetailBySn(context.db, sn);

  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  const activeReport = findActiveLostReportByGarmentId(context.db, row.id);
  if (!activeReport) {
    throw new HttpError(404, '没有有效的丢失报告');
  }

  if (
    actor.type === 'user' &&
    Number(activeReport.reporter_id) !== Number(actor.payload.sub)
  ) {
    throw new HttpError(403, '只有报告用户可以取消报失');
  }

  const report = closeLostReport(context.db, sn, {
    status: 'cancelled',
    reason: actor.type === 'admin' ? 'admin_cancelled' : 'cancelled'
  });

  sendJson(req, res, context.config, 200, { report: toLostReportDto(report) });
}

async function handleContactReveal(req, res, context, sn) {
  const userPayload = requireUser(req, context);

  // 检查联系方式查看限流
  const rateLimitResult = contactRevealRateLimit.check(String(userPayload.sub));
  if (!rateLimitResult.allowed) {
    throw new HttpError(429, '今日查看次数已达上限，请明天再试');
  }

  const row = findGarmentDetailBySn(context.db, sn);
  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  const activeReport = findActiveLostReportByGarmentId(context.db, row.id);
  if (!activeReport) {
    throw new HttpError(404, '没有有效的丢失报告');
  }

  const body = await readJson(req);
  const updated = recordContactReveal(context.db, sn, {
    userId: userPayload?.sub,
    source: body.source,
    ...requestMeta(req)
  });

  // 记录一次查看
  contactRevealRateLimit.recordHit(String(userPayload.sub));

  const garment = toGarmentDto(updated, {
    viewerUserId: userPayload.sub,
    showContact: true
  });

  sendJson(req, res, context.config, 200, {
    contact: {
      studentName: garment.owner?.studentName || null,
      school: garment.owner?.school || null,
      className: garment.owner?.className || null,
      contactName: garment.owner?.contactName || null,
      contactPhone: garment.owner?.contactPhone || null
    },
    garment
  });
}

function sendCsv(req, res, context, filename, rows) {
  setSecurityHeaders(res, { isHttps: req.headers['x-forwarded-proto'] === 'https' });
  setCorsHeaders(req, res, context.config);
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const body = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(','))
  ].join('\n');

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`
  });
  res.end(`\uFEFF${body}`);
}

function handleAdminUsers(req, res, context) {
  requireAdmin(req, context);
  const users = listAdminUsers(context.db).map(toUserDto);
  sendJson(req, res, context.config, 200, { users });
}

function handleAdminUserDetail(req, res, context, userId) {
  requireAdmin(req, context);
  const user = findUserById(context.db, userId);

  if (!user) {
    throw new HttpError(404, '未找到用户');
  }

  sendJson(req, res, context.config, 200, { user: toUserDto(user) });
}

function handleAdminUserStatus(req, res, context, userId, status) {
  requireAdmin(req, context);
  const user = setUserStatus(context.db, userId, status);

  if (!user) {
    throw new HttpError(404, '未找到用户');
  }

  sendJson(req, res, context.config, 200, { user: toUserDto(user) });
}

function handleAdminStats(req, res, context) {
  requireAdmin(req, context);
  sendJson(req, res, context.config, 200, getAdminStats(context.db));
}

function handleAdminExport(req, res, context, type) {
  requireAdmin(req, context);
  const rows = exportRows(context.db, type);

  if (!rows) {
    throw new HttpError(404, '不支持的导出类型');
  }

  sendCsv(req, res, context, `${type}.csv`, rows);
}

async function handleCreateClothing(req, res, context) {
  requireAdmin(req, context);
  const body = await readJson(req);
  const clothing = normalizeClothingInput(body);
  const validationError = validateClothingForCreate(clothing);

  if (validationError) {
    throw new HttpError(400, validationError);
  }

  const created = insertClothing(context.db, clothing);
  sendJson(req, res, context.config, 201, { clothing: toClothingDto(created) });
}

async function handleUpdateClothing(req, res, context, clothingId) {
  requireAdmin(req, context);
  const existing = findClothingById(context.db, clothingId);

  if (!existing) {
    throw new HttpError(404, '未找到该衣服');
  }

  const body = await readJson(req);
  const patch = normalizeClothingInput(body, { partial: true });
  const merged = normalizeClothingInput({ ...existing, ...body });
  const validationError = validateClothingForCreate(merged);

  if (validationError) {
    throw new HttpError(400, validationError);
  }

  const updated = updateClothing(context.db, clothingId, patch);
  sendJson(req, res, context.config, 200, { clothing: toClothingDto(updated) });
}

function handleDeleteClothing(req, res, context, clothingId, searchParams) {
  requireAdmin(req, context);
  const existing = findClothingById(context.db, clothingId);

  if (!existing) {
    throw new HttpError(404, '未找到该衣服');
  }

  if (wantsHardDelete(searchParams)) {
    deleteClothingHard(context.db, clothingId);
    sendJson(req, res, context.config, 200, { ok: true, deleted: 'hard' });
    return;
  }

  const updated = setClothingStatus(context.db, clothingId, 'inactive');
  sendJson(req, res, context.config, 200, {
    ok: true,
    deleted: 'soft',
    clothing: toClothingDto(updated)
  });
}

async function handleCreateBatch(req, res, context, clothingId) {
  requireAdmin(req, context);
  const clothing = findClothingById(context.db, clothingId);

  if (!clothing) {
    throw new HttpError(404, '未找到该衣服');
  }

  if (clothing.status !== 'active') {
    throw new HttpError(400, '该衣服已停用，不能生成新批次');
  }

  const body = await readJson(req);
  const count = readPositiveInteger(body.count);

  if (!count) {
    throw new HttpError(400, '生成数量必须大于 0');
  }

  if (count > 10000) {
    throw new HttpError(400, '单次最多生成 10000 个吊牌');
  }

  const batchInput = {
    ...normalizeBatchInput(body),
    clothing_id: clothing.id,
    status: 'active'
  };
  const validationError = validateBatchForCreate(batchInput);

  if (validationError) {
    throw new HttpError(400, validationError);
  }

  let batch;
  context.db.exec('BEGIN IMMEDIATE;');
  try {
    batch = insertBatch(context.db, batchInput);
    for (let index = 0; index < count; index += 1) {
      insertGarment(context.db, generateUniqueSn(context.db), {
        clothing_id: clothing.id,
        batch_id: batch.id,
        status: 'active'
      });
    }
    context.db.exec('COMMIT;');
  } catch (error) {
    context.db.exec('ROLLBACK;');
    throw error;
  }

  sendJson(req, res, context.config, 201, { batch: batchWithGarments(context, batch) });
}

async function handleUpdateBatch(req, res, context, batchId) {
  requireAdmin(req, context);
  const existing = findBatchById(context.db, batchId);

  if (!existing) {
    throw new HttpError(404, '未找到该批次');
  }

  const body = await readJson(req);
  const patch = normalizeBatchInput(body, { partial: true });
  const updated = updateBatch(context.db, batchId, patch);
  sendJson(req, res, context.config, 200, {
    batch: batchWithGarments(context, updated)
  });
}

function handleDeleteBatch(req, res, context, batchId, searchParams) {
  requireAdmin(req, context);
  const existing = findBatchById(context.db, batchId);

  if (!existing) {
    throw new HttpError(404, '未找到该批次');
  }

  if (wantsHardDelete(searchParams)) {
    deleteBatchHard(context.db, batchId);
    sendJson(req, res, context.config, 200, { ok: true, deleted: 'hard' });
    return;
  }

  const updated = setBatchStatus(context.db, batchId, 'inactive');
  sendJson(req, res, context.config, 200, {
    ok: true,
    deleted: 'soft',
    batch: batchWithGarments(context, updated)
  });
}

async function handleCreateGarment(req, res, context) {
  requireAdmin(req, context);
  const body = await readJson(req);
  const sn = normalizeSn(body.sn) || generateUniqueSn(context.db);

  if (findGarmentBySn(context.db, sn)) {
    throw new HttpError(409, 'SN 码已存在');
  }

  const clothing = normalizeClothingInput(body);
  const clothingValidationError = validateClothingForCreate(clothing);

  if (clothingValidationError) {
    throw new HttpError(400, clothingValidationError);
  }

  const batch = normalizeBatchInput(body);
  const batchValidationError = validateBatchForCreate(batch);

  if (batchValidationError) {
    throw new HttpError(400, batchValidationError);
  }

  let created;
  context.db.exec('BEGIN IMMEDIATE;');
  try {
    const clothingRow = insertClothing(context.db, clothing);
    const batchRow = insertBatch(context.db, {
      ...batch,
      clothing_id: clothingRow.id,
      status: 'active'
    });
    created = insertGarment(context.db, sn, {
      clothing_id: clothingRow.id,
      batch_id: batchRow.id,
      status: 'active'
    });
    context.db.exec('COMMIT;');
  } catch (error) {
    context.db.exec('ROLLBACK;');
    throw error;
  }

  sendJson(req, res, context.config, 201, {
    garment: toGarmentDto(findGarmentDetailBySn(context.db, created.sn), {
      privateBinding: true
    })
  });
}

async function handleUpdateGarment(req, res, context, sn) {
  requireAdmin(req, context);
  const existing = findGarmentBySn(context.db, sn);

  if (!existing) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  const body = await readJson(req);
  const patch = normalizeGarmentInput(body, { partial: true });
  const updated = updateGarment(context.db, sn, patch);

  sendJson(req, res, context.config, 200, {
    garment: toGarmentDto(updated, { privateBinding: true })
  });
}

function handleDeleteGarment(req, res, context, sn, searchParams) {
  requireAdmin(req, context);
  const existing = findGarmentBySn(context.db, sn);

  if (!existing) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  if (wantsHardDelete(searchParams)) {
    deleteGarmentHard(context.db, sn);
    sendJson(req, res, context.config, 200, { ok: true, deleted: 'hard' });
    return;
  }

  const updated = updateGarment(context.db, sn, { status: 'inactive' });
  sendJson(req, res, context.config, 200, {
    ok: true,
    deleted: 'soft',
    garment: toGarmentDto(updated, { privateBinding: true })
  });
}

async function handleQrCode(req, res, context, sn, searchParams) {
  const row = findGarmentDetailBySn(context.db, sn);

  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  const type = normalizeQrType(searchParams.get('type'));

  // 先尝试从缓存获取
  const cached = await getQrCode(context.db, sn, type);
  if (cached) {
    console.log(`[QR Cache] HIT: ${sn} (${type})`);
    setCorsHeaders(req, res, context.config);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400'  // 浏览器缓存1天
    });
    res.end(cached);
    return;
  }

  console.log(`[QR Cache] MISS: ${sn} (${type}), generating...`);

  // 缓存未命中，生成二维码
  let qrImage;

  // 微信小程序码（圆形）：使用微信 getwxacodeunlimit 接口生成
  if (type === 'mini-program') {
    let fetchError = null;

    const hasValidWechatConfig =
      context.config.wechatAppId &&
      context.config.wechatAppSecret &&
      typeof context.config.wechatAppId === 'string' &&
      typeof context.config.wechatAppSecret === 'string' &&
      context.config.wechatAppId.trim() !== '' &&
      context.config.wechatAppSecret.trim() !== '';

    if (hasValidWechatConfig) {
      try {
        let accessToken;
        if (context.config.wechatAccessTokenProvider) {
          const tokenResult = await context.config.wechatAccessTokenProvider();
          accessToken = tokenResult.accessToken;
        } else {
          const tokenResult = await getWechatAccessToken(
            context.config.wechatAppId,
            context.config.wechatAppSecret,
            fetch
          );
          accessToken = tokenResult.accessToken;
        }

        // 生成圆形小程序码，使用 scene 参数传递 SN
        const qrFetchImpl = context.config.wechatMiniProgramCodeProvider || fetch;
        const qrResult = await getWechatUnlimitedQRCode(
          {
            accessToken,
            scene: sn,
            page: context.config.wechatQrPage || 'pages/garment/detail',
            checkPath: context.config.wechatQrCheckPath || false,
            envVersion: context.config.wechatQrEnvVersion || 'release',
            width: context.config.wechatQrWidth || 430
          },
          qrFetchImpl
        );
        qrImage = qrResult.buffer;
      } catch (error) {
        fetchError = error;
      }
    } else {
      fetchError = new Error('微信小程序配置缺失或不完整');
    }

    if (fetchError || !qrImage) {
      console.log('Mini-program QR code generation failed, falling back to traditional QR:', fetchError?.message);
      const fallbackContent = detailUrl(context.config, sn);
      qrImage = await QRCode.toBuffer(fallbackContent, {
        type: 'png',
        width: 512,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#161616',
          light: '#ffffff'
        }
      });
    }

    // 保存到缓存
    await setQrCode(context.db, sn, type, qrImage);

    console.log(`[QR Cache] SAVED: ${sn} (${type})`);

    setCorsHeaders(req, res, context.config);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(qrImage);
    return;
  }

  // 微信小程序正方形二维码：使用微信API生成
  if (type === 'mini-program-square') {
    let fetchError = null;

    const hasValidWechatConfig =
      context.config.wechatAppId &&
      context.config.wechatAppSecret &&
      typeof context.config.wechatAppId === 'string' &&
      typeof context.config.wechatAppSecret === 'string' &&
      context.config.wechatAppId.trim() !== '' &&
      context.config.wechatAppSecret.trim() !== '';

    if (hasValidWechatConfig) {
      try {
        let accessToken;
        if (context.config.wechatAccessTokenProvider) {
          const tokenResult = await context.config.wechatAccessTokenProvider();
          accessToken = tokenResult.accessToken;
        } else {
          const tokenResult = await getWechatAccessToken(
            context.config.wechatAppId,
            context.config.wechatAppSecret,
            fetch
          );
          accessToken = tokenResult.accessToken;
        }

        const qrFetchImpl = context.config.wechatMiniProgramCodeProvider || fetch;
        const qrResult = await getWechatQRCode(
          {
            accessToken,
            path: `${context.config.wechatQrPage || 'pages/garment/detail'}?sn=${sn}`,
            width: context.config.wechatQrWidth || 430
          },
          qrFetchImpl
        );
        qrImage = qrResult.buffer;
      } catch (error) {
        fetchError = error;
      }
    } else {
      fetchError = new Error('微信小程序配置缺失或不完整');
    }

    if (fetchError || !qrImage) {
      console.log('Mini-program square QR code generation failed, falling back to traditional QR:', fetchError?.message);
      const fallbackContent = detailUrl(context.config, sn);
      qrImage = await QRCode.toBuffer(fallbackContent, {
        type: 'png',
        width: 512,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#161616',
          light: '#ffffff'
        }
      });
    }

    // 保存到缓存
    await setQrCode(context.db, sn, type, qrImage);

    console.log(`[QR Cache] SAVED: ${sn} (${type})`);

    setCorsHeaders(req, res, context.config);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(qrImage);
    return;
  }

  // 传统二维码（SN 或 URL）
  const content = type === 'sn' ? sn : detailUrl(context.config, sn);
  qrImage = await QRCode.toBuffer(content, {
    type: 'png',
    width: 512,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#161616',
      light: '#ffffff'
    }
  });

  // 保存到缓存
  await setQrCode(context.db, sn, type, qrImage);

  setCorsHeaders(req, res, context.config);
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=86400'
  });
  res.end(qrImage);
}

/**
 * SSE 进度推送端点
 * @param {Object} req - HTTP请求
 * @param {Object} res - HTTP响应
 * @param {string} progressId - 进度ID
 */
function handleProgressSse(req, res, progressId) {
  const progress = getProgress(progressId);
  if (!progress) {
    sendJson(req, res, context.config, 404, { message: '进度任务不存在' });
    return;
  }

  // 设置 SSE 响应头
  setSecurityHeaders(res, { isHttps: req.headers['x-forwarded-proto'] === 'https' });
  setCorsHeaders(req, res, context.config);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // 发送初始状态
  res.write(`data: ${JSON.stringify(progress)}\n\n`);

  // 定期检查并发送进度更新
  const interval = setInterval(() => {
    const currentProgress = getProgress(progressId);

    if (!currentProgress) {
      // 进度任务已被删除
      clearInterval(interval);
      res.write('event: error\ndata: {"error":"进度任务已不存在"}\n\n');
      res.end();
      return;
    }

    // 发送当前进度
    res.write(`data: ${JSON.stringify(currentProgress)}\n\n`);

    // 如果已完成或失败，关闭连接
    if (currentProgress.status === 'completed' || currentProgress.status === 'failed') {
      clearInterval(interval);
      res.end();
    }
  }, 200); // 每200毫秒推送一次

  // 客户端断开连接时清理
  req.on('close', () => {
    clearInterval(interval);
  });
}

async function handleBatchQrCodes(req, res, context, searchParams) {
  requireAdmin(req, context);

  const batchId = readPositiveInteger(searchParams.get('batchId'));
  const type = normalizeQrType(searchParams.get('type')) || 'url';
  const progressId = searchParams.get('progressId') || null;

  if (!batchId) {
    throw new HttpError(400, '缺少批次ID');
  }

  const batch = findBatchById(context.db, batchId);
  if (!batch) {
    throw new HttpError(404, '未找到该批次');
  }

  const garments = listGarmentsByBatchId(context.db, batchId);
  if (!garments || garments.length === 0) {
    throw new HttpError(404, '该批次没有吊牌');
  }

  // 初始化进度跟踪
  if (progressId) {
    updateProgress(progressId, {
      status: 'processing',
      total: garments.length,
      current: 0,
      message: '正在生成二维码...'
    });
  }

  // 检查微信小程序码配置
  const hasValidWechatConfig =
    context.config.wechatAppId &&
    context.config.wechatAppSecret &&
    typeof context.config.wechatAppId === 'string' &&
    typeof context.config.wechatAppSecret === 'string' &&
    context.config.wechatAppId.trim() !== '' &&
    context.config.wechatAppSecret.trim() !== '';

  if ((type === 'mini-program' || type === 'mini-program-square') && !hasValidWechatConfig) {
    if (progressId) {
      failProgress(progressId, '微信小程序配置缺失，无法生成小程序码');
    }
    throw new HttpError(400, '微信小程序配置缺失，无法生成小程序码');
  }

  // 创建ZIP流
  const zip = archiver('zip', { zlib: { level: 9 } });
  const zipFileName = `batch-${batchId}-qrcodes-${type}.zip`;

  // 设置响应头
  setCorsHeaders(req, res, context.config);
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipFileName)}`
  });

  // 将ZIP输出流连接到响应
  zip.pipe(res);

  // 错误处理
  zip.on('error', (err) => {
    console.error('ZIP creation error:', err);
    if (progressId) {
      failProgress(progressId, 'ZIP文件生成失败');
    }
    if (!res.headersSent) {
      sendJson(req, res, context.config, 500, { message: 'ZIP文件生成失败' });
    }
  });

  try {
    // 获取access_token（如果需要生成小程序码）
    let accessToken = null;
    if (type === 'mini-program' || type === 'mini-program-square') {
      try {
        if (context.config.wechatAccessTokenProvider) {
          const tokenResult = await context.config.wechatAccessTokenProvider();
          accessToken = tokenResult.accessToken;
        } else {
          const tokenResult = await getWechatAccessToken(
            context.config.wechatAppId,
            context.config.wechatAppSecret,
            fetch
          );
          accessToken = tokenResult.accessToken;
        }
      } catch (error) {
        if (progressId) {
          failProgress(progressId, '获取微信access_token失败');
        }
        throw new HttpError(502, '获取微信access_token失败');
      }
    }

    // 逐个生成二维码并添加到ZIP
    for (let i = 0; i < garments.length; i++) {
      const garment = garments[i];
      const sn = garment.sn;
      let qrBuffer;

      // 先尝试从缓存获取
      const cached = await getQrCode(context.db, sn, type);
      if (cached) {
        console.log(`[ZIP Export] Cache HIT: ${sn} (${type})`);
        qrBuffer = cached;
      } else {
        console.log(`[ZIP Export] Cache MISS: ${sn} (${type}), generating...`);
        // 缓存未命中，生成二维码
        if (type === 'mini-program') {
          try {
            // 生成圆形小程序码，使用 scene 参数传递 SN
            const qrResult = await getWechatUnlimitedQRCode(
              {
                accessToken,
                scene: sn,
                page: context.config.wechatQrPage || 'pages/garment/detail',
                checkPath: context.config.wechatQrCheckPath || false,
                envVersion: context.config.wechatQrEnvVersion || 'release',
                width: context.config.wechatQrWidth || 430
              },
              fetch
            );
            qrBuffer = qrResult.buffer;
          } catch (error) {
            console.error(`Failed to generate mini-program QR for ${sn}:`, error.message);
            // 回退到传统二维码
            const fallbackUrl = detailUrl(context.config, sn);
            qrBuffer = await QRCode.toBuffer(fallbackUrl, {
              type: 'png',
              width: 512,
              margin: 1,
              errorCorrectionLevel: 'M',
              color: { dark: '#161616', light: '#ffffff' }
            });
          }
        } else if (type === 'mini-program-square') {
          try {
            const qrResult = await getWechatQRCode(
              {
                accessToken,
                path: `${context.config.wechatQrPage || 'pages/garment/detail'}?sn=${sn}`,
                width: context.config.wechatQrWidth || 430
              },
              fetch
            );
            qrBuffer = qrResult.buffer;
          } catch (error) {
            console.error(`Failed to generate mini-program square QR for ${sn}:`, error.message);
            const fallbackUrl = detailUrl(context.config, sn);
            qrBuffer = await QRCode.toBuffer(fallbackUrl, {
              type: 'png',
              width: 512,
              margin: 1,
              errorCorrectionLevel: 'M',
              color: { dark: '#161616', light: '#ffffff' }
            });
          }
        } else {
          // 传统二维码（SN 或 URL）
          const content = type === 'sn' ? sn : detailUrl(context.config, sn);
          qrBuffer = await QRCode.toBuffer(content, {
            type: 'png',
            width: 512,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#161616', light: '#ffffff' }
          });
        }

        // 保存到缓存（异步操作，不阻塞 ZIP 流）
        setQrCode(context.db, sn, type, qrBuffer).catch((err) => {
          console.error(`缓存二维码 ${sn} 失败:`, err.message);
        });
        console.log(`[ZIP Export] Cached: ${sn} (${type})`);
      }

      // 添加到ZIP（使用安全的文件名）
      zip.append(qrBuffer, { name: safeZipFileName(sn) });

      // 更新进度
      if (progressId) {
        incrementProgress(progressId, 1);
      }
    }

    // 完成ZIP
    zip.finalize();

    // 标记进度完成
    if (progressId) {
      completeProgress(progressId, 'ZIP文件生成完成');
    }
  } catch (error) {
    console.error('Batch QR code generation error:', error);
    if (progressId) {
      failProgress(progressId, error.message || '批量生成二维码失败');
    }
    if (!res.headersSent) {
      sendJson(req, res, context.config, 500, { message: error.message || '批量生成二维码失败' });
    } else {
      res.destroy();
    }
  }
}

/**
 * 处理Excel导出（包含二维码图片）
 */
async function handleExcelExportWithQrCodes(req, res, context) {
  requireAdmin(req, context);
  const body = await readJson(req);

  const { garments, qrMode, includeQrImages, batchId, clothing } = body;
  const type = normalizeQrType(qrMode) || 'url';

  if (!Array.isArray(garments) || garments.length === 0) {
    throw new HttpError(400, '请提供导出数据');
  }

  // 创建 Excel 工作簿
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('批次吊牌码');

  // 定义列
  const columns = [
    { header: '衣服名称', key: 'clothingName', width: 20 },
    { header: '执行标准', key: 'standard', width: 30 },
    { header: '款号', key: 'styleNo', width: 14 },
    { header: '颜色', key: 'color', width: 10 },
    { header: '尺码', key: 'size', width: 8 },
    { header: 'SN', key: 'sn', width: 20 },
    { header: '批次标签', key: 'batchNo', width: 18 },
    { header: '生产日期', key: 'productionDate', width: 12 },
    { header: '详情页链接', key: 'detailUrl', width: 40 },
    { header: '二维码模式', key: 'qrModeLabel', width: 14 },
    { header: '二维码链接', key: 'qrUrl', width: 50 }
  ];

  if (includeQrImages) {
    columns.push({ header: '二维码', key: 'qrImage', width: 15 });
  }

  worksheet.columns = columns;

  // 添加数据行
  for (let i = 0; i < garments.length; i++) {
    const record = garments[i];
    const sn = record.sn;

    // 获取二维码图片（从缓存或生成）
    let qrBuffer = null;
    if (includeQrImages) {
      qrBuffer = await getOrGenerateQrCode(context, sn, type);
    }

    // 构建行数据
    const rowData = {
      clothingName: clothing?.productName || record.productName || '',
      standard: formatStandardValue(clothing?.standard || record.standard || ''),
      styleNo: record.styleNo || '',
      color: record.color || '',
      size: record.size || '',
      sn,
      batchNo: record.batchNo || '',
      productionDate: record.productionDate || '',
      detailUrl: `${context.config.frontendBaseUrl}/#/pages/garment/detail?sn=${encodeURIComponent(sn)}`,
      qrModeLabel: getQrModeLabel(type),
      qrUrl: `${context.config.apiBaseUrl}/api/qrcode/${encodeURIComponent(sn)}?type=${type}`
    };

    worksheet.addRow(rowData);

    // 添加二维码图片
    if (includeQrImages && qrBuffer) {
      const imageId = workbook.addImage({
        buffer: qrBuffer,
        extension: 'png'
      });

      worksheet.addImage(imageId, {
        tl: { col: columns.length - 1, row: i + 1 },
        ext: { width: 100, height: 100 }
      });
    }
  }

  // 设置行高
  if (includeQrImages) {
    for (let i = 2; i <= garments.length + 1; i++) {
      worksheet.getRow(i).height = 80;
    }
  }

  // 生成文件
  const buffer = await workbook.xlsx.writeBuffer();

  setCorsHeaders(req, res, context.config);
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`吊牌码-${batchId || 'export'}.xlsx`)}`
  });
  res.end(buffer);
}

/**
 * 获取或生成二维码
 */
async function getOrGenerateQrCode(context, sn, type) {
  // 先尝试从缓存获取
  let qrBuffer = await getQrCode(context.db, sn, type);

  if (!qrBuffer) {
    // 缓存未命中，生成二维码
    qrBuffer = await generateQrCodeImpl(context, sn, type);
    // 保存到缓存
    if (qrBuffer) {
      await setQrCode(context.db, sn, type, qrBuffer);
    }
  }

  return qrBuffer;
}

/**
 * 生成二维码实现
 */
async function generateQrCodeImpl(context, sn, type) {
  const fallbackContent = detailUrl(context.config, sn);

  // 微信小程序码（圆形）
  if (type === 'mini-program') {
    const hasValidWechatConfig =
      context.config.wechatAppId &&
      context.config.wechatAppSecret &&
      typeof context.config.wechatAppId === 'string' &&
      typeof context.config.wechatAppSecret === 'string' &&
      context.config.wechatAppId.trim() !== '' &&
      context.config.wechatAppSecret.trim() !== '';

    if (hasValidWechatConfig) {
      try {
        let accessToken;
        if (context.config.wechatAccessTokenProvider) {
          const tokenResult = await context.config.wechatAccessTokenProvider();
          accessToken = tokenResult.accessToken;
        } else {
          const tokenResult = await getWechatAccessToken(
            context.config.wechatAppId,
            context.config.wechatAppSecret,
            fetch
          );
          accessToken = tokenResult.accessToken;
        }

        const qrResult = await getWechatUnlimitedQRCode(
          {
            accessToken,
            scene: sn,
            page: context.config.wechatQrPage || 'pages/garment/detail',
            checkPath: context.config.wechatQrCheckPath || false,
            envVersion: context.config.wechatQrEnvVersion || 'release',
            width: context.config.wechatQrWidth || 430
          },
          fetch
        );
        return qrResult.buffer;
      } catch (error) {
        console.log(`Mini-program QR code generation failed for ${sn}, falling back to traditional QR:`, error.message);
      }
    }
    // 回退到传统二维码
    return await QRCode.toBuffer(fallbackContent, {
      type: 'png',
      width: 512,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#161616', light: '#ffffff' }
    });
  }

  // 微信小程序正方形二维码
  if (type === 'mini-program-square') {
    const hasValidWechatConfig =
      context.config.wechatAppId &&
      context.config.wechatAppSecret &&
      typeof context.config.wechatAppId === 'string' &&
      typeof context.config.wechatAppSecret === 'string' &&
      context.config.wechatAppId.trim() !== '' &&
      context.config.wechatAppSecret.trim() !== '';

    if (hasValidWechatConfig) {
      try {
        let accessToken;
        if (context.config.wechatAccessTokenProvider) {
          const tokenResult = await context.config.wechatAccessTokenProvider();
          accessToken = tokenResult.accessToken;
        } else {
          const tokenResult = await getWechatAccessToken(
            context.config.wechatAppId,
            context.config.wechatAppSecret,
            fetch
          );
          accessToken = tokenResult.accessToken;
        }

        const qrResult = await getWechatQRCode(
          {
            accessToken,
            path: `${context.config.wechatQrPage || 'pages/garment/detail'}?sn=${sn}`,
            width: context.config.wechatQrWidth || 430
          },
          fetch
        );
        return qrResult.buffer;
      } catch (error) {
        console.log(`Mini-program square QR code generation failed for ${sn}, falling back to traditional QR:`, error.message);
      }
    }
    // 回退到传统二维码
    return await QRCode.toBuffer(fallbackContent, {
      type: 'png',
      width: 512,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#161616', light: '#ffffff' }
    });
  }

  // 传统二维码（SN 或 URL）
  if (type === 'sn') {
    return await QRCode.toBuffer(sn, {
      type: 'png',
      width: 512,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#161616', light: '#ffffff' }
    });
  }

  // 默认 URL 二维码
  return await QRCode.toBuffer(fallbackContent, {
    type: 'png',
    width: 512,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#161616', light: '#ffffff' }
  });
}

/**
 * 获取二维码模式标签
 */
function getQrModeLabel(mode) {
  switch (mode) {
    case 'mini-program':
      return '微信小程序码';
    case 'mini-program-square':
      return '微信小程序二维码';
    case 'sn':
      return '原始 SN 码';
    default:
      return 'H5 链接二维码';
  }
}

/**
 * 格式化执行标准
 */
function formatStandardValue(value) {
  return String(value || '')
    .split(/[\n\r；;、,，]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join('；');
}

async function route(req, res, context) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams } = url;

  if (req.method === 'OPTIONS') {
    sendNoContent(req, res, context.config);
    return;
  }

  // API全局限流（排除健康检查、静态资源和进度API）
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/progress/')) {
    const clientId = getClientId(req);
    const rateLimitResult = apiRateLimit.check(clientId);
    if (!rateLimitResult.allowed) {
      sendJson(req, res, context.config, 429, {
        message: '请求过于频繁，请稍后再试'
      });
      return;
    }
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(req, res, context.config, 200, {
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    await handleLogin(req, res, context);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/password') {
    await handleAdminPasswordChange(req, res, context);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/wechat/login') {
    await handleWechatLogin(req, res, context);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/user/garments') {
    handleUserGarments(req, res, context);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/user/lost-reports') {
    handleUserLostReports(req, res, context);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/user/binding-logs') {
    handleUserBindingLogs(req, res, context);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/users') {
    handleAdminUsers(req, res, context);
    return;
  }

  const adminUserActionMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/(ban|unban)$/);
  if (adminUserActionMatch && req.method === 'POST') {
    handleAdminUserStatus(
      req,
      res,
      context,
      Number(adminUserActionMatch[1]),
      adminUserActionMatch[2] === 'ban' ? 'banned' : 'active'
    );
    return;
  }

  const adminUserId = parsePathId(pathname, '/api/admin/users/');
  if (adminUserId && req.method === 'GET') {
    handleAdminUserDetail(req, res, context, adminUserId);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/stats') {
    handleAdminStats(req, res, context);
    return;
  }

  const adminExportMatch = pathname.match(/^\/api\/admin\/export\/([a-z-]+)$/);
  if (adminExportMatch && req.method === 'GET') {
    handleAdminExport(req, res, context, adminExportMatch[1]);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/clothes') {
    requireAdmin(req, context);
    const rows = listClothes(context.db, searchParams.get('q') || '');
    sendJson(req, res, context.config, 200, {
      clothes: rows.map(toClothingDto)
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/clothes') {
    await handleCreateClothing(req, res, context);
    return;
  }

  const clothingBatchesId = parseClothingBatchesPath(pathname);
  if (clothingBatchesId && req.method === 'GET') {
    requireAdmin(req, context);
    const clothing = findClothingById(context.db, clothingBatchesId);

    if (!clothing) {
      throw new HttpError(404, '未找到该衣服');
    }

    const batches = listBatchesByClothingId(context.db, clothingBatchesId).map((batch) =>
      batchWithGarments(context, batch)
    );
    sendJson(req, res, context.config, 200, { batches });
    return;
  }

  if (clothingBatchesId && req.method === 'POST') {
    await handleCreateBatch(req, res, context, clothingBatchesId);
    return;
  }

  const clothingId = parsePathId(pathname, '/api/clothes/');
  if (clothingId && req.method === 'GET') {
    requireAdmin(req, context);
    const clothing = findClothingById(context.db, clothingId);

    if (!clothing) {
      throw new HttpError(404, '未找到该衣服');
    }

    sendJson(req, res, context.config, 200, {
      clothing: toClothingDto(clothing)
    });
    return;
  }

  if (clothingId && req.method === 'PUT') {
    await handleUpdateClothing(req, res, context, clothingId);
    return;
  }

  if (clothingId && req.method === 'DELETE') {
    handleDeleteClothing(req, res, context, clothingId, searchParams);
    return;
  }

  const batchId = parsePathId(pathname, '/api/batches/');
  if (batchId && req.method === 'PUT') {
    await handleUpdateBatch(req, res, context, batchId);
    return;
  }

  if (batchId && req.method === 'DELETE') {
    handleDeleteBatch(req, res, context, batchId, searchParams);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/garments') {
    requireAdmin(req, context);
    const rows = listGarments(context.db, {
      query: searchParams.get('q') || '',
      clothingId: searchParams.get('clothingId') || '',
      batchId: searchParams.get('batchId') || ''
    });
    sendJson(req, res, context.config, 200, {
      garments: rows.map((row) => toGarmentDto(row, { privateBinding: true }))
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/garments') {
    await handleCreateGarment(req, res, context);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/sn/generate') {
    requireAdmin(req, context);
    sendJson(req, res, context.config, 200, { sn: generateUniqueSn(context.db) });
    return;
  }

  const bindingSn = parseGarmentBindingPath(pathname);
  if (bindingSn && req.method === 'POST') {
    await handleBindGarment(req, res, context, bindingSn);
    return;
  }

  if (bindingSn && req.method === 'PUT') {
    await handleUpdateBinding(req, res, context, bindingSn);
    return;
  }

  if (bindingSn && req.method === 'DELETE') {
    handleUnbindGarment(req, res, context, bindingSn);
    return;
  }

  const lostReportSn = parseGarmentLostReportPath(pathname);
  if (lostReportSn && req.method === 'POST') {
    await handleCreateLostReport(req, res, context, lostReportSn);
    return;
  }

  if (lostReportSn && req.method === 'DELETE') {
    handleCloseLostReport(req, res, context, lostReportSn);
    return;
  }

  const contactRevealSn = parseGarmentContactRevealPath(pathname);
  if (contactRevealSn && req.method === 'POST') {
    await handleContactReveal(req, res, context, contactRevealSn);
    return;
  }

  const garmentSn = parsePathSn(pathname, '/api/garments/');
  if (garmentSn && req.method === 'GET') {
    handlePublicGarment(req, res, context, garmentSn, searchParams);
    return;
  }

  if (garmentSn && req.method === 'PUT') {
    await handleUpdateGarment(req, res, context, garmentSn);
    return;
  }

  if (garmentSn && req.method === 'DELETE') {
    handleDeleteGarment(req, res, context, garmentSn, searchParams);
    return;
  }

  // 二维码缓存管理接口（仅管理员）
  if (pathname === '/api/admin/qrcode/cache/stats' && req.method === 'GET') {
    requireAdmin(req, context);
    const stats = await getCacheStats(context.db);
    const memoryInfo = getMemoryCacheInfo();
    sendJson(req, res, context.config, 200, {
      memory: {
        ...stats.memory,
        entries: memoryInfo.entries
      },
      database: stats.database,
      ttl: {
        memory: `${MEMORY_CACHE_TTL / 1000 / 60}分钟`,
        browser: '1天'
      }
    });
    return;
  }

  if (pathname === '/api/admin/qrcode/cache/clear' && req.method === 'POST') {
    requireAdmin(req, context);
    await clearAll(context.db);
    sendJson(req, res, context.config, 200, { message: '缓存已清空' });
    return;
  }

  if (pathname === '/api/admin/qrcode/cache/cleanup' && req.method === 'POST') {
    requireAdmin(req, context);
    const cleaned = cleanupMemoryCache();
    sendJson(req, res, context.config, 200, {
      message: '内存缓存已清理',
      cleaned
    });
    return;
  }

  // 批量检查缓存状态
  if (pathname === '/api/admin/qrcode/cache/check-batch' && req.method === 'POST') {
    requireAdmin(req, context);
    const body = await readJson(req);
    const sns = body.sns || [];
    const type = normalizeQrType(body.type) || 'url';

    if (!Array.isArray(sns) || sns.length === 0) {
      throw new HttpError(400, '请提供 SN 列表');
    }

    if (sns.length > 10000) {
      throw new HttpError(400, '单次最多检查 10000 个 SN');
    }

    const result = checkQrCacheBatch(context.db, sns, type);
    sendJson(req, res, context.config, 200, result);
    return;
  }

  // 删除单个缓存
  if (pathname === '/api/admin/qrcode/cache/delete' && req.method === 'POST') {
    requireAdmin(req, context);
    const body = await readJson(req);
    const sn = body.sn || '';
    const type = normalizeQrType(body.type) || 'url';

    if (!sn) {
      throw new HttpError(400, '请提供 SN');
    }

    // 删除缓存
    await deleteQrCode(context.db, sn, type);

    sendJson(req, res, context.config, 200, { message: '缓存已删除' });
    return;
  }

  // 获取缓存列表
  if (pathname === '/api/admin/qrcode/cache/list' && req.method === 'GET') {
    requireAdmin(req, context);
    const limit = readPositiveInteger(searchParams.get('limit')) || 100;
    const offset = readPositiveInteger(searchParams.get('offset')) || 0;
    const type = searchParams.get('type') || null;
    const snLike = searchParams.get('snLike') || null;

    const list = listQrCache(context.db, { limit, offset, type, snLike });
    const stats = getQrCacheStats(context.db);

    sendJson(req, res, context.config, 200, {
      list,
      pagination: { limit, offset, total: stats.totalCount },
      stats
    });
    return;
  }

  // 获取缓存统计
  if (pathname === '/api/admin/qrcode/cache/statistics' && req.method === 'GET') {
    requireAdmin(req, context);
    const stats = getQrCacheStats(context.db);
    sendJson(req, res, context.config, 200, stats);
    return;
  }

  // 进度管理接口
  if (pathname === '/api/progress/create' && req.method === 'POST') {
    requireAdmin(req, context);
    const body = await readJson(req);
    const total = readPositiveInteger(body.total) || 0;
    const progressId = createProgress(total);
    sendJson(req, res, context.config, 200, { progressId, total });
    return;
  }

  if (pathname.startsWith('/api/progress/') && req.method === 'GET') {
    requireAdmin(req, context);
    const progressId = pathname.slice('/api/progress/'.length);
    if (!progressId) {
      throw new HttpError(400, '缺少进度ID');
    }

    // 检查是否为 SSE 请求
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/event-stream')) {
      // SSE 端点
      handleProgressSse(req, res, progressId);
      return;
    }

    // 普通 JSON 请求
    const progress = getProgress(progressId);
    if (!progress) {
      throw new HttpError(404, '进度任务不存在');
    }
    sendJson(req, res, context.config, 200, progress);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/qrcode/batch') {
    await handleBatchQrCodes(req, res, context, searchParams);
    return;
  }

  // Excel导出接口（包含二维码图片）
  if (pathname === '/api/admin/export/excel-with-qrcodes' && req.method === 'POST') {
    await handleExcelExportWithQrCodes(req, res, context);
    return;
  }

  const qrSn = parsePathSn(pathname, '/api/qrcode/');
  if (qrSn && req.method === 'GET') {
    await handleQrCode(req, res, context, qrSn, searchParams);
    return;
  }

  if (handleAdminStatic(req, res, context, pathname)) {
    return;
  }

  throw new HttpError(404, '接口不存在');
}

export function createApp(options = {}) {
  const config = createConfig(options);
  const db = openDatabase(config.databasePath);
  migrateDatabase(db, config);
  const context = { config, db };
  const server = createServer((req, res) => {
    route(req, res, context).catch((error) => {
      const status = error.status || 500;
      const message = status === 500 ? '服务器内部错误' : error.message;

      if (status === 500) {
        console.error(error);
      }

      sendJson(req, res, config, status, {
        message,
        details: error.details
      });
    });
  });

  server.on('close', () => {
    db.close();
  });

  return { server, db, config };
}
