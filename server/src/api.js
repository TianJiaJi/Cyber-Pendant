import { createReadStream, existsSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import archiver from 'archiver';
import QRCode from 'qrcode';
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
  validateClothingForCreate
} from './db.js';
import { generateUniqueSn, normalizeSn } from './sn.js';

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function setCorsHeaders(req, res, config) {
  const origin =
    config.corsOrigin === '*' ? '*' : req.headers.origin || config.corsOrigin;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}

function sendJson(req, res, config, status, payload) {
  setCorsHeaders(req, res, config);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendNoContent(req, res, config) {
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

function requireAdmin(req, config) {
  const token = bearerToken(req);
  const payload = verifyToken(token, config.tokenSecret);

  if (!payload || (payload.type && payload.type !== 'admin')) {
    throw new HttpError(401, '请先登录后台');
  }

  return payload;
}

function requireUser(req, config) {
  const token = bearerToken(req);
  const payload = verifyToken(token, config.userTokenSecret);

  if (!payload || payload.type !== 'user') {
    throw new HttpError(401, '请先登录');
  }

  return payload;
}

function readActor(req, config) {
  const token = bearerToken(req);
  const user = verifyToken(token, config.userTokenSecret);

  if (user?.type === 'user') {
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
  const body = await readJson(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const admin = findAdminByUsername(context.db, username);

  if (!admin || !verifyPassword(password, admin.password_hash)) {
    throw new HttpError(401, '用户名或密码错误');
  }

  const token = createToken(admin, context.config.tokenSecret);
  sendJson(req, res, context.config, 200, {
    token,
    user: {
      id: admin.id,
      username: admin.username
    }
  });
}

async function handleWechatLogin(req, res, context) {
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
    throw new HttpError(error.status || 401, error.message || '微信登录失败', error.details);
  }

  if (wechatResult.errcode) {
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
  const studentName = String(body.studentName || body.ownerName || '').trim();
  const studentSchool = String(body.studentSchool || body.school || '').trim();
  const studentClass = String(body.studentClass || body.className || '').trim();
  const contactName = String(body.contactName || '').trim();
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

  if (contactName.length > 24) {
    throw new HttpError(400, '联系人不能超过 24 个字符');
  }

  if (!/^\d{6,20}$/.test(contactPhone)) {
    throw new HttpError(400, '请输入 6-20 位联系电话');
  }

  return {
    studentName,
    studentSchool,
    studentClass,
    contactName: contactName || null,
    contactPhone,
    ownerName: studentName,
    ownerPhoneTail: contactPhone.slice(-4)
  };
}

function handlePublicGarment(req, res, context, sn, searchParams) {
  let viewerUserId = null;
  try {
    viewerUserId = requireUser(req, context.config).sub;
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
  const userPayload = requireUser(req, context.config);
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
  const userPayload = requireUser(req, context.config);
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
  const actor = readActor(req, context.config);
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
  const userPayload = requireUser(req, context.config);
  const garments = listUserGarments(context.db, userPayload.sub).map((row) =>
    toGarmentDto(row, {
      viewerUserId: userPayload.sub,
      showOwnerSummary: true
    })
  );

  sendJson(req, res, context.config, 200, { garments });
}

function handleUserBindingLogs(req, res, context) {
  const userPayload = requireUser(req, context.config);
  const logs = listUserBindingLogs(context.db, userPayload.sub).map(toBindingLogDto);

  sendJson(req, res, context.config, 200, { logs });
}

function handleUserLostReports(req, res, context) {
  const userPayload = requireUser(req, context.config);
  const reports = listUserLostReports(context.db, userPayload.sub).map(toLostReportDto);

  sendJson(req, res, context.config, 200, { reports });
}

async function handleCreateLostReport(req, res, context, sn) {
  const userPayload = requireUser(req, context.config);
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
  const actor = readActor(req, context.config);
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
  const userPayload = requireUser(req, context.config);

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

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sendCsv(req, res, context, filename, rows) {
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
  requireAdmin(req, context.config);
  const users = listAdminUsers(context.db).map(toUserDto);
  sendJson(req, res, context.config, 200, { users });
}

function handleAdminUserDetail(req, res, context, userId) {
  requireAdmin(req, context.config);
  const user = findUserById(context.db, userId);

  if (!user) {
    throw new HttpError(404, '未找到用户');
  }

  sendJson(req, res, context.config, 200, { user: toUserDto(user) });
}

function handleAdminUserStatus(req, res, context, userId, status) {
  requireAdmin(req, context.config);
  const user = setUserStatus(context.db, userId, status);

  if (!user) {
    throw new HttpError(404, '未找到用户');
  }

  sendJson(req, res, context.config, 200, { user: toUserDto(user) });
}

function handleAdminStats(req, res, context) {
  requireAdmin(req, context.config);
  sendJson(req, res, context.config, 200, getAdminStats(context.db));
}

function handleAdminExport(req, res, context, type) {
  requireAdmin(req, context.config);
  const rows = exportRows(context.db, type);

  if (!rows) {
    throw new HttpError(404, '不支持的导出类型');
  }

  sendCsv(req, res, context, `${type}.csv`, rows);
}

async function handleCreateClothing(req, res, context) {
  requireAdmin(req, context.config);
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
  requireAdmin(req, context.config);
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
  requireAdmin(req, context.config);
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
  requireAdmin(req, context.config);
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

  if (count > 500) {
    throw new HttpError(400, '单次最多生成 500 个吊牌');
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
  requireAdmin(req, context.config);
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
  requireAdmin(req, context.config);
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
  requireAdmin(req, context.config);
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
  requireAdmin(req, context.config);
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
  requireAdmin(req, context.config);
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

  // 微信小程序码（圆形）：使用微信API生成
  if (type === 'mini-program') {
    let qrImage;
    let fetchError = null;

    // 只有在有真实 wechatAppId 和 wechatAppSecret（非空）时才尝试生成小程序码
    const hasValidWechatConfig =
      context.config.wechatAppId &&
      context.config.wechatAppSecret &&
      typeof context.config.wechatAppId === 'string' &&
      typeof context.config.wechatAppSecret === 'string' &&
      context.config.wechatAppId.trim() !== '' &&
      context.config.wechatAppSecret.trim() !== '';

    if (hasValidWechatConfig) {
      try {
        // 获取 access_token
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

        // 生成小程序码
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
      // 没有有效的微信配置，将回退到传统二维码
      fetchError = new Error('微信小程序配置缺失或不完整');
    }

    // 如果小程序码生成失败或没有配置，回退到传统二维码
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

    setCorsHeaders(req, res, context.config);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store'
    });
    res.end(qrImage);
    return;
  }

  // 微信小程序正方形二维码：使用微信API生成
  if (type === 'mini-program-square') {
    let qrImage;
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

    setCorsHeaders(req, res, context.config);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store'
    });
    res.end(qrImage);
    return;
  }

  // 传统二维码（SN 或 URL）
  const content = type === 'sn' ? sn : detailUrl(context.config, sn);
  const png = await QRCode.toBuffer(content, {
    type: 'png',
    width: 512,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#161616',
      light: '#ffffff'
    }
  });

  setCorsHeaders(req, res, context.config);
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'no-store'
  });
  res.end(png);
}

async function handleBatchQrCodes(req, res, context, searchParams) {
  requireAdmin(req, context.config);

  const batchId = readPositiveInteger(searchParams.get('batchId'));
  const type = normalizeQrType(searchParams.get('type')) || 'url';

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

  // 检查微信小程序码配置
  const hasValidWechatConfig =
    context.config.wechatAppId &&
    context.config.wechatAppSecret &&
    typeof context.config.wechatAppId === 'string' &&
    typeof context.config.wechatAppSecret === 'string' &&
    context.config.wechatAppId.trim() !== '' &&
    context.config.wechatAppSecret.trim() !== '';

  if ((type === 'mini-program' || type === 'mini-program-square') && !hasValidWechatConfig) {
    throw new HttpError(400, '微信小程序配置缺失，无法生成小程序码');
  }

  // 创建ZIP流
  const zip = archiver('zip', { zlib: { level: 9 } });
  const zipFileName = `batch-${batchId}-qrcodes-${type}.zip`;

  // 设置响应头
  setCorsHeaders(req, res, context.config);
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFileName)}"`
  });

  // 将ZIP输出流连接到响应
  zip.pipe(res);

  // 错误处理
  zip.on('error', (err) => {
    console.error('ZIP creation error:', err);
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
        throw new HttpError(502, '获取微信access_token失败');
      }
    }

    // 逐个生成二维码并添加到ZIP
    for (const garment of garments) {
      const sn = garment.sn;
      let qrBuffer;

      if (type === 'mini-program') {
        try {
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

      // 添加到ZIP
      zip.append(qrBuffer, { name: `${sn}.png` });
    }

    // 完成ZIP
    zip.finalize();
  } catch (error) {
    console.error('Batch QR code generation error:', error);
    if (!res.headersSent) {
      sendJson(req, res, context.config, 500, { message: error.message || '批量生成二维码失败' });
    } else {
      res.destroy();
    }
  }
}

async function route(req, res, context) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams } = url;

  if (req.method === 'OPTIONS') {
    sendNoContent(req, res, context.config);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(req, res, context.config, 200, {
      ok: true,
      database: context.config.databasePath
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    await handleLogin(req, res, context);
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
    requireAdmin(req, context.config);
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
    requireAdmin(req, context.config);
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
    requireAdmin(req, context.config);
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
    requireAdmin(req, context.config);
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
    requireAdmin(req, context.config);
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

  if (req.method === 'GET' && pathname === '/api/qrcode/batch') {
    await handleBatchQrCodes(req, res, context, searchParams);
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
