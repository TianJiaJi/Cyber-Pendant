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

  return {
    port: Number(overrides.port || env.PORT || 8787),
    databasePath: resolveProjectPath(
      overrides.databasePath || env.DATABASE_PATH,
      path.join(projectDir, 'data', 'cyber-pendant.sqlite')
    ),
    frontendBaseUrl:
      overrides.frontendBaseUrl || env.FRONTEND_BASE_URL || 'http://localhost:5173',
    corsOrigin: overrides.corsOrigin || env.CORS_ORIGIN || '*',
    tokenSecret,
    usingEphemeralTokenSecret: !overrides.tokenSecret && !env.TOKEN_SECRET,
    adminUsername: overrides.adminUsername || env.ADMIN_USERNAME || 'admin',
    adminPassword: overrides.adminPassword || env.ADMIN_PASSWORD || ''
  };
}
