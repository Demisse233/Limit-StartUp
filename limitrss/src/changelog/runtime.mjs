/**
 * 更新日志页面运行时：读取 Markdown → 渲染成现有 DOM 结构。
 *
 * 页面上的约定（changelog.html）：
 *   <div class="changelog-list"
 *        data-changelog-root
 *        data-changelog-src="./notes/changelog.md"
 *        data-changelog-fallback="./data/changelog.json">
 *     <script type="text/markdown">…</script>   ← 离线兜底
 *   </div>
 *
 * 层级优先级：外部 md → 数据 JSON → 内嵌 md → 静态回退内容。
 * 任何一层出问题都往下一层退，绝不把页面留成空白。
 */
import { parseMarkdown } from './parse-md.mjs';
import { renderChangelogList } from './render.mjs';
import { loadMarkdown } from './loader.mjs';

const LOG_PREFIX = '[changelog]';

function warn(...args) {
  // eslint-disable-next-line no-console
  console.warn(LOG_PREFIX, ...args);
}

/**
 * 替换内容后立刻把新节点登记给入场动画观察器。
 *
 * 不做这一步的后果：新插入的 .reveal 节点永远不会被已启动的
 * IntersectionObserver 观察到，会永久停在 opacity:0 —— 整页空白且不报错。
 *
 * 时机说明：innerHTML 与本函数在同一个 JS 任务里同步执行，浏览器不会在两者之间绘制，
 * 所以不存在"内容短暂隐身"的窗口（实测过：提前 observe 根节点反而会
 * 让新子节点在下一帧才 intersect，于是真的隐身到兜底才亮 —— 已弃用那种做法）。
 * 同时派发 changelog:rendered 供 script.js 感知，并挂一个兜底。
 */
function registerReveal(root) {
  try {
    if (typeof window !== 'undefined' && typeof window.LimitReveal === 'function') {
      window.LimitReveal(root);
    }
    document.dispatchEvent(new CustomEvent('changelog:rendered', { detail: { root } }));
  } catch (err) {
    warn('登记入场动画失败，强制显示内容：', err);
    root.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  }

  // 兜底：若 1.5 秒后仍有节点没被点亮，直接显示。宁可少一个入场动画，也不能看不见内容。
  // 注意：视口外的卡片本来就不会与视口相交（IntersectionObserver 判 false），
  // 那是正常现象，不算异常 —— 只有"其实已经进入视口却仍然透明"才值得告警。
  setTimeout(() => {
    const pending = [...root.querySelectorAll('.reveal')].filter(
      (el) => getComputedStyle(el).opacity === '0'
    );
    if (pending.length === 0) return;

    const inViewport = (el) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    };
    const anomalous = pending.filter(inViewport);

    pending.forEach((el) => el.classList.add('is-visible'));
    if (anomalous.length) {
      warn(`${anomalous.length} 个已进入视口的节点未显示，已强制点亮（入场动画可能未生效）`);
    }
  }, 1500);
}

/** 把 Markdown 文本变成要注入的 HTML */
function renderFromMarkdown(markdown) {
  const data = parseMarkdown(markdown);
  const html = renderChangelogList(data);
  return { html, data };
}

/** 从 data/changelog.json 取兜底（同步脚本生成的快照） */
async function renderFromJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.versions) || data.versions.length === 0) {
    throw new Error(`${path} 里没有 versions`);
  }
  return { html: renderChangelogList(data), data };
}

/**
 * 初始化。返回一个描述实际数据来源的对象（便于自测与调试）。
 * 失败时不抛异常，页面保留原有静态内容。
 */
export async function bootChangelog(doc = document) {
  const root = doc.querySelector('[data-changelog-root]');
  if (!root) {
    warn('找不到 [data-changelog-root]，跳过运行时渲染');
    return { ok: false, reason: 'no-root' };
  }

  const paths = (root.getAttribute('data-changelog-src') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const fallbackJson = (root.getAttribute('data-changelog-fallback') || '').trim();

  const errors = [];

  // ---- 1) Markdown（外部文件 → 内嵌） ----
  let loaded = { markdown: null, source: 'none', path: null, attempts: [] };
  try {
    loaded = await loadMarkdown({ root, paths });
  } catch (err) {
    errors.push(`markdown 装载异常：${err.message}`);
  }
  if (loaded.attempts && loaded.attempts.length) {
    for (const a of loaded.attempts) warn('外部 md 候选失败：', a);
  }

  if (loaded.markdown) {
    try {
      const { html, data } = renderFromMarkdown(loaded.markdown);
      root.innerHTML = html;
      registerReveal(root);
      return {
        ok: true,
        source: loaded.source === 'file' ? 'markdown-file' : 'markdown-embedded',
        path: loaded.path,
        versions: data.versions.length,
        errors,
      };
    } catch (err) {
      errors.push(`解析 markdown 失败：${err.message}`);
      warn('解析 markdown 失败，尝试下一层兜底：', err.message);
    }
  }

  // ---- 2) 数据 JSON 快照 ----
  if (fallbackJson) {
    try {
      const { html, data } = await renderFromJson(fallbackJson);
      root.innerHTML = html;
      registerReveal(root);
      return { ok: true, source: 'json-snapshot', path: fallbackJson, versions: data.versions.length, errors };
    } catch (err) {
      errors.push(`读取 ${fallbackJson} 失败：${err.message}`);
    }
  }

  // ---- 3) 保留页面里的静态内容 ----
  warn('全部数据来源都失败，保留页面里的静态内容。', errors);
  return { ok: false, reason: 'all-sources-failed', errors };
}
