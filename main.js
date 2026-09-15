(async function () {
  'use strict';

  var panel = document.querySelector('[data-eva-support]');
  if (!panel || typeof fetch !== 'function' || typeof AbortController !== 'function' || typeof BigInt !== 'function') return;
  var fields = {};
  var names = ['percent', 'eth', 'signals', 'breakdown', 'total', 'checked'];
  names.forEach(function (name) { fields[name] = panel.querySelector('[data-eva-' + name + ']'); });
  if (names.some(function (name) { return !fields[name]; })) return;

  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 6000);
  try {
    var response = await fetch('https://api.ethva.net/eips/8205', {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('EVA response unavailable');
    var data = await response.json();
    if (data.id !== 8205 || typeof data.approved !== 'boolean') throw new Error('Unexpected EIP');
    if (!data.approved) { panel.hidden = true; return; }
    var choices = ['yes', 'no', 'abstain'];
    var counts = choices.map(function (choice) {
      var count = data[choice + 'Votes'];
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid signal count');
      return count;
    });
    var balances = choices.map(function (choice) {
      var balance = data[choice + 'VoteBalance'];
      if (typeof balance !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(balance)) throw new Error('Invalid stake balance');
      return BigInt(balance);
    });
    var signals = counts.reduce(function (sum, count) { return sum + count; }, 0);
    if (!Number.isSafeInteger(signals)) throw new Error('Invalid total signal count');
    var total = balances.reduce(function (sum, balance) { return sum + balance; }, BigInt(0));
    var tenths = total > 0 ? Number((balances[0] * BigInt(1000) + total / BigInt(2)) / total) : 0;
    var percent = total === BigInt(0) ? '—' : tenths / 10 + '%';
    if (balances[0] > 0 && tenths === 0) percent = '<0.1%';
    if (balances[0] < total && tenths === 1000) percent = '>99.9%';
    var eth = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
    var integers = new Intl.NumberFormat('en-US');
    var checked = new Date();
    var checkedMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][checked.getUTCMonth()];
    var checkedLabel = checked.getUTCDate() + ' ' + checkedMonth + ' ' + checked.getUTCFullYear() + ', ' + checked.toISOString().slice(11, 16) + ' UTC';

    // Replace the dated HTML snapshot only after the entire response validates.
    fields.percent.textContent = percent;
    fields.eth.textContent = eth.format(Number(balances[0]) / 1e18);
    fields.signals.textContent = integers.format(signals);
    fields.breakdown.textContent = integers.format(counts[0]) + ' yes · ' + integers.format(counts[1]) + ' no · ' + integers.format(counts[2]) + ' abstain';
    fields.total.textContent = eth.format(Number(total) / 1e18);
    fields.checked.dateTime = checked.toISOString();
    fields.checked.textContent = checkedLabel;
  } catch (_) {
    // Offline, timeouts, and API changes keep the original values and their check date.
  } finally {
    clearTimeout(timeout);
  }
})();

(function () {
  'use strict';

  var nav = document.querySelector('.site-nav');
  if (!nav) return;
  var toggle = nav.querySelector('.site-nav__toggle');
  var links = nav.querySelector('.site-nav__links');
  var brand = nav.querySelector('.site-nav__brand');
  if (!toggle || !links || !brand) return;
  var mobileNav = matchMedia('(max-width: 780px)');

  function isOpen() {
    return toggle.getAttribute('aria-expanded') === 'true';
  }

  function setOpen(open, restoreFocus) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', function () {
    setOpen(!isOpen());
  });

  nav.addEventListener('click', function (event) {
    if (mobileNav.matches && event.target.closest('a[href]')) setOpen(false);
  });

  document.addEventListener('click', function (event) {
    if (isOpen() && !nav.contains(event.target)) setOpen(false, links.contains(document.activeElement));
  });

  document.addEventListener('focusin', function (event) {
    if (isOpen() && !nav.contains(event.target)) setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      setOpen(false, true);
    }
  });

  function syncLayout() {
    var focusInLinks = links.contains(document.activeElement);
    var focusOnToggle = document.activeElement === toggle;
    setOpen(false);
    if (mobileNav.matches && focusInLinks) toggle.focus();
    else if (!mobileNav.matches && focusOnToggle) brand.focus();
  }

  if (mobileNav.addEventListener) mobileNav.addEventListener('change', syncLayout);
  else mobileNav.addListener(syncLayout);
  toggle.hidden = false;
  document.documentElement.setAttribute('data-nav-ready', '');
})();

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
