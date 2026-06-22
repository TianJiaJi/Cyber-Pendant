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
  assert.match(dashboard, /数据导出/, 'dashboard should render export controls');
  assert.match(dashboard, /downloadAdminExport/, 'dashboard should call export helper');
});
