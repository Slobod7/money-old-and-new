// One-year deposit model. Inputs and returned rates are percentages, not decimal fractions.
// No requests, saved inputs or links to the historical calculator's data.
(function (root) {
  'use strict';
  if (root.InflationBreakEven) return;

  function parse(value, optional) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value !== 'string') return NaN;
    var text = value.trim();
    if (optional && text === '') return 0;
    // One decimal point or comma; reject partial numbers, thousands separators and exponents.
    if (!/^[+\-−]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return NaN;
    var number = Number(text.replace('−', '-').replace(',', '.'));
    return Number.isFinite(number) ? number : NaN;
  }

  function calculate(values) {
    var inflation = parse(values.inflation), tax = parse(values.tax), fee = parse(values.fee, true);
    var errors = {};
    if (!Number.isFinite(inflation) || inflation <= -100) errors.inflation = 'Enter a number greater than −100%.';
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) errors.tax = 'Enter a tax percentage from 0 to 100.';
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) errors.fee = 'Enter a fee percentage from 0 to 100, or leave it blank for zero.';
    if (Object.keys(errors).length) return { status: 'invalid', errors: errors };

    if (fee === 100) return { status: 'impossible', message: 'No finite gross rate can preserve purchasing power: a 100% balance fee takes the entire balance after interest and tax.' };
    // At zero interest the balance falls by the fee. With 100% tax, interest cannot improve it.
    if (tax === 100 && inflation + fee > 0) return { status: 'impossible', message: 'No finite gross rate can preserve purchasing power: 100% tax removes all interest, and the remaining balance does not keep up with your inflation assumption.' };

    // Equivalent to max(0, [((1+i)/(1-f))-1]/(1-t)). Adding i+f first avoids
    // cancellation around zero, and lets zero/deflation cases bypass the 100%-tax denominator.
    var gross = inflation + fee <= 0 ? 0 : (inflation + fee) / ((1 - fee / 100) * (1 - tax / 100));
    // Round UP so the displayed rate is sufficient, even when normal rounding would fall short.
    var displayedGross = Math.ceil(gross * 10000) / 10000;
    var net = displayedGross * (1 - tax / 100) * (1 - fee / 100) - fee;
    // Algebraically identical to (1+net/100)/(1+inflation/100)-1, without subtracting close factors.
    var real = (net - inflation) / (1 + inflation / 100);
    if (![gross, displayedGross, net, real].every(Number.isFinite)) {
      return { status: 'invalid', errors: {}, message: 'These assumptions exceed the calculator’s numerical range. Enter smaller values or move tax and fees further below 100%.' };
    }
    return { status: 'ok', gross: gross, displayedGross: displayedGross, net: net, real: real };
  }

  function percent(value, signed) {
    var rounded = Number(value.toFixed(4));
    return (rounded < 0 ? '−' : signed && rounded > 0 ? '+' : '') +
      Math.abs(rounded).toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + '%';
  }

  function mount(widget) {
    if (widget.dataset.ibeReady) return;
    widget.dataset.ibeReady = 'true';
    var form = widget.querySelector('[data-ibe-form]');
    var result = widget.querySelector('[data-ibe-results]');
    var success = widget.querySelector('[data-ibe-success]');
    var message = widget.querySelector('[data-ibe-message]');
    var fields = {}, errorNodes = {};
    ['inflation', 'tax', 'fee'].forEach(function (key) {
      fields[key] = widget.querySelector('[data-ibe-input="' + key + '"]');
      errorNodes[key] = widget.querySelector('[data-ibe-error="' + key + '"]');
    });
    function out(key, text) { widget.querySelector('[data-ibe-out="' + key + '"]').textContent = text; }
    function update() {
      var values = {};
      Object.keys(fields).forEach(function (key) { values[key] = fields[key].value; });
      var answer = calculate(values);
      Object.keys(fields).forEach(function (key) {
        var error = answer.errors && answer.errors[key];
        fields[key].setAttribute('aria-invalid', error ? 'true' : 'false');
        errorNodes[key].textContent = error || '';
      });
      success.hidden = answer.status !== 'ok';
      message.hidden = answer.status === 'ok';
      message.textContent = answer.message || (answer.status === 'invalid' ? 'Check the marked assumptions to calculate a rate.' : '');
      if (answer.status === 'ok') {
        out('gross', percent(answer.displayedGross));
        out('net', percent(answer.net, true));
        out('real', percent(answer.real, true));
        out('explanation', answer.gross === 0
          ? 'Zero interest is sufficient under these assumptions: after the fee, your balance retains at least its starting purchasing power.'
          : 'At this gross rate, your balance after tax and the fee keeps pace with your assumed inflation over one year.');
      }
      return answer;
    }
    form.addEventListener('input', update);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var answer = update();
      if (answer.status === 'invalid') {
        var first = Object.keys(fields).filter(function (key) { return answer.errors[key]; })[0];
        if (first) fields[first].focus();
      }
    });
    update();
    widget.querySelector('[data-ibe-fallback]').hidden = true;
    form.hidden = false;
    result.hidden = false;
  }

  var api = { parse: parse, calculate: calculate, percent: percent, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.InflationBreakEven = api;
  if (root.document) root.document.querySelectorAll('[data-inflation-break-even]').forEach(mount);
})(typeof window !== 'undefined' ? window : globalThis);
