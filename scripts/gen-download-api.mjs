#!/usr/bin/env node
/**
 * 生成「安装包下载清单」—— 提供**与版本号无关的稳定地址**。
 *
 * 为什么需要它：
 *   App 在「检查更新」里拿到新版本后要下载安装包。如果直接用
 *   https://github.com/.../releases/download/v0.4.0/xxx.dmg 这种地址，
 *   客户端就得自己拼版本号和文件名，发版就可能有漏改。
 *   这里给每个平台一个固定不变的地址，内容由构建时算好。
 *
 * 产出（地址永久不变，内容随发版更新）：
 *   api/download/index.json        所有平台的汇总
 *   api/download/mac.json          macOS
 *   api/download/ios.json          iOS
 *   api/download/android.json      Android
 *   api/download/harmony.json      HarmonyOS
 *   api/download/windows.json      Windows
 *
 * ⚠️ 这些接口**只返回下载地址，不直接返回文件流**。
 *    原因（已实测）：本站托管在 Retinbox，它对任何不存在的路径都返回
 *    HTTP 200 + 主站 index.html（只是 MIME 被 _headers 改成了 application/json）。
 *    所以静态托管做不出真正的 302 重定向——客户端拿到的永远是 200 + HTML，
 *    会把网页当安装包下下来。
 *    正确做法：先调这个接口拿 url，再请求那个 url（GitHub 会 302 到对象存储并
 *    带 Content-Disposition: attachment，原生 HTTP 客户端默认跟随重定向）。
 *
 * 用法：
 *   node scripts/gen-download-api.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg >= 0 ? resolve(process.argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../limitrss');
const DOWNLOADS = resolve(ROOT, 'data/downloads.json');
const CHANGELOG = resolve(ROOT, 'data/changelog.json');
const OUT_DIR = resolve(ROOT, 'api/download');

const argv = process.argv.slice(2);
const valueOf = (f) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const BASE_URL = (valueOf('--base-url') || 'https://www.demisse.cn/limitrss').replace(/\/+$/, '');

/** 与 script.js / gen-update-api.mjs 保持一致的平台顺序 */
const PLATFORMS = [
  { key: 'mac', label: 'macOS', ext: '.dmg' },
  { key: 'windows', label: 'Windows', ext: '.exe' },
  { key: 'ios', label: 'iOS', ext: '.ipa' },
  { key: 'android', label: 'Android', ext: '.apk' },
  { key: 'harmony', label: 'HarmonyOS', ext: '.hap' },
];

/** GitHub Release 资产地址 */
export function assetUrl(repo, version, fileName) {
  return `https://github.com/${repo}/releases/download/v${version}/${fileName}`;
}

/**
 * 从清单里解析「某平台最新的、确实有包的版本」。
 * 规则必须与 script.js 里的 resolveDownloadEntry 完全一致。
 */
export function resolveDownload(versions, key, repo) {
  if (!versions || !key) return null;
  for (const ver of Object.keys(versions)) {
    const files = versions[ver] || {};
    if (files[key]) {
      return {
        version: ver,
        fileName: files[key],
        url: assetUrl(repo, ver, files[key]),
      };
    }
  }
  return null;
}

export function buildPlatformPayload(key, label, versions, repo, latestVersion) {
  const hit = resolveDownload(versions, key, repo);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    product: 'LimitRSS',
    platform: key,
    label,
    available: Boolean(hit),
    version: hit ? hit.version : null,
    fileName: hit ? hit.fileName : null,
    // 客户端拿这个地址去下载；GitHub 会 302 到最终文件并带 attachment 头
    url: hit ? hit.url : null,
    // 该平台的包是否已跟上更新日志的最新版本
    upToDateWithLatest: hit ? hit.version === latestVersion : false,
    // 若还不是最新版，这里说明差在哪个版本
    latestVersion: latestVersion || null,
    // 该版本对应的 Release 页面（一定存在）
    releasePage: hit ? `https://github.com/${repo}/releases/tag/v${hit.version}` : null,
    // 兜底入口
    changelog: `${BASE_URL}/changelog`,
    downloads: `${BASE_URL}/`,
  };
}

function main() {
  if (!existsSync(DOWNLOADS)) {
    console.error('✗ 找不到 data/downloads.json，请先运行 npm run manifest');
    process.exit(1);
  }
  const downloads = JSON.parse(readFileSync(DOWNLOADS, 'utf8'));
  const repo = downloads.repo || 'Demisse233/LimitRSS_Releases';
  const versions = downloads.versions || {};

  let latestVersion = null;
  if (existsSync(CHANGELOG)) {
    const cl = JSON.parse(readFileSync(CHANGELOG, 'utf8'));
    latestVersion = cl.versions && cl.versions[0] ? cl.versions[0].version : null;
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const summary = [];
  for (const { key, label } of PLATFORMS) {
    const payload = buildPlatformPayload(key, label, versions, repo, latestVersion);
    writeFileSync(
      resolve(OUT_DIR, `${key}.json`),
      JSON.stringify(payload, null, 2) + '\n',
      'utf8'
    );
    summary.push(payload);
  }

  // 汇总入口：客户端可以先拿这个，再按平台取具体文件
  const index = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    product: 'LimitRSS',
    latestVersion,
    repo,
    // 说明客户端该如何使用（自描述，减少对接沟通成本）
    usage:
      'GET 本文件取平台清单，再 GET api/download/<platform>.json 取下载地址，' +
      '然后用返回的 url 请求安装包。请自带 ?t=<时间戳> 绕开缓存。',
    platforms: summary.reduce((acc, p) => {
      acc[p.platform] = {
        label: p.label,
        available: p.available,
        version: p.version,
        file: `${BASE_URL}/api/download/${p.platform}.json`,
        url: p.url,
      };
      return acc;
    }, {}),
  };
  writeFileSync(resolve(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

  console.log('✓ 已生成下载清单接口（每个平台一个固定地址）');
  for (const p of summary) {
    if (p.available) {
      const note = p.upToDateWithLatest ? '已是最新' : `最新版 v${latestVersion} 的包尚未上传`;
      console.log(`  ${p.label.padEnd(10)} v${p.version}  ${note}`);
    } else {
      console.log(`  ${p.label.padEnd(10)} 暂无安装包`);
    }
  }
  console.log('  产出：api/download/{index,mac,windows,ios,android,harmony}.json');
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main();
}
