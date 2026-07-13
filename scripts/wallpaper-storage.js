(function () {
  'use strict';

  var DB_NAME = 'limit-startup-media';
  var DB_VERSION = 1;
  var STORE_NAME = 'wallpapers';
  var WALLPAPER_KEY = 'custom-wallpaper';
  var ACTIVE_KEY = 'customWallpaperActive';
  var LEGACY_KEY = 'backgroundImage';
  var currentObjectUrl = '';
  var currentUrlPromise = null;

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('当前浏览器不支持 IndexedDB'));
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('无法打开壁纸数据库')); };
    });
  }

  async function runTransaction(mode, action) {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE_NAME, mode);
      var store = transaction.objectStore(STORE_NAME);
      var request = action(store);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('壁纸存储失败')); };
      transaction.oncomplete = function () { db.close(); };
      transaction.onerror = function () { db.close(); };
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(',');
    if (parts.length < 2) throw new Error('壁纸数据格式无效');
    var mime = ((parts[0].match(/data:([^;]+)/) || [])[1]) || 'image/jpeg';
    var binary = atob(parts[1]);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function replaceObjectUrl(blob) {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = blob ? URL.createObjectURL(blob) : '';
    return currentObjectUrl;
  }

  async function getBlob() {
    return runTransaction('readonly', function (store) { return store.get(WALLPAPER_KEY); });
  }

  async function getUrl() {
    if (currentObjectUrl) return currentObjectUrl;
    if (!currentUrlPromise) {
      currentUrlPromise = getBlob().then(function (blob) {
        return blob instanceof Blob ? replaceObjectUrl(blob) : '';
      }).finally(function () { currentUrlPromise = null; });
    }
    return currentUrlPromise;
  }

  async function saveBlob(blob) {
    if (!(blob instanceof Blob) || !blob.size) throw new Error('没有可保存的壁纸');
    await runTransaction('readwrite', function (store) { return store.put(blob, WALLPAPER_KEY); });
    localStorage.setItem(ACTIVE_KEY, '1');
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem('bg');
    currentUrlPromise = null;
    return replaceObjectUrl(blob);
  }

  async function saveDataUrl(dataUrl) {
    return saveBlob(dataUrlToBlob(dataUrl));
  }

  async function remove() {
    await runTransaction('readwrite', function (store) { return store.delete(WALLPAPER_KEY); });
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(LEGACY_KEY);
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = '';
    currentUrlPromise = null;
  }

  function isActive() {
    return localStorage.getItem(ACTIVE_KEY) === '1' || !!localStorage.getItem(LEGACY_KEY);
  }

  async function migrateLegacyWallpaper() {
    var legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return false;
    await saveDataUrl(legacy);
    return true;
  }

  async function loadActive() {
    try {
      await migrateLegacyWallpaper();
      if (!isActive()) return '';
      var url = await getUrl();
      if (!url) {
        localStorage.removeItem(ACTIVE_KEY);
        return '';
      }
      document.body.style.background = 'url("' + url + '") center / cover no-repeat fixed';
      if (typeof window.applyHomepageTextTone === 'function') window.applyHomepageTextTone(url);
      return url;
    } catch (error) {
      console.warn('[wallpaper] load failed', error);
      return '';
    }
  }

  window.LimitWallpaperStorage = {
    getBlob: getBlob,
    getUrl: getUrl,
    isActive: isActive,
    loadActive: loadActive,
    remove: remove,
    saveBlob: saveBlob,
    saveDataUrl: saveDataUrl
  };

  loadActive();
})();
