const homeTranslations = {
  "LimitRSS · 用 AI 收敛信息噪音的跨端 RSS 阅读器": "LimitRSS · A cross-platform RSS reader with AI",
  "Intel 芯片": "Intel processor",
  "选择芯片": "Choose processor",
  "可下载": "Available",
  "特性": "Features",
  "平台": "Platforms",
  "下载": "Download",
  "轻松订阅您感兴趣的": "Follow what interests you",
  "RSS源": "RSS feeds",
  "LimitRSS 是一款简洁高效的 RSS 阅读器，帮助你集中订阅、整理和阅读来自不同网站的内容。它支持 RSS、Atom 与 RSSHub 订阅源，可按分类管理文章，并提供未读、星标、稍后阅读、特别关注和多设备同步等功能。内置 AI 总结、AI 翻译、智能分类及 AI 日报，帮助你快速掌握重点信息，在减少信息噪音的同时，打造更专注、更个性化的阅读体验。": "LimitRSS brings the content you love into one focused reader. Follow RSS, Atom and RSSHub feeds, organize them into categories, and keep track with stars, read later, update alerts and sync across devices. AI summaries, translation, smart categories and daily digests help you understand more with less noise.",
  "下载 LimitRSS": "Download LimitRSS",
  "更新日志": "Changelog",
  "支持开发者": "Support the developer",
  "核心能力": "Made for reading",
  "从发现好内容，到读懂每一篇": "Discover more. Understand every story.",
  "集中订阅喜欢的内容，用 AI 辅助理解，让整理与回顾更轻松。": "Follow what you love, understand it with AI, and keep it organized.",
  "集中订阅，更新不错过": "All your feeds, always up to date",
  "把博客、资讯和感兴趣的网站集中到一处，支持 RSS、Atom 和 RSSHub。自动获取新文章，为特别关注的订阅源开启更新提醒。": "Bring blogs, news and favorite websites together with RSS, Atom and RSSHub. Get new articles automatically and enable alerts for your favorite feeds.",
  "AI 总结与翻译，读懂更轻松": "Understand more with AI",
  "长文章先看总结，外文内容一键翻译。连接你选择的 AI 服务，按自己的阅读习惯调整总结与翻译方式。": "Start with a summary of a long article or translate it in one click. Connect your preferred AI service and customize how you summarize and translate.",
  "AI 日报，回顾每日重点": "Your day in an AI digest",
  "将订阅中的文章汇成一份 AI 日报，集中梳理重点内容。忙碌时快速浏览，也能找到值得继续深入阅读的文章。": "Turn articles from your feeds into a daily digest. Catch up on the highlights and find stories worth a closer read.",
  "收藏与整理，留住值得读的内容": "Keep the stories that matter",
  "用分类整理订阅源，用星标收藏好文章，把来不及读的内容加入稍后阅读。还可以搜索标题、作者和正文，找回看过的内容。": "Organize feeds into categories, star great articles and save others for later. Search titles, authors and full text to find them again.",
  "多端阅读，进度随你同步": "Pick up where you left off",
  "在电脑和手机上阅读，通过自己的 WebDAV 服务同步订阅源、阅读状态与收藏。换一台设备，也能接着整理和阅读。": "Read on your computer and phone. Sync feeds, reading progress and favorites through your own WebDAV service, then carry on from another device.",
  "LimitRSS Plaza，发现与分享好订阅": "LimitRSS Plaza: discover and share",
  "浏览社区分享的订阅源，一键导入 LimitRSS；也可以分享自己的收藏。广场定期检测订阅源可用性，让发现好内容更省心。": "Discover community feeds and import them into LimitRSS in one click, or share your favorites. Regular availability checks help you find reliable content.",
  "多端覆盖": "Across your devices",
  "在哪个平台，LimitRSS 就在那里": "Your platforms. Your LimitRSS.",
  "桌前专注阅读，出门随手浏览。在你熟悉的设备上，继续发现好内容。": "Focus at your desk or catch up on the go. Keep discovering on the devices you know.",
  "选择你的平台": "Choose your platform",
  "Apple 芯片": "Apple silicon",
  "下载 →": "Download →",
  "敬请期待": "Coming soon",
  "获取自签包 →": "Get IPA to sign →",
  "申请内测": "Join the beta",
  "邀请码": "Invitation code",
  "把你的信息流重新拿回来": "Take back your reading",
  "订阅、阅读、用 AI 收敛噪音。本地优先，跨端一致。": "Follow, read and cut through the noise with AI. Local first, across your devices.",
  "查看更新日志": "View changelog",
  "动态展示订阅分类": "Feed categories",
  "支持的平台": "Supported platforms",
  "六种设备上的 LimitRSS 界面展示": "LimitRSS on six devices",
  "社交媒体": "Social media",
  "新媒体": "Media",
  "传统媒体": "News",
  "论坛": "Forums",
  "博客": "Blogs",
  "编程": "Code",
  "设计": "Design",
  "直播": "Live streams",
  "音视频": "Audio & video",
  "图片": "Photos",
  "二次元": "Anime",
  "程序更新": "App updates",
  "大学通知": "Campus",
  "预报预警": "Weather",
  "出行旅游": "Travel",
  "购物": "Shopping",
  "游戏": "Games",
  "阅读": "Books",
  "政务消息": "Public updates",
  "学习": "Learning",
  "科学期刊": "Research",
  "金融": "Finance",
  "体育": "Sports"
};
(() => {
 let language = 'zh';
 try { language = localStorage.getItem('limitrss-language') || localStorage.getItem('plaza-language') || (navigator.language.startsWith('zh') ? 'zh' : 'en'); } catch {}
 const originals = new WeakMap();
 const reverse = Object.fromEntries(Object.entries(homeTranslations).map(([zh,en])=>[en,zh]));
 function translate() {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
   const node = walker.currentNode;
   if (node.parentElement?.closest('script,style,svg,.hero h1')) continue;
   const text = node.textContent.trim();
   const original = homeTranslations[text] ? text : reverse[text];
   if (!original) continue;
   originals.set(node, original);
   const next = language === 'en' ? homeTranslations[original] : original;
   if (text !== next) node.textContent = node.textContent.replace(text, next);
  }
  document.querySelectorAll('[aria-label]').forEach(node => {
   const label=node.getAttribute('aria-label');const zh=homeTranslations[label]?label:reverse[label];
   if(zh)node.setAttribute('aria-label',language==='en'?homeTranslations[zh]:zh);
  });
  window.updateNavLabels?.(language);
 }
 const observer = new MutationObserver(() => { observer.disconnect();translate();observe(); });
 function observe() { observer.observe(document.body,{childList:true,subtree:true,characterData:true}); }
 document.addEventListener('limitrss-language-change',event=>{
  language=event.detail;
  observer.disconnect();translate();observe();
 });
 translate();observe();
})();
