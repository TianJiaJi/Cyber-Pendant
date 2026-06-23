import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readAdminFile(relativePath) {
  return readFileSync(path.join(adminRoot, relativePath), 'utf8');
}

test('admin dashboard exposes users, stats, and CSV export controls', () => {
  const dashboard = readAdminFile('src/views/DashboardView.vue');
  const api = readAdminFile('src/utils/api.js');

  assert.match(api, /getAdminStats/, 'admin API should fetch stats');
  assert.match(api, /listAdminUsers/, 'admin API should fetch users');
  assert.match(api, /downloadAdminExport/, 'admin API should download CSV exports');
  assert.match(dashboard, /loadAdminOverview/, 'dashboard should load admin overview data');
  assert.match(dashboard, /用户管理/, 'dashboard should render user management');
  assert.match(dashboard, /userSearch/, 'user management should support searching users');
  assert.match(dashboard, /filteredUsers/, 'user management should filter user rows locally');
  assert.match(dashboard, /最近登录/, 'user management should show last login time');
  assert.match(dashboard, /查看用户/, 'user management should expose a clear detail action');
  assert.match(dashboard, /数据导出/, 'dashboard should render export controls');
  assert.match(dashboard, /downloadAdminExport/, 'dashboard should call export helper');
});

test('admin SN tools generate traditional square QR codes by default', () => {
  const detail = readAdminFile('src/views/ClothingDetailView.vue');
  const api = readAdminFile('src/utils/api.js');

  assert.match(api, /QRCODE_MODE_URL/, 'admin API should keep a square QR code mode');
  assert.match(api, /return QRCODE_MODE_URL;/, 'admin API should ignore stale mini-program code preference');
  assert.match(detail, /二维码模式/, 'SN detail should show a QR mode setting');
  assert.match(detail, /传统正方形二维码/, 'SN detail should describe the square QR style');
  assert.doesNotMatch(detail, /小程序码/, 'SN detail should not offer round mini-program codes');
  assert.match(detail, /qrcodeUrl\(record\.sn,\s*qrMode/, 'SN QR download should use the selected mode');
  assert.match(detail, /qrcodeUrl\(record\.sn,\s*qrMode\.value/, 'exports should use the selected mode');
  assert.doesNotMatch(detail, /scene=SN/, 'exports should not describe mini-program scene payloads');
});
