/* Pure calculations are also exported for the maths checks. No requests or storage. */
(function (root) {
  'use strict';
  function payment(principal, annualRate, months) {
    if (![principal, annualRate, months].every(Number.isFinite) || principal < 0 || annualRate < 0 || months <= 0 || !Number.isInteger(months)) throw new RangeError('Invalid loan assumptions');
    if (annualRate === 0) return principal / months;
    const m = annualRate / 12;
    return principal * m / -Math.expm1(-months * Math.log1p(m));
  }
  function mortgage(principal, years, before, after, fall) {
    if (![principal, years, before, after, fall].every(Number.isFinite) || principal <= 0 || years < 1 || years > 50 || !Number.isInteger(years) || before < 0 || after < 0 || before > .3 || after > .3 || fall < 0 || fall > 1) throw new RangeError('Invalid loan assumptions');
    const oldPayment = payment(principal, before, years * 12);
    const newPrincipal = principal * (1 - fall);
    const newPayment = payment(newPrincipal, after, years * 12);
    const equalPaymentPrincipal = oldPayment / payment(1, after, years * 12);
    return {oldPayment, newPayment, newPrincipal, difference: newPayment - oldPayment, change: newPayment / oldPayment - 1, breakEvenFall: 1 - equalPaymentPrincipal / principal};
  }
  // Savings: annual effective rates, so the interest over one year is simply balance × rate, with no conversion. The balance
  // stays the same. Tax is the reader's own assumption, applied once to the interest.
  function savings(balance, before, after, tax) {
    if (![balance, before, after, tax].every(Number.isFinite) || balance <= 0 || balance > 1e8 || before < 0 || after < 0 || before > .3 || after > .3 || tax < 0 || tax > 1) throw new RangeError('Invalid savings assumptions');
    const interestBefore = balance * before, interestAfter = balance * after;
    return {interestBefore, interestAfter, difference: interestAfter - interestBefore, netBefore: interestBefore * (1 - tax), netAfter: interestAfter * (1 - tax), netDifference: (interestAfter - interestBefore) * (1 - tax)};
  }
  // Loan: nominal annual rates divided by 12, as payment() does, on the same principal and remaining term in months.
  function loan(principal, months, before, after) {
    if (![principal, months, before, after].every(Number.isFinite) || principal <= 0 || principal > 1e8 || !Number.isInteger(months) || months < 1 || months > 600 || before < 0 || after < 0 || before > .3 || after > .3) throw new RangeError('Invalid loan assumptions');
    const oldPayment = payment(principal, before, months), newPayment = payment(principal, after, months);
    return {oldPayment, newPayment, difference: newPayment - oldPayment, change: newPayment / oldPayment - 1, totalDifference: (newPayment - oldPayment) * months};
  }
  const api = {payment, mortgage, savings, loan};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  const money = n => new Intl.NumberFormat('en-IE', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0}).format(n);
  const pct = n => new Intl.NumberFormat('en-GB', {style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2}).format(n);
  const cents = n => new Intl.NumberFormat('en-IE', {style: 'currency', currency: 'EUR'}).format(n);
  const bars = (scale, rows) => `<div class="scenario-results">${rows.map((row, i) => `<p><span>${row[0]}</span><strong>${cents(row[1])}</strong><i class="scenario-bar${i ? ' is-new' : ''}" style="display:block;width:${scale ? row[1] / scale * 100 : 0}%" aria-hidden="true"></i></p>`).join('')}</div>`;
  const change = (difference, more, less) => Math.abs(difference) < .005 ? null : `<strong>${cents(Math.abs(difference))} ${difference > 0 ? more : less}</strong>`;
  root.document.querySelectorAll('[data-rate-scenario]').forEach(widget => {
    const form = widget.querySelector('[data-scenario-form]');
    const result = widget.querySelector('[data-scenario-result]');
    const error = widget.querySelector('[data-scenario-error]');
    // Everything written below is a formatted number or fixed text; what the reader types is never written back as HTML.
    function renderRateChange() {
      const mode = form.elements.namedItem('mode').value;
      widget.querySelectorAll('[data-mode]').forEach(part => {
        const on = part.getAttribute('data-mode') === mode;
        part.hidden = !on;
        if (part.matches('fieldset')) part.disabled = !on;
      });
      form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
      const stop = message => {
        result.replaceChildren();
        error.textContent = message;
        error.hidden = false;
      };
      const invalid = form.querySelector('input:invalid');
      if (invalid) {
        invalid.setAttribute('aria-invalid', 'true');
        return stop(`Check “${invalid.closest('label').firstChild.textContent.trim()}”: enter ${invalid.getAttribute('data-limit')}.`);
      }
      error.hidden = true;
      const val = name => Number(form.elements.namedItem(name).value);
      if (mode === 'savings') {
        const before = val('savings-before') / 100, after = val('savings-after') / 100, tax = val('savings-tax') / 100;
        const r = savings(val('balance'), before, after, tax);
        const moved = change(r.difference, 'more', 'less');
        result.innerHTML = bars(Math.max(r.interestBefore, r.interestAfter), [[`Interest over one year at ${pct(before)}`, r.interestBefore], [`Interest over one year at ${pct(after)}`, r.interestAfter]]) +
          (moved ? `<p>That is ${moved} interest over the year, about ${cents(Math.abs(r.difference) / 12)} a month on average, before any tax.</p>` : '<p>The two rates are the same, so the interest doesn’t change.</p>') +
          (tax > 0 && moved ? `<p>After your assumed ${pct(tax)} tax on interest: ${cents(r.netBefore)} and ${cents(r.netAfter)}, a difference of ${cents(Math.abs(r.netDifference))}.</p>` : '');
        return;
      }
      const months = val('years') * 12 + val('months');
      if (months < 1 || months > 600) return stop('Enter a remaining term from 1 month to 50 years.');
      const before = val('loan-before') / 100, after = val('loan-after') / 100;
      const r = loan(val('principal'), months, before, after);
      const moved = change(r.difference, 'higher', 'lower');
      result.innerHTML = bars(Math.max(r.oldPayment, r.newPayment), [[`Monthly payment at ${pct(before)}`, r.oldPayment], [`Monthly payment at ${pct(after)}`, r.newPayment]]) +
        (moved ? `<p>The monthly payment is ${moved} (${pct(Math.abs(r.change))}). Over ${months === 1 ? 'the one remaining payment' : `all ${months} remaining payments`}, that adds up to ${cents(Math.abs(r.totalDifference))}.</p>` : '<p>The two rates are the same, so the payment doesn’t change.</p>');
    }
    function render() {
      if (widget.getAttribute('data-rate-scenario') === 'rate-change') return renderRateChange();
      if (!form.checkValidity()) {
        result.replaceChildren();
        error.textContent = 'Enter a number within each field’s stated limits to see a result.';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      const val = name => Number(form.elements.namedItem(name).value);
      {
        const r = mortgage(val('principal'), val('years'), val('before') / 100, val('after') / 100, val('fall') / 100);
        const scale = Math.max(r.oldPayment, r.newPayment);
        const changeText = Math.abs(r.difference) < 1e-8 ? 'unchanged' : `${money(Math.abs(r.difference))} ${r.difference >= 0 ? 'higher' : 'lower'} (${pct(Math.abs(r.change))})`;
        const breakEven = Math.abs(r.breakEvenFall) < 1e-10 ? 'At the same rate, the same loan has the same monthly payment.' : r.breakEvenFall >= 0
          ? `The loan would need to be ${pct(r.breakEvenFall)} smaller to keep the original monthly payment at the new rate.`
          : 'The new rate is lower: no reduction in the loan is needed to keep the original monthly payment.';
        result.innerHTML = `<div class="scenario-results"><p><span>Original monthly payment</span><strong>${money(r.oldPayment)}</strong><i class="scenario-bar" style="display:block;width:${r.oldPayment / scale * 100}%" aria-hidden="true"></i></p><p><span>New monthly payment</span><strong>${money(r.newPayment)}</strong><i class="scenario-bar is-new" style="display:block;width:${r.newPayment / scale * 100}%" aria-hidden="true"></i></p></div><p>New loan: <strong>${money(r.newPrincipal)}</strong>. Monthly payment is <strong>${changeText}</strong>.</p><p>${breakEven}</p>`;
      }
    }
    form.hidden = false;
    widget.querySelector('[data-scenario-fallback]').hidden = true;
    form.addEventListener('input', render);
    form.addEventListener('submit', event => {event.preventDefault(); render();});
    render();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
