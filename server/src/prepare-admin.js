import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(srcDir, '..');
const adminDir = path.join(serverDir, 'admin');
const adminDistDir = path.join(adminDir, 'dist');
const adminIndexPath = path.join(adminDistDir, 'index.html');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function latestMtimeMs(targetPath) {
  if (!existsSync(targetPath)) {
    return 0;
  }

  const stats = statSync(targetPath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  return readdirSync(targetPath, { withFileTypes: true }).reduce((latest, entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      return latest;
    }

    return Math.max(latest, latestMtimeMs(path.join(targetPath, entry.name)));
  }, stats.mtimeMs);
}

function runNpm(args, label) {
  console.log(`${label}...`);
  const result = spawnSync(npmCommand, args, {
    cwd: serverDir,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function adminDependenciesNeedInstall() {
  const nodeModulesLock = path.join(adminDir, 'node_modules', '.package-lock.json');
  const packageLock = path.join(adminDir, 'package-lock.json');

  if (!existsSync(path.join(adminDir, 'node_modules')) || !existsSync(nodeModulesLock)) {
    return true;
  }

  return latestMtimeMs(packageLock) > latestMtimeMs(nodeModulesLock);
}

function adminBuildIsStale() {
  if (!existsSync(adminIndexPath)) {
    return true;
  }

  const latestSourceMtime = Math.max(
    latestMtimeMs(path.join(adminDir, 'index.html')),
    latestMtimeMs(path.join(adminDir, 'package.json')),
    latestMtimeMs(path.join(adminDir, 'package-lock.json')),
    latestMtimeMs(path.join(adminDir, 'src')),
    latestMtimeMs(path.join(adminDir, 'vite.config.js'))
  );

  return latestSourceMtime > latestMtimeMs(adminIndexPath);
}

export function ensureAdminBuild() {
  if (process.env.SKIP_ADMIN_BUILD === '1' || process.env.ADMIN_AUTO_BUILD === '0') {
    return;
  }

  if (!existsSync(path.join(adminDir, 'package.json'))) {
    return;
  }

  if (adminDependenciesNeedInstall()) {
    runNpm(['--prefix', adminDir, 'install'], 'Installing admin console dependencies');
  }

  if (adminBuildIsStale()) {
    runNpm(['--prefix', adminDir, 'run', 'build'], 'Building admin console');
  }
}
