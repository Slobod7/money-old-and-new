// Run: node tests/rate-change.cjs. The savings and loan modes on the ECB page.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {payment, mortgage, savings, loan} = require('../assets/js/rate-scenarios.js');
let checks = 0;
const near = (a, b, tol = 1e-8) => { assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`); checks++; };
const bad = f => { assert.throws(f, e => e.name === 'RangeError'); checks++; };

// Equal rates give no difference
let s = savings(10000, .02, .02, .19);
near(s.difference, 0); near(s.netDifference, 0); near(s.interestBefore, 200);
let l = loan(200000, 300, .03, .03);
near(l.difference, 0); near(l.change, 0); near(l.totalDifference, 0);

// Savings: effective annual rates are used as they are, with no monthly conversion
s = savings(10000, .02, .025, 0);
near(s.interestBefore, 200); near(s.interestAfter, 250); near(s.difference, 50); near(s.netDifference, 50);
near(savings(10000, 0, .03, 0).interestAfter, 300); near(savings(10000, 0, 0, 0).interestAfter, 0);
near(savings(10000, .03, .02, 0).difference, -100);
// Tax is an assumption applied to the interest alone, and doesn't touch the balance or the gross figures
s = savings(10000, .02, .025, .19);
near(s.interestAfter, 250); near(s.netBefore, 162); near(s.netAfter, 202.5); near(s.netDifference, 40.5);
near(savings(10000, .02, .025, 1).netAfter, 0); near(savings(10000, .02, .025, 0).netAfter, 250);

// Loan: zero interest is principal over payments, in either direction
l = loan(120000, 120, 0, 0);
near(l.oldPayment, 1000); near(l.newPayment, 1000);
near(loan(120000, 120, 0, .05).oldPayment, 1000); near(loan(120000, 120, .05, 0).newPayment, 1000);
near(payment(120000, 1e-14, 120), 1000, 1e-6);

// Units: a nominal annual rate is divided by 12, checked against the closed form and a month-by-month repayment
near(payment(100000, .12, 12), 100000 * .01 / (1 - Math.pow(1.01, -12)));
near(payment(100000, .12, 12), 8884.878867, 1e-5);
for (const [p, r, n] of [[200000, .03, 300], [50000, .075, 84], [1000, .3, 7], [1e8, .3, 600], [1, .0001, 1]]) {
  const pay = payment(p, r, n);
  let left = p;
  for (let i = 0; i < n; i++) left = left * (1 + r / 12) - pay;
  near(left / p, 0, 1e-7);
}
// The note's example: a nominal 4% with monthly payments is an effective 4.07% a year
near(Math.pow(1 + .04 / 12, 12) - 1, .0407415, 1e-6);
// Over the whole term, the totals follow from the monthly difference
l = loan(200000, 300, .03, .035);
near(l.totalDifference, (l.newPayment - l.oldPayment) * 300);
assert.ok(l.difference > 0 && l.change > 0); checks++;
const down = loan(200000, 300, .035, .03);
near(down.difference, -l.difference); assert.ok(down.change < 0); checks++;
// A higher rate never lowers the payment; a longer term lowers it at the same positive rate
for (const months of [1, 12, 300, 600]) for (let r = 0; r < .3; r += .01) {
  assert.ok(payment(1000, r + .01, months) >= payment(1000, r, months)); checks++;
}
assert.ok(payment(1000, .05, 240) < payment(1000, .05, 120)); checks++;
// One month: repay the principal plus one month's interest
near(loan(1000, 1, .12, .12).oldPayment, 1010);

// Invalid term, principal and extreme rates
bad(() => loan(0, 300, .03, .03)); bad(() => loan(-1, 300, .03, .03)); bad(() => loan(1e8 + 1, 300, .03, .03)); bad(() => loan(NaN, 300, .03, .03));
bad(() => loan(1000, 0, .03, .03)); bad(() => loan(1000, 601, .03, .03)); bad(() => loan(1000, 12.5, .03, .03)); bad(() => loan(1000, -12, .03, .03));
bad(() => loan(1000, 12, -.01, .03)); bad(() => loan(1000, 12, .03, .31)); bad(() => loan(1000, 12, Infinity, .03));
bad(() => savings(0, .02, .03, 0)); bad(() => savings(-5, .02, .03, 0)); bad(() => savings(1e8 + 1, .02, .03, 0)); bad(() => savings(NaN, .02, .03, 0));
bad(() => savings(1000, -.01, .03, 0)); bad(() => savings(1000, .02, .31, 0)); bad(() => savings(1000, .02, .03, -.1)); bad(() => savings(1000, .02, .03, 1.01));

// The draft's mortgage widget uses the same file: same exports, same answers as its fallback sentence
near(payment(200000, .015, 300), 799.8726524727);
const m = mortgage(200000, 25, .015, .04, .15);
near(m.newPayment, 897.3226285062); near(m.change, .121831863775);
const include = fs.readFileSync(path.join(__dirname, '../_includes/mortgage-rate-impact.html'), 'utf8');
assert.ok(include.includes('data-rate-scenario="mortgage"') && include.includes('name="fall"')); checks++;
const js = fs.readFileSync(path.join(__dirname, '../assets/js/rate-scenarios.js'), 'utf8');
assert.ok(js.includes("=== 'rate-change') return renderRateChange()")); checks++;

// The typed example on the page matches the maths
const widget = fs.readFileSync(path.join(__dirname, '../_includes/rate-change-impact.html'), 'utf8');
assert.ok(widget.includes(`€${Math.round(payment(200000, .03, 300))} a month at a nominal 3%`)); checks++;
assert.ok(widget.includes(`€${Math.round(payment(200000, .035, 300)).toLocaleString('en-GB')} at 3.5%`)); checks++;
assert.ok(widget.includes(`earns €${savings(10000, .02, .025, 0).interestBefore} in a year`) && widget.includes(`earns €${savings(10000, .02, .025, 0).interestAfter}.`)); checks++;
// It sits on the ECB page, with the chart and route untouched, and names what it leaves out
const page = fs.readFileSync(path.join(__dirname, '../data/ecb-interest-rates.html'), 'utf8');
assert.ok(page.includes('{% include rate-change-impact.html %}') && page.includes('{% include ecb-rates-chart.html') && page.includes('permalink: /data/ecb-interest-rates/')); checks++;
for (const word of ['annual effective', 'nominal annual', 'your assumption', 'lender charges', 'early-repayment terms', 'future rate resets', 'index.en.html']) { assert.ok(widget.includes(word), word); checks++; }
console.log(`All ${checks} rate-change checks passed.`);
