/* ===========================================================
 * LimitRSS 官网 · 交互
 * - 主题切换（持久化）
 * - 平滑滚动到锚点（带顶栏偏移）
 * - 自动检测用户 OS 并高亮对应下载卡片
 * - 下载卡片点击埋点（控制台日志，可对接 GA / Plausible）
 * - Hero 标题打字机（科技 / 游戏 / 新闻 … 循环）
 * =========================================================== */

(function () {
  "use strict";

  const html = document.documentElement;
  const THEME_KEY = "limitrss-theme";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 主题 ----------
  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredTheme(value) {
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch (e) {
      /* ignore */
    }
  }

  function applyTheme(value) {
    html.setAttribute("data-theme", value);
  }

  // 初始化：优先用本地存储；否则跟随系统
  const stored = getStoredTheme();
  if (stored === "light" || stored === "dark") {
    applyTheme(stored);
  } else {
    applyTheme("auto");
  }

  // 监听系统主题变化（仅在 auto 模式下生效）
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
    if (html.getAttribute("data-theme") === "auto") {
      // CSS 已经通过 media query 处理；这里无需显式操作
    }
  });

  // ---------- 打字机（Hero 标题动态词 · 每词独立色） ----------
  const typewriterEl = document.getElementById("typewriter");
  if (typewriterEl) {
    const wordsAttr = typewriterEl.getAttribute("data-words") || "";
    const chineseWords = wordsAttr.split(",").map(s => s.trim()).filter(Boolean);
    const englishWords = ['Social media','Media','News','Forums','Blogs','Code','Design','Live streams','Audio & video','Photos','Anime','App updates','Campus news','Weather','Travel','Shopping','Games','Books','Public affairs','Learning','Research','Finance','Sports'];
    let titleLanguage = 'zh';
    try { titleLanguage = localStorage.getItem('limitrss-language') || localStorage.getItem('plaza-language') || (navigator.language.startsWith('zh') ? 'zh' : 'en'); } catch {}
    let words = titleLanguage === 'en' ? englishWords : chineseWords;
    const intro = document.getElementById('hero-title-intro');
    const suffix = document.getElementById('hero-title-suffix');
    const heading = typewriterEl.closest('h1');
    function fitTitle() {
      const width = heading.clientWidth;
      if (!width) return;
      const style = getComputedStyle(heading);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const maxSize = window.innerWidth <= 640 ? 44 : 72;
      context.font = `${style.fontWeight} ${maxSize}px ${style.fontFamily}`;
      const samples = [intro.textContent, ...words.map(word => word + suffix.textContent)];
      const longest = Math.max(...samples.map(text => context.measureText(text).width - .035 * maxSize * Math.max(0,text.length-1)));
      heading.style.fontSize = `${Math.min(maxSize, maxSize * (width - 10) / longest)}px`;
    }
    function setTitleLanguage(value) {
      titleLanguage = value === 'en' ? 'en' : 'zh';
      words = titleLanguage === 'en' ? englishWords : chineseWords;
      intro.textContent = titleLanguage === 'en' ? 'Follow what you love.' : '轻松订阅您感兴趣的';
      suffix.textContent = titleLanguage === 'en' ? ', all in one feed.' : ' RSS源';
      typewriterEl.setAttribute('aria-label', titleLanguage === 'en' ? 'Feed categories' : '动态展示订阅分类');
      fitTitle();
    }
    setTitleLanguage(titleLanguage);
    new ResizeObserver(fitTitle).observe(heading);
    window.addEventListener("resize", fitTitle);
    document.fonts.ready.then(fitTitle);
    // 每个词对应的颜色（与 data-words 顺序一一对应；超出时循环取）
    const WORD_COLORS = [
      "#0ea5e9", // 社交媒体 - sky 蓝
      "#ec4899", // 新媒体 - pink 粉
      "#64748b", // 传统媒体 - slate 灰蓝
      "#14b8a6", // 论坛 - teal 青绿
      "#f97316", // 博客 - orange 橙
      "#6366f1", // 编程 - indigo 靛蓝
      "#d946ef", // 设计 - fuchsia 洋红
      "#ef4444", // 直播 - red 红
      "#3b82f6", // 音视频 - blue 蓝
      "#eab308", // 图片 - yellow 黄
      "#a855f7", // 二次元 - purple 紫
      "#06b6d4", // 程序更新 - cyan 青
      "#10b981", // 大学通知 - emerald 翠绿
      "#ea580c", // 预报预警 - deep orange 深橙
      "#22c55e", // 出行旅游 - green 绿
      "#fb7185", // 购物 - rose 浅玫红
      "#8b5cf6", // 游戏 - violet 紫罗兰
      "#b45309", // 阅读 - brown 棕
      "#2563eb", // 政务消息 - royal blue 皇家蓝
      "#059669", // 学习 - dark emerald 深翠
      "#0d9488", // 科学期刊 - dark teal 深青
      "#ca8a04", // 金融 - gold 金
      "#16a34a", // 体育 - green dark 深绿
    ];
    function colorFor(idx) {
      return WORD_COLORS[idx % WORD_COLORS.length];
    }
    function applyColor(idx) {
      typewriterEl.style.setProperty("--tw-color", colorFor(idx));
    }
    if (words.length > 0) {
      // 默认先放第一个词，避免首屏空白
      typewriterEl.textContent = words[0];
      applyColor(0);


      let wordIdx = 0;
      let charIdx = words[0].length;
      let phase = "hold"; // hold | type | delete
      let timer = null;

      function tick() {
        const word = words[wordIdx];
        if (phase === "type") {
          charIdx++;
          typewriterEl.textContent = word.substring(0, charIdx);
          if (charIdx >= word.length) {
            phase = "hold";
            timer = setTimeout(tick, 1500);
            return;
          }
          timer = setTimeout(tick, 90);
        } else if (phase === "hold") {
          phase = "delete";
          timer = setTimeout(tick, 50);
        } else { // delete
          charIdx--;
          typewriterEl.textContent = word.substring(0, charIdx);
          if (charIdx <= 0) {
            wordIdx = (wordIdx + 1) % words.length;
            // 切换到新词时同步切换颜色
            applyColor(wordIdx);
            phase = "type";
            timer = setTimeout(tick, 250);
            return;
          }
          timer = setTimeout(tick, 45);
        }
      }

      // 启动：先 hold 一段时间让用户看清首词，再开始切换
      if (!reducedMotion) timer = setTimeout(tick, 1800);
      document.addEventListener('limitrss-language-change', event => {
        clearTimeout(timer);timer = null;
        setTitleLanguage(event.detail);
        wordIdx = 0;charIdx = words[0].length;phase = 'hold';
        typewriterEl.textContent = words[0];applyColor(0);
        if (!reducedMotion && !document.hidden) timer = setTimeout(tick, 1800);
      });

      // 切到后台标签时暂停，节省资源
      document.addEventListener("visibilitychange", function () {
        if (document.hidden && timer) {
          clearTimeout(timer);
          timer = null;
        } else if (!document.hidden && !timer && !reducedMotion) {
          tick();
        }
      });
    }
  }

  // ---------- 平滑滚动 ----------
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;

      e.preventDefault();
      const navH = document.querySelector(".nav")?.offsetHeight || 0;
      const top = target.getBoundingClientRect().top + window.pageYOffset - navH - 8;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });

      // 更新 hash
      if (history.replaceState) {
        history.replaceState(null, "", id);
      }
    });
  });

  // ---------- 检测 OS 并高亮下载卡 ----------
  function detectOS() {
    // 必须先转小写：真实 UA 里是 iPhone / iPad / Android / HarmonyOS（首字母大写），
    // 而下面用的是大小写敏感的正则。之前没转，导致安卓与鸿蒙设备匹配失败、
    // 落到 platform 分支被当成 Linux（Android UA 里含 "Linux"）。
    const ua = (navigator.userAgent || "").toLowerCase();
    const platform = (navigator.platform || "").toLowerCase();
    // iPadOS 13+ 默认以桌面 UA 上报，platform 为 MacIntel，靠触点数区分
    const iPadDesktop = platform === "macintel" && navigator.maxTouchPoints > 1;
    if (/iphone|ipad|ipod/.test(ua)) return "ios";
    if (/harmony|openharmony/.test(ua)) return "harmony";
    if (/android/.test(ua)) return "android";
    if (iPadDesktop) return "ios";
    if (platform.indexOf("mac") === 0) return "mac";
    if (platform.indexOf("win") === 0) return "windows";
    if (platform.indexOf("linux") === 0) return "linux";
    return "unknown";
  }

  const os = detectOS();
  const osLabels = {
    mac: "macOS",
    windows: "Windows",
    ios: "iOS",
    android: "Android",
    harmony: "HarmonyOS",
    linux: "Linux",
    unknown: "",
  };

  // 下载区里实际存在的平台卡片。检测结果必须命中其中之一才高亮/展示推荐位，
  // 否则（例如 Linux 访客）会出现"已为你高亮对应下载"但页面上并没有该平台的矛盾提示。
  const downloadCards = Array.from(
    document.querySelectorAll(".download-card[data-os]")
  );
  const matchedCard = downloadCards.find(function (c) {
    return c.getAttribute("data-os") === os;
  });

  // ---------- 区分 Apple Silicon / Intel（仅 macOS 需要）----------
  // UA 与 platform 都拿不到芯片信息：Apple Silicon 机器的 UA 也写着
  // "Intel Mac OS X 10_15_7"（冻结的 UA），platform 一律是 "MacIntel"。
  // 唯一可靠的浏览器手段是 WebGL 的 UNMASKED_RENDERER_WEBGL，
  // 实测 Apple M5 Pro 会返回：
  //   "ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)"
  // 返回 'apple' | 'intel' | 'unknown'。
  function detectMacChip() {
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) return "unknown";
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = String(
        dbg
          ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER)
      );
      // 查完立即释放，避免长期占着一个 WebGL 上下文
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      if (/apple\s*m\d|apple\s*gpu/i.test(renderer)) return "apple";
      if (/intel|amd|radeon|nvidia/i.test(renderer)) return "intel";
      return "unknown";
    } catch (e) {
      return "unknown";
    }
  }

  // macOS 芯片选择器：目前只提供 Apple 芯片包，Intel 版本「敬请期待」。
  // 检测结果只用于「预选」——最终由用户自己选，避免指纹识别被屏蔽时误判。
  const CHIP_LABELS = { apple: "Apple 芯片", intel: "Intel 芯片" };
  const CHIP_DOWNLOADABLE = { apple: true, intel: false };
  // 只在 macOS 上探测芯片（其它平台探测没有意义，还会白白建一个 WebGL 上下文）
  const macChip = os === "mac" ? detectMacChip() : "unknown";
  // 未识别出芯片（隐私设置屏蔽了 GPU 信息）时不预设，让用户明确选一次
  let selectedChip = macChip === "apple" || macChip === "intel" ? macChip : null;

  function renderChipPicker() {
    const picker = document.querySelector(".chip-picker");
    if (!picker) return;
    const options = picker.querySelector(".chip-options");
    const picked = picker.querySelector("[data-chip-picked]");
    options.textContent = "";
    Object.keys(CHIP_LABELS).forEach(function (chip) {
      const downloadable = CHIP_DOWNLOADABLE[chip];
      const el = document.createElement(downloadable ? "a" : "span");
      el.className = "chip-option";
      if (chip === selectedChip) el.classList.add("is-selected");
      if (!downloadable) el.classList.add("is-unavailable");
      if (downloadable) {
        el.href = "#";
        el.setAttribute("data-chip", chip);
      }
      const name = document.createElement("span");
      name.className = "chip-option-name";
      name.textContent = CHIP_LABELS[chip];
      el.appendChild(name);
      const state = document.createElement("span");
      state.className = "chip-state";
      state.textContent = downloadable ? "可下载" : "敬请期待";
      el.appendChild(state);
      options.appendChild(el);
    });
    if (picked) picked.textContent = selectedChip ? CHIP_LABELS[selectedChip] : "选择芯片";
  }

  // 推荐位：检测到的平台被移到这一行单独放大展示，其余平台留在下方网格。
  // 未识别到平台时推荐位为空，由 CSS :empty 隐藏。
  const featuredSlot = document.querySelector("[data-download-featured]");

  // 提示语放在推荐位上方（而不是网格上方），与推荐的卡片成一组。
  // 只有确实匹配到卡片时才显示，避免出现指向不存在平台的提示。
  if (featuredSlot && matchedCard) {
    const wrap = document.createElement("div");
    wrap.className = "os-banner-wrap";
    const banner = document.createElement("div");
    banner.className = "os-banner";
    let note;
    if (macChip === "intel") {
      banner.innerHTML =
        "检测到你的设备是 <strong>" +
        osLabels[os] +
        "</strong>，当前只提供 Apple 芯片版本。";
      note = "Apple 芯片（M 系列）版本已可下载，Intel 版本敬请期待。";
    } else {
      banner.innerHTML =
        '检测到你的设备是 <strong>' +
        osLabels[os] +
        "</strong>，已为你高亮对应下载。";
    }
    wrap.appendChild(banner);
    // 补充说明放进 banner 容器而不是推荐位：推荐位高度紧凑，
    // 直接塞进去会溢出到卡片上、被卡片边框划过。
    if (note) {
      const p = document.createElement("p");
      p.className = "download-note-featured";
      p.textContent = note;
      wrap.appendChild(p);
    }
    featuredSlot.parentNode.insertBefore(wrap, featuredSlot);
  }

  // 把检测到的卡片移入推荐位并高亮（matchedCard 已在上方确定命中）
  if (matchedCard) {
    matchedCard.classList.add("highlight");
    if (featuredSlot) featuredSlot.appendChild(matchedCard);
  }

  // macOS 的芯片选择器只在它位于推荐位时才有意义。
  // 若访客不是 macOS（例如 Windows），macOS 卡片会留在下方网格里：
  // 那时它没有 .download-featured 的 overflow:visible（弹层会被裁掉），
  // 芯片探测也没有意义（会停在「选择芯片」这种空状态）。
  // 因此把这种情况下的选择器换回普通的「下载 →」，与其它平台卡片一致。
  const macCardEl = document.querySelector('.download-card[data-os="mac"]');
  const macIsFeatured = !!(macCardEl && featuredSlot && macCardEl.parentElement === featuredSlot);
  if (macCardEl && !macIsFeatured) {
    const picker = macCardEl.querySelector(".chip-picker");
    if (picker) {
      picker.closest(".download-cta--split").remove();
      const plainCta = document.createElement("span");
      plainCta.className = "download-cta download-cta-bar";
      plainCta.textContent = "下载 →";
      macCardEl.appendChild(plainCta);
    }
  }

  // 渲染芯片选择器（选项由检测结果预选）
  renderChipPicker();
  const chipPicker = document.querySelector(".chip-picker");

  // 选中某个芯片：写回状态、重渲染选项、收起下拉
  function chooseChip(chip) {
    selectedChip = chip;
    renderChipPicker();
    if (chipPicker) chipPicker.open = false;
  }

  document.addEventListener("click", function (e) {
    const opt = e.target.closest ? e.target.closest(".chip-option[data-chip]") : null;
    if (opt) {
      e.preventDefault();
      chooseChip(opt.getAttribute("data-chip"));
      return;
    }
    // 下载按钮与芯片选择：先接住，避免 href="#" 把页面带回顶部
    const trigger = e.target.closest
      ? e.target.closest("[data-download-trigger], .chip-picker .download-cta-link")
      : null;
    if (trigger) {
      e.preventDefault();
      return;
    }
    // 点在下拉外面就收起
    if (chipPicker && chipPicker.open && !chipPicker.contains(e.target)) {
      chipPicker.open = false;
    }
  });

  // ---------- 下载地址 ----------
  // 地址由「版本号 + 文件名约定」自动拼出，不需要手工维护：
  //   版本号来自 data/changelog.json（由 npm run sync 从 notes/changelog.md 生成）
  //   文件放在 GitHub Release 里，命名遵循 LimitRSS-<版本>-<平台>.<扩展名>
  // 所以发新版时只要：改 changelog 的版本号 → npm run sync → 传包到对应 Release，
  // 网页上的下载地址会自动跟着版本号走。
  // 手工覆盖（留空表示走自动拼接）。万一某个版本的命名不一致，填这里即可。
  const DOWNLOAD_OVERRIDES = {
    mac: "",
    ios: "",
    android: "",
  };

  // ---------- 安装包清单（构建时生成，运行时只读本地文件）----------
  // 为什么不在前端探测 release 资产是否存在：
  //   GitHub 的下载地址会 302 到 objects.githubusercontent.com，
  //   该链路没有 CORS 头，fetch 一律 `TypeError: Failed to fetch`（实测）。
  //   所以由 scripts/gen-download-manifest.mjs 在构建时查 GitHub API，
  //   把「哪些版本、哪些平台真的有包」落成 data/downloads.json，前端直接读。
  // 【重要】清单里的版本可能晚于更新日志的版本（例如日志先写、
  // 安装包后传）。必须用清单里「最新的有包版本」，而不是 changelog 的版本，
  // 否则会拼出 404 死链。
  const REPO_SLUG = "Demisse233/LimitRSS_Client";

  function manifestUrl(repo, version, fileName) {
    return (
      "https://github.com/" + repo + "/releases/download/v" + version + "/" + fileName
    );
  }

  // 从清单里解析出「某平台最新的、确实有包的版本」。
  // 抽成独立函数是为了让网页和构建脚本（scripts/lib/download.mjs）用同一套规则，
  // 两边算出的地址必须完全一致，否则接口给的地址和网页上的会对不上。
  // 返回 { version, fileName, url }，没有任何版本有包时返回 null。
  function resolveDownloadEntry(versions, key, repo) {
    if (!versions || !key) return null;
    for (const ver of Object.keys(versions)) {
      const files = versions[ver] || {};
      if (files[key]) {
        return {
          version: ver,
          fileName: files[key],
          url: manifestUrl(repo || REPO_SLUG, ver, files[key]),
        };
      }
    }
    return null;
  }

  fetch("./data/downloads.json")
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (manifest) {
      if (!manifest || !manifest.versions) return;
      const repo = manifest.repo || REPO_SLUG;
      const versions = manifest.versions; // 已按版本从新到旧排序

      document.querySelectorAll("[data-download-for]").forEach(function (el) {
        const key = el.getAttribute("data-download-for");
        if (!key) return;
        if (DOWNLOAD_OVERRIDES[key]) {
          el.setAttribute("href", DOWNLOAD_OVERRIDES[key]);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
          el.removeAttribute("aria-disabled");
          return;
        }
        // 找「最新的、且该平台确实有包」的版本
        const entry = resolveDownloadEntry(versions, key, repo);
        if (entry) {
          el.setAttribute("href", entry.url);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
          el.removeAttribute("aria-disabled");
        } else {
          // 任何版本都没有该平台的包：保持占位，绝不产生死链
          el.removeAttribute("href");
          el.setAttribute("aria-disabled", "true");
        }
      });
    })
    .catch(function () {
      /* 读不到清单就维持占位状态，不影响页面其它功能 */
    });

  // ---------- 下载点击埋点 ----------
  document.querySelectorAll(".download-card").forEach(function (card) {
    card.addEventListener("click", function (e) {
      // 卡片内部的控件（芯片选择器、下载链接）有自己的语义，
      // 不应被当成"点了整张卡片"，否则一次点击会重复上报。
      if (e.target.closest && e.target.closest(".chip-picker, .download-cta--split")) return;
      const osKey = card.getAttribute("data-os") || "source";
      // eslint-disable-next-line no-console
      console.info("[LimitRSS] download click:", osKey);
    });
  });

  // 尚无地址的下载按钮（版本号未读到、或该平台本版本没有包）：
  // 阻止默认跳转（避免 href="#" 回顶），只做提示
  document.addEventListener("click", function (e) {
    const trigger = e.target.closest ? e.target.closest("[data-download-for]") : null;
    if (!trigger) return;
    if (trigger.getAttribute("href")) return;   // 有地址：交给浏览器正常跳转
    e.preventDefault();
    // eslint-disable-next-line no-console
    console.info(
      "[LimitRSS] 该平台当前版本暂无安装包:",
      trigger.getAttribute("data-download-for")
    );
  });

  // ---------- Hero · 光波扫描点阵动画 ----------
  // 一次一道光波从 logo 背后缓慢扩散（粗渐变环，外缘深内缘浅），
  // 发射瞬间 logo 放大再回缩；波前扫到目标点时该点"长出"订阅源图标并推开
  // 附近挡路的点；图标飞向 logo 时逐帧挤开路径上的点，到达后被 logo 吸收。
  const narrowHero = window.matchMedia("(max-width: 960px)");
  const vizEl = document.getElementById("feed-viz");
  const dotFieldEl = document.getElementById("dot-field");
  const waveEl = document.getElementById("wave-ring");
  const icoLayerEl = document.getElementById("ico-layer");
  const orbitLogo = document.getElementById("orbit-logo");

  if (vizEl && dotFieldEl && waveEl && icoLayerEl && orbitLogo && !reducedMotion) {
    // ICONS 数组：每项 [图片路径 OR emoji, 文字]
// type='img' 渲染真实订阅源 logo（圆角矩形，无文字）
// type='chip' 渲染胶囊（emoji + 文字 + 边框），数量比真实源少
    const ICONS = [
      // 真实订阅源（用户提供的高清 JPG，已转 64×64 透明 PNG）
      { type: "img", src: "./assets/feeds/feed-github.png", label: "GitHub" },
      { type: "img", src: "./assets/feeds/feed-bilibili.png", label: "B站" },
      { type: "img", src: "./assets/feeds/feed-zhihu.png", label: "知乎" },
      { type: "img", src: "./assets/feeds/feed-juejin.png", label: "掘金" },
      { type: "img", src: "./assets/feeds/feed-csdn.png", label: "CSDN" },
      { type: "img", src: "./assets/feeds/feed-oschina.png", label: "OSChina" },
      { type: "img", src: "./assets/feeds/feed-sspai.png", label: "少数派" },
      { type: "img", src: "./assets/feeds/feed-ithome.png", label: "IT之家" },
      { type: "img", src: "./assets/feeds/feed-huxiu.png", label: "虎嗅" },
      { type: "img", src: "./assets/feeds/feed-pengpai.png", label: "澎湃" },
      { type: "img", src: "./assets/feeds/feed-yangshi.png", label: "央视" },
      { type: "img", src: "./assets/feeds/feed-renminribao.png", label: "人民日报" },
      { type: "img", src: "./assets/feeds/feed-douban.png", label: "豆瓣" },
      { type: "img", src: "./assets/feeds/feed-36kr.png", label: "36氪" },
      { type: "img", src: "./assets/feeds/feed-bbc.png", label: "BBC" },
      { type: "img", src: "./assets/feeds/feed-cnn.png", label: "CNN" },
      { type: "img", src: "./assets/feeds/feed-chinadaily.png", label: "China Daily" },
      { type: "img", src: "./assets/feeds/feed-economist.png", label: "经济学人" },
      { type: "img", src: "./assets/feeds/feed-nasa.png", label: "NASA" },
      { type: "img", src: "./assets/feeds/feed-x.png", label: "X" },
      { type: "img", src: "./assets/feeds/feed-youtube.png", label: "YouTube" },
      { type: "img", src: "./assets/feeds/feed-hacki.png", label: "Hacker News" },
      { type: "img", src: "./assets/feeds/feed-producthunt.png", label: "Product Hunt" },
      { type: "img", src: "./assets/feeds/feed-telegram.png", label: "Telegram" },
      { type: "img", src: "./assets/feeds/feed-weibo.png", label: "微博" },
      { type: "img", src: "./assets/feeds/feed-rednote.png", label: "小红书" },
      { type: "img", src: "./assets/feeds/feed-pixiv.png", label: "pixiv" },
      { type: "img", src: "./assets/feeds/feed-acfun.png", label: "AcFun" },
      { type: "img", src: "./assets/feeds/feed-bahamut.png", label: "巴哈姆特" },
      { type: "img", src: "./assets/feeds/feed-coolapk.png", label: "酷安" },
      { type: "img", src: "./assets/feeds/feed-nga.png", label: "NGA" },
      { type: "img", src: "./assets/feeds/feed-playstation.png", label: "PlayStation" },
      { type: "img", src: "./assets/feeds/feed-steam.png", label: "Steam" },
      { type: "img", src: "./assets/feeds/feed-obsidian.png", label: "Obsidian" },
      { type: "img", src: "./assets/feeds/feed-miyoushe.png", label: "米游社" },
      { type: "img", src: "./assets/feeds/feed-senkongdao.png", label: "森空岛" },
      { type: "img", src: "./assets/feeds/feed-guokr.png", label: "果壳" },
      { type: "img", src: "./assets/feeds/feed-ifengapp.png", label: "爱范儿" },
      // 胶囊（emoji + 文字）5 个 —— 数量比真实源少
      { type: "chip", emoji: "📚", text: "学术" },
      { type: "chip", emoji: "🎧", text: "播客" },
      { type: "chip", emoji: "🛒", text: "购物" },
      { type: "chip", emoji: "✈️", text: "旅行" },
      { type: "chip", emoji: "🔔", text: "公告" }
    ];

    const WAVE_DUR = 4600;        // 光波扩散时长（缓慢）
    const WAVE_REST = 1500;       // 两道波之间的间歇
    const HOLD = 1050;            // 图标亮起后停留
    const FLY_DUR = 820;          // 飞向 logo 的时长
    const BASE_R = 1600;          // 波环基准半径（scale=1 时的像素半径，需 ≥ 最大 hero 对角线）

    let dots = [];                // {el, bx, by, ox, oy, dirty, taken, spawnOk}
    let icons = [];               // 飞行中的图标对象
    let pushers = [];             // {x, y, str, rad, life}
    let wave = null;              // {start, maxR, target, targetDist, spawned}
    let center = { x: 0, y: 0 };
    let rafId = 0;
    let running = false;
    let vizVisible = true;
    let nextTimer = null;

    function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

    // 解析 --cx/--cy（如 "68%"）为像素（变量定义在 .hero 上，会继承到 feed-viz）
    function resolveCenter() {
      const w = vizEl.clientWidth;
      const h = vizEl.clientHeight;
      const cs = getComputedStyle(vizEl);
      function pct(v, total) {
        const s = (v || "").trim();
        if (s.length && s.indexOf("%") > 0) return (parseFloat(s) / 100) * total;
        return total * 0.5;
      }
      center.x = pct(cs.getPropertyValue("--cx"), w);
      center.y = pct(cs.getPropertyValue("--cy"), h);
    }

    // 生成点阵：网格 + 抖动，铺满整个 hero；
    // 跳过 logo 附近与文字区（hero-text 整体外扩 pad 像素，一点都不能撞花纹）
    function buildDots() {
      dotFieldEl.innerHTML = "";
      dots = [];
      const w = vizEl.clientWidth;
      const h = vizEl.clientHeight;
      resolveCenter();

      // 文字区排除框（相对 feed-viz）：
      // 元素盒子不可靠（h1 有 max-width、cta-row 是块级 flex 会撑满整行），
      // 用 Range 取每个子元素"文字内容"的实际矩形（逐行、紧贴文字）取并集
      let textRect = null;
      const textEl = document.querySelector(".hero-text");
      if (textEl) {
        const vr = vizEl.getBoundingClientRect();
        const pad = 30;
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        function unionRect(r) {
          if (!r || (r.width === 0 && r.height === 0)) return;
          x1 = Math.min(x1, r.left);
          y1 = Math.min(y1, r.top);
          x2 = Math.max(x2, r.right);
          y2 = Math.max(y2, r.bottom);
        }
        Array.prototype.forEach.call(textEl.children, function (child) {
          try {
            const rng = document.createRange();
            rng.selectNodeContents(child);
            const rects = rng.getClientRects();
            if (rects.length) {
              for (let k = 0; k < rects.length; k++) unionRect(rects[k]);
            } else {
              unionRect(child.getBoundingClientRect());
            }
          } catch (err) {
            unionRect(child.getBoundingClientRect());
          }
        });
        if (x1 < x2 && y1 < y2) {
          textRect = {
            x1: x1 - vr.left - pad,
            y1: y1 - vr.top - pad,
            x2: x2 - vr.left + pad,
            y2: y2 - vr.top + pad
          };
        }
      }

      const gap = w <= 640 ? 42 : 48;
      for (let gy = gap * 0.7; gy < h; gy += gap) {
        for (let gx = gap * 0.7; gx < w; gx += gap) {
          const x = gx + (Math.random() - 0.5) * gap * 0.5;
          const y = gy + (Math.random() - 0.5) * gap * 0.5;
          if (Math.hypot(x - center.x, y - center.y) < 130) continue; // logo 周围留空
          if (textRect && x > textRect.x1 && x < textRect.x2 && y > textRect.y1 && y < textRect.y2) continue;
          const size = 2.5 + Math.random() * 2;
          const el = document.createElement("span");
          el.className = "dot";
          el.style.left = x + "px";
          el.style.top = y + "px";
          el.style.width = size + "px";
          el.style.height = size + "px";
          el.style.margin = (-size / 2) + "px 0 0 " + (-size / 2) + "px";
          el.style.opacity = (0.25 + Math.random() * 0.3).toFixed(2);
          dotFieldEl.appendChild(el);
          // 可生成图标的区域：避开文字区（已由 textRect 排除），
          // 桌面端整个右侧 2/3 都可以；竖屏下半部分
          let spawnOk;
          if (w <= 640) spawnOk = y > h * 0.5 && y < h * 0.94;
          else if (w <= 960) spawnOk = y > h * 0.42 && y < h * 0.92;
          else spawnOk = x > w * 0.45;
          dots.push({ el: el, bx: x, by: y, ox: 0, oy: 0, dirty: false, taken: false, spawnOk: spawnOk });
        }
      }
    }

    function computeMaxR() {
      const w = vizEl.clientWidth;
      const h = vizEl.clientHeight;
      // 中心到 hero 四角的最大距离 —— 光波要覆盖整个首页、扫出边缘
      const farX = Math.max(center.x, w - center.x);
      const farY = Math.max(center.y, h - center.y);
      return Math.hypot(farX, farY) * 1.05; // +5% 确保完全扫出边框
    }

    // ---------- 波 ----------
    function startWave() {
      const maxR = computeMaxR();
      const w = vizEl.clientWidth;
      const h = vizEl.clientHeight;
      // 图标宽 44px，留 margin 防止溢出屏幕
      const m = 35;
      // 选 2~5 个目标点：在可生成区域内、不在屏幕边缘、未被占用
      // 距离范围放宽到 0.15~0.95 maxR，让目标分布在整个区域而非窄环带
      const candidates = dots.filter(function (d) {
        if (d.taken || !d.spawnOk) return false;
        if (d.bx < m || d.bx > w - m || d.by < m || d.by > h - m) return false;
        const dist = Math.hypot(d.bx - center.x, d.by - center.y);
        return dist > maxR * 0.15 && dist < maxR * 0.95;
      });
      // 洗牌
      const shuffled = candidates.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
      }
      // 按候选数量自适应取目标数：
      // 候选少（窄屏/被占用多）→ 取少（最低 1 个）；候选多（宽屏）→ 取多（最高 6 个）
      const avail = shuffled.length;
      let targetCount;
      if (avail === 0) targetCount = 0;
      else if (avail <= 3) targetCount = 1 + Math.floor(Math.random() * avail);       // 1~avail
      else if (avail <= 8) targetCount = 2 + Math.floor(Math.random() * (avail - 1)); // 2~avail
      else targetCount = 3 + Math.floor(Math.random() * 4);                            // 3~6
      targetCount = Math.min(targetCount, shuffled.length);
      // 贪心选择目标：保证已选目标两两之间至少 minGap 距离（图标 44px），
      // 避免图标展开后互相遮挡；不够距离就宁可少选
      const minGap = 60;
      const targets = [];
      for (let i = 0; i < shuffled.length && targets.length < targetCount; i++) {
        const d = shuffled[i];
        let tooClose = false;
        for (let j = 0; j < targets.length; j++) {
          if (Math.hypot(d.bx - targets[j].d.bx, d.by - targets[j].d.by) < minGap) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
        targets.push({
          d: d,
          dist: Math.hypot(d.bx - center.x, d.by - center.y),
          spawned: false
        });
      }

      // 波前扫过点亮：按距离排序所有点，帧循环里推进指针逐个点亮
      const sweepList = dots
        .filter(function (d) { return !d.taken; })
        .map(function (d) {
          return { d: d, dist: Math.hypot(d.bx - center.x, d.by - center.y) };
        })
        .sort(function (a, b) { return a.dist - b.dist; });

      wave = {
        start: performance.now(),
        maxR: maxR,
        targets: targets,        // [{d, dist, spawned}]
        spawnSet: new Set(targets.map(function (t) { return t.d; })), // 快速查重
        sweepList: sweepList,
        sweepIdx: 0
      };

      // logo 放大再回缩
      orbitLogo.classList.add("is-pulsing");
      window.setTimeout(function () { orbitLogo.classList.remove("is-pulsing"); }, 950);
      ensureLoop();
    }

    function scheduleNext(delay) {
      if (nextTimer) window.clearTimeout(nextTimer);
      nextTimer = null;
      if (narrowHero.matches) return;
      nextTimer = window.setTimeout(function () {
        nextTimer = null;
        if (narrowHero.matches) return;
        if (vizVisible && !document.hidden) startWave();
        else scheduleNext(600); // 不可见时顺延，保证恢复后仍有下一道波
      }, delay);
    }

    // 已使用的图标索引（避免同一波内重复，全用完后清空重来）
    let usedIconIndices = [];
    function pickIcon() {
      if (usedIconIndices.length >= ICONS.length) usedIconIndices = [];
      let idx;
      do {
        idx = Math.floor(Math.random() * ICONS.length);
      } while (usedIconIndices.indexOf(idx) >= 0);
      usedIconIndices.push(idx);
      return ICONS[idx];
    }
    function spawnIcon(dot) {
      dot.taken = true;
      dot.el.classList.add("is-taken");
      // 出现瞬间推开附近挡路的点
      pushers.push({ x: dot.bx, y: dot.by, str: 30, rad: 105, life: 620 });

      const data = pickIcon();
      const el = document.createElement("span");
      el.className = "feed-ico";
      el.style.transform = "translate3d(" + dot.bx + "px," + dot.by + "px,0)";
      const anchor = document.createElement("span");
      anchor.className = "feed-ico-anchor";
      const inner = document.createElement("span");
      inner.className = "feed-ico-inner";

      if (data.type === "img") {
        // 真实订阅源：圆角矩形 logo，无文字
        el.classList.add("is-img");
        const img = document.createElement("img");
        img.src = data.src;
        img.alt = data.label;
        img.draggable = false;
        img.className = "feed-ico-img";
        inner.appendChild(img);
      } else {
        // 胶囊：emoji + 文字 + 边框
        el.classList.add("is-chip");
        const eSpan = document.createElement("span");
        eSpan.className = "feed-ico-emoji";
        eSpan.textContent = data.emoji;
        const tSpan = document.createElement("span");
        tSpan.className = "feed-ico-text";
        tSpan.textContent = data.text;
        inner.appendChild(eSpan);
        inner.appendChild(tSpan);
      }

      anchor.appendChild(inner);
      el.appendChild(anchor);
      icoLayerEl.appendChild(el);

      const ico = {
        el: el, inner: inner, dot: dot,
        sx: dot.bx, sy: dot.by,
        born: performance.now(),
        flyStart: 0,
        pusher: { x: dot.bx, y: dot.by, str: 15, rad: 62, life: 0, keep: true },
        done: false
      };
      icons.push(ico);
      pushers.push(ico.pusher);
      requestAnimationFrame(function () { el.classList.add("is-in"); });
    }

    function absorbIcon(ico) {
      ico.done = true;
      ico.el.classList.add("is-out");
      if (ico.pusher) { ico.pusher.keep = false; ico.pusher.life = 0; }
      // logo 吸收脉冲（不再生成一次性小波纹）
      orbitLogo.classList.add("is-absorbing");
      window.setTimeout(function () { orbitLogo.classList.remove("is-absorbing"); }, 560);
      // 图标清理 + 点淡回
      const dot = ico.dot;
      window.setTimeout(function () {
        if (ico.el.parentNode) ico.el.parentNode.removeChild(ico.el);
        icons = icons.filter(function (i) { return i !== ico; });
      }, 260);
      window.setTimeout(function () {
        if (dot) { dot.el.classList.remove("is-taken"); dot.taken = false; }
      }, 1400);
    }

    // ---------- 主循环 ----------
    function ensureLoop() {
      if (!narrowHero.matches && !running) {
        running = true;
        rafId = requestAnimationFrame(frame);
      }
    }

    let lastNow = 0;
    function frame(now) {
      if (narrowHero.matches) { running = false; lastNow = 0; return; }
      // 翻页期间暂停 hero 动画：342 个点的样式写入 + 3200px 模糊光波
      // 会和滚动抢占主线程，是翻页卡顿的主要来源之一。
      // 复用下面 visibilitychange 的"暂停 + 重排时间轴"模式，结束后自动恢复。
      if (document.documentElement.classList.contains("is-paging")) {
        if (!pagingAt) pagingAt = now;
        lastNow = 0;
        rafId = requestAnimationFrame(frame);
        return;
      }
      if (pagingAt) {
        const d = now - pagingAt;
        pagingAt = 0;
        if (wave) wave.start += d;
        icons.forEach(function (ico) {
          ico.born += d;
          if (ico.flyStart) ico.flyStart += d;
        });
      }
      if (!vizVisible || document.hidden) { running = false; return; }
      const dt = lastNow ? Math.min(now - lastNow, 50) : 16;
      lastNow = now;
      let active = false;

      // 1) 光波
      if (wave) {
        const t = (now - wave.start) / WAVE_DUR;
        if (t >= 1) {
          waveEl.style.opacity = "0";
          wave = null;
          scheduleNext(WAVE_REST);
        } else {
          active = true;
          const r = easeOutQuad(t) * wave.maxR;
          waveEl.style.transform = "scale(" + (r / BASE_R).toFixed(4) + ")";
          // 透明度曲线：起 0~7% 渐入，7~70% 满亮，70~100% 渐出（t→1 时 op→0 避免尾部残光）
          const op = t < 0.07 ? t / 0.07 : (t > 0.7 ? Math.max((1 - t) / 0.3, 0) : 1);
          waveEl.style.opacity = (op * 0.95).toFixed(3);
          // 波前扫过：未生成图标的目标点亮后熄灭；生成图标的目标跳过点亮
          while (wave.sweepIdx < wave.sweepList.length && wave.sweepList[wave.sweepIdx].dist <= r) {
            const d = wave.sweepList[wave.sweepIdx].d;
            if (!wave.spawnSet.has(d) && !d.taken) {
              d.el.classList.add("is-lit");
              window.setTimeout(function (el) {
                el.classList.remove("is-lit");
              }, 620 + Math.random() * 380, d.el);
            }
            wave.sweepIdx++;
          }
          // 生成图标：波前扫到目标距离即 spawn
          for (let i = 0; i < wave.targets.length; i++) {
            const tg = wave.targets[i];
            if (!tg.spawned && r >= tg.dist) {
              tg.spawned = true;
              spawnIcon(tg.d);
            }
          }
        }
      }

      // 2) 图标：停留 → 起飞 → 到达
      for (let i = icons.length - 1; i >= 0; i--) {
        const ico = icons[i];
        if (ico.done) continue;
        active = true;
        if (!ico.flyStart) {
          // 停留计时走帧循环（暂停时自然冻结）
          if (now - ico.born >= HOLD) {
            ico.el.classList.add("is-flying");
            ico.inner.style.transition = "none";
            ico.flyStart = now;
          }
          continue;
        }
        const ft = (now - ico.flyStart) / FLY_DUR;
        if (ft >= 1) { absorbIcon(ico); continue; }
        const e = ft * ft; // 加速冲向 logo
        const x = ico.sx + (center.x - ico.sx) * e;
        const y = ico.sy + (center.y - ico.sy) * e;
        ico.el.style.transform = "translate3d(" + x + "px," + y + "px,0)";
        const s = 1 - 0.72 * e;
        ico.inner.style.transform = "scale(" + s.toFixed(3) + ")";
        ico.inner.style.opacity = String(1 - 0.55 * e);
        // 飞行途中的推力跟随图标位置
        ico.pusher.x = x; ico.pusher.y = y;
        ico.pusher.life = 200;
      }

      // 3) 推力衰减（keep 标记的属于在飞图标，不清出数组）
      for (let i = pushers.length - 1; i >= 0; i--) {
        const p = pushers[i];
        p.life -= dt;
        if (p.life < 0) p.life = 0;
        if (p.life <= 0 && !p.keep) pushers.splice(i, 1);
      }

      // 4) 点的位移（推开 / 回弹）
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        if (d.taken) continue;
        let tx = 0, ty = 0;
        for (let j = 0; j < pushers.length; j++) {
          const p = pushers[j];
          const dx = d.bx - p.x, dy = d.by - p.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < p.rad) {
            const ramp = Math.min(p.life / 300, 1); // 消失前渐进松力
            const f = (1 - dist / p.rad) * p.str * ramp;
            tx += (dx / dist) * f;
            ty += (dy / dist) * f;
          }
        }
        d.ox += (tx - d.ox) * 0.16;
        d.oy += (ty - d.oy) * 0.16;
        if (Math.abs(d.ox) > 0.08 || Math.abs(d.oy) > 0.08) {
          d.el.style.transform = "translate3d(" + d.ox.toFixed(2) + "px," + d.oy.toFixed(2) + "px,0)";
          d.dirty = true;
          active = true;
        } else if (d.dirty) {
          d.el.style.transform = "";
          d.dirty = false;
          d.ox = 0; d.oy = 0;
        }
      }

      if (active || pushers.length) {
        rafId = requestAnimationFrame(frame);
      } else {
        running = false;
        lastNow = 0;
      }
    }

    // ---------- 生命周期 ----------
    if (!narrowHero.matches) buildDots();
    scheduleNext(900);

    // hero 离开视口即暂停（省电），回来先重排时间轴再继续
    let pausedAt = 0;
    let pagingAt = 0;   // 翻页动画期间同样暂停（见 frame 里的 is-paging 分支）
    const vizIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          vizVisible = true;
          if (pausedAt) {
            const delta = performance.now() - pausedAt;
            pausedAt = 0;
            if (wave) wave.start += delta;
            icons.forEach(function (ico) {
              ico.born += delta;
              if (ico.flyStart) ico.flyStart += delta;
            });
          }
          ensureLoop();
        } else {
          vizVisible = false;
          pausedAt = performance.now();
        }
      });
    }, { threshold: 0.05 });
    vizIO.observe(vizEl);

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        pausedAt = performance.now();
      } else if (pausedAt) {
        const delta = performance.now() - pausedAt;
        pausedAt = 0;
        if (wave) wave.start += delta;
        icons.forEach(function (ico) {
          ico.born += delta;
          if (ico.flyStart) ico.flyStart += delta;
        });
        ensureLoop();
      }
    });

    // 视口变化：立即更新 center（让正在飞的图标即时跟随 logo 新位置），
    // 防抖重建点阵（避免频繁清空重建）
    let resizeTimer = null;
    window.addEventListener("resize", function () {
      if (narrowHero.matches) {
        if (resizeTimer) window.clearTimeout(resizeTimer);
        if (nextTimer) window.clearTimeout(nextTimer);
        nextTimer = null;
        cancelAnimationFrame(rafId);
        running = false;
        lastNow = 0;
        return;
      }
      resolveCenter();
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        buildDots();
        wave = null;
        waveEl.style.opacity = "0";
        scheduleNext(900);
      }, 250);
    });
  }

  // ---------- 滚动入场动效 ----------
  // 关键：更新日志页面是"运行时读 Markdown 后再渲染"的，新插入的 .reveal 节点
  // 不会被已经启动的 observer 观察到，会永久停在 opacity:0（整页空白）。
  // 所以把登记逻辑暴露出去，并监听运行时渲染完成的事件。
  (function initReveal() {
    if (reducedMotion || !("IntersectionObserver" in window)) {
      // 不做动效：直接可见（也覆盖了后续动态插入的节点，见 register 里的处理）
      window.LimitReveal = function (root) {
        (root || document).querySelectorAll(".reveal").forEach(function (el) {
          el.classList.add("is-visible");
        });
      };
      window.LimitReveal();
      return;
    }

    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    // 只登记还没被观察过的节点，重复调用安全
    const seen = new WeakSet();
    function register(root) {
      (root || document).querySelectorAll(".reveal").forEach(function (el) {
        if (seen.has(el)) return;
        seen.add(el);
        io.observe(el);
      });
    }

    window.LimitReveal = register;

    // file:// 直接打开时不会加载更新日志的运行时模块（ES 模块被 CORS 拦），
    // 页面用的是内嵌静态内容。这种场景没有"滚动入场"的必要，
    // 直接全部显示 —— 否则首屏外的卡片会停在 opacity:0 直到 2 秒兜底。
    const STATIC_PREVIEW = location.protocol === 'file:';
    if (STATIC_PREVIEW) {
      document.querySelectorAll('.reveal').forEach(function (el) {
        el.classList.add('is-visible');
      });
    }

    register();

    // 运行时渲染完成后会派发这个事件（见 src/changelog/entry.mjs）
    document.addEventListener("changelog:rendered", function (e) {
      register(e && e.detail && e.detail.root ? e.detail.root : document);
    });
  })();

  // ---------- 导航当前区块高亮 ----------
  const navLinkMap = {};
  document.querySelectorAll(".nav-links a[href^='#']").forEach(function (a) {
    const id = a.getAttribute("href");
    if (id && id.length > 1) navLinkMap[id.slice(1)] = a;
  });
  const sectionIds = Object.keys(navLinkMap);
  if (sectionIds.length && "IntersectionObserver" in window) {
    const inBand = {};
    const sectionIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        inBand[entry.target.id] = entry.isIntersecting;
      });
      // 每次重新计算，避免回到首屏后残留上一次的高亮
      document.querySelectorAll(".nav-links a.is-current").forEach(function (a) {
        a.classList.remove("is-current");
      });
      sectionIds.forEach(function (id) {
        if (inBand[id] && navLinkMap[id]) navLinkMap[id].classList.add("is-current");
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sectionIds.forEach(function (id) {
      const sec = document.getElementById(id);
      if (sec) sectionIO.observe(sec);
    });
  }

})();
