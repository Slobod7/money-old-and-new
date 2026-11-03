// Run: node tests/gold-stocks.cjs. Synthetic observations stay in this excluded tests directory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {}, document: { readyState: 'loading', addEventListener() {} }, URLSearchParams };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/old-new-calculator.js'), 'utf8'), context);
const engine = context.window.OldNewCalculator;
let checks = 0;
function eq(a, b) { assert.equal(a, b); checks++; }
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`); checks++; }
function fails(f) { assert.throws(f); checks++; }
const raw = { assets: ['gold', 'us', 'europe'].map(id => ({ id, name: id, short: id, from: '2020-01' })),
  cols: ['month', 'hicp', 'gold', 'us', 'europe'],
  rows: [ ['2020-01', 100, 100, 100, 100], ['2020-02', 102, 80, 110, 95], ['2020-03', 105, 60, 90, 90],
    ['2020-04', 108, 90, 120, 110], ['2020-05', 110, 100, 130, 120] ] };
const d = engine.prepare(raw);
const options = { amount: 100, mode: 'lump', start: '2020-01', end: '2020-04', real: false, assets: ['gold', 'us'] };
const calc = changes => engine.calculate(d, Object.assign({}, options, changes));
const gold = r => r.results.find(x => x.asset.id === 'gold');
let r = calc();
eq(r.to, '2020-04'); eq(r.results.length, 2); eq(r.buys, 1);
near(gold(r).value, 90); near(gold(r).gainPct, -.1); near(gold(r).fall.gap, -.4);
eq(gold(r).fall.from, '2020-01'); eq(gold(r).fall.to, '2020-03'); eq(gold(r).fall.recovery, null);
eq(gold(calc({ end: '2020-05' })).fall.recovery, '2020-05');
eq(gold(calc({ end: '2020-05', real: true })).fall.recovery, null);
r = calc({ mode: 'monthly' });
eq(r.buys, 4); near(r.putIn, 400);
near(gold(r).value, 90 * (1 + 100 / 80 + 100 / 60 + 100 / 90));
near(gold(r).fall.gap, -.4); // Contributions must not mask the asset's drawdown.
const rr = calc({ mode: 'monthly', real: true });
near(gold(rr).value, gold(r).value); // End values have an end-month deflator of one.
near(rr.base, 100 * (108 / 100 + 108 / 102 + 108 / 105 + 1));
near(gold(rr).gainPct, gold(rr).value / rr.base - 1);
near(gold(rr).points[0].value, 108); near(gold(rr).points[0].putIn, 108);
r = calc({ mode: 'monthly', start: '2020-04' });
eq(r.buys, 1); near(gold(r).value, 100); near(gold(r).gainPct, 0); eq(gold(r).annual, null);
for (const changes of [{ end: '2019-12' }, { end: '2021-01' }, { start: '2020-06' }, { amount: NaN }]) fails(() => calc(changes));
for (const col of [2, 3]) {
  const gap = JSON.parse(JSON.stringify(raw)); gap.rows[2][col] = null;
  const result = engine.calculate(engine.prepare(gap), options);
  eq(result.unavailable.length, 1); eq(result.unavailable[0].missing, '2020-03'); eq(result.to, options.end);
}
const hicpGap = JSON.parse(JSON.stringify(raw)); hicpGap.rows[1][1] = null;
fails(() => engine.calculate(engine.prepare(hicpGap), Object.assign({}, options, { real: true })));
const monthGap = JSON.parse(JSON.stringify(raw)); monthGap.rows.splice(1, 1);
fails(() => engine.calculate(engine.prepare(monthGap), options));
const yearly = { assets: raw.assets, cols: raw.cols, rows: Array.from({length: 13}, (_, i) => {
  const key = i === 12 ? '2022-01' : `2021-${String(i + 1).padStart(2, '0')}`;
  const level = 100 * Math.pow(1.1, i / 12);
  return [key, 100, level, level, level];
}) };
r = engine.calculate(engine.prepare(yearly), { amount: 100, mode: 'lump', start: '2021-01', end: '2022-01', real: false });
near(gold(r).annual, .1);
r = engine.calculate(engine.prepare(yearly), { amount: 100, mode: 'monthly', start: '2021-01', end: '2022-01', real: false });
const rate = gold(r).annual;
const flows = r.results[0].points.map(p => [Date.UTC(+p.key.slice(0, 4), +p.key.slice(5), 0), -100]);
const t0 = flows[0][0];
const residual = flows.reduce((sum, f) => sum + f[1] / Math.pow(1 + rate, (f[0] - t0) / 86400000 / 365), 0) + gold(r).value / Math.pow(1 + rate, 1);
near(residual, 0);
const state = Object.assign({}, options, { view: 'gold-stocks', benchmark: 'europe', pick: 'gold' });
const restored = engine.readPreset(engine.presetHash(state));
for (const k of ['amount', 'mode', 'start', 'end', 'real', 'view', 'benchmark', 'pick']) eq(restored[k], state[k]);
for (const bad of ['#view=gold-stocks', engine.presetHash(Object.assign({}, state, { start: '2020-13' })), engine.presetHash(Object.assign({}, state, { benchmark: 'sp500' }))]) fails(() => engine.readPreset(bad));
eq(engine.readPreset('#ordinary-anchor'), null);
// Stored history: independent monthly-unit sum and rebased real contributions for both benchmarks.
const stored = engine.prepare(JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/data/old-new.json'), 'utf8')));
for (const real of [true, false]) for (const mode of ['lump', 'monthly']) for (const id of ['gold', 'us', 'europe']) {
  const start = '2007-10', end = '2012-06', amount = 250;
  const m = stored.months.filter(x => x.key >= start && x.key <= end);
  const buys = mode === 'lump' ? m.slice(0, 1) : m;
  const units = buys.reduce((sum, x) => sum + amount / x.levels[id], 0);
  const expected = units * m[m.length - 1].levels[id];
  const actual = engine.calculate(stored, { start, end, amount, mode, real, assets: [id] });
  near(actual.results[0].value, expected);
  near(actual.base, buys.reduce((sum, x) => sum + amount * (real ? m[m.length - 1].hicp / x.hicp : 1), 0));
  eq(actual.to, end);
}
console.log(`All ${checks} gold-versus-stocks checks passed.`);
