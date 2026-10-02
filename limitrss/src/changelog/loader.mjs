/**
 * Markdown 装载器（浏览器端）。
 *
 * 两条通道，按顺序尝试：
 *   1. fetch 外部 markdown 文件（"后台放一个 md" 的主路径）
 *   2. 页面内嵌的 <script type="text/markdown"> 兜底
 *
 * 为什么需要通道 2：浏览器在 file:// 协议下会拒绝 fetch 本地文件
 * （Chrome 报 "URL scheme must be http or https"）。直接双击 index.html 预览时，
 * 通道 1 必然失败，此时用内嵌内容，页面照样是完整的。
 */

/** 取内嵌 markdown 原文；没有则返回 null */
export function readEmbedded(root) {
  const el = root.querySelector('script[type="text/markdown"]');
  if (!el) return null;
  const text = el.textContent || '';
  // 支持 <![CDATA[ ... ]]> 包裹，避免正文里的尖括号被 HTML 解析器吃掉
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(text);
  const body = cdata ? cdata[1] : text;
  const trimmed = body.trim();
  return trimmed ? trimmed : null;
}

/** 逐个尝试候选路径，返回第一个成功的 { markdown, path } */
export async function fetchFirstAvailable(paths, { signal } = {}) {
  const attempts = [];
  for (const path of paths) {
    try {
      const res = await fetch(path, { cache: 'no-cache', signal });
      if (!res.ok) {
        attempts.push(`${path} → HTTP ${res.status}`);
        continue;
      }
      const markdown = await res.text();
      if (!markdown.trim()) {
        attempts.push(`${path} → 内容为空`);
        continue;
      }
      return { markdown, path, attempts };
    } catch (err) {
      attempts.push(`${path} → ${err && err.message ? err.message : '读取失败'}`);
    }
  }
  return { markdown: null, path: null, attempts };
}

/**
 * 按"外部文件优先、内嵌兜底"取 markdown。
 * @returns {{ markdown: string, source: 'file'|'embedded', path: string|null, attempts: string[] }}
 */
export async function loadMarkdown({ root, paths, signal }) {
  const attempts = [];

  if (Array.isArray(paths) && paths.length > 0 && typeof fetch === 'function') {
    const r = await fetchFirstAvailable(paths, { signal });
    attempts.push(...r.attempts);
    if (r.markdown) {
      return { markdown: r.markdown, source: 'file', path: r.path, attempts };
    }
  }

  const embedded = readEmbedded(root);
  if (embedded) {
    return { markdown: embedded, source: 'embedded', path: null, attempts };
  }

  return { markdown: null, source: 'none', path: null, attempts };
}
