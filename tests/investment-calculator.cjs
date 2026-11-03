// Run: node tests/investment-calculator.cjs. No packages or market data needed.
const assert = require('node:assert/strict');
const M = require('../assets/js/investment-math.js');
let checks = 0;
function near(actual, expected, name, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${name}: ${actual} != ${expected}`);
  checks++;
}
function scenario(overrides = {}) {
  return M.calculate(Object.assign({ startingAmount: 1000, monthlyContribution: 100, months: 12,
    annualReturn: 0, annualInflation: 0, annualFee: 0 }, overrides));
}
function invalid(overrides) {
  assert.throws(() => scenario(overrides), RangeError); checks++;
}
let r = scenario();
near(r.final.nominalBalance, 2200, 'Zero rates: starting amount plus 12 payments', 0);
near(r.final.realBalance, 2200, 'Zero inflation', 0);
near(r.final.realContributions, 2200, 'Zero inflation contributions', 0);
near(r.final.feeDrag, 0, 'Zero fees', 0);
near(r.final.realGain, 0, 'Zero rates real gain', 0);
near(r.points.length, 13, 'Start plus 12 monthly observations', 0);
r = scenario({ startingAmount: 0 });
near(r.final.nominalBalance, 1200, 'Zero starting amount', 0);
r = scenario({ startingAmount: 0, monthlyContribution: 0 });
near(r.final.realBalance, 0, 'Entirely empty scenario', 0);
r = scenario({ monthlyContribution: 0, annualReturn: 0.12, annualFee: 0.01, annualInflation: 0.10 });
near(r.netAnnualFactor, 1.1088, 'Multiplicative fee factor');
near(r.final.nominalBalance, 1108.8, 'Annual lump sum, no monthly payments');
near(r.final.feeFreeBalance, 1120, 'Identical no-fee annual comparison');
near(r.final.feeDrag, 11.2, 'Fee drag');
near(r.final.realBalance, 1008, 'Real annual ending balance');
near(r.final.realContributions, 1000, 'Starting amount stays in starting prices');
near(r.final.realGain, 8, 'Consistent real gain');
near(r.final.realFeeDrag, 11.2 / 1.1, 'Real fee drag');

// A 1% monthly factor corresponds to this annual EFFECTIVE return, not 12%.
const onePercentMonthly = 1.01 ** 12 - 1;
r = scenario({ months: 1, annualReturn: onePercentMonthly });
near(r.final.nominalBalance, 1110, 'One month: grow €1,000 then add €100');
r = scenario({ startingAmount: 0, months: 1, annualReturn: onePercentMonthly, annualFee: 0.15 });
near(r.final.nominalBalance, 100, 'Final payment earns no return and pays no fee', 0);
near(r.final.feeDrag, 0, 'A new final payment has no fee drag', 0);
r = scenario({ startingAmount: 0, months: 2, annualReturn: onePercentMonthly });
near(r.final.nominalBalance, 201, 'Two end-of-month payments: 100 × 1.01 + 100');
r = scenario({ months: 12, annualReturn: onePercentMonthly });
near(r.final.nominalBalance, 1000 * 1.01 ** 12 + 100 * (1.01 ** 12 - 1) / 0.01, 'Closed-form annuity cross-check');

// Independent cash-flow sums: compound/discount each payment for its own time.
const assumptions = { startingAmount: 2500, monthlyContribution: 75.25, months: 37,
  annualReturn: 0.07, annualInflation: 0.04, annualFee: 0.012 };
r = scenario(assumptions);
let nominal = 2500 * ((1.07) * (1 - 0.012)) ** (37 / 12);
let feeFree = 2500 * 1.07 ** (37 / 12), paidReal = 2500;
for (let m = 1; m <= 37; m++) {
  nominal += 75.25 * (1.07 * (1 - 0.012)) ** ((37 - m) / 12);
  feeFree += 75.25 * 1.07 ** ((37 - m) / 12);
  paidReal += 75.25 / 1.04 ** (m / 12);
}
near(r.final.nominalBalance, nominal, 'Each cash flow compounds only after arrival');
near(r.final.feeFreeBalance, feeFree, 'Fee-free cash-flow sum');
near(r.final.realContributions, paidReal, 'Each contribution discounted from its own payment month');
near(r.final.realBalance, nominal / 1.04 ** (37 / 12), 'Real endpoint');
near(r.final.realGain, nominal / 1.04 ** (37 / 12) - paidReal, 'Real gain uses real contributions');
assert.ok(Math.abs(r.final.realGain - (r.final.realBalance - r.final.contributions)) > 100); checks++;

r = scenario({ annualReturn: -0.20, annualInflation: -0.10, annualFee: 0.02, monthlyContribution: 0 });
near(r.final.nominalBalance, 784, 'Negative return with fee');
near(r.final.realBalance, 784 / 0.9, 'Negative inflation (deflation)');
r = scenario({ months: 0, annualReturn: 0.10, annualInflation: 0.10, annualFee: 0.10 });
near(r.final.nominalBalance, 1000, 'Zero horizon: no growth or payments', 0);
near(r.final.contributions, 1000, 'Zero horizon contributions', 0);
near(r.final.feeDrag, 0, 'Zero horizon fee comparison', 0);
r = scenario({ months: 1200, startingAmount: 0, monthlyContribution: 0.1 });
near(r.final.nominalBalance, 120, '100-year horizon with fractional payments');
near(r.final.contributions, 120, 'Actual number of long-horizon contributions');
r = scenario({ months: 1200, annualReturn: 0.05, annualInflation: 0.02, annualFee: 0.005 });
assert.ok(Number.isFinite(r.final.realBalance) && r.final.feeDrag > 0); checks++;
r = scenario({ annualReturn: 0.03 });
near(r.final.realBalance, r.final.nominalBalance, 'Zero inflation: non-zero return');
near(r.final.realGain, r.final.nominalGain, 'Zero inflation: gains coincide');
near(r.final.feeFreeBalance, r.final.nominalBalance, 'No-fee paths coincide');
near(scenario({ annualReturn: -0.9999, annualInflation: -0.9999, months: 1 }).months, 1, 'Near-boundary valid negative assumptions');

[-1, Infinity, NaN, '', 1e9 + 1].forEach(startingAmount => invalid({ startingAmount }));
[-1, Infinity, NaN].forEach(monthlyContribution => invalid({ monthlyContribution }));
[-1, 0.5, 1201, NaN, Infinity].forEach(months => invalid({ months }));
[-1, -1.1, NaN, Infinity, 10.1].forEach(annualReturn => invalid({ annualReturn }));
[-1, NaN, Infinity, 10.1].forEach(annualInflation => invalid({ annualInflation }));
[-0.01, 1, NaN, Infinity, undefined].forEach(annualFee => invalid({ annualFee }));
invalid({ months: 1200, annualReturn: 10 }); // finite but beyond the supported display range
invalid({ months: 1200, annualInflation: -0.99 });
console.log(`All ${checks} investment calculator checks passed.`);
