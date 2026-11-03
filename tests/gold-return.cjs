// Synthetic test data only. Run from the repository root: node tests/gold-return.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function load(file) {
  const context = { window: {}, document: { readyState: 'loading', addEventListener() {} } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  return context.window.OldNewCalculator;
}
const calc = load('assets/js/old-new-calculator.js');
let checks = 0;
function near(a, b, message) { assert.ok(Math.abs(a - b) < 1e-8, `${message}: ${a} vs ${b}`); checks++; }
function equal(a, b) { assert.equal(a, b); checks++; }
function fixture(keys, eur, usd = eur, hicp = keys.map(() => 100), cpi = hicp) {
  return calc.prepare({ assets: [{ id: 'gold' }], cols: ['month', 'hicp', 'gold'], rows: keys.map((k, i) => [k, hicp[i], eur[i]]),
    gold: { cols: ['month', 'usd', 'eurusd', 'cpi'], rows: keys.map((k, i) => [k, usd[i], usd[i] / eur[i], cpi[i]]) } });
}
const keys = ['2021-01', '2021-02', '2021-03', '2021-04'];
const data = fixture(keys, [100, 50, 80, 100], [200, 125, 200, 250], [100, 110, 120, 125], [100, 100, 100, 100]);
const base = { mode: 'lump', amount: 1000, start: '2021-01', end: '2021-04', real: false, currency: 'EUR', assets: ['gold'], gold: true };
let r = calc.calculate(data, base), x = r.results[0];
near(x.value, 1000, 'Lump recovery'); near(x.fall.gap, -0.5, 'Largest price fall');
equal(x.fall.from, '2021-01'); equal(x.fall.to, '2021-02'); equal(x.fall.recovery, '2021-04');
r = calc.calculate(data, { ...base, end: '2021-03' });
equal(r.results[0].fall.recovery, null); near(r.results[0].value, 800, 'End bound');
r = calc.calculate(data, { ...base, end: base.start });
near(r.results[0].value, 1000, 'Same-month lump'); equal(r.results[0].annual, null); equal(r.results[0].fall.gap, 0);
r = calc.calculate(data, { ...base, mode: 'monthly', end: base.start });
near(r.results[0].value, 1000, 'Same-month monthly'); equal(r.buys, 1);
r = calc.calculate(data, { ...base, mode: 'monthly' });
equal(r.buys, 4); near(r.putIn, 4000, 'Contributions');
near(r.results[0].value, (10 + 20 + 12.5 + 10) * 100, 'Each purchase buys its own units, final flow earns nothing');
near(r.results[0].gainPct, 5250 / 4000 - 1, 'Monthly total return denominator');
near(r.results[0].fall.gap, -0.5, 'Contributions cannot mask price fall');
r = calc.calculate(data, { ...base, mode: 'monthly', real: true });
near(r.base, 1000 * (125 / 100 + 125 / 110 + 125 / 120 + 1), 'Each contribution inflation period');
near(r.results[0].value, 5250, 'Terminal value already in terminal-month money');
near(r.results[0].points[1].value, 1500 * 125 / 110, 'Real chart basis');
r = calc.calculate(data, { ...base, currency: 'USD' }); near(r.results[0].value, 1250, 'Dollar prices');
r = calc.calculate(data, { ...base, currency: 'USD', real: true });
near(r.base, 1000, 'US CPI, not HICP'); near(r.results[0].value, 1250, 'Real USD');
near(data.months[1].goldUSD / data.months[1].levels.gold, 2.5, 'USD per EUR direction');
const annualKeys = Array.from({ length: 13 }, (_, i) => `${2021 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`);
const end = k => Date.UTC(+k.slice(0, 4), +k.slice(5), 0);
const years = annualKeys.map(k => (end(k) - end(annualKeys[0])) / 86400000 / 365);
const levels = years.map(t => 100 * Math.pow(1.1, t)), inflation = years.map(t => 100 * Math.pow(1.02, t));
const annualData = fixture(annualKeys, levels, levels, inflation, inflation);
for (const currency of ['EUR', 'USD']) for (const real of [false, true]) for (const mode of ['lump', 'monthly']) {
  r = calc.calculate(annualData, { ...base, currency, real, mode, end: '2022-01' });
  near(r.results[0].annual, real ? 1.1 / 1.02 - 1 : 0.1, `${currency} ${mode} ${real} annualisation`);
}
for (const o of [{ start: '1998-12' }, { end: '2021-05' }, { start: '2021-04', end: '2021-01' }, { amount: 0 }, { amount: NaN }, { amount: 100000001 }, { currency: 'GBP' }, { mode: 'daily' }]) {
  assert.throws(() => calc.calculate(data, { ...base, ...o })); checks++;
}
const shipped = calc.prepare(JSON.parse(fs.readFileSync('assets/data/old-new.json')));
const comparison = calc.calculate(shipped, { mode: 'lump', amount: 1000, start: '2000-01', real: true });
const gold = calc.calculate(shipped, { ...base, start: '2000-01', end: shipped.raw.to, real: true });
near(gold.results[0].value, comparison.results.find(x => x.asset.id === 'gold').value, 'Existing comparison parity');
equal(comparison.results.length, 6);
console.log(`All ${checks} gold-return checks passed.`);
// Check every shipped conversion, not just a coincidentally correct return ratio.
// The public data file holds gold in euros only, so this runs only on a file with a US-dollar series.
if (shipped.raw.gold) {
  const gi = shipped.raw.cols.indexOf('gold');
  shipped.raw.gold.rows.forEach((row, i) => {
    equal(row[0], shipped.raw.rows[i][0]);
    near(shipped.raw.rows[i][gi], Number((row[1] / row[2]).toPrecision(7)), 'Shipped USD / monthly FX = existing EUR gold');
    assert.ok(row[3] > 0); checks++;
  });
  console.log(`Including all shipped month/FX/inflation checks: ${checks} passed.`);
}
