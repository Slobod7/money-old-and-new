// Run: node tests/inflation-by-country.cjs. The inflation page's sums and sentences (assets/js/inflation-by-country.js),
// checked against the two files scripts/update-inflation-data.py wrote: what the script worked out for Jekyll (the
// ranking, each chart's scale, each country's highest rate) must be what the page's JavaScript works out from the
// monthly figures, so the page reads the same before and after its script runs.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../assets/js/inflation-by-country.js');   // with no document, it only exports its functions
const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
const page = read('_data/inflation_by_country.json'), months = read('assets/data/inflation-by-country.json');
const d = I.prepare(months);
let checks = 0;
const same = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const minus = text => text.replace('-', '−');   // the templates swap the hyphen for a minus sign, as the script does

// The two files describe the same months
same(d.keys.length, page.months); same(d.keys[0], page.from); same(d.keys[d.keys.length - 1], page.to);
same(d.countries.length, 27); same(Object.keys(d.col).length, 28);
same(d.countries.filter(code => d.euro[code] === false), ['CZ', 'DK', 'HU', 'PL', 'RO', 'SE']);

// Every area: the ranking's figures, the chart's scale in each view, and the highest rate
const last = d.keys.length - 1, area = I.series(d, 'headline', 'EA');
for (const [code, name, , headline, core, against] of page.ranking) {
  const own = I.series(d, 'headline', code);
  same(I.pct(own[last]), minus(headline) + '%', code + ' headline');
  same(I.pct(I.series(d, 'core', code)[last]), minus(core) + '%', code + ' core');
  for (const range of ['5y', '10y', 'all']) {
    const start = I.windowStart(d.keys.length, range);
    same(I.scale(own.slice(start).concat(area.slice(start))), page.scales[code][range], `${code} ${range} scale`);
  }
  const top = I.peak(own, d.keys);
  same([top.month, I.num(top.value)], [page.peaks[code][0], minus(page.peaks[code][1])], code + ' peak');
  if (code === 'EA') continue;
  // The gap as the ranking has it (+2.7, -0.4, 0.0), and the sentence Jekyll writes above the chart
  const gap = I.gap(own[last], area[last]);
  same((gap > 0 ? '+' : gap < 0 ? '-' : '') + Math.abs(gap).toFixed(1), against, code + ' gap');
  const size = against.replace(/[+-]/, ''), euro = `the euro area’s ${minus(page.euro_area.headline)}%`;
  const tail = against.startsWith('+') ? `${size} point${size === '1.0' ? '' : 's'} above ${euro}`
    : against.startsWith('-') ? `${size} point${size === '1.0' ? '' : 's'} below ${euro}` : `the same as ${euro}`;
  same(I.verdict(d, code, 'headline'), `Inflation in ${name} was ${minus(headline)}% in ${I.monthName(page.to)}, ${tail}.`, code + ' sentence');
  same(I.record(d, code, 'headline'), `Highest since ${I.monthName(page.from)}: ${minus(page.peaks[code][1])}% in ${I.monthName(page.peaks[code][0])}.`, code + ' record');
  same(I.record(d, code, 'core').startsWith(`Highest since ${I.monthName(page.core_from[code])}: `), true, code + ' core starts where the file says');
}
same(page.default, page.ranking.find(row => row[0] !== 'EA')[0], 'the page opens on the highest-ranked country');

// The scale: zero always inside, the top a gridline, the bottom the whole point under the lowest figure
same(I.scale([0.4, 10.6]), [0, 12, 2]); same(I.scale([-0.3, 10.6]), [-1, 12, 2]); same(I.scale([-4.4, 22.0]), [-5, 25, 5]);
same(I.scale([1.1, 5.9]), [0, 6, 1]); same(I.scale([6.0, 6.0]), [0, 6, 1]); same(I.scale([0.0, 0.0]), [0, 1, 1]);
same(I.scale([-2.0, -0.5]), [-2, 1, 1]); same(I.scale([3.0, 547.6]), [0, 550, 50]);

// Views and their year labels
same(['5y', '10y', 'all'].map(r => I.windowStart(333, r)), [272, 212, 0]); same(I.windowStart(40, '10y'), 0);
same([61, 72, 73, 121, 180, 181, 333].map(I.yearStep), [1, 1, 2, 2, 2, 5, 5]);

// A peak reached twice is dated to the later month; months with no figure are passed over
same(I.peak([null, 2.0, 5.5, 3.0, 5.5, 1.0], ['a', 'b', 'c', 'd', 'e', 'f']), {month: 'e', value: 5.5});
same(I.peak([null, null], ['a', 'b']), null);

// Figures: one decimal, a real minus sign, none on a figure that rounds to zero, a dash for no figure
same([6.5, 4, -0.4, -0.04, 0, 12.25].map(I.num), ['6.5', '4.0', '−0.4', '0.0', '0.0', '12.3']);
same([I.pct(null), I.pct(-2.9), I.pct(56.7)], ['–', '−2.9%', '56.7%']);
same([I.gap(6.5, 3.8), I.gap(1.0, 3.8), I.gap(3.8, 3.8), I.gap(null, 3.8), I.gap(0.1, 0.3)], [2.7, -2.8, 0, null, -0.2]);
same(I.against(2.7, 'the euro area'), '2.7 points above the euro area'); same(I.against(-1, 'the euro area'), '1.0 point below the euro area');
same(I.against(1, 'the euro area'), '1.0 point above the euro area'); same(I.against(0, 'the euro area'), 'the same as the euro area');
same(I.verdict(d, 'RO', 'core').startsWith('Core inflation in Romania was '), true);

// The address: every value is checked against the data, and one bad value refuses the whole fragment
same(I.parseHash('#country=RO', d), {country: 'RO'});
same(I.parseHash('#country=GR&measure=core&range=all', d), {country: 'GR', measure: 'core', range: 'all'});
same(I.parseHash('#range=5y', d), {range: '5y'});
for (const bad of ['', '#', '#inflation-sources', '#country=EA', '#country=XX', '#country=ro', '#country=RO&range=1y',
  '#country=RO&measure=<script>', '#country=RO&measure=__proto__', '#country=RO&range=constructor', '#country', '#country=DE&country=XX']) {
  same(I.parseHash(bad, d), null, bad);
}
same(I.hashFor({country: 'RO', measure: 'headline', range: '10y'}), '#country=RO');
same(I.hashFor({country: 'DE', measure: 'core', range: 'all'}), '#country=DE&measure=core&range=all');
for (const state of [{country: 'SE', measure: 'core', range: '5y'}, {country: 'LT', measure: 'headline', range: 'all'}]) {
  same(I.parseHash(I.hashFor(state), d), Object.fromEntries(Object.entries(state).filter(([k, v]) => !(k === 'measure' && v === 'headline'))), 'round trip');
}

console.log(`inflation-by-country: ${checks} checks passed`);
