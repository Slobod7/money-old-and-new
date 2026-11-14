/* The inflation-by-country page (_includes/inflation-country-chart.html and inflation-ranking.html). Jekyll draws the
   ranking and one country's chart, and both read fine without this script. It adds the choice of country, measure and
   time range, a readout on hover, tap, drag and the arrow keys, and links from the ranking to the chart.
   It reads assets/data/inflation-by-country.json from this site: no outside requests, cookies or storage. The address
   takes the choice as a fragment (#country=RO&measure=core&range=all), so a view can be shared. */
(function (root) {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MINUS = '−';
  var EURO_AREA = 'EA';
  var MEASURES = { headline: 'Inflation', core: 'Core inflation' };
  var RANGES = { '5y': 60, '10y': 120, all: null };   // months back from the latest one, as in scripts/update-inflation-data.py
  var STEPS = [1, 2, 5, 10, 20, 50], MAX_STEPS = 6;
  var SVG = 'http://www.w3.org/2000/svg';

  // The data ------------------------------------------------------------------------------------------

  function prepare(raw) {
    var d = { raw: raw, keys: [], col: {}, names: {}, euro: {}, countries: [] };
    raw.cols.forEach(function (code, i) { if (i) d.col[code] = i; });
    raw.areas.forEach(function (area) {
      d.names[area[0]] = area[1];
      d.euro[area[0]] = area[2];
      if (area[0] !== EURO_AREA) d.countries.push(area[0]);
    });
    d.keys = raw.headline.map(function (row) { return row[0]; });
    return d;
  }

  // One area's figures for every month, with null where it has none
  function series(d, measure, code) {
    var col = d.col[code];
    return d.raw[measure].map(function (row) { var v = row[col]; return typeof v === 'number' ? v : null; });
  }

  function windowStart(count, range) {
    var back = RANGES[range];
    return back == null ? 0 : Math.max(0, count - 1 - back);
  }

  // The chart's bottom, its top and the gap between its gridlines: the same rule as chart_scale in the update script
  function scale(values) {
    var lo = Math.min(0, Math.floor(Math.min.apply(null, values))), hi = Math.max(0, Math.max.apply(null, values));
    var step = STEPS[STEPS.length - 1];
    for (var i = 0; i < STEPS.length; i++) {
      if (Math.ceil(hi / STEPS[i]) + Math.floor(-lo / STEPS[i]) <= MAX_STEPS) { step = STEPS[i]; break; }
    }
    return [lo, Math.max(1, Math.ceil(hi / step)) * step, step];
  }

  // The highest figure and its month: the latest one, if it was reached twice
  function peak(values, keys) {
    var best = null;
    values.forEach(function (v, i) { if (v != null && (best == null || v >= values[best])) best = i; });
    return best == null ? null : { month: keys[best], value: values[best] };
  }

  // Years to label under the chart: every year, every second or every fifth, by how long the view is
  function yearStep(count) { return count <= 72 ? 1 : count <= 180 ? 2 : 5; }

  // Formats -------------------------------------------------------------------------------------------

  function monthName(key) { return MONTHS[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4); }
  function shortMonth(key) { return MONTHS[+key.slice(5, 7) - 1].slice(0, 3) + ' ' + key.slice(0, 4); }

  // One decimal, a real minus sign, and no sign on a figure that rounds to zero
  function num(v) {
    var text = Math.abs(v).toFixed(1);
    return (v < 0 && +text !== 0 ? MINUS : '') + text;
  }
  function pct(v) { return v == null ? '–' : num(v) + '%'; }

  // The difference between two published rates, in points. Both have one decimal, so the sum is rounded back to one.
  function gap(a, b) { return a == null || b == null ? null : Math.round((a - b) * 10) / 10; }

  function against(g, possessive) {
    if (g === 0) return 'the same as ' + possessive;
    return num(Math.abs(g)) + (Math.abs(g) === 1 ? ' point ' : ' points ') + (g > 0 ? 'above ' : 'below ') + possessive;
  }

  // The sentence above the chart: the latest month, and how far from the euro area
  function verdict(d, code, measure) {
    var last = d.keys.length - 1, own = series(d, measure, code)[last], area = series(d, measure, EURO_AREA)[last];
    return MEASURES[measure] + ' in ' + d.names[code] + ' was ' + pct(own) + ' in ' + monthName(d.keys[last]) + ', ' +
      against(gap(own, area), 'the euro area’s ' + pct(area)) + '.';
  }

  function record(d, code, measure) {
    var values = series(d, measure, code), top = peak(values, d.keys), first = 0;
    while (values[first] == null) first++;
    return 'Highest since ' + monthName(d.keys[first]) + ': ' + pct(top.value) + ' in ' + monthName(top.month) + '.';
  }

  // The address ---------------------------------------------------------------------------------------

  // A fragment such as #country=RO&measure=core&range=all, as the choices it names. Every value is checked against
  // the data, and one bad value refuses the whole fragment. Null when it names none of the three.
  function parseHash(hash, d) {
    var out = {}, found = false, ok = true;
    String(hash || '').replace(/^#/, '').split('&').forEach(function (part) {
      var at = part.indexOf('='), key = at < 0 ? part : part.slice(0, at), value = at < 0 ? '' : part.slice(at + 1);
      if (key === 'country') { found = true; if (d.countries.indexOf(value) < 0) ok = false; else out.country = value; }
      else if (key === 'measure') { found = true; if (!MEASURES.hasOwnProperty(value)) ok = false; else out.measure = value; }
      else if (key === 'range') { found = true; if (!RANGES.hasOwnProperty(value)) ok = false; else out.range = value; }
    });
    return found && ok ? out : null;
  }

  function hashFor(state) {
    return '#country=' + state.country + (state.measure === 'core' ? '&measure=core' : '') + (state.range === '10y' ? '' : '&range=' + state.range);
  }

  var api = { prepare: prepare, series: series, windowStart: windowStart, scale: scale, peak: peak, yearStep: yearStep, monthName: monthName,
    num: num, pct: pct, gap: gap, against: against, verdict: verdict, record: record, parseHash: parseHash, hashFor: hashFor };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.InflationByCountry = api;

  // The page ------------------------------------------------------------------------------------------

  var document = root.document;
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

  function swatch(cls) {
    var key = svg('svg', { 'class': 'oil-swatch', viewBox: '0 0 24 10', 'aria-hidden': 'true' });
    svg('line', { 'class': 'ecb-line ' + cls, x1: 1, x2: 23, y1: 5, y2: 5 }, key);
    return key;
  }

  function initChart(figure, d, first) {
    var plot = figure.querySelector('[data-plot]'), panel = figure.querySelector('[data-panel]');
    var select = figure.querySelector('[data-country-select]'), body = figure.querySelector('[data-months]');
    if (!plot || !panel || !select || !body) return null;

    var state = { country: figure.getAttribute('data-country'), measure: 'headline', range: figure.getAttribute('data-range') };
    if (d.countries.indexOf(state.country) < 0) state.country = d.countries[0];
    if (!RANGES.hasOwnProperty(state.range)) state.range = '10y';

    var out = {};
    ['verdict', 'record', 'key', 'desc', 'head-own', 'head-own-core'].forEach(function (name) { out[name] = figure.querySelector('[data-out="' + name + '"]'); });
    var view = null;   // what the chart shows now: where it starts, both lines and the scale
    var active = null;
    var cross, dots, tip;

    // Every change of view is written to the address in full, so the address always names what the chart shows
    function apply(changes) {
      Object.keys(changes).forEach(function (k) { state[k] = changes[k]; });
      draw();
      if (first && root.history && root.history.replaceState) {
        try { root.history.replaceState(null, '', hashFor(state)); } catch (e) { /* a sandboxed frame: the view still changes */ }
      }
    }

    function draw() {
      var start = windowStart(d.keys.length, state.range);
      var own = series(d, state.measure, state.country).slice(start), area = series(d, state.measure, EURO_AREA).slice(start);
      var keys = d.keys.slice(start), n = keys.length - 1;
      var sc = scale(own.concat(area).filter(function (v) { return v != null; }));
      view = { keys: keys, own: own, area: area, lo: sc[0], hi: sc[1], n: n };
      var y = function (v) { return ((sc[1] - v) / (sc[1] - sc[0]) * 1000).toFixed(1); };
      var points = function (values) {
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
      svg('polyline', { 'class': 'ecb-line is-soft', points: points(area) }, chart);
      svg('polyline', { 'class': 'ecb-line is-strong', points: points(own) }, chart);
      var every = yearStep(keys.length);
      keys.forEach(function (key, i) {
        var year = +key.slice(0, 4);
        if (key.slice(5) !== '01' || year % every) return;
        el('span', 'oil-static-x' + (year % (every * 2) ? ' is-minor' : ''), panel, String(year)).style.left = (i / n * 100).toFixed(2) + '%';
      });
      cross = el('span', 'ecb-cross', panel);
      dots = [el('span', 'ecb-dot is-strong', panel), el('span', 'ecb-dot is-soft', panel)];
      hide();

      var name = d.names[state.country], what = MEASURES[state.measure];
      select.value = state.country;
      [].forEach.call(figure.querySelectorAll('[data-measure]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-measure') === state.measure)); });
      [].forEach.call(figure.querySelectorAll('button[data-range]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-range') === state.range)); });
      if (out.verdict) out.verdict.textContent = verdict(d, state.country, state.measure);
      if (out.record) out.record.textContent = record(d, state.country, state.measure);
      if (out.key) out.key.textContent = name;
      if (out['head-own']) out['head-own'].textContent = name;
      if (out['head-own-core']) out['head-own-core'].textContent = name + ', core';
      if (out.desc) {
        out.desc.textContent = 'Line chart of ' + what.toLowerCase() + ' in ' + name + ' and in the euro area, monthly from ' + monthName(keys[0]) + ' to ' +
          monthName(keys[n]) + '. ' + verdict(d, state.country, state.measure) + ' Every month is in the table below.';
      }
      plot.setAttribute('aria-label', what + ' in ' + name + ' and in the euro area by month. Use the arrow keys to read each month.');
      plot.setAttribute('aria-valuemax', String(n));
      plot.setAttribute('aria-valuenow', String(n));
      plot.setAttribute('aria-valuetext', spoken(n));
      table();
      if (first) markRanking(state.country);
    }

    // Every month since the first, newest first, whatever the chart's range: both measures, for the country and the area
    function table() {
      if (body.getAttribute('data-for') === state.country) return;
      var cols = [series(d, 'headline', state.country), series(d, 'headline', EURO_AREA), series(d, 'core', state.country), series(d, 'core', EURO_AREA)];
      var rows = document.createDocumentFragment();
      for (var i = d.keys.length - 1; i >= 0; i--) {
        var tr = el('tr', '', rows);
        el('th', '', tr, shortMonth(d.keys[i])).setAttribute('scope', 'row');
        for (var c = 0; c < cols.length; c++) el('td', 'num', tr, pct(cols[c][i]));
      }
      body.textContent = '';
      body.appendChild(rows);
      body.setAttribute('data-for', state.country);
    }

    function spoken(i) {
      var g = gap(view.own[i], view.area[i]);
      return monthName(view.keys[i]) + ': ' + d.names[state.country] + ' ' + (view.own[i] == null ? 'no figure' : pct(view.own[i])) + ', euro area ' +
        (view.area[i] == null ? 'no figure' : pct(view.area[i])) + (g == null ? '.' : ', ' + against(g, 'the euro area') + '.');
    }

    function show(i) {
      active = i;
      var left = i / view.n * 100, values = [view.own[i], view.area[i]], top = 100;
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
      [[d.names[state.country], 'is-strong'], ['Euro area', 'is-soft']].forEach(function (line, k) {
        var row = el('p', 'ecb-tip-row', tip);
        row.appendChild(swatch(line[1]));
        el('strong', 'ecb-tip-value', row, pct(values[k]));
        row.appendChild(document.createTextNode(line[0]));
      });
      var g = gap(values[0], values[1]);
      if (g != null) el('p', 'oil-tip-event', tip, against(g, 'the euro area').replace(/^t/, 'T'));
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

    select.addEventListener('change', function () { apply({ country: select.value }); });
    figure.addEventListener('click', function (e) {
      var button = e.target.closest ? e.target.closest('button[data-measure], button[data-range]') : null;
      if (!button || !figure.contains(button)) return;
      apply(button.hasAttribute('data-measure') ? { measure: button.getAttribute('data-measure') } : { range: button.getAttribute('data-range') });
    });

    var controls = figure.querySelector('[data-controls]'), fallback = figure.querySelector('[data-nojs]');
    if (controls) controls.hidden = false;
    if (fallback) fallback.hidden = true;

    return {
      draw: draw,
      // A choice that came from the address or from a link in the ranking: show it and bring the chart into view.
      // A link from the ranking names only the country, so the measure and the range stay as they were.
      open: function (choice) {
        apply(choice);
        figure.scrollIntoView();
        try { select.focus({ preventScroll: true }); } catch (e) { select.focus(); }
      }
    };
  }

  // The ranking: each country's name becomes a link that shows it in the chart, and the chart's country is underlined
  function linkRanking(d) {
    [].forEach.call(document.querySelectorAll('[data-inflation-ranking] tr[data-code]'), function (row) {
      var code = row.getAttribute('data-code'), name = row.querySelector('[data-country-name]');
      if (!name || d.countries.indexOf(code) < 0) return;
      var link = el('a', '', null, name.textContent);
      link.href = '#country=' + code;
      name.textContent = '';
      name.appendChild(link);
    });
    [].forEach.call(document.querySelectorAll('[data-inflation-ranking] [data-pick-hint]'), function (hint) { hint.hidden = false; });
  }

  function markRanking(code) {
    [].forEach.call(document.querySelectorAll('[data-inflation-ranking] tr[data-code]'), function (row) {
      row.classList.toggle('is-selected', row.getAttribute('data-code') === code);
    });
  }

  function start() {
    var figures = [].slice.call(document.querySelectorAll('[data-inflation-chart]'));
    if (!figures.length || !root.fetch) return;
    load(figures[0].getAttribute('data-src')).then(function (d) {
      var charts = figures.map(function (figure, i) { return initChart(figure, d, i === 0); }).filter(Boolean);
      if (!charts.length) return;
      charts.forEach(function (chart) { chart.draw(); });
      linkRanking(d);
      var first = charts[0], asked = parseHash(root.location.hash, d);
      if (asked) first.open(asked);
      root.addEventListener('hashchange', function () {
        var choice = parseHash(root.location.hash, d);
        if (choice) first.open(choice);
      });
    }).catch(function () { /* the data didn't load: the page keeps the chart and ranking Jekyll drew */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
