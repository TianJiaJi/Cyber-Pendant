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
const VALID_USER_STATUSES = new Set(['active', 'banned']);
const LOST_REPORT_TTL_DAYS = 30;

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

function normalizeUserStatus(value, fallback = 'active') {
  return VALID_USER_STATUSES.has(value) ? value : fallback;
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

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT NOT NULL UNIQUE,
      nickname TEXT,
      avatar_url TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      banned_at TEXT,
      banned_reason TEXT,
      binding_count INTEGER NOT NULL DEFAULT 0,
      lost_report_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
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
      query_count INTEGER NOT NULL DEFAULT 0,
      student_name TEXT,
      student_school TEXT,
      student_class TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      owner_name TEXT,
      owner_phone_tail TEXT,
      owner_bound_at TEXT,
      bound_by_user_id INTEGER,
      lost_report_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS binding_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
      garment_sn TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_type TEXT NOT NULL DEFAULT 'user',
      action TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      before_data TEXT,
      after_data TEXT,
      changed_fields TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lost_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
      garment_sn TEXT NOT NULL,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      view_count INTEGER NOT NULL DEFAULT 0,
      contact_reveal_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      closed_at TEXT,
      close_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_reveal_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
      garment_sn TEXT NOT NULL,
      lost_report_id INTEGER REFERENCES lost_reports(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      source TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_clothes_status ON clothes(status);
    CREATE INDEX IF NOT EXISTS idx_garment_batches_clothing_id ON garment_batches(clothing_id);
    CREATE INDEX IF NOT EXISTS idx_garment_batches_status ON garment_batches(status);
    CREATE INDEX IF NOT EXISTS idx_garments_sn ON garments(sn);
    CREATE INDEX IF NOT EXISTS idx_garments_status ON garments(status);
    CREATE INDEX IF NOT EXISTS idx_binding_logs_garment ON binding_logs(garment_id);
    CREATE INDEX IF NOT EXISTS idx_binding_logs_user ON binding_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_binding_logs_created ON binding_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_lost_reports_garment ON lost_reports(garment_id);
    CREATE INDEX IF NOT EXISTS idx_lost_reports_reporter ON lost_reports(reporter_id);
    CREATE INDEX IF NOT EXISTS idx_lost_reports_status ON lost_reports(status);
    CREATE INDEX IF NOT EXISTS idx_contact_reveal_logs_garment ON contact_reveal_logs(garment_id);
  `);

  ensureGarmentColumn(db, 'clothing_id');
  ensureGarmentColumn(db, 'batch_id');
  ensureGarmentColumn(db, 'style_id');
  ensureGarmentQueryCountColumn(db);
  ensureGarmentBindingColumns(db);
  ensureGarmentIntegerColumn(db, 'bound_by_user_id');
  ensureGarmentIntegerColumn(db, 'lost_report_id');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_garments_clothing_id ON garments(clothing_id);
    CREATE INDEX IF NOT EXISTS idx_garments_batch_id ON garments(batch_id);
    CREATE INDEX IF NOT EXISTS idx_garments_bound_by ON garments(bound_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_garments_lost_report ON garments(lost_report_id);
  `);

  seedAdmin(db, config);
  seedDemoData(db);
  backfillThreeLayerData(db);
  ensureBindingLogsActorTypeColumn(db);
  ensureLostReportsColumns(db);
}

function ensureGarmentColumn(db, columnName) {
  if (!columnExists(db, 'garments', columnName)) {
    db.exec(`ALTER TABLE garments ADD COLUMN ${columnName} INTEGER;`);
  }
}

function ensureGarmentIntegerColumn(db, columnName) {
  ensureGarmentColumn(db, columnName);
}

function ensureGarmentQueryCountColumn(db) {
  if (!columnExists(db, 'garments', 'query_count')) {
    db.exec('ALTER TABLE garments ADD COLUMN query_count INTEGER NOT NULL DEFAULT 0;');
    return;
  }

  db.prepare('UPDATE garments SET query_count = 0 WHERE query_count IS NULL').run();
}

function ensureGarmentTextColumn(db, columnName) {
  if (!columnExists(db, 'garments', columnName)) {
    db.exec(`ALTER TABLE garments ADD COLUMN ${columnName} TEXT;`);
  }
}

function ensureGarmentBindingColumns(db) {
  ensureGarmentTextColumn(db, 'student_name');
  ensureGarmentTextColumn(db, 'student_school');
  ensureGarmentTextColumn(db, 'student_class');
  ensureGarmentTextColumn(db, 'contact_name');
  ensureGarmentTextColumn(db, 'contact_phone');
  ensureGarmentTextColumn(db, 'owner_name');
  ensureGarmentTextColumn(db, 'owner_phone_tail');
  ensureGarmentTextColumn(db, 'owner_bound_at');
}

function ensureBindingLogsActorTypeColumn(db) {
  if (!columnExists(db, 'binding_logs', 'actor_type')) {
    db.exec('ALTER TABLE binding_logs ADD COLUMN actor_type TEXT NOT NULL DEFAULT \'user\';');
  }
}

function ensureLostReportsColumns(db) {
  if (!columnExists(db, 'lost_reports', 'closed_at')) {
    db.exec('ALTER TABLE lost_reports ADD COLUMN closed_at TEXT;');
  }
  if (!columnExists(db, 'lost_reports', 'close_reason')) {
    db.exec('ALTER TABLE lost_reports ADD COLUMN close_reason TEXT;');
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

export function findUserByOpenid(db, openid) {
  return db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
}

export function findUserById(db, id) {
  const userId = cleanPositiveInteger(id);

  if (!userId) {
    return null;
  }

  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

export function createUser(db, input) {
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO users (
         openid,
         nickname,
         avatar_url,
         phone,
         status,
         created_at,
         updated_at,
         last_login_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      cleanString(input.openid),
      cleanString(input.nickname) || '微信用户',
      cleanString(input.avatarUrl || input.avatar_url),
      cleanString(input.phone),
      normalizeUserStatus(input.status),
      timestamp,
      timestamp,
      timestamp
    );

  return findUserById(db, Number(result.lastInsertRowid));
}

export function updateUserLastLogin(db, userId) {
  const timestamp = nowIso();
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(
    timestamp,
    timestamp,
    userId
  );

  return findUserById(db, userId);
}

export function setUserStatus(db, userId, status, reason = null) {
  const id = cleanPositiveInteger(userId);

  if (!id) {
    return null;
  }

  const normalized = normalizeUserStatus(status);
  const timestamp = nowIso();
  db.prepare(
    `UPDATE users
     SET status = ?,
         banned_at = ?,
         banned_reason = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    normalized,
    normalized === 'banned' ? timestamp : null,
    normalized === 'banned' ? cleanString(reason) : null,
    timestamp,
    id
  );

  return findUserById(db, id);
}

function desensitizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length < 7) {
    return digits || null;
  }

  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function toUserDto(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    openid: user.openid,
    nickname: user.nickname || '微信用户',
    avatarUrl: user.avatar_url || null,
    phone: user.phone ? desensitizePhone(user.phone) : null,
    status: user.status,
    bindingCount: Number(user.binding_count || 0),
    lostReportCount: Number(user.lost_report_count || 0),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at
  };
}

function refreshUserCounts(db, userId) {
  const id = cleanPositiveInteger(userId);

  if (!id) {
    return;
  }

  const timestamp = nowIso();
  db.prepare(
    `UPDATE users
     SET binding_count = (
           SELECT COUNT(*)
           FROM garments
           WHERE bound_by_user_id = users.id AND owner_bound_at IS NOT NULL
         ),
         lost_report_count = (
           SELECT COUNT(*)
           FROM lost_reports
           WHERE reporter_id = users.id AND status = 'active' AND datetime(expires_at) > datetime('now')
         ),
         updated_at = ?
     WHERE id = ?`
  ).run(timestamp, id);
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

export function incrementGarmentQueryCount(db, sn) {
  db.prepare(
    'UPDATE garments SET query_count = COALESCE(query_count, 0) + 1 WHERE sn = ?'
  ).run(sn);

  return findGarmentDetailBySn(db, sn);
}

function bindingSnapshot(row) {
  if (!row || !(row.owner_bound_at || row.student_name || row.bound_by_user_id)) {
    return null;
  }

  return {
    studentName: row.student_name || row.owner_name,
    studentSchool: row.student_school,
    studentClass: row.student_class,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    boundByUserId: row.bound_by_user_id,
    boundAt: row.owner_bound_at
  };
}

function insertBindingLog(db, input) {
  db.prepare(
    `INSERT INTO binding_logs (
       garment_id,
       garment_sn,
       user_id,
       actor_type,
       action,
       ip_address,
       user_agent,
       before_data,
       after_data,
       changed_fields,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.garmentId,
    input.garmentSn,
    input.userId || null,
    input.actorType || 'user',
    input.action,
    input.ipAddress || null,
    input.userAgent || null,
    input.beforeData ? JSON.stringify(input.beforeData) : null,
    input.afterData ? JSON.stringify(input.afterData) : null,
    input.changedFields ? JSON.stringify(input.changedFields) : null,
    nowIso()
  );
}

function bindingChangedFields(before, after) {
  const fields = ['studentName', 'studentSchool', 'studentClass', 'contactName', 'contactPhone'];
  return fields.filter((field) => before?.[field] !== after?.[field]);
}

export function bindGarmentOwner(db, sn, binding, options = {}) {
  const timestamp = nowIso();
  const beforeRow = findGarmentDetailBySn(db, sn);
  const result = db
    .prepare(
      `UPDATE garments
       SET student_name = ?,
           student_school = ?,
           student_class = ?,
           contact_name = ?,
           contact_phone = ?,
           owner_name = ?,
           owner_phone_tail = ?,
           owner_bound_at = ?,
           bound_by_user_id = ?,
           updated_at = ?
       WHERE sn = ? AND owner_bound_at IS NULL AND student_name IS NULL AND bound_by_user_id IS NULL`
    )
    .run(
      binding.studentName,
      binding.studentSchool,
      binding.studentClass,
      binding.contactName,
      binding.contactPhone,
      binding.ownerName,
      binding.ownerPhoneTail,
      timestamp,
      options.userId || null,
      timestamp,
      sn
    );
  const garment = findGarmentDetailBySn(db, sn);

  if (result.changes > 0) {
    insertBindingLog(db, {
      garmentId: garment.id,
      garmentSn: garment.sn,
      userId: options.userId,
      actorType: options.actorType || 'user',
      action: 'bind',
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      beforeData: bindingSnapshot(beforeRow),
      afterData: bindingSnapshot(garment),
      changedFields: bindingChangedFields(bindingSnapshot(beforeRow), bindingSnapshot(garment))
    });
    refreshUserCounts(db, options.userId);
  }

  return {
    changed: result.changes > 0,
    garment
  };
}

export function updateGarmentOwnerBinding(db, sn, binding, options = {}) {
  const timestamp = nowIso();
  const beforeRow = findGarmentDetailBySn(db, sn);
  const result = db
    .prepare(
      `UPDATE garments
       SET student_name = ?,
           student_school = ?,
           student_class = ?,
           contact_name = ?,
           contact_phone = ?,
           owner_name = ?,
           owner_phone_tail = ?,
           updated_at = ?
       WHERE sn = ? AND owner_bound_at IS NOT NULL`
    )
    .run(
      binding.studentName,
      binding.studentSchool,
      binding.studentClass,
      binding.contactName,
      binding.contactPhone,
      binding.ownerName,
      binding.ownerPhoneTail,
      timestamp,
      sn
    );
  const garment = findGarmentDetailBySn(db, sn);

  if (result.changes > 0) {
    insertBindingLog(db, {
      garmentId: garment.id,
      garmentSn: garment.sn,
      userId: options.userId,
      actorType: options.actorType || 'user',
      action: 'modify',
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      beforeData: bindingSnapshot(beforeRow),
      afterData: bindingSnapshot(garment),
      changedFields: bindingChangedFields(bindingSnapshot(beforeRow), bindingSnapshot(garment))
    });
  }

  return {
    changed: result.changes > 0,
    garment
  };
}

export function unbindGarmentOwner(db, sn, options = {}) {
  const timestamp = nowIso();
  const beforeRow = findGarmentDetailBySn(db, sn);
  const result = db
    .prepare(
      `UPDATE garments
       SET student_name = NULL,
           student_school = NULL,
           student_class = NULL,
           contact_name = NULL,
           contact_phone = NULL,
           owner_name = NULL,
           owner_phone_tail = NULL,
           owner_bound_at = NULL,
           bound_by_user_id = NULL,
           lost_report_id = NULL,
           updated_at = ?
       WHERE sn = ?`
    )
    .run(timestamp, sn);
  const garment = findGarmentDetailBySn(db, sn);

  if (result.changes > 0) {
    db.prepare(
      `UPDATE lost_reports
       SET status = 'cancelled',
           closed_at = ?,
           close_reason = 'binding_removed',
           updated_at = ?
       WHERE garment_id = ? AND status = 'active'`
    ).run(timestamp, timestamp, beforeRow.id);
    insertBindingLog(db, {
      garmentId: beforeRow.id,
      garmentSn: beforeRow.sn,
      userId: options.userId || beforeRow.bound_by_user_id,
      actorType: options.actorType || 'user',
      action: 'unbind',
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      beforeData: bindingSnapshot(beforeRow),
      afterData: null,
      changedFields: Object.keys(bindingSnapshot(beforeRow) || {})
    });
    refreshUserCounts(db, options.userId || beforeRow.bound_by_user_id);
  }

  return {
    changed: result.changes > 0,
    garment
  };
}

export function listUserGarments(db, userId) {
  const id = cleanPositiveInteger(userId);

  if (!id) {
    return [];
  }

  return db
    .prepare(
      `SELECT sn
       FROM garments
       WHERE bound_by_user_id = ?
       ORDER BY owner_bound_at DESC, id DESC`
    )
    .all(id)
    .map((row) => findGarmentDetailBySn(db, row.sn));
}

export function listUserBindingLogs(db, userId) {
  const id = cleanPositiveInteger(userId);

  if (!id) {
    return [];
  }

  return db
    .prepare(
      `SELECT *
       FROM binding_logs
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 200`
    )
    .all(id);
}

export function createLostReport(db, sn, reporterId, note = null) {
  const garment = findGarmentDetailBySn(db, sn);
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + LOST_REPORT_TTL_DAYS * 24 * 60 * 60 * 1000)
    .toISOString();

  db.prepare(
    `UPDATE lost_reports
     SET status = 'cancelled',
         closed_at = ?,
         close_reason = 'replaced',
         updated_at = ?
     WHERE garment_id = ? AND status = 'active'`
  ).run(timestamp, timestamp, garment.id);

  const result = db
    .prepare(
      `INSERT INTO lost_reports (
         garment_id,
         garment_sn,
         reporter_id,
         note,
         status,
         expires_at,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
    )
    .run(garment.id, garment.sn, reporterId, cleanString(note), expiresAt, timestamp, timestamp);

  db.prepare('UPDATE garments SET lost_report_id = ?, updated_at = ? WHERE id = ?').run(
    Number(result.lastInsertRowid),
    timestamp,
    garment.id
  );
  refreshUserCounts(db, reporterId);

  return findLostReportById(db, Number(result.lastInsertRowid));
}

export function findLostReportById(db, id) {
  const reportId = cleanPositiveInteger(id);

  if (!reportId) {
    return null;
  }

  return db.prepare('SELECT * FROM lost_reports WHERE id = ?').get(reportId);
}

export function findActiveLostReportByGarmentId(db, garmentId) {
  const id = cleanPositiveInteger(garmentId);

  if (!id) {
    return null;
  }

  return db
    .prepare(
      `SELECT *
       FROM lost_reports
       WHERE garment_id = ?
         AND status = 'active'
         AND datetime(expires_at) > datetime('now')
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    )
    .get(id);
}

export function closeLostReport(db, sn, options = {}) {
  const garment = findGarmentDetailBySn(db, sn);
  const active = findActiveLostReportByGarmentId(db, garment.id);

  if (!active) {
    return null;
  }

  const timestamp = nowIso();
  db.prepare(
    `UPDATE lost_reports
     SET status = ?,
         closed_at = ?,
         close_reason = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(options.status || 'cancelled', timestamp, options.reason || 'cancelled', timestamp, active.id);
  db.prepare('UPDATE garments SET lost_report_id = NULL, updated_at = ? WHERE id = ?').run(
    timestamp,
    garment.id
  );
  refreshUserCounts(db, active.reporter_id);

  return findLostReportById(db, active.id);
}

export function listUserLostReports(db, userId) {
  const id = cleanPositiveInteger(userId);

  if (!id) {
    return [];
  }

  return db
    .prepare(
      `SELECT lr.*, g.sn
       FROM lost_reports lr
       JOIN garments g ON g.id = lr.garment_id
       WHERE lr.reporter_id = ?
       ORDER BY lr.created_at DESC, lr.id DESC
       LIMIT 200`
    )
    .all(id);
}

export function recordContactReveal(db, sn, options = {}) {
  const garment = findGarmentDetailBySn(db, sn);
  const report = findActiveLostReportByGarmentId(db, garment.id);

  if (!report) {
    return null;
  }

  const timestamp = nowIso();
  db.prepare(
    `UPDATE lost_reports
     SET contact_reveal_count = contact_reveal_count + 1,
         view_count = view_count + 1,
         updated_at = ?
     WHERE id = ?`
  ).run(timestamp, report.id);
  db.prepare(
    `INSERT INTO contact_reveal_logs (
       garment_id,
       garment_sn,
       lost_report_id,
       user_id,
       source,
       ip_address,
       user_agent,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    garment.id,
    garment.sn,
    report.id,
    options.userId || null,
    cleanString(options.source),
    options.ipAddress || null,
    options.userAgent || null,
    timestamp
  );

  return findGarmentDetailBySn(db, sn);
}

export function listAdminUsers(db) {
  return db
    .prepare(
      `SELECT *
       FROM users
       ORDER BY created_at DESC, id DESC
       LIMIT 500`
    )
    .all();
}

export function getAdminStats(db) {
  const users = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS banned
       FROM users`
    )
    .get();
  const garments = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN owner_bound_at IS NOT NULL THEN 1 ELSE 0 END) AS bound,
         SUM(CASE WHEN lr.id IS NOT NULL THEN 1 ELSE 0 END) AS lost
       FROM garments g
       LEFT JOIN lost_reports lr
         ON lr.garment_id = g.id
        AND lr.status = 'active'
        AND datetime(lr.expires_at) > datetime('now')`
    )
    .get();
  const reports = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'active' AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'found' THEN 1 ELSE 0 END) AS found,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM lost_reports`
    )
    .get();
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const today = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM contact_reveal_logs WHERE created_at LIKE ?) AS views,
         (SELECT COUNT(*) FROM binding_logs WHERE created_at LIKE ? AND action IN ('bind', 'modify')) AS bindings`
    )
    .get(`${todayPrefix}%`, `${todayPrefix}%`);

  return {
    users: {
      total: Number(users.total || 0),
      active: Number(users.active || 0),
      banned: Number(users.banned || 0)
    },
    garments: {
      total: Number(garments.total || 0),
      bound: Number(garments.bound || 0),
      lost: Number(garments.lost || 0)
    },
    reports: {
      active: Number(reports.active || 0),
      found: Number(reports.found || 0),
      cancelled: Number(reports.cancelled || 0)
    },
    today: {
      views: Number(today.views || 0),
      bindings: Number(today.bindings || 0)
    }
  };
}

export function exportRows(db, type) {
  const queries = {
    users: `SELECT id, openid, nickname, status, binding_count, lost_report_count, created_at, last_login_at FROM users ORDER BY id`,
    garments: `SELECT id, sn, status, bound_by_user_id, owner_bound_at, query_count, created_at, updated_at FROM garments ORDER BY id`,
    reports: `SELECT id, garment_sn, reporter_id, status, note, view_count, contact_reveal_count, expires_at, created_at, updated_at FROM lost_reports ORDER BY id`,
    'binding-logs': `SELECT id, garment_sn, user_id, actor_type, action, changed_fields, created_at FROM binding_logs ORDER BY id`
  };
  const sql = queries[type];

  if (!sql) {
    return null;
  }

  return db.prepare(sql).all();
}

export function findGarmentDetailBySn(db, sn) {
  return db
    .prepare(
      `SELECT
         g.id,
         g.sn,
         g.status AS sn_status,
         g.query_count,
         g.student_name,
         g.student_school,
         g.student_class,
         g.contact_name,
         g.contact_phone,
         g.owner_name,
         g.owner_phone_tail,
         g.owner_bound_at,
         g.bound_by_user_id,
         g.lost_report_id AS garment_lost_report_id,
         g.created_at,
         g.updated_at,
         lr.id AS lost_report_id,
         lr.reporter_id AS lost_reporter_id,
         lr.note AS lost_report_note,
         lr.status AS lost_report_status,
         lr.view_count AS lost_report_view_count,
         lr.contact_reveal_count AS lost_report_contact_reveal_count,
         lr.expires_at AS lost_report_expires_at,
         lr.created_at AS lost_report_created_at,
         lr.updated_at AS lost_report_updated_at,
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
       LEFT JOIN lost_reports lr
         ON lr.garment_id = g.id
        AND lr.status = 'active'
        AND datetime(lr.expires_at) > datetime('now')
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

function maskOwnerName(value) {
  const chars = Array.from(String(value || '').trim());

  if (chars.length === 0) {
    return null;
  }

  return `${chars[0]}${'*'.repeat(Math.max(1, Math.min(chars.length - 1, 2)))}`;
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

export function toBindingLogDto(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    garmentId: row.garment_id,
    garmentSn: row.garment_sn,
    userId: row.user_id,
    actorType: row.actor_type,
    action: row.action,
    beforeData: row.before_data ? JSON.parse(row.before_data) : null,
    afterData: row.after_data ? JSON.parse(row.after_data) : null,
    changedFields: row.changed_fields ? JSON.parse(row.changed_fields) : [],
    createdAt: row.created_at
  };
}

export function toLostReportDto(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    garmentId: row.garment_id,
    garmentSn: row.garment_sn,
    reporterId: row.reporter_id,
    note: row.note,
    status: row.status,
    viewCount: Number(row.view_count || 0),
    contactRevealCount: Number(row.contact_reveal_count || 0),
    expiresAt: row.expires_at,
    closedAt: row.closed_at,
    closeReason: row.close_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toGarmentDto(row, options = {}) {
  if (!row) {
    return null;
  }

  const status = row.sn_status ? effectiveStatus(row) : row.status;
  const studentName = row.student_name || row.owner_name;
  const school = row.student_school || null;
  const className = row.student_class || null;
  const contactName = row.contact_name || null;
  const contactPhone = row.contact_phone || null;
  const phoneTail =
    row.owner_phone_tail || String(contactPhone || '').replace(/\D/g, '').slice(-4) || null;
  const boundAt = row.owner_bound_at || null;
  const isBound = Boolean(boundAt || studentName);
  const isOwner = Boolean(
    options.viewerUserId && row.bound_by_user_id && Number(options.viewerUserId) === Number(row.bound_by_user_id)
  );
  const hasActiveLostReport = Boolean(row.lost_report_id);
  const showOwnerSummary = Boolean(
    options.showOwnerSummary || options.privateBinding || options.showContact
  );
  const showContact = Boolean(options.showContact || options.privateBinding);
  const owner = isBound && showOwnerSummary
    ? {
        name: maskOwnerName(studentName),
        school,
        className,
        phoneTail,
        boundAt
      }
    : null;

  if (owner && showContact) {
    owner.studentName = studentName;
    owner.contactName = contactName;
    owner.contactPhone = contactPhone;
  }

  const binding =
    options.privateBinding && isBound
      ? {
          studentName,
          school,
          className,
          contactName,
          contactPhone,
          phoneTail,
          boundAt
        }
      : null;
  const lostReport = hasActiveLostReport
    ? {
        id: row.lost_report_id,
        reporterId: row.lost_reporter_id,
        note: row.lost_report_note,
        status: row.lost_report_status,
        viewCount: Number(row.lost_report_view_count || 0),
        contactRevealCount: Number(row.lost_report_contact_reveal_count || 0),
        expiresAt: row.lost_report_expires_at,
        createdAt: row.lost_report_created_at,
        updatedAt: row.lost_report_updated_at
      }
    : null;

  const dto = {
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
    queryCount: Number(row.query_count || 0),
    isBound,
    isOwner,
    boundByUserId: options.privateBinding ? row.bound_by_user_id || null : undefined,
    owner,
    lostReport,
    status,
    snStatus: row.sn_status || row.status,
    clothingStatus: row.clothing_status,
    batchStatus: row.batch_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (options.privateBinding) {
    dto.binding = binding;
  }

  return dto;
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
