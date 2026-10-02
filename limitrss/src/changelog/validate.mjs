/**
 * 数据层校验：宁可报错退出，也不要静默生成半成品页面。
 *
 * 每个错误都带"第几个版本 / 哪个平台 / 第几条"，方便直接定位到笔记里的位置。
 */
import { PLATFORM_KEYS, KIND_KEYS, PLATFORMS, KINDS, SECTIONS, GENERAL } from '../../src/changelog/schema.mjs';

const VERSION_RE = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class ValidationError extends Error {
  constructor(problems) {
    super(`数据校验失败，共 ${problems.length} 个问题：\n` + problems.map((p, i) => `  ${i + 1}. ${p}`).join('\n'));
    this.name = 'ValidationError';
    this.problems = problems;
  }
}

/** 校验日期是否真实存在（挡掉 2026-02-30 这类） */
function isRealDate(iso) {
  const m = DATE_RE.exec(iso);
  if (!m) return false;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  return dt.getUTCFullYear() === +y && dt.getUTCMonth() === +mo - 1 && dt.getUTCDate() === +d;
}

/** 对比两个版本号大小（用于检查排序） */
export function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split('-')[0].split('.').map(Number);
  const pb = String(b).replace(/^v/i, '').split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/**
 * @param {unknown} data 待校验的数据
 * @returns {{ ok: true, data: object } | { ok: false, error: ValidationError }}
 */
export function validate(data) {
  const problems = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ValidationError(['数据根节点必须是一个对象，形如 { "versions": [ ... ] }']);
  }
  if (!Array.isArray(data.versions)) {
    throw new ValidationError(['缺少 versions 数组']);
  }
  if (data.versions.length === 0) {
    problems.push('versions 为空：至少需要一个版本');
  }

  const seenVersions = new Set();
  const seenPlatformPerVersion = [];

  data.versions.forEach((v, vi) => {
    const at = `versions[${vi}]`;
    if (!v || typeof v !== 'object') {
      problems.push(`${at} 必须是对象`);
      return;
    }

    // --- version ---
    const version = String(v.version ?? '').trim();
    if (!version) {
      problems.push(`${at} 缺少 version`);
    } else if (!VERSION_RE.test(version)) {
      problems.push(`${at}.version="${version}" 格式不合法，应形如 0.3.0 或 v0.3.0 或 0.3.0-beta.1`);
    } else {
      const dedupKey = version.replace(/^v/i, '');
      if (seenVersions.has(dedupKey)) {
        problems.push(`${at}.version="${version}" 与前面的版本重复`);
      }
      seenVersions.add(dedupKey);
    }

    // --- date ---
    const date = String(v.date ?? '').trim();
    if (!date) {
      problems.push(`${at} 缺少 date（发布日期）`);
    } else if (!isRealDate(date)) {
      problems.push(`${at}.date="${date}" 不是合法日期，应形如 2026-11-15`);
    }

    // --- platforms ---
    if (!Array.isArray(v.platforms) || v.platforms.length === 0) {
      problems.push(`${at} 缺少 platforms：每个版本至少需要一个平台段`);
      return;
    }

    const seenPlat = new Set();
    v.platforms.forEach((p, pi) => {
      const pat = `${at}.platforms[${pi}]`;
      if (!p || typeof p !== 'object') {
        problems.push(`${pat} 必须是对象`);
        return;
      }
      const key = String(p.platform ?? '').trim();
      if (!key) {
        problems.push(`${pat} 缺少 platform，可选：${Object.keys(SECTIONS).join('、')}`);
      } else if (!SECTIONS[key]) {
        problems.push(`${pat}.platform="${key}" 不是已定义的分类，可选：${Object.keys(SECTIONS).join('、')}`);
      } else {
        if (seenPlat.has(key)) problems.push(`${pat}.platform="${key}" 在同一版本内重复出现`);
        seenPlat.add(key);
      }

      // changes 允许为空：笔记里常把平台标题先铺好、只填有变化的那个，
      // 空的分类渲染时会被跳过（不显示空徽章），所以这里不算错误。
      if (!Array.isArray(p.changes)) {
        problems.push(`${pat} 的 changes 必须是数组`);
        return;
      }
      if (p.changes.length === 0) return;

      p.changes.forEach((c, ci) => {
        const cat = `${pat}.changes[${ci}]`;
        if (!c || typeof c !== 'object') {
          problems.push(`${cat} 必须是对象`);
          return;
        }
        const kind = String(c.kind ?? '').trim();
        if (!kind) {
          problems.push(`${cat} 缺少 kind，可选：${KIND_KEYS.join('、')}`);
        } else if (!KIND_KEYS.includes(kind)) {
          problems.push(`${cat}.kind="${kind}" 不是已定义的变更类型，可选：${KIND_KEYS.join('、')}`);
        }
        const text = String(c.text ?? '').trim();
        if (!text) {
          problems.push(`${cat} 的 text 为空（空的变更条目请删掉）`);
        } else if (/[<>]/.test(text) && !/<code>|<\/code>|&lt;|&gt;/.test(text)) {
          // 裸的 < > 会破坏 HTML；允许 <code> 与实体
          problems.push(`${cat}.text 含未转义的 < 或 >，请写成 &lt; &gt; 或用 <code> 包裹`);
        }
      });
      seenPlatformPerVersion.push(key);
    });
  });

  // --- 排序检查（提示性，不算致命，但列出来） ---
  for (let i = 1; i < data.versions.length; i++) {
    const prev = String(data.versions[i - 1]?.version ?? '');
    const cur = String(data.versions[i]?.version ?? '');
    if (VERSION_RE.test(prev) && VERSION_RE.test(cur) && compareVersions(prev, cur) < 0) {
      problems.push(`版本顺序有问题：versions[${i - 1}]="${prev}" 排在 versions[${i}]="${cur}" 前面，新版本应排在最前`);
    }
  }

  // --- 首页版本号同步所需：至少要有一个真实平台（通用更新不算平台） ---
  const anyRealPlatform = data.versions.some(
    (v) => Array.isArray(v?.platforms) && v.platforms.some((p) => p?.platform && p.platform !== GENERAL.key)
  );
  if (!anyRealPlatform && data.versions.length > 0) {
    problems.push('没有任何版本包含真实平台（只有通用更新）；首页下载卡需要平台版本号');
  }

  if (problems.length) return { ok: false, error: new ValidationError(problems) };
  return { ok: true, data };
}

/** 供渲染与首页同步使用：某平台的最新版本号（字符串，带 v 前缀） */
export function latestVersionFor(data, platformKey) {
  // 通用更新不是一个可下载的平台，不能作为某平台的最新版本号
  if (platformKey === GENERAL.key) return null;
  for (const v of data.versions) {
    if (v.platforms?.some((p) => p.platform === platformKey)) {
      return normalizeVersionLabel(v.version);
    }
  }
  return null;
}

/** 0.3.0 / v0.3.0 → "v0.3.0"（首页徽章用小写 v） */
export function normalizeVersionLabel(version) {
  const s = String(version).trim();
  return s.toLowerCase().startsWith('v') ? s : `v${s}`;
}

/** 0.3.0 / v0.3.0 → "V0.3.0"（changelog 卡片标题用大写 V） */
export function displayVersion(version) {
  const s = String(version).trim().replace(/^v/i, '');
  return `V${s}`;
}

/** PLATFORMS 供渲染器使用 */
export { PLATFORMS, KINDS, SECTIONS, GENERAL };
