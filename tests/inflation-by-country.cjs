// Run: node tests/inflation-by-country.cjs. The inflation page's sums and sentences (assets/js/inflation-by-country.js),
// checked against the two files scripts/update-inflation-data.py wrote: what the script worked out for Jekyll (each
// area's figures, its shades on the map, the legend, each chart's scale, the sentences) must be what the page's
// JavaScript works out from the monthly figures, so the page reads the same before and after its script runs.
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
const MEASURES = page.measures.map(m => m[0]), LABEL = Object.fromEntries(page.measures.map(m => [m[0], m[2]]));
same(MEASURES, ['headline', 'core', 'food', 'energy', 'goods', 'services'], 'the measures, in the order of the tabs');
same(page.categories, ['food', 'energy', 'goods', 'services'], 'the groups in the card');
for (const m of MEASURES) same(I.MEASURES[m], LABEL[m], m + ' name');

// The two files describe the same months
same(d.keys.length, page.months); same(d.keys[0], page.from); same(d.keys[d.last], page.to); same(d.keys[d.before], page.before);
same(d.last - d.before, 12, 'the month a year earlier');
same(d.countries.length, 27); same(Object.keys(d.col).length, 28); same(page.rows.length, 28);
same(d.countries.filter(code => d.euro[code] === false), ['CZ', 'DK', 'HU', 'PL', 'RO', 'SE']);
same(d.since, page.since); same(d.shades, page.map_scales);

// Every area, every measure: the figures the table, the card and the comparison print, and the two shades on the map
const area = I.series(d, 'headline', 'EA');
for (const row of page.rows) {
  const code = row.code;
  same(I.place(row.name), row.place, code + ' place');
  for (const m of MEASURES) {
    const f = I.figures(d, code, m), want = row[m], bands = page.map_scales[m];
    same(I.pct(f.rate), minus(want.rate) + '%', `${code} ${m} rate`);
    same(I.pct(f.before), minus(want.before) + '%', `${code} ${m} a year earlier`);
    same(I.signed(f.change), minus(want.change), `${code} ${m} change`);
    same([I.pct(f.peak.value), f.peak.month], [minus(want.peak) + '%', want.peak_month], `${code} ${m} highest`);
    if (code === 'EA') { same([f.gap, want.gap, want.rate_class], [undefined, undefined, undefined], 'the euro area has no gap and no shade'); continue; }
    same(I.signed(f.gap), minus(want.gap), `${code} ${m} gap`);
    same(I.signed(f.gapBefore), minus(want.gap_before), `${code} ${m} gap a year earlier`);
    same(I.rateClass(f.rate, bands.rate), want.rate_class, `${code} ${m} rate shade`);
    same(I.changeClass(f.change, bands.change), want.change_class, `${code} ${m} change shade`);
  }
  // The chart's scale in each view, for the country against the euro area
  const own = I.series(d, 'headline', code);
  for (const range of ['5y', '10y', 'all']) {
    const start = I.windowStart(d.keys.length, range);
    same(I.scale(own.slice(start).concat(area.slice(start))), page.scales[code][range], `${code} ${range} scale`);
  }
  if (code === 'EA') continue;
  // The sentence Jekyll writes above the comparison
  const gap = row.headline.gap, size = gap.replace(/[+-]/, ''), euro = `the euro area’s ${minus(page.euro_area.headline.rate)}%`;
  const tail = gap.startsWith('+') ? `${size} point${size === '1.0' ? '' : 's'} above ${euro}`
    : gap.startsWith('-') ? `${size} point${size === '1.0' ? '' : 's'} below ${euro}` : `the same as ${euro}`;
  same(I.verdict(d, code, 'headline'), `Inflation in ${row.place} was ${minus(row.headline.rate)}% in ${I.monthName(page.to)}, ${tail}.`, code + ' sentence');
}

// The order of the table, the country the page opens on, the legend and the sentence above the map
same(I.ranked(d, 'headline').map(r => r.code), page.rows.map(row => row.code).filter(code => code !== 'EA'), 'the ranking');
same(page.default, I.ranked(d, 'headline')[0].code, 'the page opens on the highest-ranked country');
for (const m of MEASURES) {
  for (const view of ['rate', 'change']) same(I.legendLabels(view, page.map_scales[m][view]), page.legend[m][view], `${m} ${view} legend`);
  const x = page.extremes[m];
  same(I.summary(d, m, 'rate'), `${LABEL[m]} is highest in ${x.highest.place}, at ${minus(x.highest.rate)}%, and lowest in ${x.lowest.place}, at ${minus(x.lowest.rate)}%. ` +
    `${x.above} of the 27 countries are above the euro area’s ${minus(page.euro_area[m].rate)}%.`, m + ' summary');
  // The change view counts every country once
  const moves = page.rows.filter(row => row.code !== 'EA').map(row => +row[m].change);
  const up = moves.filter(v => v > 0).length, down = moves.filter(v => v < 0).length, text = I.summary(d, m, 'change');
  same(text.startsWith(`Against ${I.monthName(page.before)}, ${LABEL[m].toLowerCase()} is ` + I.tally([['higher', up], ['lower', down], ['unchanged', 27 - up - down]], 27) + '.'), true, m + ' change summary');
  same(text.includes(`${I.points(Math.max(...moves))}.`), up > 0); same(text.includes(`${I.points(Math.min(...moves))}.`), down > 0);
}
// The card's line under "A year earlier", as Jekyll writes it for the euro area
const moved = page.euro_area.headline.change, by = moved.replace(/[+-]/, '');
same(I.moved(I.figures(d, 'EA', 'headline').change), moved.startsWith('+') ? `${by} point${by === '1.0' ? '' : 's'} higher now`
  : moved.startsWith('-') ? `${by} point${by === '1.0' ? '' : 's'} lower now` : 'the same now', 'the euro area a year on');

// The map's bands: the same cases as tests/test_inflation_updater.py
const rate = [1.5, 3, 4.5, 6], change = [-2, -0.2, 0.2, 2];
same([1.0, 1.4, 1.5, 2.9, 3.0, 4.4, 5.9, 6.0, 6.5].map(v => I.rateClass(v, rate)), [0, 0, 1, 1, 2, 2, 3, 4, 4]);
same([-2.8, -2.0, -0.1, 0.0, 0.8].map(v => I.rateClass(v, [-2, -1, 0, 1])), [0, 1, 2, 3, 3]);
same([-2.2, -2.0, -1.9, -0.3, -0.2, 0.0, 0.2, 0.3, 1.9, 2.0, 5.2].map(v => I.changeClass(v, change)), [0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4]);
same(I.legendLabels('rate', rate), ['Under 1.5%', '1.5% to 3%', '3% to 4.5%', '4.5% to 6%', '6% or more']);
same(I.legendLabels('rate', [-2, -1, 0, 1]).slice(0, 3), ['Under −2%', '−2% to −1%', '−1% to 0%']);
same(I.legendLabels('change', change), ['Down 2 points or more', 'Down 0.2 to 2', 'Within 0.2', 'Up 0.2 to 2', 'Up 2 points or more']);
same(I.legendLabels('change', [-1, -0.2, 0.2, 1])[0], 'Down 1 point or more');

// The chart's scale: zero always inside, the top a gridline, the bottom the whole point under the lowest figure
same(I.scale([0.4, 10.6]), [0, 12, 2]); same(I.scale([-0.3, 10.6]), [-1, 12, 2]); same(I.scale([-4.4, 22.0]), [-5, 25, 5]);
same(I.scale([1.1, 5.9]), [0, 6, 1]); same(I.scale([6.0, 6.0]), [0, 6, 1]); same(I.scale([0.0, 0.0]), [0, 1, 1]);
same(I.scale([-2.0, -0.5]), [-2, 1, 1]); same(I.scale([3.0, 547.6]), [0, 550, 50]); same(I.scale([]), [0, 1, 1]);

// Views and their year labels
same(['5y', '10y', 'all'].map(r => I.windowStart(333, r)), [272, 212, 0]); same(I.windowStart(40, '10y'), 0);
same([61, 72, 73, 121, 180, 181, 333].map(I.yearStep), [1, 1, 2, 2, 2, 5, 5]);

// A peak reached twice is dated to the later month; months with no figure, or before the count starts, are passed over
same(I.peak([null, 2.0, 5.5, 3.0, 5.5, 1.0], ['a', 'b', 'c', 'd', 'e', 'f']), {month: 'e', value: 5.5});
same(I.peak([9.0, 2.0, 5.5, 3.0], ['2001-10', '2001-11', '2001-12', '2002-01'], '2001-12'), {month: '2001-12', value: 5.5});
same(I.peak([null, null], ['a', 'b']), null);

// Figures: one decimal, a real minus sign, none on a figure that rounds to zero, a dash for no figure
same([6.5, 4, -0.4, -0.04, 0, 12.25].map(I.num), ['6.5', '4.0', '−0.4', '0.0', '0.0', '12.3']);
same([I.pct(null), I.pct(-2.9), I.pct(56.7)], ['–', '−2.9%', '56.7%']);
same([2.7, -0.4, 0, null].map(I.signed), ['+2.7', '−0.4', '0.0', '–']);
same([I.gap(6.5, 3.8), I.gap(1.0, 3.8), I.gap(3.8, 3.8), I.gap(null, 3.8), I.gap(0.1, 0.3)], [2.7, -2.8, 0, null, -0.2]);
same([I.points(2.1), I.points(-1), I.points(1)], ['2.1 points', '1.0 point', '1.0 point']);
same(I.against(2.7, 'the euro area'), '2.7 points above the euro area'); same(I.against(-1, 'the euro area'), '1.0 point below the euro area');
same(I.against(1, 'the euro area'), '1.0 point above the euro area'); same(I.against(0, 'the euro area'), 'the same as the euro area');
same([1.6, -2.1, 1, 0, null].map(I.moved), ['1.6 points higher now', '2.1 points lower now', '1.0 point higher now', 'the same now', '']);
same([I.place('Netherlands'), I.place('Euro area'), I.place('Czechia')], ['the Netherlands', 'the euro area', 'Czechia']);
same(I.tally([['higher', 16], ['lower', 9], ['unchanged', 2]], 27), 'higher in 16 countries, lower in 9 and unchanged in 2');
same(I.tally([['higher', 0], ['lower', 27], ['unchanged', 0]], 27), 'lower in all 27 countries');
same(I.tally([['higher', 1], ['lower', 26], ['unchanged', 0]], 27), 'higher in 1 country and lower in 26');

// The comparison's sentence: against the euro area, against another country, and with "the" where the name needs it
same(I.verdict(d, 'RO', 'core').startsWith('Core inflation in Romania was '), true);
same(I.verdict(d, 'NL', 'headline').startsWith('Inflation in the Netherlands was '), true);
const nl = I.figures(d, 'NL', 'headline'), de = I.figures(d, 'DE', 'headline');
same(I.verdict(d, 'DE', 'headline', 'NL'), `Inflation in Germany was ${I.pct(de.rate)} in ${I.monthName(page.to)}, ${I.against(I.gap(de.rate, nl.rate), `the ${I.pct(nl.rate)} in the Netherlands`)}.`);
same(I.verdict(d, 'DE', 'headline', 'EA'), I.verdict(d, 'DE', 'headline'));

// The address: every value is checked against the data, and one bad value refuses the whole fragment
same(I.parseHash('#country=RO', d), {country: 'RO'});
same(I.parseHash('#country=GR&measure=core&range=all', d), {country: 'GR', measure: 'core', range: 'all'});
same(I.parseHash('#country=NL&with=DE&view=change', d), {country: 'NL', other: 'DE', view: 'change'});
same(I.parseHash('#country=CY&measure=energy', d), {country: 'CY', measure: 'energy'});
same(I.parseHash('#measure=services&view=change', d), {measure: 'services', view: 'change'});
same(I.verdict(d, 'BE', 'energy').startsWith('Energy inflation in Belgium was '), true);
same(I.parseHash('#with=EA', d), {other: 'EA'}); same(I.parseHash('#range=5y', d), {range: '5y'}); same(I.parseHash('#view=rate', d), {view: 'rate'});
for (const bad of ['', '#', '#inflation-sources', '#inflation-ranking-RO', '#country=EA', '#country=XX', '#country=ro', '#country=RO&range=1y',
  '#country=RO&measure=<script>', '#country=RO&measure=__proto__', '#measure=Energy', '#measure=nrg', '#country=RO&range=constructor', '#country', '#country=DE&country=XX',
  '#country=RO&with=RO', '#country=RO&with=XX', '#view=price', '#view=constructor', '#with=']) {
  same(I.parseHash(bad, d), null, bad);
}
// Only what differs from the view the page opens on is written, so that view has no fragment at all
const home = {country: 'RO', range: '10y'}, open = {sel: null, country: 'RO', other: 'EA', measure: 'headline', view: 'rate', range: '10y'};
same(I.hashFor(open, home), '');
same(I.hashFor({...open, sel: 'RO'}, home), '#country=RO');
same(I.hashFor({...open, country: 'DE'}, home), '#country=DE');
same(I.hashFor({...open, sel: 'DE', country: 'DE', other: 'NL', measure: 'core', view: 'change', range: 'all'}, home), '#country=DE&with=NL&measure=core&view=change&range=all');
same(I.hashFor({...open, range: '5y'}, home), '#range=5y');
for (const state of [{sel: 'SE', country: 'SE', other: 'EA', measure: 'core', view: 'rate', range: '5y'}, {sel: 'LT', country: 'LT', other: 'PL', measure: 'headline', view: 'change', range: 'all'},
  {sel: 'CY', country: 'CY', other: 'EA', measure: 'food', view: 'change', range: 'all'}]) {
  const back = I.parseHash(I.hashFor(state, home), d);
  same({country: back.country, other: back.other || 'EA', measure: back.measure || 'headline', view: back.view || 'rate', range: back.range}, {country: state.country, other: state.other, measure: state.measure, view: state.view, range: state.range}, 'round trip');
}

console.log(`inflation-by-country: ${checks} checks passed`);
