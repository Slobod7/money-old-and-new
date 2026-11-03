// Run with Node, or open inflation-break-even.html in a browser. No live data or dependencies.
(function () {
  'use strict';
  var W = typeof module !== 'undefined' && module.exports ? require('../assets/js/inflation-break-even.js') : window.InflationBreakEven;
  var checks = [];
  function check(name, ok) { checks.push({ name: name, ok: !!ok }); }
  function near(name, actual, expected, tolerance) {
    check(name + ' (expected ' + expected + ', got ' + actual + ')', Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance);
  }
  function calc(i, t, f) { return W.calculate({ inflation: i, tax: t, fee: f === undefined ? 0 : f }); }

  var r = calc(2.5, 33);
  near('2.5% inflation, 33% tax: exact gross threshold', r.gross, 3.7313432835820897, 1e-12);
  near('Threshold rounds up, not down', r.displayedGross, 3.7314, 1e-12);
  near('After-tax result uses displayed gross rate', r.net, 2.500038, 1e-12);
  near('Purchasing power result uses displayed gross rate', r.real, 0.0000370731707317, 1e-12);
  [0.00001, 0.1, 2.5, 5, 100, 500].forEach(function (i) {
    near('No tax or fee matches inflation ' + i, calc(i, 0).gross, i, 1e-12);
  });
  near('Zero inflation needs zero interest', calc(0, 33).gross, 0, 0);
  near('Negative inflation needs zero interest', calc(-1, 33).gross, 0, 0);
  near('Deflation increases purchasing power at zero interest', calc(-1, 33).real, 100 / 99, 1e-12);
  near('Deflation does not generate a tax refund', calc(-1, 33).net, 0, 0);
  near('Fee applies after interest and tax', calc(2.5, 33, 1).gross, 35000 / 6633, 1e-12);
  near('Fee applies to whole balance, not principal alone', calc(0, 0, 10).gross, 100 / 9, 1e-12);
  near('Deflation can exactly offset fee', calc(-1, 33, 1).gross, 0, 0);
  near('Deflation can exceed fee', calc(-2, 33, 1).gross, 0, 0);
  check('Deflation smaller than fee still needs interest', calc(-0.5, 33, 1).gross > 0);
  near('100% tax, zero inflation, no fee needs zero interest', calc(0, 100).gross, 0, 0);
  near('100% tax, deflation offsets fee', calc(-1, 100, 1).gross, 0, 0);
  near('100% tax, larger deflation remains possible', calc(-2, 100, 1).gross, 0, 0);
  check('100% tax, positive inflation is impossible', calc(2.5, 100).status === 'impossible');
  check('100% tax, fee greater than deflation is impossible', calc(-0.5, 100, 1).status === 'impossible');
  check('100% fee is impossible even during deflation', calc(-99, 33, 100).status === 'impossible');
  check('100% tax and fee are impossible', calc(0, 100, 100).status === 'impossible');
  near('High tax stays finite', calc(2.5, 99.99).gross, 25000, 1e-6);
  near('High fee stays finite', calc(2.5, 0, 99.99).gross, 1024900, 1e-5);
  near('Near −100% inflation stays valid', calc(-99.99, 0).real, 999900, 1e-5);

  [NaN, Infinity, -Infinity, '', ' ', 'no', '2x', '1.2.3', '1,2,3', '1,234.5', '1e2', null, undefined, {}, true].forEach(function (value) {
    check('Invalid required inflation rejected: ' + String(value), calc(value, 0).status === 'invalid');
  });
  [-100, -101].forEach(function (value) { check('Inflation outside model: ' + value, calc(value, 0).status === 'invalid'); });
  [-0.1, 100.01, Infinity, '', 'tax'].forEach(function (value) {
    check('Invalid tax rejected: ' + value, calc(2.5, value).status === 'invalid');
  });
  [-0.1, 100.01, Infinity, 'fee'].forEach(function (value) {
    check('Invalid fee rejected: ' + value, calc(2.5, 0, value).status === 'invalid');
  });
  near('Blank fee defaults to zero', calc('2.5', '33', '').gross, r.gross, 1e-12);
  near('Whitespace-only fee defaults to zero', calc(2.5, 33, '  ').gross, r.gross, 1e-12);
  near('Decimal comma, signed number and whitespace accepted', calc(' +2,5 ', '33', '0,0').gross, r.gross, 1e-12);
  near('Typographic minus accepted', calc('−1', 33).gross, 0, 0);
  check('Overflow is rejected', calc('9'.repeat(308), 99.99, 99.99).status === 'invalid');
  check('Positive near-zero rate is rounded up', calc('0.000000001', 0).displayedGross === 0.0001);
  check('Zero has no negative sign', W.percent(-1e-9, true) === '0.0000%');
  check('Gross formatting', W.percent(r.displayedGross) === '3.7314%');

  // Independently apply the cash flows to €100, then deflate the final balance.
  // Include the case where ordinary four-place rounding would understate the threshold.
  [[2.5, 33, 0], [2.5, 33, 1], [5, 90, 20], [-0.5, 33, 1], [0, 0, 10], [2.5, 99.99, 99.99], [-2, 100, 1]].forEach(function (v) {
    var answer = calc(v[0], v[1], v[2]);
    var balance = (100 + answer.displayedGross * (1 - v[1] / 100)) * (1 - v[2] / 100);
    var realBalance = balance / (1 + v[0] / 100);
    check('Displayed rate preserves purchasing power: ' + v.join('/'), realBalance >= 100 - 1e-10);
    if (answer.gross > 0) {
      var below = (100 + answer.gross * 0.999 * (1 - v[1] / 100)) * (1 - v[2] / 100);
      check('Rate below exact threshold falls short: ' + v.join('/'), below / (1 + v[0] / 100) < 100);
    }
  });

  var failures = checks.filter(function (c) { return !c.ok; });
  var summary = failures.length ? failures.length + ' of ' + checks.length + ' checks FAILED' : 'All ' + checks.length + ' checks passed';
  if (typeof module !== 'undefined' && module.exports) {
    console.log(summary);
    failures.forEach(function (c) { console.error(c.name); });
    if (failures.length) process.exitCode = 1;
  } else {
    document.getElementById('result').textContent = summary;
    checks.forEach(function (c) {
      var item = document.createElement('li');
      item.textContent = (c.ok ? 'PASS: ' : 'FAIL: ') + c.name;
      document.getElementById('checks').appendChild(item);
    });
  }
})();
