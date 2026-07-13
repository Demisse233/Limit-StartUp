(function () {
  'use strict';

  var requestId = 0;
  var regions = [
    { selector: '.showTime', fallback: document.body },
    { selector: '.box', fallback: document.body },
    { selector: 'nav#menu', fallback: document.body },
    { selector: '.burger, .burger_btn', fallback: document.body },
    { selector: '.account_entry', fallback: document.body },
    { selector: '#success_box, #setsuccess_box', fallback: document.body },
    { selector: '.page_footer_icp', fallback: document.body }
  ];

  function getWallpaperSource() {
    var selected = document.querySelector('.bg_choice_small.is-selected img');
    if (selected && selected.src) return selected.src;
    var background = getComputedStyle(document.body).backgroundImage;
    var matched = background && background.match(/^url\(["']?(.*?)["']?\)$/);
    return matched ? matched[1] : '';
  }

  function setColors(element, lightText) {
    if (!element) return;
    element.style.setProperty('--home-text-color', lightText ? '#ffffff' : '#1d1d1f');
    element.style.setProperty('--home-text-muted', lightText ? 'rgba(255,255,255,0.78)' : 'rgba(29,29,31,0.68)');
    element.style.setProperty('--home-glass-border', lightText ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.35)');
  }

  function forcedTone(tone) {
    var lightText = tone === 'light';
    document.body.classList.toggle('home-text-light', lightText);
    regions.forEach(function (region) {
      document.querySelectorAll(region.selector).forEach(function (element) { setColors(element, lightText); });
    });
  }

  function averageLuminance(data, width, height, rect) {
    var left = Math.max(0, Math.floor(rect.left * width));
    var right = Math.min(width, Math.ceil(rect.right * width));
    var top = Math.max(0, Math.floor(rect.top * height));
    var bottom = Math.min(height, Math.ceil(rect.bottom * height));
    var total = 0;
    var count = 0;
    for (var y = top; y < bottom; y++) {
      for (var x = left; x < right; x++) {
        var i = (y * width + x) * 4;
        total += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
        count++;
      }
    }
    return count ? total / count : 255;
  }

  function applyHomepageTextTone(source) {
    var mode = 'auto';
    try { mode = localStorage.getItem('cfg_homeTextTone') || 'auto'; } catch (e) {}
    var currentRequest = ++requestId;
    if (mode !== 'auto') return forcedTone(mode);
    source = source || getWallpaperSource();
    if (!source) return forcedTone('dark');
    var image = new Image();
    image.onload = function () {
      if (currentRequest !== requestId) return;
      try {
        document.body.classList.remove('home-text-light');
        var width = 120;
        var height = 68;
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var context = canvas.getContext('2d', { willReadFrequently: true });
        var scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        var drawWidth = image.naturalWidth * scale;
        var drawHeight = image.naturalHeight * scale;
        context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
        var pixels = context.getImageData(0, 0, width, height).data;
        regions.forEach(function (region) {
          document.querySelectorAll(region.selector).forEach(function (element) {
            var bounds = element.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            var normalized = {
              left: bounds.left / window.innerWidth,
              right: bounds.right / window.innerWidth,
              top: bounds.top / window.innerHeight,
              bottom: bounds.bottom / window.innerHeight
            };
            setColors(element, averageLuminance(pixels, width, height, normalized) < 150);
          });
        });
      } catch (e) {
        forcedTone('dark');
      }
    };
    image.onerror = function () { if (currentRequest === requestId) forcedTone('dark'); };
    image.src = source;
  }

  window.applyHomepageTextTone = applyHomepageTextTone;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyHomepageTextTone(); });
  } else {
    applyHomepageTextTone();
  }
  window.addEventListener('resize', function () { applyHomepageTextTone(); });
})();
