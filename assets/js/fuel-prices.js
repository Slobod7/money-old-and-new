/* The fuel prices page (_includes/fuel-map.html and data/europe-fuel-prices.html). Jekyll draws the map, the EU
   average and the table, and they read the same without this script. With it: the fuel and view tabs, a readout on
   hover and focus, a card for the country you pick, a comparison of two countries with a two-year chart, and a table
   that sorts. It loads assets/data/fuel.json once, sends nothing and stores nothing. The fuel, view and countries
   chosen go into the page's address, so a comparison can be shared as a link.
   Prices are whole euros per 1,000 litres (a tenth of a cent a litre), as in the data, so tax is an exact subtraction.
   FuelPrices.model and the helpers are exposed for tests/fuel-prices.cjs. */
(function (global) {
  'use strict';

  var SVG = 'http://www.w3.org/2000/svg';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var FUELS = { petrol: { key: 'p', label: 'Petrol' }, diesel: { key: 'd', label: 'Diesel' } };
  var MEASURES = { price: 'At the pump', pretax: 'Before tax', tax: 'Tax' };
  var MINUS = '−';

  // Formatting -------------------------------------------------------------------------------------

  function euros(v) { return '€' + (v / 1000).toFixed(3); }
  function centsPlain(v) { return (Math.abs(v) / 10).toFixed(1) + 'c'; }
  function cents(v) { return (v > 0 ? '+' : v < 0 ? MINUS : '') + centsPlain(v); }
  function money(v, litres) { return '€' + (Math.abs(v) * litres / 1000).toFixed(2); }
  function signedMoney(v, litres) { return (v > 0 ? '+' : v < 0 ? MINUS : '') + money(v, litres); }
  function place(name) { return name === 'Netherlands' ? 'the Netherlands' : name; }

  function weekDay(first, i) {
    var p = first.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + 7 * i));
  }
  function longDay(d) { return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function shortDay(d) { return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()].slice(0, 3) + ' ' + d.getUTCFullYear(); }

  // The map's classes: the same rules as scripts/update-fuel-data.py ----------------------------------

  function priceClass(v, breaks) {
    var n = 0;
    breaks.forEach(function (b) { if (v >= b) n++; });
    return n;
  }
  function changeClass(v, b) {
    return v <= b[0] ? 0 : v < b[1] ? 1 : v <= b[2] ? 2 : v < b[3] ? 3 : 4;
  }
  function legendLabels(view, breaks) {
    if (view === 'price') {
      var e = function (v) { return '€' + (v / 1000).toFixed(2); };
      var out = ['Under ' + e(breaks[0])];
      for (var i = 1; i < breaks.length; i++) out.push(e(breaks[i - 1]) + ' to ' + e(breaks[i]));
      out.push(e(breaks[breaks.length - 1]) + ' or more');
      return out;
    }
    var big = breaks[3] / 10 + 'c', small = breaks[2] / 10 + 'c';
    return ['Down ' + big + ' or more', 'Down ' + small + ' to ' + big, 'Within ' + small, 'Up ' + small + ' to ' + big, 'Up ' + big + ' or more'];
  }

  // The data ------------------------------------------------------------------------------------------

  function model(data) {
    var by = {}, codes = [];
    data.series.forEach(function (s) { by[s.code] = s; if (s.code !== 'EU') codes.push(s.code); });
    var last = data.weeks - 1, then = last - data.change_weeks;

    function pair(code, fuel, i) {
      var s = by[code], k = FUELS[fuel].key, w = s[k][i], o = s[k + '0'][i];
      return w == null || o == null ? null : [w, o];
    }
    // One place's figures for one fuel in the latest week, or null when it has none
    function figures(code, fuel) {
      var now = pair(code, fuel, last);
      if (!now) return null;
      var f = { price: now[0], pretax: now[1], tax: now[0] - now[1], share: Math.round((now[0] - now[1]) * 100 / now[0]) };
      var was = pair(code, fuel, then);
      if (was) {
        f.change = now[0] - was[0];
        f.pretaxChange = now[1] - was[1];
        f.taxChange = f.change - f.pretaxChange;
      }
      return f;
    }
    // A place's weekly series for the chart: the pump price, the price before tax, or the tax between them
    function history(code, fuel, measure) {
      var s = by[code], k = FUELS[fuel].key;
      if (measure === 'price') return s[k];
      if (measure === 'pretax') return s[k + '0'];
      return s[k].map(function (w, i) { var o = s[k + '0'][i]; return w == null || o == null ? null : w - o; });
    }
    function repeats(code) {
      return ['petrol', 'diesel'].every(function (fuel) {
        var a = pair(code, fuel, last), b = pair(code, fuel, last - 1);
        return a && b && a[0] === b[0] && a[1] === b[1];
      });
    }
    return {
      codes: codes, weeks: data.weeks, last: last, first: data.first_week, litres: data.fill_litres, scales: data.scales,
      name: function (code) { return by[code].name; },
      has: function (code) { return Object.prototype.hasOwnProperty.call(by, code); },
      day: function (i) { return weekDay(data.first_week, i); },
      figures: figures, history: history, repeats: repeats
    };
  }

  // The comparison's two sentences. a and b are figures; aName and bName are names; b may be the EU average.
  function verdict(fuel, litres, aName, a, bName, b, bIsEu) {
    if (!a || !b) return 'No figures this week for ' + (!a ? aName : bName) + '.';
    var gap = a.price - b.price, pre = a.pretax - b.pretax, tax = a.tax - b.tax;
    var where = 'in ' + place(aName), than = bIsEu ? 'at the EU average' : 'in ' + place(bName);
    var first = gap === 0
      ? 'A ' + litres + '-litre fill of ' + fuel + ' costs the same ' + where + ' as ' + than + ': ' + money(a.price, litres) + '.'
      : 'A ' + litres + '-litre fill of ' + fuel + ' costs ' + money(gap, litres) + (gap > 0 ? ' more ' : ' less ') + where + ' than ' + than + '.';
    var second;
    if (pre === 0 && tax === 0) second = '';
    else if (pre === 0) second = 'Before tax the two prices match: the gap is all tax.';
    else if (tax === 0) second = 'The tax on a litre is the same: the gap is all in the price before tax.';
    else if ((pre > 0) === (tax > 0)) second = 'Of the ' + centsPlain(gap) + '-a-litre gap, ' + centsPlain(tax) + ' is tax and ' + centsPlain(pre) + ' the price before tax.';
    else if (Math.abs(tax) >= Math.abs(pre)) second = 'Before tax it is ' + centsPlain(pre) + ' a litre ' + (pre < 0 ? 'cheaper ' : 'dearer ') + where + '; tax adds ' + centsPlain(tax) + ' the other way.';
    else second = 'Tax is ' + centsPlain(tax) + ' a litre ' + (tax < 0 ? 'lower ' : 'higher ') + where + '; the price before tax adds ' + centsPlain(pre) + ' the other way.';
    return second ? first + ' ' + second : first;
  }

  // "fell in 16 countries, rose in 10 and held in 1", from [['fell', 16], ['rose', 10], ['held', 1]]
  function tally(counts, total) {
    var parts = counts.filter(function (c) { return c[1] > 0; }).map(function (c, i) {
      return c[0] + ' in ' + (c[1] === total && total > 1 ? 'all ' : '') + c[1] + (i === 0 ? (c[1] === 1 ? ' country' : ' countries') : '');
    });
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts.join('');
  }

  // A round scale for the chart's y axis: about four steps of 5c, 10c, 20c, 25c or 50c a litre
  function axis(lo, hi) {
    var steps = [50, 100, 200, 250, 500, 1000], step = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) if ((hi - lo) / steps[i] <= 5) { step = steps[i]; break; }
    var y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    if (y1 === y0) y1 += step;
    return { y0: y0, y1: y1, step: step };
  }

  global.FuelPrices = { model: model, verdict: verdict, tally: tally, priceClass: priceClass, changeClass: changeClass, legendLabels: legendLabels, axis: axis, euros: euros, cents: cents, money: money };
  if (typeof document === 'undefined') return;

  // The page ------------------------------------------------------------------------------------------

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function svg(tag, attrs, parent) {
    var e = document.createElementNS(SVG, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function all(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }

  function init(root, m) {
    var map = root.querySelector('[data-map]'), card = root.querySelector('[data-card]');
    var compare = document.querySelector('[data-fuel-compare]'), list = document.querySelector('[data-fuel-table]');
    var links = all('a[data-code]', root), ring = root.querySelector('[data-ring]');
    var weekText = longDay(m.day(m.last));
    var state = { fuel: 'petrol', view: 'price', sel: null, a: 'FR', b: 'ES', measure: 'price', sort: 'price', dir: 1 };

    // The page's address can carry a view: ?fuel=diesel&view=change&country=FR&with=ES
    var query = {};
    location.search.replace(/^\?/, '').split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) query[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    if (FUELS[query.fuel]) state.fuel = query.fuel;
    if (query.view === 'change') state.view = 'change';
    var asked = (query.country || '').toUpperCase(), other = (query['with'] || '').toUpperCase();
    if (asked !== 'EU' && m.has(asked)) { state.sel = state.a = asked; state.b = asked === 'FR' ? 'ES' : 'EU'; }
    if (m.has(other) && other !== state.a) state.b = other;

    function address() {
      if (!history.replaceState) return;
      var parts = [];
      if (state.fuel !== 'petrol') parts.push('fuel=' + state.fuel);
      if (state.view !== 'price') parts.push('view=' + state.view);
      if (state.sel || state.a !== 'FR' || state.b !== 'ES') {
        parts.push('country=' + state.a.toLowerCase());
        parts.push('with=' + state.b.toLowerCase());
      }
      history.replaceState(null, '', location.pathname + (parts.length ? '?' + parts.join('&') : '') + location.hash);
    }

    // Tabs, wherever they sit on the page
    all('[data-controls]').forEach(function (c) { c.hidden = false; });
    function tabs(attr, key, after) {
      all('button[' + attr + ']').forEach(function (b) {
        b.addEventListener('click', function () {
          state[key] = b.getAttribute(attr);
          if (after) after();
          render();
        });
      });
    }
    tabs('data-fuel', 'fuel');
    tabs('data-view', 'view');
    tabs('data-measure', 'measure');

    function select(code, from) {
      state.sel = code || null;
      if (code) {
        state.a = code;
        if (state.b === code) state.b = 'EU';
      }
      render();
      if (from === 'table') root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (from === 'map' && card.getBoundingClientRect().top > window.innerHeight - 80) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // The map ---------------------------------------------------------------------------------------
    var tip = el('div', 'oil-tip fuel-tip', map);
    tip.setAttribute('aria-hidden', 'true');
    tip.hidden = true;
    var view = root.querySelector('.fuel-svg').viewBox.baseVal;

    function reading(code) {
      var f = m.figures(code, state.fuel);
      if (!f) return { value: 'No figure this week', sub: '' };
      if (state.view === 'price') return { value: euros(f.price) + ' a litre', sub: f.change == null ? '' : 'Four weeks: ' + cents(f.change) };
      return { value: f.change == null ? 'No figure four weeks ago' : cents(f.change) + ' in four weeks', sub: 'Now ' + euros(f.price) + ' a litre' };
    }
    function showTip(a, x, y) {
      var r = reading(a.getAttribute('data-code'));
      tip.textContent = '';
      el('p', 'oil-tip-date', tip, m.name(a.getAttribute('data-code')));
      el('p', 'oil-tip-value', tip, r.value);
      if (r.sub) el('p', 'oil-tip-sub', tip, r.sub);
      tip.hidden = false;
      var w = tip.offsetWidth, h = tip.offsetHeight, gap = 14;
      tip.style.left = Math.max(0, Math.min(map.clientWidth - w, x + gap + w > map.clientWidth ? x - gap - w : x + gap)) + 'px';
      tip.style.top = Math.max(0, y - h - gap < 0 ? y + gap : y - h - gap) + 'px';
    }
    links.forEach(function (a) {
      var title = a.querySelector('title');
      if (title) a.removeChild(title);   // the readout replaces the browser's own tooltip
      a.setAttribute('role', 'button');
      a.addEventListener('click', function (e) { e.preventDefault(); select(a.getAttribute('data-code'), 'map'); });
      a.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var box = map.getBoundingClientRect();
        showTip(a, e.clientX - box.left, e.clientY - box.top);
      });
      a.addEventListener('pointerleave', function () { tip.hidden = true; });
      a.addEventListener('focus', function () {
        var box = root.querySelector('.fuel-svg').getBoundingClientRect(), outer = map.getBoundingClientRect();
        showTip(a, box.left - outer.left + (+a.getAttribute('data-x')) / view.width * box.width, box.top - outer.top + (+a.getAttribute('data-y')) / view.height * box.height);
      });
      a.addEventListener('blur', function () { tip.hidden = true; });
    });

    function drawMap() {
      var scale = m.scales[state.fuel][state.view], letter = state.view === 'price' ? 's' : 'd';
      links.forEach(function (a) {
        var code = a.getAttribute('data-code'), f = m.figures(code, state.fuel);
        var v = f && (state.view === 'price' ? f.price : f.change);
        var cls = v == null ? 'fuel-none' : 'fuel-' + letter + (state.view === 'price' ? priceClass(v, scale) : changeClass(v, scale));
        all('.fuel-shape, .fuel-dot', a).forEach(function (p) {
          p.setAttribute('class', (p.classList.contains('fuel-dot') ? 'fuel-dot ' : 'fuel-shape ') + cls);
        });
        var r = reading(code);
        a.setAttribute('aria-label', m.name(code) + ': ' + r.value + (r.sub ? '. ' + r.sub : ''));
        a.setAttribute('aria-pressed', String(code === state.sel));
        a.classList.toggle('is-selected', code === state.sel);
        if (code === state.sel) ring.setAttribute('d', a.querySelector('.fuel-shape').getAttribute('d'));
      });
      if (!state.sel) ring.setAttribute('d', '');
      root.querySelector('.fuel-svg').setAttribute('aria-label', 'Map of the ' + m.codes.length + ' EU countries, shaded by ' +
        (state.view === 'price' ? 'the price of a litre of ' + state.fuel : 'the four-week change in the price of ' + state.fuel) + ' in the week of ' + weekText + '. Every figure is in the table on this page.');

      var legend = root.querySelector('[data-legend]');
      legend.textContent = '';
      legendLabels(state.view, scale).forEach(function (label, i) {
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

    function summary() {
      var label = FUELS[state.fuel].label, eu = m.figures('EU', state.fuel);
      var rows = m.codes.map(function (c) { return { code: c, f: m.figures(c, state.fuel) }; }).filter(function (r) { return r.f; });
      if (!rows.length || !eu) return '';
      if (state.view === 'price') {
        rows.sort(function (x, y) { return x.f.price - y.f.price; });
        var lo = rows[0], hi = rows[rows.length - 1];
        return label + ' is cheapest in ' + place(m.name(lo.code)) + ', at ' + euros(lo.f.price) + ' a litre, and dearest in ' + place(m.name(hi.code)) + ', at ' + euros(hi.f.price) + '. The EU average is ' + euros(eu.price) + '.';
      }
      rows = rows.filter(function (r) { return r.f.change != null; }).sort(function (x, y) { return x.f.change - y.f.change; });
      var fell = rows.filter(function (r) { return r.f.change < 0; }).length, rose = rows.filter(function (r) { return r.f.change > 0; }).length, held = rows.length - fell - rose;
      var text = 'Over the four weeks to ' + weekText + ', ' + state.fuel + ' ' + tally([['fell', fell], ['rose', rose], ['held', held]], rows.length) + '.';
      if (fell) text += ' The biggest fall was in ' + place(m.name(rows[0].code)) + ', ' + cents(rows[0].f.change) + ' a litre.';
      if (rose) text += ' The biggest rise was in ' + place(m.name(rows[rows.length - 1].code)) + ', ' + cents(rows[rows.length - 1].f.change) + '.';
      return text + ' The EU average moved ' + cents(eu.change) + '.';
    }

    // The card --------------------------------------------------------------------------------------
    var pick = card.querySelector('[data-country]');
    card.querySelector('[data-pick]').hidden = false;
    pick.addEventListener('change', function () { select(pick.value, 'card'); });

    function drawCard() {
      var code = state.sel || 'EU', f = m.figures(code, state.fuel), eu = m.figures('EU', state.fuel);
      var set = function (key, text) { card.querySelector('[data-' + key + ']').textContent = text; };
      set('name', m.name(code));
      set('unit', 'a litre of ' + state.fuel);
      pick.value = state.sel || '';
      card.querySelector('[data-repeats]').hidden = !(state.sel && m.repeats(code));
      card.classList.toggle('is-empty', !f);
      if (!f) { set('price', 'No figure'); return; }
      set('price', euros(f.price));
      var bars = card.querySelector('[data-split]').children;
      bars[0].style.flexGrow = 100 - f.share;
      bars[1].style.flexGrow = f.share;
      set('pretax', euros(f.pretax));
      set('tax', euros(f.tax));
      set('share', f.share + '% of the price');
      set('change', f.change == null ? 'No figure four weeks ago' : cents(f.change));
      set('parts', f.change == null ? '' : 'before tax ' + cents(f.pretaxChange) + ', tax ' + cents(f.taxChange));
      set('fill', money(f.price, m.litres));
      card.querySelector('[data-vs-row]').hidden = !state.sel || !eu;
      if (state.sel && eu) set('vs', cents(f.price - eu.price) + ' a litre');
    }

    // The comparison ----------------------------------------------------------------------------------
    var plot, chartTip;
    if (compare) {
      var selA = compare.querySelector('[data-a]'), selB = compare.querySelector('[data-b]');
      el('option', '', selB, 'EU average').value = 'EU';
      m.codes.forEach(function (c) {
        el('option', '', selA, m.name(c)).value = c;
        el('option', '', selB, m.name(c)).value = c;
      });
      selA.addEventListener('change', function () { select(selA.value, 'compare'); });
      selB.addEventListener('change', function () {
        if (selB.value === state.a) { selB.value = state.b; return; }   // a country against itself says nothing
        state.b = selB.value;
        render();
      });
      plot = compare.querySelector('[data-plot]');
      compare.hidden = false;
      var nojs = document.querySelector('[data-fuel-nojs]');
      if (nojs) nojs.hidden = true;
      if (global.ResizeObserver) new ResizeObserver(function () { drawChart(); }).observe(plot);
      else global.addEventListener('resize', drawChart);
    }

    function drawCompare() {
      if (!compare) return;
      var a = m.figures(state.a, state.fuel), b = m.figures(state.b, state.fuel), aName = m.name(state.a), bName = m.name(state.b);
      compare.querySelector('[data-a]').value = state.a;
      compare.querySelector('[data-b]').value = state.b;
      compare.querySelector('[data-verdict]').textContent = verdict(state.fuel, m.litres, aName, a, bName, b, state.b === 'EU');
      compare.querySelector('[data-head-a]').textContent = aName;
      compare.querySelector('[data-head-b]').textContent = bName;
      var body = compare.querySelector('[data-compare-rows]');
      body.textContent = '';
      var cell = function (f, fn) { return f ? fn(f) : '–'; };
      var both = function (fn) { return a && b ? fn() : ''; };
      [
        ['At the pump', cell(a, function (f) { return euros(f.price); }), cell(b, function (f) { return euros(f.price); }), both(function () { return cents(a.price - b.price); })],
        ['Before tax', cell(a, function (f) { return euros(f.pretax); }), cell(b, function (f) { return euros(f.pretax); }), both(function () { return cents(a.pretax - b.pretax); })],
        ['Tax', cell(a, function (f) { return euros(f.tax); }), cell(b, function (f) { return euros(f.tax); }), both(function () { return cents(a.tax - b.tax); })],
        ['Tax as a share of the price', cell(a, function (f) { return f.share + '%'; }), cell(b, function (f) { return f.share + '%'; }), ''],
        ['Four-week change', cell(a, function (f) { return f.change == null ? '–' : cents(f.change); }), cell(b, function (f) { return f.change == null ? '–' : cents(f.change); }), ''],
        [m.litres + '-litre fill', cell(a, function (f) { return money(f.price, m.litres); }), cell(b, function (f) { return money(f.price, m.litres); }), both(function () { return signedMoney(a.price - b.price, m.litres); })]
      ].forEach(function (row) {
        var tr = el('tr', '', body);
        el('th', '', tr, row[0]).setAttribute('scope', 'row');
        for (var i = 1; i < 4; i++) el('td', 'num', tr, row[i]);
      });
      drawChart();
    }

    function drawChart() {
      if (!plot || !plot.clientWidth) return;
      var W = plot.clientWidth, H = plot.clientHeight, narrow = W < 520;
      var pad = { l: 52, r: 16, t: 14, b: 30 }, n = m.weeks;
      var lines = [
        { code: state.a, cls: 'is-strong', values: m.history(state.a, state.fuel, state.measure) },
        { code: state.b, cls: 'is-soft', values: m.history(state.b, state.fuel, state.measure) }
      ];
      var seen = [];
      lines.forEach(function (l) { l.values.forEach(function (v) { if (v != null) seen.push(v); }); });
      plot.textContent = '';
      var key = compare.querySelector('[data-chart-key]');
      key.textContent = '';
      lines.forEach(function (l) {
        var li = el('li', '', key), sw = svg('svg', { 'class': 'oil-swatch', viewBox: '0 0 24 10', 'aria-hidden': 'true' }, li);
        svg('line', { 'class': 'ecb-line ' + l.cls, x1: 1, x2: 23, y1: 5, y2: 5 }, sw);
        li.appendChild(document.createTextNode(m.name(l.code)));
      });
      if (!seen.length) { el('p', 'oil-note', plot, 'No figures to draw.'); return; }
      var ax = axis(Math.min.apply(null, seen), Math.max.apply(null, seen));
      var x = function (i) { return pad.l + (W - pad.l - pad.r) * i / (n - 1); };
      var y = function (v) { return pad.t + (H - pad.t - pad.b) * (1 - (v - ax.y0) / (ax.y1 - ax.y0)); };
      var s = svg('svg', { 'class': 'oil-svg', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' }, plot);
      for (var v = ax.y0; v <= ax.y1; v += ax.step) {
        svg('line', { 'class': v === ax.y0 ? 'oil-axis' : 'oil-grid', x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }, s);
        var t = svg('text', { 'class': 'oil-tick', x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, s);
        t.textContent = '€' + (v / 1000).toFixed(2);
      }
      for (var i = 1; i < n; i++) {
        var d = m.day(i), before = m.day(i - 1), mo = d.getUTCMonth();
        if (mo === before.getUTCMonth() || mo % 3 || (narrow && mo % 6)) continue;
        if (x(i) > W - pad.r - 24) continue;
        var label = svg('text', { 'class': 'oil-tick', x: x(i), y: H - 8, 'text-anchor': 'middle' }, s);
        label.textContent = MONTHS[mo].slice(0, 3) + (mo === 0 || i < 14 ? ' ' + d.getUTCFullYear() : '');
        svg('line', { 'class': 'oil-axis', x1: x(i), x2: x(i), y1: H - pad.b, y2: H - pad.b + 5 }, s);
      }
      lines.slice().reverse().forEach(function (l) {   // the first country is drawn last, on top
        var dpath = '', pen = false;
        l.values.forEach(function (v, i) {
          if (v == null) { pen = false; return; }
          dpath += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
          pen = true;
        });
        svg('path', { 'class': 'ecb-line ' + l.cls, d: dpath }, s);
      });
      // Each line is named at its end as well as in the key: above the line that ends higher, below the other
      var ends = lines.map(function (l) {
        for (var k = n - 1; k >= 0; k--) if (l.values[k] != null) return { i: k, v: l.values[k] };
        return null;
      });
      lines.forEach(function (l, k) {
        var end = ends[k], rival = ends[1 - k];
        if (!end) return;
        var above = !rival || end.v > rival.v || (end.v === rival.v && k === 0);
        var name = svg('text', { 'class': 'oil-label', x: x(end.i), y: y(end.v) + (above ? -10 : 19), 'text-anchor': 'end' }, s);
        name.textContent = m.name(l.code);
      });

      // The readout: a hairline at the week, a dot on each line, and both values
      var cross = el('span', 'ecb-cross', plot), dots = lines.map(function (l) { return el('span', 'ecb-dot ' + l.cls, plot); });
      chartTip = el('div', 'oil-tip ecb-tip', plot);
      chartTip.setAttribute('aria-hidden', 'true');
      var active = null;
      function spoken(i) {
        return 'Week of ' + longDay(m.day(i)) + ': ' + lines.map(function (l) { return m.name(l.code) + ' ' + (l.values[i] == null ? 'no figure' : euros(l.values[i])); }).join(', ') + '.';
      }
      function hide() {
        active = null;
        chartTip.hidden = cross.hidden = true;
        dots.forEach(function (dot) { dot.hidden = true; });
      }
      function show(i) {
        active = i;
        cross.hidden = false;
        cross.style.left = x(i) + 'px';
        cross.style.top = pad.t + 'px';
        cross.style.bottom = pad.b + 'px';
        chartTip.textContent = '';
        el('p', 'oil-tip-date', chartTip, 'Week of ' + shortDay(m.day(i)));
        var top = H;
        lines.forEach(function (l, k) {
          var v = l.values[i];
          dots[k].hidden = v == null;
          if (v != null) {
            dots[k].style.left = x(i) + 'px';
            dots[k].style.top = y(v) + 'px';
            top = Math.min(top, y(v));
          }
          var row = el('p', 'ecb-tip-row', chartTip), sw = svg('svg', { 'class': 'oil-swatch', viewBox: '0 0 24 10' }, row);
          svg('line', { 'class': 'ecb-line ' + l.cls, x1: 1, x2: 23, y1: 5, y2: 5 }, sw);
          el('strong', 'ecb-tip-value', row, v == null ? '–' : euros(v));
          row.appendChild(document.createTextNode(m.name(l.code)));
        });
        chartTip.hidden = false;
        chartTip.classList.toggle('is-below', narrow);
        if (narrow) {
          chartTip.style.left = '0px';
          chartTip.style.top = (H + 4) + 'px';
        } else {
          var tw = chartTip.offsetWidth, gap = 14;
          chartTip.style.left = Math.max(0, x(i) + gap + tw > W ? x(i) - gap - tw : x(i) + gap) + 'px';
          chartTip.style.top = (top < pad.t + chartTip.offsetHeight + 16 ? H - pad.b - chartTip.offsetHeight - 8 : pad.t + 4) + 'px';
        }
        plot.setAttribute('aria-valuenow', String(i));
        plot.setAttribute('aria-valuetext', spoken(i));
      }
      hide();
      plot.classList.add('is-live');
      plot.setAttribute('tabindex', '0');
      plot.setAttribute('role', 'slider');
      plot.setAttribute('aria-label', MEASURES[state.measure] + ', ' + state.fuel + ', by week: ' + m.name(state.a) + ' and ' + m.name(state.b) + '. Use the arrow keys to read each week.');
      plot.setAttribute('aria-valuemin', '0');
      plot.setAttribute('aria-valuemax', String(n - 1));
      plot.setAttribute('aria-valuenow', String(n - 1));
      plot.setAttribute('aria-valuetext', spoken(n - 1));
      plot.onkeydown = function (e) {
        var i = active == null ? n - 1 : active;
        var keys = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, PageUp: i + 13, PageDown: i - 13, Home: 0, End: n - 1 };
        if (e.key === 'Escape') { hide(); return; }
        if (!(e.key in keys)) return;
        e.preventDefault();
        show(Math.max(0, Math.min(n - 1, keys[e.key])));
      };
      plot.onfocus = function () { if (active == null) show(n - 1); };
      plot.onblur = hide;
      // Hover, tap and drag. The plot only claims sideways drags (touch-action: pan-y), so a vertical swipe still scrolls.
      plot.onpointerdown = plot.onpointermove = function (e) {
        if (e.type === 'pointermove' && e.pointerType !== 'mouse' && e.buttons === 0) return;
        var box = plot.getBoundingClientRect();
        show(Math.max(0, Math.min(n - 1, Math.round((e.clientX - box.left - pad.l) / (W - pad.l - pad.r) * (n - 1)))));
      };
      plot.onpointerleave = function (e) { if (e.pointerType === 'mouse' && document.activeElement !== plot) hide(); };
      plot.onpointercancel = hide;
    }

    // The table ---------------------------------------------------------------------------------------
    var body = list && list.querySelector('tbody');
    if (list) {
      all('th[data-sort]', list).forEach(function (th) {
        var b = el('button', 'fuel-sort', null, th.textContent);
        b.type = 'button';
        th.textContent = '';
        th.appendChild(b);
        b.addEventListener('click', function () {
          var key = th.getAttribute('data-sort');
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = 1; }
          render();
        });
      });
      all('[data-country-name]', list).forEach(function (span) {
        var b = el('button', 'link-button fuel-row-pick', null, span.textContent);
        b.type = 'button';
        span.textContent = '';
        span.appendChild(b);
        b.addEventListener('click', function () { select(span.closest('tr').getAttribute('data-code'), 'table'); });
      });
    }

    function drawTable() {
      if (!list) return;
      list.setAttribute('data-show', state.fuel);
      var key = state.sort === 'fill' ? 'price' : state.sort;
      var value = function (tr) {
        var code = tr.getAttribute('data-code');
        if (key === 'name') return m.name(code);
        var f = m.figures(code, state.fuel);
        return f && f[key] != null ? f[key] : null;
      };
      all('tr', body).sort(function (r1, r2) {
        var v1 = value(r1), v2 = value(r2);
        if (v1 == null || v2 == null) return v1 == null ? (v2 == null ? 0 : 1) : -1;   // rows without a figure go last
        var c = key === 'name' ? v1.localeCompare(v2) : v1 - v2;
        return (c || m.name(r1.getAttribute('data-code')).localeCompare(m.name(r2.getAttribute('data-code')))) * state.dir;
      }).forEach(function (tr) {
        tr.classList.toggle('is-selected', tr.getAttribute('data-code') === state.sel);
        body.appendChild(tr);
      });
      all('th[data-sort]', list).forEach(function (th) {
        if (th.getAttribute('data-sort') === state.sort) th.setAttribute('aria-sort', state.dir > 0 ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      });
      var order = list.querySelector('[data-order]');
      if (order) order.hidden = true;
    }

    function render() {
      all('button[data-fuel]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-fuel') === state.fuel)); });
      all('button[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === state.view)); });
      all('button[data-measure]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-measure') === state.measure)); });
      drawMap();
      root.querySelector('[data-summary]').textContent = summary();
      drawCard();
      drawCompare();
      drawTable();
      address();
    }
    render();
  }

  function start() {
    var root = document.querySelector('[data-fuel-widget]');
    if (!root || !global.fetch) return;
    fetch(root.getAttribute('data-src')).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      // A page built from one week and data from another would disagree with itself: keep the page as built
      if (data.week !== root.getAttribute('data-week')) return;
      init(root, model(data));
    }).catch(function () { /* the page stays as Jekyll drew it */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
