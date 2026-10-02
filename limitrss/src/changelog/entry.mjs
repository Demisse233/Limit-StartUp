/**
 * changelog.html 的独立入口。
 *
 * 与 script.js 分开：script.js 负责主题/导航等全站交互，
 * 这个文件只负责更新日志的"读 Markdown → 渲染"。
 * 两者都用 defer，互不阻塞、互不依赖。
 *
 * 入场动画的登记在 runtime.mjs 里完成（替换内容前先 observe 根节点），
 * 这里只负责日志输出与把结果暴露给自测脚本。
 */
import { bootChangelog } from './runtime.mjs';

bootChangelog()
  .then((result) => {
    if (result.ok) {
      // eslint-disable-next-line no-console
      console.info(
        `[changelog] 已渲染 ${result.versions} 个版本（来源：${result.source}${result.path ? ' · ' + result.path : ''}）`
      );
    }
    // 暴露给自测脚本（如 CDP 探针）读取，正常使用无感
    window.__CHANGELOG_BOOT__ = result;
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[changelog] 初始化异常，页面保留静态内容：', err);
    window.__CHANGELOG_BOOT__ = { ok: false, reason: 'exception', error: String(err && err.message) };
  });
