(function () {
  'use strict';

  var STORAGE_KEY = 'cfg_customSearchEngines';
  var ORDER_KEY = 'cfg_searchEngineOrder';
  var MAX_ENGINES = 8;
  var editingIndex = -1;
  var builtinOrder = [
    'https://www.bing.com/search',
    'https://www.baidu.com/s',
    'https://github.com/search',
    'https://search.bilibili.com/all',
    'https://metaso.cn/?s=alolk&referrer_s=alolk&'
  ];
  var builtinValues = new Set(builtinOrder);

  function readEngines() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(isValidEngine).slice(0, MAX_ENGINES) : [];
    } catch (e) {
      return [];
    }
  }

  function isValidEngine(engine) {
    if (!engine || typeof engine.name !== 'string' || typeof engine.url !== 'string') return false;
    if (!engine.name.trim() || !engine.url.includes('{query}')) return false;
    try { return new URL(engine.url).protocol === 'https:'; } catch (e) { return false; }
  }

  function saveEngines(engines) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(engines));
  }

  function readEngineOrder() {
    try {
      var order = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
      return Array.isArray(order) ? order.filter(function (value) { return typeof value === 'string'; }) : [];
    } catch (e) {
      return [];
    }
  }

  function getAvailableValues(engines) {
    return builtinOrder.concat((engines || readEngines()).map(function (engine) { return engine.url; }));
  }

  function normalizeEngineOrder(engines) {
    var available = getAvailableValues(engines);
    var availableSet = new Set(available);
    var seen = new Set();
    var normalized = readEngineOrder().filter(function (value) {
      if (!availableSet.has(value) || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
    available.forEach(function (value) {
      if (!seen.has(value)) { seen.add(value); normalized.push(value); }
    });
    return normalized;
  }

  function saveEngineOrder(order) {
    var serialized = JSON.stringify(order);
    if (localStorage.getItem(ORDER_KEY) !== serialized) localStorage.setItem(ORDER_KEY, serialized);
  }

  function findByValue(nodes, value) {
    return Array.from(nodes).find(function (node) { return node.getAttribute('data-value') === value || node.value === value; });
  }

  function updateHomeMenuHeight() {
    var picker = document.querySelector('.engine_picker');
    var menu = document.getElementById('engineMenu');
    if (!picker || !menu) return;
    var rowCount = menu.querySelectorAll('.engine_row').length;
    var visibleRowCount = Math.min(rowCount, 6);
    picker.style.setProperty('--engine-menu-height', (visibleRowCount * 36 + 16) + 'px');
  }

  function applyEngineOrder(engines) {
    var order = normalizeEngineOrder(engines);
    saveEngineOrder(order);
    var chips = document.getElementById('engineChips');
    var menu = document.getElementById('engineMenu');
    var select1 = document.getElementById('searchEngineSelector1');
    var select2 = document.getElementById('searchEngineSelector2');
    order.forEach(function (value) {
      var chip = chips && findByValue(chips.querySelectorAll('.engine-chip'), value);
      var row = menu && findByValue(menu.querySelectorAll('.engine_row'), value);
      var option1 = select1 && findByValue(select1.options, value);
      var option2 = select2 && findByValue(select2.options, value);
      if (chip) chips.appendChild(chip);
      if (row) menu.appendChild(row);
      if (option1) select1.appendChild(option1);
      if (option2) select2.appendChild(option2);
    });
    updateHomeMenuHeight();
    bindEngineSorting();
  }

  function persistOrderFromChips() {
    var chips = document.getElementById('engineChips');
    if (!chips) return;
    var order = Array.from(chips.querySelectorAll('.engine-chip')).map(function (chip) {
      return chip.getAttribute('data-value');
    }).filter(Boolean);
    saveEngineOrder(order);
    applyEngineOrder(readEngines());
  }

  function ensureDragHandles(container) {
    container.querySelectorAll('.engine-chip').forEach(function (chip) {
      chip.draggable = false;
      var handle = chip.querySelector('.engine_drag_handle');
      if (!handle) {
        handle = document.createElement('span');
        handle.className = 'engine_drag_handle';
        handle.setAttribute('title', '拖动排序');
        handle.setAttribute('aria-hidden', 'true');
      }
      handle.draggable = false;
      chip.appendChild(handle);
    });
  }

  function bindEngineSorting() {
    var container = document.getElementById('engineChips');
    if (!container) return;
    ensureDragHandles(container);
    if (container.dataset.sortableBound === '1') return;
    container.dataset.sortableBound = '1';
    var dragged = null;
    var changed = false;
    var suppressClick = false;
    var pointerId = null;
    var startX = 0;
    var startY = 0;
    var sortingStarted = false;

    function moveAt(clientX, clientY, eventTarget) {
      if (!dragged) return;
      var target = eventTarget || document.elementFromPoint(clientX, clientY);
      target = target && target.closest('.engine-chip');
      if (!target || target === dragged || target.parentNode !== container) {
        var candidates = Array.from(container.querySelectorAll('.engine-chip')).filter(function (chip) {
          return chip !== dragged;
        });
        target = candidates.reduce(function (nearest, chip) {
          var rect = chip.getBoundingClientRect();
          var dx = clientX - (rect.left + rect.width / 2);
          var dy = clientY - (rect.top + rect.height / 2);
          var distance = dx * dx + dy * dy;
          return !nearest || distance < nearest.distance ? { chip: chip, distance: distance } : nearest;
        }, null);
        target = target && target.chip;
      }
      if (!target) return;
      var rect = target.getBoundingClientRect();
      var sameRow = clientY >= rect.top && clientY <= rect.bottom;
      var insertBefore = sameRow
        ? clientX < rect.left + rect.width / 2
        : clientY < rect.top + rect.height / 2;
      var reference = insertBefore ? target : target.nextSibling;
      if (reference === dragged || (!reference && dragged === container.lastElementChild)) return;
      container.insertBefore(dragged, reference);
      changed = true;
    }

    function finishDrag() {
      if (!dragged) return;
      dragged.classList.remove('is-dragging');
      container.classList.remove('is-sorting');
      if (changed) persistOrderFromChips();
      suppressClick = changed;
      dragged = null;
      changed = false;
      pointerId = null;
      sortingStarted = false;
    }

    container.addEventListener('pointerdown', function (event) {
      var handle = event.target.closest('.engine_drag_handle');
      if (!handle || event.button !== 0) return;
      event.preventDefault();
      dragged = handle.closest('.engine-chip');
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      changed = false;
      sortingStarted = false;
      handle.setPointerCapture(event.pointerId);
    });
    container.addEventListener('pointermove', function (event) {
      if (!dragged || event.pointerId !== pointerId) return;
      event.preventDefault();
      if (!sortingStarted) {
        var distance = Math.hypot(event.clientX - startX, event.clientY - startY);
        if (distance < 5) return;
        sortingStarted = true;
        dragged.classList.add('is-dragging');
        container.classList.add('is-sorting');
      }
      moveAt(event.clientX, event.clientY);
    });
    container.addEventListener('pointerup', function (event) {
      if (event.pointerId === pointerId) finishDrag();
    });
    container.addEventListener('pointercancel', finishDrag);
    container.addEventListener('click', function (event) {
      if (event.target.closest('.engine_drag_handle') || suppressClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
      }
    }, true);
  }

  function createOption(engine) {
    var option = document.createElement('option');
    option.value = engine.url;
    option.textContent = engine.name;
    option.dataset.customEngine = '1';
    return option;
  }

  function createHomeRow(engine) {
    var row = document.createElement('li');
    row.className = 'engine_row';
    row.setAttribute('role', 'option');
    row.setAttribute('data-value', engine.url);
    row.setAttribute('aria-selected', 'false');
    row.setAttribute('tabindex', '-1');
    row.dataset.customEngine = '1';
    var label = document.createElement('span');
    label.className = 'engine_row_label';
    label.textContent = engine.name;
    var check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    check.setAttribute('class', 'engine_row_check');
    check.setAttribute('viewBox', '0 0 24 24');
    check.innerHTML = '<path d="M5 12.5 10 17.5 19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    row.append(label, check);
    return row;
  }

  function selectEngine(value) {
    ['searchEngineSelector1', 'searchEngineSelector2'].forEach(function (id) {
      var select = document.getElementById(id);
      if (select) select.value = value;
    });
    if (localStorage.getItem('defaultSearchEngine') !== value) {
      localStorage.setItem('defaultSearchEngine', value);
    }
    if (typeof window.syncEngineChips === 'function') window.syncEngineChips(value);
    if (typeof window.syncHomeEnginePicker === 'function') window.syncHomeEnginePicker(value);
  }

  function createChip(engine) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'engine-chip glass-strong';
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', 'false');
    chip.setAttribute('data-value', engine.url);
    chip.dataset.customEngine = '1';
    var dot = document.createElement('span');
    dot.className = 'chip-dot';
    dot.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = engine.name;
    chip.append(dot, label);
    chip.addEventListener('click', function () { selectEngine(engine.url); });
    return chip;
  }

  function renderList(engines) {
    var list = document.getElementById('customEngineList');
    if (!list) return;
    list.replaceChildren();
    if (!engines.length) {
      var empty = document.createElement('p');
      empty.className = 'custom_engine_empty';
      empty.textContent = '还没有自定义搜索引擎';
      list.appendChild(empty);
      return;
    }
    engines.forEach(function (engine, index) {
      var item = document.createElement('div');
      item.className = 'custom_engine_item';
      var meta = document.createElement('div');
      meta.className = 'custom_engine_meta';
      var name = document.createElement('strong');
      name.textContent = engine.name;
      var url = document.createElement('span');
      url.textContent = engine.url;
      meta.append(name, url);
      var actions = document.createElement('div');
      actions.className = 'custom_engine_item_actions';
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'custom_engine_edit';
      edit.textContent = '编辑';
      edit.addEventListener('click', function () { beginEdit(index); });
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'custom_engine_remove';
      remove.textContent = '删除';
      remove.addEventListener('click', function () {
        var current = localStorage.getItem('defaultSearchEngine');
        var next = readEngines();
        next.splice(index, 1);
        saveEngines(next);
        resetForm();
        renderCustomSearchEngines();
        if (current === engine.url) selectEngine('https://www.bing.com/search');
      });
      actions.append(edit, remove);
      item.append(meta, actions);
      list.appendChild(item);
    });
  }

  function renderCustomSearchEngines() {
    var engines = readEngines();
    document.querySelectorAll('[data-custom-engine="1"]').forEach(function (node) { node.remove(); });
    var select1 = document.getElementById('searchEngineSelector1');
    var select2 = document.getElementById('searchEngineSelector2');
    var menu = document.getElementById('engineMenu');
    var chips = document.getElementById('engineChips');
    engines.forEach(function (engine) {
      if (select1) select1.appendChild(createOption(engine));
      if (select2) select2.appendChild(createOption(engine));
      if (menu) menu.appendChild(createHomeRow(engine));
      if (chips) chips.appendChild(createChip(engine));
    });
    applyEngineOrder(engines);
    renderList(engines);
    var current = localStorage.getItem('defaultSearchEngine') || 'https://www.bing.com/search';
    var exists = builtinValues.has(current) || engines.some(function (engine) { return engine.url === current; });
    selectEngine(exists ? current : 'https://www.bing.com/search');
  }

  function resetForm() {
    editingIndex = -1;
    var nameInput = document.getElementById('customEngineName');
    var urlInput = document.getElementById('customEngineUrl');
    var submit = document.getElementById('customEngineAdd');
    var cancel = document.getElementById('customEngineCancel');
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    if (submit) submit.textContent = '添加';
    if (cancel) cancel.hidden = true;
  }

  function beginEdit(index) {
    var engines = readEngines();
    var engine = engines[index];
    if (!engine) return;
    editingIndex = index;
    var nameInput = document.getElementById('customEngineName');
    var urlInput = document.getElementById('customEngineUrl');
    var submit = document.getElementById('customEngineAdd');
    var cancel = document.getElementById('customEngineCancel');
    if (nameInput) { nameInput.value = engine.name; nameInput.focus(); }
    if (urlInput) urlInput.value = engine.url;
    if (submit) submit.textContent = '保存';
    if (cancel) cancel.hidden = false;
  }

  function saveEngine() {
    var nameInput = document.getElementById('customEngineName');
    var urlInput = document.getElementById('customEngineUrl');
    var name = nameInput ? nameInput.value.trim() : '';
    var url = urlInput ? urlInput.value.trim() : '';
    var engines = readEngines();
    if (!name || !url.includes('{query}')) {
      if (typeof window.showSetsuccess === 'function') window.showSetsuccess('请填写名称并在地址中加入 {query}', 'error');
      return;
    }
    var engine = { name: name, url: url };
    if (!isValidEngine(engine)) {
      if (typeof window.showSetsuccess === 'function') window.showSetsuccess('搜索地址需要使用 HTTPS', 'error');
      return;
    }
    if (editingIndex < 0 && engines.length >= MAX_ENGINES) {
      if (typeof window.showSetsuccess === 'function') window.showSetsuccess('最多添加 8 个搜索引擎', 'error');
      return;
    }
    if (engines.some(function (item, index) {
      return index !== editingIndex && (item.name === name || item.url === url);
    })) {
      if (typeof window.showSetsuccess === 'function') window.showSetsuccess('这个搜索引擎已经添加过了', 'error');
      return;
    }
    var previous = editingIndex >= 0 ? engines[editingIndex] : null;
    var previousOrder = readEngineOrder();
    if (editingIndex >= 0) engines[editingIndex] = engine;
    else engines.push(engine);
    saveEngines(engines);
    if (previous && previous.url !== engine.url) {
      var revisedOrder = previousOrder.map(function (value) {
        return value === previous.url ? engine.url : value;
      });
      saveEngineOrder(revisedOrder);
    }
    if (previous && localStorage.getItem('defaultSearchEngine') === previous.url) {
      localStorage.setItem('defaultSearchEngine', engine.url);
    }
    var wasEditing = editingIndex >= 0;
    resetForm();
    renderCustomSearchEngines();
    if (typeof window.showSetsuccess === 'function') {
      window.showSetsuccess(wasEditing ? '搜索引擎已更新' : '搜索引擎已添加');
    }
  }

  function getSearchUrl(engine, query) {
    var encoded = encodeURIComponent(query);
    if (engine.includes('{query}')) return engine.replaceAll('{query}', encoded);
    if (engine.includes('baidu.com')) return engine + '?wd=' + encoded;
    if (engine.includes('bing.com')) return engine + '?q=' + encoded + '&form=QBLH';
    if (engine.includes('bilibili.com')) return engine + '?keyword=' + encoded;
    if (engine.includes('metaso.cn')) return engine + 'q=' + encoded;
    if (engine.includes('github.com')) return engine + '?q=' + encoded;
    return engine;
  }

  function runSearch() {
    var select = document.getElementById('searchEngineSelector2');
    var input = document.getElementById('input_text');
    if (!select || !input || !input.value.trim()) return;
    var link = document.createElement('a');
    link.href = getSearchUrl(select.value, input.value.trim());
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function closeSuggestions() {
    var list = document.getElementById('datalist');
    var box = document.getElementById('inputBox');
    var wrap = document.getElementById('inputBoxWrap');
    if (list) { list.replaceChildren(); list.classList.remove('is-open'); }
    if (box) { box.style.height = '44px'; box.classList.remove('is-suggesting'); }
    if (wrap) wrap.classList.remove('is-suggesting');
  }

  function renderGithubSuggestions(query) {
    var list = document.getElementById('datalist');
    var box = document.getElementById('inputBox');
    var wrap = document.getElementById('inputBoxWrap');
    if (!list) return;
    list.replaceChildren();
    [
      { label: query, suffix: '' },
      { label: query + ' · 仓库', suffix: '&type=repositories' },
      { label: query + ' · 代码', suffix: '&type=code' },
      { label: query + ' · Issues', suffix: '&type=issues' }
    ].forEach(function (item) {
      var li = document.createElement('li');
      var link = document.createElement('a');
      link.href = 'https://github.com/search?q=' + encodeURIComponent(query) + item.suffix;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = item.label;
      li.appendChild(link);
      list.appendChild(li);
    });
    list.classList.add('is-open');
    if (box) { box.classList.add('is-suggesting'); box.style.height = (44 + Math.min(list.scrollHeight, 320)) + 'px'; }
    if (wrap) wrap.classList.add('is-suggesting');
  }

  function bindSearchEnhancements() {
    var add = document.getElementById('customEngineAdd');
    if (add) add.addEventListener('click', saveEngine);
    var cancel = document.getElementById('customEngineCancel');
    if (cancel) cancel.addEventListener('click', resetForm);
    renderCustomSearchEngines();

    var button = document.getElementById('search_btn');
    if (button) button.onclick = runSearch;

    var input = document.getElementById('input_text');
    var select = document.getElementById('searchEngineSelector2');
    if (!input || !select) return;
    input.onkeyup = null;
    input.addEventListener('input', function () {
      var query = input.value.trim();
      if (!query) return closeSuggestions();
      if (select.value.includes('github.com')) renderGithubSuggestions(query);
      else if (select.value.includes('{query}')) closeSuggestions();
      else if (typeof window.callback === 'function') {
        var old = document.getElementById('_suggest_script');
        if (old) old.remove();
        var script = document.createElement('script');
        script.id = '_suggest_script';
        script.charset = 'gbk';
        script.src = 'https://sp0.baidu.com/5a1Fazu8AA54nxGko9WTAnF6hhy/su?wd=' + encodeURIComponent(query) + '&cb=callback';
        document.body.appendChild(script);
      }
    });
    select.addEventListener('change', closeSuggestions);
  }

  window.renderCustomSearchEngines = renderCustomSearchEngines;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSearchEnhancements);
  else bindSearchEnhancements();
})();
