#!/usr/bin/env node
/**
 * 生成「检查更新」接口 —— 供 LimitRSS 客户端在「设置 → 关于 → 检查更新」时调用。
 *
 * 站点是纯静态托管（Retinbox，只有 HTML/CSS/JS/JSON，没有后端进程），
 * 所以这里在构建时把结果算好、落成静态文件。对客户端来说就是一个普通 HTTP GET。
 *
 * 产出两个文件（内容一致，按调用方挑）：
 *   api/check-update.json   App / 任何 HTTP 客户端用
 *   api/check-update.js     浏览器端用（JSONP 式全局变量，无 CORS 顾虑）
 *
 * 数据来源：
 *   data/changelog.json   更新日志快照 —— 决定「最新版本」与更新说明
 *   data/downloads.json   安装包清单   —— 决定「哪个版本、哪个平台真的有包」
 *
 * 两个版本可能不一致（日志先写、安装包后传）。处理原则：
 *   versions.latest        = 更新日志的最新版（用于判断"有没有新版本"）
 *   platforms.<p>.download = 指向「确实存在」的安装包（避免 404 死链）
 *
 * 用法：
 *   node scripts/gen-update-api.mjs
 *   node scripts/gen-update-api.mjs --base-url https://www.demisse.cn/limitrss
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg >= 0 ? resolve(process.argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../limitrss');
const CHANGELOG = resolve(ROOT, 'data/changelog.json');
const DOWNLOADS = resolve(ROOT, 'data/downloads.json');
const OUT_JSON = resolve(ROOT, 'api/check-update.json');
const OUT_JS = resolve(ROOT, 'api/check-update.js');

const argv = process.argv.slice(2);
const valueOf = (f) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const BASE_URL = (valueOf('--base-url') || 'https://www.demisse.cn/limitrss').replace(/\/+$/, '');

/** 接口自身格式版本。客户端可据此判断字段含义是否变化。 */
const SCHEMA_VERSION = 1;

/** 客户端平台标识 → 展示名 */
const PLATFORM_LABELS = {
  mac: 'macOS',
  windows: 'Windows',
  ios: 'iOS',
  android: 'Android',
  harmony: 'HarmonyOS',
};

/** 把 "0.4.0" / "0.4.0-beta.1" 拆成可比较的数字段 */
export function parseVersion(raw) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+](.+))?$/.exec(String(raw || '').trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] || null,
  };
}

/**
 * 语义化版本比较：a > b 返回正数，a < b 返回负数，相等返回 0。
 * 带预发布后缀的（如 0.4.0-beta.1）小于同号正式版（0.4.0）。
 */
export function compareVersion(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (const k of ['major', 'minor', 'patch']) {
    if (pa[k] !== pb[k]) return pa[k] - pb[k];
  }
  if (pa.prerelease && !pb.prerelease) return -1;
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && pb.prerelease) {
    return pa.prerelease < pb.prerelease ? -1 : pa.prerelease > pb.prerelease ? 1 : 0;
  }
  return 0;
}

/** 把更新日志里某个版本的条目拍平成「带类型标签的清单」 */
export function flattenChanges(entry) {
  const out = [];
  for (const group of entry.platforms || []) {
    for (const c of group.changes || []) {
      out.push({ platform: group.platform, kind: c.kind, text: c.text });
    }
  }
  return out;
}

export function buildPayload(changelog, downloads, baseUrl) {
  const versions = Array.isArray(changelog.versions) ? changelog.versions : [];
  if (!versions.length) throw new Error('data/changelog.json 里没有任何版本');
  downloads = downloads || { repo: 'Demisse233/LimitRSS_Client', versions: {} };
  const repo = downloads.repo || 'Demisse233/LimitRSS_Client';
  const pkgVersions = downloads.versions || {};

  // ---------- 最新版本 ----------
  const latestEntry = versions[0];
  const latest = latestEntry.version;

  // ---------- 各平台下载地址 ----------
  // 规则：优先用最新版；最新版没有该平台的包时，退回「清单里最新的有包版本」。
  const platforms = {};
  for (const key of Object.keys(PLATFORM_LABELS)) {
    let file = null;
    let fileVersion = null;
    for (const ver of Object.keys(pkgVersions)) {
      const files = pkgVersions[ver] || {};
      if (files[key]) {
        file = files[key];
        fileVersion = ver;
        break;
      }
    }
    const isLatest = fileVersion === latest;
    platforms[key] = {
      label: PLATFORM_LABELS[key],
      version: fileVersion,
      available: Boolean(file),
      // 只有正好是当前最新版时，才算"可更新到最新版"
      upToDateWithLatest: isLatest,
      downloadUrl: file
        ? `https://github.com/${repo}/releases/download/v${fileVersion}/${file}`
        : null,
      fileName: file,
      // 该平台对应的 Release 页面确实存在（避免客户端点进 404）
      releasePage: file
        ? `https://github.com/${repo}/releases/tag/v${fileVersion}`
        : null,
      // ▸ 固定不变的地址（内容随发版更新，客户端可长期写死这一条）
      //   客户端不必自己拼版本号与文件名，直接请求它即可拿到最新下载地址。
      stableJson: `${baseUrl}/api/download/${key}.json`,
    };
  }

  // ---------- 更新说明（最新版）----------
  const changes = flattenChanges(latestEntry);

  // ---------- Release 页面可用性 ----------
  // v<latest> 这个 Release 可能还没建（日志先写、Release 后建），
  // 直接给 .../releases/tag/v0.4.0 会 404。退回到「确实有包的最新版本」。
  const pkgVersionList = Object.keys(pkgVersions);
  const releaseVersion = pkgVersionList.includes(latest)
    ? latest
    : pkgVersionList[0] || latest;
  const latestReleaseExists = pkgVersionList.includes(latest);

  // ---------- 组装 ----------
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    product: 'LimitRSS',
    versions: {
      latest,
      latestReleaseDate: latestEntry.date || null,
      latestPrerelease: Boolean(parseVersion(latest) && parseVersion(latest).prerelease),
      // 客户端拿自己当前版本与 latest 比较即可判断
      changelog: versions.map((v) => ({ version: v.version, date: v.date || null })),
    },
    notes: {
      url: `${baseUrl}/changelog`,
      // 面向用户的更新说明，已按平台分组
      items: changes,
      // 简短摘要，适合弹窗一行标题
      summary: changes.length ? changes[0].text : '',
      // 只保留通用更新，适合紧凑展示
      general: changes.filter((c) => c.platform === 'general'),
    },
    platforms,
    links: {
      changelog: `${baseUrl}/changelog`,
      downloads: `${baseUrl}/`,
      releasePage: `https://github.com/${repo}/releases`,
      // 一定存在的 Release 页面（若最新版还没建 Release，则指向有包的最新版本）
      releasePageForVersion: `https://github.com/${repo}/releases/tag/v${releaseVersion}`,
      // 最新版是否已建 Release。false 表示"有新版但包还没传"。
      latestReleaseExists,
      // ▸ 下载清单汇总入口：一次拿到所有平台的可用版本与下载地址。
      //   地址固定不变，客户端可长期写死。
      downloadApi: `${baseUrl}/api/download/index.json`,
    },
  };

  return payload;
}

/** 把 payload 落成两个文件（JSON + 浏览器端 JS） */
function writeOutputs(payload) {
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const jsBody =
    '/* 由 scripts/gen-update-api.mjs 自动生成，请勿手工编辑。' +
    ' JSONP 式全局变量，供浏览器端直接读取，避免 CORS。 */\n' +
    'window.LIMITRSS_UPDATE_INFO = ' +
    JSON.stringify(payload, null, 2) +
    ';\n';
  writeFileSync(OUT_JS, jsBody, 'utf8');
}

function main() {
  if (!existsSync(CHANGELOG)) {
    console.error('✗ 找不到 data/changelog.json，请先运行 npm run sync');
    process.exit(1);
  }
  const changelog = JSON.parse(readFileSync(CHANGELOG, 'utf8'));
  let downloads = { repo: 'Demisse233/LimitRSS_Client', versions: {} };
  if (existsSync(DOWNLOADS)) {
    downloads = JSON.parse(readFileSync(DOWNLOADS, 'utf8'));
  } else {
    console.warn('⚠ 缺少 data/downloads.json，下载地址将全部缺失（先跑 npm run manifest）');
  }
  const payload = buildPayload(changelog, downloads, BASE_URL);
  writeOutputs(payload);

  // ---------- 汇报 ----------
  const latest = payload.versions.latest;
  console.log(`✓ 已生成检查更新接口（schema v${payload.schemaVersion}）`);
  console.log(`  最新版本：v${latest}（${payload.versions.latestReleaseDate || '无日期'}）`);
  for (const [, p] of Object.entries(payload.platforms)) {
    if (p.available) {
      const note = p.upToDateWithLatest ? '最新版有包' : `最新版无包，回退到 v${p.version}`;
      console.log(`  ${p.label.padEnd(10)} v${p.version}  ${note}`);
    } else {
      console.log(`  ${p.label.padEnd(10)} 无安装包`);
    }
  }
  if (!payload.links.latestReleaseExists) {
    console.log(
      `  ⚠ v${latest} 的 Release 尚未创建（有新版但安装包未上传）；`
        + `下载地址指向 v${payload.platforms.mac.version || '—'}`
    );
  }
  console.log('  产出：api/check-update.json  api/check-update.js');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
