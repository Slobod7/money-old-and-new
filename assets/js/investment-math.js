// Formula-only scenario engine. Rates are annual effective DECIMALS, not percentages.
// No DOM, network, currency conversion or market-data dependency. Reuse calculate()
// with a different annualFee to compare otherwise identical scenarios, as compareFees() does.
(function (root) {
  'use strict';
  var MAX_AMOUNT = 1e9, MAX_VALUE = 1e15;

  function validate(o) {
    var errors = {};
    ['startingAmount', 'monthlyContribution'].forEach(function (key) {
      if (!Number.isFinite(o[key]) || o[key] < 0 || o[key] > MAX_AMOUNT) {
        errors[key] = 'Enter an amount from 0 to 1,000,000,000.';
      }
    });
    if (!Number.isInteger(o.months) || o.months < 0 || o.months > 1200) {
      errors.months = 'Choose a whole number of months from 0 to 1,200 (100 years).';
    }
    ['annualReturn', 'annualInflation'].forEach(function (key) {
      if (!Number.isFinite(o[key]) || o[key] <= -1 || o[key] > 10) {
        errors[key] = 'Enter an annual assumption above −100% and no higher than 1,000%.';
      }
    });
    if (!Number.isFinite(o.annualFee) || o.annualFee < 0 || o.annualFee >= 1) {
      errors.annualFee = 'Enter an annual fee from 0% to below 100%, or leave blank for no fee.';
    }
    return errors;
  }

  function calculate(o) {
    if (Object.keys(validate(o)).length) throw new RangeError('Invalid scenario assumptions.');
    var grossLog = Math.log1p(o.annualReturn), feeLog = Math.log1p(-o.annualFee);
    var inflationLog = Math.log1p(o.annualInflation);
    var grossMonthlyFactor = Math.exp(grossLog / 12);
    // Annual factor = (1 + gross return) * (1 - fee). Spread its effect monthly.
    var netMonthlyFactor = Math.exp((grossLog + feeLog) / 12);
    var nominalBalance = o.startingAmount, feeFreeBalance = o.startingAmount;
    var realContributions = o.startingAmount, points = [];
    for (var month = 0; month <= o.months; month++) {
      var inflationFactor = Math.exp(inflationLog * month / 12);
      if (month > 0) {
        // Growth and balance fee apply BEFORE the end-of-month contribution.
        nominalBalance = nominalBalance * netMonthlyFactor + o.monthlyContribution;
        feeFreeBalance = feeFreeBalance * grossMonthlyFactor + o.monthlyContribution;
        realContributions += o.monthlyContribution / inflationFactor;
      }
      var contributions = o.startingAmount + month * o.monthlyContribution;
      var realBalance = nominalBalance / inflationFactor;
      var feeDrag = Math.max(0, feeFreeBalance - nominalBalance);
      var point = {
        month: month, contributions: contributions, realContributions: realContributions,
        nominalBalance: nominalBalance, realBalance: realBalance,
        feeFreeBalance: feeFreeBalance, feeFreeRealBalance: feeFreeBalance / inflationFactor,
        feeDrag: feeDrag, realFeeDrag: feeDrag / inflationFactor,
        nominalGain: nominalBalance - contributions, realGain: realBalance - realContributions
      };
      Object.keys(point).forEach(function (key) {
        if (!Number.isFinite(point[key]) || Math.abs(point[key]) > MAX_VALUE) {
          throw new RangeError('This combination produces values beyond the calculator’s €1,000 trillion limit. Reduce the horizon, amounts or rates.');
        }
      });
      points.push(point);
    }
    return {
      months: o.months, grossMonthlyFactor: grossMonthlyFactor, netMonthlyFactor: netMonthlyFactor,
      inflationMonthlyFactor: Math.exp(inflationLog / 12),
      netAnnualFactor: (1 + o.annualReturn) * (1 - o.annualFee),
      points: points, final: points[points.length - 1]
    };
  }

  // One scenario run twice, differing only in its annual balance fee: o has calculate()'s fields, with feeA and feeB
  // in place of annualFee. Both runs go through calculate(), so a payment bears the fee only from the month it goes in.
  function validateFees(o) {
    var errors = validate(Object.assign({}, o, { annualFee: 0 }));
    ['feeA', 'feeB'].forEach(function (key) {
      var fee = validate(Object.assign({}, o, { annualFee: o[key] })).annualFee;
      if (fee) errors[key] = fee;
    });
    return errors;
  }

  function compareFees(o) {
    if (Object.keys(validateFees(o)).length) throw new RangeError('Invalid scenario assumptions.');
    var a = calculate(Object.assign({}, o, { annualFee: o.feeA }));
    var b = calculate(Object.assign({}, o, { annualFee: o.feeB }));
    var points = a.points.map(function (p, i) {
      var q = b.points[i];
      return {
        month: p.month, contributions: p.contributions, realContributions: p.realContributions,
        balanceA: p.nominalBalance, balanceB: q.nominalBalance, difference: p.nominalBalance - q.nominalBalance,
        realBalanceA: p.realBalance, realBalanceB: q.realBalance, realDifference: p.realBalance - q.realBalance
      };
    });
    return { months: o.months, a: a, b: b, points: points, final: points[points.length - 1] };
  }

  var api = { validate: validate, calculate: calculate, validateFees: validateFees, compareFees: compareFees };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InvestmentMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
