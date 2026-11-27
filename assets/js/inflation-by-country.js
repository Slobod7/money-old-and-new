/* The inflation-by-country page (_includes/inflation-map.html, inflation-country-chart.html and inflation-ranking.html).
   Jekyll draws the map, the euro area's card, one country's comparison and the table, and they read the same without
   this script. With it: the measure and view tabs (headline, core and the four groups that make up all items: food,
   energy, goods and services), a readout on hover and focus, a card for the country you pick with its four groups
   against the euro area's, a second country to compare with, the chart's range and its readout, and a table that
   sorts. Each include also works
   on its own in an article.
   It reads assets/data/inflation-by-country.json from this site: no outside requests, cookies or storage. The address
   takes the choice as a fragment (#country=RO&with=DE&measure=core&view=change&range=all), so a view can be shared.
   The sums and sentences are exported for tests/inflation-by-country.cjs. */
(function (root) {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MINUS = '−';
  var EURO_AREA = 'EA';
  // Each measure's name in a sentence, in the order of the tabs: the same names as LABELS in the update script
  var MEASURES = { headline: 'Inflation', core: 'Core inflation', food: 'Food inflation', energy: 'Energy inflation', goods: 'Goods inflation', services: 'Services inflation' };
  var VIEWS = { rate: 's', change: 'd' };              // the view, and the letter of its colour classes (fuel-s0…, fuel-d0…)
  var RANGES = { '5y': 60, '10y': 120, all: null };   // months back from the latest one, as in scripts/update-inflation-data.py
  var STEPS = [1, 2, 5, 10, 20, 50], MAX_STEPS = 6;
  var SVG = 'http://www.w3.org/2000/svg';

  // The data ------------------------------------------------------------------------------------------

  function prepare(raw) {
    var d = { raw: raw, keys: [], col: {}, names: {}, euro: {}, countries: [], since: raw.since, shades: raw.map_scales, memo: {} };
    raw.cols.forEach(function (code, i) { if (i) d.col[code] = i; });
    raw.areas.forEach(function (area) {
      d.names[area[0]] = area[1];
      d.euro[area[0]] = area[2];
      if (area[0] !== EURO_AREA) d.countries.push(area[0]);
    });
    d.keys = raw.headline.map(function (row) { return row[0]; });
    d.last = d.keys.length - 1;
    d.before = d.keys.indexOf(raw.before);   // the same month a year earlier
    return d;
  }

  // One area's figures for every month, with null where it has none
  function series(d, measure, code) {
    var key = measure + ' ' + code;
    if (!d.memo[key]) {
      var col = d.col[code];
      d.memo[key] = d.raw[measure].map(function (row) { var v = row[col]; return typeof v === 'number' ? v : null; });
    }
    return d.memo[key];
  }

  function windowStart(count, range) {
    var back = RANGES[range];
    return back == null ? 0 : Math.max(0, count - 1 - back);
  }

  // The chart's bottom, its top and the gap between its gridlines: the same rule as chart_scale in the update script
  function scale(values) {
    if (!values.length) return [0, 1, 1];
    var lo = Math.min(0, Math.floor(Math.min.apply(null, values))), hi = Math.max(0, Math.max.apply(null, values));
    var step = STEPS[STEPS.length - 1];
    for (var i = 0; i < STEPS.length; i++) {
      if (Math.ceil(hi / STEPS[i]) + Math.floor(-lo / STEPS[i]) <= MAX_STEPS) { step = STEPS[i]; break; }
    }
    return [lo, Math.max(1, Math.ceil(hi / step)) * step, step];
  }

  // The highest figure and its month, counted from the month `since` when one is given: the latest one, if reached twice
  function peak(values, keys, since) {
    var best = null;
    values.forEach(function (v, i) { if (v != null && !(since && keys[i] < since) && (best == null || v >= values[best])) best = i; });
    return best == null ? null : { month: keys[best], value: values[best] };
  }

  // Years to label under the chart: every year, every second or every fifth, by how long the view is
  function yearStep(count) { return count <= 72 ? 1 : count <= 180 ? 2 : 5; }

  // The difference between two published rates, in points. Both have one decimal, so the sum is rounded back to one.
  function gap(a, b) { return a == null || b == null ? null : Math.round((a - b) * 10) / 10; }

  // One area's latest month for one measure: the rate, the rate a year earlier and the move between them, the highest
  // it has been and, for a country, how far it is from the euro area's now and a year earlier. Null without a rate.
  function figures(d, code, measure) {
    var own = series(d, measure, code), area = series(d, measure, EURO_AREA), rate = own[d.last];
    if (rate == null) return null;
    var was = d.before < 0 ? null : own[d.before];
    var f = { rate: rate, before: was, change: gap(rate, was), peak: peak(own, d.keys, d.since[measure]) };
    if (code !== EURO_AREA) {
      f.gap = gap(rate, area[d.last]);
      f.gapBefore = d.before < 0 ? null : gap(was, area[d.before]);
    }
    return f;
  }

  function byName(d, a, b) { return d.names[a] < d.names[b] ? -1 : d.names[a] > d.names[b] ? 1 : 0; }

  // The countries with a rate, highest first, and by name where two tie: the order the update script uses
  function ranked(d, measure) {
    return d.countries.map(function (code) { return { code: code, f: figures(d, code, measure) }; })
      .filter(function (r) { return r.f; })
      .sort(function (x, y) { return y.f.rate - x.f.rate || byName(d, x.code, y.code); });
  }

  // The map's shades: the same rules as scripts/update-inflation-data.py, in whole tenths of a point -------------

  function tenths(v) { return Math.round(v * 10); }
  function rateClass(v, breaks) {
    var n = 0, t = tenths(v);
    breaks.forEach(function (b) { if (t >= tenths(b)) n++; });
    return n;
  }
  function changeClass(v, breaks) {
    var t = tenths(v), b = breaks.map(tenths);
    return t <= b[0] ? 0 : t < b[1] ? 1 : t <= b[2] ? 2 : t < b[3] ? 3 : 4;
  }
  function plain(v) { return String(v).replace('-', MINUS); }
  function legendLabels(view, breaks) {
    if (view === 'rate') {
      var out = ['Under ' + plain(breaks[0]) + '%'];
      for (var i = 1; i < breaks.length; i++) out.push(plain(breaks[i - 1]) + '% to ' + plain(breaks[i]) + '%');
      out.push(plain(breaks[breaks.length - 1]) + '% or more');
      return out;
    }
    var big = plain(breaks[3]), small = plain(breaks[2]), far = big + (breaks[3] === 1 ? ' point' : ' points');
    return ['Down ' + far + ' or more', 'Down ' + small + ' to ' + big, 'Within ' + small, 'Up ' + small + ' to ' + big, 'Up ' + far + ' or more'];
  }

  // Formats -------------------------------------------------------------------------------------------

  function monthName(key) { return MONTHS[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4); }
  function shortMonth(key) { return MONTHS[+key.slice(5, 7) - 1].slice(0, 3) + ' ' + key.slice(0, 4); }

  // One decimal, a real minus sign, and no sign on a figure that rounds to zero
  function num(v) {
    var text = Math.abs(v).toFixed(1);
    return (v < 0 && +text !== 0 ? MINUS : '') + text;
  }
  function pct(v) { return v == null ? '–' : num(v) + '%'; }
  // A difference with its sign: +2.7, −0.4, and 0.0 with none
  function signed(v) { return v == null ? '–' : (v > 0 ? '+' : '') + num(v); }
  function points(v) { return num(Math.abs(v)) + (Math.abs(v) === 1 ? ' point' : ' points'); }
  // A name as it reads after "in": the Netherlands, the euro area
  function place(name) { return name === 'Netherlands' ? 'the Netherlands' : name === 'Euro area' ? 'the euro area' : name; }

  function against(g, what) {
    if (g === 0) return 'the same as ' + what;
    return points(g) + (g > 0 ? ' above ' : ' below ') + what;
  }
  // How a rate compares with a year earlier, as the card says it
  function moved(change) {
    if (change == null) return '';
    return change === 0 ? 'the same now' : points(change) + (change > 0 ? ' higher now' : ' lower now');
  }

  // "higher in 16 countries, lower in 10 and unchanged in 1", from [['higher', 16], ['lower', 10], ['unchanged', 1]]
  function tally(counts, total) {
    var parts = counts.filter(function (c) { return c[1] > 0; }).map(function (c, i) {
      return c[0] + ' in ' + (c[1] === total && total > 1 ? 'all ' : '') + c[1] + (i === 0 ? (c[1] === 1 ? ' country' : ' countries') : '');
    });
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts.join('');
  }

  // The sentence above the map
  function summary(d, measure, view) {
    var rows = ranked(d, measure), area = figures(d, EURO_AREA, measure), label = MEASURES[measure];
    if (!rows.length || !area) return '';
    if (view === 'rate') {
      var hi = rows[0], lo = rows[rows.length - 1];
      return label + ' is highest in ' + place(d.names[hi.code]) + ', at ' + pct(hi.f.rate) + ', and lowest in ' + place(d.names[lo.code]) + ', at ' + pct(lo.f.rate) + '. ' +
        rows.filter(function (r) { return r.f.rate > area.rate; }).length + ' of the ' + d.countries.length + ' countries are above the euro area’s ' + pct(area.rate) + '.';
    }
    rows = rows.filter(function (r) { return r.f.change != null; }).sort(function (x, y) { return x.f.change - y.f.change || byName(d, x.code, y.code); });
    if (!rows.length) return '';
    var down = rows.filter(function (r) { return r.f.change < 0; }), up = rows.filter(function (r) { return r.f.change > 0; });
    var text = 'Against ' + monthName(d.keys[d.before]) + ', ' + label.toLowerCase() + ' is ' +
      tally([['higher', up.length], ['lower', down.length], ['unchanged', rows.length - up.length - down.length]], rows.length) + '.';
    if (up.length) {
      var most = up.reduce(function (best, r) { return r.f.change > best.f.change ? r : best; });   // the first by name, if two tie
      text += ' The biggest rise is in ' + place(d.names[most.code]) + ', ' + points(most.f.change) + '.';
    }
    if (down.length) text += ' The biggest fall is in ' + place(d.names[down[0].code]) + ', ' + points(down[0].f.change) + '.';
    return text + ' The euro area’s rate is ' + (area.change === 0 ? 'unchanged' : points(area.change) + (area.change > 0 ? ' higher' : ' lower')) + '.';
  }

  // The sentence above the comparison: the latest month, and how far from the euro area or the other country
  function verdict(d, code, measure, other) {
    other = other || EURO_AREA;
    var a = figures(d, code, measure), b = figures(d, other, measure);
    if (!a || !b) return 'No figures for ' + place(d.names[a ? other : code]) + '.';
    var than = other === EURO_AREA ? 'the euro area’s ' + pct(b.rate) : 'the ' + pct(b.rate) + ' in ' + place(d.names[other]);
    return MEASURES[measure] + ' in ' + place(d.names[code]) + ' was ' + pct(a.rate) + ' in ' + monthName(d.keys[d.last]) + ', ' + against(gap(a.rate, b.rate), than) + '.';
  }

  // The address ---------------------------------------------------------------------------------------

  // A fragment such as #country=RO&with=DE&measure=core&view=change&range=all, as the choices it names. Every value is
  // checked against the data, and one bad value refuses the whole fragment. Null when it names none of them.
  function parseHash(hash, d) {
    var out = {}, found = false, ok = true;
    String(hash || '').replace(/^#/, '').split('&').forEach(function (part) {
      var at = part.indexOf('='), key = at < 0 ? part : part.slice(0, at), value = at < 0 ? '' : part.slice(at + 1);
      if (key === 'country') { found = true; if (d.countries.indexOf(value) < 0) ok = false; else out.country = value; }
      else if (key === 'with') { found = true; if (value !== EURO_AREA && d.countries.indexOf(value) < 0) ok = false; else out.other = value; }
      else if (key === 'measure') { found = true; if (!MEASURES.hasOwnProperty(value)) ok = false; else out.measure = value; }
      else if (key === 'view') { found = true; if (!VIEWS.hasOwnProperty(value)) ok = false; else out.view = value; }
      else if (key === 'range') { found = true; if (!RANGES.hasOwnProperty(value)) ok = false; else out.range = value; }
    });
    if (out.country && out.other === out.country) ok = false;   // a country against itself says nothing
    return found && ok ? out : null;
  }

  // The fragment that names a view: only what differs from the view the page opens on (home), so that view has none
  function hashFor(state, home) {
    var parts = [];
    if (state.sel || state.country !== home.country) parts.push('country=' + state.country);
    if (state.other !== EURO_AREA) parts.push('with=' + state.other);
    if (state.measure !== 'headline') parts.push('measure=' + state.measure);
    if (state.view !== 'rate') parts.push('view=' + state.view);
    if (state.range !== home.range) parts.push('range=' + state.range);
    return parts.length ? '#' + parts.join('&') : '';
  }

  var api = { prepare: prepare, series: series, windowStart: windowStart, scale: scale, peak: peak, yearStep: yearStep, gap: gap, figures: figures,
    ranked: ranked, rateClass: rateClass, changeClass: changeClass, legendLabels: legendLabels, monthName: monthName, shortMonth: shortMonth,
    num: num, pct: pct, signed: signed, points: points, place: place, against: against, moved: moved, tally: tally, summary: summary,
    verdict: verdict, parseHash: parseHash, hashFor: hashFor, MEASURES: MEASURES };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.InflationByCountry = api;

  // The page ------------------------------------------------------------------------------------------

  var document = root.document;

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function svg(tag, attrs, parent) {
    var e = document.createElementNS(SVG, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function all(sel, from) { return [].slice.call((from || document).querySelectorAll(sel)); }
  function swatch(cls) {
    var key = svg('svg', { 'class': 'oil-swatch', viewBox: '0 0 24 10', 'aria-hidden': 'true' });
    svg('line', { 'class': 'ecb-line ' + cls, x1: 1, x2: 23, y1: 5, y2: 5 }, key);
    return key;
  }
  // A group of tabs inside one part of the page: a click sets the state, and press() shows which one is on
  function tabs(part, attr, key, ctx) {
    all('button[' + attr + ']', part).forEach(function (b) {
      b.addEventListener('click', function () { var change = {}; change[key] = b.getAttribute(attr); ctx.set(change); });
    });
  }
  function press(part, attr, value) {
    all('button[' + attr + ']', part).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)); });
  }
  function reveal(part) { all('[data-controls]', part).forEach(function (c) { c.hidden = false; }); }

  // The map and its card ----------------------------------------------------------------------------
  function mapPart(fig, ctx) {
    var d = ctx.d, state = ctx.state;
    var map = fig.querySelector('[data-map]'), card = fig.querySelector('[data-card]'), drawing = fig.querySelector('.fuel-svg');
    var links = all('a[data-code]', fig), ring = fig.querySelector('[data-ring]'), legend = fig.querySelector('[data-legend]');
    var pick = card.querySelector('[data-country]'), month = monthName(d.keys[d.last]), box = drawing.viewBox.baseVal;
    var tip = el('div', 'oil-tip fuel-tip', map);
    tip.setAttribute('aria-hidden', 'true');
    tip.hidden = true;

    function reading(code) {
      var f = d.col[code] ? figures(d, code, state.measure) : null, what = MEASURES[state.measure].toLowerCase();
      if (!f) return { value: 'No figure', sub: '' };
      if (state.view === 'rate') return { value: pct(f.rate) + ' ' + what, sub: f.before == null ? '' : 'A year earlier: ' + pct(f.before) };
      return { value: f.change == null ? 'No figure a year earlier' : signed(f.change) + (Math.abs(f.change) === 1 ? ' point' : ' points') + ' in a year', sub: 'Now ' + pct(f.rate) };
    }
    function showTip(a, x, y) {
      var code = a.getAttribute('data-code'), r = reading(code);
      tip.textContent = '';
      el('p', 'oil-tip-date', tip, d.names[code] || code);
      el('p', 'oil-tip-value', tip, r.value);
      if (r.sub) el('p', 'oil-tip-sub', tip, r.sub);
      tip.hidden = false;
      var w = tip.offsetWidth, h = tip.offsetHeight, room = 14;
      tip.style.left = Math.max(0, Math.min(map.clientWidth - w, x + room + w > map.clientWidth ? x - room - w : x + room)) + 'px';
      tip.style.top = Math.max(0, y - h - room < 0 ? y + room : y - h - room) + 'px';
    }
    links.forEach(function (a) {
      var title = a.querySelector('title');
      if (title) a.removeChild(title);   // the readout replaces the browser's own tooltip
      a.setAttribute('role', 'button');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        ctx.select(a.getAttribute('data-code'));
        if (card.getBoundingClientRect().top > root.innerHeight - 80) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      a.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var outer = map.getBoundingClientRect();
        showTip(a, e.clientX - outer.left, e.clientY - outer.top);
      });
      a.addEventListener('pointerleave', function () { tip.hidden = true; });
      a.addEventListener('focus', function () {
        var inner = drawing.getBoundingClientRect(), outer = map.getBoundingClientRect();
        showTip(a, inner.left - outer.left + (+a.getAttribute('data-x')) / box.width * inner.width, inner.top - outer.top + (+a.getAttribute('data-y')) / box.height * inner.height);
      });
      a.addEventListener('blur', function () { tip.hidden = true; });
    });
    tabs(fig, 'data-measure', 'measure', ctx);
    tabs(fig, 'data-view', 'view', ctx);
    card.querySelector('[data-pick]').hidden = false;
    pick.addEventListener('change', function () { ctx.select(pick.value); });
    reveal(fig);

    function drawMap() {
      var breaks = d.shades[state.measure][state.view], letter = VIEWS[state.view], what = MEASURES[state.measure].toLowerCase();
      links.forEach(function (a) {
        var code = a.getAttribute('data-code'), f = d.col[code] ? figures(d, code, state.measure) : null;
        var v = f && (state.view === 'rate' ? f.rate : f.change);
        var cls = v == null ? 'fuel-none' : 'fuel-' + letter + (state.view === 'rate' ? rateClass(v, breaks) : changeClass(v, breaks));
        all('.fuel-shape, .fuel-dot', a).forEach(function (p) {
          p.setAttribute('class', (p.classList.contains('fuel-dot') ? 'fuel-dot ' : 'fuel-shape ') + cls);
        });
        var r = reading(code);
        a.setAttribute('aria-label', (d.names[code] || code) + ': ' + r.value + (r.sub ? '. ' + r.sub : ''));
        a.setAttribute('aria-pressed', String(code === state.sel));
        a.classList.toggle('is-selected', code === state.sel);
        if (code === state.sel) ring.setAttribute('d', a.querySelector('.fuel-shape').getAttribute('d'));
      });
      if (!state.sel) ring.setAttribute('d', '');
      drawing.setAttribute('aria-label', 'Map of the ' + d.countries.length + ' EU countries, shaded by ' +
        (state.view === 'rate' ? 'annual ' + what + ' in ' + month : 'the change in ' + what + ' in the year to ' + month) + '. Every figure is in the table of all countries.');
      legend.textContent = '';
      legendLabels(state.view, breaks).forEach(function (label, i) {
        var li = el('li', '', legend);
        el('span', 'fuel-key fuel-' + letter + i, li);
        li.appendChild(document.createTextNode(label));
      });
      if (links.some(function (a) { return a.querySelector('.fuel-none'); })) {
        var none = el('li', '', legend);
        el('span', 'fuel-key fuel-none', none);
        none.appendChild(document.createTextNode('No figure'));
      }
    }

    function drawCard() {
      var code = state.sel || EURO_AREA, f = figures(d, code, state.measure);
      var second = state.measure === 'headline' ? 'core' : 'headline', o = figures(d, code, second);
      var set = function (key, text) { card.querySelector('[data-' + key + ']').textContent = text; };
      set('name', d.names[code]);
      set('unit', MEASURES[state.measure].toLowerCase() + ', year to ' + month);
      set('other-label', second === 'core' ? 'Core inflation' : 'Headline inflation');
      set('other', o ? pct(o.rate) : '–');
      set('peak-label', 'Highest since ' + monthName(d.since[state.measure]));
      pick.value = state.sel || '';
      card.querySelector('[data-outside]').hidden = d.euro[code] !== false;
      card.querySelector('[data-vs-row]').hidden = code === EURO_AREA || !f;
      set('rate', f ? pct(f.rate) : 'No figure');
      set('before', f ? pct(f.before) : '–');
      set('change', f ? moved(f.change) : '');
      set('peak', f && f.peak ? pct(f.peak.value) : '–');
      set('peak-month', f && f.peak ? monthName(f.peak.month) : '');
      if (f && code !== EURO_AREA) set('vs', signed(f.gap) + (Math.abs(f.gap) === 1 ? ' point' : ' points'));
      // The four groups for the same place, with the euro area's under a country's; the one on the map in forest
      all('[data-part]', card).forEach(function (row) {
        var part = row.getAttribute('data-part'), own = figures(d, code, part), area = code === EURO_AREA ? null : figures(d, EURO_AREA, part);
        row.querySelector('[data-part-rate]').textContent = own ? pct(own.rate) : '–';
        row.querySelector('[data-part-vs]').textContent = area ? 'Euro area ' + pct(area.rate) : '';
        row.classList.toggle('is-current', part === state.measure);
      });
    }

    return function () {
      press(fig, 'data-measure', state.measure);
      press(fig, 'data-view', state.view);
      drawMap();
      fig.querySelector('[data-summary]').textContent = summary(d, state.measure, state.view);
      drawCard();
    };
  }

  // The comparison and its chart --------------------------------------------------------------------
  function chartPart(figure, ctx) {
    var d = ctx.d, state = ctx.state;
    var plot = figure.querySelector('[data-plot]'), panel = figure.querySelector('[data-panel]');
    var selA = figure.querySelector('[data-country-select]'), selB = figure.querySelector('[data-other-select]');
    var body = figure.querySelector('[data-months]'), rows = figure.querySelector('[data-compare-rows]');
    if (!plot || !panel || !selA || !body) return null;

    var out = {};
    ['verdict', 'head-a', 'head-b', 'key-a', 'key-b', 'desc', 'head-a2', 'head-b2', 'head-a-core', 'head-b-core'].forEach(function (name) {
      out[name] = figure.querySelector('[data-out="' + name + '"]');
    });
    var say = function (name, text) { if (out[name]) out[name].textContent = text; };
    var view = null;   // what the chart shows now: its months, both lines and the scale
    var active = null;
    var cross, dots, tip;

    function draw() {
      var a = state.country, b = state.other, nameA = d.names[a], nameB = d.names[b], what = MEASURES[state.measure];
      var start = windowStart(d.keys.length, state.range);
      var own = series(d, state.measure, a).slice(start), rival = series(d, state.measure, b).slice(start);
      var keys = d.keys.slice(start), n = keys.length - 1;
      var sc = scale(own.concat(rival).filter(function (v) { return v != null; }));
      view = { keys: keys, own: own, rival: rival, lo: sc[0], hi: sc[1], n: n, a: nameA, b: nameB, than: place(nameB) };
      var y = function (v) { return ((sc[1] - v) / (sc[1] - sc[0]) * 1000).toFixed(1); };
      var line = function (values) {
        var text = [];
        values.forEach(function (v, i) { if (v != null) text.push((i / n * 1000).toFixed(1) + ',' + y(v)); });
        return text.join(' ');
      };

      panel.textContent = '';
      var chart = svg('svg', { viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, panel);
      for (var t = sc[0]; t <= sc[1]; t++) {
        if (t % sc[2]) continue;
        svg('line', { 'class': t === 0 ? 'oil-axis' : 'oil-grid', x1: 0, x2: 1000, y1: y(t), y2: y(t) }, chart);
        el('span', 'oil-static-y', panel, (t < 0 ? MINUS : '') + Math.abs(t) + '%').style.bottom = ((t - sc[0]) / (sc[1] - sc[0]) * 100).toFixed(2) + '%';
      }
      svg('polyline', { 'class': 'ecb-line is-soft', points: line(rival) }, chart);
      svg('polyline', { 'class': 'ecb-line is-strong', points: line(own) }, chart);
      var every = yearStep(keys.length);
      keys.forEach(function (key, i) {
        var year = +key.slice(0, 4);
        if (key.slice(5) !== '01' || year % every) return;
        el('span', 'oil-static-x' + (year % (every * 2) ? ' is-minor' : ''), panel, String(year)).style.left = (i / n * 100).toFixed(2) + '%';
      });
      cross = el('span', 'ecb-cross', panel);
      dots = [el('span', 'ecb-dot is-strong', panel), el('span', 'ecb-dot is-soft', panel)];
      hide();

      selA.value = a;
      if (selB) selB.value = b;
      press(figure, 'data-measure', state.measure);
      press(figure, 'data-range', state.range);
      var sentence = verdict(d, a, state.measure, b), both = place(nameA) + ' and in ' + place(nameB);
      say('verdict', sentence);
      say('head-a', nameA); say('head-b', nameB); say('key-a', nameA); say('key-b', nameB);
      say('head-a2', nameA); say('head-b2', nameB);
      say('desc', 'Line chart of ' + what.toLowerCase() + ' in ' + both + ', monthly from ' + monthName(keys[0]) + ' to ' + monthName(keys[n]) + '. ' + sentence + ' Every month is in the table below.');
      plot.setAttribute('aria-label', what + ' in ' + both + ' by month. Use the arrow keys to read each month.');
      plot.setAttribute('aria-valuemax', String(n));
      plot.setAttribute('aria-valuenow', String(n));
      plot.setAttribute('aria-valuetext', spoken(n));
      compare(a, b);
      table(a, b);
    }

    // The latest figures side by side: the month, the same month a year earlier, the move between them, the highest
    function compare(a, b) {
      if (!rows) return;
      var fa = figures(d, a, state.measure), fb = figures(d, b, state.measure);
      var top = function (f) { return f && f.peak ? [pct(f.peak.value), shortMonth(f.peak.month)] : ['–']; };
      var both = function (key) { return [fa ? fa[key] : null, fb ? fb[key] : null]; };
      var rate = both('rate'), was = both('before'), change = both('change');
      rows.textContent = '';
      [
        [monthName(d.keys[d.last]), [pct(rate[0])], [pct(rate[1])], signed(gap(rate[0], rate[1]))],
        [d.before < 0 ? 'A year earlier' : monthName(d.keys[d.before]), [pct(was[0])], [pct(was[1])], signed(gap(was[0], was[1]))],
        ['Change in a year, points', [signed(change[0])], [signed(change[1])], ''],
        ['Highest since ' + monthName(d.since[state.measure]), top(fa), top(fb), '']
      ].forEach(function (row) {
        var tr = el('tr', '', rows);
        el('th', '', tr, row[0]).setAttribute('scope', 'row');
        [row[1], row[2]].forEach(function (cell) {
          var td = el('td', 'num', tr, cell[0]);
          if (cell[1]) el('small', '', td, cell[1]);
        });
        el('td', 'num', tr, row[3]);
      });
    }

    // Every month since the first, newest first, whatever the chart's range, for both lines: headline, then core, or
    // the group chosen when it is one
    function table(a, b) {
      var second = state.measure === 'headline' ? 'core' : state.measure, key = a + '|' + b + '|' + second;
      if (body.getAttribute('data-for') === key) return;
      say('head-a-core', d.names[a] + ', ' + second); say('head-b-core', d.names[b] + ', ' + second);
      var cols = [series(d, 'headline', a), series(d, 'headline', b), series(d, second, a), series(d, second, b)];
      var list = document.createDocumentFragment();
      for (var i = d.last; i >= 0; i--) {
        var tr = el('tr', '', list);
        el('th', '', tr, shortMonth(d.keys[i])).setAttribute('scope', 'row');
        for (var c = 0; c < cols.length; c++) el('td', 'num', tr, pct(cols[c][i]));
      }
      body.textContent = '';
      body.appendChild(list);
      body.setAttribute('data-for', key);
    }

    function spoken(i) {
      var g = gap(view.own[i], view.rival[i]);
      return monthName(view.keys[i]) + ': ' + view.a + ' ' + (view.own[i] == null ? 'no figure' : pct(view.own[i])) + ', ' + view.than + ' ' +
        (view.rival[i] == null ? 'no figure' : pct(view.rival[i])) + (g == null ? '.' : ', ' + against(g, view.than) + '.');
    }

    function show(i) {
      active = i;
      var left = i / view.n * 100, values = [view.own[i], view.rival[i]], top = 100;
      cross.style.left = left + '%';
      cross.hidden = false;
      values.forEach(function (v, k) {
        dots[k].hidden = v == null;
        if (v == null) return;
        var y = (view.hi - v) / (view.hi - view.lo) * 100;
        dots[k].style.left = left + '%';
        dots[k].style.top = y + '%';
        top = Math.min(top, y);
      });

      tip.textContent = '';
      el('p', 'oil-tip-date', tip, monthName(view.keys[i]));
      [[view.a, 'is-strong'], [view.b, 'is-soft']].forEach(function (line, k) {
        var row = el('p', 'ecb-tip-row', tip);
        row.appendChild(swatch(line[1]));
        el('strong', 'ecb-tip-value', row, pct(values[k]));
        row.appendChild(document.createTextNode(line[0]));
      });
      var g = gap(values[0], values[1]);
      if (g != null) el('p', 'oil-tip-event', tip, against(g, view.than).replace(/^t/, 'T'));
      tip.hidden = false;

      // On phones the readout sits just below the chart, full width, so it never hides the lines being read
      var narrow = plot.clientWidth < 520;
      tip.classList.toggle('is-below', narrow);
      if (narrow) {
        tip.style.left = '0px';
        tip.style.top = (plot.offsetHeight + 4) + 'px';
      } else {
        var px = panel.offsetLeft + panel.offsetWidth * left / 100, width = tip.offsetWidth, room = 14;
        tip.style.left = Math.max(0, px + room + width > plot.clientWidth ? px - room - width : px + room) + 'px';
        // At the top of the plot, or at the bottom when the lines are up there
        var lineTop = panel.offsetTop + panel.offsetHeight * top / 100;
        tip.style.top = (lineTop < panel.offsetTop + tip.offsetHeight + 16 ? panel.offsetTop + panel.offsetHeight - tip.offsetHeight - 8 : panel.offsetTop + 4) + 'px';
      }
      plot.setAttribute('aria-valuenow', String(i));
      plot.setAttribute('aria-valuetext', spoken(i));
    }

    function hide() {
      active = null;
      if (tip) tip.hidden = true;
      if (cross) cross.hidden = true;
      (dots || []).forEach(function (dot) { dot.hidden = true; });
    }

    function onKey(e) {
      var last = view.n, i = active == null ? last : active;
      var keys = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, PageUp: i + 12, PageDown: i - 12, Home: 0, End: last };
      if (e.key === 'Escape') { hide(); return; }
      if (!(e.key in keys)) return;
      e.preventDefault();
      show(Math.max(0, Math.min(last, keys[e.key])));
    }

    // Hover, tap and drag. The plot only claims sideways drags (touch-action: pan-y), so vertical swipes still scroll the page.
    function onPointer(e) {
      if (e.type === 'pointermove' && e.pointerType !== 'mouse' && e.buttons === 0) return;
      var rect = panel.getBoundingClientRect();
      show(Math.max(0, Math.min(view.n, Math.round((e.clientX - rect.left) / rect.width * view.n))));
    }

    tip = el('div', 'oil-tip ecb-tip', plot);
    tip.setAttribute('aria-hidden', 'true');
    tip.hidden = true;
    panel.removeAttribute('role');
    panel.removeAttribute('aria-label');
    plot.classList.add('is-live');
    plot.setAttribute('tabindex', '0');
    plot.setAttribute('role', 'slider');
    plot.setAttribute('aria-valuemin', '0');
    if (out.desc) plot.setAttribute('aria-describedby', out.desc.id);
    plot.addEventListener('keydown', onKey);
    plot.addEventListener('focus', function () { if (active == null) show(view.n); });
    plot.addEventListener('blur', hide);
    plot.addEventListener('pointerdown', onPointer);
    plot.addEventListener('pointermove', onPointer);
    plot.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && document.activeElement !== plot) hide(); });
    plot.addEventListener('pointercancel', hide);   // the browser took the gesture for scrolling
    document.addEventListener('pointerdown', function (e) { if (!plot.contains(e.target) && document.activeElement !== plot) hide(); });

    selA.addEventListener('change', function () { ctx.select(selA.value); });
    if (selB) {
      selB.addEventListener('change', function () {
        if (selB.value === state.country) { selB.value = state.other; return; }   // a country against itself says nothing
        ctx.set({ other: selB.value });
      });
    }
    tabs(figure, 'data-measure', 'measure', ctx);
    tabs(figure, 'data-range', 'range', ctx);
    reveal(figure);
    var fallback = figure.querySelector('[data-nojs]');
    if (fallback) fallback.hidden = true;
    return draw;
  }

  // The table of all countries ----------------------------------------------------------------------
  function tablePart(list, ctx) {
    var d = ctx.d, state = ctx.state, body = list.querySelector('tbody'), target = ctx.parts.map || ctx.parts.chart;
    all('th[data-sort]', list).forEach(function (th) {
      var b = el('button', 'fuel-sort', null, th.textContent);
      b.type = 'button';
      th.textContent = '';
      th.appendChild(b);
      b.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        ctx.set(state.sort === key ? { dir: -state.dir } : { sort: key, dir: key === 'name' ? 1 : -1 });
      });
    });
    if (target) {
      all('[data-country-name]', list).forEach(function (span) {
        var code = span.closest('tr').getAttribute('data-code');
        if (d.countries.indexOf(code) < 0) return;   // the euro area's row stays as text
        var b = el('button', 'link-button fuel-row-pick', null, span.textContent);
        b.type = 'button';
        span.textContent = '';
        span.appendChild(b);
        b.addEventListener('click', function () {
          ctx.select(code);
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      all('[data-pick-hint]', list).forEach(function (hint) { hint.hidden = false; });
      all('[data-pick-where]', list).forEach(function (where) { where.textContent = ctx.parts.map ? 'on the map' : 'in the chart'; });
    }
    tabs(list, 'data-measure', 'measure', ctx);
    all('[data-groups-note]', list).forEach(function (note) { note.hidden = false; });
    reveal(list);

    return function () {
      press(list, 'data-measure', state.measure);
      list.setAttribute('data-show', state.measure);
      var value = function (tr) {
        var code = tr.getAttribute('data-code');
        if (state.sort === 'name') return d.names[code];
        var f = d.col[code] ? figures(d, code, state.measure) : null;
        if (!f) return null;
        return state.sort === 'gap' ? (code === EURO_AREA ? 0 : f.gap) : f[state.sort];   // the euro area sits where the gap is nil
      };
      all('tr', body).sort(function (r1, r2) {
        var c1 = r1.getAttribute('data-code'), c2 = r2.getAttribute('data-code'), v1 = value(r1), v2 = value(r2);
        if (v1 == null || v2 == null) return v1 == null ? (v2 == null ? 0 : 1) : -1;   // rows without a figure go last
        var c = state.sort === 'name' ? (v1 < v2 ? -1 : v1 > v2 ? 1 : 0) : v1 - v2;
        // Ties: the euro area first, then by name, whichever way the column is sorted
        return c * state.dir || (c1 === EURO_AREA ? -1 : c2 === EURO_AREA ? 1 : byName(d, c1, c2));
      }).forEach(function (tr) {
        tr.classList.toggle('is-selected', tr.getAttribute('data-code') === state.sel);
        body.appendChild(tr);
      });
      all('th[data-sort]', list).forEach(function (th) {
        if (th.getAttribute('data-sort') === state.sort) th.setAttribute('aria-sort', state.dir > 0 ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      });
      all('[data-order]', list).forEach(function (order) { order.hidden = true; });
    };
  }

  // One state for the parts that are on the page: the map, the first chart and the table follow each other. `linked`
  // parts also write their view to the address.
  function controller(d, parts, linked) {
    var chart = parts.chart, asked = chart && chart.getAttribute('data-country'), span = chart && chart.getAttribute('data-range');
    var home = { country: d.countries.indexOf(asked) >= 0 ? asked : ranked(d, 'headline')[0].code, range: RANGES.hasOwnProperty(span) ? span : '10y' };
    var state = { measure: 'headline', view: 'rate', sel: null, country: home.country, other: EURO_AREA, range: home.range, sort: 'rate', dir: -1 };
    var draws = [];

    function render(write) {
      draws.forEach(function (draw) { draw(); });
      if (!write || !linked || !root.history || !root.history.replaceState) return;
      try { root.history.replaceState(null, '', hashFor(state, home) || root.location.pathname + root.location.search); } catch (e) { /* a sandboxed frame: the view still changes */ }
    }
    function pickCountry(code) {
      state.sel = code || null;
      if (!code) return;
      state.country = code;
      if (state.other === code) state.other = EURO_AREA;
    }
    var ctx = {
      d: d, state: state, parts: parts,
      set: function (changes) {
        Object.keys(changes).forEach(function (k) { state[k] = changes[k]; });
        render(true);
      },
      // A country chosen on the map, in the card, in the comparison or in the table: every part shows it. '' is the euro area.
      select: function (code) { pickCountry(code); render(true); }
    };
    if (parts.map) draws.push(mapPart(parts.map, ctx));
    if (chart) draws.push(chartPart(chart, ctx));
    if (parts.table) draws.push(tablePart(parts.table, ctx));
    draws = draws.filter(Boolean);

    return {
      render: render,
      // A view named in the address
      choose: function (choice) {
        ['measure', 'view', 'range'].forEach(function (k) { if (choice[k]) state[k] = choice[k]; });
        if (choice.country) pickCountry(choice.country);
        if (choice.other && choice.other !== state.country) state.other = choice.other;
        render(false);
      }
    };
  }

  function start() {
    var map = document.querySelector('[data-inflation-map]'), table = document.querySelector('[data-inflation-table]');
    var charts = all('[data-inflation-chart]'), first = map || charts[0] || table;
    if (!first || !root.fetch) return;
    fetch(first.getAttribute('data-src'), { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(prepare).then(function (d) {
      // A page built from one month and data from another would disagree with itself: keep the page as built
      if (d.keys[d.last] !== first.getAttribute('data-to') || d.before < 0) return null;
      return d;
    }, function () { return null; /* the data didn't load: the page keeps what Jekyll drew */ }).then(function (d) {
      if (!d) return;
      var main = controller(d, { map: map, chart: charts[0], table: table }, true);
      charts.slice(1).forEach(function (figure) { controller(d, { chart: figure }, false).render(false); });
      var asked = parseHash(root.location.hash, d);
      if (asked) main.choose(asked); else main.render(false);
      root.addEventListener('hashchange', function () {
        var choice = parseHash(root.location.hash, d);
        if (choice) main.choose(choice);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
