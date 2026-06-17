import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/api.js';

async function startTestServer(options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cyber-pendant-'));
  const app = createApp({
    databasePath: options.databasePath || path.join(dir, 'test.sqlite'),
    adminUsername: 'admin',
    adminPassword: 'secret123',
    tokenSecret: 'test-secret',
    frontendBaseUrl: 'http://localhost:5173',
    ...options
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  return {
    ...app,
    baseUrl,
    close: () => new Promise((resolve) => app.server.close(resolve))
  };
}

async function loginAsAdmin(baseUrl) {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'secret123' })
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.ok(token);
  return token;
}

async function postJson(url, token, body) {
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function putJson(url, token, body) {
  return fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function createTestClothing(baseUrl, token, overrides = {}) {
  const response = await postJson(`${baseUrl}/api/clothes`, token, {
    productName: '测试风衣',
    fabric: '棉 70%，锦纶 30%',
    standard: 'GB/T 2664-2017',
    safetyCategory: 'GB 18401-2010 B 类',
    grade: '一等品',
    manufacturer: '测试制造有限公司',
    manufacturerAddress: '深圳市南山区测试路 1 号',
    careInstructions: '低温熨烫',
    remark: '主档备注',
    ...overrides
  });
  assert.equal(response.status, 201);
  return (await response.json()).clothing;
}

async function createTestBatch(baseUrl, token, clothingId, overrides = {}) {
  const response = await postJson(
    `${baseUrl}/api/clothes/${clothingId}/batches`,
    token,
    {
      styleNo: 'BATCH-JK-01',
      color: '夜蓝',
      size: 'M',
      batchNo: 'BATCH-202606-B01',
      productionDate: '2026-06-16',
      remark: '批次备注',
      count: 3,
      ...overrides
    }
  );
  assert.equal(response.status, 201);
  return (await response.json()).batch;
}

test('auth, legacy single create, duplicate SN, public lookup, QR code, and SN delete', async (t) => {
  const app = await startTestServer();
  t.after(app.close);

  const unauthorized = await fetch(`${app.baseUrl}/api/clothes`);
  assert.equal(unauthorized.status, 401);

  const token = await loginAsAdmin(app.baseUrl);

  const generated = await fetch(`${app.baseUrl}/api/sn/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(generated.status, 200);
  const { sn } = await generated.json();
  assert.match(sn, /^CP\d{8}[A-Z2-9]{6}$/);

  const created = await postJson(`${app.baseUrl}/api/garments`, token, {
    sn,
    productName: '单条测试外套',
    styleNo: 'SINGLE-JK-01',
    fabric: '棉 70%，锦纶 30%',
    standard: 'GB/T 2664-2017',
    manufacturer: '测试制造有限公司',
    safetyCategory: 'GB 18401-2010 B 类',
    grade: '一等品'
  });
  assert.equal(created.status, 201);
  const createdGarment = (await created.json()).garment;
  assert.equal(createdGarment.sn, sn);
  assert.ok(createdGarment.clothingId);
  assert.ok(createdGarment.batchId);

  const duplicate = await postJson(`${app.baseUrl}/api/garments`, token, {
    sn,
    productName: '重复记录',
    styleNo: 'DUP-JK-01',
    fabric: '棉',
    standard: 'GB/T 2664-2017',
    manufacturer: '测试制造有限公司'
  });
  assert.equal(duplicate.status, 409);

  const publicLookup = await fetch(`${app.baseUrl}/api/garments/${sn}`);
  assert.equal(publicLookup.status, 200);
  const publicGarment = (await publicLookup.json()).garment;
  assert.equal(publicGarment.productName, '单条测试外套');
  assert.equal(publicGarment.styleNo, 'SINGLE-JK-01');
  assert.equal(publicGarment.queryCount, 1);

  const previewLookup = await fetch(`${app.baseUrl}/api/garments/${sn}?track=0`);
  assert.equal(previewLookup.status, 200);
  assert.equal((await previewLookup.json()).garment.queryCount, 1);

  const qr = await fetch(`${app.baseUrl}/api/qrcode/${sn}?type=url`);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.ok((await qr.arrayBuffer()).byteLength > 1000);

  const inactive = await fetch(`${app.baseUrl}/api/garments/${sn}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(inactive.status, 200);

  const inactiveLookup = await fetch(`${app.baseUrl}/api/garments/${sn}`);
  assert.equal(inactiveLookup.status, 423);
  const inactiveGarment = (await inactiveLookup.json()).garment;
  assert.equal(inactiveGarment.status, 'inactive');
  assert.equal(inactiveGarment.queryCount, 2);

  const reactivated = await putJson(`${app.baseUrl}/api/garments/${sn}`, token, {
    status: 'active'
  });
  assert.equal(reactivated.status, 200);

  const hardDeleted = await fetch(`${app.baseUrl}/api/garments/${sn}?hard=1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(hardDeleted.status, 200);

  const missingLookup = await fetch(`${app.baseUrl}/api/garments/${sn}`);
  assert.equal(missingLookup.status, 404);
});

test('clothes CRUD, batch SN creation, filters, and live upper-layer edits', async (t) => {
  const app = await startTestServer();
  t.after(app.close);
  const token = await loginAsAdmin(app.baseUrl);

  const unauthorizedBatch = await fetch(`${app.baseUrl}/api/clothes/1/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: 1, styleNo: 'NOAUTH' })
  });
  assert.equal(unauthorizedBatch.status, 401);

  const clothing = await createTestClothing(app.baseUrl, token, {
    productName: '批量测试外套'
  });
  assert.equal(clothing.garmentCount, 0);

  const listed = await fetch(`${app.baseUrl}/api/clothes?q=${encodeURIComponent('批量测试')}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(listed.status, 200);
  const listedClothing = (await listed.json()).clothes.find(
    (item) => item.id === clothing.id
  );
  assert.ok(listedClothing);
  assert.equal(listedClothing.batchCount, 0);

  const updatedClothing = await putJson(`${app.baseUrl}/api/clothes/${clothing.id}`, token, {
    manufacturerAddress: '深圳市南山区更新路 2 号'
  });
  assert.equal(updatedClothing.status, 200);
  assert.equal(
    (await updatedClothing.json()).clothing.manufacturerAddress,
    '深圳市南山区更新路 2 号'
  );

  const batch = await createTestBatch(app.baseUrl, token, clothing.id);
  assert.equal(batch.garments.length, 3);
  assert.equal(new Set(batch.garments.map((garment) => garment.sn)).size, 3);
  assert.ok(batch.garments.every((garment) => garment.clothingId === clothing.id));
  assert.ok(batch.garments.every((garment) => garment.batchId === batch.id));
  assert.ok(batch.garments.every((garment) => garment.batchNo === 'BATCH-202606-B01'));
  assert.ok(batch.garments.every((garment) => garment.productionDate === '2026-06-16'));

  const secondBatch = await createTestBatch(app.baseUrl, token, clothing.id, {
    styleNo: 'BATCH-JK-02',
    batchNo: 'BATCH-202606-B02',
    count: 1
  });
  assert.notEqual(secondBatch.id, batch.id);

  const publicBeforeEdit = await fetch(
    `${app.baseUrl}/api/garments/${batch.garments[0].sn}`
  );
  assert.equal(publicBeforeEdit.status, 200);
  assert.equal((await publicBeforeEdit.json()).garment.manufacturerAddress, '深圳市南山区更新路 2 号');

  const renamedClothing = await putJson(`${app.baseUrl}/api/clothes/${clothing.id}`, token, {
    productName: '已改名外套'
  });
  assert.equal(renamedClothing.status, 200);

  const editedBatch = await putJson(`${app.baseUrl}/api/batches/${batch.id}`, token, {
    styleNo: 'UPDATED-JK-01',
    batchNo: 'UPDATED-BATCH'
  });
  assert.equal(editedBatch.status, 200);

  const publicAfterEdit = await fetch(
    `${app.baseUrl}/api/garments/${batch.garments[0].sn}`
  );
  assert.equal(publicAfterEdit.status, 200);
  const editedGarment = (await publicAfterEdit.json()).garment;
  assert.equal(editedGarment.productName, '已改名外套');
  assert.equal(editedGarment.styleNo, 'UPDATED-JK-01');
  assert.equal(editedGarment.batchNo, 'UPDATED-BATCH');

  const byClothing = await fetch(
    `${app.baseUrl}/api/garments?clothingId=${clothing.id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(byClothing.status, 200);
  assert.equal((await byClothing.json()).garments.length, 4);

  const byBatch = await fetch(`${app.baseUrl}/api/garments?batchId=${batch.id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(byBatch.status, 200);
  assert.equal((await byBatch.json()).garments.length, 3);

  const batches = await fetch(`${app.baseUrl}/api/clothes/${clothing.id}/batches`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(batches.status, 200);
  assert.equal((await batches.json()).batches.length, 2);
});

test('soft and hard delete behavior for SN, batch, and clothing', async (t) => {
  const app = await startTestServer();
  t.after(app.close);
  const token = await loginAsAdmin(app.baseUrl);

  const clothing = await createTestClothing(app.baseUrl, token, {
    productName: '删除测试外套'
  });
  const batch = await createTestBatch(app.baseUrl, token, clothing.id, { count: 1 });
  const sn = batch.garments[0].sn;

  const batchInactive = await fetch(`${app.baseUrl}/api/batches/${batch.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(batchInactive.status, 200);
  assert.equal((await fetch(`${app.baseUrl}/api/garments/${sn}`)).status, 423);

  const batchActive = await putJson(`${app.baseUrl}/api/batches/${batch.id}`, token, {
    status: 'active'
  });
  assert.equal(batchActive.status, 200);
  assert.equal((await fetch(`${app.baseUrl}/api/garments/${sn}`)).status, 200);

  const clothingInactive = await fetch(`${app.baseUrl}/api/clothes/${clothing.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(clothingInactive.status, 200);
  assert.equal((await fetch(`${app.baseUrl}/api/garments/${sn}`)).status, 423);

  const clothingActive = await putJson(`${app.baseUrl}/api/clothes/${clothing.id}`, token, {
    status: 'active'
  });
  assert.equal(clothingActive.status, 200);
  assert.equal((await fetch(`${app.baseUrl}/api/garments/${sn}`)).status, 200);

  const hardBatch = await createTestBatch(app.baseUrl, token, clothing.id, {
    styleNo: 'HARD-BATCH',
    batchNo: 'HARD-BATCH-001',
    count: 1
  });
  const hardBatchSn = hardBatch.garments[0].sn;
  const hardDeletedBatch = await fetch(`${app.baseUrl}/api/batches/${hardBatch.id}?hard=1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(hardDeletedBatch.status, 200);
  assert.equal((await fetch(`${app.baseUrl}/api/garments/${hardBatchSn}`)).status, 404);

  const hardClothing = await createTestClothing(app.baseUrl, token, {
    productName: '真删除衣服'
  });
  const hardClothingBatch = await createTestBatch(app.baseUrl, token, hardClothing.id, {
    count: 1
  });
  const hardClothingSn = hardClothingBatch.garments[0].sn;
  const hardDeletedClothing = await fetch(
    `${app.baseUrl}/api/clothes/${hardClothing.id}?hard=1`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  assert.equal(hardDeletedClothing.status, 200);
  assert.equal((await fetch(`${app.baseUrl}/api/garments/${hardClothingSn}`)).status, 404);
});

test('migration backfills legacy garment_styles and garments into clothes and batches', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cyber-pendant-legacy-'));
  const databasePath = path.join(dir, 'legacy.sqlite');
  const db = new DatabaseSync(databasePath);
  const createdAt = new Date().toISOString();

  db.exec(`
    CREATE TABLE garment_styles (
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

    CREATE TABLE garments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  `);

  const styleResult = db
    .prepare(
      `INSERT INTO garment_styles (
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
        remark,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      '旧数据风衣',
      'LEGACY-JK-01',
      '黑色',
      'L',
      '棉',
      'GB/T 2664-2017',
      'GB 18401-2010 B 类',
      '一等品',
      '旧制造有限公司',
      '旧地址',
      '手洗',
      '旧款式备注',
      createdAt,
      createdAt
    );

  const insertLegacyGarment = db.prepare(`
    INSERT INTO garments (
      style_id,
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const sn of ['CP20260616LEG001', 'CP20260616LEG002']) {
    insertLegacyGarment.run(
      Number(styleResult.lastInsertRowid),
      sn,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'LEGACY-BATCH',
      '2026-06-01',
      '旧备注',
      'active',
      createdAt,
      createdAt
    );
  }
  db.close();

  const app = await startTestServer({ databasePath });
  t.after(app.close);
  const token = await loginAsAdmin(app.baseUrl);

  const clothes = await fetch(`${app.baseUrl}/api/clothes?q=${encodeURIComponent('旧数据')}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(clothes.status, 200);
  const clothing = (await clothes.json()).clothes.find(
    (item) => item.productName === '旧数据风衣'
  );
  assert.ok(clothing);
  assert.equal(clothing.batchCount, 1);
  assert.equal(clothing.garmentCount, 2);

  const batches = await fetch(`${app.baseUrl}/api/clothes/${clothing.id}/batches`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(batches.status, 200);
  const batch = (await batches.json()).batches[0];
  assert.equal(batch.styleNo, 'LEGACY-JK-01');
  assert.equal(batch.batchNo, 'LEGACY-BATCH');
  assert.equal(batch.garments.length, 2);

  const publicLookup = await fetch(`${app.baseUrl}/api/garments/CP20260616LEG001`);
  assert.equal(publicLookup.status, 200);
  const garment = (await publicLookup.json()).garment;
  assert.equal(garment.productName, '旧数据风衣');
  assert.equal(garment.styleNo, 'LEGACY-JK-01');
  assert.equal(garment.batchNo, 'LEGACY-BATCH');
});
