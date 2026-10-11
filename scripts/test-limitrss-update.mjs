import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const scripts = dirname(fileURLToPath(import.meta.url));
function fixture(versions) {
  const root = mkdtempSync(resolve(tmpdir(), 'limitrss-update-'));
  for (const dir of ['notes', 'data', 'api']) mkdirSync(resolve(root, dir));
  copyFileSync(resolve(scripts, '../limitrss/changelog.html'), resolve(root, 'changelog.html'));
  writeFileSync(resolve(root, 'notes/changelog.md'), '## V0.5.0-2026.10.11\n\n#### 通用更新\n\n【新增】更新检查测试\n\n#### Windows\n\n【修复】测试修复\n');
  writeFileSync(resolve(root, 'data/downloads.json'), JSON.stringify({ repo: 'Demisse233/LimitRSS_Client', versions }));
  return root;
}
const run = root => spawnSync(process.execPath, [resolve(scripts, 'sync-limitrss.mjs'), '--root', root, '--offline'], { encoding: 'utf8' });
const read = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

test('new changelog with no Windows package updates all interfaces and HTML fallback', () => {
  const root = fixture({ '0.4.0': { mac: 'LimitRSS-0.4.0-macOS.dmg' } });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const update = read(root, 'api/check-update.json');
    assert.equal(update.versions.latest, '0.5.0');
    assert.equal(update.platforms.windows.available, false);
    assert.equal(update.platforms.mac.version, '0.4.0');
    assert.equal(update.platforms.mac.upToDateWithLatest, false);
    assert.equal(read(root, 'api/download/windows.json').latestVersion, '0.5.0');
    assert.equal(read(root, 'data/changelog.json').versions[0].version, '0.5.0');
    const sandbox = { window: {} };
    vm.runInNewContext(readFileSync(resolve(root, 'api/check-update.js'), 'utf8'), sandbox);
    assert.equal(sandbox.window.LIMITRSS_UPDATE_INFO.versions.latest, '0.5.0');
    assert.match(readFileSync(resolve(root, 'changelog.html'), 'utf8'), /V0\.5\.0-2026\.10\.11/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Windows package at latest version becomes downloadable', () => {
  const root = fixture({ '0.5.0': { windows: 'LimitRSS-0.5.0-Windows.exe' } });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const update = read(root, 'api/check-update.json').platforms.windows;
    assert.equal(update.available, true);
    assert.equal(update.upToDateWithLatest, true);
    assert.equal(read(root, 'api/download/windows.json').url, update.downloadUrl);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('invalid changelog stops generation and preserves existing interface', () => {
  const root = fixture({});
  try {
    writeFileSync(resolve(root, 'api/check-update.json'), '{"sentinel":true}\n');
    writeFileSync(resolve(root, 'notes/changelog.md'), '## V0.5.0-2026.02.30\n\n#### 通用更新\n\n【新增】错误日期\n');
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /停止部署/);
    assert.deepEqual(read(root, 'api/check-update.json'), { sentinel: true });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
