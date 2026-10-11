/**
 * HTML 打补丁：只动"被标记的区块"，其余字节原样保留。
 *
 * 标记约定：
 *   changelog.html
 *     <!-- changelog:start --> ... <!-- changelog:end -->   整段版本列表由数据层渲染
 *   index.html
 *     <span data-changelog="mac">v0.2.0</span>               标签内文本 = 该平台最新版本号
 *     <p data-changelog-line>...</p>                         整行说明由数据层生成
 *
 * 这样可以保证：跑同步只改内容，不会碰缩进、注释、class 等手写细节。
 */

export class PatchError extends Error {}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 替换 <!-- name:start --> 与 <!-- name:end --> 之间的内容。
 * 若标记不存在则报错（不静默新建，避免标记被误删后产生两份内容）。
 */
export function replaceMarkedBlock(html, name, newBody, { file = '' } = {}) {
  const startTag = `<!-- ${name}:start -->`;
  const endTag = `<!-- ${name}:end -->`;
  const si = html.indexOf(startTag);
  const ei = html.indexOf(endTag);
  if (si === -1 || ei === -1) {
    throw new PatchError(`${file} 里找不到 ${startTag} / ${endTag} 标记，无法定位要替换的区块`);
  }
  if (ei < si) throw new PatchError(`${file} 里 ${name} 的 end 标记出现在 start 之前`);
  return html.slice(0, si + startTag.length) + newBody + html.slice(ei);
}

/**
 * 替换所有带 data-changelog="平台key" 的元素的文本内容。
 * 返回 { html, replaced } —— replaced 是实际替换个数，用于校验标记是否齐全。
 */
export function patchVersionBadges(html, versionsByPlatform, { file = '' } = {}) {
  let replaced = 0;
  const re = /(<([a-z][a-z0-9-]*)\b[^>]*\bdata-changelog="([a-z0-9-]+)"[^>]*>)([\s\S]*?)(<\/\2>)/gi;
  const out = html.replace(re, (m, open, tag, key, _inner, close) => {
    const label = versionsByPlatform[key];
    if (label == null) return m; // 该平台没有版本数据时保持原样，不写空
    replaced += 1;
    return `${open}${label}${close}`;
  });
  if (replaced === 0) {
    throw new PatchError(`${file} 里没有找到任何 data-changelog="..." 标记`);
  }
  return { html: out, replaced };
}

/** 替换带 data-changelog-line 的元素内部 HTML */
export function patchChangelogLine(html, innerHtml, { file = '' } = {}) {
  const re = /(<p\b[^>]*\bdata-changelog-line\b[^>]*>)([\s\S]*?)(<\/p>)/i;
  if (!re.test(html)) throw new PatchError(`${file} 里找不到 data-changelog-line 标记`);
  return html.replace(re, (_m, open, _inner, close) => `${open}${innerHtml}${close}`);
}

/**
 * 替换页面内嵌的兜底 markdown（<script type="text/markdown" data-changelog-embed>）。
 *
 * 这是 file:// 协议下唯一的数据来源（模块与 fetch 都会被 CORS 拦），
 * 所以同步脚本必须把它一起更新，否则直连打开会看到旧内容。
 * 用 CDATA 包裹，避免正文里的尖括号被 HTML 解析器吃掉。
 */
export function patchEmbedMarkdown(html, markdown, { file = '' } = {}) {
  const re = /(<script type="text\/markdown" data-changelog-embed>)([\s\S]*?)(<\/script>)/;
  if (!re.test(html)) throw new PatchError(`${file} 里找不到内嵌 markdown 块（data-changelog-embed）`);
  const body = '\n<![CDATA[\n' + String(markdown).replace(/\s+$/, '') + '\n]]>\n          ';
  return html.replace(re, (_m, open, _inner, close) => `${open}${body}${close}`);
}
