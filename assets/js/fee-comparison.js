// Progressive enhancement for fee-comparison.html. The maths is InvestmentMath.compareFees; the chart and formats are
// shared with investment-calculator.js, which the include loads first.
(function () {
  'use strict';
  if (!window.InvestmentMath || !window.InvestmentUI) return;
  var money = window.InvestmentUI.money, rate = window.InvestmentUI.rate, duration = window.InvestmentUI.duration;
  function init(widget) {
    if (widget.dataset.ready) return;
    widget.dataset.ready = 'true';
    var form = widget.querySelector('[data-form]'), results = widget.querySelector('[data-results]');
    var status = widget.querySelector('[data-status]'), last = null;
    function read(name, blank) {
      var input = form.elements.namedItem(name);
      return input.value.trim() === '' ? (blank != null && !input.validity.badInput ? blank : NaN) : Number(input.value);
    }
    function output(key, text) { widget.querySelector('[data-out="' + key + '"]').textContent = text; }
    function clearErrors() {
      form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
      form.querySelectorAll('[data-error]').forEach(function (el) { el.textContent = ''; });
    }
    function draw() {
      var o = last.o, end = last.result.final;
      window.InvestmentUI.drawLines(widget.querySelector('[data-chart]'), widget.id, last.result.points,
        [['contributions', 'oil-put'], ['balanceB', 'investment-fee-free'], ['balanceA', 'oil-line']],
        'Two fees over ' + duration(o.months),
        'Final balance with a ' + rate(o.feeA) + ' fee: ' + money(end.balanceA) + '; with a ' + rate(o.feeB) + ' fee: ' + money(end.balanceB) +
        '; total paid in: ' + money(end.contributions) + '. The table following this chart gives the yearly figures.');
    }
    function gapText(o, end) {
      var after = ' after ' + duration(o.months) + '.';
      if (o.feeA === o.feeB) return 'The two fees are the same, so the balances match.';
      if (end.balanceA === 0 && end.balanceB === 0) return 'There is no money in this scenario, so the fees make no difference.';
      if (Math.abs(end.difference) < 0.005) return 'The two fees leave the same balance, to the cent,' + after;
      var aHigher = end.difference > 0, high = aHigher ? end.balanceA : end.balanceB;
      return (aHigher ? 'Fee A' : 'Fee B') + ' leaves ' + money(Math.abs(end.difference)) + ' more than ' + (aHigher ? 'fee B' : 'fee A') + after +
        ' The lower balance is ' + (Math.abs(end.difference) / high * 100).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + '% smaller.';
    }
    function render(result, o, real) {
      var end = result.final, noteA = rate(o.feeA) + ' fee', noteB = rate(o.feeB) + ' fee';
      widget.querySelector('[data-result-title]').textContent = 'After ' + duration(o.months);
      output('assumptions', 'Assumed annual rates: gross return ' + rate(o.annualReturn) + '; fee A ' + rate(o.feeA) + '; fee B ' + rate(o.feeB) +
        (real ? '; inflation ' + rate(o.annualInflation) : '') + '. ' + money(o.startingAmount) + ' at the start, plus ' + o.months +
        (o.months === 1 ? ' end-of-month payment of ' : ' end-of-month payments of ') + money(o.monthlyContribution) + '.');
      output('contributions', money(end.contributions));
      output('label-a', 'Final balance, fee A (' + noteA + ')');
      output('label-b', 'Final balance, fee B (' + noteB + ')');
      output('balance-a', money(end.balanceA));
      output('balance-b', money(end.balanceB));
      output('difference', money(Math.abs(end.difference)));
      widget.querySelector('[data-real-figures]').hidden = !real;
      if (real) {
        output('real-contributions', money(end.realContributions));
        output('real-label-a', 'Fee A, today’s money (' + noteA + ')');
        output('real-label-b', 'Fee B, today’s money (' + noteB + ')');
        output('real-a', money(end.realBalanceA));
        output('real-b', money(end.realBalanceB));
        output('real-difference', money(Math.abs(end.realDifference)));
      }
      output('gap', gapText(o, end));
      output('table-caption', 'Start, each full year and the endpoint. Difference is fee A’s balance minus fee B’s.' + (real ? ' “Today’s money” means prices at the start of this scenario.' : ''));
      var columns = [['contributions', 'Paid in, nominal'], ['balanceA', 'Fee A, nominal'], ['balanceB', 'Fee B, nominal'], ['difference', 'Difference, nominal']];
      if (real) columns = columns.concat([['realContributions', 'Paid in, today’s money'], ['realBalanceA', 'Fee A, today’s money'], ['realBalanceB', 'Fee B, today’s money'], ['realDifference', 'Difference, today’s money']]);
      var head = widget.querySelector('[data-head]'), body = widget.querySelector('[data-rows]');
      head.replaceChildren(); body.replaceChildren();
      var first = document.createElement('th');
      first.scope = 'col'; first.textContent = 'Elapsed'; head.appendChild(first);
      columns.forEach(function (c) {
        var th = document.createElement('th');
        th.scope = 'col'; th.className = 'num'; th.textContent = c[1]; head.appendChild(th);
      });
      result.points.filter(function (p) { return p.month % 12 === 0 || p.month === o.months; }).forEach(function (p) {
        var row = document.createElement('tr'), heading = document.createElement('th');
        heading.scope = 'row'; heading.textContent = p.month ? duration(p.month) : 'Start'; row.appendChild(heading);
        columns.forEach(function (c) {
          var cell = document.createElement('td');
          cell.className = 'num'; cell.textContent = money(p[c[0]]); row.appendChild(cell);
        });
        body.appendChild(row);
      });
      results.hidden = false;
      last = { result: result, o: o };
      draw();
    }
    function update(focus) {
      clearErrors();
      var years = read('years'), months = read('extraMonths'), real = form.elements.namedItem('annualInflation').value.trim() !== '';
      var o = { startingAmount: read('startingAmount'), monthlyContribution: read('monthlyContribution'),
        months: years * 12 + months, annualReturn: read('annualReturn') / 100, annualInflation: read('annualInflation', 0) / 100,
        feeA: read('feeA', 0) / 100, feeB: read('feeB', 0) / 100 };
      var errors = window.InvestmentMath.validateFees(o);
      if (!Number.isInteger(years) || years < 0 || years > 100 || !Number.isInteger(months) || months < 0 || months > 11) {
        errors.months = 'Use whole years (0–100) and extra months (0–11), with a total no longer than 100 years.';
      }
      if (Object.keys(errors).length) {
        Object.keys(errors).forEach(function (key) {
          widget.querySelector('[data-error="' + key + '"]').textContent = errors[key];
          (key === 'months' ? [form.elements.years, form.elements.extraMonths] : [form.elements.namedItem(key)]).forEach(function (el) {
            el.setAttribute('aria-invalid', 'true');
          });
        });
        results.hidden = true;
        last = null;
        status.textContent = 'Check the highlighted assumptions and compare again.';
        if (focus) form.querySelector('[aria-invalid="true"]').focus();
        return;
      }
      try {
        render(window.InvestmentMath.compareFees(o), o, real);
        status.textContent = focus ? 'Comparison calculated. Results follow.' : '';
        if (focus) widget.querySelector('[data-result-title]').focus();
      } catch (err) {
        results.hidden = true;
        last = null;
        status.textContent = err.message;
      }
    }
    form.hidden = false;
    form.addEventListener('submit', function (event) { event.preventDefault(); update(true); });
    form.addEventListener('input', function () {
      results.hidden = true; last = null;
      status.textContent = 'Assumptions changed. Choose Compare fees to update the results.';
    });
    var resize = function () { if (last && !results.hidden) draw(); };
    if (window.ResizeObserver) new ResizeObserver(resize).observe(widget.querySelector('[data-chart]'));
    else window.addEventListener('resize', resize);
    update(false);
  }
  document.querySelectorAll('[data-fee-comparison]').forEach(init);
})();
