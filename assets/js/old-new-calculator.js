// The old-vs-new calculator (_includes/old-new-calculator.html): what euros put into cash, a bank deposit, German bonds,
// gold, stocks or Bitcoin would be worth today. Only that include loads this file. Without it, the include still shows
// the default case, worked out ahead of time by scripts/update-old-new-data.py, with the rules.
// Everything comes from assets/data/old-new.json on this site, which that script writes. Nothing else is requested.
// The formatting and drawing helpers follow oil-widgets.js, so the two read and look the same.
(function () {
  if (window.OldNewCalculator) return;  // every include adds this script, so a page with several calculators runs it once

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MINUS = '−';
  var DAY = 86400000;
  var SVG = 'http://www.w3.org/2000/svg';
  var DEFAULTS = { lump: 1000, monthly: 100 };
  var BREAK = 2.5;  // when the top asset is worth this many times the next, its bar runs off the scale

  // Formatting: en-GB, euros ("€1,234"), months like "March 2008"

  function num(n, dp) {
    return n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function signed(n, dp, text) {
    var rounded = Number(Math.abs(n).toFixed(dp));
    if (rounded === 0) return text;
    return (n < 0 ? MINUS : '+') + text;
  }
  function money(n, withSign) {
    var text = '€' + num(Math.abs(n), 0);
    if (withSign) return signed(n, 0, text);
    return n < 0 && Number(Math.abs(n).toFixed(0)) !== 0 ? MINUS + text : text;
  }
  function pct(x, dp, withSign) {
    var text = num(Math.abs(x * 100), dp) + '%';
    if (withSign) return signed(x * 100, dp, text);
    return x < 0 && Number(Math.abs(x * 100).toFixed(dp)) !== 0 ? MINUS + text : text;
  }
  function short(v) {
    if (v >= 1e6) return '€' + num(v / 1e6, v >= 1e7 ? 0 : 1) + 'm';
    if (v >= 1e4) return '€' + num(v / 1e3, 0) + 'k';
    return '€' + num(v, 0);
  }
  function monthName(key) { return MONTHS[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4); }
  // Every value is at the end of its month, so a month's date is its last day
  function monthEnd(key) { return Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0); }

  // Data -----------------------------------------------------------------------------------------

  var loading = {};
  function load(url) {
    if (!loading[url]) {
      loading[url] = fetch(url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(prepare);
    }
    return loading[url];
  }

  function prepare(raw) {
    var ids = raw.assets.map(function (a) { return a.id; });
    var cols = ids.map(function (id) { return raw.cols.indexOf(id); }), hicp = raw.cols.indexOf('hicp');
    var months = raw.rows.map(function (r) {
      var levels = {};
      ids.forEach(function (id, j) { levels[id] = r[cols[j]]; });
      return { key: r[0], hicp: r[hicp], levels: levels };
    });
    var index = {};
    months.forEach(function (m, i) { index[m.key] = i; });
    return { raw: raw, assets: raw.assets, months: months, index: index };
  }

  // The calculator's maths -------------------------------------------------------------------------
  // o: { mode: 'lump' or 'monthly', amount, start: 'YYYY-MM', real: true or false }
  // Each purchase is at the end of a month (once, for a lump sum, at the end of the start month), at that month's value;
  // the value is checked at the end of every month after it. Adjusted for inflation, every figure is in today's money:
  // a value at the end of a month times the latest HICP over that month's.

  function calculate(d, o) {
    var start = d.index[o.start];
    if (start == null) throw new Error('No data for ' + o.start);
    var months = d.months, last = months.length - 1, ref = months[last].hicp, amount = o.amount;
    var buys = [];
    for (var b = start; b <= (o.mode === 'monthly' ? last : start); b++) buys.push(b);
    var putIn = amount * buys.length, putInReal = 0;
    buys.forEach(function (i) { putInReal += amount * ref / months[i].hicp; });
    var base = o.real ? putInReal : putIn, days = (monthEnd(months[last].key) - monthEnd(o.start)) / DAY;

    var results = [], unavailable = [];
    d.assets.forEach(function (a) {
      if (months[start].levels[a.id] == null) { unavailable.push(a); return; }
      var units = 0, paid = 0, paidReal = 0, next = 0, points = [], worst = null, peak = null, fall = { gap: 0 };
      for (var i = start; i <= last; i++) {
        var m = months[i], level = m.levels[a.id], deflate = o.real ? ref / m.hicp : 1;
        if (buys[next] === i) {
          units += amount / level;
          paid += amount;
          paidReal += amount * ref / m.hicp;
          next++;
        }
        var value = units * level * deflate, against = o.real ? paidReal : paid, gap = value / against - 1;
        points.push({ key: m.key, value: value, putIn: against });
        if (!worst || gap < worst.gap) worst = { key: m.key, gap: gap, value: value, against: against };
        // The biggest fall in the asset itself, from a high to a later low, whatever was being bought
        var price = level * deflate;
        if (!peak || price > peak.price) peak = { key: m.key, price: price };
        if (price / peak.price - 1 < fall.gap) fall = { gap: price / peak.price - 1, from: peak.key, to: m.key };
      }
      var end = points[points.length - 1].value, annual = null;
      if (days >= 365) {
        annual = o.mode === 'lump'
          ? Math.pow(end / base, 365 / days) - 1
          : xirr(buys.map(function (i) { return [monthEnd(months[i].key), -(o.real ? amount * ref / months[i].hicp : amount)]; })
            .concat([[monthEnd(months[last].key), end]]));
      }
      results.push({ asset: a, value: end, gain: end - base, gainPct: end / base - 1, annual: annual, fall: fall, worst: worst, points: points });
    });
    results.sort(function (x, y) { return y.value - x.value; });
    return { putIn: putIn, putInReal: putInReal, base: base, buys: buys.length, to: months[last].key, days: days, results: results, unavailable: unavailable };
  }

  // Money-weighted annual return, as in oil-widgets.js: the yearly rate r at which the payments, compounded to the end,
  // equal the value. Flows are [time in ms, amount] with payments negative; years are 365 days, as in Excel's XIRR.
  function xirr(flows) {
    var t0 = flows[0][0];
    var years = flows.map(function (f) { return (f[0] - t0) / DAY / 365; });
    var npv = function (r) {
      var sum = 0;
      for (var i = 0; i < flows.length; i++) sum += flows[i][1] / Math.pow(1 + r, years[i]);
      return sum;
    };
    var lo = -0.9999, hi = 10;
    if (npv(lo) * npv(hi) > 0) return null;
    for (var k = 0; k < 200 && hi - lo > 1e-12; k++) {
      var mid = (lo + hi) / 2;
      if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  // Drawing helpers, as in oil-widgets.js -------------------------------------------------------------

  function svgEl(name, attrs, parent) {
    var node = document.createElementNS(SVG, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function niceStep(span, count) {
    var step = Math.pow(10, Math.floor(Math.log(span / count) / Math.LN10)), err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    return step;
  }

  function yScale(values, top, bottom, count, headroom) {
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var hi = max * (1 + headroom), lo = min > max * 0.45 ? min * 0.9 : 0;
    var step = niceStep(hi - lo || 1, count);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    var ticks = [];
    for (var v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v / step) * step);
    return { ticks: ticks, at: function (v) { return bottom - (v - lo) / (hi - lo) * (bottom - top); } };
  }

  // Year ticks along the time axis, spaced at least minGap pixels apart
  function yearTicks(t0, t1, left, right, minGap) {
    var x = function (t) { return left + (t - t0) / (t1 - t0 || 1) * (right - left); };
    var out = [], y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
    var perYear = (right - left) / ((t1 - t0 || DAY) / DAY / 365.25), step = [1, 2, 5, 10].filter(function (s) { return s * perYear >= minGap; })[0] || 20;
    for (var yr = Math.ceil((y0 + 1) / step) * step; yr <= y1; yr += step) out.push({ x: x(Date.UTC(yr, 0, 1)), label: String(yr) });
    return out;
  }

  function drawAxes(svg, y, xticks, left, right, bottom) {
    y.ticks.forEach(function (v) {
      var py = Math.round(y.at(v)) + 0.5;
      svgEl('line', { class: v === y.ticks[0] && v === 0 ? 'oil-axis' : 'oil-grid', x1: left, x2: right, y1: py, y2: py }, svg);
      svgEl('text', { class: 'oil-tick', x: left - 8, y: py, dy: '0.32em', 'text-anchor': 'end' }, svg).textContent = short(v);
    });
    xticks.forEach(function (t) {
      svgEl('line', { class: 'oil-axis', x1: Math.round(t.x) + 0.5, x2: Math.round(t.x) + 0.5, y1: bottom, y2: bottom + 5 }, svg);
      svgEl('text', { class: 'oil-tick', x: t.x, y: bottom + 19, 'text-anchor': 'middle' }, svg).textContent = t.label;
    });
  }

  function pathFrom(points, step) {
    return points.map(function (p, i) {
      if (!i) return 'M' + p[0].toFixed(1) + ',' + p[1].toFixed(1);
      return step ? 'H' + p[0].toFixed(1) + 'V' + p[1].toFixed(1) : 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1);
    }).join('');
  }

  // Redraw when the node changes size, at most once a frame. Unlike oil-widgets.js, height counts too: side by side
  // with the ranking, the chart grows and shrinks with it.
  function onResize(node, draw) {
    var width = node.clientWidth, height = node.clientHeight, queued = false;
    var check = function () {
      queued = false;
      if (node.clientWidth !== width || node.clientHeight !== height) { width = node.clientWidth; height = node.clientHeight; draw(); }
    };
    var queue = function () { if (!queued) { queued = true; requestAnimationFrame(check); } };
    if (window.ResizeObserver) new ResizeObserver(queue).observe(node);
    else window.addEventListener('resize', queue);
  }

  function el(tag, cls, text, parent) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  // The calculator ---------------------------------------------------------------------------------

  function parseAmount(text) {
    var clean = String(text).replace(/[\s,€]/g, '');
    if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
    var n = parseFloat(clean);
    return n >= 1 && n <= 100000000 ? n : null;
  }

  function init(root) {
    var form = root.querySelector('[data-form]'), results = root.querySelector('[data-results]');
    var out = function (name) { return root.querySelector('[data-out="' + name + '"]'); };
    var amountInput = root.querySelector('[data-amount]'), amountError = root.querySelector('[data-amount-error]');
    var monthSelect = root.querySelector('[data-month]'), yearSelect = root.querySelector('[data-year]');
    var list = root.querySelector('[data-list]'), plot = root.querySelector('[data-plot]');
    var d, mode = 'lump', last, liveTimer, state = { r: null, o: null, pick: null }, chart = null;

    load(root.getAttribute('data-src')).then(function (data) {
      d = data;
      var latest = d.months[d.months.length - 1].key;
      last = { year: +latest.slice(0, 4), month: +latest.slice(5, 7) };
      form.hidden = false;
      results.hidden = false;
      root.querySelectorAll('[data-fallback]').forEach(function (n) { n.hidden = true; });
      form.addEventListener('submit', function (e) { e.preventDefault(); update(); });
      form.addEventListener('change', update);
      amountInput.addEventListener('input', update);
      list.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-asset]');
        if (!b) return;
        state.pick = b.getAttribute('data-asset');
        list.querySelectorAll('button[data-asset]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        renderPick();
      });
      chart = makeChart(plot);
      onResize(plot, function () { chart.draw(); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { chart.draw(); });
      update();
    }).catch(function () {
      var fb = root.querySelector('p[data-fallback]');
      if (fb) fb.insertAdjacentHTML('beforeend', ' <span class="oil-error">The calculator couldn’t load its data.</span>');
    });

    function radio(name) {
      var checked = form.querySelector('input[name="' + name + '"]:checked');
      return checked ? checked.value : null;
    }

    function update() {
      var newMode = radio('mode');
      // Switching between a lump sum and monthly buying swaps in that mode's default, unless the reader typed their own amount
      if (newMode !== mode) {
        if (parseAmount(amountInput.value) === DEFAULTS[mode]) amountInput.value = num(DEFAULTS[newMode], 0);
        mode = newMode;
      }
      root.querySelector('[data-amount-label]').textContent = mode === 'monthly' ? 'Amount each month' : 'Amount';

      var year = +yearSelect.value, month = +monthSelect.value;
      Array.prototype.forEach.call(monthSelect.options, function (opt) { opt.disabled = year === last.year && +opt.value > last.month; });
      if (year === last.year && month > last.month) { month = last.month; monthSelect.value = String(month); }

      var amount = parseAmount(amountInput.value);
      amountInput.setAttribute('aria-invalid', amount == null ? 'true' : 'false');
      amountError.textContent = amount == null ? 'Enter an amount of at least €1, for example ' + num(DEFAULTS[mode], 0) + '.' : '';
      results.hidden = amount == null;
      if (amount == null) return;

      var o = { mode: mode, amount: amount, start: year + (month < 10 ? '-0' : '-') + month, real: radio('real') === 'yes' }, r;
      try {
        r = calculate(d, o);
      } catch (e) {
        results.hidden = true;
        amountError.textContent = 'Sorry, the calculator has no data for that choice.';
        return;
      }
      state.r = r;
      state.o = o;
      render();
    }

    function render() {
      var r = state.r, o = state.o, today = monthName(r.to), when = monthName(o.start);
      out('putin').textContent = r.buys > 1
        ? 'You put in ' + money(o.amount) + ' at the end of every month from ' + when + ' to ' + today + ': ' + money(r.putIn) + ' in all' +
          (o.real ? ', or ' + money(r.putInReal) + ' in today’s money.' : '.')
        : 'You put in ' + money(o.amount) + ' at the end of ' + when + (o.real ? ', which is ' + money(r.putInReal) + ' in today’s money.' : '.');
      out('ranked').textContent = 'Ranked by value at the end of ' + today + (o.real ? ', in today’s money' : '');

      // The bars run from €0 on one scale, unless the top asset dwarfs the rest: then its bar runs off the end
      var top = r.results[0], second = r.results[1], broken = second && top.value > BREAK * Math.max(second.value, r.base);
      var scale = broken ? Math.max(second.value, r.base) * 1.3 : Math.max(top.value, r.base) * 1.04;
      if (!r.results.some(function (x) { return x.asset.id === state.pick; })) state.pick = null;
      var pick = state.pick || top.asset.id;

      list.textContent = '';
      r.results.forEach(function (x, i) {
        var li = el('li', 'onc-row', null, list);
        var b = el('button', 'onc-pick', null, li);
        b.type = 'button';
        b.setAttribute('data-asset', x.asset.id);
        b.setAttribute('aria-pressed', x.asset.id === pick ? 'true' : 'false');
        el('span', 'onc-name', x.asset.name, b);
        el('span', 'onc-value', money(x.value), b);
        var track = el('span', 'onc-track', null, b);
        track.setAttribute('aria-hidden', 'true');
        var bar = el('span', 'onc-bar' + (broken && i === 0 ? ' is-broken' : ''), null, track);
        bar.style.width = Math.min(100, x.value / scale * 100) + '%';
        el('span', 'onc-put', null, track).style.left = (r.base / scale * 100) + '%';
        var meta = [];
        meta.push(x.annual == null ? pct(x.gainPct, 0, true) + ' in all' : pct(x.annual, 1) + ' a year');
        meta.push(x.fall.gap > -0.005 ? 'never fell' : 'biggest fall ' + pct(x.fall.gap, 0));
        el('span', 'onc-meta', meta.join(' · '), b);
        el('span', 'visually-hidden', '. Show its chart', b);
      });
      out('scale-note').textContent = broken ? top.asset.name + ' rose so far that its bar is cut short.' : '';
      out('unavailable').textContent = r.unavailable.map(function (a) {
        return a.name + ' isn’t included: its figures start in ' + monthName(a.from) + '.';
      }).join(' ');
      out('annual-note').textContent = r.days < 365 ? 'A yearly rate needs at least a year of history, so each shows its gain or loss in all.'
        : o.mode === 'lump'
          ? '“A year” is the steady yearly growth that would turn what you put in into what it’s worth' + (o.real ? ', after inflation.' : '.')
          : '“A year” is money-weighted (XIRR): each payment counts only from the month it went in' + (o.real ? '. It’s after inflation.' : '.');
      renderPick();

      // One short sentence for screen readers, once the reader stops typing
      clearTimeout(liveTimer);
      liveTimer = setTimeout(function () {
        var low = r.results[r.results.length - 1];
        out('live').textContent = money(o.amount) + (o.mode === 'monthly' ? ' a month from ' : ' put in at the end of ') + when + ' would be worth most in ' +
          top.asset.name + ', ' + money(top.value) + ', and least in ' + low.asset.name + ', ' + money(low.value) + (o.real ? ', in today’s money.' : '.');
      }, 700);
    }

    function renderPick() {
      var r = state.r, o = state.o, x = null;
      r.results.forEach(function (y) { if (y.asset.id === (state.pick || r.results[0].asset.id)) x = y; });
      var name = x.asset.short, unit = o.real ? ', in today’s money' : '';
      out('chart-title').textContent = 'Your ' + name + ', ' + monthName(o.start) + ' to ' + monthName(r.to) + unit;
      out('key-value').textContent = 'Value of your ' + name;
      var w = x.worst;
      out('worst').textContent = Number((-w.gap * 100).toFixed(0)) > 0
        ? 'The worst moment: at the end of ' + monthName(w.key) + ' your ' + name + ' was worth ' + money(w.value) + ', ' + pct(-w.gap, 0) + ' less than the ' +
          money(w.against) + (o.real ? ' you’d put in, in today’s money.' : ' you’d put in.')
        : 'Your ' + name + ' was never worth less than ' + (o.real ? 'the money you’d put in, in today’s money' : 'the money you’d put in') + ', checked at the end of each month.';
      chart.set(x, o);
    }
  }

  // The chart of one asset: its value against the money put in, with a crosshair and readout -----------

  function makeChart(plot) {
    var tip = el('div', 'oil-tip'), x, o, pts, layout, svg, active = null;
    tip.hidden = true;
    tip.setAttribute('aria-hidden', 'true');
    plot.classList.add('is-live');
    plot.setAttribute('tabindex', '0');
    plot.setAttribute('role', 'slider');
    plot.addEventListener('keydown', function (e) {
      var lastI = pts.length - 1, i = active == null ? lastI : active;
      var keys = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, PageUp: i + 12, PageDown: i - 12, Home: 0, End: lastI };
      if (e.key === 'Escape') { hide(); return; }
      if (!(e.key in keys)) return;
      e.preventDefault();
      show(Math.max(0, Math.min(lastI, keys[e.key])));
    });
    plot.addEventListener('focus', function () { if (active == null) show(pts.length - 1); });
    plot.addEventListener('blur', function () { hide(); });
    plot.addEventListener('pointerdown', onPointer);
    plot.addEventListener('pointermove', onPointer);
    plot.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && document.activeElement !== plot) hide(); });
    plot.addEventListener('pointercancel', function () { hide(); });
    document.addEventListener('pointerdown', function (e) { if (!plot.contains(e.target) && document.activeElement !== plot) hide(); });

    function set(result, options) {
      x = result;
      o = options;
      pts = x.points.map(function (p) { return { key: p.key, t: monthEnd(p.key), value: p.value, putIn: p.putIn }; });
      active = null;
      plot.setAttribute('aria-label', 'Chart of the value of your ' + x.asset.short + ' against the money you put in' + (o.real ? ', in today’s money' : '') +
        '. Use the arrow keys to read each month.');
      plot.setAttribute('aria-valuemin', '0');
      plot.setAttribute('aria-valuemax', String(pts.length - 1));
      draw();
      plot.setAttribute('aria-valuenow', String(pts.length - 1));
      plot.setAttribute('aria-valuetext', describe(pts.length - 1).text);
    }

    function draw() {
      if (!pts) return;
      var w = plot.clientWidth, h = plot.clientHeight, narrow = w < 480;
      var left = narrow ? 50 : 58, right = w - 8, top = 10, bottom = h - 28;
      var t0 = pts[0].t, t1 = pts[pts.length - 1].t;
      var px = function (t) { return left + (t - t0) / (t1 - t0 || 1) * (right - left); };
      var all = [0];
      pts.forEach(function (p) { all.push(p.value, p.putIn); });
      var y = yScale(all, top, bottom, narrow ? 3 : 4, 0.05);
      layout = { x: px, y: y, w: w, h: h, top: top, bottom: bottom, narrow: narrow };
      if (svg) svg.remove();
      svg = svgEl('svg', { class: 'oil-svg', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true', focusable: 'false' });
      drawAxes(svg, y, yearTicks(t0, t1, left, right, narrow ? 44 : 56), left, right, bottom);
      var at = function (k) { return pts.map(function (p) { return [px(p.t), y.at(p[k])]; }); };
      svgEl('path', { class: 'oil-put', d: pathFrom(at('putIn'), true) }, svg);
      svgEl('path', { class: 'oil-line', d: pathFrom(at('value')) }, svg);
      layout.cross = svgEl('line', { class: 'oil-cross', x1: 0, x2: 0, y1: top - 6, y2: bottom, visibility: 'hidden' }, svg);
      layout.dot = svgEl('circle', { class: 'oil-dot', r: 4.5, visibility: 'hidden' }, svg);
      plot.insertBefore(svg, plot.firstChild);
      plot.appendChild(tip);
      if (active != null) show(Math.min(active, pts.length - 1));
      else tip.hidden = true;
    }

    function describe(i) {
      var p = pts[i], gap = p.value / p.putIn - 1, name = 'End of ' + monthName(p.key);
      var main = money(p.value) + (o.real ? ' in today’s money' : '');
      var sub = 'Put in ' + money(p.putIn) + (Number((gap * 100).toFixed(0)) ? ', so ' + pct(Math.abs(gap), 0) + (gap < 0 ? ' down' : ' up') : '');
      return { p: p, name: name, main: main, sub: sub, text: name + ': ' + main + '. ' + sub + '.' };
    }

    function show(i) {
      active = i;
      var info = describe(i), p = info.p, cx = layout.x(p.t), cy = layout.y.at(p.value);
      layout.cross.setAttribute('x1', cx);
      layout.cross.setAttribute('x2', cx);
      layout.cross.setAttribute('visibility', 'visible');
      layout.dot.setAttribute('cx', cx);
      layout.dot.setAttribute('cy', cy);
      layout.dot.setAttribute('visibility', 'visible');
      tip.textContent = '';
      el('p', 'oil-tip-date', info.name, tip);
      el('p', 'oil-tip-value', info.main, tip);
      el('p', 'oil-tip-sub', info.sub, tip);
      tip.hidden = false;
      // On phones the readout sits just below the chart, full width, so it never hides the line being read
      tip.classList.toggle('is-below', layout.narrow);
      if (layout.narrow) {
        tip.style.left = '0px';
        tip.style.top = (layout.h + 4) + 'px';
      } else {
        var tw = tip.offsetWidth, gap = 14, tx = cx + gap;
        if (tx + tw > layout.w) tx = cx - gap - tw;
        tip.style.left = Math.max(0, Math.min(layout.w - tw, tx)) + 'px';
        tip.style.top = (cy < layout.top + tip.offsetHeight + 16 ? layout.bottom - tip.offsetHeight - 8 : 4) + 'px';
      }
      plot.setAttribute('aria-valuenow', String(i));
      plot.setAttribute('aria-valuetext', info.text);
    }

    function hide() {
      active = null;
      if (!layout) return;
      tip.hidden = true;
      layout.cross.setAttribute('visibility', 'hidden');
      layout.dot.setAttribute('visibility', 'hidden');
    }

    // Hover, tap and drag. The plot only claims sideways drags (touch-action: pan-y), so vertical swipes still scroll the page.
    function onPointer(e) {
      if (!layout || (e.type === 'pointermove' && e.pointerType !== 'mouse' && e.buttons === 0)) return;
      var rect = plot.getBoundingClientRect(), cx = e.clientX - rect.left, lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (layout.x(pts[mid].t) < cx) lo = mid; else hi = mid;
      }
      show(Math.abs(layout.x(pts[lo].t) - cx) <= Math.abs(layout.x(pts[hi].t) - cx) ? lo : hi);
    }

    return { set: set, draw: draw };
  }

  window.OldNewCalculator = { prepare: prepare, calculate: calculate, xirr: xirr, load: load };
  var start = function () { document.querySelectorAll('[data-old-new]').forEach(init); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
