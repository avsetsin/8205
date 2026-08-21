(function () {
  'use strict';

  var ring = document.querySelector('[data-cube-ring]');
  var tilt = document.querySelector('[data-cube-tilt]');
  var hero = document.querySelector('[data-hero-tilt]');
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-cube-group]'));
  var beats = Array.prototype.slice.call(document.querySelectorAll('[data-beat]'));

  if (!ring || !tilt || !beats.length) return;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function follow(el, reach) {
    return function (e) {
      var r = el.getBoundingClientRect();
      var cx = clamp((e.clientX - (r.left + r.width / 2)) / reach, -1, 1);
      var cy = clamp((e.clientY - (r.top + r.height / 2)) / reach, -1, 1);
      el.style.transform =
        'rotateX(' + (-cy * 14).toFixed(2) + 'deg) rotateY(' + (cx * 22).toFixed(2) + 'deg)';
    };
  }

  function draw() {
    var first = beats[0].getBoundingClientRect();
    var step = beats[0].offsetHeight || 240;
    var raw = (innerHeight / 2 - (first.top + first.height / 2)) / step;
    var t = clamp(raw, 0, beats.length - 1);
    var plain = innerWidth <= 780;

    beats.forEach(function (el, i) {
      el.style.opacity = plain ? '' : clamp(1 - Math.abs(raw - i) * 0.95, 0.16, 1).toFixed(3);
    });
    if (plain) return;

    ring.style.transform = 'rotateY(' + (-t * 90).toFixed(2) + 'deg)';
    groups.forEach(function (g, i) {
      var c = Math.cos(((i - t) * Math.PI) / 2);
      var near = clamp(1.4 - Math.abs(t - i) / 1.6, 0, 1);
      var o = c > 0 ? Math.pow(c, 1.6) * near * 0.88 : 0;
      var v = o.toFixed(3);
      for (var k = 0; k < g.children.length; k++) g.children[k].style.opacity = v;
      g.style.pointerEvents = o > 0.7 ? 'auto' : 'none';
    });
  }

  var pending = false;
  function onScroll() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; draw(); });
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  addEventListener('mousemove', follow(tilt, 420), { passive: true });
  if (hero) addEventListener('mousemove', follow(hero, 640), { passive: true });

  draw();
})();
