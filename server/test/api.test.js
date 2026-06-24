import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
    tokenSecret: 'test-secret-with-more-than-32-chars-for-test!!',
    isTest: true,
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

async function loginAsWechatUser(baseUrl, code) {
  const response = await fetch(`${baseUrl}/api/auth/wechat/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.token);
  assert.ok(payload.user.id);
  return payload;
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

async function deleteWithToken(url, token) {
  return fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
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
  const app = await startTestServer({
    wechatAppId: 'wx-test-app',
    wechatAppSecret: 'test-secret',
    userTokenSecret: 'user-token-secret',
    wechatCode2Session: async () => ({ openid: 'openid-legacy-binding' })
  });
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

  const invalidBinding = await fetch(`${app.baseUrl}/api/garments/${sn}/binding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentName: '张三',
      studentSchool: '第一实验学校',
      studentClass: '三年级二班',
      contactPhone: '12'
    })
  });
  assert.equal(invalidBinding.status, 401);

  const userLogin = await loginAsWechatUser(app.baseUrl, 'LEGACY_BINDING_CODE');

  const invalidAuthenticatedBinding = await postJson(
    `${app.baseUrl}/api/garments/${sn}/binding`,
    userLogin.token,
    {
      studentName: '张三',
      studentSchool: '第一实验学校',
      studentClass: '三年级二班',
      contactPhone: '12'
    }
  );
  assert.equal(invalidAuthenticatedBinding.status, 400);

  const bound = await postJson(`${app.baseUrl}/api/garments/${sn}/binding`, userLogin.token, {
      studentName: '张三',
      studentSchool: '第一实验学校',
      studentClass: '三年级二班',
      contactName: '张女士',
      contactPhone: '13800123456'
  });
  assert.equal(bound.status, 200);
  const boundGarment = (await bound.json()).garment;
  assert.equal(boundGarment.isBound, true);
  assert.equal(boundGarment.owner.name, '张*');
  assert.equal(boundGarment.owner.school, '第一实验学校');
  assert.equal(boundGarment.owner.className, '三年级二班');
  assert.equal(boundGarment.owner.phoneTail, '3456');
  assert.ok(boundGarment.owner.boundAt);
  assert.equal(boundGarment.ownerName, undefined);
  assert.equal(boundGarment.binding.studentName, '张三');
  assert.equal(boundGarment.binding.contactPhone, '13800123456');
  assert.equal(boundGarment.owner.contactPhone, '13800123456');

  const duplicateBinding = await postJson(`${app.baseUrl}/api/garments/${sn}/binding`, userLogin.token, {
      studentName: '李四',
      studentSchool: '第一实验学校',
      studentClass: '三年级三班',
      contactPhone: '13900125678'
  });
  assert.equal(duplicateBinding.status, 409);

  const adminListWithBinding = await fetch(
    `${app.baseUrl}/api/garments?q=${encodeURIComponent(sn)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(adminListWithBinding.status, 200);
  const adminGarment = (await adminListWithBinding.json()).garments.find(
    (item) => item.sn === sn
  );
  assert.ok(adminGarment);
  assert.equal(adminGarment.binding.studentName, '张三');
  assert.equal(adminGarment.binding.school, '第一实验学校');
  assert.equal(adminGarment.binding.className, '三年级二班');
  assert.equal(adminGarment.binding.contactName, '张女士');
  assert.equal(adminGarment.binding.contactPhone, '13800123456');

  const unauthorizedUnbind = await fetch(`${app.baseUrl}/api/garments/${sn}/binding`, {
    method: 'DELETE'
  });
  assert.equal(unauthorizedUnbind.status, 401);

  const unbound = await fetch(`${app.baseUrl}/api/garments/${sn}/binding`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(unbound.status, 200);
  const unboundGarment = (await unbound.json()).garment;
  assert.equal(unboundGarment.isBound, false);
  assert.equal(unboundGarment.owner, null);
  assert.equal(unboundGarment.binding, null);

  const publicAfterUnbind = await fetch(`${app.baseUrl}/api/garments/${sn}?track=0`);
  assert.equal(publicAfterUnbind.status, 200);
  assert.equal((await publicAfterUnbind.json()).garment.isBound, false);

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

test('legacy mini-program QR requests fall back to square link QR codes', async (t) => {
  const miniProgramCodeCalls = [];
  const app = await startTestServer({
    wechatAppId: '',
    wechatAppSecret: '',
    wechatAccessTokenProvider: async () => ({
      accessToken: 'ACCESS_TOKEN_FOR_TEST',
      expiresIn: 7200
    }),
    wechatMiniProgramCodeProvider: async (request) => {
      miniProgramCodeCalls.push(request);
      return {
        contentType: 'image/png',
        buffer: Buffer.from('fake-mini-program-code-image')
      };
    }
  });
  t.after(() => app.close());

  const token = await loginAsAdmin(app.baseUrl);
  const clothing = await createTestClothing(app.baseUrl, token, {
    productName: '小程序码测试校服'
  });
  const batch = await createTestBatch(app.baseUrl, token, clothing.id, { count: 1 });
  const sn = batch.garments[0].sn;

  const qr = await fetch(`${app.baseUrl}/api/qrcode/${sn}?type=mini-program`);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/png');
  const buffer = Buffer.from(await qr.arrayBuffer());
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(miniProgramCodeCalls.length, 0);
});

test('wechat login, user-owned binding, lost report, contact reveal, and user center APIs', async (t) => {
  const codeMap = new Map([
    ['CODE_A', { openid: 'openid-user-a', session_key: 'ignored-a' }],
    ['CODE_B', { openid: 'openid-user-b', session_key: 'ignored-b' }]
  ]);
  const app = await startTestServer({
    wechatAppId: 'wx-test-app',
    wechatAppSecret: 'test-secret',
    userTokenSecret: 'user-token-secret',
    wechatCode2Session: async (code) => codeMap.get(code) || { errcode: 40029, errmsg: 'invalid code' }
  });
  t.after(app.close);

  const adminToken = await loginAsAdmin(app.baseUrl);
  const clothing = await createTestClothing(app.baseUrl, adminToken, {
    productName: '用户绑定测试校服'
  });
  const batch = await createTestBatch(app.baseUrl, adminToken, clothing.id, { count: 1 });
  const sn = batch.garments[0].sn;

  const invalidLogin = await fetch(`${app.baseUrl}/api/auth/wechat/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'BAD_CODE' })
  });
  assert.equal(invalidLogin.status, 401);

  const userA = await loginAsWechatUser(app.baseUrl, 'CODE_A');
  assert.equal(userA.user.openid, 'openid-user-a');
  assert.equal(userA.user.bindingCount, 0);
  assert.equal(userA.isNewUser, true);

  const secondLogin = await loginAsWechatUser(app.baseUrl, 'CODE_A');
  assert.equal(secondLogin.user.id, userA.user.id);
  assert.equal(secondLogin.isNewUser, false);

  const userB = await loginAsWechatUser(app.baseUrl, 'CODE_B');
  assert.notEqual(userB.user.id, userA.user.id);

  const publicBind = await fetch(`${app.baseUrl}/api/garments/${sn}/binding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentName: '张三',
      studentSchool: '第一实验学校',
      studentClass: '三年级二班',
      contactName: '张女士',
      contactPhone: '13800123456'
    })
  });
  assert.equal(publicBind.status, 401);

  const bound = await postJson(`${app.baseUrl}/api/garments/${sn}/binding`, userA.token, {
    studentName: '张三',
    studentSchool: '第一实验学校',
    studentClass: '三年级二班',
    contactName: '张女士',
    contactPhone: '13800123456'
  });
  assert.equal(bound.status, 200);
  const boundGarment = (await bound.json()).garment;
  assert.equal(boundGarment.isBound, true);
  assert.equal(boundGarment.isOwner, true);
  assert.equal(boundGarment.binding.contactPhone, '13800123456');

  const anonymousBoundLookup = await fetch(`${app.baseUrl}/api/garments/${sn}?track=0`);
  assert.equal(anonymousBoundLookup.status, 200);
  const anonymousBoundGarment = (await anonymousBoundLookup.json()).garment;
  assert.equal(anonymousBoundGarment.isBound, true);
  assert.equal(anonymousBoundGarment.owner, null);
  assert.equal(anonymousBoundGarment.binding, undefined);

  const loggedInOtherLookup = await fetch(`${app.baseUrl}/api/garments/${sn}?track=0`, {
    headers: { Authorization: `Bearer ${userB.token}` }
  });
  assert.equal(loggedInOtherLookup.status, 200);
  const loggedInOtherGarment = (await loggedInOtherLookup.json()).garment;
  assert.equal(loggedInOtherGarment.isBound, true);
  assert.equal(loggedInOtherGarment.owner.name, '张*');
  assert.equal(loggedInOtherGarment.owner.contactPhone, undefined);

  const duplicateByOtherUser = await postJson(
    `${app.baseUrl}/api/garments/${sn}/binding`,
    userB.token,
    {
      studentName: '李四',
      studentSchool: '第二实验学校',
      studentClass: '四年级一班',
      contactName: '李女士',
      contactPhone: '13900123456'
    }
  );
  assert.equal(duplicateByOtherUser.status, 409);

  const deniedUpdate = await putJson(`${app.baseUrl}/api/garments/${sn}/binding`, userB.token, {
    studentClass: '四年级二班',
    contactPhone: '13900123456'
  });
  assert.equal(deniedUpdate.status, 403);

  const updatedBinding = await putJson(`${app.baseUrl}/api/garments/${sn}/binding`, userA.token, {
    studentName: '张三',
    studentSchool: '第一实验学校',
    studentClass: '三年级三班',
    contactName: '张女士',
    contactPhone: '13800123456'
  });
  assert.equal(updatedBinding.status, 200);
  assert.equal((await updatedBinding.json()).garment.binding.className, '三年级三班');

  const myGarments = await fetch(`${app.baseUrl}/api/user/garments`, {
    headers: { Authorization: `Bearer ${userA.token}` }
  });
  assert.equal(myGarments.status, 200);
  assert.equal((await myGarments.json()).garments.length, 1);

  const logs = await fetch(`${app.baseUrl}/api/user/binding-logs`, {
    headers: { Authorization: `Bearer ${userA.token}` }
  });
  assert.equal(logs.status, 200);
  assert.deepEqual(
    (await logs.json()).logs.map((log) => log.action),
    ['modify', 'bind']
  );

  const deniedLostReport = await postJson(
    `${app.baseUrl}/api/garments/${sn}/report-lost`,
    userB.token,
    { note: '不是绑定人不能报失' }
  );
  assert.equal(deniedLostReport.status, 403);

  const lostReport = await postJson(
    `${app.baseUrl}/api/garments/${sn}/report-lost`,
    userA.token,
    { note: '操场附近遗失' }
  );
  assert.equal(lostReport.status, 201);
  const lostPayload = await lostReport.json();
  assert.equal(lostPayload.report.status, 'active');
  assert.match(lostPayload.report.expiresAt, /^\d{4}-\d{2}-\d{2}T/);

  const publicLostLookup = await fetch(`${app.baseUrl}/api/garments/${sn}?track=0`);
  assert.equal(publicLostLookup.status, 200);
  const publicLostGarment = (await publicLostLookup.json()).garment;
  assert.equal(publicLostGarment.lostReport.status, 'active');
  assert.equal(publicLostGarment.owner, null);

  const anonymousReveal = await fetch(`${app.baseUrl}/api/garments/${sn}/contact-reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'detail' })
  });
  assert.equal(anonymousReveal.status, 401);

  const reveal = await postJson(`${app.baseUrl}/api/garments/${sn}/contact-reveal`, userB.token, {
    source: 'detail'
  });
  assert.equal(reveal.status, 200);
  const revealPayload = await reveal.json();
  assert.equal(revealPayload.contact.studentName, '张三');
  assert.equal(revealPayload.contact.school, '第一实验学校');
  assert.equal(revealPayload.contact.className, '三年级三班');
  assert.equal(revealPayload.contact.contactName, '张女士');
  assert.equal(revealPayload.contact.contactPhone, '13800123456');
  assert.equal(revealPayload.garment.owner.studentName, '张三');

  const ownerReveal = await postJson(`${app.baseUrl}/api/garments/${sn}/contact-reveal`, userA.token, {
    source: 'detail'
  });
  assert.equal(ownerReveal.status, 200);
  assert.equal((await ownerReveal.json()).garment.isOwner, true);

  const myReports = await fetch(`${app.baseUrl}/api/user/lost-reports`, {
    headers: { Authorization: `Bearer ${userA.token}` }
  });
  assert.equal(myReports.status, 200);
  assert.equal((await myReports.json()).reports.length, 1);

  const stats = await fetch(`${app.baseUrl}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(stats.status, 200);
  const statsPayload = await stats.json();
  assert.equal(statsPayload.users.total, 2);
  assert.equal(statsPayload.garments.bound, 1);
  assert.equal(statsPayload.reports.active, 1);
  assert.equal(statsPayload.today.bindings, 2);

  const adminUsers = await fetch(`${app.baseUrl}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminUsers.status, 200);
  const adminUsersPayload = await adminUsers.json();
  assert.equal(adminUsersPayload.users.length, 2);
  assert.ok(adminUsersPayload.users.some((user) => user.openid === 'openid-user-a'));

  const banned = await fetch(`${app.baseUrl}/api/admin/users/${userA.user.id}/ban`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(banned.status, 200);
  assert.equal((await banned.json()).user.status, 'banned');

  const bannedLogin = await fetch(`${app.baseUrl}/api/auth/wechat/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'CODE_A' })
  });
  assert.equal(bannedLogin.status, 403);

  const unbanned = await fetch(`${app.baseUrl}/api/admin/users/${userA.user.id}/unban`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(unbanned.status, 200);
  assert.equal((await unbanned.json()).user.status, 'active');

  const exportedUsers = await fetch(`${app.baseUrl}/api/admin/export/users`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(exportedUsers.status, 200);
  assert.match(exportedUsers.headers.get('content-type'), /^text\/csv/);
  assert.match(await exportedUsers.text(), /openid-user-a/);

  for (const type of ['garments', 'reports', 'binding-logs']) {
    const exported = await fetch(`${app.baseUrl}/api/admin/export/${type}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-type'), /^text\/csv/);
    assert.ok((await exported.text()).length > 0);
  }

  const closed = await deleteWithToken(`${app.baseUrl}/api/garments/${sn}/report-lost`, userA.token);
  assert.equal(closed.status, 200);
  assert.equal((await closed.json()).report.status, 'cancelled');

  const unboundByOwner = await deleteWithToken(`${app.baseUrl}/api/garments/${sn}/binding`, userA.token);
  assert.equal(unboundByOwner.status, 200);
  assert.equal((await unboundByOwner.json()).garment.isBound, false);
});

test('serves admin console from configurable backend path', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cyber-pendant-admin-'));
  const adminStaticDir = path.join(dir, 'admin-dist');
  mkdirSync(path.join(adminStaticDir, 'assets'), { recursive: true });
  writeFileSync(
    path.join(adminStaticDir, 'index.html'),
    '<!doctype html><html><head><title>Admin</title></head><body><div id="app">Admin Shell</div></body></html>'
  );
  writeFileSync(path.join(adminStaticDir, 'assets', 'app.js'), 'console.log("admin");');

  const app = await startTestServer({
    adminBasePath: '/console',
    adminStaticDir,
    frontendBaseUrl: 'https://example.test/h5'
  });
  t.after(app.close);

  const health = await fetch(`${app.baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  const redirect = await fetch(`${app.baseUrl}/console`, { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/console/');

  const index = await fetch(`${app.baseUrl}/console/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /^text\/html/);
  const html = await index.text();
  assert.match(html, /Admin Shell/);
  assert.match(html, /window\.__CYBER_PENDANT_ADMIN_CONFIG__/);
  assert.match(html, /https:\/\/example\.test\/h5/);

  const asset = await fetch(`${app.baseUrl}/console/assets/app.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /^text\/javascript/);
  assert.match(asset.headers.get('cache-control'), /max-age=31536000/);
  assert.equal(await asset.text(), 'console.log("admin");');

  const spaFallback = await fetch(`${app.baseUrl}/console/clothes/123`);
  assert.equal(spaFallback.status, 200);
  assert.match(await spaFallback.text(), /Admin Shell/);

  const traversal = await fetch(`${app.baseUrl}/console/%2e%2e/src/config.js`);
  assert.equal(traversal.status, 404);

  const missingAsset = await fetch(`${app.baseUrl}/console/assets/missing.js`);
  assert.equal(missingAsset.status, 404);
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
