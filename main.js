(function () {
  'use strict';

  var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  var mobileLayout = matchMedia('(max-width: 780px)');
  var finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  var cleanupEnhancements = function () {};

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function supportsDynamicKeyframes() {
    return Element.prototype.animate && typeof KeyframeEffect !== 'undefined' && typeof KeyframeEffect.prototype.setKeyframes === 'function';
  }

  function makeSetter(element, property, initialValue) {
    var firstFrame = {};
    var lastFrame = {};
    firstFrame[property] = initialValue;
    lastFrame[property] = initialValue;
    var animation = element.animate([firstFrame, lastFrame], { duration: 1, fill: 'both' });
    animation.pause();
    animation.currentTime = 0.5;

    return {
      set: function (value) {
        var from = {};
        var to = {};
        from[property] = value;
        to[property] = value;
        animation.effect.setKeyframes([from, to]);
      },
      cancel: function () {
        animation.cancel();
      }
    };
  }

  function setupAttackStory() {
    var ring = document.querySelector('[data-cube-ring]');
    var groups = Array.prototype.slice.call(document.querySelectorAll('[data-cube-group]'));
    var beats = Array.prototype.slice.call(document.querySelectorAll('[data-beat]'));
    if (!ring || groups.length !== beats.length || !beats.length || !supportsDynamicKeyframes()) return function () {};

    var ringSetter = makeSetter(ring, 'transform', 'rotateY(0deg)');
    var beatSetters = beats.map(function (beat) { return makeSetter(beat, 'opacity', '1'); });
    var layerSetters = groups.map(function (group) {
      return Array.prototype.slice.call(group.querySelectorAll('[data-cube-layer]')).map(function (layer) {
        return makeSetter(layer, 'opacity', '0');
      });
    });
    var pending = false;

    function draw() {
      var first = beats[0].getBoundingClientRect();
      var step = beats[0].offsetHeight || 240;
      var raw = (innerHeight / 2 - (first.top + first.height / 2)) / step;
      var progress = clamp(raw, 0, beats.length - 1);

      beatSetters.forEach(function (setter, index) {
        setter.set(clamp(1 - Math.abs(raw - index) * 0.95, 0.16, 1).toFixed(3));
      });
      ringSetter.set('rotateY(' + (-progress * 90).toFixed(2) + 'deg)');

      groups.forEach(function (group, index) {
        var cosine = Math.cos(((index - progress) * Math.PI) / 2);
        var near = clamp(1.4 - Math.abs(progress - index) / 1.6, 0, 1);
        var opacity = cosine > 0 ? Math.pow(cosine, 1.6) * near * 0.88 : 0;
        var value = opacity.toFixed(3);
        layerSetters[index].forEach(function (setter) { setter.set(value); });
        group.toggleAttribute('data-cube-active', opacity > 0.7);
      });
    }

    function requestDraw() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        draw();
      });
    }

    addEventListener('scroll', requestDraw, { passive: true });
    addEventListener('resize', requestDraw);
    draw();

    return function () {
      removeEventListener('scroll', requestDraw);
      removeEventListener('resize', requestDraw);
      ringSetter.cancel();
      beatSetters.forEach(function (setter) { setter.cancel(); });
      layerSetters.forEach(function (setters) { setters.forEach(function (setter) { setter.cancel(); }); });
      groups.forEach(function (group) { group.removeAttribute('data-cube-active'); });
    };
  }

  function setupPointerTilt() {
    if (!supportsDynamicKeyframes()) return function () {};
    var targets = [];
    var hero = document.querySelector('[data-hero-tilt]');
    var cube = !mobileLayout.matches ? document.querySelector('[data-cube-tilt]') : null;
    if (hero) targets.push({ element: hero, reach: 640 });
    if (cube) targets.push({ element: cube, reach: 420 });
    var setters = targets.map(function (target) {
      return { target: target, setter: makeSetter(target.element, 'transform', 'rotateX(0deg) rotateY(0deg)') };
    });
    var pendingEvent = null;
    var pendingFrame = 0;

    function drawPointer() {
      pendingFrame = 0;
      if (!pendingEvent) return;
      setters.forEach(function (entry) {
        var rect = entry.target.element.getBoundingClientRect();
        var x = clamp((pendingEvent.clientX - (rect.left + rect.width / 2)) / entry.target.reach, -1, 1);
        var y = clamp((pendingEvent.clientY - (rect.top + rect.height / 2)) / entry.target.reach, -1, 1);
        entry.setter.set('rotateX(' + (-y * 14).toFixed(2) + 'deg) rotateY(' + (x * 22).toFixed(2) + 'deg)');
      });
    }

    function onPointerMove(event) {
      pendingEvent = event;
      if (!pendingFrame) pendingFrame = requestAnimationFrame(drawPointer);
    }

    addEventListener('mousemove', onPointerMove, { passive: true });
    return function () {
      removeEventListener('mousemove', onPointerMove);
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      setters.forEach(function (entry) { entry.setter.cancel(); });
    };
  }

  function syncEnhancements() {
    cleanupEnhancements();
    var cleanups = [];
    if (!reducedMotion.matches && !mobileLayout.matches) cleanups.push(setupAttackStory());
    if (!reducedMotion.matches && finePointer.matches) cleanups.push(setupPointerTilt());
    cleanupEnhancements = function () { cleanups.forEach(function (cleanup) { cleanup(); }); };
  }

  [reducedMotion, mobileLayout, finePointer].forEach(function (query) {
    if (query.addEventListener) query.addEventListener('change', syncEnhancements);
    else query.addListener(syncEnhancements);
  });
  syncEnhancements();
})();

(function () {
  'use strict';

  var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  var items = Array.prototype.slice.call(document.querySelectorAll('details.faq-item'));

  items.forEach(function (details) {
    var summary = details.querySelector('summary');
    if (!summary || !details.animate) return;
    var running = null;
    var closing = false;

    function stopRunningAnimation() {
      if (!running) return;
      var wasClosing = closing;
      running.cancel();
      running = null;
      details.removeAttribute('data-faq-animating');
      if (wasClosing) details.open = false;
      closing = false;
    }

    summary.addEventListener('click', function (event) {
      if (reducedMotion.matches) return;
      event.preventDefault();

      var from = details.getBoundingClientRect().height;
      if (running) {
        running.cancel();
        running = null;
      }
      details.setAttribute('data-faq-animating', '');

      var opening = !details.open || closing;
      closing = !opening;
      if (opening) details.open = true;

      var to = opening ? details.scrollHeight : summary.getBoundingClientRect().height;
      var animation = details.animate(
        { height: [from + 'px', to + 'px'] },
        { duration: opening ? 300 : 240, easing: 'cubic-bezier(0.33, 0, 0.2, 1)' }
      );
      running = animation;
      animation.onfinish = function () {
        if (running !== animation) return;
        running = null;
        details.removeAttribute('data-faq-animating');
        if (!opening) {
          details.open = false;
          closing = false;
        }
      };
    });

    function respectReducedMotion() {
      if (reducedMotion.matches) stopRunningAnimation();
    }
    if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', respectReducedMotion);
    else reducedMotion.addListener(respectReducedMotion);
  });
})();
