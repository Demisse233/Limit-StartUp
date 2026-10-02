/**
 * 渲染器：数据层 → changelog.html 的 DOM。
 *
 * 输出的 markup 必须与改造前手写的结构逐字符一致（有单测保证），
 * 这样"抽成数据层"对页面视觉是零影响。
 */
import { PLATFORMS, KINDS, SECTIONS } from './schema.mjs';
import { displayVersion } from './validate.mjs';

/** 2026-10-01 → 2026 年 10 月 1 日（去掉月/日的补零，与手写版一致） */
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) throw new Error(`日期格式不合法: ${iso}`);
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日`;
}

/** 条目正文：只对裸文本做最小转义，保留已算作 HTML 的 <code>/<strong> 片段 */
export function renderChangeText(text) {
  return String(text).trim();
}

/** 渲染一条变更 */
export function renderChange(change) {
  const kind = KINDS[change.kind];
  if (!kind) throw new Error(`未知变更类型: ${change.kind}`);
  return `                <li><strong class="${kind.klass}">${kind.label}</strong> ${renderChangeText(change.text)}</li>`;
}

/**
 * 渲染一个分类段（通用更新 或 某个平台）。
 * 没有条目的分类直接跳过 —— 笔记里常把 5 个平台标题先铺好只填有变化的那个，
 * 空的分类不该在页面上留下一个空徽章。
 */
export function renderPlatform(section) {
  const meta = SECTIONS[section.platform];
  if (!meta) throw new Error(`未知分类: ${section.platform}`);
  if (!Array.isArray(section.changes) || section.changes.length === 0) return null;

  const comment = meta.isGeneral ? meta.label : section.platform === 'mac' ? `${meta.label} 段` : meta.label;
  const items = section.changes.map(renderChange).join('\n');
  return `            <!-- ${comment} -->
            <div class="changelog-platform">
              <div class="platform-badge ${meta.badgeClass}">
                <img src="./assets/${meta.logo}" alt="" />
                <span>${meta.label}</span>
              </div>
              <ul class="changelog-changes">
${items}
              </ul>
            </div>`;
}

/**
 * 渲染一张版本卡。
 * --rd 是滚动入场的错开延迟，第 n 张卡 = n × 0.08s（与手写版一致，首张省略）。
 */
export function renderEntry(version, index = 0) {
  const delay = index * 0.08;
  const styleAttr = delay > 0 ? ` style="--rd:${delay.toFixed(2)}s"` : '';
  const blocks = version.platforms.map(renderPlatform).filter(Boolean);
  const platforms = blocks.join('\n\n');
  const body = platforms ? `\n\n${platforms}` : '';
  return `          <article class="changelog-entry glass reveal"${styleAttr}>
            <header class="changelog-head">
              <h2 class="changelog-version">${displayVersion(version.version)}</h2>
              <span class="changelog-date">${formatDate(version.date)}</span>
            </header>${body}
          </article>`;
}

/**
 * 渲染 changelog-list 的全部内容（不含外层 <div class="changelog-list"> 本身）。
 * 首尾不加空行 —— 由调用方负责与包裹层之间的空行。
 */
export function renderChangelogList(data) {
  return data.versions
    .map((v, i) => `          <!-- ${displayVersion(v.version)} -->\n` + renderEntry(v, i))
    .join('\n\n');
}
