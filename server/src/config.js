import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(srcDir, '..');
const projectDir = path.resolve(serverDir, '..');

function resolveProjectPath(value, fallback) {
  const target = value || fallback;
  return path.isAbsolute(target) ? target : path.resolve(serverDir, target);
}

function normalizeBasePath(value, fallback) {
  const raw = String(value || fallback || '').trim();
  if (!raw || raw === '/') {
    return '/';
  }

  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function stripEnvValue(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadLocalEnv() {
  const envPath = path.join(serverDir, '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    if (process.env[key] === undefined) {
      process.env[key] = stripEnvValue(value);
    }
  }
}

/**
 * 验证密钥强度
 *
 * @param {string} secret - 待验证的密钥
 * @param {string} name - 密钥名称（用于错误消息）
 * @throws {Error} 如果密钥强度不足
 */
function validateSecretStrength(secret, name = '密钥') {
  if (!secret) {
    throw new Error(
      `${name} 未设置。请在 .env 文件中设置强随机密钥。\n` +
      `提示: openssl rand -base64 32`
    );
  }

  if (secret.length < 32) {
    throw new Error(
      `${name} 长度不足。当前: ${secret.length} 字符，要求: 至少 32 字符。\n` +
      `请在 .env 文件中设置强随机密钥。\n` +
      `提示: openssl rand -base64 32`
    );
  }

  // 检查常见弱值模式
  const weakPatterns = [
    'replace-with',
    'replace',
    'changeme',
    'change',
    'secret',
    'password',
    'pass',
    '12345678',
    '123456789012345678901234567890123456',
    'abcdefghabcdefghabcdefghabcdefghabcdefgh',
    'example',
    'test',
    'demo',
    'local',
    'dev'
  ];

  const lower = secret.toLowerCase();
  for (const pattern of weakPatterns) {
    if (lower.includes(pattern)) {
      throw new Error(
        `${name} 包含弱值模式 "${pattern}"。请使用强随机密钥。\n` +
        `提示: openssl rand -base64 32`
      );
    }
  }

  // 检查字符重复度（如果80%以上是同一个字符，认为太弱）
  const charCounts = {};
  for (const char of secret) {
    charCounts[char] = (charCounts[char] || 0) + 1;
  }
  const maxCount = Math.max(...Object.values(charCounts));
  if (secret.length > 0 && maxCount / secret.length > 0.8) {
    throw new Error(
      `${name} 包含过多重复字符。请使用强随机密钥。\n` +
      `提示: openssl rand -base64 32`
    );
  }
}

export function createConfig(overrides = {}) {
  loadLocalEnv();
  const env = process.env;

  // 检查是否为测试环境
  const isTest = Boolean(overrides.isTest);

  const tokenSecret =
    overrides.tokenSecret || env.TOKEN_SECRET || randomBytes(32).toString('hex');
  const userTokenSecret =
    overrides.userTokenSecret || env.USER_TOKEN_SECRET || tokenSecret;

  // 生产环境检查密钥强度（测试环境跳过）
  if (!isTest) {
    // 检查是否使用了临时密钥
    if (!overrides.tokenSecret && !env.TOKEN_SECRET) {
      console.warn(
        '\n警告: 使用临时生成的 TOKEN_SECRET。服务器重启后所有Token会失效。\n' +
        '请在 .env 文件中设置 TOKEN_SECRET 以避免此问题。\n' +
        '提示: openssl rand -base64 32\n'
      );
    }

    // 检查是否共享了密钥
    if (userTokenSecret === tokenSecret) {
      console.warn(
        '\n警告: TOKEN_SECRET 和 USER_TOKEN_SECRET 相同。\n' +
        '建议在 .env 文件中设置不同的 USER_TOKEN_SECRET 以提高安全性。\n'
      );
    }

    // 验证配置的密钥强度（排除临时生成的）
    if (env.TOKEN_SECRET) {
      validateSecretStrength(env.TOKEN_SECRET, 'TOKEN_SECRET');
    }
    if (env.USER_TOKEN_SECRET) {
      validateSecretStrength(env.USER_TOKEN_SECRET, 'USER_TOKEN_SECRET');
    }
  }

  return {
    port: Number(overrides.port || env.PORT || 8787),
    databasePath: resolveProjectPath(
      overrides.databasePath || env.DATABASE_PATH,
      path.join(projectDir, 'data', 'cyber-pendant.sqlite')
    ),
    qrCacheDir: resolveProjectPath(
      overrides.qrCacheDir || env.QR_CACHE_DIR,
      path.join(projectDir, 'data', 'qrcodes')
    ),
    frontendBaseUrl:
      overrides.frontendBaseUrl || env.FRONTEND_BASE_URL || 'http://localhost:5173',
    adminBasePath: normalizeBasePath(
      overrides.adminBasePath || env.ADMIN_BASE_PATH,
      '/admin'
    ),
    adminStaticDir: resolveProjectPath(
      overrides.adminStaticDir || env.ADMIN_STATIC_DIR,
      path.join(serverDir, 'admin', 'dist')
    ),
    corsOrigin: overrides.corsOrigin || env.CORS_ORIGIN || '*',
    tokenSecret,
    usingEphemeralTokenSecret: !overrides.tokenSecret && !env.TOKEN_SECRET,
    userTokenSecret,
    userTokenTtlDays: Number(overrides.userTokenTtlDays || env.USER_TOKEN_TTL_DAYS || 30),
    usingSharedUserTokenSecret: userTokenSecret === tokenSecret,
    wechatAppId: 'wechatAppId' in overrides ? overrides.wechatAppId : (env.WECHAT_APP_ID || ''),
    wechatAppSecret: 'wechatAppSecret' in overrides ? overrides.wechatAppSecret : (env.WECHAT_APP_SECRET || ''),
    wechatCode2Session: overrides.wechatCode2Session || null,
    wechatAccessTokenProvider: overrides.wechatAccessTokenProvider || null,
    wechatMiniProgramCodeProvider: overrides.wechatMiniProgramCodeProvider || null,
    wechatQrPage: overrides.wechatQrPage || env.WECHAT_QR_PAGE || 'pages/garment/detail',
    wechatQrEnvVersion: overrides.wechatQrEnvVersion || env.WECHAT_QR_ENV_VERSION || 'release',
    wechatQrCheckPath: booleanValue(
      overrides.wechatQrCheckPath ?? env.WECHAT_QR_CHECK_PATH,
      false
    ),
    wechatQrWidth: Number(overrides.wechatQrWidth || env.WECHAT_QR_WIDTH || 430),
    adminUsername: overrides.adminUsername || env.ADMIN_USERNAME || 'admin',
    adminPassword: overrides.adminPassword || env.ADMIN_PASSWORD || ''
  };
}
