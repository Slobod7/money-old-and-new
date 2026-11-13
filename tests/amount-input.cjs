// Run: node tests/amount-input.cjs. How the euro and Brent calculators read a typed amount.
// Both must read an English amount (1,000.50) and a continental one (1.000,50 or 1000,50) the same way, and refuse
// anything they would have to guess at. "1000,50" once had its comma stripped and became 100,050.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(file, name) {
  const context = { window: {}, document: { readyState: 'loading', addEventListener() {}, querySelectorAll() { return []; } }, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js', file), 'utf8'), context);
  return context.window[name].parseAmount;
}

const readers = { euro: load('old-new-calculator.js', 'OldNewCalculator'), brent: load('oil-widgets.js', 'OilWidgets') };

// What is typed, and what it means. null is refused: the calculator shows its "Enter €1 to €100,000,000" message.
const cases = [
  // plain
  ['1000', 1000], ['1', 1], ['100000000', 100000000], ['250', 250],
  // a decimal point or a decimal comma, with one or two digits
  ['1000.50', 1000.5], ['1000,50', 1000.5], ['1000.5', 1000.5], ['1000,5', 1000.5], ['2,5', 2.5], ['2.5', 2.5], ['99,99', 99.99],
  // still being typed: the mark with nothing after it yet
  ['1000.', 1000], ['1000,', 1000],
  // thousands grouped the English way
  ['1,000', 1000], ['10,000', 10000], ['1,000,000', 1000000], ['1,000.50', 1000.5], ['12,345.6', 12345.6],
  // thousands grouped the continental way
  ['1.000', 1000], ['10.000', 10000], ['1.000.000', 1000000], ['1.000,50', 1000.5], ['12.345,6', 12345.6],
  // spaces, including the narrow and non-breaking ones French and Romanian keyboards produce, and the euro sign
  ['1 000', 1000], ['1 000,50', 1000.5], ['1 000,50', 1000.5], ['1 000', 1000], [' 1000 ', 1000], ['€1,000', 1000], ['1.000,50 €', 1000.5],
  // refused: not a clear amount
  ['1,0000', null], ['1.0000', null], ['1000,505', null], ['1000.505', null], ['1,00,000', null], ['1.00.000', null],
  ['1,000,50', null], ['1.000.50', null], ['1,000,000,5', null], ['1,,000', null], ['1..5', null], ['1.5.5', null],
  ['1,5,5', null], [',5', null], ['.5', null], ['', null], ['abc', null], ['1e3', null], ['-5', null], ['+5', null], ['1000,50,', null],
  // refused: outside €1 to €100,000,000
  ['0', null], ['0,99', null], ['0.5', null], ['100000001', null], ['100.000.000,01', null], ['1,000,000,000', null],
];

let checks = 0;
for (const [name, read] of Object.entries(readers)) {
  for (const [typed, want] of cases) {
    assert.equal(read(typed), want, `${name}: "${typed}" should read as ${want}, not ${read(typed)}`);
    checks++;
  }
}
// The Brent calculator also takes dollars and pounds signs.
assert.equal(readers.brent('$1,000.50'), 1000.5); assert.equal(readers.brent('£1.000,50'), 1000.5); checks += 2;
// A share link carries a plain number, which must come back as itself.
for (const n of [1, 1000, 1000.5, 2500.75, 100000000]) { assert.equal(readers.euro(String(n)), n); checks++; }

console.log(`All ${checks} amount-input checks passed.`);
