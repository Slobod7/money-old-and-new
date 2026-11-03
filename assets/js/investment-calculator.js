// Progressive enhancement for investment-calculator.html; maths lives in InvestmentMath.
(function () {
  'use strict';
  if (!window.InvestmentMath) return;
  var SVG = 'http://www.w3.org/2000/svg';
  function money(n) {
    return (n < -0.005 ? '−' : '') + '€' + Math.abs(n).toLocaleString('en-GB', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }
  function rate(n) { return (n * 100).toLocaleString('en-GB', { maximumFractionDigits: 6 }) + '%'; }
  function duration(months) {
    var years = Math.floor(months / 12), rest = months % 12;
    return (years ? years + (years === 1 ? ' year' : ' years') : '') +
      (years && rest ? ' and ' : '') + (rest || !years ? rest + (rest === 1 ? ' month' : ' months') : '');
  }
  function svgNode(tag, attributes, text) {
    var el = document.createElementNS(SVG, tag);
    Object.keys(attributes || {}).forEach(function (key) { el.setAttribute(key, attributes[key]); });
    if (text != null) el.textContent = text;
    return el;
  }
  function shortMoney(n) {
    var unit = n >= 1e12 ? [1e12, 'tn'] : n >= 1e9 ? [1e9, 'bn'] : n >= 1e6 ? [1e6, 'm'] : n >= 1e3 ? [1e3, 'k'] : [1, ''];
    return '€' + (n / unit[0]).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + unit[1];
  }
  // One line per [point field, CSS class] over points that each have a month. fee-comparison.js draws with this too.
  function drawLines(target, id, points, lines, title, description) {
    var width = Math.max(280, target.clientWidth), height = width < 500 ? 240 : 300;
    var left = 76, right = width - 18, top = 12, bottom = height - 42;
    var end = points[points.length - 1], months = end.month, max = 1;
    points.forEach(function (p) { lines.forEach(function (line) { max = Math.max(max, p[line[0]]); }); });
    var x = function (m) { return left + (right - left) * (months ? m / months : 0); };
    var y = function (v) { return bottom - (bottom - top) * v / max; };
    var svg = svgNode('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'img',
      'aria-labelledby': id + '-plot-title ' + id + '-plot-desc', class: 'investment-svg' });
    svg.appendChild(svgNode('title', { id: id + '-plot-title' }, title));
    svg.appendChild(svgNode('desc', { id: id + '-plot-desc' }, description));
    for (var tick = 0; tick <= 4; tick++) {
      var value = max * tick / 4, py = y(value);
      svg.appendChild(svgNode('line', { x1: left, x2: right, y1: py, y2: py, class: 'oil-grid' }));
      svg.appendChild(svgNode('text', { x: left - 10, y: py + 4, 'text-anchor': 'end', class: 'oil-tick' }, shortMoney(value)));
    }
    lines.forEach(function (line) {
      svg.appendChild(svgNode('polyline', { class: line[1], points: points.map(function (p) {
        return x(p.month).toFixed(2) + ',' + y(p[line[0]]).toFixed(2);
      }).join(' ') }));
      // A zero horizon or zero balance must still leave a visible mark.
      svg.appendChild(svgNode('circle', { cx: x(end.month), cy: y(end[line[0]]), r: 3, class: 'investment-end ' + line[1] }));
    });
    svg.appendChild(svgNode('text', { x: left, y: height - 17, class: 'oil-tick' }, 'Start'));
    if (months) svg.appendChild(svgNode('text', { x: right, y: height - 17, 'text-anchor': 'end', class: 'oil-tick' }, duration(months)));
    target.replaceChildren(svg);
  }
  function chart(widget, result) {
    var end = result.final;
    drawLines(widget.querySelector('[data-chart]'), widget.id, result.points,
      [['contributions', 'oil-put'], ['feeFreeBalance', 'investment-fee-free'], ['nominalBalance', 'oil-line']],
      'Nominal scenario over ' + duration(result.months),
      'Final balance after fee: ' + money(end.nominalBalance) + '; without fee: ' + money(end.feeFreeBalance) +
      '; total paid in: ' + money(end.contributions) + '. The table following this chart gives the yearly figures and today’s purchasing power.');
  }
  function init(widget) {
    if (widget.dataset.ready) return;
    widget.dataset.ready = 'true';
    var form = widget.querySelector('[data-form]'), results = widget.querySelector('[data-results]');
    var status = widget.querySelector('[data-status]'), lastResult = null;
    function read(name, optional) {
      var input = form.elements.namedItem(name);
      return input.value.trim() === '' ? (optional && !input.validity.badInput ? 0 : NaN) : Number(input.value);
    }
    function output(key, text) { widget.querySelector('[data-out="' + key + '"]').textContent = text; }
    function clearErrors() {
      form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
      form.querySelectorAll('[data-error]').forEach(function (el) { el.textContent = ''; });
    }
    function render(result, o) {
      var end = result.final;
      ['contributions', 'nominalBalance', 'realBalance', 'feeDrag'].forEach(function (key) { output(key, money(end[key])); });
      widget.querySelector('[data-result-title]').textContent = 'After ' + duration(result.months);
      output('assumptions', 'Assumed annual rates: gross return ' + rate(o.annualReturn) +
        '; inflation ' + rate(o.annualInflation) + '; balance fee ' + rate(o.annualFee) + '.');
      output('payments', money(o.startingAmount) + ' at the start, plus ' + result.months +
        (result.months === 1 ? ' end-of-month payment of ' : ' end-of-month payments of ') +
        money(o.monthlyContribution) + '. Nominal gain or loss after fee: ' + money(end.nominalGain) + '.');
      output('interpretation', 'In today’s purchasing power, the final balance is ' + money(end.realBalance) +
        ' against ' + money(end.realContributions) + ' paid in on the same price basis. That is a real ' +
        (end.realGain < -0.005 ? 'loss of ' : 'gain of ') + money(Math.abs(end.realGain)) + '.');
      output('fees', 'Without the balance fee, the final nominal balance would be ' + money(end.feeFreeBalance) +
        '. Fee drag is ' + money(end.feeDrag) + ' nominal, or ' + money(end.realFeeDrag) +
        ' in today’s money. It includes the compounding effect of fees, not just the charges themselves.');
      var body = widget.querySelector('[data-rows]');
      body.replaceChildren();
      result.points.filter(function (p) { return p.month % 12 === 0 || p.month === result.months; }).forEach(function (p) {
        var row = document.createElement('tr'), heading = document.createElement('th');
        heading.scope = 'row'; heading.textContent = p.month ? duration(p.month) : 'Start'; row.appendChild(heading);
        ['contributions', 'nominalBalance', 'feeFreeBalance', 'realBalance', 'realContributions'].forEach(function (key) {
          var cell = document.createElement('td'); cell.className = 'num'; cell.textContent = money(p[key]); row.appendChild(cell);
        });
        body.appendChild(row);
      });
      results.hidden = false;
      chart(widget, result);
    }
    function update(focus) {
      clearErrors();
      var years = read('years'), months = read('extraMonths');
      var o = { startingAmount: read('startingAmount'), monthlyContribution: read('monthlyContribution'),
        months: years * 12 + months, annualReturn: read('annualReturn') / 100,
        annualInflation: read('annualInflation') / 100, annualFee: read('annualFee', true) / 100 };
      var errors = window.InvestmentMath.validate(o);
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
        status.textContent = 'Check the highlighted assumptions and calculate again.';
        if (focus) form.querySelector('[aria-invalid="true"]').focus();
        return;
      }
      try {
        lastResult = window.InvestmentMath.calculate(o);
        render(lastResult, o);
        status.textContent = focus ? 'Scenario calculated. Results follow.' : '';
        if (focus) widget.querySelector('[data-result-title]').focus();
      } catch (err) {
        results.hidden = true;
        lastResult = null;
        status.textContent = err.message;
      }
    }
    form.hidden = false;
    form.addEventListener('submit', function (event) { event.preventDefault(); update(true); });
    form.addEventListener('input', function () {
      results.hidden = true; lastResult = null;
      status.textContent = 'Assumptions changed. Choose Calculate scenario to update the results.';
    });
    var resize = function () { if (lastResult && !results.hidden) chart(widget, lastResult); };
    if (window.ResizeObserver) new ResizeObserver(resize).observe(widget.querySelector('[data-chart]'));
    else window.addEventListener('resize', resize);
    update(false);
  }
  window.InvestmentUI = { money: money, rate: rate, duration: duration, drawLines: drawLines };
  document.querySelectorAll('[data-investment]').forEach(init);
})();
