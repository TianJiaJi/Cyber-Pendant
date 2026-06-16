import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';

export const CLOTHING_FIELD_MAP = {
  productName: 'product_name',
  fabric: 'fabric',
  standard: 'standard',
  safetyCategory: 'safety_category',
  grade: 'grade',
  manufacturer: 'manufacturer',
  manufacturerAddress: 'manufacturer_address',
  careInstructions: 'care_instructions',
  remark: 'remark'
};

export const BATCH_FIELD_MAP = {
  styleNo: 'style_no',
  color: 'color',
  size: 'size',
  batchNo: 'batch_no',
  productionDate: 'production_date',
  remark: 'remark'
};

export const FIELD_MAP = {
  productName: 'product_name',
  styleNo: 'style_no',
  color: 'color',
  size: 'size',
  fabric: 'fabric',
  standard: 'standard',
  safetyCategory: 'safety_category',
  grade: 'grade',
  manufacturer: 'manufacturer',
  manufacturerAddress: 'manufacturer_address',
  careInstructions: 'care_instructions',
  batchNo: 'batch_no',
  productionDate: 'production_date',
  remark: 'remark'
};

const CLOTHING_COLUMNS = Object.values(CLOTHING_FIELD_MAP);
const BATCH_COLUMNS = Object.values(BATCH_FIELD_MAP);
const LEGACY_GARMENT_COLUMNS = Object.values(FIELD_MAP);
const VALID_STATUSES = new Set(['active', 'inactive']);

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function cleanPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeStatus(value, fallback = 'active') {
  return VALID_STATUSES.has(value) ? value : fallback;
}

function tableExists(db, tableName) {
  return Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName)
  );
}

function columnExists(db, tableName, columnName) {
  if (!tableExists(db, tableName)) {
    return false;
  }

  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

export function openDatabase(databasePath) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

export function migrateDatabase(db, config) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS garment_styles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT,
      style_no TEXT,
      color TEXT,
      size TEXT,
      fabric TEXT,
      standard TEXT,
      safety_category TEXT,
      grade TEXT,
      manufacturer TEXT,
      manufacturer_address TEXT,
      care_instructions TEXT,
      remark TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clothes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT,
      fabric TEXT,
      standard TEXT,
      safety_category TEXT,
      grade TEXT,
      manufacturer TEXT,
      manufacturer_address TEXT,
      care_instructions TEXT,
      remark TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS garment_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clothing_id INTEGER NOT NULL REFERENCES clothes(id) ON DELETE CASCADE,
      style_no TEXT,
      color TEXT,
      size TEXT,
      batch_no TEXT,
      production_date TEXT,
      remark TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS garments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clothing_id INTEGER REFERENCES clothes(id) ON DELETE CASCADE,
      batch_id INTEGER REFERENCES garment_batches(id) ON DELETE CASCADE,
      style_id INTEGER,
      sn TEXT NOT NULL UNIQUE,
      product_name TEXT,
      style_no TEXT,
      color TEXT,
      size TEXT,
      fabric TEXT,
      standard TEXT,
      safety_category TEXT,
      grade TEXT,
      manufacturer TEXT,
      manufacturer_address TEXT,
      care_instructions TEXT,
      batch_no TEXT,
      production_date TEXT,
      remark TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clothes_status ON clothes(status);
    CREATE INDEX IF NOT EXISTS idx_garment_batches_clothing_id ON garment_batches(clothing_id);
    CREATE INDEX IF NOT EXISTS idx_garment_batches_status ON garment_batches(status);
    CREATE INDEX IF NOT EXISTS idx_garments_sn ON garments(sn);
    CREATE INDEX IF NOT EXISTS idx_garments_status ON garments(status);
  `);

  ensureGarmentColumn(db, 'clothing_id');
  ensureGarmentColumn(db, 'batch_id');
  ensureGarmentColumn(db, 'style_id');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_garments_clothing_id ON garments(clothing_id);
    CREATE INDEX IF NOT EXISTS idx_garments_batch_id ON garments(batch_id);
  `);

  seedAdmin(db, config);
  seedDemoData(db);
  backfillThreeLayerData(db);
}

function ensureGarmentColumn(db, columnName) {
  if (!columnExists(db, 'garments', columnName)) {
    db.exec(`ALTER TABLE garments ADD COLUMN ${columnName} INTEGER;`);
  }
}

function seedAdmin(db, config) {
  const existing = db
    .prepare('SELECT id FROM admins WHERE username = ?')
    .get(config.adminUsername);

  if (existing) {
    return;
  }

  if (!config.adminPassword) {
    throw new Error(
      'ADMIN_PASSWORD is required when initializing a new admin. Copy server/.env.example to server/.env and set a local password.'
    );
  }

  db.prepare(
    'INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)'
  ).run(config.adminUsername, hashPassword(config.adminPassword), nowIso());
}

function seedDemoData(db) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM garments').get().count;

  if (count > 0) {
    return;
  }

  const clothing = insertClothing(db, {
    product_name: '高级梭织外套',
    fabric: '面料：羊毛 58%，聚酯纤维 38%，氨纶 4%；里料：聚酯纤维 100%',
    standard: 'GB/T 2664-2017',
    safety_category: 'GB 18401-2010 B 类',
    grade: '一等品',
    manufacturer: '赛博衣饰制造有限公司',
    manufacturer_address: '广东省深圳市南山区科技园示范路 88 号',
    care_instructions: '不可漂白；悬挂晾干；低温熨烫；建议专业干洗。',
    remark: '演示数据，可在后台编辑或停用。',
    status: 'active'
  });
  const batch = insertBatch(db, {
    clothing_id: clothing.id,
    style_no: 'CP-JK-2601',
    color: '石墨黑',
    size: 'M',
    batch_no: 'BATCH-202606-A01',
    production_date: '2026-06-15',
    remark: null,
    status: 'active'
  });

  insertGarment(db, 'CP20260615DEMO01', {
    clothing_id: clothing.id,
    batch_id: batch.id,
    status: 'active'
  });
}

export function findAdminByUsername(db, username) {
  return db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
}

export function normalizeClothingInput(input = {}, options = {}) {
  const output = {};

  for (const [field, column] of Object.entries(CLOTHING_FIELD_MAP)) {
    if (Object.hasOwn(input, field)) {
      output[column] = cleanString(input[field]);
    } else if (Object.hasOwn(input, column)) {
      output[column] = cleanString(input[column]);
    } else if (!options.partial) {
      output[column] = null;
    }
  }

  if (Object.hasOwn(input, 'status')) {
    output.status = normalizeStatus(input.status);
  } else if (!options.partial) {
    output.status = 'active';
  }

  return output;
}

export function normalizeBatchInput(input = {}, options = {}) {
  const output = {};

  for (const [field, column] of Object.entries(BATCH_FIELD_MAP)) {
    if (Object.hasOwn(input, field)) {
      output[column] = cleanString(input[field]);
    } else if (Object.hasOwn(input, column)) {
      output[column] = cleanString(input[column]);
    } else if (!options.partial) {
      output[column] = null;
    }
  }

  if (Object.hasOwn(input, 'status')) {
    output.status = normalizeStatus(input.status);
  } else if (!options.partial) {
    output.status = 'active';
  }

  return output;
}

export function normalizeGarmentInput(input = {}, options = {}) {
  const output = {};

  if (Object.hasOwn(input, 'status')) {
    output.status = normalizeStatus(input.status);
  } else if (!options.partial) {
    output.status = 'active';
  }

  if (Object.hasOwn(input, 'clothingId')) {
    output.clothing_id = cleanPositiveInteger(input.clothingId);
  } else if (Object.hasOwn(input, 'clothing_id')) {
    output.clothing_id = cleanPositiveInteger(input.clothing_id);
  }

  if (Object.hasOwn(input, 'batchId')) {
    output.batch_id = cleanPositiveInteger(input.batchId);
  } else if (Object.hasOwn(input, 'batch_id')) {
    output.batch_id = cleanPositiveInteger(input.batch_id);
  }

  for (const [field, column] of Object.entries(FIELD_MAP)) {
    if (Object.hasOwn(input, field)) {
      output[column] = cleanString(input[field]);
    } else if (Object.hasOwn(input, column)) {
      output[column] = cleanString(input[column]);
    } else if (!options.partial) {
      output[column] = null;
    }
  }

  return output;
}

export function validateClothingForCreate(clothing) {
  const required = [
    ['product_name', '衣服名称'],
    ['fabric', '面料'],
    ['standard', '执行标准'],
    ['manufacturer', '厂家']
  ];

  for (const [field, label] of required) {
    if (!clothing[field]) {
      return `${label}不能为空`;
    }
  }

  return null;
}

export function validateBatchForCreate(batch) {
  if (!batch.style_no && !batch.color && !batch.size && !batch.batch_no) {
    return '请至少填写款号、颜色、尺码或生产批次中的一项';
  }

  return null;
}

export function listClothes(db, query = '') {
  const keyword = cleanString(query);
  const values = [];
  let where = '';

  if (keyword) {
    const like = `%${keyword}%`;
    where = `WHERE c.product_name LIKE ?
      OR c.fabric LIKE ?
      OR c.manufacturer LIKE ?
      OR c.standard LIKE ?`;
    values.push(like, like, like, like);
  }

  return db
    .prepare(
      `SELECT
         c.*,
         COUNT(DISTINCT b.id) AS batch_count,
         COUNT(DISTINCT g.id) AS garment_count
       FROM clothes c
       LEFT JOIN garment_batches b ON b.clothing_id = c.id
       LEFT JOIN garments g ON g.clothing_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY c.updated_at DESC, c.id DESC
       LIMIT 500`
    )
    .all(...values);
}

export function findClothingById(db, id) {
  const clothingId = cleanPositiveInteger(id);

  if (!clothingId) {
    return null;
  }

  return db
    .prepare(
      `SELECT
         c.*,
         COUNT(DISTINCT b.id) AS batch_count,
         COUNT(DISTINCT g.id) AS garment_count
       FROM clothes c
       LEFT JOIN garment_batches b ON b.clothing_id = c.id
       LEFT JOIN garments g ON g.clothing_id = c.id
       WHERE c.id = ?
       GROUP BY c.id`
    )
    .get(clothingId);
}

export function insertClothing(db, clothing) {
  const createdAt = nowIso();
  const row = {
    ...clothing,
    created_at: createdAt,
    updated_at: createdAt
  };
  const columns = [...CLOTHING_COLUMNS, 'status', 'created_at', 'updated_at'];
  const placeholders = columns.map(() => '?').join(', ');
  const result = db
    .prepare(`INSERT INTO clothes (${columns.join(', ')}) VALUES (${placeholders})`)
    .run(...columns.map((column) => row[column] ?? null));

  return findClothingById(db, Number(result.lastInsertRowid));
}

export function updateClothing(db, id, patch) {
  const clothingId = cleanPositiveInteger(id);
  const columns = [...CLOTHING_COLUMNS, 'status'].filter((column) =>
    Object.hasOwn(patch, column)
  );

  if (!clothingId) {
    return null;
  }

  if (columns.length === 0) {
    return findClothingById(db, clothingId);
  }

  const assignments = columns.map((column) => `${column} = ?`);
  const values = columns.map((column) => patch[column] ?? null);
  values.push(nowIso(), clothingId);

  db.prepare(
    `UPDATE clothes SET ${assignments.join(', ')}, updated_at = ? WHERE id = ?`
  ).run(...values);

  if (Object.hasOwn(patch, 'status')) {
    setClothingStatus(db, clothingId, patch.status);
  }

  return findClothingById(db, clothingId);
}

export function setClothingStatus(db, id, status) {
  const clothingId = cleanPositiveInteger(id);
  const nextStatus = normalizeStatus(status);

  if (!clothingId) {
    return null;
  }

  const timestamp = nowIso();
  db.prepare('UPDATE clothes SET status = ?, updated_at = ? WHERE id = ?').run(
    nextStatus,
    timestamp,
    clothingId
  );

  return findClothingById(db, clothingId);
}

export function deleteClothingHard(db, id) {
  const clothingId = cleanPositiveInteger(id);

  if (!clothingId) {
    return false;
  }

  db.prepare('DELETE FROM garments WHERE clothing_id = ?').run(clothingId);
  db.prepare('DELETE FROM garment_batches WHERE clothing_id = ?').run(clothingId);
  const result = db.prepare('DELETE FROM clothes WHERE id = ?').run(clothingId);
  return result.changes > 0;
}

export function findBatchById(db, id) {
  const batchId = cleanPositiveInteger(id);

  if (!batchId) {
    return null;
  }

  return db
    .prepare(
      `SELECT
         b.*,
         COUNT(g.id) AS garment_count
       FROM garment_batches b
       LEFT JOIN garments g ON g.batch_id = b.id
       WHERE b.id = ?
       GROUP BY b.id`
    )
    .get(batchId);
}

export function listBatchesByClothingId(db, clothingId) {
  const id = cleanPositiveInteger(clothingId);

  if (!id) {
    return [];
  }

  return db
    .prepare(
      `SELECT
         b.*,
         COUNT(g.id) AS garment_count
       FROM garment_batches b
       LEFT JOIN garments g ON g.batch_id = b.id
       WHERE b.clothing_id = ?
       GROUP BY b.id
       ORDER BY b.created_at DESC, b.id DESC`
    )
    .all(id);
}

export function insertBatch(db, batch) {
  const createdAt = nowIso();
  const row = {
    ...batch,
    created_at: createdAt,
    updated_at: createdAt
  };
  const columns = [
    'clothing_id',
    ...BATCH_COLUMNS,
    'status',
    'created_at',
    'updated_at'
  ];
  const placeholders = columns.map(() => '?').join(', ');
  const result = db
    .prepare(
      `INSERT INTO garment_batches (${columns.join(', ')}) VALUES (${placeholders})`
    )
    .run(...columns.map((column) => row[column] ?? null));

  return findBatchById(db, Number(result.lastInsertRowid));
}

export function updateBatch(db, id, patch) {
  const batchId = cleanPositiveInteger(id);
  const columns = [...BATCH_COLUMNS, 'status'].filter((column) =>
    Object.hasOwn(patch, column)
  );

  if (!batchId) {
    return null;
  }

  if (columns.length === 0) {
    return findBatchById(db, batchId);
  }

  const assignments = columns.map((column) => `${column} = ?`);
  const values = columns.map((column) => patch[column] ?? null);
  values.push(nowIso(), batchId);

  db.prepare(
    `UPDATE garment_batches SET ${assignments.join(', ')}, updated_at = ? WHERE id = ?`
  ).run(...values);

  if (Object.hasOwn(patch, 'status')) {
    setBatchStatus(db, batchId, patch.status);
  }

  return findBatchById(db, batchId);
}

export function setBatchStatus(db, id, status) {
  const batchId = cleanPositiveInteger(id);
  const nextStatus = normalizeStatus(status);

  if (!batchId) {
    return null;
  }

  const timestamp = nowIso();
  db.prepare('UPDATE garment_batches SET status = ?, updated_at = ? WHERE id = ?').run(
    nextStatus,
    timestamp,
    batchId
  );

  return findBatchById(db, batchId);
}

export function deleteBatchHard(db, id) {
  const batchId = cleanPositiveInteger(id);

  if (!batchId) {
    return false;
  }

  db.prepare('DELETE FROM garments WHERE batch_id = ?').run(batchId);
  const result = db.prepare('DELETE FROM garment_batches WHERE id = ?').run(batchId);
  return result.changes > 0;
}

export function insertGarment(db, sn, garment) {
  const createdAt = nowIso();
  const row = {
    ...garment,
    sn,
    created_at: createdAt,
    updated_at: createdAt
  };
  const columns = [
    'clothing_id',
    'batch_id',
    'sn',
    ...LEGACY_GARMENT_COLUMNS,
    'status',
    'created_at',
    'updated_at'
  ];
  const placeholders = columns.map(() => '?').join(', ');

  db.prepare(
    `INSERT INTO garments (${columns.join(', ')}) VALUES (${placeholders})`
  ).run(...columns.map((column) => row[column] ?? null));

  return findGarmentBySn(db, sn);
}

export function findGarmentBySn(db, sn) {
  return db.prepare('SELECT * FROM garments WHERE sn = ?').get(sn);
}

export function findGarmentDetailBySn(db, sn) {
  return db
    .prepare(
      `SELECT
         g.id,
         g.sn,
         g.status AS sn_status,
         g.created_at,
         g.updated_at,
         c.id AS clothing_id,
         c.product_name AS clothing_product_name,
         c.fabric AS clothing_fabric,
         c.standard AS clothing_standard,
         c.safety_category AS clothing_safety_category,
         c.grade AS clothing_grade,
         c.manufacturer AS clothing_manufacturer,
         c.manufacturer_address AS clothing_manufacturer_address,
         c.care_instructions AS clothing_care_instructions,
         c.remark AS clothing_remark,
         c.status AS clothing_status,
         b.id AS batch_id,
         b.style_no AS batch_style_no,
         b.color AS batch_color,
         b.size AS batch_size,
         b.batch_no AS batch_no,
         b.production_date AS batch_production_date,
         b.remark AS batch_remark,
         b.status AS batch_status,
         g.product_name AS legacy_product_name,
         g.style_no AS legacy_style_no,
         g.color AS legacy_color,
         g.size AS legacy_size,
         g.fabric AS legacy_fabric,
         g.standard AS legacy_standard,
         g.safety_category AS legacy_safety_category,
         g.grade AS legacy_grade,
         g.manufacturer AS legacy_manufacturer,
         g.manufacturer_address AS legacy_manufacturer_address,
         g.care_instructions AS legacy_care_instructions,
         g.batch_no AS legacy_batch_no,
         g.production_date AS legacy_production_date,
         g.remark AS legacy_remark
       FROM garments g
       LEFT JOIN clothes c ON c.id = g.clothing_id
       LEFT JOIN garment_batches b ON b.id = g.batch_id
       WHERE g.sn = ?`
    )
    .get(sn);
}

export function listGarments(db, filters = {}) {
  const query = typeof filters === 'string' ? filters : filters.query;
  const keyword = cleanString(query);
  const clothingId = cleanPositiveInteger(
    typeof filters === 'string' ? null : filters.clothingId
  );
  const batchId = cleanPositiveInteger(
    typeof filters === 'string' ? null : filters.batchId
  );
  const conditions = [];
  const values = [];

  if (clothingId) {
    conditions.push('g.clothing_id = ?');
    values.push(clothingId);
  }

  if (batchId) {
    conditions.push('g.batch_id = ?');
    values.push(batchId);
  }

  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push(
      `(g.sn LIKE ?
        OR c.product_name LIKE ?
        OR b.style_no LIKE ?
        OR c.manufacturer LIKE ?)`
    );
    values.push(like, like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT g.sn
       FROM garments g
       LEFT JOIN clothes c ON c.id = g.clothing_id
       LEFT JOIN garment_batches b ON b.id = g.batch_id
       ${where}
       ORDER BY g.created_at DESC, g.id DESC
       LIMIT 500`
    )
    .all(...values);

  return rows.map((row) => findGarmentDetailBySn(db, row.sn));
}

export function listGarmentsByBatchId(db, batchId) {
  const id = cleanPositiveInteger(batchId);

  if (!id) {
    return [];
  }

  return listGarments(db, { batchId: id });
}

export function updateGarment(db, sn, patch) {
  const columns = ['status'].filter((column) => Object.hasOwn(patch, column));

  if (columns.length === 0) {
    return findGarmentDetailBySn(db, sn);
  }

  const assignments = columns.map((column) => `${column} = ?`);
  const values = columns.map((column) => patch[column] ?? null);
  values.push(nowIso(), sn);

  db.prepare(
    `UPDATE garments SET ${assignments.join(', ')}, updated_at = ? WHERE sn = ?`
  ).run(...values);

  return findGarmentDetailBySn(db, sn);
}

export function deleteGarmentHard(db, sn) {
  const result = db.prepare('DELETE FROM garments WHERE sn = ?').run(sn);
  return result.changes > 0;
}

function effectiveStatus(row) {
  return row?.sn_status === 'active' &&
    (row.clothing_status || 'active') === 'active' &&
    (row.batch_status || 'active') === 'active'
    ? 'active'
    : 'inactive';
}

export function toClothingDto(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    productName: row.product_name,
    fabric: row.fabric,
    standard: row.standard,
    safetyCategory: row.safety_category,
    grade: row.grade,
    manufacturer: row.manufacturer,
    manufacturerAddress: row.manufacturer_address,
    careInstructions: row.care_instructions,
    remark: row.remark,
    status: row.status,
    batchCount: Number(row.batch_count || 0),
    garmentCount: Number(row.garment_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toBatchDto(row, garments = []) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    clothingId: row.clothing_id,
    styleNo: row.style_no,
    color: row.color,
    size: row.size,
    batchNo: row.batch_no,
    productionDate: row.production_date,
    remark: row.remark,
    status: row.status,
    garmentCount: Number(row.garment_count || garments.length || 0),
    garments,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toGarmentDto(row) {
  if (!row) {
    return null;
  }

  const status = row.sn_status ? effectiveStatus(row) : row.status;

  return {
    id: row.id,
    clothingId: row.clothing_id,
    batchId: row.batch_id,
    sn: row.sn,
    productName: row.clothing_product_name || row.legacy_product_name || row.product_name,
    styleNo: row.batch_style_no || row.legacy_style_no || row.style_no,
    color: row.batch_color || row.legacy_color || row.color,
    size: row.batch_size || row.legacy_size || row.size,
    fabric: row.clothing_fabric || row.legacy_fabric || row.fabric,
    standard: row.clothing_standard || row.legacy_standard || row.standard,
    safetyCategory:
      row.clothing_safety_category || row.legacy_safety_category || row.safety_category,
    grade: row.clothing_grade || row.legacy_grade || row.grade,
    manufacturer:
      row.clothing_manufacturer || row.legacy_manufacturer || row.manufacturer,
    manufacturerAddress:
      row.clothing_manufacturer_address ||
      row.legacy_manufacturer_address ||
      row.manufacturer_address,
    careInstructions:
      row.clothing_care_instructions ||
      row.legacy_care_instructions ||
      row.care_instructions,
    batchNo: row.batch_no || row.legacy_batch_no,
    productionDate:
      row.batch_production_date || row.legacy_production_date || row.production_date,
    remark: row.batch_remark || row.clothing_remark || row.legacy_remark || row.remark,
    clothingRemark: row.clothing_remark,
    batchRemark: row.batch_remark,
    status,
    snStatus: row.sn_status || row.status,
    clothingStatus: row.clothing_status,
    batchStatus: row.batch_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function legacyStyleById(db, id) {
  if (!id || !tableExists(db, 'garment_styles')) {
    return null;
  }

  return db.prepare('SELECT * FROM garment_styles WHERE id = ?').get(id);
}

function clothingDataFromLegacy(row, style) {
  return {
    product_name: cleanString(style?.product_name ?? row.product_name),
    fabric: cleanString(style?.fabric ?? row.fabric),
    standard: cleanString(style?.standard ?? row.standard),
    safety_category: cleanString(style?.safety_category ?? row.safety_category),
    grade: cleanString(style?.grade ?? row.grade),
    manufacturer: cleanString(style?.manufacturer ?? row.manufacturer),
    manufacturer_address: cleanString(
      style?.manufacturer_address ?? row.manufacturer_address
    ),
    care_instructions: cleanString(style?.care_instructions ?? row.care_instructions),
    remark: cleanString(style?.remark ?? row.remark),
    status: 'active'
  };
}

function batchDataFromLegacy(row, style, clothingId) {
  return {
    clothing_id: clothingId,
    style_no: cleanString(row.style_no ?? style?.style_no),
    color: cleanString(row.color ?? style?.color),
    size: cleanString(row.size ?? style?.size),
    batch_no: cleanString(row.batch_no),
    production_date: cleanString(row.production_date),
    remark: null,
    status: 'active'
  };
}

function findMatchingClothing(db, clothing) {
  const where = CLOTHING_COLUMNS.map((column) => `${column} IS ?`).join(' AND ');
  return db
    .prepare(`SELECT * FROM clothes WHERE ${where} LIMIT 1`)
    .get(...CLOTHING_COLUMNS.map((column) => clothing[column] ?? null));
}

function findMatchingBatch(db, batch) {
  const where = ['clothing_id', ...BATCH_COLUMNS].map((column) => `${column} IS ?`).join(' AND ');
  return db
    .prepare(`SELECT * FROM garment_batches WHERE ${where} LIMIT 1`)
    .get(...['clothing_id', ...BATCH_COLUMNS].map((column) => batch[column] ?? null));
}

function getOrCreateClothingForLegacy(db, row, style) {
  const clothing = clothingDataFromLegacy(row, style);
  const existing = findMatchingClothing(db, clothing);

  if (existing) {
    return existing;
  }

  return insertClothing(db, clothing);
}

function getOrCreateBatchForLegacy(db, row, style, clothingId) {
  const batch = batchDataFromLegacy(row, style, clothingId);
  const existing = findMatchingBatch(db, batch);

  if (existing) {
    return existing;
  }

  return insertBatch(db, batch);
}

function backfillThreeLayerData(db) {
  const rows = db
    .prepare('SELECT * FROM garments WHERE clothing_id IS NULL OR batch_id IS NULL')
    .all();
  const update = db.prepare(
    'UPDATE garments SET clothing_id = ?, batch_id = ?, updated_at = ? WHERE id = ?'
  );

  for (const row of rows) {
    const style = legacyStyleById(db, row.style_id);
    const clothing = getOrCreateClothingForLegacy(db, row, style);
    const batch = getOrCreateBatchForLegacy(db, row, style, clothing.id);
    update.run(clothing.id, batch.id, nowIso(), row.id);
  }
}
