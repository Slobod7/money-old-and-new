/* The minimum wages page (_includes/minimum-wage-map.html, minimum-wage-compare.html and minimum-wage-table.html).
   Jekyll draws the map in euros, the EU's card, Ireland against Germany and the table, and they read the same without
   this script. With it: the euros and purchasing power tabs (map, legend, card, summary and table order change
   together), a readout on hover and focus, a card for the country you pick, any two countries compared, and a table
   that sorts.
   It reads assets/data/minimum-wage-europe.json from this site: no outside requests, cookies or storage. The address
   takes the choice as a fragment (#country=RO&with=DE&measure=pps), so a view can be shared.
   Every figure is Eurostat's as published. The script ranks them and compares two of them; it never makes an average,
   a PPS figure or an hourly rate. The sums and sentences are exported for tests/minimum-wage-europe.cjs. */
(function (root) {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MEASURES = { eur: 'In euros', pps: 'Purchasing power' };
  var NONE_NOTE = 'Eurostat records no national figure: pay floors are set by collective agreements, sector by sector.';

  // The data ------------------------------------------------------------------------------------------

  function prepare(raw) {
    var d = { raw: raw, names: {}, currency: {}, codes: [], none: {}, keys: raw.periods };
    raw.countries.forEach(function (c) {
      d.names[c[0]] = c[1];
      d.currency[c[0]] = { iso: c[2], format: c[3], label: c[4] };
      d.codes.push(c[0]);
    });
    raw.no_national.forEach(function (code) { d.none[code] = true; });
    d.last = d.keys.indexOf(raw.period);
    d.yearAgo = d.keys.indexOf(raw.year_ago);
    return d;
  }

  // One country's state in a half-year: 'rate', 'none' (no national minimum wage) or 'missing' (no figure)
  function status(d, code, i) {
    var s = d.raw.status[code], c = s ? s.charAt(i == null ? d.last : i) : '';
    return c === 'r' ? 'rate' : c === 'n' ? 'none' : 'missing';
  }
  // A figure as published, or null. measure is eur, pps or nac.
  function value(d, measure, code, i) {
    var row = d.raw[measure][code], v = row ? row[i == null ? d.last : i] : null;
    return typeof v === 'number' ? v : null;
  }
  function flag(d, measure, code, i) {
    var f = d.raw.flags[measure] && d.raw.flags[measure][code];
    return (f && f[d.keys[i == null ? d.last : i]]) || '';
  }
  function hasRate(d, code) { return status(d, code) === 'rate' && value(d, 'eur', code) != null && value(d, 'pps', code) != null; }
  function rated(d) { return d.codes.filter(function (code) { return hasRate(d, code); }); }

  function byName(d, a, b) { return d.names[a] < d.names[b] ? -1 : d.names[a] > d.names[b] ? 1 : 0; }

  // Competition ranks, highest first: equal figures share a rank and the next one skips (1, 2, 2, 4)
  function ranks(d, measure) {
    var codes = rated(d), out = {};
    codes.forEach(function (code) {
      var v = value(d, measure, code), above = 0, equal = 0;
      codes.forEach(function (other) { var w = value(d, measure, other); if (w > v) above++; else if (w === v) equal++; });
      out[code] = { rank: above + 1, tied: equal > 1 };
    });
    return out;
  }
  // The countries with a rate, highest first, by name where two tie
  function ranked(d, measure) {
    return rated(d).sort(function (a, b) { return value(d, measure, b) - value(d, measure, a) || byName(d, a, b); });
  }
  // Places gained when the order goes from euros to purchasing power: Romania's 20th to 12th is +8
  function shift(d, code) {
    var e = ranks(d, 'eur')[code], p = ranks(d, 'pps')[code];
    return e && p ? e.rank - p.rank : null;
  }
  function tiedWith(d, measure, code) {
    var v = value(d, measure, code);
    return rated(d).filter(function (other) { return other !== code && value(d, measure, other) === v; }).sort(function (a, b) { return byName(d, a, b); });
  }

  // The map's shades: the same rules as scripts/update-minimum-wage-data.py ---------------------------

  function bandClass(v, breaks) {
    var n = 0;
    breaks.forEach(function (b) { if (v >= b) n++; });
    return n;
  }
  function legendLabels(measure, breaks) {
    var f = function (v) { return measure === 'eur' ? '€' + amount(v) : amount(v); }, unit = measure === 'eur' ? '' : ' PPS';
    var out = ['Under ' + f(breaks[0]) + unit];
    for (var i = 1; i < breaks.length; i++) out.push(f(breaks[i - 1]) + ' to ' + f(breaks[i]) + unit);
    out.push(f(breaks[breaks.length - 1]) + unit + ' or more');
    return out;
  }

  // Numbers and words -----------------------------------------------------------------------------------

  // 2391 as 2,391; a figure with cents keeps two decimals
  function amount(v) {
    var whole = v === Math.floor(v), text = whole ? String(v) : v.toFixed(2), parts = text.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
  function inUnit(measure, v) { return v == null ? '–' : measure === 'eur' ? '€' + amount(v) : amount(v) + ' PPS'; }
  function national(d, code, v) { return v == null ? '–' : d.currency[code].format.replace('{}', amount(v)); }

  // How far a is above b, in tenths of a percent, rounded half away from zero in whole numbers: pct_tenths in the script
  function pctTenths(a, b) {
    a = Math.round(a * 100); b = Math.round(b * 100);
    var n = 1000 * (a - b), q = Math.floor((2 * Math.abs(n) + b) / (2 * b));
    return n >= 0 ? q : -q;
  }
  // a as a multiple of b, in tenths: ratio_tenths in the script
  function ratioTenths(a, b) {
    a = Math.round(a * 100); b = Math.round(b * 100);
    return Math.floor((20 * a + b) / (2 * b));
  }
  function tenths(t) { t = Math.abs(t); return Math.floor(t / 10) + '.' + (t % 10); }

  function ordinal(n) {
    var tens = n % 100, unit = n % 10;
    return n + (tens >= 10 && tens <= 20 ? 'th' : unit === 1 ? 'st' : unit === 2 ? 'nd' : unit === 3 ? 'rd' : 'th');
  }
  function rankText(r) { return r.rank + (r.tied ? '=' : ''); }
  function place(name) { return name === 'Netherlands' ? 'the Netherlands' : name; }
  function possessive(name) { var p = place(name); return p + (/s$/.test(p) ? '’' : '’s'); }
  function capital(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function join(names) { return names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]; }
  function longDate(iso) { return +iso.slice(8, 10) + ' ' + MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4); }
  function periodDate(key) { return key.slice(0, 4) + (key.slice(-1) === '1' ? '-01-01' : '-07-01'); }
  function periodName(key) { return longDate(periodDate(key)); }
  function shortPeriod(key) { return (key.slice(-1) === '1' ? 'Jan ' : 'Jul ') + key.slice(0, 4); }

  // The sentences -----------------------------------------------------------------------------------------

  // The sentence above the map: the same as the script's summary
  function summary(d, measure) {
    var codes = rated(d);
    if (!codes.length) return '';
    var values = codes.map(function (code) { return value(d, measure, code); });
    var top = Math.max.apply(null, values), bottom = Math.min.apply(null, values);
    var pick = function (v) { return codes.filter(function (code) { return value(d, measure, code) === v; }).sort(function (a, b) { return byName(d, a, b); }).map(function (code) { return place(d.names[code]); }); };
    var times = tenths(ratioTenths(top, bottom));
    if (measure === 'eur') {
      return 'In euros, the minimum wage is highest in ' + join(pick(top)) + ', at ' + inUnit(measure, top) + ' a month, and lowest in ' +
        join(pick(bottom)) + ', at ' + inUnit(measure, bottom) + ': ' + times + ' times as much.';
    }
    return 'Adjusted for prices, it is highest in ' + join(pick(top)) + ', at ' + inUnit(measure, top) + ', and lowest in ' +
      join(pick(bottom)) + ', at ' + inUnit(measure, bottom) + ': ' + times + ' times as much.';
  }

  // The sentence above the comparison: the same as the script's compare_sentence
  function verdict(d, a, b) {
    var na = place(d.names[a]), nb = place(d.names[b]), ha = hasRate(d, a), hb = hasRate(d, b);
    if (!ha && !hb) {
      return d.none[a] && d.none[b] ? 'Neither ' + na + ' nor ' + nb + ' has a national minimum wage.' : 'There are no figures to compare for ' + na + ' and ' + nb + '.';
    }
    if (!ha || !hb) {
      var missing = ha ? b : a, other = ha ? a : b;
      return capital(place(d.names[missing])) + (d.none[missing] ? ' has no national minimum wage' : ' has no figure for this date') +
        ', so there is nothing to set against ' + possessive(d.names[other]) + ' minimum wage.';
    }
    return [['eur', 'In euros, ', possessive(d.names[a]) + ' minimum wage is'], ['pps', 'Adjusted for prices, ', 'it is']].map(function (part) {
      var t = pctTenths(value(d, part[0], a), value(d, part[0], b));
      var how = t === 0 ? 'the same as' : tenths(t) + '% ' + (t > 0 ? 'higher' : 'lower') + ' than';
      return part[1] + part[2] + ' ' + how + ' ' + possessive(d.names[b]) + '.';
    }).join(' ');
  }
  // One figure against another, for the comparison table: "2.0% higher", "18.9% lower", "the same"
  function difference(a, b) {
    if (a == null || b == null) return '';
    var t = pctTenths(a, b);
    return t === 0 ? 'the same' : tenths(t) + '% ' + (t > 0 ? 'higher' : 'lower');
  }

  // The card beside the map: a name, one big figure, what it is, rows of [label, figure, note], and a note under them
  function card(d, code, measure) {
    var date = longDate(d.raw.date), n = rated(d).length;
    if (!code) {
      var ends = function (m) {
        var list = ranked(d, m), top = value(d, m, list[0]), bottom = value(d, m, list[list.length - 1]);
        var names = function (v) { return join(list.filter(function (c) { return value(d, m, c) === v; }).sort(function (x, y) { return byName(d, x, y); }).map(function (c) { return place(d.names[c]); })); };
        return [[top, names(top)], [bottom, names(bottom)]];
      };
      var e = ends('eur'), p = ends('pps');
      return {
        name: 'European Union', value: n + ' of ' + d.codes.length, unit: 'countries have a national minimum wage on ' + date, empty: false,
        rows: [['Highest in euros', inUnit('eur', e[0][0]), e[0][1]], ['Lowest in euros', inUnit('eur', e[1][0]), e[1][1]],
          ['Highest by purchasing power', inUnit('pps', p[0][0]), p[0][1]], ['Lowest by purchasing power', inUnit('pps', p[1][0]), p[1][1]],
          ['No national minimum wage', '', join(d.raw.no_national.map(function (c) { return d.names[c]; }))]],
        note: 'Eurostat publishes no EU average: five countries have no national rate, and an average of the others would say little.'
      };
    }
    var name = d.names[code], state = status(d, code);
    if (state === 'none') return { name: name, value: 'No national minimum wage', unit: '', empty: true, rows: [], note: NONE_NOTE };
    if (!hasRate(d, code)) return { name: name, value: 'No figure', unit: '', empty: true, rows: [], note: 'Eurostat has no figure for ' + place(name) + ' on ' + date + '.' };
    var other = measure === 'eur' ? 'pps' : 'eur', own = ranks(d, measure)[code], theirs = ranks(d, other)[code];
    var rankNote = function (r, m) {
      var shared = tiedWith(d, m, code).map(function (c) { return place(d.names[c]); });
      return ordinal(r.rank) + ' of ' + n + (shared.length ? ', shared with ' + join(shared) : '');
    };
    var estimated = function (m) { return flag(d, m, code).indexOf('e') >= 0; };
    var rows = [
      [measure === 'eur' ? 'Rank in euros' : 'Rank by purchasing power', rankNote(own, measure), ''],
      [measure === 'eur' ? 'By purchasing power' : 'In euros', inUnit(other, value(d, other, code)), rankNote(theirs, other) + (estimated(other) ? ', estimated' : '')]
    ];
    var cur = d.currency[code];
    if (cur.iso !== 'EUR' && value(d, 'nac', code) != null) rows.push(['In ' + cur.label, national(d, code, value(d, 'nac', code)), '']);
    var now = value(d, 'nac', code), then = d.yearAgo < 0 ? null : value(d, 'nac', code, d.yearAgo);
    if (now != null && then != null) {
      var t = pctTenths(now, then);
      rows.push(['A year earlier', national(d, code, then), 'on ' + periodName(d.keys[d.yearAgo]) + (t === 0 ? '; the same now' : '; now ' + tenths(t) + '% ' + (t > 0 ? 'higher' : 'lower')) + (cur.iso !== 'EUR' ? ', in ' + cur.label.split(' ').pop() : '')]);
    }
    return {
      name: name, value: inUnit(measure, value(d, measure, code)), empty: false, rows: rows, note: d.raw.conversions[code] || '',
      unit: measure === 'eur' ? 'a month, gross, on ' + date : 'a month in purchasing power standards' + (estimated('pps') ? ', estimated' : '') + ', on ' + date
    };
  }

  // The comparison's table: rows of [label, A, B, A against B]
  function compareRows(d, a, b) {
    var r = { eur: ranks(d, 'eur'), pps: ranks(d, 'pps') };
    var cell = function (code, m) { return hasRate(d, code) ? inUnit(m, value(d, m, code)) + (flag(d, m, code).indexOf('e') >= 0 ? ' (e)' : '') : d.none[code] ? 'No national minimum wage' : 'No figure'; };
    var rank = function (code, m) { return r[m][code] ? ordinal(r[m][code].rank) + (r[m][code].tied ? '=' : '') : '–'; };
    var both = hasRate(d, a) && hasRate(d, b);
    var rows = [
      ['Gross a month, in euros', cell(a, 'eur'), cell(b, 'eur'), both ? difference(value(d, 'eur', a), value(d, 'eur', b)) : ''],
      ['Rank in euros', rank(a, 'eur'), rank(b, 'eur'), ''],
      ['By purchasing power', cell(a, 'pps'), cell(b, 'pps'), both ? difference(value(d, 'pps', a), value(d, 'pps', b)) : ''],
      ['Rank by purchasing power', rank(a, 'pps'), rank(b, 'pps'), '']
    ];
    if ([a, b].some(function (code) { return d.currency[code].iso !== 'EUR' && value(d, 'nac', code) != null; })) {
      rows.push(['In national currency', national(d, a, value(d, 'nac', a)), national(d, b, value(d, 'nac', b)), '']);
    }
    return rows;
  }

  // Every half-year from the first that either country has a figure for, newest first: [date, A €, B €, A PPS, B PPS]
  function historyRows(d, a, b) {
    var out = [], first = null;
    for (var i = 0; i <= d.last; i++) if (first == null && (status(d, a, i) === 'rate' || status(d, b, i) === 'rate')) first = i;
    if (first == null) return out;
    var cell = function (code, m, i) {
      var v = value(d, m, code, i);
      if (v != null) return inUnit(m, v);
      return status(d, code, i) === 'none' ? 'No national rate' : '–';
    };
    for (var j = d.last; j >= first; j--) out.push([shortPeriod(d.keys[j]), cell(a, 'eur', j), cell(b, 'eur', j), cell(a, 'pps', j), cell(b, 'pps', j)]);
    return out;
  }

  // The order of the table's rows: countries with a figure sorted by the column, ties by name, then the rest by name
  function tableOrder(d, sort, dir) {
    var key = function (code) { return sort === 'name' ? null : sort === 'shift' ? shift(d, code) : value(d, sort, code); };
    var withRate = rated(d), rest = d.codes.filter(function (code) { return withRate.indexOf(code) < 0; }).sort(function (a, b) { return byName(d, a, b); });
    if (sort === 'name') return d.codes.slice().sort(function (a, b) { return byName(d, a, b) * dir; });
    withRate.sort(function (a, b) { return (key(a) - key(b)) * dir || byName(d, a, b); });
    return withRate.concat(rest);
  }

  // The address -------------------------------------------------------------------------------------------

  // A fragment such as #country=RO&with=DE&measure=pps, as the choices it names. Every value is checked against the
  // data, and one bad value refuses the whole fragment. Null when it names none of them.
  function parseHash(hash, d) {
    var out = {}, found = false, ok = true;
    String(hash || '').replace(/^#/, '').split('&').forEach(function (part) {
      var at = part.indexOf('='), key = at < 0 ? part : part.slice(0, at), v = at < 0 ? '' : part.slice(at + 1);
      if (key === 'country') { found = true; if (d.codes.indexOf(v) < 0) ok = false; else out.country = v; }
      else if (key === 'with') { found = true; if (d.codes.indexOf(v) < 0) ok = false; else out.other = v; }
      else if (key === 'measure') { found = true; if (!MEASURES.hasOwnProperty(v)) ok = false; else out.measure = v; }
    });
    if (out.country && out.other === out.country) ok = false;   // a country against itself says nothing
    return found && ok ? out : null;
  }
  // The fragment that names a view: only what differs from the view the page opens on (home)
  function hashFor(state, home) {
    var parts = [];
    if (state.sel || state.a !== home.a) parts.push('country=' + state.a);
    if (state.b !== home.b) parts.push('with=' + state.b);
    if (state.measure !== 'eur') parts.push('measure=' + state.measure);
    return parts.length ? '#' + parts.join('&') : '';
  }

  var api = { prepare: prepare, status: status, value: value, flag: flag, hasRate: hasRate, rated: rated, ranks: ranks, ranked: ranked,
    shift: shift, tiedWith: tiedWith, bandClass: bandClass, legendLabels: legendLabels, amount: amount, inUnit: inUnit, national: national,
    pctTenths: pctTenths, ratioTenths: ratioTenths, tenths: tenths, ordinal: ordinal, rankText: rankText, place: place, possessive: possessive,
    join: join, longDate: longDate, periodName: periodName, shortPeriod: shortPeriod, summary: summary, verdict: verdict, difference: difference,
    card: card, compareRows: compareRows, historyRows: historyRows, tableOrder: tableOrder, parseHash: parseHash, hashFor: hashFor };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.MinimumWageEurope = api;

  // The page ----------------------------------------------------------------------------------------------

  var document = root.document;

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function all(sel, from) { return [].slice.call((from || document).querySelectorAll(sel)); }
  function tabs(part, attr, key, ctx) {
    all('button[' + attr + ']', part).forEach(function (b) {
      b.addEventListener('click', function () { var change = {}; change[key] = b.getAttribute(attr); ctx.measure(change[key]); });
    });
  }
  function press(part, attr, v) {
    all('button[' + attr + ']', part).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === v)); });
  }
  function reveal(part) { all('[data-controls]', part).forEach(function (c) { c.hidden = false; }); }

  // The map and its card ------------------------------------------------------------------------------
  function mapPart(fig, ctx) {
    var d = ctx.d, state = ctx.state;
    var map = fig.querySelector('[data-map]'), cardBox = fig.querySelector('[data-card]'), drawing = fig.querySelector('.fuel-svg');
    var links = all('a[data-code]', fig), ring = fig.querySelector('[data-ring]'), legend = fig.querySelector('[data-legend]');
    var pick = cardBox.querySelector('[data-country]'), box = drawing.viewBox.baseVal, more = cardBox.querySelector('[data-more]');
    var notes = (fig.getAttribute('data-notes') || '').split(' ').filter(Boolean);
    var tip = el('div', 'oil-tip fuel-tip', map);
    tip.setAttribute('aria-hidden', 'true');
    tip.hidden = true;

    function reading(code) {
      var m = state.measure;
      if (status(d, code) === 'none') return { value: 'No national minimum wage', sub: '' };
      if (!hasRate(d, code)) return { value: 'No figure', sub: '' };
      var r = ranks(d, m)[code];
      return { value: inUnit(m, value(d, m, code)) + ' a month', sub: ordinal(r.rank) + (r.tied ? '=' : '') + ' of ' + rated(d).length + (m === 'eur' ? ' in euros' : ' by purchasing power') };
    }
    function showTip(a, x, y) {
      var code = a.getAttribute('data-code'), r = reading(code);
      tip.textContent = '';
      el('p', 'oil-tip-date', tip, d.names[code]);
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
        if (cardBox.getBoundingClientRect().top > root.innerHeight - 80) cardBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    cardBox.querySelector('[data-pick]').hidden = false;
    pick.addEventListener('change', function () { ctx.select(pick.value); });
    reveal(fig);

    function drawMap() {
      var m = state.measure, breaks = d.raw.map_scales[m];
      links.forEach(function (a) {
        var code = a.getAttribute('data-code'), st = status(d, code);
        var cls = hasRate(d, code) ? 'fuel-s' + bandClass(value(d, m, code), breaks) : st === 'none' ? 'mw-none' : 'fuel-none';
        all('.fuel-shape, .fuel-dot', a).forEach(function (p) { p.setAttribute('class', (p.classList.contains('fuel-dot') ? 'fuel-dot ' : 'fuel-shape ') + cls); });
        var r = reading(code);
        a.setAttribute('aria-label', d.names[code] + ': ' + r.value + (r.sub ? ', ' + r.sub : ''));
        a.setAttribute('aria-pressed', String(code === state.sel));
        a.classList.toggle('is-selected', code === state.sel);
        if (code === state.sel) ring.setAttribute('d', a.querySelector('.fuel-shape').getAttribute('d'));
      });
      if (!state.sel) ring.setAttribute('d', '');
      drawing.setAttribute('aria-label', 'Map of the ' + d.codes.length + ' EU countries, shaded by the gross monthly minimum wage on ' + longDate(d.raw.date) +
        (m === 'eur' ? ', in euros' : ', in purchasing power standards') + '. Every figure is in the table of all countries.');
      legend.textContent = '';
      legendLabels(m, breaks).forEach(function (label, i) {
        var li = el('li', '', legend);
        el('span', 'fuel-key fuel-s' + i, li);
        li.appendChild(document.createTextNode(label));
      });
      var noneKey = el('li', '', legend);
      el('span', 'fuel-key mw-none-key', noneKey);
      noneKey.appendChild(document.createTextNode('No national minimum wage'));
      if (d.codes.some(function (code) { return status(d, code) === 'missing'; })) {
        var gap = el('li', '', legend);
        el('span', 'fuel-key fuel-none', gap);
        gap.appendChild(document.createTextNode('No figure'));
      }
    }

    function drawCard() {
      var c = card(d, state.sel, state.measure), list = cardBox.querySelector('[data-figures]');
      cardBox.querySelector('[data-name]').textContent = c.name;
      cardBox.querySelector('[data-value]').textContent = c.value;
      cardBox.querySelector('[data-unit]').textContent = c.unit;
      cardBox.classList.toggle('is-empty', c.empty);
      list.textContent = '';
      c.rows.forEach(function (row) {
        var div = el('div', '', list), dd;
        el('dt', '', div, row[0]);
        dd = el('dd', '', div, row[1]);
        if (row[2]) el('small', '', dd, row[2]);
      });
      cardBox.querySelector('[data-note]').textContent = c.note;
      pick.value = state.sel || '';
      if (more) {
        var link = more.querySelector('a'), has = state.sel && notes.indexOf(state.sel) >= 0;
        more.hidden = !has;
        if (has) { link.href = '#minimum-wage-' + state.sel.toLowerCase(); link.textContent = possessive(d.names[state.sel]).replace(/^t/, 'T') + ' legal rates'; }
      }
    }

    return function () {
      press(fig, 'data-measure', state.measure);
      drawMap();
      fig.querySelector('[data-summary]').textContent = summary(d, state.measure);
      drawCard();
    };
  }

  // The comparison ------------------------------------------------------------------------------------
  function comparePart(fig, ctx) {
    var d = ctx.d, state = ctx.state;
    var selA = fig.querySelector('[data-a]'), selB = fig.querySelector('[data-b]'), rows = fig.querySelector('[data-compare-rows]');
    var months = fig.querySelector('[data-history]'), bars = fig.querySelector('[data-bars]');
    if (!selA || !selB || !rows) return null;
    var say = function (name, text) { all('[data-out="' + name + '"]', fig).forEach(function (e) { e.textContent = text; }); };

    function drawBars(a, b) {
      if (!bars) return;
      ['eur', 'pps'].forEach(function (m) {
        var top = Math.max.apply(null, rated(d).map(function (code) { return value(d, m, code); }));
        [[a, 'a'], [b, 'b']].forEach(function (pair) {
          var row = bars.querySelector('[data-bar="' + m + '-' + pair[1] + '"]'), v = hasRate(d, pair[0]) ? value(d, m, pair[0]) : null;
          if (!row) return;
          row.querySelector('.mw-bar-name').textContent = d.names[pair[0]];
          row.querySelector('.mw-bar-fill').style.width = (v == null ? 0 : v / top * 100).toFixed(1) + '%';
          row.querySelector('.mw-bar-value').textContent = v == null ? (d.none[pair[0]] ? 'No national rate' : 'No figure') : inUnit(m, v);
        });
      });
    }

    function draw() {
      var a = state.a, b = state.b;
      selA.value = a; selB.value = b;
      say('verdict', verdict(d, a, b));
      say('head-a', d.names[a]); say('head-b', d.names[b]);
      rows.textContent = '';
      compareRows(d, a, b).forEach(function (row) {
        var tr = el('tr', '', rows);
        el('th', '', tr, row[0]).setAttribute('scope', 'row');
        el('td', 'num', tr, row[1]); el('td', 'num', tr, row[2]); el('td', 'num', tr, row[3]);
      });
      drawBars(a, b);
      if (months && months.getAttribute('data-for') !== a + '|' + b) {
        var list = document.createDocumentFragment();
        historyRows(d, a, b).forEach(function (row) {
          var tr = el('tr', '', list);
          el('th', '', tr, row[0]).setAttribute('scope', 'row');
          for (var i = 1; i < row.length; i++) el('td', 'num', tr, row[i]);
        });
        months.textContent = '';
        months.appendChild(list);
        months.setAttribute('data-for', a + '|' + b);
      }
    }

    selA.addEventListener('change', function () { ctx.select(selA.value); });
    selB.addEventListener('change', function () {
      if (selB.value === state.a) { selB.value = state.b; return; }   // a country against itself says nothing
      ctx.set({ b: selB.value });
    });
    reveal(fig);
    var fallback = fig.querySelector('[data-nojs]');
    if (fallback) fallback.hidden = true;
    return draw;
  }

  // The table of all countries --------------------------------------------------------------------------
  function tablePart(list, ctx) {
    var d = ctx.d, state = ctx.state, body = list.querySelector('tbody'), target = ctx.parts.map;
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
        var b = el('button', 'link-button fuel-row-pick', null, span.textContent);
        b.type = 'button';
        span.textContent = '';
        span.appendChild(b);
        b.addEventListener('click', function () {
          ctx.select(code);
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
    tabs(list, 'data-measure', 'measure', ctx);   // the same choice as the map's tabs
    reveal(list);

    return function () {
      list.setAttribute('data-show', state.measure);
      press(list, 'data-measure', state.measure);
      var byCode = {};
      all('tr[data-code]', body).forEach(function (tr) { byCode[tr.getAttribute('data-code')] = tr; });
      tableOrder(d, state.sort, state.dir).forEach(function (code) {
        var tr = byCode[code];
        if (!tr) return;
        tr.classList.toggle('is-selected', code === state.sel);
        body.appendChild(tr);
      });
      all('th[data-sort]', list).forEach(function (th) {
        if (th.getAttribute('data-sort') === state.sort) th.setAttribute('aria-sort', state.dir > 0 ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      });
      all('[data-order]', list).forEach(function (order) {
        order.textContent = state.sort === 'name' ? ', by name' : state.sort === 'shift' ? (state.dir < 0 ? ', biggest climb by purchasing power first' : ', biggest fall by purchasing power first') : state.sort === 'pps' ? (state.dir < 0 ? ', highest purchasing power first' : ', lowest purchasing power first') : (state.dir < 0 ? ', highest in euros first' : ', lowest in euros first');
      });
    };
  }

  // One state for the three parts: the map's tabs also set the table's order, and a country chosen anywhere is the
  // first in the comparison
  function controller(d, parts) {
    var home = { a: d.raw.default_pair[0], b: d.raw.default_pair[1] };
    var state = { measure: 'eur', sel: null, a: home.a, b: home.b, sort: 'eur', dir: -1 };
    var draws = [];

    function render(write) {
      draws.forEach(function (draw) { draw(); });
      if (!write || !root.history || !root.history.replaceState) return;
      try { root.history.replaceState(null, '', hashFor(state, home) || root.location.pathname + root.location.search); } catch (e) { /* a sandboxed frame: the view still changes */ }
    }
    function pickCountry(code) {
      state.sel = code || null;
      if (!code || code === state.a) return;
      if (code === state.b) state.b = state.a;   // the two swap places rather than compare a country with itself
      state.a = code;
    }
    var ctx = {
      d: d, state: state, parts: parts,
      set: function (changes) { Object.keys(changes).forEach(function (k) { state[k] = changes[k]; }); render(true); },
      // The tabs: the map, the legend, the card and the table's order change together
      measure: function (m) { state.measure = m; state.sort = m; state.dir = -1; render(true); },
      select: function (code) { pickCountry(code); render(true); }
    };
    if (parts.map) draws.push(mapPart(parts.map, ctx));
    if (parts.compare) draws.push(comparePart(parts.compare, ctx));
    if (parts.table) draws.push(tablePart(parts.table, ctx));
    draws = draws.filter(Boolean);
    return {
      render: render,
      choose: function (choice) {
        if (choice.measure) { state.measure = choice.measure; state.sort = choice.measure; state.dir = -1; }
        if (choice.country) pickCountry(choice.country);
        if (choice.other && choice.other !== state.a) state.b = choice.other;
        render(false);
      }
    };
  }

  function start() {
    var map = document.querySelector('[data-mw-map]'), compare = document.querySelector('[data-mw-compare]'), table = document.querySelector('[data-mw-table]');
    var first = map || compare || table;
    if (!first || !root.fetch) return;
    fetch(first.getAttribute('data-src'), { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(prepare).then(function (d) {
      // A page built from one half-year and data from another would disagree with itself: keep the page as built
      return d.last >= 0 && d.raw.period === first.getAttribute('data-period') ? d : null;
    }, function () { return null; /* the data didn't load: the page keeps what Jekyll drew */ }).then(function (d) {
      if (!d) return;
      var main = controller(d, { map: map, compare: compare, table: table });
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
