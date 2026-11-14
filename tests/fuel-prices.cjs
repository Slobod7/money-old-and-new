// Run: node tests/fuel-prices.cjs. The fuel page's sums and sentences (assets/js/fuel-prices.js), checked against
// the two files scripts/update-fuel-data.py wrote: what the script printed for Jekyll must be what the page's
// JavaScript works out from the weekly history, figure for figure.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../assets/js/fuel-prices.js');   // with no document, it only sets globalThis.FuelPrices
const F = globalThis.FuelPrices;
const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
const page = read('_data/fuel_prices.json'), history = read('assets/data/fuel.json');
const m = F.model(history);
let checks = 0;
const same = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

// The two files describe the same week
same(history.week, page.week); same(history.scales, page.scales); same(history.fill_litres, page.fill_litres);
same(m.codes.length, page.countries);
same(m.day(m.last).toISOString().slice(0, 10), page.week, 'the last week of the history is the page’s week');

// Every figure on the page, for each country and the EU average
const rows = page.rows.map(r => [r.code, r]).concat([['EU', {petrol: page.eu.petrol, diesel: page.eu.diesel}]]);
for (const [code, row] of rows) {
  for (const fuel of ['petrol', 'diesel']) {
    const shown = row[fuel], f = m.figures(code, fuel), where = `${code} ${fuel}`;
    if (!shown) { same(f, null, where); continue; }
    same(F.euros(f.price), '€' + shown.price, where); same(F.euros(f.pretax), '€' + shown.pretax, where);
    same(F.euros(f.tax), '€' + shown.tax, where); same(f.share, shown.share, where);
    same(f.pretax + f.tax, f.price, where + ': the parts add up');
    same(F.money(f.price, history.fill_litres), '€' + shown.fill, where);
    same(F.priceClass(f.price, history.scales[fuel].price), shown.price_class, where);
    if (shown.change === undefined) { same(f.change, undefined, where); continue; }
    same(F.cents(f.change), shown.change + 'c', where); same(F.cents(f.pretaxChange), shown.pretax_change + 'c', where);
    same(F.cents(f.taxChange), shown.tax_change + 'c', where);
    same(f.pretaxChange + f.taxChange, f.change, where + ': the change’s parts add up');
    same(F.changeClass(f.change, history.scales[fuel].change), shown.change_class, where);
    if (code !== 'EU') same(F.cents(f.price - m.figures('EU', fuel).price), shown.vs_eu + 'c', where);
  }
  if (code !== 'EU') same(m.repeats(code), !!row.repeats, code + ' repeats');
}
for (const fuel of ['petrol', 'diesel']) {
  same(F.legendLabels('price', history.scales[fuel].price), page.legend[fuel].price);
  same(F.legendLabels('change', history.scales[fuel].change), page.legend[fuel].change);
}

// The chart's three measures: tax is the gap between the other two, week by week, with gaps kept as gaps
const pump = m.history('FR', 'diesel', 'price'), pre = m.history('FR', 'diesel', 'pretax'), tax = m.history('FR', 'diesel', 'tax');
same(pump.length, history.weeks);
pump.forEach((v, i) => same(tax[i], v == null || pre[i] == null ? null : v - pre[i]));

// Classes on their edges
same([1499, 1500, 2250].map(v => F.priceClass(v, [1500, 1750, 2000, 2250])), [0, 1, 4]);
same([-250, -100, -99, -11, -10, 0, 10, 11, 99, 100].map(v => F.changeClass(v, [-100, -10, 10, 100])), [0, 0, 1, 1, 2, 2, 2, 3, 3, 4]);

// Formats
same([F.euros(1877), F.cents(-52), F.cents(0), F.cents(4), F.money(1877, 50)], ['€1.877', '−5.2c', '0.0c', '+0.4c', '€93.85']);

// The comparison's sentences
const fig = (price, pretax) => ({price, pretax, tax: price - pretax});
same(F.verdict('diesel', 50, 'France', fig(2178, 1207), 'Spain', fig(1898, 1390), false),
  'A 50-litre fill of diesel costs €14.00 more in France than in Spain. Before tax it is 18.3c a litre cheaper in France; tax adds 46.3c the other way.');
same(F.verdict('diesel', 50, 'Romania', fig(2033, 1287), 'EU average', fig(2097, 1299), true),
  'A 50-litre fill of diesel costs €3.20 less in Romania than at the EU average. Of the 6.4c-a-litre gap, 5.2c is tax and 1.2c the price before tax.');
same(F.verdict('petrol', 50, 'Netherlands', fig(2000, 1300), 'Belgium', fig(1900, 1100), false),
  'A 50-litre fill of petrol costs €5.00 more in the Netherlands than in Belgium. Tax is 10.0c a litre lower in the Netherlands; the price before tax adds 20.0c the other way.');
same(F.verdict('petrol', 50, 'Austria', fig(1800, 900), 'Belgium', fig(1800, 900), false), 'A 50-litre fill of petrol costs the same in Austria as in Belgium: €90.00.');
same(F.verdict('petrol', 50, 'Austria', fig(1800, 900), 'Belgium', fig(1700, 900), false), 'A 50-litre fill of petrol costs €5.00 more in Austria than in Belgium. Before tax the two prices match: the gap is all tax.');
same(F.verdict('petrol', 50, 'Austria', fig(1800, 1000), 'Belgium', fig(1700, 900), false), 'A 50-litre fill of petrol costs €5.00 more in Austria than in Belgium. The tax on a litre is the same: the gap is all in the price before tax.');
same(F.verdict('petrol', 50, 'Austria', fig(1800, 1000), 'Spain', null, false), 'No figures this week for Spain.');

// The map's summary counts, and the chart's axis
same(F.tally([['fell', 16], ['rose', 10], ['held', 1]], 27), 'fell in 16 countries, rose in 10 and held in 1');
same(F.tally([['fell', 26], ['rose', 0], ['held', 1]], 27), 'fell in 26 countries and held in 1');
same(F.tally([['fell', 27], ['rose', 0], ['held', 0]], 27), 'fell in all 27 countries');
same(F.tally([['fell', 0], ['rose', 1], ['held', 26]], 27), 'rose in 1 country and held in 26');
same(F.axis(1395, 2371), {y0: 1200, y1: 2400, step: 200});   // 976 apart: five steps of 20c cover it
same(F.axis(650, 905), {y0: 600, y1: 1000, step: 100});
same(F.axis(662, 905), {y0: 650, y1: 950, step: 50});
same(F.axis(1800, 1800), {y0: 1800, y1: 1850, step: 50});

console.log(`fuel-prices: ${checks} checks passed`);
