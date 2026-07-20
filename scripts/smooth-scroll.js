(function () {
  'use strict';

  var states = new WeakMap();
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var precisionUntil = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizedDelta(event) {
    var multiplier = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? window.innerHeight : 1;
    return { x: event.deltaX * multiplier, y: event.deltaY * multiplier };
  }

  function isScrollable(element, axis) {
    if (!(element instanceof Element)) return false;
    var style = getComputedStyle(element);
    var overflow = axis === 'x' ? style.overflowX : style.overflowY;
    if (!/(auto|scroll|overlay)/.test(overflow)) return false;
    return axis === 'x'
      ? element.scrollWidth > element.clientWidth + 1
      : element.scrollHeight > element.clientHeight + 1;
  }

  function canMove(element, axis, delta) {
    var position = axis === 'x' ? element.scrollLeft : element.scrollTop;
    var maximum = axis === 'x'
      ? element.scrollWidth - element.clientWidth
      : element.scrollHeight - element.clientHeight;
    return delta < 0 ? position > 0 : delta > 0 && position < maximum - 1;
  }

  function findTarget(event, delta) {
    var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    var wantsHorizontal = event.shiftKey || Math.abs(delta.x) > Math.abs(delta.y);
    for (var index = 0; index < path.length; index += 1) {
      var element = path[index];
      if (!(element instanceof Element)) continue;
      if (wantsHorizontal && isScrollable(element, 'x') && canMove(element, 'x', delta.x || delta.y)) {
        return { element: element, x: delta.x || delta.y, y: 0 };
      }
      if (!wantsHorizontal && isScrollable(element, 'y') && canMove(element, 'y', delta.y)) {
        return { element: element, x: 0, y: delta.y };
      }
      if (!wantsHorizontal && isScrollable(element, 'x') && canMove(element, 'x', delta.y)) {
        return { element: element, x: delta.y, y: 0 };
      }
    }

    var root = document.scrollingElement;
    if (root && canMove(root, 'y', delta.y)) return { element: root, x: 0, y: delta.y };
    if (root && canMove(root, 'x', delta.x)) return { element: root, x: delta.x, y: 0 };
    return null;
  }

  function stopAnimation(element) {
    var state = states.get(element);
    if (!state) return;
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = 0;
    state.lastTime = 0;
    state.targetX = element.scrollLeft;
    state.targetY = element.scrollTop;
  }

  function stopAnimationsInPath(event) {
    var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    path.forEach(function (element) {
      if (element instanceof Element && states.has(element)) stopAnimation(element);
    });
    var root = document.scrollingElement;
    if (root && states.has(root)) stopAnimation(root);
  }

  function animate(element, deltaX, deltaY) {
    var state = states.get(element);
    if (!state) {
      state = { targetX: element.scrollLeft, targetY: element.scrollTop, frame: 0, lastTime: 0, stalledFrames: 0 };
      states.set(element, state);
    } else if (!state.frame) {
      state.targetX = element.scrollLeft;
      state.targetY = element.scrollTop;
    }
    state.targetX = clamp(state.targetX + deltaX, 0, Math.max(0, element.scrollWidth - element.clientWidth));
    state.targetY = clamp(state.targetY + deltaY, 0, Math.max(0, element.scrollHeight - element.clientHeight));
    if (state.frame) return;

    function step(time) {
      if (!element.isConnected && element !== document.scrollingElement) {
        stopAnimation(element);
        return;
      }
      var maxX = Math.max(0, element.scrollWidth - element.clientWidth);
      var maxY = Math.max(0, element.scrollHeight - element.clientHeight);
      state.targetX = clamp(state.targetX, 0, maxX);
      state.targetY = clamp(state.targetY, 0, maxY);
      var elapsed = state.lastTime ? Math.min(40, time - state.lastTime) : 16;
      state.lastTime = time;
      var factor = 1 - Math.pow(0.001, elapsed / 320);
      var previousX = element.scrollLeft;
      var previousY = element.scrollTop;
      var nextX = element.scrollLeft + (state.targetX - element.scrollLeft) * factor;
      var nextY = element.scrollTop + (state.targetY - element.scrollTop) * factor;
      element.scrollLeft = Math.abs(state.targetX - nextX) < 0.5 ? state.targetX : nextX;
      element.scrollTop = Math.abs(state.targetY - nextY) < 0.5 ? state.targetY : nextY;
      var distanceX = Math.abs(state.targetX - element.scrollLeft);
      var distanceY = Math.abs(state.targetY - element.scrollTop);
      var didNotMove = Math.abs(element.scrollLeft - previousX) < 0.01 && Math.abs(element.scrollTop - previousY) < 0.01;
      state.stalledFrames = didNotMove && (distanceX > 0.5 || distanceY > 0.5) ? state.stalledFrames + 1 : 0;
      if ((distanceX <= 0.5 && distanceY <= 0.5) || state.stalledFrames >= 3) {
        element.scrollLeft = state.targetX;
        element.scrollTop = state.targetY;
        state.frame = 0;
        state.lastTime = 0;
        state.stalledFrames = 0;
        state.targetX = element.scrollLeft;
        state.targetY = element.scrollTop;
        return;
      }
      state.frame = requestAnimationFrame(step);
    }

    state.frame = requestAnimationFrame(step);
  }

  document.addEventListener('wheel', function (event) {
    if (event.defaultPrevented || event.ctrlKey || reduceMotion.matches) return;
    var delta = normalizedDelta(event);
    var magnitude = Math.max(Math.abs(delta.x), Math.abs(delta.y));
    var now = performance.now();
    if (event.deltaMode === 0 && magnitude < 40) precisionUntil = now + 180;
    if (now < precisionUntil) {
      stopAnimationsInPath(event);
      return;
    }
    var target = findTarget(event, delta);
    if (!target) return;
    event.preventDefault();
    animate(target.element, target.x, target.y);
  }, { passive: false, capture: true });

  document.addEventListener('pointerdown', stopAnimationsInPath, { capture: true, passive: true });
  document.addEventListener('touchstart', stopAnimationsInPath, { capture: true, passive: true });
})();
