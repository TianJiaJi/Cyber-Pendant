import { createServer } from 'node:http';
import QRCode from 'qrcode';
import { createToken, verifyPassword, verifyToken } from './auth.js';
import { createConfig } from './config.js';
import {
  deleteBatchHard,
  deleteClothingHard,
  deleteGarmentHard,
  findAdminByUsername,
  findBatchById,
  findClothingById,
  findGarmentBySn,
  findGarmentDetailBySn,
  insertBatch,
  insertClothing,
  insertGarment,
  listBatchesByClothingId,
  listClothes,
  listGarments,
  listGarmentsByBatchId,
  migrateDatabase,
  normalizeBatchInput,
  normalizeClothingInput,
  normalizeGarmentInput,
  openDatabase,
  setBatchStatus,
  setClothingStatus,
  toBatchDto,
  toClothingDto,
  toGarmentDto,
  updateBatch,
  updateClothing,
  updateGarment,
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

function readPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function wantsHardDelete(searchParams) {
  return searchParams.get('hard') === '1' || searchParams.get('hard') === 'true';
}

function batchWithGarments(context, batch) {
  const garments = listGarmentsByBatchId(context.db, batch.id).map(toGarmentDto);
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

function handlePublicGarment(req, res, context, sn) {
  const row = findGarmentDetailBySn(context.db, sn);

  if (!row) {
    throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  }

  const garment = toGarmentDto(row);
  if (garment.status !== 'active') {
    sendJson(req, res, context.config, 423, {
      message: '该吊牌已停用',
      garment
    });
    return;
  }

  sendJson(req, res, context.config, 200, { garment });
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
    garment: toGarmentDto(findGarmentDetailBySn(context.db, created.sn))
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

  sendJson(req, res, context.config, 200, { garment: toGarmentDto(updated) });
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
    garment: toGarmentDto(updated)
  });
}

async function handleQrCode(req, res, context, sn, searchParams) {
  const row = findGarmentDetailBySn(context.db, sn);

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

  if (garmentSn && req.method === 'DELETE') {
    handleDeleteGarment(req, res, context, garmentSn, searchParams);
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
