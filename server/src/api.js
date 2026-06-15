import { createServer } from 'node:http';
import QRCode from 'qrcode';
import { createToken, verifyPassword, verifyToken } from './auth.js';
import { createConfig } from './config.js';
import {
  findAdminByUsername,
  findGarmentBySn,
  insertGarment,
  listGarments,
  migrateDatabase,
  normalizeGarmentInput,
  openDatabase,
  toGarmentDto,
  updateGarment,
  validateGarmentForCreate
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
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

function requireAdmin(req, config) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token, config.tokenSecret);

  if (!payload) {
    throw new HttpError(401, '请先登录后台');
  }

  return payload;
}

function detailUrl(config, sn) {
  return `${config.frontendBaseUrl.replace(/\/$/, '')}/#/pages/garment/detail?sn=${encodeURIComponent(sn)}`;
}

function parsePathSn(pathname, prefix) {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const value = pathname.slice(prefix.length);
  return value ? normalizeSn(decodeURIComponent(value)) : null;
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

function handlePublicGarment(req, res, context, sn) {
  const row = findGarmentBySn(context.db, sn);

  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  const garment = toGarmentDto(row);
  if (row.status !== 'active') {
    sendJson(req, res, context.config, 423, {
      message: '该吊牌已停用',
      garment
    });
    return;
  }

  sendJson(req, res, context.config, 200, { garment });
}

async function handleCreateGarment(req, res, context) {
  requireAdmin(req, context.config);
  const body = await readJson(req);
  const sn = normalizeSn(body.sn) || generateUniqueSn(context.db);

  if (findGarmentBySn(context.db, sn)) {
    throw new HttpError(409, 'SN 码已存在');
  }

  const garment = normalizeGarmentInput(body);
  const validationError = validateGarmentForCreate(garment);

  if (validationError) {
    throw new HttpError(400, validationError);
  }

  const created = insertGarment(context.db, sn, garment);
  sendJson(req, res, context.config, 201, { garment: toGarmentDto(created) });
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

  sendJson(req, res, context.config, 200, { garment: toGarmentDto(updated) });
}

async function handleQrCode(req, res, context, sn, searchParams) {
  const row = findGarmentBySn(context.db, sn);

  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  const type = searchParams.get('type') === 'sn' ? 'sn' : 'url';
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

  if (req.method === 'GET' && pathname === '/api/garments') {
    requireAdmin(req, context.config);
    const rows = listGarments(context.db, searchParams.get('q') || '');
    sendJson(req, res, context.config, 200, {
      garments: rows.map(toGarmentDto)
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

  const garmentSn = parsePathSn(pathname, '/api/garments/');
  if (garmentSn && req.method === 'GET') {
    handlePublicGarment(req, res, context, garmentSn);
    return;
  }

  if (garmentSn && req.method === 'PUT') {
    await handleUpdateGarment(req, res, context, garmentSn);
    return;
  }

  const qrSn = parsePathSn(pathname, '/api/qrcode/');
  if (qrSn && req.method === 'GET') {
    await handleQrCode(req, res, context, qrSn, searchParams);
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
