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
  const homeStyle = baseCss(readVueStyle('src/pages/index/index.vue'));
  const detailStyle = baseCss(readVueStyle('src/pages/garment/detail.vue'));

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
});
