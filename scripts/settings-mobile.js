(function () {
  'use strict';

  function buildNavigator(page) {
    var old = page.querySelector('.settings_mobile_nav');
    if (old) old.remove();
    var sections = Array.from(page.querySelectorAll(':scope > .settings_section'));
    if (sections.length < 2) return;
    var nav = document.createElement('nav');
    nav.className = 'settings_mobile_nav';
    nav.setAttribute('aria-label', '当前设置页分区');
    sections.forEach(function (section, index) {
      var title = section.querySelector('.settings_section_title');
      if (!title) return;
      if (!section.id) section.id = 'settings-section-' + page.dataset.page + '-' + index;
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = title.textContent.trim();
      button.hidden = section.hidden;
      button.addEventListener('click', function () {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(button);
      new MutationObserver(function () { button.hidden = section.hidden; }).observe(section, {
        attributes: true,
        attributeFilter: ['hidden']
      });
    });
    page.prepend(nav);
  }

  function init() {
    document.querySelectorAll('#settings_box .settings_page').forEach(buildNavigator);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
