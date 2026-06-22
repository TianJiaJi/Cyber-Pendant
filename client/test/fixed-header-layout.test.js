import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readVueStyle(relativePath) {
  const file = readFileSync(path.join(clientRoot, relativePath), 'utf8');
  const match = file.match(/<style scoped>([\s\S]*?)<\/style>/);
  assert.ok(match, `${relativePath} should have a scoped style block`);
  return match[1];
}

function readVueFile(relativePath) {
  return readFileSync(path.join(clientRoot, relativePath), 'utf8');
}

function readClientFile(relativePath) {
  return readFileSync(path.join(clientRoot, relativePath), 'utf8');
}

function baseCss(css) {
  return css.split(/\n@media\b/)[0];
}

function block(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `${selector} should be defined`);
  return match[1];
}

function assertDeclarations(cssBlock, selector, declarations) {
  for (const declaration of declarations) {
    assert.match(cssBlock, declaration, `${selector} should include ${declaration}`);
  }
}

test('user pages keep custom topbars fixed while content areas scroll', () => {
  const homeFile = readVueFile('src/pages/index/index.vue');
  const detailFile = readVueFile('src/pages/garment/detail.vue');
  const homeStyle = baseCss(readVueStyle('src/pages/index/index.vue'));
  const detailStyle = baseCss(readVueStyle('src/pages/garment/detail.vue'));
  const footerStyle = baseCss(readVueStyle('src/components/AppFooter.vue'));

  assert.match(homeFile, /<AppFooter\s+active="home"\s*\/>/, 'home page should render the app footer');
  assert.match(detailFile, /<AppFooter\s+active="home"\s*\/>/, 'detail page should render the app footer');

  for (const [style, pageName] of [
    [homeStyle, 'home'],
    [detailStyle, 'detail']
  ]) {
    assertDeclarations(block(style, '.phone-shell'), `${pageName} .phone-shell`, [
      /height:\s*100vh;/,
      /display:\s*flex;/,
      /flex-direction:\s*column;/,
      /overflow:\s*hidden;/
    ]);
  }

  assertDeclarations(block(homeStyle, '.home-topbar'), '.home-topbar', [
    /flex:\s*0 0 auto;/,
    /position:\s*sticky;/,
    /top:\s*0;/,
    /z-index:\s*\d+;/
  ]);
  assertDeclarations(block(detailStyle, '.detail-topbar'), '.detail-topbar', [
    /flex:\s*0 0 auto;/,
    /position:\s*sticky;/,
    /top:\s*0;/,
    /z-index:\s*\d+;/
  ]);

  assertDeclarations(block(homeStyle, '.home-content'), '.home-content', [
    /flex:\s*1 1 auto;/,
    /min-height:\s*0;/,
    /overflow-y:\s*auto;/
  ]);

  for (const selector of ['.state-shell', '.detail-content']) {
    assertDeclarations(block(detailStyle, selector), selector, [
      /flex:\s*1 1 auto;/,
      /min-height:\s*0;/,
      /overflow-y:\s*auto;/
    ]);
  }

  assertDeclarations(block(footerStyle, '.app-footer'), '.app-footer', [
    /flex:\s*0 0 auto;/,
    /position:\s*sticky;/,
    /bottom:\s*0;/,
    /z-index:\s*\d+;/
  ]);
  assertDeclarations(block(footerStyle, '.footer-grid'), '.footer-grid', [
    /display:\s*grid;/,
    /grid-template-columns:\s*1fr 1fr;/
  ]);
});

test('login, user center, and authenticated user APIs are wired into the client', () => {
  const pagesJson = JSON.parse(readClientFile('src/pages.json'));
  const pagePaths = pagesJson.pages.map((page) => page.path);
  const footerFile = readVueFile('src/components/AppFooter.vue');
  const apiFile = readClientFile('src/utils/api.js');
  const detailFile = readVueFile('src/pages/garment/detail.vue');
  const loginFile = readVueFile('src/pages/login/index.vue');
  const userFile = readVueFile('src/pages/user/index.vue');

  assert.ok(pagePaths.includes('pages/login/index'), 'login page should be registered');
  assert.ok(pagePaths.includes('pages/user/index'), 'user center page should be registered');
  assert.match(footerFile, /\/pages\/user\/index/, 'footer user tab should navigate to user center');
  assert.doesNotMatch(footerFile, /uni\.navigateTo/, 'footer tab switching should not stack pages');
  assert.match(footerFile, /currentRoute/, 'footer should ignore taps on the current page');
  assert.match(footerFile, /uni\.redirectTo/, 'footer tab switching should replace the current page');
  assert.match(apiFile, /USER_TOKEN_KEY/, 'client API should define a user token key');
  assert.match(apiFile, /Authorization\s*=\s*`Bearer \$\{token\}`/, 'API requests should attach user tokens');
  assert.match(apiFile, /loginWechat/, 'client API should expose WeChat login');
  assert.match(apiFile, /getUserGarments/, 'client API should fetch user garments');
  assert.match(apiFile, /reportLostGarment/, 'client API should expose lost report creation');
  assert.match(detailFile, /ensureLoggedIn/, 'binding flow should check login before opening the form');
  assert.match(detailFile, /confirmReportLostDisclosure/, 'lost reporting should require a disclosure confirmation');
  assert.match(detailFile, /只有报失后才会披露完整联系方式/, 'detail page should state the masking rule');
  assert.match(detailFile, /该校服已报失/, 'detail page should strongly show lost status');
  assert.match(detailFile, /query\?\.scene/, 'mini-program QR codes should be able to pass SN through scene');
  assert.match(detailFile, /decodeURIComponent/, 'scene parameters should be decoded before lookup');
  assert.match(detailFile, /disclosureRows/, 'revealed contact should be rendered as structured rows');
  assert.match(detailFile, /学生/, 'revealed contact should include the student');
  assert.match(detailFile, /学校班级/, 'revealed contact should include school and class');
  assert.match(detailFile, /联系电话/, 'revealed contact should include the phone label');
  assert.match(block(baseCss(readVueStyle('src/pages/garment/detail.vue')), '.lost-contact-card'), /display:\s*grid;/, 'revealed contact card should use a structured layout');
  assert.match(block(baseCss(readVueStyle('src/pages/garment/detail.vue')), '.lost-actions'), /display:\s*flex;/, 'lost action buttons should not collapse when one button changes');
  assert.match(loginFile, /uni\.login/, 'login page should call the mini-program login API');
  assert.match(userFile, /getUserGarments/, 'user center should load bound garments');
  assert.match(userFile, /getUserLostReports/, 'user center should load lost reports');
  assert.match(userFile, /clearUserSession/, 'user center should clear login state on logout');
  assert.match(userFile, /reLaunch/, 'logout should reset the user page state after clearing login');
});
