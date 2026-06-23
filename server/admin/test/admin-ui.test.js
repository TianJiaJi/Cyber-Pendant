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

test('admin SN tools support multiple QR code modes with H5 link QR as default', () => {
  const detail = readAdminFile('src/views/ClothingDetailView.vue');
  const api = readAdminFile('src/utils/api.js');

  assert.match(api, /QRCODE_MODE_URL/, 'admin API should support H5 link QR code mode');
  assert.match(api, /QRCODE_MODE_MINIPROGRAM/, 'admin API should support WeChat mini-program code mode');
  assert.match(api, /QRCODE_MODE_MINIPROGRAM_SQUARE/, 'admin API should support WeChat mini-program square QR code mode');
  assert.match(api, /QRCODE_MODE_SN/, 'admin API should support raw SN mode');
  assert.match(api, /getQrcodeMode/, 'admin API should read saved QR mode from localStorage');
  assert.match(api, /saveQrcodeMode/, 'admin API should persist QR mode to localStorage');
  assert.match(detail, /二维码模式/, 'SN detail should show a QR mode setting');
  assert.match(detail, /H5 链接二维码/, 'SN detail should offer H5 link QR code mode');
  assert.match(detail, /微信小程序二维码/, 'SN detail should offer WeChat mini-program square QR code mode');
  assert.match(detail, /微信小程序码/, 'SN detail should offer WeChat mini-program code mode');
  assert.match(detail, /原始 SN 码/, 'SN detail should offer raw SN mode');
  assert.match(detail, /qrcodeUrl\(sn,\s*qrMode/, 'SN QR download should use the selected mode');
  assert.match(detail, /qrcodeUrl\(sn,\s*qrMode\.value/, 'exports should use the selected mode');
  assert.doesNotMatch(detail, /scene=SN/, 'exports should not describe mini-program scene payloads');
});
