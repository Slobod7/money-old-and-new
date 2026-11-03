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
  function money(n, withSign, currency) {
    var text = (currency === 'USD' ? 'US$' : '€') + num(Math.abs(n), 0);
    if (withSign) return signed(n, 0, text);
    return n < 0 && Number(Math.abs(n).toFixed(0)) !== 0 ? MINUS + text : text;
  }
  function pct(x, dp, withSign) {
    var text = num(Math.abs(x * 100), dp) + '%';
    if (withSign) return signed(x * 100, dp, text);
    return x < 0 && Number(Math.abs(x * 100).toFixed(dp)) !== 0 ? MINUS + text : text;
  }
  function short(v, currency) {
    var symbol = currency === 'USD' ? '$' : '€';
    if (v >= 1e6) return symbol + num(v / 1e6, v >= 1e7 ? 0 : 1) + 'm';
    if (v >= 1e4) return symbol + num(v / 1e3, 0) + 'k';
    return symbol + num(v, 0);
  }
  function monthName(key) { return MONTHS[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4); }
  // Every value is at the end of its month, so a month's date is its last day
  function monthEnd(key) { return Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0); }
  function dayName(key) { return +key.slice(8) + ' ' + monthName(key); }

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

  function prepare(raw, reporting) {
    var ids = raw.assets.map(function (a) { return a.id; });
    var cols = ids.map(function (id) { return raw.cols.indexOf(id); }), hicp = raw.cols.indexOf('hicp');
    var months = raw.rows.map(function (r) {
      var levels = {};
      ids.forEach(function (id, j) { levels[id] = r[cols[j]]; });
      var fx = reporting && reporting.rows.find(function (x) { return x[0] === r[0]; });
      return { key: r[0], hicp: r[hicp], levels: levels, fxEnd: fx && fx[1], fxAverage: fx && fx[2], cpiUS: fx && fx[3] };
    });
    var supplement = {};
    if (raw.gold) raw.gold.rows.forEach(function (r) {
      var entry = {};
      raw.gold.cols.forEach(function (c, i) { entry[c] = r[i]; });
      supplement[r[0]] = entry;
    });
    months.forEach(function (m) {
      var g = supplement[m.key] || {};
      m.goldUSD = g.usd;
      m.cpi = g.cpi;
    });
    var index = {};
    months.forEach(function (m, i) { index[m.key] = i; });
    var assets = raw.assets.map(function (a) {
      return Object.assign({}, a, { name: a.id === 'us' ? 'US broad-market stocks' : a.id === 'europe' ? 'Developed-Europe stocks' : a.name });
    });
    return { raw: raw, assets: assets, months: months, index: index };
  }

  // The calculator's maths -------------------------------------------------------------------------
  // o: { mode: 'lump' or 'monthly', amount, start: 'YYYY-MM', end?: 'YYYY-MM', real: boolean, assets?: [id] }
  // Each purchase is at the end of a month (once, for a lump sum, at the end of the start month), at that month's value;
  // the value is checked at the end of every month after it. Adjusted for inflation, every figure is in the prices of the
  // end month (the latest month when o.end is absent): a value at the end of a month times end-month HICP over that month's.

  function calculate(d, o) {
    var start = d.index[o.start];
    if (start == null) throw new Error('No data for ' + o.start);
    var months = d.months, last = o.end == null ? months.length - 1 : d.index[o.end], amount = o.amount;
    if (last == null || last < start) throw new Error('Choose an end month on or after the start, within the available history.');
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000000 || ['lump', 'monthly'].indexOf(o.mode) < 0) throw new Error('Invalid purchase.');
    for (var h = start; h <= last; h++) {
      if (h > start && monthEnd(months[h].key) !== Date.UTC(+months[h - 1].key.slice(0, 4), +months[h - 1].key.slice(5, 7) + 1, 0)) throw new Error('A month is missing in this window.');
      if (o.real && !(o.gold && o.currency === 'USD' ? Number.isFinite(months[h].cpi) && months[h].cpi > 0 : Number.isFinite(months[h].hicp) && months[h].hicp > 0)) throw new Error('Inflation data is missing in this window.');
    }
    if (o.currency && o.currency !== 'EUR' && o.currency !== 'USD') throw new Error('Unsupported currency.');
    var inflation = function (m) { return o.currency === 'USD' ? (o.gold ? m.cpi : m.cpiUS) : m.hicp; };
    var levelAt = function (m, id) { return o.gold && o.currency === 'USD' && id === 'gold' ? m.goldUSD : m.levels[id] * (o.currency === 'USD' ? (id === 'gold' ? m.fxAverage : m.fxEnd) : 1); };
    var ref = inflation(months[last]);
    if (o.currency === 'USD') for (var v = start; v <= last; v++) {
      if (o.gold ? !(months[v].cpi > 0 && months[v].goldUSD > 0) : !(months[v].cpiUS > 0 && months[v].fxEnd > 0 && months[v].fxAverage > 0)) throw new Error('Currency or US inflation data is missing.');
    }
    var buys = [];
    for (var b = start; b <= (o.mode === 'monthly' ? last : start); b++) buys.push(b);
    var putIn = amount * buys.length, putInReal = 0;
    buys.forEach(function (i) { putInReal += amount * ref / inflation(months[i]); });
    var base = o.real ? putInReal : putIn, days = (monthEnd(months[last].key) - monthEnd(o.start)) / DAY;

    var results = [], unavailable = [];
    d.assets.filter(function (a) { return !o.assets || o.assets.indexOf(a.id) >= 0; }).forEach(function (a) {
      var missing = months.slice(start, last + 1).filter(function (m) { return !(Number.isFinite(m.levels[a.id]) && m.levels[a.id] > 0); });
      if (missing.length) {
        unavailable.push({ id: a.id, name: a.name, from: a.from, missing: missing[0].key });
        return;
      }
      var units = 0, paid = 0, paidReal = 0, next = 0, points = [], worst = null;
      for (var i = start; i <= last; i++) {
        var m = months[i], level = levelAt(m, a.id), deflate = o.real ? ref / inflation(m) : 1;
        if (buys[next] === i) {
          units += amount / level;
          paid += amount;
          paidReal += amount * ref / inflation(m);
          next++;
        }
        var value = units * level * deflate, against = o.real ? paidReal : paid, gap = value / against - 1;
        points.push({ key: m.key, value: value, putIn: against });
        if (!worst || gap < worst.gap) worst = { key: m.key, gap: gap, value: value, against: against };
      }
      var fall = drawdown(d, a.id, o.start, months[last].key, o.real, o.currency, o.gold);
      var end = points[points.length - 1].value, annual = null;
      if (days >= 365) {
        annual = o.mode === 'lump'
          ? Math.pow(end / base, 365 / days) - 1
          : xirr(buys.map(function (i) { return [monthEnd(months[i].key), -(o.real ? amount * ref / inflation(months[i]) : amount)]; })
            .concat([[monthEnd(months[last].key), end]]));
      }
      results.push({ asset: a, value: end, gain: end - base, gainPct: end / base - 1, annual: annual, fall: fall, worst: worst, points: points });
    });
    results.sort(function (x, y) { return y.value - x.value; });
    return { putIn: putIn, putInReal: putInReal, base: base, buys: buys.length, to: months[last].key, days: days, results: results, unavailable: unavailable };
  }

  // Why a chosen window can't run, in words, or null if it can. Dates are never moved to the nearest available month.
  function dateProblem(d, start, end) {
    var first = d.months[0].key, latest = d.months[d.months.length - 1].key;
    var range = 'The data runs from ' + monthName(first) + ' to ' + monthName(latest) + '. Your dates have not been changed.';
    if (d.index[start] == null) return 'There is no data for a start in ' + monthName(start) + '. ' + range;
    if (d.index[end] == null) return 'There is no data for an end in ' + monthName(end) + '. ' + range;
    if (end < start) return 'The end month is before the start month. Choose an end in ' + monthName(start) + ' or later. Your dates have not been changed.';
    return null;
  }

  // Interpretation uses the stored series without changing the calculator's return methodology.
  function inflation(d, amount, start, end) {
    var h0 = d.months[d.index[start]].hicp, h1 = d.months[d.index[end]].hicp;
    return { equivalent: amount * h1 / h0, rise: h1 / h0 - 1, loss: 1 - h0 / h1 };
  }

  function januaryRows(d, end) {
    return d.months.filter(function (m) { return m.key <= end && m.key.slice(5) === '01'; })
      .map(function (m) { return { start: m.key, inflation: inflation(d, 100, m.key, end) }; });
  }

  // A small five-year sample, plus the selected start year and latest January. All end together.
  function startRows(d, selected, end, real) {
    var year = +selected.slice(0, 4), lastYear = +end.slice(0, 4);
    return januaryRows(d, end).filter(function (row) {
      var y = +row.start.slice(0, 4);
      return y % 5 === 0 || y === year || y === lastYear;
    }).map(function (row) {
      var first = d.months[d.index[row.start]], last = d.months[d.index[end]];
      return { start: row.start, months: d.index[end] - d.index[row.start], values: d.assets.map(function (a) {
        // Do not shift unavailable assets to their first date or substitute zero.
        if (first.levels[a.id] == null || last.levels[a.id] == null) return null;
        var value = 100 * last.levels[a.id] / first.levels[a.id];
        return value;
      }), gains: d.assets.map(function (a) {
        if (first.levels[a.id] == null || last.levels[a.id] == null) return null;
        var growth = last.levels[a.id] / first.levels[a.id];
        return growth * (real ? first.hicp / last.hicp : 1) - 1;
      }) };
    });
  }

  function drawdown(d, id, start, end, real, currency, goldPreset) {
    var months = d.months.slice(d.index[start], d.index[end] + 1);
    if (!months.length || months.some(function (m) { return m.levels[id] == null; })) return null;
    var peak, fall = { gap: 0, from: null, to: null, recovery: null }, trough = -1, high;
    var price = function (m) { return (goldPreset && currency === 'USD' && id === 'gold' ? m.goldUSD : m.levels[id] * (currency === 'USD' ? (id === 'gold' ? m.fxAverage : m.fxEnd) : 1)) / (real ? (currency === 'USD' ? (goldPreset ? m.cpi : m.cpiUS) : m.hicp) : 1); };
    months.forEach(function (m, i) {
      var value = price(m);
      if (!peak || value > peak.value) peak = { key: m.key, value: value };
      var gap = value / peak.value - 1;
      if (gap < fall.gap) {
        fall = { gap: gap, from: peak.key, to: m.key, recovery: null };
        trough = i;
        high = peak.value;
      }
    });
    for (var i = trough + 1; trough >= 0 && i < months.length; i++) {
      if (price(months[i]) >= high * (1 - 1e-12)) { fall.recovery = months[i].key; break; }
    }
    return fall;
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
    var lo = -0.999999999, hi = 1;
    while (npv(lo) * npv(hi) > 0 && hi < 1e12) hi = hi * 2 + 1;
    if (npv(lo) * npv(hi) > 0) return null;
    for (var k = 0; k < 200 && hi - lo > 1e-12; k++) {
      var mid = (lo + hi) / 2;
      if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  // Links use a fragment on the existing calculator route, so they create no new indexed page.
  function readPreset(hash) {
    var q = new URLSearchParams(hash.replace(/^#/, ''));
    if (!q.has('view') || q.get('view') === 'bitcoin-gold') return null; // the compact component restores its own fragment
    var o = { view: q.get('view'), amount: parseAmount(q.get('amount')), mode: q.get('mode'),
      start: q.get('start'), end: q.get('end'), real: q.get('real') === 'yes', benchmark: q.get('benchmark') || 'us',
      pick: q.get('asset'), data: q.get('data') };
    // Everything here comes from the address bar: each value must match exactly, or the whole link is refused.
    if (['all', 'gold-stocks'].indexOf(o.view) < 0 || o.amount == null || ['lump', 'monthly'].indexOf(o.mode) < 0 ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(o.start || '') || !/^\d{4}-(0[1-9]|1[0-2])$/.test(o.end || '') ||
        o.end < o.start || ['yes', 'no'].indexOf(q.get('real')) < 0 || ['us', 'europe'].indexOf(o.benchmark) < 0 ||
        (o.pick && ['cash', 'deposit', 'bund', 'gold', 'us', 'europe', 'bitcoin'].indexOf(o.pick) < 0) ||
        (o.data && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(o.data))) {
      throw new Error('This comparison link is invalid. Choose your inputs to start again.');
    }
    return o;
  }
  // Inputs only, never results. The data date lets a later visit say that the source data has changed since the link was made.
  function presetHash(o) {
    var fields = { view: o.view, amount: String(o.amount), mode: o.mode, start: o.start, end: o.end, real: o.real ? 'yes' : 'no' };
    if (o.view === 'gold-stocks') fields.benchmark = o.benchmark;
    fields.asset = o.pick || 'gold';
    if (o.data) fields.data = o.data;
    return '#' + new URLSearchParams(fields).toString();
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

  function drawAxes(svg, y, xticks, left, right, bottom, currency) {
    y.ticks.forEach(function (v) {
      var py = Math.round(y.at(v)) + 0.5;
      svgEl('line', { class: v === y.ticks[0] && v === 0 ? 'oil-axis' : 'oil-grid', x1: left, x2: right, y1: py, y2: py }, svg);
      svgEl('text', { class: 'oil-tick', x: left - 8, y: py, dy: '0.32em', 'text-anchor': 'end' }, svg).textContent = short(v, currency);
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
    var viewSelect = root.querySelector('[data-view]'), benchmarkSelect = root.querySelector('[data-benchmark]');
    var endMonth = root.querySelector('[data-end-month]'), endYear = root.querySelector('[data-end-year]');
    var pairs = !!viewSelect, dated = !!endMonth, pairOnly = root.getAttribute('data-preset') === 'gold-stocks';
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
        renderShare();
      });
      chart = makeChart(plot);
      onResize(plot, function () { chart.draw(); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { chart.draw(); });
      if (dated) {
        endMonth.value = String(last.month);
        endYear.value = String(last.year);
        window.addEventListener('hashchange', restore);
        restore();
      } else update();
    }).catch(function () {
      form.hidden = true;
      results.hidden = true;
      root.querySelectorAll('[data-fallback]').forEach(function (n) { n.hidden = false; });
      var fb = root.querySelector('p[data-fallback]');
      if (fb) fb.insertAdjacentHTML('beforeend', ' <span class="oil-error">The calculator couldn’t load its data.</span>');
    });

    function restore() {
      try {
        out('link-note').textContent = '';
        var o = readPreset(window.location.hash), notes = [];
        if (pairOnly && o && o.view !== 'gold-stocks') o = null;
        if (o) {
          if (d.index[o.start] == null || d.index[o.end] == null) throw new Error('This link asks for months outside the stored history. Your dates have not been replaced.');
          if (pairs) viewSelect.value = o.view;
          else if (o.view === 'gold-stocks') notes.push('This link was made for a gold-versus-stocks view that isn’t available here, so it shows every asset for the same dates and settings.');
          if (o.data && d.raw.updated && o.data !== d.raw.updated) notes.push('This link was saved with data updated ' + dayName(o.data) + '. The site’s data was updated ' + dayName(d.raw.updated) + ', so these figures can differ from what was first shown.');
          amountInput.value = String(o.amount);
          mode = o.mode;
          form.querySelector('input[name="mode"][value="' + o.mode + '"]').checked = true;
          form.querySelector('input[name="real"][value="' + (o.real ? 'yes' : 'no') + '"]').checked = true;
          monthSelect.value = String(+o.start.slice(5)); yearSelect.value = o.start.slice(0, 4);
          endMonth.value = String(+o.end.slice(5)); endYear.value = o.end.slice(0, 4);
          if (pairs) benchmarkSelect.value = o.benchmark;
          state.pick = o.pick;
        }
        out('link-note').textContent = notes.join(' ');
        update();
      } catch (e) {
        results.hidden = true;
        out('input-error').textContent = e.message;
      }
    }

    function renderShare() {
      if (!dated || !state.r) return;
      var o = Object.assign({}, state.o, { view: pairs ? viewSelect.value : 'all', benchmark: pairs ? benchmarkSelect.value : 'us',
        pick: state.pick || (state.r.results[0] && state.r.results[0].asset.id), data: d.raw.updated });
      var link = new URL(root.getAttribute('data-share-route'), window.location.href);
      link.hash = presetHash(o);
      out('share').href = link.href;
    }

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
      if (!dated && year === last.year && month > last.month) { month = last.month; monthSelect.value = String(month); }
      if (dated) Array.prototype.forEach.call(endMonth.options, function (opt) { opt.disabled = +endYear.value === last.year && +opt.value > last.month; });

      var amount = parseAmount(amountInput.value);
      amountInput.setAttribute('aria-invalid', amount == null ? 'true' : 'false');
      amountError.textContent = amount == null ? 'Enter €1 to €100,000,000, with at most two decimal places.' : '';
      results.hidden = amount == null;
      if (amount == null) return;

      var o = { mode: mode, amount: amount, start: year + (month < 10 ? '-0' : '-') + month, real: radio('real') === 'yes' }, r;
      var pair = pairs && viewSelect.value === 'gold-stocks';
      if (dated) {
        o.end = endYear.value + '-' + ('0' + endMonth.value).slice(-2);
        out('input-error').textContent = '';
        var problem = dateProblem(d, o.start, o.end);
        if (problem) {
          results.hidden = true;
          out('input-error').textContent = problem;
          return;
        }
      }
      if (pairs) {
        if (pair) o.assets = ['gold', benchmarkSelect.value];
        root.querySelector('[data-benchmark-field]').hidden = !pair;
        root.querySelector('[data-pair-note]').hidden = !pair;
        root.querySelector('[data-pair-rules]').hidden = !pair;
        root.querySelectorAll('[data-full-rules]').forEach(function (n) { n.hidden = pair; });
      }
      try {
        r = calculate(d, o);
      } catch (e) {
        results.hidden = true;
        if (dated) out('input-error').textContent = e.message;
        else amountError.textContent = 'Sorry, the calculator has no data for that choice.';
        return;
      }
      if (pair && (r.unavailable.length || r.results.length !== 2)) {
        results.hidden = true;
        out('input-error').textContent = 'No same-window comparison: ' + r.unavailable.map(function (a) { return a.name + ' is missing ' + monthName(a.missing); }).join('; ') + '. Choose another window; dates have not been changed.';
        return;
      }
      state.r = r;
      state.o = o;
      render();
    }

    function render() {
      var r = state.r, o = state.o, today = monthName(r.to), when = monthName(o.start);
      var unit = dated ? 'in ' + today + ' euros' : 'in today’s money';
      out('putin').textContent = r.buys > 1
        ? 'You put in ' + money(o.amount) + ' at the end of every month from ' + when + ' to ' + today + ': ' + money(r.putIn) + ' in all' +
          (o.real ? ', or ' + money(r.putInReal) + ' ' + unit + '.' : '.')
        : 'You put in ' + money(o.amount) + ' at the end of ' + when + (o.real ? ', which is ' + money(r.putInReal) + ' ' + unit + '.' : '.');
      out('ranked').textContent = 'Ranked by value at the end of ' + today + (o.real ? ', ' + unit : ', nominal euros');

      // The bars run from €0 on one scale, unless the top asset dwarfs the rest: then its bar runs off the end
      if (!r.results.length) {
        results.hidden = true;
        amountError.textContent = 'No asset has complete data for this window.';
        return;
      }
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
        meta.push(x.fall.gap === 0 ? 'no fall observed' : 'biggest fall ' + pct(x.fall.gap, 1));
        el('span', 'onc-meta', meta.join(' · '), b);
        el('span', 'visually-hidden', '. Show its chart', b);
      });
      out('scale-note').textContent = broken ? top.asset.name + ' rose so far that its bar is cut short.' : '';
      out('unavailable').textContent = r.unavailable.map(function (a) {
        return a.name + ' isn’t included: there is no observation for ' + monthName(a.missing) + '.';
      }).join(' ');
      out('annual-note').textContent = r.days < 365 ? 'A yearly rate needs at least a year of history, so each shows its gain or loss in all.'
        : o.mode === 'lump'
          ? '“A year” is the steady yearly growth that would turn what you put in into what it’s worth' + (o.real ? ', after inflation.' : '.')
          : '“A year” is money-weighted (XIRR): each payment counts only from the month it went in' + (o.real ? '. It’s after inflation.' : '.');
      renderInterpretation();
      renderPick();
      if (pairs) renderTables();
      renderShare();

      // One short sentence for screen readers, once the reader stops typing
      clearTimeout(liveTimer);
      liveTimer = setTimeout(function () {
        var low = r.results[r.results.length - 1];
        out('live').textContent = money(o.amount) + (o.mode === 'monthly' ? ' a month from ' : ' put in at the end of ') + when + ' would be worth most in ' +
          top.asset.name + ', ' + money(top.value) + ', and least in ' + low.asset.name + ', ' + money(low.value) + (o.real ? ', ' + unit + '.' : ', nominal euros.');
      }, 700);
    }

    function renderTables() {
      var r = state.r, o = state.o, pair = viewSelect.value === 'gold-stocks';
      root.querySelector('[data-comparison-tables]').hidden = !pair;
      if (!pair) return;
      var body = out('comparison-body'), head = out('history-head'), history = out('history-body');
      var rows = ['gold', benchmarkSelect.value].map(function (id) { return r.results.filter(function (x) { return x.asset.id === id; })[0]; });
      body.textContent = ''; head.textContent = ''; history.textContent = '';
      out('table-caption').textContent = monthName(o.start) + ' to ' + monthName(r.to) + (o.real ? ', in ' + monthName(r.to) + ' euros' : ', nominal euros');
      rows.forEach(function (x) {
        var tr = el('tr', null, null, body), th = el('th', null, x.asset.name, tr); th.scope = 'row';
        [money(x.value), pct(x.gainPct, 1, true), x.annual == null ? 'Not shown (under one year or no solution)' : pct(x.annual, 2),
          x.fall.gap === 0 ? 'No fall observed' : pct(x.fall.gap, 1) + ' (' + monthName(x.fall.from) + ' to ' + monthName(x.fall.to) + ')',
          x.fall.gap === 0 ? 'No fall to recover' : x.fall.recovery ? monthName(x.fall.recovery) : 'Not recovered by ' + monthName(r.to)
        ].forEach(function (v) { el('td', null, v, tr); });
      });
      ['Month', 'Money put in', rows[0].asset.name, rows[1].asset.name].forEach(function (v) { var th = el('th', null, v, head); th.scope = 'col'; });
      rows[0].points.forEach(function (p, i) {
        var tr = el('tr', null, null, history), th = el('th', null, monthName(p.key), tr); th.scope = 'row';
        [p.putIn, p.value, rows[1].points[i].value].forEach(function (v) { el('td', 'num', money(v), tr); });
      });
    }

    function renderInterpretation() {
      if (!out('equivalent')) return; // The homepage keeps its compact calculator.
      var r = state.r, o = state.o, end = monthName(r.to), when = monthName(o.start);
      var info = inflation(d, o.amount, o.start, r.to), payment = '€' + num(o.amount, 2);
      out('inflation-period').textContent = 'From ' + when + ' to ' + end + (dated ? ', your selected end month.' : ', the latest common observation month.') + ' Measure: euro-area all-items HICP, changing composition.';
      out('equivalent').textContent = '€' + num(info.equivalent, 2);
      out('price-rise').textContent = pct(info.rise, 2, true);
      out('buying-loss').textContent = pct(info.loss, 2);
      out('inflation-explanation').textContent = payment + ' in ' + when + ' has the same measured purchasing power as €' + num(info.equivalent, 2) +
        ' in ' + end + '. The price change compares the cost of the basket; the loss compares what unchanged cash can buy.' +
        (info.loss < 0 ? ' A negative buying-power loss means a gain.' : '') +
        (o.start === r.to ? ' Start and end are the same month, so there is no change to measure yet.' : '') +
        (o.mode === 'monthly' ? ' This is an illustration for one payment of ' + payment + ', not the full stream of monthly contributions.' : '');
      out('year-convention').textContent = '€100 in January of each year, converted to ' + end + ' prices using that January’s monthly HICP index. These are January observations, not annual averages; the endpoint is the same for every row.';
      var body = root.querySelector('[data-year-table]');
      body.textContent = '';
      januaryRows(d, r.to).forEach(function (row) {
        var tr = el('tr', null, null, body);
        el('th', null, monthName(row.start), tr).scope = 'row';
        el('td', 'num', '€' + num(row.inflation.equivalent, 2), tr);
        el('td', 'num', pct(row.inflation.rise, 2, true), tr);
        el('td', 'num', pct(row.inflation.loss, 2), tr);
      });
      out('start-convention').textContent = '€100 invested at each listed January valuation, all ending in ' + end + '. ' +
        'Each cell gives the final balance in endpoint euros and the cumulative ' + (o.real ? 'inflation-adjusted' : 'nominal') + ' return. ' +
        (o.real ? 'The return compares the balance with €100 converted from that January into endpoint-price euros.' : 'The return compares the balance with the original €100.') + ' Five-year start samples, your selected start year and the latest January are included.';
      var head = root.querySelector('[data-start-head]');
      head.textContent = '';
      ['Start (January)', 'Held'].concat(d.assets.map(function (a) { return a.name; })).forEach(function (name) {
        el('th', null, name, head).scope = 'col';
      });
      body = root.querySelector('[data-start-table]');
      body.textContent = '';
      startRows(d, o.start, r.to, o.real).forEach(function (row) {
        var tr = el('tr', null, null, body);
        el('th', null, row.start.slice(0, 4), tr).scope = 'row';
        el('td', null, Math.floor(row.months / 12) + 'y ' + (row.months % 12) + 'm', tr);
        row.values.forEach(function (value, i) {
          var td = el('td', value == null ? null : 'num', value == null ? 'Unavailable' : '€' + num(value, 2), tr);
          if (value != null) el('span', 'onc-table-return', pct(row.gains[i], 1, true) + (o.real ? ' real' : ' nominal'), td);
        });
      });
      out('loss-convention').textContent = 'Biggest peak-to-trough asset falls from ' + when + ' to ' + end +
        (o.real ? ', after euro-area inflation.' : ', in nominal euros.') + ' Switch the inflation setting above to compare paths. Peaks and recoveries are restricted to this window.';
      body = root.querySelector('[data-loss-table]');
      body.textContent = '';
      d.assets.forEach(function (a) {
        var f = drawdown(d, a.id, o.start, r.to, o.real), tr = el('tr', null, null, body);
        el('th', null, a.name, tr).scope = 'row';
        var cells = !f ? ['Unavailable', '—', '—', '—'] : !f.from ? ['No sampled fall', '—', '—', 'Not applicable']
          : [pct(f.gap, 1), monthName(f.from), monthName(f.to), f.recovery ? monthName(f.recovery) : 'Not recovered by ' + end];
        cells.forEach(function (value, i) {
          el('td', null, value, tr).setAttribute('data-label', ['Biggest fall', 'Peak', 'Trough', 'First recovery'][i]);
        });
      });
    }

    function renderPick() {
      var r = state.r, o = state.o, x = null;
      r.results.forEach(function (y) { if (y.asset.id === (state.pick || r.results[0].asset.id)) x = y; });
      var name = x.asset.short, unit = o.real ? (dated ? ', in ' + monthName(r.to) + ' euros' : ', in today’s money') : ', nominal euros';
      out('chart-title').textContent = 'Your ' + name + ', ' + monthName(o.start) + ' to ' + monthName(r.to) + unit;
      out('key-value').textContent = 'Value of your ' + name;
      var w = x.worst;
      out('worst').textContent = Number((-w.gap * 100).toFixed(0)) > 0
        ? 'The worst moment: at the end of ' + monthName(w.key) + ' your ' + name + ' was worth ' + money(w.value) + ', ' + pct(-w.gap, 0) + ' less than the ' +
          money(w.against) + (o.real ? ' you’d put in, adjusted for inflation.' : ' you’d put in.')
        : 'Your ' + name + ' was never worth less than ' + (o.real ? 'the money you’d put in, adjusted for inflation' : 'the money you’d put in') + ', checked at the end of each month.';
      if (out('drawdown')) {
        var f = drawdown(d, x.asset.id, o.start, r.to, o.real);
        out('drawdown').textContent = f.from ? 'Asset drawdown (' + (o.real ? 'after inflation' : 'nominal euros') + '): ' + pct(f.gap, 1) +
          ', from ' + monthName(f.from) + ' to ' + monthName(f.to) + '. ' +
          (f.recovery ? 'First regained that peak in ' + monthName(f.recovery) + '.' : 'Not recovered by ' + monthName(r.to) + '.')
          : 'No fall between sampled monthly observations on this asset path in the selected window.';
      }
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
      plot.setAttribute('aria-label', 'Chart of the value of your ' + x.asset.short + ' against the money you put in' + (o.real ? ', in ' + monthName(o.end || pts[pts.length - 1].key) + ' money' : ', nominal ' + (o.currency || 'EUR')) +
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
      drawAxes(svg, y, yearTicks(t0, t1, left, right, narrow ? 44 : 56), left, right, bottom, o.currency);
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
      var p = pts[i], gap = p.value / p.putIn - 1, name = (o.gold ? 'Monthly-average valuation, ' : 'End of ') + monthName(p.key);
      var main = money(p.value, false, o.currency) + (o.real ? ' in ' + monthName(o.end || pts[pts.length - 1].key) + ' money' : ', nominal ' + (o.currency || 'EUR'));
      var sub = 'Put in ' + money(p.putIn, false, o.currency) + (Number((gap * 100).toFixed(0)) ? ', so ' + pct(Math.abs(gap), 0) + (gap < 0 ? ' down' : ' up') : '');
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

  // A reusable gold-only preset of the same calculator, on the existing canonical comparison page.
  function initGold(root) {
    var form = root.querySelector('[data-gold-form]'), results = root.querySelector('[data-gold-results]');
    var field = function (name) { return root.querySelector('[data-gold-field="' + name + '"]'); };
    var out = function (name) { return root.querySelector('[data-gold-out="' + name + '"]'); };
    var chart = makeChart(root.querySelector('[data-plot]')), data, timer;
    var cash = function (n) { return money(n, false, field('currency').value); };
    var real = function () { return field('basis').value === 'real'; };
    load(root.getAttribute('data-src')).then(function (d) {
      data = d;
      var first = d.months[0].key, last = d.months[d.months.length - 1].key;
      ['start', 'end'].forEach(function (name) {
        d.months.forEach(function (m) {
          var option = el('option', null, monthName(m.key), field(name));
          option.value = m.key;
        });
      });
      field('start').value = d.index['2000-01'] == null ? first : '2000-01';
      field('end').value = last;
      // Old data can still drive the broader comparison; USD needs the verified supplement.
      field('currency').querySelector('[value="USD"]').disabled = !d.raw.gold;
      var params = new URLSearchParams(window.location.search);
      if (params.get('gold') === '1' && (!window.location.hash || window.location.hash === '#' + root.id)) {
        var invalid = [];
        ['amount', 'start', 'end', 'mode', 'currency', 'basis'].forEach(function (name) {
          var value = params.get('gold-' + name);
          if (value == null) return;
          var valid = name === 'amount' ? parseAmount(value) != null
            : Array.prototype.some.call(field(name).options, function (opt) { return opt.value === value && !opt.disabled; });
          if (valid) field(name).value = value; else invalid.push(name);
        });
        if (field('start').value > field('end').value) {
          field('start').value = first; field('end').value = last; invalid.push('month range');
        }
        if (invalid.length) out('notice').textContent = 'Some shared settings are outside the supported range (' + invalid.join(', ') + '). Check the selections below.';
      }
      form.hidden = false;
      root.querySelectorAll('[data-gold-fallback]').forEach(function (n) { n.hidden = true; });
      out('bounds').textContent = 'Monthly observations: ' + monthName(first) + ' to ' + monthName(last) + '.';
      if (!d.raw.gold) out('notice').textContent = 'US-dollar reporting is unavailable in this data vintage. Euro calculations remain available.';
      form.addEventListener('submit', function (e) { e.preventDefault(); update(); });
      form.addEventListener('change', update);
      field('amount').addEventListener('input', update);
      onResize(root.querySelector('[data-plot]'), chart.draw);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(chart.draw);
      update();
    }).catch(function () {
      form.hidden = true;
      results.hidden = true;
      root.querySelectorAll('[data-gold-fallback]').forEach(function (n) { n.hidden = false; });
      out('notice').textContent = 'Interactive gold calculations could not load. The dated example below remains available.';
    });

    function update() {
      var start = field('start').value, end = field('end').value;
      Array.prototype.forEach.call(field('start').options, function (opt) { opt.disabled = opt.value > end; });
      Array.prototype.forEach.call(field('end').options, function (opt) { opt.disabled = opt.value < start; });
      var amount = parseAmount(field('amount').value), currency = field('currency').value;
      field('amount').setAttribute('aria-invalid', amount == null ? 'true' : 'false');
      out('error').textContent = amount == null ? 'Enter an amount from 1 to 100,000,000, with up to two decimal places.' : '';
      root.querySelector('[data-gold-symbol]').textContent = currency === 'USD' ? '$' : '€';
      out('amount-label').textContent = field('mode').value === 'monthly' ? 'Amount each month' : 'Amount';
      out('amount-currency').textContent = currency === 'USD' ? ' in US dollars' : ' in euros';
      results.hidden = amount == null;
      clearTimeout(timer);
      if (amount == null) { out('live').textContent = ''; return; }
      var o = { mode: field('mode').value, amount: amount, start: start, end: end, real: real(), currency: currency, assets: ['gold'], gold: true };
      var r;
      try { r = calculate(data, o); }
      catch (e) { results.hidden = true; out('error').textContent = 'No complete gold data for these settings. Please check the selected months and currency.'; return; }
      var x = r.results[0], unit = real() ? 'in ' + monthName(end) + ' purchasing power' : 'in nominal ' + currency;
      out('value').textContent = cash(x.value);
      out('basis').textContent = 'Historical value, ' + (real() ? monthName(end) + ' purchasing power (' + currency + ')' : monthName(end) + ', nominal ' + currency);
      out('contributions').textContent = cash(r.putIn) + (real() ? '; ' + cash(r.base) + ' in valuation-month money' : '');
      out('gain').textContent = money(x.gain, true, currency) + ' (' + pct(x.gainPct, 1, true) + ')';
      out('annual').textContent = x.annual == null ? 'Not shown' : pct(x.annual, 2, true);
      out('annual-label').textContent = o.mode === 'monthly' ? 'Annualised money-weighted return (XIRR)' : 'Annualised return (CAGR)';
      out('annual-note').textContent = r.days < 365
        ? 'Annualised return is not shown for less than a year. The total return compares value with contributions.'
        : (o.mode === 'monthly' ? 'XIRR counts each payment only for its own holding period. Total return is the gain divided by contributions, not a yearly rate.' : 'CAGR is the steady yearly rate linking the initial contribution to the final value.') +
          (real() ? ' Both returns use inflation-adjusted contributions.' : ' Both returns are before inflation.');
      out('interpretation').textContent = (o.mode === 'monthly' ? r.buys + (r.buys === 1 ? ' purchase, including the valuation month' : ' equal purchases, including the valuation month') : 'One purchase in ' + monthName(start)) +
        ', at monthly-average prices, would have left ' + cash(x.value) + ' ' + unit + '. ' +
        (real() ? 'Earlier contributions are restated in the valuation month’s money; the final value is already in that month’s money.' : 'Inflation is not deducted.') +
        ' Gold pays no dividends; this is a price-only illustration before costs and tax. Historical returns do not imply future returns.';
      var f = x.fall;
      out('fall').textContent = f.from
        ? 'Largest fall in gold’s ' + (real() ? 'inflation-adjusted ' : '') + currency + ' price: ' + pct(f.gap, 1) + ', from ' + monthName(f.from) + ' to ' + monthName(f.to) + '. ' +
          (f.recovery ? 'That peak was regained in ' + monthName(f.recovery) + '.' : 'That peak had not been regained by ' + monthName(end) + '.')
        : 'No fall between monthly observations in this interval; there is no recovery period to report.';
      out('chart-title').textContent = 'Gold value and contributions, ' + monthName(start) + ' to ' + monthName(end) + ', ' + unit;
      chart.set(x, o);
      out('table-caption').textContent = 'Monthly-average gold valuations and cumulative contributions, ' + currency + (real() ? ', all in ' + monthName(end) + ' money' : ', nominal');
      var body = root.querySelector('[data-gold-table]'); body.textContent = '';
      x.points.forEach(function (p) {
        var row = el('tr', null, null, body);
        var heading = el('th', null, monthName(p.key), row); heading.scope = 'row';
        el('td', 'num', cash(p.value), row);
        el('td', 'num', cash(p.putIn), row);
      });
      var url = new URL(root.getAttribute('data-share-url'), window.location.href);
      url.searchParams.set('gold', '1');
      ['amount', 'start', 'end', 'mode', 'currency', 'basis'].forEach(function (name) { url.searchParams.set('gold-' + name, name === 'amount' ? String(amount) : field(name).value); });
      url.hash = 'gold-return';
      out('share').href = url.href;
      timer = setTimeout(function () { out('live').textContent = 'Gold’s historical value: ' + cash(x.value) + ', ' + unit + '. Contributions: ' + cash(r.base) + '.'; }, 500);
    }
  }

  window.OldNewCalculator = { prepare: prepare, calculate: calculate, dateProblem: dateProblem, xirr: xirr, load: load, inflation: inflation, januaryRows: januaryRows, startRows: startRows, drawdown: drawdown, readPreset: readPreset, presetHash: presetHash, makeChart: makeChart, onResize: onResize, monthName: monthName, money: money, pct: pct };
  var start = function () {
    document.querySelectorAll('[data-old-new]').forEach(init);
    document.querySelectorAll('[data-gold-return]').forEach(initGold);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
