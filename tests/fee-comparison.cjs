// Run: node tests/fee-comparison.cjs. Two fees through the existing scenario engine; no packages or market data needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../assets/js/investment-math.js');
let checks = 0;
const near = (a, b, why, tol = 1e-7) => { assert.ok(Math.abs(a - b) <= tol, `${why}: ${a} != ${b}`); checks++; };
const ok = (v, why) => { assert.ok(v, why); checks++; };
const base = { startingAmount: 10000, monthlyContribution: 200, months: 240, annualReturn: 0.05, annualInflation: 0.02, feeA: 0.005, feeB: 0.015 };
const run = changes => M.compareFees(Object.assign({}, base, changes));

// Each side is exactly the calculator's own scenario, so there's no second calculator.
let r = run();
const single = fee => M.calculate(Object.assign({}, base, { annualFee: fee }));
near(r.final.balanceA, single(0.005).final.nominalBalance, 'Fee A is calculate()', 0);
near(r.final.balanceB, single(0.015).final.nominalBalance, 'Fee B is calculate()', 0);
near(r.final.realBalanceA, single(0.005).final.realBalance, 'Fee A real', 0);
near(r.final.difference, r.final.balanceA - r.final.balanceB, 'Difference', 0);
near(r.final.realDifference, r.final.difference / Math.pow(1.02, 20), 'Real difference has one price basis');
// The €2,531 figure on the euro page: €10,000, 20 years, 5% gross, 0.5% fee, against no fee.
const page = M.compareFees({ startingAmount: 10000, monthlyContribution: 0, months: 240, annualReturn: 0.05, annualInflation: 0, feeA: 0, feeB: 0.005 });
near(page.final.difference, 10000 * Math.pow(1.05, 20) - 10000 * Math.pow(1.05 * 0.995, 20), 'Closed form', 1e-6);
assert.equal(Math.round(page.final.difference), 2531); checks++;

// Identical fees give identical outcomes, month by month
r = run({ feeA: 0.01, feeB: 0.01 });
r.points.forEach(p => { assert.equal(p.balanceA, p.balanceB); assert.equal(p.difference, 0); assert.equal(p.realDifference, 0); checks += 3; });

// Zero fees match the uncharged scenario
r = run({ feeA: 0, feeB: 0.01 });
near(r.final.balanceA, single(0.01).final.feeFreeBalance, 'Zero fee equals fee-free', 0);
r.a.points.forEach(p => { assert.equal(p.nominalBalance, p.feeFreeBalance); checks++; });

// Later contributions are never charged for earlier years: with no return, payment k has only its own months of fee
for (const fee of [0.1, 0.25]) {
  const months = 36, payment = 100;
  const got = M.compareFees({ startingAmount: 0, monthlyContribution: payment, months, annualReturn: 0, annualInflation: 0, feeA: 0, feeB: fee });
  let expected = 0;
  for (let k = 1; k <= months; k++) expected += payment * Math.pow(1 - fee, (months - k) / 12);
  near(got.final.balanceB, expected, 'Each payment bears its own months only');
  near(got.final.balanceA, months * payment, 'No fee, no return');
  // The newest payment has borne nothing yet, so the difference after month 1 is zero.
  near(got.points[1].difference, 0, 'First payment arrives after the fee');
  // Adding a further month's payment raises the balance by the full payment less one month's fee on the rest.
  near(got.points[2].balanceB, payment * Math.pow(1 - fee, 1 / 12) + payment, 'Second month');
}
// A charge on a starting amount alone compounds for the whole horizon; a same-sized last payment isn't charged at all.
const lump = M.compareFees({ startingAmount: 100, monthlyContribution: 0, months: 12, annualReturn: 0, annualInflation: 0, feeA: 0, feeB: 0.1 });
near(lump.final.balanceB, 90, 'A year of 10% on the start');
const late = M.compareFees({ startingAmount: 0, monthlyContribution: 100, months: 1, annualReturn: 0, annualInflation: 0, feeA: 0, feeB: 0.1 });
near(late.final.balanceB, 100, 'Last payment untouched');

// A larger fee never improves the result
const returns = [-0.5, -0.1, 0, 0.03, 0.2], fees = [0, 0.001, 0.005, 0.02, 0.5, 0.99];
for (const annualReturn of returns) for (const [startingAmount, monthlyContribution] of [[1000, 0], [0, 50], [1000, 50]]) for (const months of [1, 13, 240]) {
  for (let i = 0; i < fees.length - 1; i++) {
    const c = M.compareFees({ startingAmount, monthlyContribution, months, annualReturn, annualInflation: 0.02, feeA: fees[i], feeB: fees[i + 1] });
    c.points.forEach(p => { ok(p.balanceA >= p.balanceB - 1e-9, 'Fee monotonic'); ok(p.realBalanceA >= p.realBalanceB - 1e-9, 'Real fee monotonic'); });
  }
}
// Either order: swapping the fees swaps the sign and nothing else
const ab = run(), ba = run({ feeA: base.feeB, feeB: base.feeA });
near(ab.final.difference, -ba.final.difference, 'Swap', 0);

// Zero and negative cases
let z = run({ annualReturn: 0, feeA: 0, feeB: 0, annualInflation: 0 });
near(z.final.balanceA, 10000 + 240 * 200, 'Zero everything', 1e-6);
z = run({ monthlyContribution: 0, startingAmount: 0 });
near(z.final.balanceA, 0, 'No money', 0); near(z.final.balanceB, 0, 'No money', 0); near(z.final.difference, 0, 'No money', 0);
z = run({ months: 0 });
near(z.final.balanceA, 10000, 'Zero horizon', 0); near(z.final.balanceB, 10000, 'Zero horizon', 0); near(z.final.difference, 0, 'Zero horizon', 0);
z = run({ annualReturn: -0.2, monthlyContribution: 0, months: 12, feeA: 0, feeB: 0.1 });
near(z.final.balanceA, 8000, 'Negative return', 1e-6); near(z.final.balanceB, 7200, 'Negative return with fee', 1e-6);
z = run({ annualInflation: 0 });
near(z.final.realBalanceA, z.final.balanceA, 'Zero inflation', 0); near(z.final.realContributions, z.final.contributions, 'Zero inflation paid in', 0);

// Real values and contributions share a price basis: growth equal to inflation is no real gain, payment by payment
z = M.compareFees({ startingAmount: 1000, monthlyContribution: 100, months: 120, annualReturn: 0.03, annualInflation: 0.03, feeA: 0, feeB: 0 });
near(z.final.realBalanceA, z.final.realContributions, 'Real return of zero', 1e-6);
z.points.forEach(p => near(p.realBalanceA, p.realContributions, 'Every month', 1e-6));
z = M.compareFees({ startingAmount: 0, monthlyContribution: 100, months: 12, annualReturn: 0, annualInflation: 0.1, feeA: 0, feeB: 0 });
near(z.points[12].contributions, 1200, 'Paid in stays nominal', 0);
ok(z.final.realContributions < 1200 && z.final.realContributions > 1200 / 1.1, 'Each payment deflated at its own month');

// Invalid inputs
const bad = [['feeA', -0.01], ['feeA', 1], ['feeA', NaN], ['feeB', -0.01], ['feeB', 1], ['feeB', Infinity], ['startingAmount', -1], ['startingAmount', NaN], ['monthlyContribution', -1], ['months', 0.5], ['months', -1], ['months', 1201], ['annualReturn', -1], ['annualReturn', 11], ['annualInflation', -1], ['annualInflation', NaN]];
for (const [key, value] of bad) {
  assert.throws(() => run({ [key]: value }), RangeError, key); checks++;
  ok(M.validateFees(Object.assign({}, base, { [key]: value }))[key], 'Error names ' + key);
}
assert.deepEqual(M.validateFees(base), {}); checks++;
// Values beyond the engine's limit are refused, not shown as Infinity
assert.throws(() => run({ annualReturn: 10, months: 1200 }), RangeError); checks++;

// The widget stays a widget: no page, no data card, and no copy of the maths
const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'assets/js/fee-comparison.js'), 'utf8');
ok(js.includes('InvestmentMath.compareFees') && !/Math\.(exp|log1p|pow)/.test(js), 'The script has no maths of its own');
const cards = fs.readFileSync(path.join(root, '_data/data_pages.yml'), 'utf8');
ok(!/fee/i.test(cards.replace(/your own return, inflation and fee assumptions/, '')), 'No data card');
ok(!fs.existsSync(path.join(root, 'data/fee-comparison.html')), 'No page');
const include = fs.readFileSync(path.join(root, '_includes/fee-comparison.html'), 'utf8');
ok(!/typical (fund|fee|charge)s?\b(?! for any)/i.test(include.replace('not typical charges for any fund', '')), 'No typical-fee claim');
for (const word of ['Source: your assumptions', '(1 + return) × (1 − fee)', 'Your input.', 'aren’t included']) ok(include.includes(word), word);

console.log(`All ${checks} fee comparison checks passed.`);
