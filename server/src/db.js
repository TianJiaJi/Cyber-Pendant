import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';

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

const EDITABLE_COLUMNS = Object.values(FIELD_MAP);
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

    CREATE TABLE IF NOT EXISTS garments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    CREATE INDEX IF NOT EXISTS idx_garments_sn ON garments(sn);
    CREATE INDEX IF NOT EXISTS idx_garments_status ON garments(status);
  `);

  seedAdmin(db, config);
  seedDemoGarment(db);
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

function seedDemoGarment(db) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM garments').get().count;

  if (count > 0) {
    return;
  }

  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO garments (
      sn,
      product_name,
      style_no,
      color,
      size,
      fabric,
      standard,
      safety_category,
      grade,
      manufacturer,
      manufacturer_address,
      care_instructions,
      batch_no,
      production_date,
      remark,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'CP20260615DEMO01',
    '高级梭织外套',
    'CP-JK-2601',
    '石墨黑',
    'M',
    '面料：羊毛 58%，聚酯纤维 38%，氨纶 4%；里料：聚酯纤维 100%',
    'GB/T 2664-2017',
    'GB 18401-2010 B 类',
    '一等品',
    '赛博衣饰制造有限公司',
    '广东省深圳市南山区科技园示范路 88 号',
    '不可漂白；悬挂晾干；低温熨烫；建议专业干洗。',
    'BATCH-202606-A01',
    '2026-06-15',
    '演示数据，可在后台编辑或停用。',
    'active',
    createdAt,
    createdAt
  );
}

export function findAdminByUsername(db, username) {
  return db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
}

export function findGarmentBySn(db, sn) {
  return db.prepare('SELECT * FROM garments WHERE sn = ?').get(sn);
}

export function listGarments(db, query = '') {
  const keyword = cleanString(query);

  if (!keyword) {
    return db
      .prepare('SELECT * FROM garments ORDER BY created_at DESC, id DESC LIMIT 200')
      .all();
  }

  const like = `%${keyword}%`;
  return db
    .prepare(
      `SELECT * FROM garments
       WHERE sn LIKE ?
          OR product_name LIKE ?
          OR style_no LIKE ?
          OR manufacturer LIKE ?
       ORDER BY created_at DESC, id DESC
       LIMIT 200`
    )
    .all(like, like, like, like);
}

export function normalizeGarmentInput(input = {}, options = {}) {
  const output = {};

  for (const [field, column] of Object.entries(FIELD_MAP)) {
    if (Object.hasOwn(input, field)) {
      output[column] = cleanString(input[field]);
    } else if (Object.hasOwn(input, column)) {
      output[column] = cleanString(input[column]);
    } else if (!options.partial) {
      output[column] = null;
    }
  }

  if (Object.hasOwn(input, 'status')) {
    output.status = VALID_STATUSES.has(input.status) ? input.status : 'active';
  } else if (!options.partial) {
    output.status = 'active';
  }

  return output;
}

export function validateGarmentForCreate(garment) {
  const required = [
    ['product_name', '品名'],
    ['fabric', '面料'],
    ['standard', '执行标准'],
    ['manufacturer', '厂家']
  ];

  for (const [field, label] of required) {
    if (!garment[field]) {
      return `${label}不能为空`;
    }
  }

  return null;
}

export function insertGarment(db, sn, garment) {
  const createdAt = nowIso();
  const row = {
    ...garment,
    sn,
    created_at: createdAt,
    updated_at: createdAt
  };
  const columns = ['sn', ...EDITABLE_COLUMNS, 'status', 'created_at', 'updated_at'];
  const placeholders = columns.map(() => '?').join(', ');

  db.prepare(
    `INSERT INTO garments (${columns.join(', ')}) VALUES (${placeholders})`
  ).run(...columns.map((column) => row[column] ?? null));

  return findGarmentBySn(db, sn);
}

export function updateGarment(db, sn, patch) {
  const allowedColumns = [...EDITABLE_COLUMNS, 'status'];
  const columns = allowedColumns.filter((column) => Object.hasOwn(patch, column));

  if (columns.length === 0) {
    return findGarmentBySn(db, sn);
  }

  const assignments = columns.map((column) => `${column} = ?`);
  const values = columns.map((column) => patch[column] ?? null);
  values.push(nowIso(), sn);

  db.prepare(
    `UPDATE garments SET ${assignments.join(', ')}, updated_at = ? WHERE sn = ?`
  ).run(...values);

  return findGarmentBySn(db, sn);
}

export function toGarmentDto(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sn: row.sn,
    productName: row.product_name,
    styleNo: row.style_no,
    color: row.color,
    size: row.size,
    fabric: row.fabric,
    standard: row.standard,
    safetyCategory: row.safety_category,
    grade: row.grade,
    manufacturer: row.manufacturer,
    manufacturerAddress: row.manufacturer_address,
    careInstructions: row.care_instructions,
    batchNo: row.batch_no,
    productionDate: row.production_date,
    remark: row.remark,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
