(function () {
  'use strict';

  var STORAGE_KEY = 'ls_bookmarks_v1';
  var MAX_BOOKMARKS = 500;
  var MAX_CATEGORIES = 50;
  var MAX_PINNED_BOOKMARKS = 16;
  var DEFAULT_PINNED_BOOKMARKS = 12;
  var state = readState();
  var panelView = 'quick';
  var activeCategory = 'all';
  var syncTimer = null;
  var syncPending = false;
  var syncInFlight = false;
  var authPullInFlight = false;
  var metadataTimer = null;
  var metadataRequestId = 0;
  var expandedSettingsCategories = new Set();
  var sizeMenuBookmarkId = '';
  var searchTemporarilyHidesPanel = false;
  var enginePickerTemporarilyHidesPanel = false;
  var launcherRestoreRequested = false;
  var metadataRecoveryPromises = new Map();
  var metadataRecoveryQueue = [];
  var activeMetadataRecoveries = 0;
  var bookmarkGridResizeObserver = null;

  var MAX_METADATA_RECOVERIES = 4;

  function createId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function defaultState() {
    return {
      version: 2,
      panelOpen: false,
      categories: [{ id: 'uncategorized', name: '未分类' }],
      bookmarks: [],
      updatedAt: 0
    };
  }

  function cleanText(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max);
  }

  function normalizeBookmarkSize(value) {
    return value === 'small' || value === 'xlarge' ? value : 'large';
  }

  function bookmarkSizeAbbreviation(value) {
    return value === 'small' ? 'S' : value === 'xlarge' ? 'L' : 'M';
  }

  function normalizeUrl(value) {
    var text = cleanText(value, 2048);
    if (!text) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'https://' + text;
    try {
      var url = new URL(text);
      return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  function canonicalUrl(value) {
    try {
      var url = new URL(value);
      url.hash = '';
      return url.href.replace(/\/$/, '').toLowerCase();
    } catch (e) {
      return String(value).toLowerCase();
    }
  }

  function normalizeIconUrl(value) {
    var text = cleanText(value, 2048);
    if (!text) return '';
    try {
      var url = new URL(text);
      return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  function normalizeState(input) {
    var output = defaultState();
    if (!input || typeof input !== 'object') return output;
    output.panelOpen = input.panelOpen === true;
    var categoryIds = new Set();
    var categoryNames = new Set();
    var sourceCategories = Array.isArray(input.categories) ? input.categories : [];
    sourceCategories.slice(0, MAX_CATEGORIES).forEach(function (category) {
      var name = cleanText(category && category.name, 60);
      if (!name) return;
      var id = cleanText(category && category.id, 64) || createId('category');
      var nameKey = categoryNameKey(name);
      if (categoryIds.has(id) || categoryNames.has(nameKey)) return;
      categoryIds.add(id);
      categoryNames.add(nameKey);
      output.categories.push({ id: id, name: name });
    });
    output.categories = output.categories.filter(function (category, index, list) {
      return list.findIndex(function (candidate) { return candidate.id === category.id; }) === index;
    }).slice(0, MAX_CATEGORIES);
    categoryIds = new Set(output.categories.map(function (category) { return category.id; }));
    var seenUrls = new Set();
    var sourceBookmarks = Array.isArray(input.bookmarks) ? input.bookmarks : [];
    var hasPinnedState = sourceBookmarks.some(function (bookmark) {
      return bookmark && Object.prototype.hasOwnProperty.call(bookmark, 'pinned');
    });
    var pinnedCount = 0;
    sourceBookmarks.slice(0, MAX_BOOKMARKS).forEach(function (bookmark) {
      var url = normalizeUrl(bookmark && bookmark.url);
      var name = cleanText(bookmark && bookmark.name, 120);
      var key = canonicalUrl(url);
      if (!url || !name || seenUrls.has(key)) return;
      seenUrls.add(key);
      var pinned = hasPinnedState
        ? Boolean(bookmark && bookmark.pinned)
        : output.bookmarks.length < DEFAULT_PINNED_BOOKMARKS;
      if (pinned && pinnedCount >= MAX_PINNED_BOOKMARKS) pinned = false;
      if (pinned) pinnedCount += 1;
      output.bookmarks.push({
        id: cleanText(bookmark && bookmark.id, 64) || createId('bookmark'),
        name: name,
        url: url,
        iconUrl: normalizeIconUrl(bookmark && bookmark.iconUrl),
        categoryId: categoryIds.has(bookmark && bookmark.categoryId) ? bookmark.categoryId : 'uncategorized',
        size: normalizeBookmarkSize(bookmark && bookmark.size),
        pinned: pinned,
        createdAt: Number(bookmark && bookmark.createdAt) || Date.now(),
        updatedAt: Number(bookmark && bookmark.updatedAt) || Date.now()
      });
    });
    output.updatedAt = Number(input.updatedAt) || 0;
    output.version = 2;
    return output;
  }

  function readState() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      var normalized = normalizeState(raw);
      var needsMigration = raw && (
        Number(raw.version) < 2 ||
        (Array.isArray(raw.bookmarks) && raw.bookmarks.some(function (bookmark) {
          return bookmark && !Object.prototype.hasOwnProperty.call(bookmark, 'pinned');
        }))
      );
      if (needsMigration) localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (e) {
      return defaultState();
    }
  }

  function writeLocal(nextState, shouldSync) {
    state = normalizeState(nextState);
    if (!state.updatedAt) state.updatedAt = Date.now();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {
      notify('书签保存失败，请检查浏览器存储空间', true);
      return;
    }
    render();
    if (shouldSync !== false) queueCloudSync();
  }

  function notify(message, isError) {
    if (typeof window.showSetsuccess === 'function') window.showSetsuccess(message, isError ? 'error' : undefined);
  }

  function getCategoryById(id) {
    return state.categories.find(function (category) { return category.id === id; }) || state.categories[0];
  }

  function pinnedBookmarkCount(excludeId) {
    return state.bookmarks.filter(function (bookmark) {
      return bookmark.pinned && bookmark.id !== excludeId;
    }).length;
  }

  function canPinBookmark(id, pinned) {
    return !pinned || pinnedBookmarkCount(id) < MAX_PINNED_BOOKMARKS;
  }

  function setBookmarkPinned(id, pinned) {
    var bookmark = state.bookmarks.find(function (item) { return item.id === id; });
    if (!bookmark) return false;
    if (!canPinBookmark(id, pinned)) {
      notify('首页最多置顶 ' + MAX_PINNED_BOOKMARKS + ' 个快捷书签', true);
      return false;
    }
    if (bookmark.pinned === pinned) return true;
    var now = Date.now();
    bookmark.pinned = pinned;
    bookmark.updatedAt = now;
    state.updatedAt = now;
    writeLocal(state, true);
    notify(pinned ? '已加入快捷书签' : '已从快捷书签移除');
    return true;
  }

  function categoryNameKey(name) {
    var text = cleanText(name, 60);
    if (typeof text.normalize === 'function') text = text.normalize('NFKC');
    return text.toLocaleLowerCase('zh-CN');
  }

  function getOrCreateCategory(name) {
    var cleanName = cleanText(name, 60) || '未分类';
    var nameKey = categoryNameKey(cleanName);
    var existing = state.categories.find(function (category) {
      return categoryNameKey(category.name) === nameKey;
    });
    if (existing) return existing.id;
    if (state.categories.length >= MAX_CATEGORIES) return 'uncategorized';
    var category = { id: createId('category'), name: cleanName };
    state.categories.push(category);
    return category.id;
  }

  function fallbackFaviconUrl(url) {
    try {
      return new URL('/favicon.ico', url).href;
    } catch (e) {
      return '';
    }
  }

  function googleFaviconUrl(url) {
    try {
      return 'https://www.google.com/s2/favicons?sz=128&domain_url=' + encodeURIComponent(new URL(url).origin);
    } catch (e) {
      return '';
    }
  }

  function duckDuckGoFaviconUrl(url) {
    try {
      return 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(new URL(url).hostname) + '.ico';
    } catch (e) {
      return '';
    }
  }

  function bookmarkIconSources(bookmark) {
    return Array.from(new Set([
      bookmark.iconUrl,
      googleFaviconUrl(bookmark.url),
      duckDuckGoFaviconUrl(bookmark.url),
      fallbackFaviconUrl(bookmark.url)
    ].filter(Boolean)));
  }

  function drainMetadataRecoveryQueue() {
    while (activeMetadataRecoveries < MAX_METADATA_RECOVERIES && metadataRecoveryQueue.length) {
      var task = metadataRecoveryQueue.shift();
      activeMetadataRecoveries += 1;
      fetchBookmarkMetadata(task.url).then(task.resolve, function () { task.resolve(null); }).finally(function () {
        activeMetadataRecoveries -= 1;
        drainMetadataRecoveryQueue();
      });
    }
  }

  function queueMetadataRecovery(url) {
    return new Promise(function (resolve) {
      metadataRecoveryQueue.push({ url: url, resolve: resolve });
      drainMetadataRecoveryQueue();
    });
  }

  async function recoverBookmarkIconUrl(bookmark) {
    var key = canonicalUrl(bookmark.url);
    if (!metadataRecoveryPromises.has(key)) {
      metadataRecoveryPromises.set(key, (async function () {
        var metadata = await queueMetadataRecovery(bookmark.url);
        var iconUrl = normalizeIconUrl(metadata && metadata.iconUrl);
        if (!iconUrl) return '';
        var storedBookmark = state.bookmarks.find(function (item) { return item.id === bookmark.id; });
        if (storedBookmark && iconUrl !== storedBookmark.iconUrl) {
          storedBookmark.iconUrl = iconUrl;
          storedBookmark.updatedAt = Date.now();
          state.updatedAt = storedBookmark.updatedAt;
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
          queueCloudSync();
        }
        return iconUrl;
      })());
    }
    var recoveredUrl = await metadataRecoveryPromises.get(key);
    if (!recoveredUrl) metadataRecoveryPromises.delete(key);
    return recoveredUrl;
  }

  function createBookmarkFavicon(bookmark) {
    var favicon = document.createElement('span');
    favicon.className = 'bookmark_favicon';
    var fallback = document.createElement('span');
    fallback.textContent = bookmark.name.slice(0, 1) || '?';
    var image = document.createElement('img');
    image.alt = '';
    image.loading = 'eager';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    var sources = bookmarkIconSources(bookmark);
    var sourceIndex = 0;
    var metadataRecoveryStarted = false;
    function showNextSource() {
      if (sourceIndex >= sources.length) {
        if (!metadataRecoveryStarted) {
          metadataRecoveryStarted = true;
          recoverBookmarkIconUrl(bookmark).then(function (recoveredUrl) {
            if (!image.isConnected) return;
            if (recoveredUrl && !sources.includes(recoveredUrl)) {
              sources.push(recoveredUrl);
              showNextSource();
              return;
            }
            image.hidden = true;
            fallback.hidden = false;
          });
        } else {
          image.hidden = true;
          fallback.hidden = false;
        }
        return;
      }
      image.hidden = true;
      fallback.hidden = false;
      image.src = sources[sourceIndex];
      sourceIndex += 1;
    }
    image.addEventListener('load', function () {
      if (image.naturalWidth < 4 || image.naturalHeight < 4) {
        showNextSource();
        return;
      }
      image.hidden = false;
      fallback.hidden = true;
    });
    image.addEventListener('error', showNextSource);
    favicon.append(fallback, image);
    showNextSource();
    return favicon;
  }

  function renderBookmarkList(gridId, emptyId) {
    var grid = document.getElementById(gridId);
    var empty = document.getElementById(emptyId);
    if (!grid || !empty) return;
    grid.replaceChildren();
    var quickView = gridId === 'bookmarkPanelGrid' && panelView === 'quick';
    var visible = state.bookmarks.filter(function (bookmark) {
      if (quickView) return bookmark.pinned === true;
      return activeCategory === 'all' || bookmark.categoryId === activeCategory;
    });
    empty.hidden = visible.length > 0;
    visible.forEach(function (bookmark) {
      var item = document.createElement('div');
      item.className = 'bookmark_item bookmark_item--' + (quickView ? 'large' : normalizeBookmarkSize(bookmark.size));
      item.dataset.bookmarkId = bookmark.id;
      var link = document.createElement('a');
      link.className = 'bookmark_link';
      link.href = bookmark.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = bookmark.name;
      link.setAttribute('aria-label', bookmark.name);
      var favicon = createBookmarkFavicon(bookmark);
      var name = document.createElement('span');
      name.className = 'bookmark_name';
      name.textContent = bookmark.name;
      link.append(favicon, name);
      var resize = document.createElement('button');
      resize.type = 'button';
      resize.className = 'bookmark_resize_button';
      resize.title = '选择书签大小';
      resize.setAttribute('aria-label', '选择“' + bookmark.name + '”的大小，当前为 ' + bookmarkSizeAbbreviation(bookmark.size));
      resize.textContent = bookmarkSizeAbbreviation(bookmark.size);
      resize.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        showBookmarkSizeMenu(event, bookmark.id);
      });
      var editActions = document.createElement('span');
      editActions.className = 'bookmark_edit_actions';
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'bookmark_edit_action bookmark_edit_action--edit';
      edit.title = '编辑书签';
      edit.setAttribute('aria-label', '编辑书签：' + bookmark.name);
      edit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>';
      edit.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openQuickEditor(bookmark.id);
      });
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'bookmark_edit_action bookmark_edit_action--delete';
      remove.title = '删除书签';
      remove.setAttribute('aria-label', '删除书签：' + bookmark.name);
      remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      remove.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        removeBookmark(bookmark.id);
      });
      editActions.append(edit, remove);
      var mobileSelect = document.createElement('button');
      mobileSelect.type = 'button';
      mobileSelect.className = 'bookmark_edit_select';
      mobileSelect.setAttribute('aria-label', '选择并编辑书签：' + bookmark.name);
      mobileSelect.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>';
      mobileSelect.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openQuickEditor(bookmark.id);
      });
      item.appendChild(link);
      if (!quickView) item.append(resize, editActions, mobileSelect);
      grid.appendChild(item);
    });
    if (gridId === 'bookmarkPanelGrid') requestAnimationFrame(syncBookmarkGridUnits);
  }

  function syncBookmarkGridUnits() {
    var grid = document.getElementById('bookmarkPanelGrid');
    if (!grid || grid.clientWidth <= 0) return;
    var styles = window.getComputedStyle(grid);
    var gap = parseFloat(styles.getPropertyValue('--bookmark-item-gap')) || 10;
    var target = parseFloat(styles.getPropertyValue('--bookmark-unit-target')) || 52;
    var columns = Math.floor((grid.clientWidth + gap) / (target + gap));
    columns = Math.max(2, columns - (columns % 2));
    var unit = (grid.clientWidth - gap * (columns - 1)) / columns;
    grid.style.setProperty('--bookmark-unit', unit.toFixed(3) + 'px');
    grid.dataset.bookmarkColumns = String(columns);
  }

  function bindBookmarkGridSizing() {
    var grid = document.getElementById('bookmarkPanelGrid');
    if (!grid || grid.dataset.sizingBound === '1') return;
    grid.dataset.sizingBound = '1';
    if (typeof window.ResizeObserver === 'function') {
      bookmarkGridResizeObserver = new ResizeObserver(syncBookmarkGridUnits);
      bookmarkGridResizeObserver.observe(grid);
    }
    syncBookmarkGridUnits();
  }

  function setBookmarkSize(id, size) {
    var bookmark = state.bookmarks.find(function (item) { return item.id === id; });
    if (!bookmark) return;
    var nextSize = normalizeBookmarkSize(size);
    hideBookmarkSizeMenu();
    if (bookmark.size === nextSize) return;
    var now = Date.now();
    bookmark.size = nextSize;
    bookmark.updatedAt = now;
    state.updatedAt = now;
    writeLocal(state, true);
  }

  function createBookmarkSettingsRow(bookmark, nested) {
    var row = document.createElement('div');
    row.className = 'bookmark_settings_row' + (nested ? ' bookmark_settings_row--nested' : '');
    row.dataset.bookmarkId = bookmark.id;
    row.setAttribute('role', 'listitem');

    var icon = createBookmarkFavicon(bookmark);
    icon.classList.add('bookmark_settings_row_icon');

    var name = document.createElement('strong');
    name.className = 'bookmark_settings_row_name';
    name.textContent = bookmark.name;
    name.title = bookmark.name;

    var url = document.createElement('a');
    url.className = 'bookmark_settings_row_url';
    url.href = bookmark.url;
    url.target = '_blank';
    url.rel = 'noopener noreferrer';
    url.textContent = bookmark.url;
    url.title = bookmark.url;

    var details = document.createElement('span');
    details.className = 'bookmark_settings_row_details';
    details.append(name, url);

    var actions = document.createElement('span');
    actions.className = 'bookmark_settings_row_actions';
    var pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'bookmark_settings_row_action bookmark_settings_row_action--pin' + (bookmark.pinned ? ' is-active' : '');
    pin.textContent = bookmark.pinned ? '取消置顶' : '置顶';
    pin.setAttribute('aria-label', (bookmark.pinned ? '取消置顶 ' : '置顶 ') + bookmark.name);
    pin.addEventListener('click', function () { setBookmarkPinned(bookmark.id, !bookmark.pinned); });
    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'bookmark_settings_row_action bookmark_settings_row_action--edit';
    edit.textContent = '编辑';
    edit.setAttribute('aria-label', '编辑 ' + bookmark.name);
    edit.addEventListener('click', function () { openEditor(bookmark); });
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'bookmark_settings_row_action bookmark_settings_row_action--delete';
    remove.textContent = '删除';
    remove.setAttribute('aria-label', '删除 ' + bookmark.name);
    remove.addEventListener('click', function () { removeBookmark(bookmark.id); });
    actions.append(pin, edit, remove);
    row.append(icon, details, actions);
    return row;
  }

  function createBookmarkFolderRow(category, count) {
    var expanded = expandedSettingsCategories.has(category.id);
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'bookmark_settings_folder' + (expanded ? ' is-expanded' : '');
    row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    row.setAttribute('aria-label', (expanded ? '收起' : '展开') + '分类 ' + category.name);
    var icon = document.createElement('span');
    icon.className = 'bookmark_settings_folder_icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
    var name = document.createElement('strong');
    name.className = 'bookmark_settings_folder_name';
    name.textContent = category.name;
    var hint = document.createElement('span');
    hint.className = 'bookmark_settings_folder_hint';
    hint.textContent = count + ' 个书签';
    var chevron = document.createElement('span');
    chevron.className = 'bookmark_settings_folder_chevron';
    chevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
    row.append(icon, name, hint, chevron);
    row.addEventListener('click', function () {
      if (expandedSettingsCategories.has(category.id)) expandedSettingsCategories.delete(category.id);
      else expandedSettingsCategories.add(category.id);
      renderBookmarkSettingsList();
    });
    return row;
  }

  function renderBookmarkSettingsList() {
    var list = document.getElementById('bookmarkGrid');
    var empty = document.getElementById('bookmarkEmpty');
    var head = document.querySelector('.bookmark_settings_list_head');
    if (!list || !empty) return;
    list.replaceChildren();
    var customCategories = state.categories.filter(function (category) { return category.id !== 'uncategorized'; });
    var uncategorized = state.bookmarks.filter(function (bookmark) { return bookmark.categoryId === 'uncategorized'; });
    var hasContent = customCategories.length > 0 || state.bookmarks.length > 0;
    empty.hidden = hasContent;
    if (head) head.hidden = !hasContent;

    customCategories.forEach(function (category) {
      var bookmarks = state.bookmarks.filter(function (bookmark) { return bookmark.categoryId === category.id; });
      list.appendChild(createBookmarkFolderRow(category, bookmarks.length));
      if (expandedSettingsCategories.has(category.id)) {
        bookmarks.forEach(function (bookmark) { list.appendChild(createBookmarkSettingsRow(bookmark, true)); });
      }
    });

    if (uncategorized.length) {
      var section = document.createElement('div');
      section.className = 'bookmark_settings_uncategorized_head';
      section.innerHTML = '<span>未分类</span><small>' + uncategorized.length + ' 个书签</small>';
      list.appendChild(section);
      uncategorized.forEach(function (bookmark) { list.appendChild(createBookmarkSettingsRow(bookmark, false)); });
    }
  }

  function persistBookmarkOrderFromGrid(grid) {
    var visibleOrder = Array.from(grid.querySelectorAll('.bookmark_item')).map(function (item) {
      return item.dataset.bookmarkId;
    }).filter(Boolean);
    if (visibleOrder.length < 2) return;
    var visibleIds = new Set(visibleOrder);
    var byId = new Map(state.bookmarks.map(function (bookmark) { return [bookmark.id, bookmark]; }));
    var orderIndex = 0;
    state.bookmarks = state.bookmarks.map(function (bookmark) {
      if (!visibleIds.has(bookmark.id)) return bookmark;
      var ordered = byId.get(visibleOrder[orderIndex]);
      orderIndex += 1;
      return ordered || bookmark;
    });
    state.updatedAt = Date.now();
    writeLocal(state, true);
  }

  function bindBookmarkSorting() {
    var grid = document.getElementById('bookmarkPanelGrid');
    var panel = document.getElementById('bookmarkPanel');
    if (!grid || !panel || grid.dataset.sortableBound === '1') return;
    grid.dataset.sortableBound = '1';
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
      target = target && target.closest('.bookmark_item');
      if (!target || target === dragged || target.parentNode !== grid) {
        var candidates = Array.from(grid.querySelectorAll('.bookmark_item')).filter(function (item) {
          return item !== dragged;
        });
        target = candidates.reduce(function (nearest, item) {
          var rect = item.getBoundingClientRect();
          var dx = clientX - (rect.left + rect.width / 2);
          var dy = clientY - (rect.top + rect.height / 2);
          var distance = dx * dx + dy * dy;
          return !nearest || distance < nearest.distance ? { item: item, distance: distance } : nearest;
        }, null);
        target = target && target.item;
      }
      if (!target) return;
      var rect = target.getBoundingClientRect();
      var sameRow = clientY >= rect.top && clientY <= rect.bottom;
      var insertBefore = sameRow
        ? clientX < rect.left + rect.width / 2
        : clientY < rect.top + rect.height / 2;
      var reference = insertBefore ? target : target.nextSibling;
      if (reference === dragged || (!reference && dragged === grid.lastElementChild)) return;
      grid.insertBefore(dragged, reference);
      changed = true;
    }

    function finishDrag() {
      if (!dragged) return;
      dragged.classList.remove('is-dragging');
      grid.classList.remove('is-sorting');
      var shouldPersist = changed;
      suppressClick = changed;
      dragged = null;
      changed = false;
      pointerId = null;
      sortingStarted = false;
      if (shouldPersist) persistBookmarkOrderFromGrid(grid);
    }

    grid.addEventListener('pointerdown', function (event) {
      var item = event.target.closest('.bookmark_item');
      if (!item || event.button !== 0 || !panel.classList.contains('is-managing')) return;
      event.preventDefault();
      dragged = item;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      changed = false;
      sortingStarted = false;
      item.setPointerCapture(event.pointerId);
    });
    grid.addEventListener('pointermove', function (event) {
      if (!dragged || event.pointerId !== pointerId) return;
      event.preventDefault();
      if (!sortingStarted) {
        var distance = Math.hypot(event.clientX - startX, event.clientY - startY);
        if (distance < 5) return;
        sortingStarted = true;
        dragged.classList.add('is-dragging');
        grid.classList.add('is-sorting');
      }
      moveAt(event.clientX, event.clientY);
    });
    grid.addEventListener('pointerup', function (event) {
      if (event.pointerId === pointerId) finishDrag();
    });
    grid.addEventListener('pointercancel', finishDrag);
    grid.addEventListener('click', function (event) {
      var sizing = panel.classList.contains('is-sizing');
      var editing = panel.classList.contains('is-editing');
      if (sizing && event.target.closest('.bookmark_resize_button')) return;
      if (editing && event.target.closest('.bookmark_edit_action, .bookmark_edit_select')) return;
      if (panel.classList.contains('is-managing') || sizing || editing || suppressClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
      }
    }, true);
  }

  function renderCategoryButtons(container) {
    if (!container) return;
    container.replaceChildren();
    var categories = [{ id: 'all', name: '全部' }].concat(state.categories);
    categories.forEach(function (category) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'bookmark_category' + (category.id === activeCategory ? ' is-active' : '');
      button.textContent = category.name;
      button.addEventListener('click', function () {
        activeCategory = category.id;
        renderCategories();
        renderBookmarks();
      });
      container.appendChild(button);
    });
  }

  function renderCategories() {
    var datalist = document.getElementById('bookmarkCategoryList');
    var categories = [{ id: 'all', name: '全部' }].concat(state.categories);
    if (!categories.some(function (category) { return category.id === activeCategory; })) activeCategory = 'all';
    renderCategoryButtons(document.getElementById('bookmarkCategories'));
    renderCategoryButtons(document.getElementById('bookmarkPanelCategories'));
    if (datalist) {
      datalist.replaceChildren();
      state.categories.forEach(function (category) {
        var option = document.createElement('option');
        option.value = category.name;
        datalist.appendChild(option);
      });
    }
    renderCategoryManager();
  }

  function renderCategoryManager() {
    var container = document.getElementById('bookmarkCategoryManagerList');
    if (!container) return;
    container.replaceChildren();
    var customCategories = state.categories.filter(function (category) {
      return category.id !== 'uncategorized';
    });
    if (!customCategories.length) {
      var empty = document.createElement('span');
      empty.className = 'bookmark_category_manager_empty';
      empty.textContent = '暂无自定义分类';
      container.appendChild(empty);
      return;
    }
    customCategories.forEach(function (category) {
      var item = document.createElement('span');
      item.className = 'bookmark_category_manager_item';
      var name = document.createElement('span');
      name.className = 'bookmark_category_manager_name';
      name.textContent = category.name;
      name.title = category.name;
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '删除';
      remove.setAttribute('aria-label', '删除分类 ' + category.name);
      remove.addEventListener('click', function () { removeCategory(category.id); });
      item.append(name, remove);
      container.appendChild(item);
    });
  }

  function addCategory(event) {
    event.preventDefault();
    var input = document.getElementById('bookmarkCategoryName');
    var name = cleanText(input && input.value, 60);
    if (!name) {
      notify('请输入分类名称', true);
      return;
    }
    var key = categoryNameKey(name);
    if (key === categoryNameKey('全部') || state.categories.some(function (category) { return categoryNameKey(category.name) === key; })) {
      notify('分类名称已存在', true);
      return;
    }
    if (state.categories.length >= MAX_CATEGORIES) {
      notify('最多创建 ' + MAX_CATEGORIES + ' 个分类', true);
      return;
    }
    state.categories.push({ id: createId('category'), name: name });
    state.updatedAt = Date.now();
    writeLocal(state, true);
    if (input) input.value = '';
    notify('分类已新增');
  }

  function removeCategory(id) {
    var category = state.categories.find(function (item) { return item.id === id; });
    if (!category || category.id === 'uncategorized') return;
    var count = state.bookmarks.filter(function (bookmark) { return bookmark.categoryId === id; }).length;
    var message = count
      ? '删除分类“' + category.name + '”？其中 ' + count + ' 个书签会移至未分类。'
      : '删除分类“' + category.name + '”？';
    if (!window.confirm(message)) return;
    var now = Date.now();
    state.bookmarks.forEach(function (bookmark) {
      if (bookmark.categoryId === id) {
        bookmark.categoryId = 'uncategorized';
        bookmark.updatedAt = now;
      }
    });
    state.categories = state.categories.filter(function (item) { return item.id !== id; });
    expandedSettingsCategories.delete(id);
    if (activeCategory === id) activeCategory = 'all';
    state.updatedAt = now;
    writeLocal(state, true);
    notify('分类已删除');
  }

  function renderBookmarks() {
    renderBookmarkSettingsList();
    renderBookmarkList('bookmarkPanelGrid', 'bookmarkPanelEmpty');
  }

  function render() {
    renderCategories();
    renderBookmarks();
    renderPanelState();
  }

  function renderPanelState() {
    var panel = document.getElementById('bookmarkPanel');
    var launcher = document.getElementById('bookmarkLauncher');
    if (!panel || !launcher) return;
    var temporarilyHidden = state.panelOpen === true && isPanelTemporarilyHidden();
    var open = state.panelOpen === true && !temporarilyHidden;
    var fullView = panelView === 'all';
    panel.classList.toggle('is-open', open);
    panel.classList.toggle('is-full-view', fullView);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    var title = document.getElementById('bookmarkPanelTitle');
    var viewToggle = document.getElementById('bookmarkViewToggle');
    var emptyTitle = document.getElementById('bookmarkPanelEmptyTitle');
    var emptyHint = document.getElementById('bookmarkPanelEmptyHint');
    if (title) title.textContent = fullView ? '全部书签' : '快捷书签';
    if (emptyTitle) emptyTitle.textContent = fullView ? '还没有书签' : '还没有快捷书签';
    if (emptyHint) emptyHint.textContent = fullView ? '可在设置 → 书签中添加或导入' : '可在全部书签或设置中置顶';
    if (viewToggle) {
      var viewToggleText = viewToggle.querySelector('span');
      var viewToggleLabel = fullView ? '返回快捷' : '查看全部';
      if (viewToggleText) viewToggleText.textContent = viewToggleLabel;
      viewToggle.setAttribute('aria-label', fullView ? '返回快捷书签' : '查看全部书签');
      viewToggle.title = fullView ? '返回快捷书签' : '查看全部书签';
    }
    launcher.classList.toggle('is-temporarily-hidden', temporarilyHidden);
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    launcher.setAttribute('aria-label', temporarilyHidden ? '恢复书签' : (open ? '关闭书签' : '打开书签'));
    launcher.title = temporarilyHidden ? '恢复书签' : (open ? '关闭书签' : '打开书签');
    if (typeof window.__syncFooterIcp__ === 'function') window.__syncFooterIcp__();
  }

  function isPanelTemporarilyHidden() {
    return searchTemporarilyHidesPanel || enginePickerTemporarilyHidesPanel;
  }

  function bindBookmarkPanelSearchVisibility() {
    var input = document.getElementById('input_text');
    if (!input || input.dataset.bookmarkVisibilityBound === '1') return;
    input.dataset.bookmarkVisibilityBound = '1';

    input.addEventListener('focus', function () {
      if (!state.panelOpen) return;
      searchTemporarilyHidesPanel = true;
      renderPanelState();
    });
    input.addEventListener('blur', function () {
      searchTemporarilyHidesPanel = false;
      renderPanelState();
    });
    if (document.activeElement === input && state.panelOpen) {
      searchTemporarilyHidesPanel = true;
      renderPanelState();
    }
  }

  function bindEnginePickerVisibility() {
    var popover = document.getElementById('enginePopover');
    if (!popover || popover.dataset.bookmarkVisibilityBound === '1') return;
    popover.dataset.bookmarkVisibilityBound = '1';

    function syncVisibility() {
      enginePickerTemporarilyHidesPanel = popover.getAttribute('aria-expanded') === 'true';
      renderPanelState();
    }

    new MutationObserver(syncVisibility).observe(popover, {
      attributes: true,
      attributeFilter: ['aria-expanded']
    });
    syncVisibility();
  }

  function hideBookmarkContextMenu() {
    var menu = document.getElementById('bookmarkContextMenu');
    if (menu) menu.hidden = true;
  }

  function hideBookmarkSizeMenu() {
    var menu = document.getElementById('bookmarkSizeMenu');
    if (menu) menu.hidden = true;
    sizeMenuBookmarkId = '';
  }

  function showBookmarkSizeMenu(event, bookmarkId) {
    var menu = document.getElementById('bookmarkSizeMenu');
    var bookmark = state.bookmarks.find(function (item) { return item.id === bookmarkId; });
    if (!menu || !bookmark) return;
    sizeMenuBookmarkId = bookmarkId;
    menu.querySelectorAll('[data-bookmark-size]').forEach(function (button) {
      var selected = button.dataset.bookmarkSize === normalizeBookmarkSize(bookmark.size);
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';
    var triggerRect = event.currentTarget.getBoundingClientRect();
    var menuRect = menu.getBoundingClientRect();
    var left = triggerRect.left + triggerRect.width / 2 - menuRect.width / 2;
    var top = triggerRect.bottom + 8;
    if (top + menuRect.height > window.innerHeight - 8) top = triggerRect.top - menuRect.height - 8;
    menu.style.left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8)) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
  }

  function setPanelMode(mode) {
    var panel = document.getElementById('bookmarkPanel');
    var done = document.getElementById('bookmarkMoveDone');
    if (!panel) return;
    panel.classList.toggle('is-managing', mode === 'move');
    panel.classList.toggle('is-sizing', mode === 'size');
    panel.classList.toggle('is-editing', mode === 'edit');
    if (done) done.hidden = !mode;
    if (mode !== 'edit') closeQuickEditor();
    hideBookmarkContextMenu();
    hideBookmarkSizeMenu();
  }

  function setPanelManaging(on) { setPanelMode(on ? 'move' : null); }
  function setPanelSizing(on) { setPanelMode(on ? 'size' : null); }
  function setPanelEditing(on) { setPanelMode(on ? 'edit' : null); }

  function showBookmarkContextMenu(event) {
    var panel = document.getElementById('bookmarkPanel');
    var menu = document.getElementById('bookmarkContextMenu');
    var move = document.getElementById('bookmarkMoveButton');
    var size = document.getElementById('bookmarkSizeButton');
    var edit = document.getElementById('bookmarkEditButton');
    if (!panel || !menu || !panel.classList.contains('is-open') || panelView !== 'all') return;
    event.preventDefault();
    hideBookmarkSizeMenu();
    var bookmarkCount = panel.querySelectorAll('#bookmarkPanelGrid .bookmark_item').length;
    if (move) move.disabled = bookmarkCount < 2;
    if (size) size.disabled = bookmarkCount < 1;
    if (edit) edit.disabled = bookmarkCount < 1;
    menu.hidden = false;
    menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - 150)) + 'px';
    menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - 198)) + 'px';
  }

  function setPanelOpen(open) {
    if (!open) {
      panelView = 'quick';
      activeCategory = 'all';
      setPanelMode(null);
    }
    if (state.panelOpen === open) return;
    state.panelOpen = open;
    state.updatedAt = Date.now();
    writeLocal(state, true);
  }

  function openPanel() { setPanelOpen(true); }
  function closePanel() { setPanelOpen(false); }

  function setPanelView(view) {
    panelView = view === 'all' ? 'all' : 'quick';
    activeCategory = 'all';
    setPanelMode(null);
    render();
  }

  function togglePanel() {
    setPanelOpen(!state.panelOpen);
  }

  function handleLauncherClick() {
    if (launcherRestoreRequested || isPanelTemporarilyHidden()) {
      launcherRestoreRequested = false;
      searchTemporarilyHidesPanel = false;
      enginePickerTemporarilyHidesPanel = false;
      var input = document.getElementById('input_text');
      if (input) input.blur();
      document.dispatchEvent(new CustomEvent('limit:close-engine-picker'));
      renderPanelState();
      return;
    }
    togglePanel();
  }

  function openBookmarkSettings() {
    if (typeof window.settings_jump === 'function') window.settings_jump();
    if (typeof window.enterSettingsPage === 'function') window.enterSettingsPage('bookmarks');
  }

  function openQuickEditor(id) {
    var bookmark = state.bookmarks.find(function (item) { return item.id === id; });
    var editor = document.getElementById('bookmarkQuickEditor');
    var category = document.getElementById('bookmarkQuickCategory');
    if (!bookmark || !editor || !category) return;
    document.getElementById('bookmarkQuickId').value = bookmark.id;
    document.getElementById('bookmarkQuickName').value = bookmark.name;
    document.getElementById('bookmarkQuickUrl').value = bookmark.url;
    category.replaceChildren();
    state.categories.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      option.selected = item.id === bookmark.categoryId;
      category.appendChild(option);
    });
    var size = document.querySelector('input[name="bookmarkQuickSize"][value="' + bookmark.size + '"]');
    if (size) size.checked = true;
    var pinned = document.getElementById('bookmarkQuickPinned');
    if (pinned) pinned.checked = bookmark.pinned === true;
    editor.hidden = false;
    requestAnimationFrame(function () { document.getElementById('bookmarkQuickName').focus(); });
  }

  function closeQuickEditor() {
    var editor = document.getElementById('bookmarkQuickEditor');
    var form = document.getElementById('bookmarkQuickForm');
    if (editor) editor.hidden = true;
    if (form) form.reset();
  }

  function saveQuickEditor(event) {
    event.preventDefault();
    var id = document.getElementById('bookmarkQuickId').value;
    var bookmark = state.bookmarks.find(function (item) { return item.id === id; });
    var name = cleanText(document.getElementById('bookmarkQuickName').value, 120);
    var url = normalizeUrl(document.getElementById('bookmarkQuickUrl').value);
    if (!bookmark || !name || !url) {
      notify('请填写有效的书签名称和链接', true);
      return;
    }
    var duplicate = state.bookmarks.find(function (item) {
      return item.id !== id && canonicalUrl(item.url) === canonicalUrl(url);
    });
    if (duplicate) {
      notify('这个网址已经在书签中', true);
      return;
    }
    var now = Date.now();
    var size = document.querySelector('input[name="bookmarkQuickSize"]:checked');
    var pinned = document.getElementById('bookmarkQuickPinned');
    var shouldPin = Boolean(pinned && pinned.checked);
    if (!canPinBookmark(bookmark.id, shouldPin)) {
      notify('首页最多置顶 ' + MAX_PINNED_BOOKMARKS + ' 个快捷书签', true);
      return;
    }
    bookmark.name = name;
    bookmark.url = url;
    bookmark.categoryId = document.getElementById('bookmarkQuickCategory').value || 'uncategorized';
    bookmark.size = normalizeBookmarkSize(size && size.value);
    bookmark.pinned = shouldPin;
    bookmark.updatedAt = now;
    state.updatedAt = now;
    writeLocal(state, true);
    closeQuickEditor();
    notify('书签已更新');
  }

  function deleteQuickBookmark() {
    var id = document.getElementById('bookmarkQuickId').value;
    if (removeBookmark(id)) closeQuickEditor();
  }

  function openEditor(bookmark) {
    var editor = document.getElementById('bookmarkEditor');
    var form = document.getElementById('bookmarkEditorForm');
    if (!editor || !form) return;
    form.reset();
    document.getElementById('bookmarkEditingId').value = bookmark ? bookmark.id : '';
    document.getElementById('bookmarkName').value = bookmark ? bookmark.name : '';
    document.getElementById('bookmarkUrl').value = bookmark ? bookmark.url : '';
    document.getElementById('bookmarkIconUrl').value = bookmark ? bookmark.iconUrl || '' : '';
    document.getElementById('bookmarkCategory').value = bookmark ? getCategoryById(bookmark.categoryId).name : '';
    setMetadataStatus('');
    var size = bookmark ? bookmark.size : 'large';
    var radio = form.querySelector('input[name="bookmarkSize"][value="' + size + '"]');
    if (radio) radio.checked = true;
    var pinned = document.getElementById('bookmarkPinned');
    if (pinned) pinned.checked = bookmark ? bookmark.pinned === true : pinnedBookmarkCount() < DEFAULT_PINNED_BOOKMARKS;
    document.getElementById('bookmarkEditorSave').textContent = bookmark ? '保存' : '添加';
    editor.hidden = false;
    requestAnimationFrame(function () { document.getElementById('bookmarkName').focus(); });
  }

  function closeEditor() {
    var editor = document.getElementById('bookmarkEditor');
    var form = document.getElementById('bookmarkEditorForm');
    if (editor) editor.hidden = true;
    if (form) form.reset();
    setMetadataStatus('');
  }

  function setMetadataStatus(text, stateName) {
    var status = document.getElementById('bookmarkMetadataStatus');
    if (!status) return;
    status.textContent = text || '';
    status.dataset.state = stateName || '';
  }

  function fallbackTitle(url) {
    try { return new URL(url).hostname.replace(/^www\./i, ''); } catch (e) { return ''; }
  }

  async function fetchBookmarkMetadata(url) {
    var metadataBase = location.protocol === 'file:' ? 'https://www.demisse.cn' : '';
    var response = await fetch(metadataBase + '/api/bookmarks/metadata?url=' + encodeURIComponent(url), {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('metadata request failed');
    var contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) throw new Error('metadata response was not json');
    var result = await response.json();
    return {
      title: cleanText(result && result.title, 120),
      iconUrl: normalizeIconUrl(result && result.iconUrl)
    };
  }

  async function hydrateMetadata(forceTitle) {
    var urlInput = document.getElementById('bookmarkUrl');
    var nameInput = document.getElementById('bookmarkName');
    var iconInput = document.getElementById('bookmarkIconUrl');
    var url = normalizeUrl(urlInput && urlInput.value);
    if (!url || !nameInput || !iconInput) return null;
    var requestId = ++metadataRequestId;
    setMetadataStatus('正在获取网页名称和图标…', 'loading');
    try {
      var metadata = await fetchBookmarkMetadata(url);
      if (requestId !== metadataRequestId) return null;
      if (metadata.title && (forceTitle || !nameInput.value.trim())) nameInput.value = metadata.title;
      if (metadata.iconUrl) iconInput.value = metadata.iconUrl;
      setMetadataStatus(metadata.title || metadata.iconUrl ? '已获取标签页信息' : '未找到标签页信息', metadata.title || metadata.iconUrl ? 'success' : 'fallback');
      return metadata;
    } catch (e) {
      if (requestId !== metadataRequestId) return null;
      if (!nameInput.value.trim()) nameInput.value = fallbackTitle(url);
      setMetadataStatus('无法读取网页信息，将使用域名和默认图标', 'fallback');
      return null;
    }
  }

  async function saveBookmark(event) {
    event.preventDefault();
    var id = document.getElementById('bookmarkEditingId').value;
    var url = normalizeUrl(document.getElementById('bookmarkUrl').value);
    var name = cleanText(document.getElementById('bookmarkName').value, 120);
    var iconUrl = normalizeIconUrl(document.getElementById('bookmarkIconUrl').value);
    var categoryName = cleanText(document.getElementById('bookmarkCategory').value, 60) || '未分类';
    var sizeInput = document.querySelector('input[name="bookmarkSize"]:checked');
    var size = normalizeBookmarkSize(sizeInput && sizeInput.value);
    var pinnedInput = document.getElementById('bookmarkPinned');
    var pinned = Boolean(pinnedInput && pinnedInput.checked);
    if (!url) {
      notify('请填写有效的书签网址', true);
      return;
    }
    if (!name || !iconUrl) {
      await hydrateMetadata(false);
      name = cleanText(document.getElementById('bookmarkName').value, 120) || fallbackTitle(url);
      iconUrl = normalizeIconUrl(document.getElementById('bookmarkIconUrl').value);
    }
    var duplicate = state.bookmarks.find(function (bookmark) {
      return bookmark.id !== id && canonicalUrl(bookmark.url) === canonicalUrl(url);
    });
    if (duplicate) {
      notify('这个网址已经在书签中', true);
      return;
    }
    var now = Date.now();
    var categoryId = getOrCreateCategory(categoryName);
    var existing = state.bookmarks.find(function (bookmark) { return bookmark.id === id; });
    if (!canPinBookmark(id, pinned)) {
      notify('首页最多置顶 ' + MAX_PINNED_BOOKMARKS + ' 个快捷书签', true);
      return;
    }
    if (existing) {
      existing.name = name;
      existing.url = url;
      existing.iconUrl = iconUrl;
      existing.categoryId = categoryId;
      existing.size = size;
      existing.pinned = pinned;
      existing.updatedAt = now;
    } else {
      if (state.bookmarks.length >= MAX_BOOKMARKS) {
        notify('最多保存 ' + MAX_BOOKMARKS + ' 个书签', true);
        return;
      }
      state.bookmarks.push({ id: createId('bookmark'), name: name, url: url, iconUrl: iconUrl, categoryId: categoryId, size: size, pinned: pinned, createdAt: now, updatedAt: now });
    }
    state.updatedAt = now;
    writeLocal(state, true);
    closeEditor();
    notify(existing ? '书签已更新' : '书签已添加');
  }

  function removeBookmark(id) {
    var bookmark = state.bookmarks.find(function (item) { return item.id === id; });
    if (!bookmark || !window.confirm('删除书签“' + bookmark.name + '”？')) return false;
    state.bookmarks = state.bookmarks.filter(function (item) { return item.id !== id; });
    state.updatedAt = Date.now();
    writeLocal(state, true);
    notify('书签已删除');
    return true;
  }

  function parseBookmarkHtml(text) {
    var document2 = new DOMParser().parseFromString(text, 'text/html');
    var imported = [];
    function addAnchor(anchor, categoryName) {
      var url = normalizeUrl(anchor.getAttribute('href'));
      var name = cleanText(anchor.textContent, 120) || (url ? new URL(url).hostname : '');
      var rawIcon = anchor.getAttribute('icon') || anchor.getAttribute('icon_uri') || '';
      var iconUrl = normalizeIconUrl(rawIcon);
      if (url && name) imported.push({
        name: name,
        url: url,
        iconUrl: iconUrl,
        category: categoryName || '未分类',
        size: 'large'
      });
    }

    function directChild(element, selector) {
      return Array.from(element.children || []).find(function (child) {
        return child.matches(selector);
      }) || null;
    }

    function pairedListAfter(children, index) {
      for (var nextIndex = index + 1; nextIndex < children.length; nextIndex += 1) {
        var candidate = children[nextIndex];
        if (candidate.tagName === 'DL') return { list: candidate, index: nextIndex };
        if (candidate.tagName === 'DD') {
          var descriptionList = directChild(candidate, 'dl');
          if (descriptionList) return { list: descriptionList, index: nextIndex };
        }
        if (candidate.tagName === 'P' && !candidate.querySelector('a, h3, dl, dt')) continue;
        break;
      }
      return null;
    }

    function walk(container, inheritedCategory) {
      var category = inheritedCategory || '未分类';
      var children = Array.from(container.children || []);
      for (var index = 0; index < children.length; index += 1) {
        var child = children[index];
        var tag = child.tagName;
        if (tag === 'A') {
          addAnchor(child, category);
        } else if (tag === 'H3') {
          var standaloneFolder = cleanText(child.textContent, 60);
          var standalonePair = pairedListAfter(children, index);
          if (standalonePair) {
            walk(standalonePair.list, standaloneFolder || category);
            index = standalonePair.index;
          }
        } else if (tag === 'DT') {
          var heading = directChild(child, 'h3');
          var anchor = directChild(child, 'a');
          var nested = directChild(child, 'dl');
          var folderName = heading ? cleanText(heading.textContent, 60) : '';
          if (anchor) addAnchor(anchor, category);
          if (nested) {
            walk(nested, folderName || category);
          } else if (heading) {
            var folderPair = pairedListAfter(children, index);
            if (folderPair) {
              walk(folderPair.list, folderName || category);
              index = folderPair.index;
            }
          }
        } else if (tag === 'DL') {
          walk(child, category);
        } else {
          walk(child, category);
        }
      }
    }
    walk(document2.body, '未分类');
    if (!imported.length) {
      document2.querySelectorAll('a[href]').forEach(function (anchor) { addAnchor(anchor, '未分类'); });
    }
    return imported;
  }

  async function importBookmarks(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify('书签文件不能超过 5MB', true);
      return;
    }
    try {
      var imported = parseBookmarkHtml(await file.text());
      var existingBookmarks = new Map(state.bookmarks.map(function (bookmark) {
        return [canonicalUrl(bookmark.url), bookmark];
      }));
      var added = 0;
      var refreshedIcons = 0;
      var bookmarkDataChanged = false;
      var now = Date.now();
      imported.some(function (item) {
        var key = canonicalUrl(item.url);
        var existingBookmark = existingBookmarks.get(key);
        if (existingBookmark) {
          if (!existingBookmark.iconUrl && item.iconUrl) {
            existingBookmark.iconUrl = item.iconUrl;
            existingBookmark.updatedAt = now;
            bookmarkDataChanged = true;
            refreshedIcons += 1;
          }
          return false;
        }
        if (state.bookmarks.length >= MAX_BOOKMARKS) return true;
        var bookmark = {
          id: createId('bookmark'),
          name: item.name,
          url: item.url,
          iconUrl: item.iconUrl,
          categoryId: getOrCreateCategory(item.category),
          size: normalizeBookmarkSize(item.size),
          pinned: false,
          createdAt: now,
          updatedAt: now
        };
        state.bookmarks.push(bookmark);
        existingBookmarks.set(key, bookmark);
        added += 1;
        bookmarkDataChanged = true;
        return false;
      });
      if (!added && !refreshedIcons) {
        notify(imported.length ? '没有可新增的书签' : '未在文件中找到书签', true);
        return;
      }
      if (bookmarkDataChanged) {
        state.updatedAt = now;
        writeLocal(state, true);
      } else {
        render();
      }
      notify(added ? '已导入 ' + added + ' 个书签' : '已更新书签图标');
    } catch (e) {
      notify('书签文件读取失败', true);
    }
  }

  function setSyncStatus(stateName, text) {
    var status = document.getElementById('bookmarkSyncStatus');
    if (!status) return;
    status.textContent = text;
    status.dataset.state = stateName;
  }

  function canCloudSync() {
    return location.protocol !== 'file:' && typeof window.getToken === 'function' && !!window.getToken() && typeof window.apiFetch === 'function';
  }

  function queueCloudSync() {
    if (!canCloudSync()) {
      setSyncStatus('local', typeof window.getToken === 'function' && window.getToken() ? '等待联网同步' : '本地保存 · 登录后同步');
      return;
    }
    syncPending = true;
    setSyncStatus('syncing', '同步中…');
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(flushCloudSync, 450);
  }

  async function flushCloudSync() {
    if (!syncPending || syncInFlight || !canCloudSync()) return;
    syncTimer = null;
    syncInFlight = true;
    var payload = state;
    try {
      await window.apiFetch('/api/bookmarks', { method: 'PUT', body: { data: payload } });
      syncPending = false;
      setSyncStatus('synced', '已同步 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      syncPending = true;
      setSyncStatus('error', '同步失败 · 联网后重试');
    } finally {
      syncInFlight = false;
    }
  }

  function mergeStates(localState, remoteState) {
    var local = normalizeState(localState);
    var remote = normalizeState(remoteState);
    return remote.updatedAt > local.updatedAt ? remote : local;
  }

  async function pullCloud() {
    if (!canCloudSync() || authPullInFlight) return;
    authPullInFlight = true;
    setSyncStatus('syncing', '正在同步…');
    try {
      var response = await window.apiFetch('/api/bookmarks');
      var remote = normalizeState(response && response.data);
      var merged = mergeStates(state, remote);
      var mergedJson = JSON.stringify(merged);
      var remoteJson = JSON.stringify(remote);
      writeLocal(merged, false);
      if (mergedJson !== remoteJson) {
        syncPending = true;
        await flushCloudSync();
      } else {
        setSyncStatus('synced', '已同步');
      }
    } catch (e) {
      setSyncStatus('error', '同步失败 · 联网后重试');
    } finally {
      authPullInFlight = false;
    }
  }

  function handleAuthStateChanged(signedIn) {
    if (signedIn) pullCloud();
    else setSyncStatus('local', '本地保存 · 登录后同步');
  }

  function bind() {
    var launcher = document.getElementById('bookmarkLauncher');
    var panel = document.getElementById('bookmarkPanel');
    var settingsButton = document.getElementById('bookmarkSettingsButton');
    var viewToggle = document.getElementById('bookmarkViewToggle');
    var moveButton = document.getElementById('bookmarkMoveButton');
    var sizeButton = document.getElementById('bookmarkSizeButton');
    var editButton = document.getElementById('bookmarkEditButton');
    var moveDone = document.getElementById('bookmarkMoveDone');
    var add = document.getElementById('bookmarkAddButton');
    var cancel = document.getElementById('bookmarkEditorCancel');
    var form = document.getElementById('bookmarkEditorForm');
    var categoryForm = document.getElementById('bookmarkCategoryForm');
    var file = document.getElementById('bookmarkImportFile');
    var urlInput = document.getElementById('bookmarkUrl');
    var quickEditor = document.getElementById('bookmarkQuickEditor');
    var quickForm = document.getElementById('bookmarkQuickForm');
    var quickClose = document.getElementById('bookmarkQuickClose');
    var quickCancel = document.getElementById('bookmarkQuickCancel');
    var quickDelete = document.getElementById('bookmarkQuickDelete');
    var sizeMenu = document.getElementById('bookmarkSizeMenu');
    if (launcher) {
      launcher.addEventListener('pointerdown', function (event) {
        launcherRestoreRequested = isPanelTemporarilyHidden();
        if (launcherRestoreRequested) event.preventDefault();
      });
      launcher.addEventListener('click', handleLauncherClick);
    }
    bindBookmarkPanelSearchVisibility();
    bindEnginePickerVisibility();
    if (panel) panel.addEventListener('contextmenu', showBookmarkContextMenu);
    if (settingsButton) settingsButton.addEventListener('click', openBookmarkSettings);
    if (viewToggle) viewToggle.addEventListener('click', function () {
      setPanelView(panelView === 'quick' ? 'all' : 'quick');
    });
    if (moveButton) moveButton.addEventListener('click', function () { setPanelManaging(true); });
    if (sizeButton) sizeButton.addEventListener('click', function () { setPanelSizing(true); });
    if (editButton) editButton.addEventListener('click', function () { setPanelEditing(true); });
    if (moveDone) moveDone.addEventListener('click', function () { setPanelMode(null); });
    if (add) add.addEventListener('click', function () { openEditor(null); });
    if (cancel) cancel.addEventListener('click', closeEditor);
    if (form) form.addEventListener('submit', saveBookmark);
    if (categoryForm) categoryForm.addEventListener('submit', addCategory);
    if (quickForm) quickForm.addEventListener('submit', saveQuickEditor);
    if (quickClose) quickClose.addEventListener('click', closeQuickEditor);
    if (quickCancel) quickCancel.addEventListener('click', closeQuickEditor);
    if (quickDelete) quickDelete.addEventListener('click', deleteQuickBookmark);
    if (sizeMenu) sizeMenu.addEventListener('click', function (event) {
      var option = event.target.closest('[data-bookmark-size]');
      if (!option || !sizeMenuBookmarkId) return;
      setBookmarkSize(sizeMenuBookmarkId, option.dataset.bookmarkSize);
    });
    if (quickEditor) quickEditor.addEventListener('pointerdown', function (event) {
      if (event.target === quickEditor) closeQuickEditor();
    });
    if (urlInput) {
      urlInput.addEventListener('input', function () {
        var iconInput = document.getElementById('bookmarkIconUrl');
        if (iconInput) iconInput.value = '';
        metadataRequestId += 1;
        setMetadataStatus('');
        if (metadataTimer) clearTimeout(metadataTimer);
        metadataTimer = setTimeout(function () { hydrateMetadata(false); }, 700);
      });
      urlInput.addEventListener('blur', function () {
        if (metadataTimer) clearTimeout(metadataTimer);
        metadataTimer = null;
        hydrateMetadata(false);
      });
    }
    if (file) file.addEventListener('change', function () {
      importBookmarks(file.files && file.files[0]);
      file.value = '';
    });
    document.addEventListener('pointerdown', function (event) {
      var menu = document.getElementById('bookmarkContextMenu');
      if (menu && !menu.hidden && !menu.contains(event.target)) hideBookmarkContextMenu();
      var sizePicker = document.getElementById('bookmarkSizeMenu');
      if (sizePicker && !sizePicker.hidden && !sizePicker.contains(event.target) && !event.target.closest('.bookmark_resize_button')) hideBookmarkSizeMenu();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      hideBookmarkContextMenu();
      hideBookmarkSizeMenu();
      setPanelMode(null);
    });
    window.addEventListener('resize', function () {
      hideBookmarkContextMenu();
      hideBookmarkSizeMenu();
      syncBookmarkGridUnits();
    });
    window.addEventListener('blur', function () {
      hideBookmarkContextMenu();
      hideBookmarkSizeMenu();
    });
    bindBookmarkSorting();
    bindBookmarkGridSizing();
    window.addEventListener('online', function () {
      if (syncPending) flushCloudSync();
      else if (canCloudSync()) pullCloud();
    });
    render();
    handleAuthStateChanged(typeof window.getToken === 'function' && !!window.getToken());
  }

  window.LimitBookmarks = {
    handleAuthStateChanged: handleAuthStateChanged,
    syncFromCloud: pullCloud,
    open: openPanel,
    close: closePanel
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
