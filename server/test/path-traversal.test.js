/**
 * 路径遍历攻击防护测试
 *
 * 测试 SN 标准化和 ZIP 文件名生成的安全性
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// 模拟 normalizeSn 函数（从 sn.js）
function normalizeSn(value) {
  const PATH_TRAVERSAL_PATTERN = /[..\\/]/;
  const sn = String(value || '').trim().toUpperCase();

  if (PATH_TRAVERSAL_PATTERN.test(sn)) {
    throw new Error('SN 包含非法字符（路径遍历字符）');
  }

  return sn;
}

// 模拟 safeZipFileName 函数（从 api.js）
function safeZipFileName(sn) {
  let safe = sn.replace(/[..\\/]/g, '_');
  safe = safe.replace(/[\x00-\x1f\x80-\x9f]/g, '_');
  safe = safe.replace(/[<>:"|?*]/g, '_');

  if (!safe) {
    safe = 'invalid_sn';
  }

  return `${safe}.png`;
}

describe('路径遍历攻击防护测试', () => {
  describe('normalizeSn() - SN 标准化安全', () => {
    it('应该接受有效的 SN', () => {
      assert.strictEqual(normalizeSn('CP20260626ABC123'), 'CP20260626ABC123');
      assert.strictEqual(normalizeSn('cp20260626abc123'), 'CP20260626ABC123');
      assert.strictEqual(normalizeSn(' CP20260626ABC123 '), 'CP20260626ABC123');
    });

    it('应该拒绝包含双点的 SN（路径遍历）', () => {
      assert.throws(() => normalizeSn('..'), /SN 包含非法字符/);
      assert.throws(() => normalizeSn('../test'), /SN 包含非法字符/);
      assert.throws(() => normalizeSn('test..'), /SN 包含非法字符/);
      assert.throws(() => normalizeSn('CP20260626..ABC'), /SN 包含非法字符/);
    });

    it('应该拒绝包含正斜杠的 SN', () => {
      assert.throws(() => normalizeSn('/etc/passwd'), /SN 包含非法字符/);
      assert.throws(() => normalizeSn('CP20260626/ABC'), /SN 包含非法字符/);
      assert.throws(() => normalizeSn('../../../etc/passwd'), /SN 包含非法字符/);
    });

    it('应该拒绝包含反斜杠的 SN（Windows 路径分隔符）', () => {
      assert.throws(() => normalizeSn('\\Windows\\System32'), /SN 包含非法字符/);
      assert.throws(() => normalizeSn('CP20260626\\ABC'), /SN 包含非法字符/);
      assert.throws(() => normalizeSn('..\\..\\Windows'), /SN 包含非法字符/);
    });

    it('应该拒绝混合路径遍历攻击', () => {
      assert.throws(() => normalizeSn('..\\../etc'), /SN 包含非法字符/);
      assert.throws(() => normalizeSn('.../test'), /SN 包含非法字符/);
      assert.throws(() => normalizeSn('./test'), /SN 包含非法字符/);
    });
  });

  describe('safeZipFileName() - ZIP 文件名安全', () => {
    it('应该为有效 SN 生成安全的文件名', () => {
      assert.strictEqual(safeZipFileName('CP20260626ABC123'), 'CP20260626ABC123.png');
      assert.strictEqual(safeZipFileName('TEST123'), 'TEST123.png');
    });

    it('应该将路径遍历字符替换为下划线', () => {
      // 这个函数是防御性安全措施
      // 即使有恶意输入，也会被清理
      // 正则 /[..\\/]/g 匹配每个 .,.,\ 字符并替换为 _
      assert.strictEqual(safeZipFileName('..'), '__.png'); // 2个点 -> 2个下划线
      assert.strictEqual(safeZipFileName('../test'), '___test.png'); // 3个危险字符 -> 3个下划线
      assert.strictEqual(safeZipFileName('..\\..\\Windows'), '______Windows.png'); // 6个危险字符 -> 6个下划线
      assert.strictEqual(safeZipFileName('/etc/passwd'), '_etc_passwd.png'); // 2个斜杠 -> 2个下划线
    });

    it('应该移除 Windows 保留字符', () => {
      assert.strictEqual(safeZipFileName('TEST<>ABC'), 'TEST__ABC.png');
      assert.strictEqual(safeZipFileName('TEST:"ABC'), 'TEST__ABC.png');
      assert.strictEqual(safeZipFileName('TEST|ABC'), 'TEST_ABC.png');
      assert.strictEqual(safeZipFileName('TEST?ABC'), 'TEST_ABC.png');
      assert.strictEqual(safeZipFileName('TEST*ABC'), 'TEST_ABC.png');
    });

    it('应该移除控制字符', () => {
      assert.strictEqual(safeZipFileName('TEST\x00ABC'), 'TEST_ABC.png');
      assert.strictEqual(safeZipFileName('TEST\nABC'), 'TEST_ABC.png');
      assert.strictEqual(safeZipFileName('TEST\rABC'), 'TEST_ABC.png');
    });

    it('应该处理空字符串', () => {
      // 空字符串会被 'invalid_sn' 替换
      assert.strictEqual(safeZipFileName(''), 'invalid_sn.png');
      assert.strictEqual(safeZipFileName('   '), '   .png'); // 空格不是危险字符，保留
    });

    it('应该处理仅包含危险字符的输入', () => {
      // ... 被替换成 ___ (3个点 -> 3个下划线)
      assert.strictEqual(safeZipFileName('...'), '___.png');
      assert.strictEqual(safeZipFileName('///'), '___.png'); // 3个斜杠 -> 3个下划线
      assert.strictEqual(safeZipFileName('\\\\\\'), '___.png'); // 3个反斜杠 -> 3个下划线
    });
  });

  describe('深度防御：多层防护', () => {
    it('normalizeSn 应该在 ZIP 文件名生成之前阻止恶意输入', () => {
      // 第一层防护：normalizeSn 拒绝恶意输入
      const maliciousSn = '../../../etc/passwd';

      assert.throws(() => {
        normalizeSn(maliciousSn);
      }, /SN 包含非法字符/);

      // 如果攻击者绕过了 normalizeSn（例如直接操作数据库），
      // safeZipFileName 提供第二层防护
      const bypassedSn = '../../../ETC/PASSWD'; // 假设攻击者绕过了 normalizeSn
      const safeFileName = safeZipFileName(bypassedSn);

      // 验证第二层防护清理了危险字符
      assert.ok(!safeFileName.includes('..'));
      assert.ok(!safeFileName.includes('/'));
      assert.ok(!safeFileName.includes('\\'));
      // 每个字符被替换：.. -> __, / -> _, \ -> _
      // ../../../ETC/PASSWD -> _________ETC_PASSWD
      assert.strictEqual(safeFileName, '_________ETC_PASSWD.png');
    });
  });
});
