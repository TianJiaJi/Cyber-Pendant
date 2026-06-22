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

export function createConfig(overrides = {}) {
  loadLocalEnv();
  const env = process.env;
  const tokenSecret =
    overrides.tokenSecret || env.TOKEN_SECRET || randomBytes(32).toString('hex');
  const userTokenSecret =
    overrides.userTokenSecret || env.USER_TOKEN_SECRET || tokenSecret;

  return {
    port: Number(overrides.port || env.PORT || 8787),
    databasePath: resolveProjectPath(
      overrides.databasePath || env.DATABASE_PATH,
      path.join(projectDir, 'data', 'cyber-pendant.sqlite')
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
    wechatAppId: overrides.wechatAppId || env.WECHAT_APP_ID || '',
    wechatAppSecret: overrides.wechatAppSecret || env.WECHAT_APP_SECRET || '',
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
