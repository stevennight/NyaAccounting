const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = require('../.test-build-tests/services/updateManifest.js');

test('compares stable versions numerically', () => {
  assert.equal(manifest.compareVersions('1.10.0', '1.2.0'), 1);
  assert.equal(manifest.compareVersions('v1.2.0', '1.2.0'), 0);
  assert.equal(manifest.compareVersions('1.2.0', '1.2.1'), -1);
});

test('parses a GitHub release and selects its APK asset', () => {
  const release = manifest.parseGitHubRelease({
    tag_name: 'v1.2.0',
    name: 'NyaAccounting 1.2.0',
    html_url: 'https://github.com/stevennight/NyaAccounting/releases/tag/v1.2.0',
    published_at: '2026-08-04T00:00:00Z',
    body: '修复更新流程。',
    assets: [
      {
        name: 'SHA256SUMS',
        browser_download_url: 'https://github.com/example/checksums',
        size: 80,
      },
      {
        name: 'NyaAccounting-1.2.0-android.apk',
        browser_download_url: 'https://github.com/example/app.apk',
        size: 1234,
      },
    ],
  });

  assert.equal(release.version, '1.2.0');
  assert.equal(release.apkAsset.name, 'NyaAccounting-1.2.0-android.apk');
  assert.equal(release.apkAsset.sizeBytes, 1234);
});

test('rejects prerelease and malformed release tags', () => {
  assert.throws(
    () => manifest.parseGitHubRelease({ tag_name: 'v1.2.0-beta.1' }),
    /不是稳定版本/,
  );
  assert.equal(manifest.isValidGitHubRepository('stevennight/NyaAccounting'), true);
  assert.equal(manifest.isValidGitHubRepository('not-a-repository'), false);
});

test('keeps Android APK installation permission in the built app inputs', () => {
  const appConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'),
  );
  const androidManifest = fs.readFileSync(
    path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    'utf8',
  );

  assert.ok(appConfig.expo.android.permissions.includes('REQUEST_INSTALL_PACKAGES'));
  assert.match(
    androidManifest,
    /android\.permission\.REQUEST_INSTALL_PACKAGES/,
  );
});
