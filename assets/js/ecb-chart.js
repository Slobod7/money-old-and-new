/* The ECB chart's readout (_includes/ecb-rates-chart.html). Jekyll draws the chart as inline SVG, and it works without
   this script. This adds a crosshair and the month's four figures on hover, tap or drag, and with the arrow keys.
   It reads the figures from the chart's own table, so it makes no requests and stores nothing. */
(function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // In the table's column order: each series' name, its panel and its line style (as in the include)
  var SERIES = [
    { name: 'Headline inflation', panel: 'inflation', cls: 'is-soft' },
    { name: 'Core inflation', panel: 'inflation', cls: 'is-strong' },
    { name: 'Main rate', panel: 'rates', cls: 'is-soft' },
    { name: 'Deposit rate', panel: 'rates', cls: 'is-strong' }
  ];
  var SVG = 'http://www.w3.org/2000/svg';

  function monthName(key) {
    return MONTHS[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4);
  }

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function init(root) {
    var plots = root.querySelector('[data-plots]');
    var panels = { inflation: root.querySelector('[data-panel="inflation"]'), rates: root.querySelector('[data-panel="rates"]') };
    var desc = root.querySelector('p[hidden][id]');
    var n = +root.getAttribute('data-months');
    var s = root.getAttribute('data-scales').split(' ').map(Number);
    var scales = { inflation: [s[0], s[1]], rates: [s[2], s[3]] };
    var episodes = root.getAttribute('data-episodes').split(';').map(function (e) {
      var p = e.split(' ');
      return { x0: +p[0], x1: +p[1], label: p[2] };
    });
    var rows = [].slice.call(root.querySelectorAll('tbody tr[data-month]')).reverse().map(function (tr) {
      var text = [].map.call(tr.querySelectorAll('td'), function (td) { return td.textContent; });
      return {
        key: tr.getAttribute('data-month'),
        text: text,
        values: text.map(function (t) { return parseFloat(t.replace('−', '-')); })
      };
    });
    if (!plots || !panels.inflation || !panels.rates || rows.length !== n) return;

    var cross = [panels.inflation, panels.rates].map(function (p) { return el('span', 'ecb-cross', p); });
    var dots = SERIES.map(function (series) {
      return series.panel === 'inflation' ? el('span', 'ecb-dot ' + series.cls, panels.inflation) : null;
    });
    var tip = el('div', 'oil-tip ecb-tip', plots);
    tip.setAttribute('aria-hidden', 'true');
    var active = null;
    hide();

    plots.classList.add('is-live');
    plots.setAttribute('tabindex', '0');
    plots.setAttribute('role', 'slider');
    plots.setAttribute('aria-label', 'ECB rates and euro area inflation by month. Use the arrow keys to read each month.');
    if (desc) plots.setAttribute('aria-describedby', desc.id);
    plots.setAttribute('aria-valuemin', '0');
    plots.setAttribute('aria-valuemax', String(n - 1));
    plots.setAttribute('aria-valuenow', String(n - 1));
    plots.setAttribute('aria-valuetext', spoken(n - 1));

    plots.addEventListener('keydown', onKey);
    plots.addEventListener('focus', function () { if (active == null) show(n - 1); });
    plots.addEventListener('blur', hide);
    plots.addEventListener('pointerdown', onPointer);
    plots.addEventListener('pointermove', onPointer);
    plots.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && document.activeElement !== plots) hide(); });
    plots.addEventListener('pointercancel', hide);  // the browser took the gesture for scrolling
    document.addEventListener('pointerdown', function (e) { if (!plots.contains(e.target) && document.activeElement !== plots) hide(); });

    function episodeAt(i) {
      for (var k = 0; k < episodes.length; k++) if (i + 0.5 >= episodes[k].x0 && i + 0.5 <= episodes[k].x1) return episodes[k];
      return null;
    }

    function spoken(i) {
      var r = rows[i], ep = episodeAt(i);
      return monthName(r.key) + ': ' + SERIES.map(function (series, k) { return series.name.toLowerCase() + ' ' + r.text[k]; }).join(', ') +
        (ep ? '. Shaded: the ' + ep.label + ' hikes.' : '.');
    }

    function show(i) {
      active = i;
      var r = rows[i], left = (i + 0.5) / n * 100, ep = episodeAt(i);
      cross.forEach(function (c) { c.style.left = left + '%'; c.hidden = false; });
      var top = 100;
      SERIES.forEach(function (series, k) {
        if (!dots[k]) return;
        var sc = scales[series.panel], y = (sc[1] - r.values[k]) / (sc[1] - sc[0]) * 100;
        dots[k].style.left = left + '%';
        dots[k].style.top = y + '%';
        dots[k].hidden = false;
        top = Math.min(top, y);
      });

      tip.textContent = '';
      el('p', 'oil-tip-date', tip).textContent = monthName(r.key);
      SERIES.forEach(function (series, k) {
        var row = el('p', 'ecb-tip-row', tip);
        var key = document.createElementNS(SVG, 'svg');
        key.setAttribute('class', 'oil-swatch');
        key.setAttribute('viewBox', '0 0 24 10');
        var line = document.createElementNS(SVG, 'line');
        line.setAttribute('class', 'ecb-line ' + series.cls);
        [['x1', 1], ['x2', 23], ['y1', 5], ['y2', 5]].forEach(function (a) { line.setAttribute(a[0], a[1]); });
        key.appendChild(line);
        row.appendChild(key);
        el('strong', 'ecb-tip-value', row).textContent = r.text[k];
        row.appendChild(document.createTextNode(series.name));
      });
      if (ep) el('p', 'oil-tip-event', tip).textContent = 'Shaded: the ' + ep.label + ' hikes';
      tip.hidden = false;

      // On phones the readout sits just below the chart, full width, so it never hides the lines being read
      var narrow = plots.clientWidth < 520;
      tip.classList.toggle('is-below', narrow);
      if (narrow) {
        tip.style.left = '0px';
        tip.style.top = (plots.offsetHeight + 4) + 'px';
      } else {
        var p = panels.inflation, px = p.offsetLeft + p.offsetWidth * left / 100, tw = tip.offsetWidth, gap = 14;
        var tx = px + gap + tw > plots.clientWidth ? px - gap - tw : px + gap;
        tip.style.left = Math.max(0, tx) + 'px';
        // Beside the crosshair, at the top of the inflation panel, or lower down if the lines are up there
        var lineTop = p.offsetTop + p.offsetHeight * top / 100;
        tip.style.top = (lineTop < p.offsetTop + tip.offsetHeight + 16 ? p.offsetTop + p.offsetHeight - tip.offsetHeight - 8 : p.offsetTop + 4) + 'px';
      }
      plots.setAttribute('aria-valuenow', String(i));
      plots.setAttribute('aria-valuetext', spoken(i));
    }

    function hide() {
      active = null;
      tip.hidden = true;
      cross.concat(dots).forEach(function (d) { if (d) d.hidden = true; });
    }

    function onKey(e) {
      var last = n - 1, i = active == null ? last : active;
      var keys = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, PageUp: i + 12, PageDown: i - 12, Home: 0, End: last };
      if (e.key === 'Escape') { hide(); return; }
      if (!(e.key in keys)) return;
      e.preventDefault();
      show(Math.max(0, Math.min(last, keys[e.key])));
    }

    // Hover, tap and drag. The chart only claims sideways drags (touch-action: pan-y), so vertical swipes still scroll the page.
    function onPointer(e) {
      if (e.type === 'pointermove' && e.pointerType !== 'mouse' && e.buttons === 0) return;
      var rect = panels.inflation.getBoundingClientRect();
      var i = Math.floor((e.clientX - rect.left) / rect.width * n);
      show(Math.max(0, Math.min(n - 1, i)));
    }
  }

  function start() {
    document.querySelectorAll('[data-ecb-chart]').forEach(init);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
