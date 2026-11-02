// The oil widgets: the Brent chart (_includes/oil-chart.html) and the oil calculator (_includes/oil-calculator.html).
// Only those includes load this file. Without it, each still shows its figures: annual averages, a worked example and the rules.
// Everything comes from assets/data/oil.json on this site, which scripts/update-oil-data.py writes. Nothing else is requested.
(function () {
  if (window.OilWidgets) return;  // every include adds this script, so a page with several widgets runs it once

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var SYMBOL = { USD: '$', EUR: '€' };
  var MINUS = '−';
  var DAY = 86400000;
  var SVG = 'http://www.w3.org/2000/svg';

  // Formatting: en-GB for both currencies ("$1,234", "€1,234"), dates like "March 2008" and "3 July 2008"

  function num(n, dp) {
    return n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function signed(n, dp, text) {
    var rounded = Number(Math.abs(n).toFixed(dp));
    if (rounded === 0) return text;
    return (n < 0 ? MINUS : '+') + text;
  }
  function money(n, cur, dp, withSign) {
    var text = SYMBOL[cur] + num(Math.abs(n), dp || 0);
    if (withSign) return signed(n, dp || 0, text);
    return n < 0 && Number(Math.abs(n).toFixed(dp || 0)) !== 0 ? MINUS + text : text;
  }
  function usd(n) { return money(n, 'USD', 2); }
  function pct(x, dp, withSign) {
    var text = num(Math.abs(x * 100), dp) + '%';
    if (withSign) return signed(x * 100, dp, text);
    return x < 0 && Number(Math.abs(x * 100).toFixed(dp)) !== 0 ? MINUS + text : text;
  }
  function time(iso) {
    var p = iso.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +(p[2] || 1));
  }
  function monthName(key) { return MONTHS[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4); }
  function dayName(iso) { return +iso.slice(8, 10) + ' ' + monthName(iso); }
  function dayMonth(iso) { return +iso.slice(8, 10) + ' ' + MONTHS[+iso.slice(5, 7) - 1]; }

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
    var col = function (name) { return raw.monthly_cols.indexOf(name); };
    var c = { key: col('month'), avg: col('avg'), day: col('first_day'), first: col('first_price'), cpi: col('cpi'), hicp: col('hicp'), fx: col('eurusd_first') };
    var months = raw.monthly.map(function (r) {
      var day = r[c.day];
      return { key: r[c.key], avg: r[c.avg], date: r[c.key] + (day < 10 ? '-0' : '-') + day, first: r[c.first], cpi: r[c.cpi], hicp: r[c.hicp], fx: r[c.fx] };
    });
    var index = {}, ref = { cpi: null, hicp: null }, refMonth = {};
    months.forEach(function (m, i) {
      index[m.key] = i;
      // "Today's money" is money at the latest published index
      if (m.cpi != null) { ref.cpi = m.cpi; refMonth.cpi = m.key; }
      if (m.hicp != null) { ref.hicp = m.hicp; refMonth.hicp = m.key; }
    });
    return {
      raw: raw, months: months, index: index, ref: ref, refMonth: refMonth,
      daily: raw.daily.map(function (r) { return { date: r[0], price: r[1] }; }),
      annual: raw.annual.map(function (r) { return { year: r[0], avg: r[1] }; }),
      latest: { date: raw.latest[0], price: raw.latest[1], fx: raw.latest[2] }
    };
  }

  // A month's price index (CPI or HICP). Months after the latest published one count as today's money.
  function indexFor(d, key, which) {
    var m = d.months[d.index[key.slice(0, 7)]];
    if (m && m[which] != null) return m[which];
    if (key.slice(0, 7) > d.refMonth[which]) return d.ref[which];
    throw new Error('No ' + which.toUpperCase() + ' for ' + key);
  }

  // The calculator's maths -------------------------------------------------------------------------
  // o: { mode: 'lump' or 'monthly', amount, start: 'YYYY-MM', currency: 'USD' or 'EUR', real: true or false }
  // Buys at the first-trading-day price of each month (once, for a lump sum), fractions of a barrel allowed.
  // In euros, each purchase converts at that day's ECB rate and the value converts back at the rate on the latest price's date.
  // The value is checked on every first trading day and on the latest price's date; those are the points of the chart.

  function calculate(d, o) {
    var start = d.index[o.start];
    if (start == null) throw new Error('No price data for ' + o.start);
    var eur = o.currency === 'EUR', which = eur ? 'hicp' : 'cpi', ref = d.ref[which], amount = o.amount;
    if (eur && d.months[start].fx == null) throw new Error('No euro rate for ' + o.start);
    var barrels = 0, putIn = 0, perIndex = 0, buys = [], points = [];
    for (var i = start; i < d.months.length; i++) {
      var m = d.months[i], rate = eur ? m.fx : 1, idx = indexFor(d, m.key, which);
      if (o.mode === 'monthly' || i === start) {
        barrels += amount * rate / m.first;
        putIn += amount;
        perIndex += amount / idx;
        buys.push({ date: m.date, amount: amount, real: amount * ref / idx });
      }
      // kept: the money put in so far, grown in step with consumer prices to this month
      points.push({ date: m.date, value: barrels * m.first / rate, putIn: putIn, kept: perIndex * idx });
    }
    var L = d.latest, value = barrels * L.price / (eur ? L.fx : 1), putInReal = perIndex * ref;
    points.push({ date: L.date, value: value, putIn: putIn, kept: putInReal });

    var base = o.real ? putInReal : putIn, worst = null;
    points.forEach(function (p) {
      var against = o.real ? p.kept : p.putIn, gap = p.value / against - 1;
      if (!worst || gap < worst.gap) worst = { date: p.date, gap: gap, value: p.value, against: against };
    });

    var days = (time(L.date) - time(buys[0].date)) / DAY, annual = null;
    if (days >= 365) {
      annual = o.mode === 'lump'
        ? Math.pow(value / (o.real ? buys[0].real : amount), 365 / days) - 1
        : xirr(buys.map(function (b) { return [b.date, -(o.real ? b.real : b.amount)]; }).concat([[L.date, value]]));
    }
    return {
      barrels: barrels, putIn: putIn, putInReal: putInReal, value: value,
      gain: value - base, gainPct: value / base - 1, annual: annual, days: days,
      worst: worst, points: points, buys: buys, latest: L
    };
  }

  // Money-weighted annual return: the yearly rate r at which the payments, compounded to the end, equal the value.
  // Flows are [date, amount] with payments negative; days count as fractions of a 365-day year, as in Excel's XIRR.
  // The payments all come before the one final value, so there is exactly one answer, found by halving the interval.
  function xirr(flows) {
    var t0 = time(flows[0][0]);
    var years = flows.map(function (f) { return (time(f[0]) - t0) / DAY / 365; });
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

  // Drawing helpers --------------------------------------------------------------------------------

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

  // A y scale from 0 (or near the lowest value, when everything sits well above 0) to a little above the highest
  function yScale(values, top, bottom, count, headroom) {
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var hi = max * (1 + headroom), lo = min > max * 0.45 ? min * 0.9 : 0;
    var step = niceStep(hi - lo, count);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    var ticks = [];
    for (var v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v / step) * step);
    return { ticks: ticks, at: function (v) { return bottom - (v - lo) / (hi - lo) * (bottom - top); } };
  }

  // Ticks along a time axis: years for monthly data, months for daily data, spaced at least minGap pixels apart
  function timeTicks(t0, t1, left, right, daily, minGap) {
    var x = function (t) { return left + (t - t0) / (t1 - t0 || 1) * (right - left); };
    var out = [], y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
    if (daily) {
      var perMonth = (right - left) / ((t1 - t0) / DAY / 30.44), step = [1, 2, 3, 6].filter(function (s) { return s * perMonth >= minGap; })[0] || 12;
      for (var y = y0; y <= y1; y++) {
        for (var m = 0; m < 12; m += step) {
          var t = Date.UTC(y, m, 1);
          if (t >= t0 && t <= t1) out.push({ x: x(t), label: SHORT[m] + (m === 0 || !out.length ? ' ' + y : '') });
        }
      }
    } else {
      var perYear = (right - left) / ((t1 - t0) / DAY / 365.25), ystep = [1, 2, 5, 10].filter(function (s) { return s * perYear >= minGap; })[0] || 20;
      for (var yr = Math.ceil(y0 / ystep) * ystep; yr <= y1; yr += ystep) {
        var ty = Date.UTC(yr, 0, 1);
        if (ty >= t0 - 20 * DAY && ty <= t1) out.push({ x: x(Math.max(ty, t0)), label: String(yr) });
      }
    }
    return out;
  }

  function drawAxes(svg, y, ticks, xticks, left, right, bottom, fmt) {
    ticks.forEach(function (v) {
      var py = Math.round(y.at(v)) + 0.5;
      svgEl('line', { class: v === ticks[0] && v === 0 ? 'oil-axis' : 'oil-grid', x1: left, x2: right, y1: py, y2: py }, svg);
      svgEl('text', { class: 'oil-tick', x: left - 8, y: py, dy: '0.32em', 'text-anchor': 'end' }, svg).textContent = fmt(v);
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

  // Redraw when the widget changes width, at most once a frame
  function onResize(node, draw) {
    var width = node.clientWidth, queued = false;
    var check = function () {
      queued = false;
      if (node.clientWidth !== width) { width = node.clientWidth; draw(); }
    };
    var queue = function () { if (!queued) { queued = true; requestAnimationFrame(check); } };
    if (window.ResizeObserver) new ResizeObserver(queue).observe(node);
    else window.addEventListener('resize', queue);
  }

  // The Brent chart --------------------------------------------------------------------------------

  var RANGES = { '1y': 1, '5y': 5, '10y': 10, '20y': 20, all: null };
  var RANGE_NAMES = { '1y': 'the past year', '5y': 'the past 5 years', '10y': 'the past 10 years', '20y': 'the past 20 years', all: 'since 1990' };

  // The annotations. Their figures come from the data (the events in oil.json), never from this file.
  // f is the event's list of [date, price] facts; the marker goes on the last one. Lows put their label below the line.
  var EVENTS = {
    kuwait: { label: 'Iraq invades Kuwait', text: function (f) {
      return 'Iraq invaded Kuwait on ' + dayName(f[0][0]) + ', when Brent was ' + usd(f[0][1]) + '. It peaked at ' + usd(f[1][1]) + ' on ' + dayMonth(f[1][0]) + '.';
    } },
    peak2008: { label: '2008 peak', text: function (f, d) {
      var record = d.raw.events.record && d.raw.events.record[0][0] === f[0][0];
      return 'Brent reached ' + usd(f[0][1]) + ' on ' + dayName(f[0][0]) + (record ? ', its highest price in EIA records since 1987' : '') + '. The ECB raised interest rates days later, then cut them in October.';
    } },
    crash2016: { label: '2014–16 crash', low: true, text: function (f) {
      return 'Brent fell from ' + usd(f[0][1]) + ' on ' + dayName(f[0][0]) + ' to ' + usd(f[1][1]) + ' on ' + dayName(f[1][0]) + '.';
    } },
    covid2020: { label: 'Covid low', low: true, text: function (f) {
      return 'Brent fell to ' + usd(f[0][1]) + ' on ' + dayName(f[0][0]) + '. WTI, the US benchmark, went below zero the day before; Brent didn’t.';
    } },
    ukraine2022: { label: 'Russia invades Ukraine', text: function (f) {
      return 'Russia invaded Ukraine on ' + dayName(f[0][0]) + ', when Brent was ' + usd(f[0][1]) + '. It reached ' + usd(f[1][1]) + ' on ' + dayMonth(f[1][0]) + '.';
    } },
    iran2026: { label: 'Iran war', text: function (f, d) {
      var year = f[0][0].slice(0, 4), sofar = String(d.raw.partial_year) === year;
      return 'During the Iran war, Brent’s ' + year + ' high' + (sofar ? ' so far' : '') + ' was ' + usd(f[0][1]) + ', on ' + dayMonth(f[0][0]) + '.';
    } }
  };

  function chartSeries(d, range, real) {
    var out = [], adjust = function (price, key) { return real ? price * d.ref.cpi / indexFor(d, key, 'cpi') : price; };
    if (range === '1y') {
      var last = d.latest.date, cut = (+last.slice(0, 4) - 1) + last.slice(4);
      d.daily.forEach(function (r) {
        if (r.date > cut) out.push({ key: r.date, t: time(r.date), nominal: r.price, value: adjust(r.price, r.date), daily: true });
      });
    } else {
      var years = RANGES[range], from = years ? Math.max(0, d.months.length - years * 12) : 0;
      for (var i = from; i < d.months.length; i++) {
        var m = d.months[i];
        out.push({ key: m.key, t: time(m.key), nominal: m.avg, value: adjust(m.avg, m.key), partial: m.key === d.raw.partial_month });
      }
    }
    return out;
  }

  function annualValue(d, row, real) {
    if (!real) return row.avg;
    var cpis = d.months.filter(function (m) { return +m.key.slice(0, 4) === row.year && m.cpi != null; }).map(function (m) { return m.cpi; });
    var mean = cpis.reduce(function (a, b) { return a + b; }, 0) / cpis.length;
    return row.avg * d.ref.cpi / mean;
  }

  function chartSummary(d, range, real, pts) {
    var who = real ? 'In today’s dollars, Brent' : 'Brent', first = pts[0], last = pts[pts.length - 1], high = pts[0];
    pts.forEach(function (p) { if (p.value > high.value) high = p; });
    if (range === '1y') {
      return who + ' was ' + usd(first.value) + ' a barrel on ' + dayName(first.key) + ' and ' + usd(last.value) + ' on ' + dayName(last.key) +
        '. Its high in that time was ' + usd(high.value) + ', on ' + dayName(high.key) + '.';
    }
    if (range === 'all') {
      var a0 = d.annual[0], a1 = d.annual[d.annual.length - 1];
      return who + ' averaged ' + usd(annualValue(d, a0, real)) + ' a barrel in ' + a0.year + ' and ' + usd(annualValue(d, a1, real)) + ' in ' + a1.year +
        (a1.year === d.raw.partial_year ? ' so far' : '') + '. Its highest monthly average was ' + usd(high.value) + ', in ' + monthName(high.key) + '.';
    }
    return who + ' averaged ' + usd(first.value) + ' a barrel in ' + monthName(first.key) + ' and ' + usd(last.value) + ' in ' + monthName(last.key) +
      (last.partial ? ' so far' : '') + '. Its highest monthly average in that time was ' + usd(high.value) + ', in ' + monthName(high.key) + '.';
  }

  function pointName(p, d) {
    if (p.daily) return dayName(p.key);
    return monthName(p.key) + (p.partial ? ', average to ' + dayMonth(d.latest.date) : ', monthly average');
  }

  function initChart(root) {
    var plot = root.querySelector('[data-plot]'), controls = root.querySelector('[data-controls]');
    var summary = root.querySelector('[data-summary]'), events = root.querySelector('[data-events]');
    var state = { range: RANGES.hasOwnProperty(root.getAttribute('data-range')) ? root.getAttribute('data-range') : 'all', real: false };
    var d, pts, layout, svg, tip, active = null, pointerType = null;

    load(root.getAttribute('data-src')).then(function (data) {
      d = data;
      controls.hidden = false;
      plot.textContent = '';
      plot.classList.add('is-live');
      plot.setAttribute('tabindex', '0');
      plot.setAttribute('role', 'slider');
      plot.setAttribute('aria-describedby', events.id);
      tip = document.createElement('div');
      tip.className = 'oil-tip';
      tip.hidden = true;
      tip.setAttribute('aria-hidden', 'true');
      controls.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-range')) state.range = b.getAttribute('data-range');
        if (b.hasAttribute('data-real')) state.real = b.getAttribute('data-real') === 'true';
        active = null;
        update();
      });
      plot.addEventListener('keydown', onKey);
      plot.addEventListener('focus', function () { if (active == null) show(pts.length - 1); });
      plot.addEventListener('blur', function () { hide(); });
      plot.addEventListener('pointerdown', onPointer);
      plot.addEventListener('pointermove', onPointer);
      plot.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && document.activeElement !== plot) hide(); });
      plot.addEventListener('pointercancel', function () { hide(); });  // the browser took the gesture for scrolling
      document.addEventListener('pointerdown', function (e) { if (!plot.contains(e.target) && document.activeElement !== plot) hide(); });
      onResize(plot, draw);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
      update();
    }).catch(function () {
      summary.textContent = 'The interactive chart couldn’t load, so this shows annual averages. The figures are in the table below.';
    });

    function update() {
      controls.querySelectorAll('button').forEach(function (b) {
        var on = b.hasAttribute('data-range') ? b.getAttribute('data-range') === state.range : (b.getAttribute('data-real') === 'true') === state.real;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      pts = chartSeries(d, state.range, state.real);
      summary.textContent = chartSummary(d, state.range, state.real, pts);
      plot.setAttribute('aria-label', 'Brent price chart, ' + RANGE_NAMES[state.range] + (state.real ? ', in today’s dollars' : '') + '. Use the arrow keys to read each point.');
      plot.setAttribute('aria-valuemin', '0');
      plot.setAttribute('aria-valuemax', String(pts.length - 1));
      plot.setAttribute('aria-valuenow', String(pts.length - 1));
      draw();
      plot.setAttribute('aria-valuetext', describe(pts.length - 1).text);
    }

    function draw() {
      if (!pts) return;
      var w = plot.clientWidth, h = plot.clientHeight, narrow = w < 560;
      var left = narrow ? 38 : 46, right = w - (narrow ? 8 : 12), top = 26, bottom = h - 30;
      var t0 = pts[0].t, t1 = pts[pts.length - 1].t;
      var x = function (t) { return left + (t - t0) / (t1 - t0 || 1) * (right - left); };
      var y = yScale(pts.map(function (p) { return p.value; }), top, bottom, narrow ? 4 : 5, narrow ? 0.06 : 0.1);
      layout = { x: x, y: y, w: w, h: h, top: top, bottom: bottom, narrow: narrow, marks: [] };

      if (svg) svg.remove();
      svg = svgEl('svg', { class: 'oil-svg', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true', focusable: 'false' });
      plot.insertBefore(svg, tip.parentNode === plot ? tip : null);  // in the page first, so labels can be measured
      drawAxes(svg, y, y.ticks, timeTicks(t0, t1, left, right, state.range === '1y', narrow ? 50 : 64), left, right, bottom, function (v) { return '$' + num(v, 0); });
      svgEl('path', { class: 'oil-line', d: pathFrom(pts.map(function (p) { return [x(p.t), y.at(p.value)]; })) }, svg);

      // Annotations: markers always; labels beside them on wider screens, in the tooltip on phones
      var placed = [], items = [];
      Object.keys(EVENTS).forEach(function (id) {
        var facts = d.raw.events[id];
        if (!facts) return;
        var anchor = facts[facts.length - 1][0], key = state.range === '1y' ? anchor : anchor.slice(0, 7);
        var i = -1;
        for (var k = 0; k < pts.length; k++) if (pts[k].key === key) i = k;
        if (i < 0) return;
        var ev = EVENTS[id], px = x(pts[i].t), py = y.at(pts[i].value);
        layout.marks.push({ i: i, x: px, ev: ev, text: ev.text(facts, d) });
        items.push(ev.label + ': ' + ev.text(facts, d));
        svgEl('circle', { class: 'oil-mark', cx: px, cy: py, r: 4 }, svg);
        if (!narrow) placed.push(placeLabel(ev, px, py, left, right, placed));
      });
      events.textContent = items.length ? 'Marked on the chart: ' + items.join(' ') : '';

      layout.cross = svgEl('line', { class: 'oil-cross', x1: 0, x2: 0, y1: top - 6, y2: bottom, visibility: 'hidden' }, svg);
      layout.dot = svgEl('circle', { class: 'oil-dot', r: 4.5, visibility: 'hidden' }, svg);
      plot.appendChild(tip);
      if (active != null) show(Math.min(active, pts.length - 1));
      else tip.hidden = true;
    }

    function describe(i) {
      var p = pts[i], mark = null;
      layout.marks.forEach(function (m) { if (m.i === i) mark = m; });
      var name = pointName(p, d), main = usd(p.value) + (state.real ? ' in today’s dollars' : '');
      var sub = state.real ? usd(p.nominal) + ' at the time' : '';
      return { p: p, mark: mark, name: name, main: main, sub: sub,
        text: name + ': ' + main + (sub ? ', ' + sub : '') + (mark ? '. ' + mark.ev.label + '. ' + mark.text : '') };
    }

    // Try each label above (or, for lows, below) its marker: centred, then to one side, then a line further out
    function placeLabel(ev, px, py, left, right, placed) {
      var label = svgEl('text', { class: 'oil-label', y: 0 }, svg);
      label.textContent = ev.label;
      var width = label.getComputedTextLength ? label.getComputedTextLength() : ev.label.length * 6.5;
      var dir = ev.low ? 1 : -1, base = py + dir * 12;
      for (var level = 0; level < 3; level++) {
        var ly = base + dir * level * 16;
        var options = [[px - width / 2, 'middle', px], [px - width + 6, 'end', px + 6], [px - 6, 'start', px - 6]];
        for (var o = 0; o < options.length; o++) {
          var x0 = options[o][0], box = { x0: x0 - 4, x1: x0 + width + 4, y0: ly - 12, y1: ly + 4 };
          if (box.x0 < left - 30 || box.x1 > right + 6 || box.y0 < 2 || box.y1 > layout.bottom + 2) continue;
          if (placed.some(function (b) { return b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1; })) continue;
          label.setAttribute('x', options[o][2]);
          label.setAttribute('y', ev.low ? ly + 4 : ly);
          label.setAttribute('text-anchor', options[o][1]);
          if (level) svgEl('line', { class: 'oil-leader', x1: px, x2: px, y1: py + dir * 6, y2: ev.low ? ly - 8 : ly + 3 }, svg);
          return box;
        }
      }
      label.remove();
      return { x0: 0, x1: 0, y0: 0, y1: 0 };
    }

    function show(i) {
      active = i;
      var info = describe(i), p = info.p, mark = info.mark, px = layout.x(p.t), py = layout.y.at(p.value);
      layout.cross.setAttribute('x1', px);
      layout.cross.setAttribute('x2', px);
      layout.cross.setAttribute('visibility', 'visible');
      layout.dot.setAttribute('cx', px);
      layout.dot.setAttribute('cy', py);
      layout.dot.setAttribute('visibility', 'visible');

      tip.innerHTML = '';
      [['oil-tip-date', info.name], ['oil-tip-value', info.main], ['oil-tip-sub', info.sub]].forEach(function (row) {
        if (!row[1]) return;
        var el = document.createElement('p');
        el.className = row[0];
        el.textContent = row[1];
        tip.appendChild(el);
      });
      if (mark) {
        var ev = document.createElement('p');
        ev.className = 'oil-tip-event';
        var strong = document.createElement('strong');
        strong.textContent = mark.ev.label + '. ';
        ev.appendChild(strong);
        ev.appendChild(document.createTextNode(mark.text));
        tip.appendChild(ev);
      }
      tip.hidden = false;
      // On phones the readout sits just below the chart, full width, so it never hides the line being read
      tip.classList.toggle('is-below', layout.narrow);
      if (layout.narrow) {
        tip.style.left = '0px';
        tip.style.top = (layout.h + 4) + 'px';
      } else {
        var tw = tip.offsetWidth, gap = 14, tx = px + gap;
        if (tx + tw > layout.w) tx = px - gap - tw;
        tip.style.left = Math.max(0, Math.min(layout.w - tw, tx)) + 'px';
        tip.style.top = (py < layout.top + tip.offsetHeight + 16 ? layout.bottom - tip.offsetHeight - 8 : 4) + 'px';
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

    function onKey(e) {
      var last = pts.length - 1, i = active == null ? last : active, page = state.range === '1y' ? 21 : 12;
      var keys = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, PageUp: i + page, PageDown: i - page, Home: 0, End: last };
      if (e.key === 'Escape') { hide(); return; }
      if (!(e.key in keys)) return;
      e.preventDefault();
      show(Math.max(0, Math.min(last, keys[e.key])));
    }

    // Hover, tap and drag. The plot only claims sideways drags (touch-action: pan-y), so vertical swipes still scroll the page.
    function onPointer(e) {
      if (!layout || (e.type === 'pointermove' && e.pointerType !== 'mouse' && e.buttons === 0)) return;
      pointerType = e.pointerType;
      var rect = plot.getBoundingClientRect(), px = e.clientX - rect.left, best = 0;
      var lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (layout.x(pts[mid].t) < px) lo = mid; else hi = mid;
      }
      best = Math.abs(layout.x(pts[lo].t) - px) <= Math.abs(layout.x(pts[hi].t) - px) ? lo : hi;
      // Snap to a marker within reach of a fingertip, so phones can open an annotation
      var reach = pointerType === 'mouse' ? 8 : 16;
      layout.marks.forEach(function (m) { if (Math.abs(m.x - px) <= reach && Math.abs(m.x - px) < Math.abs(layout.x(pts[best].t) - px) + reach) best = m.i; });
      show(best);
    }
  }

  // The calculator ---------------------------------------------------------------------------------

  var DEFAULTS = { lump: 1000, monthly: 100 };

  function parseAmount(text) {
    var clean = String(text).replace(/[\s,$€£]/g, '');
    if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
    var n = parseFloat(clean);
    return n >= 1 && n <= 100000000 ? n : null;
  }

  function initCalculator(root) {
    var form = root.querySelector('[data-form]'), results = root.querySelector('[data-results]');
    var fallback = root.querySelector('[data-fallback]');
    var out = function (name) { return root.querySelector('[data-out="' + name + '"]'); };
    var amountInput = root.querySelector('[data-amount]'), amountError = root.querySelector('[data-amount-error]');
    var monthSelect = root.querySelector('[data-month]'), yearSelect = root.querySelector('[data-year]');
    var eurInput = root.querySelector('input[value="EUR"]'), eurNote = root.querySelector('[data-eur-note]');
    var mini = root.querySelector('[data-mini]'), keptKey = root.querySelector('[data-kept-key]');
    var d, mode = 'lump', last, liveTimer, lastResult;

    load(root.getAttribute('data-src')).then(function (data) {
      d = data;
      var latest = d.months[d.months.length - 1].key;
      last = { year: +latest.slice(0, 4), month: +latest.slice(5, 7) };
      form.hidden = false;
      results.hidden = false;
      if (fallback) fallback.hidden = true;
      form.addEventListener('submit', function (e) { e.preventDefault(); update(); });
      form.addEventListener('change', update);
      amountInput.addEventListener('input', update);
      onResize(mini, function () { if (lastResult) drawMini(lastResult.r, lastResult.o); });
      update();
    }).catch(function () {
      if (fallback) fallback.insertAdjacentHTML('beforeend', ' <span class="oil-error">The calculator couldn’t load its data.</span>');
    });

    function radio(name) {
      var checked = form.querySelector('input[name="' + name + '"]:checked');
      return checked ? checked.value : null;
    }

    function update() {
      var newMode = radio('mode'), cur = radio('currency');
      // Switching between a lump sum and monthly buying swaps in that mode's default, unless the reader typed their own amount
      if (newMode !== mode) {
        if (parseAmount(amountInput.value) === DEFAULTS[mode]) amountInput.value = num(DEFAULTS[newMode], 0);
        mode = newMode;
      }
      root.querySelector('[data-amount-label]').textContent = mode === 'monthly' ? 'Amount each month' : 'Amount';
      root.querySelector('[data-currency-name]').textContent = cur === 'EUR' ? ' in euros' : ' in US dollars';
      root.querySelector('[data-symbol]').textContent = SYMBOL[cur];

      // Euro figures start in January 1999: before that the euro option is off, and while it's on, earlier years are
      var year = +yearSelect.value, month = +monthSelect.value;
      Array.prototype.forEach.call(yearSelect.options, function (opt) { opt.disabled = cur === 'EUR' && +opt.value < 1999; });
      if (cur === 'EUR' && year < 1999) { year = 1999; yearSelect.value = '1999'; }
      Array.prototype.forEach.call(monthSelect.options, function (opt) { opt.disabled = year === last.year && +opt.value > last.month; });
      if (year === last.year && month > last.month) { month = last.month; monthSelect.value = String(month); }
      var early = year < 1999;
      eurInput.disabled = early;
      eurNote.hidden = !early;

      var amount = parseAmount(amountInput.value);
      amountInput.setAttribute('aria-invalid', amount == null ? 'true' : 'false');
      amountError.textContent = amount == null ? 'Enter an amount of at least ' + SYMBOL[cur] + '1, for example ' + num(DEFAULTS[mode], 0) + '.' : '';
      results.hidden = amount == null;
      if (amount == null) return;

      var o = { mode: mode, amount: amount, start: year + (month < 10 ? '-0' : '-') + month, currency: cur, real: radio('real') === 'yes' }, r;
      try {
        r = calculate(d, o);
      } catch (e) {
        results.hidden = true;
        amountError.textContent = 'Sorry, the calculator has no data for that choice.';
        return;
      }
      lastResult = { r: r, o: o };
      render(r, o);
    }

    function render(r, o) {
      var c = o.currency, m = function (n, sign) { return money(n, c, 0, sign); };
      var today = dayName(r.latest.date), when = monthName(o.start), unit = c === 'EUR' ? 'euros' : 'dollars';

      out('putin').textContent = m(r.putIn) + (o.mode === 'monthly' ? ' over ' + r.buys.length + (r.buys.length === 1 ? ' month' : ' months') : '');
      out('putin-real').textContent = o.real ? m(r.putInReal) + ' in today’s ' + unit : '';
      out('putin-real').hidden = !o.real;
      out('barrels').textContent = num(r.barrels, 2);
      out('value-label').textContent = 'Value on ' + today;
      out('value').textContent = m(r.value);
      out('gain-label').textContent = (r.gain < 0 ? 'Loss' : 'Gain') + (o.real ? ' after inflation' : '');
      out('gain').textContent = m(r.gain, true);
      out('gain-pct').textContent = pct(r.gainPct, 0, true);

      out('annual-label').textContent = 'Yearly return' + (o.real ? ' after inflation' : '');
      if (r.annual == null) {
        out('annual').textContent = 'Not shown';
        out('annual-note').textContent = 'A yearly rate needs at least a year of history.';
      } else {
        out('annual').textContent = pct(r.annual, 1) + ' a year';
        out('annual-note').textContent = o.mode === 'lump'
          ? 'The steady yearly growth that would turn what you put in into what you have (compound annual growth rate).'
          : 'Money-weighted (XIRR): each payment counts only from the day it went in, so late payments weigh less.';
      }

      // The worst moment, unless it rounds to no loss at all
      var w = r.worst;
      out('worst').textContent = Number((-w.gap * 100).toFixed(0)) > 0
        ? 'The worst moment: on ' + dayName(w.date) + ' your oil was worth ' + m(w.value) + ', ' + pct(-w.gap, 0) + ' less than the ' + m(w.against) +
          (o.real ? ' you’d have needed just to keep up with inflation.' : ' you had put in.')
        : 'Your oil was never worth less than ' + (o.real ? 'it needed to keep up with inflation' : 'you had put in') + ', checked on the first trading day of each month.';

      out('mini-title').textContent = 'Value of your oil against the money you put in, ' + when + ' to ' + monthName(r.latest.date) + (c === 'EUR' ? ', in euros.' : ', in dollars.');
      keptKey.hidden = !o.real;
      drawMini(r, o);

      // One short sentence for screen readers, once the reader stops typing
      clearTimeout(liveTimer);
      liveTimer = setTimeout(function () {
        out('live').textContent = m(o.amount) + (o.mode === 'monthly' ? ' a month from ' : ' put in during ') + when + ' would be worth ' + m(r.value) +
          ' on ' + today + ', ' + (r.gain < 0 ? 'a loss of ' : 'a gain of ') + pct(Math.abs(r.gainPct), 0) + (o.real ? ' after inflation.' : '.');
      }, 700);
    }

    function drawMini(r, o) {
      var w = mini.clientWidth, h = mini.clientHeight, narrow = w < 480;
      var left = narrow ? 50 : 58, right = w - 8, top = 10, bottom = h - 26;
      var pts = r.points, t0 = time(pts[0].date), t1 = time(pts[pts.length - 1].date);
      var x = function (t) { return left + (t - t0) / (t1 - t0 || 1) * (right - left); };
      var all = [];
      pts.forEach(function (p) { all.push(p.value, p.putIn); if (o.real) all.push(p.kept); });
      all.push(0);
      var y = yScale(all, top, bottom, narrow ? 3 : 4, 0.05);
      var svg = svgEl('svg', { class: 'oil-svg', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true', focusable: 'false' });
      var sym = SYMBOL[o.currency];
      drawAxes(svg, y, y.ticks, timeTicks(t0, t1, left, right, t1 - t0 < 400 * DAY, narrow ? 50 : 64), left, right, bottom, function (v) {
        return sym + (v >= 10000 ? num(v / 1000, 0) + 'k' : num(v, 0));
      });
      var at = function (key) { return pts.map(function (p) { return [x(time(p.date)), y.at(p[key])]; }); };
      svgEl('path', { class: 'oil-put', d: pathFrom(at('putIn'), true) }, svg);
      if (o.real) svgEl('path', { class: 'oil-kept', d: pathFrom(at('kept')) }, svg);
      svgEl('path', { class: 'oil-line', d: pathFrom(at('value')) }, svg);
      var old = mini.querySelector('svg');
      if (old) old.remove();
      mini.appendChild(svg);
    }
  }

  window.OilWidgets = { prepare: prepare, calculate: calculate, xirr: xirr, money: money, pct: pct, load: load };
  var start = function () {
    document.querySelectorAll('[data-oil-chart]').forEach(initChart);
    document.querySelectorAll('[data-oil-calculator]').forEach(initCalculator);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
