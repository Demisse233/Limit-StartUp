/**
 * Markdown（笔记软件导出、或直接手写的文件）→ 数据层。
 *
 * 设计原则：格式宽松、报错严格。
 *   - 宽松：日期分隔符、标签写法、平台别名都容错，不必记魔法语法
 *   - 严格：认不出来的东西一定报错并给出行号，绝不静默丢内容
 *
 * 目标格式（标题层级不敏感，但结构要清晰）：
 *
 *   ## V0.3.0 · 2026-11-15
 *   ### macOS
 *   - [新增] 支持自定义快捷键
 *   - [修复] 深色模式下徽章对比度不足
 *   ### Windows
 *   - [新增] 首个正式版
 */
import { resolvePlatform, resolveKind, platformHints, kindHints } from './schema.mjs';

export class ParseError extends Error {
  constructor(line, message) {
    super(`第 ${line} 行: ${message}`);
    this.name = 'ParseError';
    this.line = line;
  }
}

const SEPARATORS = ['·', '•', '|', '｜', '-', '—', '–', '/', '／', '·', ' '];
const DATE_ISO = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
const DATE_CN = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
// 只吃 x.y.z 三段。不能带通用的 -xxx 预发布后缀 ——
// 否则 `## V0.3.0-2026.10.03` 会把日期当成预发布标识吃进版本号。
// 预发布只认明确的字母形态（1.2.3-beta.1），纯数字的 -2026.10.03 不认。
const VERSION_IN_HEADING = /^v?(\d+\.\d+\.\d+(?:-[A-Za-z][0-9A-Za-z.-]*)?)/i;

/** 去零补齐成 ISO：2026-11-5 → 2026-11-05 */
function toIso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 行内 `code` → <code>code</code>；其余 HTML 危险字符转义 */
export function inlineToHtml(text) {
  const parts = [];
  // 先切出行内代码（代码里的星号不该被当粗体，所以代码优先）
  const codeRe = /`([^`]+)`/g;
  const src = String(text);
  let last = 0;
  let m;
  const chunks = [];
  while ((m = codeRe.exec(src))) {
    chunks.push({ code: false, text: src.slice(last, m.index) });
    chunks.push({ code: true, text: m[1] });
    last = m.index + m[0].length;
  }
  chunks.push({ code: false, text: src.slice(last) });

  for (const ch of chunks) {
    if (ch.code) {
      parts.push(`<code>${escapeHtml(ch.text)}</code>`);
      continue;
    }
    // 非代码段里处理 **粗体**
    const boldRe = /\*\*([^*]+)\*\*/g;
    let l2 = 0;
    let m2;
    while ((m2 = boldRe.exec(ch.text))) {
      parts.push(escapeHtml(ch.text.slice(l2, m2.index)));
      parts.push(`<strong>${escapeHtml(m2[1])}</strong>`);
      l2 = m2.index + m2[0].length;
    }
    parts.push(escapeHtml(ch.text.slice(l2)));
  }
  return parts.join('').trim();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 从标题文本里切出版本号与日期 */
export function parseVersionHeading(text, line) {
  const trimmed = String(text).trim();

  const vm = VERSION_IN_HEADING.exec(trimmed);
  if (!vm) {
    throw new ParseError(line, `标题 "${trimmed}" 里找不到版本号，应形如 ## V0.3.0 · 2026-11-15`);
  }
  const version = vm[1];

  // 日期在版本号之后的任意位置找。这样这些写法都能认：
  //   ## V0.3.0-2026.10.03   ## V0.2.0-2026.9.27   ## V0.1.0-2026.09.01
  //   ## V0.3.0 · 2026-11-15  ## V0.3.0 2026年11月15日
  const afterVersion = trimmed.slice(vm[0].length);
  let date = null;
  const iso = DATE_ISO.exec(afterVersion);
  const cn = DATE_CN.exec(afterVersion);
  if (iso) date = toIso(iso[1], iso[2], iso[3]);
  else if (cn) date = toIso(cn[1], cn[2], cn[3]);

  return { version, date };
}

/**
 * 解析一个条目。支持的写法（越靠前越优先）：
 *   - [新增] 内容        ← 推荐，最清楚
 *   - 【新增】内容
 *   - 新增：内容
 *   - 新增 内容           ← 最省事，直接写
 *   + 新增 内容 / * 修复 内容
 *   【新增】内容           ← 不带列表符号也行，独立成行
 *   初始版本              ← 没有任何标签时，整行作为一条「新增」
 * 支持的标签见 kindHints()。
 */
export function parseChangeLine(text, line, opts = {}) {
  const raw = String(text).trim();
  const strict = opts.strict === true;

  const KINDS = [
    '新增', '新功能', '特性', '功能', 'new', 'feat', 'feature',
    '修复', '修正', '问题修复', 'fix', 'bugfix', 'fixed',
    '调整', '优化', '变更', '改进', 'change', 'improve', 'chore',
  ];
  const alt = KINDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  // work 只用于"识别标签"；正文一律从 raw 里切，这样
  // `- **新增** 支持 **快捷键**` 里正文的粗体会保留成 <strong>。
  const work = raw.replace(/\*\*/g, '').trim();

  let kindRaw = null;
  let body = raw;

  // 从 raw 中跳过"标签（可能带括号/粗体/冒号）"这一段的长度
  const bodyAfter = (tagRe) => {
    const mm = tagRe.exec(raw);
    return mm ? raw.slice(mm[0].length) : raw;
  };

  // 1) 带括号：[新增] / 【新增】 / [**修复**]
  let m = new RegExp(`^[\\[【(（]\\s*(${alt})\\s*[\\]】)）]\\s*[:：]?\\s*([\\s\\S]*)$`, 'i').exec(work);
  if (m) {
    kindRaw = m[1];
    body = bodyAfter(new RegExp(`^[\\[【(（]\\s*\\*{0,2}\\s*${m[1]}\\s*\\*{0,2}\\s*[\\]】)）]\\s*[:：]?`));
  }

  // 2) 带冒号：新增：内容
  if (!kindRaw) {
    m = new RegExp(`^(${alt})\\s*[:：]\\s*([\\s\\S]*)$`, 'i').exec(work);
    if (m) {
      kindRaw = m[1];
      body = bodyAfter(new RegExp(`^\\*{0,2}\\s*${m[1]}\\s*\\*{0,2}\\s*[:：]`));
    }
  }

  // 3) 裸标签 + 空格：新增 内容
  if (!kindRaw) {
    m = new RegExp(`^(${alt})\\s+([\\s\\S]*)$`, 'i').exec(work);
    if (m) {
      kindRaw = m[1];
      body = bodyAfter(new RegExp(`^\\*{0,2}\\s*${m[1]}\\s*\\*{0,2}\\s+`));
    }
  }

  // 4) 没有任何标签：整行当作一条「新增」。
  //    这样"初始版本"这类自由文字、以及忘写标签的条目都能正常显示，而不是直接报错。
  if (!kindRaw) {
    if (strict) {
      throw new ParseError(
        line,
        `条目 "${raw.slice(0, 40)}" 没有可识别的变更标签（可用标签：${kindHints()}）`
      );
    }
    kindRaw = 'new';
    body = raw;
  }

  const kind = resolveKind(kindRaw);
  const html = inlineToHtml(body);
  if (!html) throw new ParseError(line, `条目 "${raw.slice(0, 40)}" 的正文为空`);

  return { kind, text: html };
}

/**
 * 把 Markdown 解析成数据层。
 *
 * @param {string} markdown
 * @param {{ fallbackDate?: string, sourceName?: string }} [opts]
 *   fallbackDate: 笔记里没写日期时用它（通常取文件 mtime）
 * @returns {{ versions: Array }}
 */
export function parseMarkdown(markdown, opts = {}) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const versions = [];

  let cur = null;      // 当前版本
  let curPlat = null;  // 当前分类段

  /** 第一个版本标题之前的自由文字 */
  const preamble = [];
  /** 空的分类段（笔记里先铺好标题但没填内容），只做提示不报错 */
  const emptySections = [];

  // 忽略区状态：注释块 / 围栏代码块 / 前言
  let inComment = false;
  let inFence = false;
  let inFrontMatter = false;
  let frontMatterChecked = false;

  const pushCurrent = () => {
    if (cur) {
      if (!cur.date) {
        if (!opts.fallbackDate) {
          throw new ParseError(cur.__line, `版本 ${cur.version} 没写日期，且没有可用的回退日期（请在标题里写 2026-11-15 这样的日期）`);
        }
        cur.date = opts.fallbackDate;
      }
      for (const p of cur.platforms) {
        // 空的分类段是合法的：笔记里常把 5 个平台标题先铺好，只填有变化的那个。
        // 渲染时会跳过没有条目的分类（不显示空徽章），所以这里不报错。
        if (p.__line != null && p.changes.length === 0) {
          emptySections.push(`V${cur.version} 的 ${p.platform} 段为空，已跳过`);
        }
      }
      if (cur.platforms.length === 0) {
        throw new ParseError(
          cur.__line,
          `版本 ${cur.version} 下没有任何分类段，请加一个 #### 通用更新 或 #### macOS 之类的标题`
        );
      }
      for (const p of cur.platforms) delete p.__line;
      delete cur.__line;
      versions.push(cur);
    }
    cur = null;
    curPlat = null;
  };

  /**
   * 确保当前版本有一个「通用更新」分类。
   * 用于笔记里没写分类标题就直接罗列条目的情况 —— 这些条目按"通用更新"处理，
   * 而不是报错要求用户补标题。
   */
  function ensureGeneral(version, lineNo) {
    let gen = version.platforms.find((p) => p.platform === 'general');
    if (!gen) {
      gen = { platform: 'general', changes: [], __line: lineNo };
      version.platforms.unshift(gen); // 通用更新排在最前
    }
    curPlat = gen;
    return gen;
  }

  /** 这一行自己就带变更标签吗（【新增】/ 新增：/ [修复] 等）—— 用于区分"续行"与"新条目" */
  function isTaggedLine(text) {
    const t = String(text).trim();
    return /^[\[【(（]\s*(新增|新功能|特性|功能|修复|修正|问题修复|调整|优化|变更|改进|new|feat|feature|fix|bugfix|fixed|change|improve|chore)\s*[\]】)）]/i.test(t)
      || /^(新增|新功能|特性|功能|修复|修正|问题修复|调整|优化|变更|改进)\s*[:：]/i.test(t);
  }

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    let line = rawLine.replace(/\s+$/, '');

    // ---- 前言（--- 包裹的 YAML）：整块忽略 ----
    if (!frontMatterChecked && !cur) {
      frontMatterChecked = true;
      if (/^---\s*$/.test(line)) {
        inFrontMatter = true;
        return;
      }
    }
    if (inFrontMatter) {
      if (/^---\s*$/.test(line)) inFrontMatter = false;
      return;
    }

    // ---- 围栏代码块：整块忽略 ----
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    // ---- HTML 注释：多行块，或同行 -->
    if (inComment) {
      const end = line.indexOf('-->');
      if (end === -1) return;
      inComment = false;
      line = (line.slice(0, 0) + line.slice(end + 3)).trim();
      if (!line) return;
    }
    if (line.includes('<!--')) {
      const start = line.indexOf('<!--');
      const endSame = line.indexOf('-->', start + 4);
      if (endSame !== -1) {
        line = (line.slice(0, start) + line.slice(endSame + 3)).trim();
        if (!line) return;
      } else {
        inComment = true;
        line = line.slice(0, start).trim();
        if (!line) return;
      }
    }

    if (!line.trim()) return;
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) return;

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();

      // 版本标题：标题里带版本号
      if (VERSION_IN_HEADING.test(text)) {
        pushCurrent();
        const { version, date } = parseVersionHeading(text, lineNo);
        cur = { version, date, platforms: [], __line: lineNo };
        return;
      }

      // 平台标题：认得出平台名
      const platKey = resolvePlatform(text);
      if (platKey) {
        if (!cur) {
          throw new ParseError(lineNo, `"${text}" 出现在任何版本标题之前，请先写 ## V0.3.0 · 日期`);
        }
        if (cur.platforms.some((p) => p.platform === platKey)) {
          throw new ParseError(lineNo, `版本 ${cur.version} 里 ${text} 出现了两次`);
        }
        curPlat = { platform: platKey, changes: [], __line: lineNo };
        cur.platforms.push(curPlat);
        return;
      }

      // 文档大标题（如 "更新日志"）：忽略，不作为错误
      if (level === 1 && !cur) return;

      // 其他标题：当成一条"说明性条目"，而不是报错。
      // 例：## V0.1.0-2026.09.01 下面直接写"初始版本"（无任何 ### 平台）时，
      // 头部这一行就是唯一信息，丢掉它页面就空了。
      if (cur && !curPlat) {
        ensureGeneral(cur, lineNo);
        curPlat.changes.push({ kind: 'new', text: inlineToHtml(text) });
        return;
      }

      throw new ParseError(lineNo, `标题 "${text}" 既不是版本号也不是分类名。可用分类：${platformHints()}`);
    }

    // 列表条目（- / * / + / 1.）
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      if (!cur) throw new ParseError(lineNo, `变更条目出现在任何版本标题之前，请先写 ## V0.3.0 · 日期`);
      if (!curPlat) ensureGeneral(cur, lineNo);
      curPlat.changes.push(parseChangeLine(li[2], lineNo));
      return;
    }

    // 引用块 / 缩进代码：当作说明性内容忽略
    if (/^\s*>/.test(line) || /^\s{4,}\S/.test(line)) return;

    // 没有列表符号的独立行。两种意图都要照顾：
    //   a) 紧跟在上一条之后 → 视为该条的续行（笔记里换行排版很常见）
    //   b) 新起一条（如 `【新增】xxx` 或 `初始版本`）→ 独立成条
    if (cur && curPlat && curPlat.changes.length > 0 && !isTaggedLine(line) && !/^\s*[|`]/.test(line)) {
      const lastChange = curPlat.changes[curPlat.changes.length - 1];
      lastChange.text += ` ${inlineToHtml(line)}`;
      return;
    }

    // 版本段里但还没有分类：放进「通用更新」
    if (cur && !curPlat) {
      ensureGeneral(cur, lineNo);
      curPlat.changes.push(parseChangeLine(line, lineNo));
      return;
    }

    if (cur && curPlat) {
      curPlat.changes.push(parseChangeLine(line, lineNo));
      return;
    }

    // 还没有任何版本标题：收集成「前言」，等第一个版本出现时并入它的通用更新
    if (!cur) {
      preamble.push({ text: line, line: lineNo });
      return;
    }

    throw new ParseError(lineNo, `无法识别的内容："${line.trim().slice(0, 50)}"`);
  });

  pushCurrent();

  // 文档开头、第一个版本标题之前的自由文字 → 并入第一个版本的「通用更新」
  if (preamble.length && versions.length) {
    const first = versions[0];
    let gen = first.platforms.find((p) => p.platform === 'general');
    if (!gen) {
      gen = { platform: 'general', changes: [] };
      first.platforms.unshift(gen);
    }
    gen.changes.unshift(...preamble.map((p) => ({ kind: 'new', text: inlineToHtml(p.text) })));
  }

  if (versions.length === 0) {
    throw new ParseError(1, '没有解析出任何版本。至少需要一个形如 "## V0.3.0 · 2026-11-15" 的标题');
  }

  return { versions, warnings: emptySections };
}
