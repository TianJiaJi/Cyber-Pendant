import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/api.js';

async function startTestServer() {
  const dir = mkdtempSync(path.join(tmpdir(), 'cyber-pendant-'));
  const app = createApp({
    databasePath: path.join(dir, 'test.sqlite'),
    adminUsername: 'admin',
    adminPassword: 'secret123',
    tokenSecret: 'test-secret',
    frontendBaseUrl: 'http://localhost:5173'
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  return {
    ...app,
    baseUrl,
    close: () => new Promise((resolve) => app.server.close(resolve))
  };
}

test('auth, garment CRUD, SN generation, public lookup, and QR code', async (t) => {
  const app = await startTestServer();
  t.after(app.close);

  const unauthorized = await fetch(`${app.baseUrl}/api/garments`);
  assert.equal(unauthorized.status, 401);

  const login = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'secret123' })
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.ok(token);

  const generated = await fetch(`${app.baseUrl}/api/sn/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(generated.status, 200);
  const { sn } = await generated.json();
  assert.match(sn, /^CP\d{8}[A-Z2-9]{6}$/);

  const created = await fetch(`${app.baseUrl}/api/garments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sn,
      productName: '测试风衣',
      fabric: '棉 70%，锦纶 30%',
      standard: 'GB/T 2664-2017',
      manufacturer: '测试制造有限公司',
      safetyCategory: 'GB 18401-2010 B 类',
      grade: '一等品'
    })
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).garment.sn, sn);

  const duplicate = await fetch(`${app.baseUrl}/api/garments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sn,
      productName: '重复记录',
      fabric: '棉',
      standard: 'GB/T 2664-2017',
      manufacturer: '测试制造有限公司'
    })
  });
  assert.equal(duplicate.status, 409);

  const publicLookup = await fetch(`${app.baseUrl}/api/garments/${sn}`);
  assert.equal(publicLookup.status, 200);
  assert.equal((await publicLookup.json()).garment.productName, '测试风衣');

  const qr = await fetch(`${app.baseUrl}/api/qrcode/${sn}?type=url`);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.ok((await qr.arrayBuffer()).byteLength > 1000);

  const inactive = await fetch(`${app.baseUrl}/api/garments/${sn}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'inactive' })
  });
  assert.equal(inactive.status, 200);

  const inactiveLookup = await fetch(`${app.baseUrl}/api/garments/${sn}`);
  assert.equal(inactiveLookup.status, 423);
  assert.equal((await inactiveLookup.json()).garment.status, 'inactive');
});
