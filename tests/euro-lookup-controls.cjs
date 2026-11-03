// Run: node tests/euro-lookup-controls.cjs. The end month and share link on the euro calculator.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {}, document: { readyState: 'loading', addEventListener() {} }, URLSearchParams };
const source = fs.readFileSync(path.join(__dirname, '../assets/js/old-new-calculator.js'), 'utf8');
vm.runInNewContext(source, context);
const engine = context.window.OldNewCalculator;
let checks = 0;
const eq = (a, b, why) => { assert.equal(JSON.stringify(a), JSON.stringify(b), why); checks++; };  // values cross from the vm's realm
const near = (a, b, tol = 1e-9) => { assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`); checks++; };
const fails = f => { assert.throws(f); checks++; };
const plain = x => JSON.parse(JSON.stringify(x));

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/data/old-new.json'), 'utf8'));
const stored = engine.prepare(raw);
const latest = raw.rows[raw.rows.length - 1][0];

// The prompt's fixture: an index of 58.35 rising to 104.31
const fixture = engine.prepare({ assets: [{ id: 'cash', name: 'Cash', short: 'cash', from: '2000-01' }], cols: ['month', 'hicp', 'cash'],
  rows: [['2000-01', 58.35, 1], ['2000-02', 80, 1], ['2000-03', 104.31, 1]] });
const fixed = engine.inflation(fixture, 1000, '2000-01', '2000-03');
near(fixed.equivalent, 1787.660668, 1e-6); near(fixed.loss, 0.44060972, 1e-8); near(fixed.rise, 0.78766067, 1e-8);
const earlier = engine.inflation(fixture, 1000, '2000-01', '2000-02');
near(earlier.equivalent, 1000 * 80 / 58.35);

// Every result with a chosen end month equals the same calculation on data that simply stops there.
const compare = (a, b) => {
  eq(a.to, b.to); eq(a.buys, b.buys); near(a.putIn, b.putIn); near(a.putInReal, b.putInReal, 1e-6); near(a.days, b.days);
  eq(a.results.map(x => x.asset.id), b.results.map(x => x.asset.id));
  eq(plain(a.unavailable), plain(b.unavailable));
  a.results.forEach((x, i) => {
    const y = b.results[i];
    near(x.value, y.value, 1e-6); near(x.gainPct, y.gainPct);
    if (x.annual == null) eq(y.annual, null); else near(x.annual, y.annual, 1e-7);
    eq(plain(x.fall), plain(y.fall)); eq(x.worst.key, y.worst.key); eq(x.points.length, y.points.length);
  });
};
for (const end of ['2015-06', '2008-12', '2020-03']) {
  const cut = engine.prepare(Object.assign({}, raw, { rows: raw.rows.filter(r => r[0] <= end) }));
  for (const mode of ['lump', 'monthly']) for (const real of [true, false]) for (const start of ['1999-01', '2003-09', '2008-02']) {
    const o = { mode, real, start, amount: 250 };
    const chosen = engine.calculate(stored, Object.assign({ end }, o));
    compare(chosen, engine.calculate(cut, o));
    chosen.results.forEach(x => {
      eq(x.points[x.points.length - 1].key, end);
      assert.ok(x.points.every(p => p.key >= start && p.key <= end)); checks++;
      if (x.fall.to) { assert.ok(x.fall.from >= start && x.fall.to <= end); checks++; }
      if (x.fall.recovery) { assert.ok(x.fall.recovery <= end); checks++; }
    });
  }
  eq(plain(engine.januaryRows(stored, end)), plain(engine.januaryRows(cut, end)));
  eq(plain(engine.startRows(stored, '2003-09', end, true)), plain(engine.startRows(cut, '2003-09', end, true)));
  near(engine.inflation(stored, 100, '2003-09', end).equivalent, engine.inflation(cut, 100, '2003-09', end).equivalent);
}
// Different end months give different answers: the endpoint is really used.
const at = end => engine.calculate(stored, { mode: 'monthly', real: true, start: '2005-01', end, amount: 100 });
eq(at('2010-01').buys, 61); eq(at('2020-01').buys, 181);
assert.notEqual(at('2010-01').results[0].value, at('2020-01').results[0].value); checks++;

// Invalid and zero-length windows
for (const [start, end, words] of [['2020-06', '2020-05', 'before the start'], ['2020-06', '2099-01', 'no data'], ['1998-12', '2020-05', 'no data'], ['2099-01', '2099-02', 'no data']]) {
  const problem = engine.dateProblem(stored, start, end);
  assert.ok(problem.includes(words), problem); checks++;
  assert.ok(problem.includes('not been changed'), problem); checks++;
}
eq(engine.dateProblem(stored, '2020-06', '2020-06'), null); eq(engine.dateProblem(stored, raw.rows[0][0], latest), null);
fails(() => engine.calculate(stored, { mode: 'lump', real: true, start: '2020-06', end: '2020-05', amount: 100 }));
fails(() => engine.calculate(stored, { mode: 'lump', real: true, start: '2020-06', end: '2099-01', amount: 100 }));
for (const mode of ['lump', 'monthly']) for (const real of [true, false]) {
  const r = engine.calculate(stored, { mode, real, start: '2020-06', end: '2020-06', amount: 100 });
  eq(r.buys, 1); eq(r.days, 0); near(r.base, 100);
  r.results.forEach(x => { near(x.value, 100); near(x.gainPct, 0); eq(x.annual, null); eq(x.fall.gap, 0); });
}
near(engine.inflation(stored, 100, '2020-06', '2020-06').equivalent, 100);

// Bitcoin's dates: no silent move to its first month, at either end of the window
const names = r => r.unavailable.map(a => a.id);
assert.ok(names(engine.calculate(stored, { mode: 'lump', real: false, start: '2005-01', end: '2020-01', amount: 100 })).includes('bitcoin')); checks++;
assert.ok(names(engine.calculate(stored, { mode: 'lump', real: false, start: '2005-01', end: '2009-12', amount: 100 })).includes('bitcoin')); checks++;
eq(names(engine.calculate(stored, { mode: 'lump', real: false, start: '2010-07', end: '2020-01', amount: 100 })), []);
eq(engine.calculate(stored, { mode: 'lump', real: false, start: '2005-01', end: '2020-01', amount: 100 }).unavailable[0].missing, '2005-01');
assert.ok(names(engine.calculate(stored, { mode: 'lump', real: false, start: '1999-06', end: '1999-12', amount: 100 })).includes('deposit')); checks++;

// Amounts
for (const amount of [0, -5, NaN, Infinity, 0.5, 1e9]) fails(() => engine.calculate(stored, { mode: 'lump', real: true, start: '2020-01', end: '2020-02', amount }));

// Purchase counts are inclusive of both months
for (const [start, end, n] of [['2020-01', '2020-12', 12], ['2020-01', '2020-01', 1], ['2019-12', '2020-01', 2], ['2000-01', '2026-09', 321]]) {
  eq(engine.calculate(stored, { mode: 'monthly', real: false, start, end, amount: 10 }).buys, n);
  near(engine.calculate(stored, { mode: 'monthly', real: false, start, end, amount: 10 }).putIn, n * 10);
  eq(engine.calculate(stored, { mode: 'lump', real: false, start, end, amount: 10 }).buys, 1);
}

// Real and nominal agree at the end month; only the comparison base and earlier points differ
for (const mode of ['lump', 'monthly']) {
  const o = { mode, start: '2004-03', end: '2018-11', amount: 300 };
  const n = engine.calculate(stored, Object.assign({ real: false }, o)), v = engine.calculate(stored, Object.assign({ real: true }, o));
  n.results.forEach(x => {
    const y = v.results.find(z => z.asset.id === x.asset.id);
    near(x.value, y.value, 1e-6);
    assert.ok(y.points[0].value > x.points[0].value); checks++;
  });
  assert.ok(v.base > n.base); checks++;
  // The contribution total adds each payment at its own month's index, not the total at the start's.
  if (mode === 'monthly') {
    const m = stored.months.filter(x => x.key >= o.start && x.key <= o.end), end = m[m.length - 1].hicp;
    near(v.base, m.reduce((sum, x) => sum + 300 * end / x.hicp, 0), 1e-6);
  }
}

// Share links: a round trip, the shapes already in use, and hostile values
const link = { view: 'all', amount: 1234.5, mode: 'monthly', start: '2003-05', end: '2019-02', real: false, benchmark: 'us', pick: 'bund', data: '2026-11-02' };
const back = engine.readPreset(engine.presetHash(link));
for (const k of Object.keys(link)) eq(back[k], link[k]);
assert.ok(!engine.presetHash(link).includes('benchmark')); checks++;
const again = engine.calculate(stored, back);
compare(again, engine.calculate(stored, link));
const gs = engine.readPreset('#view=gold-stocks&amount=1000&mode=lump&start=2010-01&end=2020-01&real=yes&benchmark=europe&asset=gold');
eq(gs.view, 'gold-stocks'); eq(gs.benchmark, 'europe'); eq(gs.data, null);
eq(engine.readPreset('#view=all&amount=1000&mode=lump&start=2010-01&end=2020-01&real=yes&benchmark=us&asset=gold').benchmark, 'us');
eq(engine.readPreset('#view=all&amount=1000&mode=lump&start=2010-01&end=2020-01&real=no').pick, null);
for (const ordinary of ['', '#', '#old-new', '#gold-return', '#euro-sources', '#view=bitcoin-gold&amount=1000']) eq(engine.readPreset(ordinary), null);
const good = 'view=all&amount=1000&mode=lump&start=2010-01&end=2020-01&real=yes&asset=gold';
const bad = [
  ['view', '<script>alert(1)</script>'], ['view', '__proto__'], ['amount', '0'], ['amount', '-5'], ['amount', '1e9'], ['amount', 'abc'], ['amount', '100000001'], ['amount', '1.234'],
  ['amount', '<img src=x onerror=alert(1)>'], ['mode', 'constructor'], ['start', '2020-13'], ['start', '2020'], ['start', '2020-01-01'], ['start', '__proto__'],
  ['end', '2009-12'], ['end', "2020-01'"], ['real', 'maybe'], ['benchmark', 'nasdaq'], ['asset', 'toString'], ['asset', '"><svg onload=alert(1)>'],
  ['data', '<b>2026</b>'], ['data', '2026-13-01'], ['data', 'yesterday'],
];
for (const [key, value] of bad) {
  const q = new URLSearchParams(good); q.set(key, value);
  assert.throws(() => engine.readPreset('#' + q.toString()), /invalid/i, key + '=' + value); checks++;
}
for (const missing of ['amount', 'mode', 'start', 'end', 'real']) {
  const q = new URLSearchParams(good); q.delete(missing);
  fails(() => engine.readPreset('#' + q.toString()));
}
// A well-formed link can still ask for months that aren't stored: the page refuses them through this check.
const far = engine.readPreset('#view=all&amount=1000&mode=lump&start=1990-01&end=2090-01&real=yes');
assert.ok(engine.dateProblem(stored, far.start, far.end)); checks++;
// Nothing read from a link can reach the page as HTML: the only HTML this file writes is one fixed message.
eq(source.match(/insertAdjacentHTML|innerHTML|document\.write/g).length, 1);
assert.ok(source.includes("insertAdjacentHTML('beforeend', ' <span class=\"oil-error\">The calculator couldn’t load its data.</span>')")); checks++;

// The end month and share link no longer depend on the preview setting; the two-asset view still does.
const include = fs.readFileSync(path.join(__dirname, '../_includes/old-new-calculator.html'), 'utf8');
assert.ok(/\{% if cc_dates %\}\s*<fieldset class="oil-field">\s*<legend>Ending at the end of/.test(include)); checks++;
assert.ok(/\{% if cc_dates %\}<p class="oil-note"><a data-out="share">/.test(include)); checks++;
assert.ok(/\{% if site\.gold_stocks_preview %\}\s*<div class="oil-field"[^>]*>\s*<label for="\{\{ cc \}\}-view">/.test(include)); checks++;
assert.ok(/assign cc_dates = true/.test(include) && /include\.interpretation or site\.gold_stocks_preview/.test(include)); checks++;
const config = fs.readFileSync(path.join(__dirname, '../_config.yml'), 'utf8');
assert.ok(!/gold_stocks_preview/.test(config)); checks++;

console.log(`All ${checks} end-month and share-link checks passed.`);
