/* The fuel cost calculator (data/fuel-cost-calculator.html). Jekyll writes this week's prices into the page's table of
   what 100 km costs, one row per country with its price per 1,000 litres in the country's own money (data-petrol,
   data-diesel): euros for the EU, pounds for the UK (data-cur="gbp"), with the pounds-to-the-euro rate on the table
   (data-gbp-per-eur). This script reads them from there: the calculator can't disagree with the page, and it fetches,
   sends and stores nothing. Costs are shown in euros or pounds, converted at that one rate.
   The reader's choices go into the page's address, so a drive can be shared as a link; a link carries the inputs,
   never prices, so it always opens at the current week's.
   Money is worked in cents (or pence) and rounded once, at the end. FuelCost.calculate and the helpers are exposed for
   tests/fuel-cost.cjs. */
(function (global) {
  'use strict';

  var KM_PER_MILE = 1.609344;
  var L100_PER_MPG = 100 * 4.54609 / KM_PER_MILE;   // 4.54609 litres in a UK gallon, so litres per 100 km = 282.481 ÷ mpg
  var MAX_DISTANCE = 20000, MAX_LEGS = 8, MAX_PEOPLE = 8;
  var USE_LIMITS = { l100: [1, 40], mpg: [7, 280] };
  var DEFAULTS = { fuel: 'petrol', use: 6, unit: 'l100', dist: 'km', legs: [{ code: 'fr', distance: 500 }], back: false, people: 1, cur: null };
  var SYMBOL = { eur: '€', gbp: '£' };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

  // Reads an amount typed the English way (1,000.50) or the continental way (1.000,50 or 1000,50). A comma or point
  // before exactly three digits groups thousands; before one or two digits at the end it's the decimal mark. Anything
  // else, such as 1,0000 or 1,000,50, is refused instead of guessed. The same rule as old-new-calculator.js.
  function parseAmount(text) {
    var clean = String(text).replace(/[\s$€£]/g, ''), n = null;
    if (/^\d{1,3}(,\d{3})+(\.\d{0,2})?$/.test(clean)) n = parseFloat(clean.replace(/,/g, ''));
    else if (/^\d{1,3}(\.\d{3})+(,\d{0,2})?$/.test(clean)) n = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
    else if (/^\d+([.,]\d{0,2})?$/.test(clean)) n = parseFloat(clean.replace(',', '.'));
    return n >= 1 && n <= 100000000 ? n : null;
  }

  // Formatting --------------------------------------------------------------------------------------------------------

  function group(s) {
    var p = s.split('.');
    return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p.length > 1 ? '.' + p[1] : '');
  }
  function money(cents, cur) { return SYMBOL[cur || 'eur'] + group((Math.round(cents) / 100).toFixed(2)); }
  function euros(cents) { return money(cents, 'eur'); }
  function perLitre(price, cur) { return SYMBOL[cur || 'eur'] + (price / 1000).toFixed(3); }
  function small(cents, cur) { return (Math.round(cents * 10) / 10).toFixed(1) + (cur === 'gbp' ? 'p' : ' cents'); }
  function litres(v) { return group(v.toFixed(1)) + (v.toFixed(1) === '1.0' ? ' litre' : ' litres'); }
  function figure(n) { return group(Math.round(n * 10) % 10 === 0 ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1)); }
  function distance(n, dist) { return figure(n) + (dist === 'mi' ? (figure(n) === '1' ? ' mile' : ' miles') : ' km'); }
  function place(name) { return { 'Netherlands': 'the Netherlands', 'EU average': 'the EU', 'United Kingdom': 'the UK' }[name] || name; }
  function list(names) {
    return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  function weekName(iso) {
    var p = iso.split('-');
    return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
  }
  function useText(o) {
    return o.unit === 'mpg' ? 'does ' + figure(o.use) + ' mpg (UK)' : 'uses ' + figure(o.use) + ' litres per 100 km';
  }

  // The sums ----------------------------------------------------------------------------------------------------------

  // A price per 1,000 litres in `from` money, in `to` money. fx is pounds to the euro.
  function convert(price, from, to, fx) {
    if ((from || 'eur') === (to || 'eur')) return price;
    if (!(fx > 0)) throw new Error('No exchange rate');
    return to === 'gbp' ? price * fx : price / fx;
  }

  // prices: { fr: { name: 'France', petrol: 1903, diesel: 1975 }, uk: { name: 'United Kingdom', cur: 'gbp', ... } }:
  // the price per 1,000 litres in the country's own money (euros unless cur says otherwise), null where missing.
  // o: { fuel, use, unit ('l100' or 'mpg'), dist ('km' or 'mi'), legs: [{ code, distance }], back, people, cur }.
  // cur is the money to show ('eur' or 'gbp', euros if left out); fx is pounds to the euro, needed only to convert.
  function calculate(prices, o, fx) {
    var l100 = o.unit === 'mpg' ? L100_PER_MPG / o.use : o.use;
    var times = o.back ? 2 : 1, toKm = o.dist === 'mi' ? KM_PER_MILE : 1, cur = o.cur || 'eur';
    var r = { l100: l100, cur: cur, converted: false, legs: [], distance: 0, km: 0, litres: 0, cents: 0 };
    o.legs.forEach(function (leg) {
      var p = prices[leg.code], native = p ? p[o.fuel] : null;
      if (native == null) throw new Error('No ' + o.fuel + ' price for ' + leg.code);
      var price = convert(native, p.cur, cur, fx);
      if ((p.cur || 'eur') !== cur) r.converted = true;
      var d = leg.distance * times, km = d * toKm, l = km * l100 / 100;
      r.legs.push({ code: leg.code, name: p.name, distance: d, km: km, litres: l, price: price, cents: l * price / 10 });
      r.distance += d; r.km += km; r.litres += l; r.cents += l * price / 10;
    });
    r.each = r.cents / o.people;
    r.per100km = r.cents / r.km * 100;
    r.perMile = r.cents / (r.km / KM_PER_MILE);
    // The cheapest country on the route: the same litres at its price. The EU average isn't a country, so it never counts.
    var countries = r.legs.filter(function (l) { return l.code !== 'eu'; });
    var codes = countries.map(function (l) { return l.code; }).filter(function (c, i, all) { return all.indexOf(c) === i; });
    r.cheapest = null;
    if (codes.length > 1) {
      var low = countries.reduce(function (a, b) { return b.price < a.price ? b : a; });
      var all = r.litres * low.price / 10;
      if (Math.round(r.cents) - Math.round(all) >= 1) r.cheapest = { code: low.code, name: low.name, price: low.price, cents: all, saving: r.cents - all };
    }
    return r;
  }

  // One sentence that answers the question, and one on the cheapest country.
  function verdict(r, o) {
    var names = r.legs.map(function (l) { return place(l.name); }).filter(function (n, i, all) { return all.indexOf(n) === i; });
    var where = names.length === 1 ? 'in ' + names[0] : 'through ' + list(names);
    var oneWay = r.distance / (o.back ? 2 : 1);
    var drive = o.back
      ? 'Driving ' + distance(oneWay, o.dist) + ' each way ' + where + ', ' + distance(r.distance, o.dist) + ' in all,'
      : 'Driving ' + distance(r.distance, o.dist) + ' ' + where;
    var s = drive + ' costs ' + money(r.cents, r.cur) + ' in ' + o.fuel + ' at this week’s average ' + (names.length === 1 ? 'price.' : 'prices.');
    if (o.people > 1) s += ' Split ' + (o.people === 2 ? 'between' : 'among') + ' ' + WORDS[o.people] + ' people, that is ' + money(r.each, r.cur) + ' each.';
    return s;
  }
  function cheapestText(r) {
    var c = r.cheapest;
    if (!c) return '';
    return 'Bought in ' + place(c.name) + ', the cheapest country on this route, the same ' + litres(r.litres) + ' would cost ' +
      money(c.cents, r.cur) + ': ' + money(c.saving, r.cur) + ' less. That is the most the difference could be worth, since a tank only carries so much across a border.';
  }

  // The address -------------------------------------------------------------------------------------------------------

  // Inputs only. Distances and the fuel use are written as plain numbers and read back strictly. The money goes in
  // only when the reader chose it (o.curSet): otherwise the link leaves it to the route, as the page does.
  function writeHash(o) {
    var q = {
      fuel: o.fuel, use: plain(o.use), unit: o.unit, dist: o.dist,
      route: o.legs.map(function (l) { return l.code + '-' + plain(l.distance); }).join('_'),
      back: o.back ? 'yes' : 'no', people: String(o.people)
    };
    if (o.curSet && SYMBOL[o.cur]) q.cur = o.cur;
    return '#' + new URLSearchParams(q).toString();
  }
  function plain(n) { return String(Math.round(n * 100) / 100); }

  // Returns null when the address holds no drive (no hash, or a jump to a section), the drive when every value checks
  // out, and throws when it holds a drive that doesn't: the whole link is refused rather than half read.
  function readHash(hash, prices) {
    var q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    if (!q.has('route')) return null;
    var number = /^\d+(\.\d{1,2})?$/, bad = function () { throw new Error('This link to a drive is incomplete or out of date. The calculator shows its usual example instead.'); };
    var o = { fuel: q.get('fuel'), unit: q.get('unit'), dist: q.get('dist'), legs: [] };
    if (['petrol', 'diesel'].indexOf(o.fuel) < 0 || !USE_LIMITS[o.unit] || ['km', 'mi'].indexOf(o.dist) < 0) bad();
    if (!number.test(q.get('use') || '')) bad();
    o.use = parseFloat(q.get('use'));
    if (o.use < USE_LIMITS[o.unit][0] || o.use > USE_LIMITS[o.unit][1]) bad();
    var route = (q.get('route') || '').split('_');
    if (route.length > MAX_LEGS) bad();
    route.forEach(function (part) {
      var m = /^([a-z]{2})-(\d+(?:\.\d{1,2})?)$/.exec(part);
      if (!m || !prices[m[1]]) bad();
      var d = parseFloat(m[2]);
      if (d < 1 || d > MAX_DISTANCE) bad();
      o.legs.push({ code: m[1], distance: d });
    });
    if (['yes', 'no'].indexOf(q.get('back')) < 0 || !/^[1-8]$/.test(q.get('people') || '')) bad();
    if (q.has('cur') && !SYMBOL[q.get('cur')]) bad();
    o.back = q.get('back') === 'yes';
    o.people = +q.get('people');
    o.cur = q.get('cur') || null;   // null: euros, or pounds when the route goes through the UK
    return o;
  }

  // The page ----------------------------------------------------------------------------------------------------------

  function readPrices(table) {
    var prices = {};
    Array.prototype.forEach.call(table.querySelectorAll('tr[data-code]'), function (tr) {
      var get = function (k) { var v = tr.getAttribute('data-' + k); return v == null || v === '' ? null : +v; };
      prices[tr.getAttribute('data-code')] = { name: tr.getAttribute('data-name'), cur: tr.getAttribute('data-cur') || 'eur', week: tr.getAttribute('data-week'), petrol: get('petrol'), diesel: get('diesel') };
    });
    return prices;
  }

  // The money shown when the reader hasn't chosen: pounds for a route through the UK, euros otherwise.
  function autoCur(codes, prices) {
    return codes.some(function (c) { return prices[c] && prices[c].cur === 'gbp'; }) ? 'gbp' : 'eur';
  }

  function init(root, table, prices, fx) {
    var all = function (sel, within) { return Array.prototype.slice.call((within || root).querySelectorAll(sel)); };
    var form = root.querySelector('[data-form]'), results = root.querySelector('[data-results]');
    var legsList = root.querySelector('[data-legs]'), template = root.querySelector('[data-leg-template]');
    var useInput = root.querySelector('[data-use]'), useUnit = root.querySelector('[data-use-unit]'), useError = root.querySelector('[data-use-error]');
    var addButton = root.querySelector('[data-add]'), people = root.querySelector('[data-people]'), back = root.querySelector('[data-return]');
    var curField = root.querySelector('[data-cur-field]'), curRadios = curField ? all('input[name="fuel-cost-cur"]', curField) : [];
    var out = function (name) { return root.querySelector('[data-out="' + name + '"]'); };
    var week = weekName(table.getAttribute('data-week')), state = { fuel: DEFAULTS.fuel, cur: null }, made = 0, liveTimer, notice = '';

    var start = DEFAULTS;
    try { start = readHash(window.location.hash, prices) || DEFAULTS; }
    catch (e) { notice = e.message; }

    state.fuel = start.fuel;
    // Without a rate (the page has one whenever it has UK prices) there is nothing to convert with: euros only
    if (!(fx > 0)) { curRadios = []; if (curField) curField.hidden = true; }
    state.cur = curRadios.length ? start.cur : null;
    useInput.value = plain(start.use);
    useUnit.value = start.unit;
    root.querySelector('input[name="fuel-cost-dist"][value="' + start.dist + '"]').checked = true;
    back.checked = start.back;
    people.value = String(start.people);
    start.legs.forEach(function (leg) { addLeg(leg.code, plain(leg.distance)); });

    form.hidden = false;
    root.querySelector('[data-fuelcost-nojs]').hidden = true;

    all('button[data-fuel]').forEach(function (b) {
      b.addEventListener('click', function () { state.fuel = b.getAttribute('data-fuel'); update(true); });
    });
    curRadios.forEach(function (r) { r.addEventListener('change', function () { if (r.checked) state.cur = r.value; }); });
    useInput.addEventListener('input', function () { update(true); });
    useUnit.addEventListener('change', function () {
      // Turn the figure the reader typed into the other unit, rather than read 6 litres as 6 mpg
      var v = parseAmount(useInput.value);
      if (v != null) useInput.value = figure(Math.round(L100_PER_MPG / v * 10) / 10);
      update(true);
    });
    form.addEventListener('change', function (e) { if (e.target !== useUnit) update(true); });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    legsList.addEventListener('input', function () { update(true); });
    addButton.addEventListener('click', function () {
      var used = all('[data-country]').map(function (s) { return s.value; });
      var next = Object.keys(prices).filter(function (c) { return c !== 'eu' && used.indexOf(c) < 0; }).sort(function (a, b) {
        return prices[a].name.localeCompare(prices[b].name);
      })[0] || 'eu';
      var li = addLeg(next, '');
      li.querySelector('[data-country]').focus();
      update(true);
    });
    root.querySelector('[data-copy]').addEventListener('click', copyLink);

    update(false);
    if (notice) out('basis').textContent = notice + ' ' + out('basis').textContent;

    function addLeg(code, value) {
      var li = template.content.firstElementChild.cloneNode(true), n = ++made;
      var select = li.querySelector('[data-country]'), input = li.querySelector('[data-distance]');
      var error = li.querySelector('[data-distance-error]');
      select.id = 'fuel-cost-country-' + n; li.querySelector('[data-country-label]').setAttribute('for', select.id);
      input.id = 'fuel-cost-distance-' + n; li.querySelector('[data-distance-label]').setAttribute('for', input.id);
      error.id = input.id + '-error'; input.setAttribute('aria-describedby', error.id);
      select.value = code;
      input.value = value;
      li.querySelector('[data-remove]').addEventListener('click', function () {
        li.remove();
        addButton.focus();
        update(true);
      });
      legsList.appendChild(li);
      return li;
    }

    // Reads the form. Returns the drive, or null with the errors shown next to the fields.
    function read() {
      var o = { fuel: state.fuel, unit: useUnit.value, dist: root.querySelector('input[name="fuel-cost-dist"]:checked').value,
        back: back.checked, people: +people.value, legs: [] }, ok = true;
      var lim = USE_LIMITS[o.unit], unitName = o.unit === 'mpg' ? ' mpg (UK)' : ' litres per 100 km';
      o.use = parseAmount(useInput.value);
      var useOk = o.use != null && o.use >= lim[0] && o.use <= lim[1];
      useInput.setAttribute('aria-invalid', useOk ? 'false' : 'true');
      useError.textContent = useOk ? '' : 'Enter a fuel use from ' + lim[0] + ' to ' + lim[1] + unitName + ', for example ' + (o.unit === 'mpg' ? '47' : '6') + '.';
      if (!useOk) ok = false;

      var lis = all('.fuelcost-leg', legsList);
      lis.forEach(function (li, i) {
        var code = li.querySelector('[data-country]').value, input = li.querySelector('[data-distance]');
        var error = li.querySelector('[data-distance-error]'), raw = input.value.trim(), msg = '';
        li.querySelector('[data-dist-unit]').textContent = o.dist === 'mi' ? 'in miles' : 'in km';
        li.querySelector('[data-remove]').hidden = lis.length < 2;
        li.querySelector('[data-remove-name]').textContent = ' ' + prices[code].name;
        if (raw !== '') {
          var d = parseAmount(raw);
          if (d == null || d > MAX_DISTANCE) msg = 'Enter a distance from 1 to ' + group(String(MAX_DISTANCE)) + (o.dist === 'mi' ? ' miles.' : ' km.');
          else if (prices[code][o.fuel] == null) msg = 'There is no ' + o.fuel + ' price for ' + place(prices[code].name) + ' this week.';
          else o.legs.push({ code: code, distance: d });
        }
        // A new line with no distance yet is left out of the sum, with no error, until the reader types one
        input.setAttribute('aria-invalid', msg ? 'true' : 'false');
        error.textContent = msg;
        if (msg) ok = false;
      });
      addButton.hidden = lis.length >= MAX_LEGS;
      o.curSet = !!state.cur;
      o.cur = state.shown = state.cur || autoCur(lis.map(function (li) { return li.querySelector('[data-country]').value; }), prices);
      curRadios.forEach(function (r) { r.checked = r.value === o.cur; });
      return ok && o.legs.length ? o : null;
    }

    function update(byReader) {
      all('button[data-fuel]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-fuel') === state.fuel)); });
      var o = read();
      drawTable(o);
      results.hidden = !o;
      clearTimeout(liveTimer);
      if (!o) { out('live').textContent = ''; return; }
      var r = calculate(prices, o, fx);
      render(r, o);
      if (byReader && global.history && history.replaceState) {
        history.replaceState(null, '', window.location.pathname + window.location.search + writeHash(o));
        root.querySelector('[data-copy-status]').textContent = '';
      }
    }

    function render(r, o) {
      out('verdict').textContent = verdict(r, o);
      out('litres').textContent = litres(r.litres);
      out('cost').textContent = money(r.cents, r.cur);
      if (o.people > 1) {
        out('third-label').textContent = 'Each of ' + WORDS[o.people] + ' people';
        out('third').textContent = money(r.each, r.cur);
      } else if (o.dist === 'mi') {
        out('third-label').textContent = 'Per mile';
        out('third').textContent = small(r.perMile, r.cur);
      } else {
        out('third-label').textContent = 'Per 100 km';
        out('third').textContent = money(r.per100km, r.cur);
      }
      var cheap = cheapestText(r);
      out('cheapest').textContent = cheap;
      out('cheapest').hidden = !cheap;

      var wrap = root.querySelector('[data-leg-table]'), body = root.querySelector('[data-leg-rows]');
      wrap.hidden = r.legs.length < 2;
      body.textContent = '';
      if (r.legs.length > 1) {
        out('leg-distance-head').textContent = o.dist === 'mi' ? 'Miles' : 'Km';
        out('leg-price-head').textContent = SYMBOL[r.cur] + ' a litre';
        r.legs.concat([{ total: true }]).forEach(function (l) {
          var tr = document.createElement('tr');
          var cells = l.total
            ? ['Total', figure(r.distance), r.litres.toFixed(1), '', money(r.cents, r.cur)]
            : [l.name, figure(l.distance), l.litres.toFixed(1), perLitre(l.price, r.cur), money(l.cents, r.cur)];
          cells.forEach(function (text, i) {
            var cell = document.createElement(i === 0 ? 'th' : 'td');
            if (i === 0) cell.scope = 'row'; else cell.className = 'num';
            cell.textContent = text;
            tr.appendChild(cell);
          });
          if (l.total) tr.className = 'fuelcost-total';
          body.appendChild(tr);
        });
      }
      out('basis').textContent = basis(r, o);
      liveTimer = setTimeout(function () { out('live').textContent = verdict(r, o); }, 700);
    }

    function basis(r, o) {
      var uk = r.legs.filter(function (l) { return prices[l.code].cur === 'gbp'; }).length > 0;
      var ukWeek = uk && prices.uk && prices.uk.week && prices.uk.week !== table.getAttribute('data-week') ? weekName(prices.uk.week) : '';
      return 'National average prices for the week of ' + week + ', with every tax, for a car that ' + useText(o) +
        (o.unit === 'mpg' ? ', which is ' + (Math.round(r.l100 * 10) / 10).toFixed(1) + ' litres per 100 km.' : '.') +
        (ukWeek ? ' The UK’s are for the week of ' + ukWeek + ', the latest published.' : '') +
        (r.converted ? ' Pounds and euros are converted at the European Central Bank’s rate of £' + fx + ' to the euro.' : '') +
        (o.back ? ' The distances include the way back.' : '');
    }

    // The table of what 100 km costs follows the reader's fuel use, units and money
    // While the fuel use being typed isn't valid, the table keeps the last one that was.
    var tableUse = { unit: start.unit, use: start.use };
    function drawTable(o) {
      var unit = o ? o.unit : useUnit.value, use = o ? o.use : parseAmount(useInput.value);
      if (use != null && use >= USE_LIMITS[unit][0] && use <= USE_LIMITS[unit][1]) tableUse = { unit: unit, use: use };
      unit = tableUse.unit; use = tableUse.use;
      var cur = state.shown || 'eur';
      var dist = root.querySelector('input[name="fuel-cost-dist"]:checked').value;
      var l100 = unit === 'mpg' ? L100_PER_MPG / use : use, per = l100 * (dist === 'mi' ? KM_PER_MILE : 1);
      var span = dist === 'mi' ? '100 miles' : '100 km';
      document.getElementById('fuel-cost-table-title').textContent = 'What ' + span + ' costs in each country';
      table.parentNode.setAttribute('aria-label', 'What ' + span + ' of driving costs in each country');
      document.querySelector('[data-table-intro]').textContent = 'At this week’s average prices, in a car that ' +
        useText({ unit: unit, use: use }) + '.';
      all('[data-per-head]', table).forEach(function (th, i) { th.textContent = (i === 0 ? 'Petrol, ' : 'Diesel, ') + span; });
      all('[data-litre-head]', table).forEach(function (th, i) { th.textContent = (i === 0 ? 'Petrol, ' : 'Diesel, ') + SYMBOL[cur] + ' a litre'; });
      all('tr[data-code]', table).forEach(function (tr) {
        var p = prices[tr.getAttribute('data-code')];
        if (!p) return;
        ['petrol', 'diesel'].forEach(function (fuel) {
          if (p[fuel] == null) return;
          var price = convert(p[fuel], p.cur, cur, fx), litre = tr.querySelector('[data-litre="' + fuel + '"]');
          if (litre) litre.textContent = perLitre(price, cur);
          var cell = tr.querySelector('[data-per="' + fuel + '"]');
          if (cell) cell.textContent = money(price * per / 10, cur);
        });
      });
    }

    function copyLink() {
      var status = root.querySelector('[data-copy-status]'), o = read();
      if (!o) return;
      var url = window.location.origin + window.location.pathname + writeHash(o);
      var done = function () { status.textContent = 'Link copied.'; };
      var fail = function () { status.textContent = 'Copy the address from your browser’s address bar: it holds this drive.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fail);
      else fail();
    }
  }

  function start() {
    var root = document.querySelector('[data-fuel-cost]'), table = document.querySelector('[data-prices]');
    if (!root || !table || !('content' in document.createElement('template')) || !global.URLSearchParams) return;
    init(root, table, readPrices(table), parseFloat(table.getAttribute('data-gbp-per-eur')));
  }

  global.FuelCost = { calculate: calculate, verdict: verdict, cheapestText: cheapestText, readHash: readHash, writeHash: writeHash,
    parseAmount: parseAmount, euros: euros, money: money, small: small, convert: convert, autoCur: autoCur, litres: litres,
    distance: distance, L100_PER_MPG: L100_PER_MPG };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
