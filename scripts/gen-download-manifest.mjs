#!/usr/bin/env node
/**
 * 生成「下载清单」：查 GitHub Release 里实际存在哪些安装包。
 *
 * 为什么要构建时做这件事：
 *   浏览器无法在前端探测 release 资产是否存在 —— GitHub 的下载地址会 302 到
 *   objects.githubusercontent.com，那条链路没有 CORS 头，fetch 一律
 *   `TypeError: Failed to fetch`。所以只能在构建时（Node 环境）查，
 *   把结果落成一个本地 JSON，网页运行时直接读它，零额外网络请求。
 *
 * 产出：data/downloads.json
 *   {
 *     "repo": "owner/name",
 *     "generatedAt": "2026-...",
 *     "versions": {
 *       "0.4.0": { "mac": "LimitRSS-0.4.0-macOS.dmg", "android": "..." },
 *       "0.3.1": { ... }
 *     }
 *   }
 *
 *   versions 里的键是版本号（不带 v），值是「该版本实际存在的资产文件名」。
 *   某个平台如果没有对应文件，该键就不出现 —— 网页据此回退到更早版本。
 *
 * 用法：
 *   node scripts/gen-download-manifest.mjs
 *   node scripts/gen-download-manifest.mjs --repo owner/name
 *   node scripts/gen-download-manifest.mjs --offline   # 跳过联网，仅保留旧清单
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseManifest } from '../limitrss/src/downloads.mjs';

const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg >= 0 ? resolve(process.argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../limitrss');
const OUT = resolve(ROOT, 'data/downloads.json');

const argv = process.argv.slice(2);
const valueOf = (f) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const DEFAULT_REPO = 'Demisse233/LimitRSS_Releases';
const REPO = valueOf('--repo') || DEFAULT_REPO;

// 平台 → 文件名里的特征串。判定资产属于哪个平台就看文件名是否包含它。
// 顺序重要：先匹配更具体的（macOS 与 iOS 都含 "OS"? 不会，但保持显式更安全）
const PLATFORM_MATCHERS = [
  { key: 'mac', ext: '.dmg' },
  { key: 'ios', ext: '.ipa' },
  { key: 'android', ext: '.apk' },
  { key: 'harmony', ext: '.hap' },
  { key: 'windows', ext: '.exe' },
];

/** 从资产文件名判断平台（先定平台，版本号才知道该在哪里截断） */
function platformFromName(name) {
  const lower = name.toLowerCase();
  for (const { key, ext } of PLATFORM_MATCHERS) {
    if (lower.endsWith(ext)) return key;
  }
  return null;
}

/**
 * 从资产文件名提取版本号，形如 LimitRSS-0.3.1-Android.apk → 0.3.1
 *
 * 关键：版本号后面紧跟的是平台名，而平台名可能含点号（macOS.dmg），
 * 所以宽松的 `(?:-[A-Za-z0-9.]+)?` 会把「-Android.apk」整段吃进版本号。
 * 正确做法是先定位平台标记，在它之前截断，再取版本号。
 */
function versionFromName(name, platformKey) {
  const fileName = name.split('/').pop();
  const noExt = fileName.replace(/\.[A-Za-z0-9]+$/, '');
  let head = noExt;
  if (platformKey) {
    // 平台名在文件名里的常见写法
    const labels = {
      mac: ['macos', 'mac'],
      ios: ['ios'],
      android: ['android'],
      harmony: ['harmonyos', 'harmony'],
      windows: ['windows', 'win'],
    }[platformKey] || [];
    const lower = noExt.toLowerCase();
    for (const lb of labels) {
      const idx = lower.lastIndexOf(lb);
      if (idx > 0) {
        head = noExt.slice(0, idx);
        break;
      }
    }
  }
  // 用全局匹配取「最后一个」版本号：这样 Windows-0.2.0 这类
  // 「版本号在平台名之后」的命名也能正确识别（取第一个会漏掉）。
  const all = head.match(/\d+\.\d+\.\d+(?:-(?:alpha|beta|rc|pre)[A-Za-z0-9.]*)?/gi);
  return all && all.length ? all[all.length - 1] : null;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'LimitRSS-website-sync',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function main() {
  if (argv.includes('--offline')) {
    console.log('· 已指定 --offline，跳过联网，保留现有清单');
    if (!existsSync(OUT)) {
      console.error('✗ 清单不存在，--offline 无法生成');
      process.exit(1);
    }
    return;
  }

  console.log(`· 查询 GitHub Releases：${REPO}`);
  let releases;
  try {
    releases = await fetchJson(
      `https://api.github.com/repos/${REPO}/releases?per_page=100`
    );
  } catch (e) {
    console.warn(`⚠ 查询失败（${e.message}）`);
    if (existsSync(OUT)) {
      console.warn('  保留已知安装包清单；不将未确认的新包标为可用');
      return;
    }
    throw new Error('无法确认安装包状态，且没有已有清单，停止部署');
  }

  const out = releaseManifest(releases);
  const sorted = out.versions;
  const scanned = releases.reduce((total, release) => total + (release.assets || []).length, 0);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

  const total = Object.keys(sorted).length;
  console.log(`· 扫描 ${releases.length} 个 release / ${scanned} 个资产`);
  console.log(`✓ 已写入 data/downloads.json：${total} 个版本含安装包`);
  for (const [ver, files] of Object.entries(sorted)) {
    const list = Object.entries(files)
      .map(([k, v]) => `${k}=${v}`)
      .join('  ');
    console.log(`    v${ver}  ${list}`);
  }
}

main().catch((e) => {
  console.error('✗ 生成清单失败：', e.message);
  process.exit(1);
});
