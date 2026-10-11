#!/usr/bin/env node
// 部署前从唯一日志源生成快照、页面兜底和客户端接口。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../limitrss/src/changelog/parse-md.mjs';
import { validate } from '../limitrss/src/changelog/validate.mjs';
import { renderChangelogList } from '../limitrss/src/changelog/render.mjs';
import { replaceMarkedBlock, patchEmbedMarkdown } from './lib/patch-html.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const rootIndex = process.argv.indexOf('--root');
const root = rootIndex >= 0 ? resolve(process.argv[rootIndex + 1]) : resolve(scripts, '../limitrss');
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const write = (path, value) => writeFileSync(resolve(root, path), JSON.stringify(value, null, 2) + '\n');

try {
  const markdown = readFileSync(resolve(root, 'notes/changelog.md'), 'utf8');
  const data = parseMarkdown(markdown);
  const validation = validate(data);
  if (!validation.ok) throw validation.error;
  const htmlPath = resolve(root, 'changelog.html');
  const html = patchEmbedMarkdown(
    replaceMarkedBlock(readFileSync(htmlPath, 'utf8'), 'changelog', '\n' + renderChangelogList(data) + '\n          '),
    markdown,
  );
  // 查询失败时保留已知清单，不虚构新包。--offline 仅供显式本地验证。
  for (const name of ['gen-download-manifest.mjs']) {
    const args = [resolve(scripts, name), '--root', root];
    if (process.argv.includes('--offline')) args.push('--offline');
    const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${name} 生成失败`);
  }
  write('data/changelog.json', data);
  writeFileSync(htmlPath, html);
  for (const name of ['gen-download-api.mjs', 'gen-update-api.mjs']) {
    const result = spawnSync(process.execPath, [resolve(scripts, name), '--root', root], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${name} 生成失败`);
  }
  const latest = data.versions[0].version;
  const update = json('api/check-update.json');
  assert.equal(update.versions.latest, latest);
  assert.deepEqual(update.notes.items, data.versions[0].platforms.flatMap(group =>
    group.changes.map(change => ({ platform: group.platform, kind: change.kind, text: change.text }))));
  assert.equal(json('api/download/index.json').latestVersion, latest);
  for (const [key, platform] of Object.entries(update.platforms)) {
    const download = json(`api/download/${key}.json`);
    assert.equal(download.latestVersion, latest);
    assert.equal(download.version, platform.version);
    assert.equal(download.available, platform.available);
    assert.equal(download.upToDateWithLatest, platform.upToDateWithLatest);
    assert.equal(download.url, platform.downloadUrl);
  }
  console.log(`✓ LimitRSS 日志与更新/下载接口一致：v${latest}`);
} catch (error) {
  console.error(`✗ LimitRSS 同步失败，停止部署：${error.message}`);
  process.exitCode = 1;
}
