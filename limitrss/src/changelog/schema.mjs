/**
 * 平台与变更类型的规范定义。
 *
 * 这里是"笔记里的文字" → "官网 DOM" 的唯一映射表：
 *   - 别名（aliases）让人在笔记里怎么写都能认出来，不必记魔法字符串
 *   - key/label/logo/badgeClass 决定渲染出来的徽章长什么样
 *
 * 新增平台时只改这个文件，渲染器与解析器都会自动支持。
 */

/** 变更类型：笔记里的标签 → CSS 类 → 规范名 */
export const KINDS = {
  new: { klass: 'kind-new', label: '新增', aliases: ['新增', '新功能', '特性', '功能', 'new', 'feat', 'feature'] },
  fix: { klass: 'kind-fix', label: '修复', aliases: ['修复', '修正', '修bug', '问题修复', 'fix', 'bugfix', 'fixed'] },
  change: { klass: 'kind-change', label: '优化', aliases: ['优化', '调整', '变更', '改进', 'change', 'improve', 'chore'] },
};

/**
 * 分类：不针对某个具体平台的更新（笔记里写「通用更新」）。
 * 它和平台一样占一个徽章位，渲染顺序排在最前面。
 * isGeneral 用于把它排除在"各平台最新版本号"的计算之外 ——
 * 首页下载卡要的是真实平台，通用更新不是一个可下载的平台。
 */
export const GENERAL = {
  key: 'general',
  label: '通用更新',
  logo: 'logo-general.svg',
  badgeClass: 'platform-badge--general',
  isGeneral: true,
  aliases: [
    '通用更新', '通用', '全平台', '所有平台', '全部平台', '跨平台', '通用变更',
    'general', 'common', 'all', 'all platforms',
  ],
};

/** 平台：渲染顺序即此对象声明顺序（GENERAL 由渲染器前置） */
export const PLATFORMS = {
  mac: { label: 'macOS', logo: 'logo-macos.png', badgeClass: 'platform-badge--mac', aliases: ['macos', 'mac', 'mac os', '苹果', 'mac 桌面'] },
  windows: { label: 'Windows', logo: 'logo-windows.png', badgeClass: 'platform-badge--windows', aliases: ['windows', 'win', 'win32', 'win64', '微软'] },
  ios: { label: 'iOS', logo: 'logo-ios.png', badgeClass: 'platform-badge--ios', aliases: ['ios', 'iphone', 'ipad', 'ipados'] },
  android: { label: 'Android', logo: 'logo-android.png', badgeClass: 'platform-badge--android', aliases: ['android', '安卓', 'apk'] },
  harmony: { label: 'HarmonyOS', logo: 'logo-harmony.png', badgeClass: 'platform-badge--harmony', aliases: ['harmonyos next', 'harmonyos', 'harmony', '鸿蒙', '鸿蒙 next', 'openharmony'] },
};

/** 分类 key → 元信息（含通用更新），供渲染器统一取用 */
export const SECTIONS = { general: GENERAL, ...PLATFORMS };

/** 首页下载卡里的平台标识 → 数据层平台 key（顺序无关，按 data-os 匹配） */
export const DOWNLOAD_OS_TO_PLATFORM = {
  mac: 'mac',
  windows: 'windows',
  ios: 'ios',
  android: 'android',
  harmony: 'harmony',
};

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/[\s_]+/g, ' ');

/** 分类别名（含通用更新）→ key；认不出来返回 null（调用方负责报错，不静默丢弃） */
export function resolvePlatform(raw) {
  const key = norm(raw);
  if (!key) return null;
  for (const [k, v] of Object.entries(SECTIONS)) {
    if (k === key) return k;
    if (norm(v.label) === key) return k;
    if (v.aliases.some((a) => norm(a) === key)) return k;
  }
  return null;
}


/** 变更标签别名 → kind；认不出来返回 null */
export function resolveKind(raw) {
  const key = norm(raw).replace(/^\[|\]$/g, '');
  if (!key) return null;
  for (const [k, v] of Object.entries(KINDS)) {
    if (k === key) return k;
    if (norm(v.label) === key) return k;
    if (v.aliases.some((a) => norm(a) === key)) return k;
  }
  return null;
}

/** 允许的平台 key 列表 */
export const PLATFORM_KEYS = Object.keys(PLATFORMS);
/** 允许的 kind 列表 */
export const KIND_KEYS = Object.keys(KINDS);

/** 全部可识别的分类别名，用于给用户报错时提示 */
export function platformHints() {
  return Object.keys(SECTIONS).map((k) => `${k}(${SECTIONS[k].label})`).join('、');
}

/** 全部可识别的变更标签，用于给用户报错时提示 */
export function kindHints() {
  return KIND_KEYS.map((k) => `${k}(${KINDS[k].label})`).join('、');
}
