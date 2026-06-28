/**
 * Cyber-Pendant 安全功能测试
 *
 * 测试速率限制、CORS配置、安全响应头等功能
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/api.js';
import {
  createRateLimit,
  validatePasswordStrength,
  escapeCsvValue
} from '../src/security.js';
import { validateSecretStrength } from '../src/config.js';

async function startTestServer(options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cyber-pendant-'));
  const app = createApp({
    databasePath: path.join(dir, 'test.sqlite'),
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

test('速率限制器 - 基本功能', () => {
  const limiter = createRateLimit({
    windowMs: 1000,
    maxAttempts: 3
  });

  // 前3次请求应该通过
  assert.strictEqual(limiter.check('client1').allowed, true);
  assert.strictEqual(limiter.check('client1').allowed, true);
  assert.strictEqual(limiter.check('client1').allowed, true);

  // 第4次请求应该被拒绝
  const result = limiter.check('client1');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.remaining, 0);
});

test('速率限制器 - 不同客户端独立计数', () => {
  const limiter = createRateLimit({
    windowMs: 1000,
    maxAttempts: 2
  });

  // 客户端1使用2次配额
  assert.strictEqual(limiter.check('client1').allowed, true);
  assert.strictEqual(limiter.check('client1').allowed, true);
  assert.strictEqual(limiter.check('client1').allowed, false);

  // 客户端2应该有独立的配额
  assert.strictEqual(limiter.check('client2').allowed, true);
  assert.strictEqual(limiter.check('client2').allowed, true);
  assert.strictEqual(limiter.check('client2').allowed, false);
});

test('速率限制器 - 记录失败功能', () => {
  const limiter = createRateLimit({
    windowMs: 1000,
    maxAttempts: 5,
    skipSuccessfulRequests: true
  });

  // 记录失败
  limiter.recordFailure('client1');
  limiter.recordFailure('client1');

  // 检查配额（失败不计入总配额，但失败记录会增加）
  const result = limiter.check('client1');
  assert.strictEqual(result.allowed, true);
});

test('速率限制器 - 清除功能', () => {
  const limiter = createRateLimit({
    windowMs: 1000,
    maxAttempts: 3
  });

  // 使用2次配额
  assert.strictEqual(limiter.check('client1').allowed, true);
  assert.strictEqual(limiter.check('client1').allowed, true);

  // 清除记录
  limiter.clear('client1');

  // 配额应该重置
  assert.strictEqual(limiter.check('client1').allowed, true);
  assert.strictEqual(limiter.check('client1').allowed, true);
  assert.strictEqual(limiter.check('client1').allowed, true);
});

test('密钥强度验证 - 拒绝短密钥', () => {
  assert.throws(
    () => validateSecretStrength('short', 'TEST_SECRET'),
    { message: /长度不足/ }
  );
});

test('密钥强度验证 - 拒绝常见弱值', () => {
  assert.throws(
    () => validateSecretStrength('replace-with-this-weak-secret-key-1234', 'TEST_SECRET'),
    { message: /弱值模式/ }
  );

  assert.throws(
    () => validateSecretStrength('password1234567890123456789012345678', 'TEST_SECRET'),
    { message: /弱值模式/ }
  );
});

test('密钥强度验证 - 拒绝重复字符', () => {
  assert.throws(
    () => validateSecretStrength('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'TEST_SECRET'),
    { message: /重复字符/ }
  );
});

test('密钥强度验证 - 接受强密钥', () => {
  // 随机生成的密钥应该通过验证
  const strongSecret = 'K7xN9pP2mQ8vR4tL6wY5nJ3hG5fD8sA2bX9cV7zM1kN';
  assert.doesNotThrow(() => validateSecretStrength(strongSecret, 'TEST_SECRET'));
});

test('CSV安全转义 - 防止公式注入', () => {
  // 测试以 = 开头的公式
  assert.strictEqual(escapeCsvValue('=cmd|\' /C calc\'!A0'), '\'=cmd|\' /C calc\'!A0');

  // 测试以 - 开头的公式
  assert.strictEqual(escapeCsvValue('-HYPERLINK("http://evil.com")'), '\'-HYPERLINK("http://evil.com")');

  // 测试以 + 开头的公式
  assert.strictEqual(escapeCsvValue('+SUM(1+1)*cmd'), '\'+SUM(1+1)*cmd');

  // 测试以 @ 开头的公式
  assert.strictEqual(escapeCsvValue('@SUM(1+1)*cmd'), '\'@SUM(1+1)*cmd');
});

test('CSV安全转义 - 处理特殊字符', () => {
  // 测试包含逗号的值
  assert.strictEqual(escapeCsvValue('Hello, World'), '"Hello, World"');

  // 测试包含引号的值
  assert.strictEqual(escapeCsvValue('Say "Hello"'), '"Say ""Hello"""');

  // 测试包含换行符的值
  assert.strictEqual(escapeCsvValue('Line1\nLine2'), '"Line1\nLine2"');
});

test('CSV安全转义 - 空值和null', () => {
  assert.strictEqual(escapeCsvValue(null), '');
  assert.strictEqual(escapeCsvValue(undefined), '');
  assert.strictEqual(escapeCsvValue(''), '');
});

test('健康检查接口 - 不泄露敏感信息', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(response.status, 200);

    const data = await response.json();

    // 应该返回基本状态
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.status, 'healthy');
    assert.ok(data.timestamp);

    // 不应该包含数据库路径
    assert.strictEqual(data.database, undefined);
    assert.strictEqual(data.path, undefined);
  } finally {
    await close();
  }
});

test('CORS配置 - 拒绝非法来源', async () => {
  const { baseUrl, close } = await startTestServer({
    corsOrigin: 'http://localhost:5173,http://example.com'
  });

  try {
    // 测试允许的来源
    const response1 = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:5173' }
    });
    assert.ok(response1.headers.get('Access-Control-Allow-Origin'));

    // 测试不允许的来源
    const response2 = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://evil.com' }
    });
    // 不匹配的来源不应设置CORS头
    const corsHeader = response2.headers.get('Access-Control-Allow-Origin');
    assert.strictEqual(corsHeader, null);
  } finally {
    await close();
  }
});

test('CORS配置 - 允许所有来源时使用通配符', async () => {
  const { baseUrl, close } = await startTestServer({
    corsOrigin: '*'
  });

  try {
    // 任意来源都应该被允许
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://evil.com' }
    });
    assert.strictEqual(response.headers.get('Access-Control-Allow-Origin'), '*');
  } finally {
    await close();
  }
});

test('登录速率限制 - 防止暴力破解', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    // 尝试6次错误登录
    for (let i = 0; i < 6; i++) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
      });

      if (i < 5) {
        // 前5次应该返回401
        assert.strictEqual(response.status, 401);
      } else {
        // 第6次应该返回429（太多请求）
        assert.strictEqual(response.status, 429);
      }
    }

    // 等待一小段时间后应该恢复
    // 注意：由于限流窗口是15分钟，这里只验证限流是否生效
  } finally {
    await close();
  }
});

test('安全响应头 - 存在必需的头', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/health`);

    // 检查各种安全响应头
    assert.strictEqual(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.strictEqual(response.headers.get('X-Frame-Options'), 'DENY');
    assert.strictEqual(response.headers.get('X-XSS-Protection'), '1; mode=block');
    assert.strictEqual(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  } finally {
    await close();
  }
});

test('CSP响应头 - 启用内容安全策略', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/health`);

    // 检查 CSP 响应头存在
    const csp = response.headers.get('Content-Security-Policy');
    assert.ok(csp, 'CSP 响应头应该存在');

    // 检查 CSP 包含必要的策略
    assert.ok(csp.includes("default-src 'self'"), 'CSP 应该限制默认来源');
    assert.ok(csp.includes("object-src 'none'"), 'CSP 应该禁止对象');
    assert.ok(csp.includes("base-uri 'self'"), 'CSP 应该限制 base URI');
  } finally {
    await close();
  }
});

test('密码强度验证 - 拒绝弱密码', () => {
  // 测试过短的密码
  assert.throws(
    () => validatePasswordStrength('short'),
    { message: /至少需要 12 位/ }
  );

  // 测试字符多样性不足
  assert.throws(
    () => validatePasswordStrength('abcdefghijkl'),
    { message: /至少 3 种/ }
  );

  // 测试常见弱密码（需要至少12位且符合字符多样性要求）
  assert.throws(
    () => validatePasswordStrength('Password1234!'),
    { message: /常见弱密码模式/ }
  );
});

test('密码强度验证 - 接受强密码', () => {
  // 测试符合要求的密码（避免使用包含 "pass" 的密码）
  assert.doesNotThrow(() => validatePasswordStrength('MyStr0ng!Code'));
  assert.doesNotThrow(() => validatePasswordStrength('Secure@Key123'));
  assert.doesNotThrow(() => validatePasswordStrength('Complex#Pwd456'));
  assert.doesNotThrow(() => validatePasswordStrength('QrT8!kLm@3xW'));
});
