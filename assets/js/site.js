// Small enhancements. Every page works without this file.
(function () {
  // Copy link: shown only where the clipboard is available, with a spoken confirmation.
  var copy = document.querySelector('[data-copy-link]');
  var status = document.querySelector('[data-copy-status]');
  if (copy && status && navigator.clipboard && window.isSecureContext) {
    copy.hidden = false;
    copy.addEventListener('click', function () {
      navigator.clipboard.writeText(location.href.split('#')[0]).then(function () {
        status.textContent = 'Link copied';
        setTimeout(function () { status.textContent = ''; }, 3000);
      });
    });
  }

  // Phones restyle .stack tables as blocks, which drops table semantics in some screen readers.
  // Explicit roles keep rows, headers and cells announced.
  document.querySelectorAll('table.stack').forEach(function (table) {
    table.setAttribute('role', 'table');
    table.querySelectorAll('thead, tbody, tfoot').forEach(function (el) { el.setAttribute('role', 'rowgroup'); });
    table.querySelectorAll('tr').forEach(function (el) { el.setAttribute('role', 'row'); });
    table.querySelectorAll('th[scope="col"]').forEach(function (el) { el.setAttribute('role', 'columnheader'); });
    table.querySelectorAll('th[scope="row"]').forEach(function (el) { el.setAttribute('role', 'rowheader'); });
    table.querySelectorAll('td').forEach(function (el) { el.setAttribute('role', 'cell'); });
  });

  // Latest articles carousel: the arrows step one card, and every 5 seconds it moves on by itself, wrapping at the ends.
  // Autoplay pauses while the pointer is over it or keyboard focus is inside it, stops for good once a reader
  // swipes it on a touch screen, and never runs for readers who ask for reduced motion.
  var carousel = document.querySelector('[data-carousel]');
  var track = carousel && carousel.querySelector('[data-carousel-track]');
  var arrows = carousel && carousel.querySelector('[data-carousel-arrows]');
  if (track && arrows && track.firstElementChild) {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hovered = false, focused = false, stopped = reduce, timer;

    var overflows = function () { return track.scrollWidth - track.clientWidth > 4; };
    var move = function (dir) {
      var max = track.scrollWidth - track.clientWidth;
      var step = track.firstElementChild.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0);
      // Count from the nearest whole card, so quick repeated clicks still land on a card.
      var left = (Math.round(track.scrollLeft / step) + dir) * step;
      if (dir > 0 && track.scrollLeft >= max - 4) left = 0;
      if (dir < 0 && track.scrollLeft <= 4) left = max;
      track.scrollTo({ left: left, behavior: reduce ? 'auto' : 'smooth' });
    };
    var schedule = function () {
      clearTimeout(timer);
      if (stopped) return;
      timer = setTimeout(function () {
        if (!hovered && !focused && !document.hidden && overflows()) move(1);
        schedule();
      }, 5000);
    };
    // A mouse click also focuses the arrow, so only keyboard focus counts as a pause.
    var keyboardFocus = function (el) {
      try { return el.matches(':focus-visible'); } catch (e) { return true; }
    };
    var update = function () { arrows.hidden = !overflows(); };

    arrows.querySelector('[data-carousel-prev]').addEventListener('click', function () { move(-1); schedule(); });
    arrows.querySelector('[data-carousel-next]').addEventListener('click', function () { move(1); schedule(); });
    carousel.addEventListener('mouseenter', function () { hovered = true; });
    carousel.addEventListener('mouseleave', function () { hovered = false; schedule(); });
    carousel.addEventListener('focusin', function (e) { focused = keyboardFocus(e.target); });
    carousel.addEventListener('focusout', function (e) {
      if (!carousel.contains(e.relatedTarget)) { focused = false; schedule(); }
    });
    track.addEventListener('touchstart', function () { stopped = true; clearTimeout(timer); }, { passive: true });
    window.addEventListener('resize', update);
    update();
    schedule();
  }
})();
