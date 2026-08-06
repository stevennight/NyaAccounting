import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const versionPath = resolve(root, 'VERSION');
const appPath = resolve(root, 'app.json');
const packagePath = resolve(root, 'package.json');
const lockPath = resolve(root, 'package-lock.json');
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJSON(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sourceVersion() {
  return readFileSync(versionPath, 'utf8').trim();
}

function parseVersion(version) {
  const match = stableVersion.exec(version);
  if (!match) {
    throw new Error(
      `Version must use stable MAJOR.MINOR.PATCH format; received ${JSON.stringify(version)}.`,
    );
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function androidVersionCode(version) {
  const { major, minor, patch } = parseVersion(version);
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (!Number.isSafeInteger(code) || code < 1 || code > 2_100_000_000) {
    throw new Error(`Version ${version} produces an invalid Android versionCode: ${code}.`);
  }
  return code;
}

function versionLocations() {
  const app = readJSON(appPath).expo;
  const pkg = readJSON(packagePath);
  const lock = readJSON(lockPath);
  return {
    source: sourceVersion(),
    app: app.version,
    package: pkg.version,
    lock: lock.version,
    lockRoot: lock.packages?.['']?.version,
    androidVersionCode: app.android?.versionCode,
    iosBuildNumber: app.ios?.buildNumber,
  };
}

function check(expected = sourceVersion()) {
  const nativeCode = androidVersionCode(expected);
  const locations = versionLocations();
  const mismatches = Object.entries(locations).filter(([name, value]) => {
    if (name === 'androidVersionCode') {
      return value !== nativeCode;
    }
    if (name === 'iosBuildNumber') {
      return value !== String(nativeCode);
    }
    return value !== expected;
  });
  if (mismatches.length) {
    throw new Error(
      `Version mismatch; expected ${expected}: ${mismatches
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join(', ')}`,
    );
  }
  process.stdout.write(`Version ${expected} is consistent.\n`);
}

function setVersion(version) {
  const nativeCode = androidVersionCode(version);
  const app = readJSON(appPath);
  const pkg = readJSON(packagePath);
  const lock = readJSON(lockPath);

  app.expo.version = version;
  app.expo.android ??= {};
  app.expo.android.versionCode = nativeCode;
  app.expo.ios ??= {};
  app.expo.ios.buildNumber = String(nativeCode);
  pkg.version = version;
  lock.version = version;
  lock.packages ??= {};
  lock.packages[''] ??= {};
  lock.packages[''].version = version;

  writeFileSync(versionPath, `${version}\n`, 'utf8');
  writeJSON(appPath, app);
  writeJSON(packagePath, pkg);
  writeJSON(lockPath, lock);
  check(version);
}

const [command = 'check', value] = process.argv.slice(2);
if (command === 'check') {
  check(value || sourceVersion());
} else if (command === 'set' && value) {
  setVersion(value);
} else {
  throw new Error('Usage: node scripts/version.mjs check [VERSION] | set VERSION');
}
