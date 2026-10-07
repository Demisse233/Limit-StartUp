(() => {
  const root = document.documentElement;
  const button = document.querySelector('.theme-toggle');
  const languageButton = document.getElementById('language');
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  let language = 'zh';
  try {
    language = localStorage.getItem('limitrss-language') || localStorage.getItem('plaza-language') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
    root.dataset.theme = localStorage.getItem('limitrss-theme') || 'auto';
  } catch {}
  let menu;
  function closeLanguageMenu() {
    if (menu) menu.hidden = true;
    languageButton?.setAttribute('aria-expanded', 'false');
  }
  if (languageButton) {
    menu = document.createElement('div');
    menu.className = 'language-menu'; menu.id = 'language-menu'; menu.hidden = true;
    languageButton.parentElement.append(menu);
    languageButton.setAttribute('aria-controls', menu.id);
    languageButton.setAttribute('aria-expanded', 'false');
    for (const [code,label] of [['zh','简体中文'],['en','English']]) {
      const option = document.createElement('button');option.type='button';option.textContent=label;option.lang=code==='zh'?'zh-CN':'en';option.dataset.language=code;
      option.addEventListener('click',()=>{
        language=code;
        try { localStorage.setItem('limitrss-language',code);localStorage.setItem('plaza-language',code); } catch {}
        closeLanguageMenu();
        document.dispatchEvent(new CustomEvent('limitrss-language-change',{detail:code}));
        window.updateNavLabels(code);languageButton.focus();
      });
      menu.append(option);
    }
    languageButton.addEventListener('click',()=>{
      menu.hidden=!menu.hidden;languageButton.setAttribute('aria-expanded',String(!menu.hidden));
    });
    document.addEventListener('click',event=>{if(!languageButton.contains(event.target)&&!menu.contains(event.target))closeLanguageMenu();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){closeLanguageMenu();languageButton.focus();}});
  }
  window.updateNavLabels = (value) => {
    language = value === 'en' ? 'en' : 'zh';
    const dark = root.dataset.theme === 'dark' || (root.dataset.theme === 'auto' && systemDark.matches);
    const themeLabel = language === 'zh' ? (dark ? '切换为浅色' : '切换为深色') : (dark ? 'Switch to light mode' : 'Switch to dark mode');
    const languageLabel = language === 'zh' ? '选择语言' : 'Choose language';
    menu?.querySelectorAll('button').forEach(option=>option.setAttribute('aria-pressed',String(option.dataset.language===language)));
    if (button) { button.title = themeLabel; button.setAttribute('aria-label', themeLabel); }
    if (languageButton) { languageButton.title = languageLabel; languageButton.setAttribute('aria-label', languageLabel); }
  };
  button?.addEventListener('click', () => {
    const dark = root.dataset.theme === 'dark' || (root.dataset.theme === 'auto' && systemDark.matches);
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('limitrss-theme', root.dataset.theme); } catch {}
    window.updateNavLabels(language);
  });
  systemDark.addEventListener('change', () => window.updateNavLabels(language));
  window.updateNavLabels(language);
})();
