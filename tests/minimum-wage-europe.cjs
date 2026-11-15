// Run: node tests/minimum-wage-europe.cjs. The minimum wage page's sums and sentences (assets/js/minimum-wage-europe.js),
// checked against the two files scripts/update-minimum-wage-data.py wrote: what the script worked out for Jekyll (ranks,
// shades, legend, the sentences, the EU's card, the comparison's rows and half-years) must be what the page's
// JavaScript works out from the half-yearly figures, so the page reads the same before and after its script runs.
// Then the card in each measure, a country with no national rate and one with no figure, ties, the table's orders and
// the address fragment.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../assets/js/minimum-wage-europe.js');   // with no document, it only exports its functions
const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
const page = read('_data/minimum_wage_europe.json'), raw = read('assets/data/minimum-wage-europe.json');
const d = W.prepare(raw);
let checks = 0;
const same = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const MEASURES = ['eur', 'pps'];
// A copy of the data with some figures changed, for states the latest half-year doesn't show
const altered = change => { const copy = JSON.parse(JSON.stringify(raw)); change(copy); return W.prepare(copy); };

// The two files describe the same half-years
same(d.keys, page.periods); same(d.keys[d.last], page.period); same(d.keys[d.yearAgo], page.year_ago);
same(d.codes.length, 27); same(page.rows.length, 27);
same(Object.keys(d.none).sort(), ['AT', 'DK', 'FI', 'IT', 'SE']);
same(W.rated(d).length, page.with_rate);
same(raw.map_scales, page.map_scales);

// Every country, both measures: what the table, the map and the card print
const order = { eur: W.ranks(d, 'eur'), pps: W.ranks(d, 'pps') };
for (const row of page.rows) {
  const code = row.code;
  same(W.place(row.name), row.place, code + ' place');
  same(W.status(d, code), row.status, code + ' status');
  if (row.status === 'none') {
    for (const m of MEASURES) same([W.value(d, m, code), order[m][code]], [null, undefined], code + ' has no figure and no rank in ' + m);
    same(W.shift(d, code), null, code + ' moves no places');
    continue;
  }
  for (const m of MEASURES) {
    const r = order[m][code];
    same(W.amount(W.value(d, m, code)), row[m + '_text'], `${code} ${m} figure`);
    same(W.flag(d, m, code), row[m + '_flag'], `${code} ${m} flag`);
    same([r.rank, r.tied], [row[m + '_rank'], row[m + '_tied']], `${code} ${m} rank`);
    same(W.rankText(r), row[m + '_rank_text'], `${code} ${m} rank as the table prints it`);
    same(W.ordinal(r.rank) + (r.tied ? '=' : ''), row[m + '_ordinal'], `${code} ${m} rank in words`);
    same(W.bandClass(W.value(d, m, code), page.map_scales[m]), row[m + '_class'], `${code} ${m} shade`);
  }
  same(W.shift(d, code), row.shift, code + ' places moved');
  if (row.nac_text) same(W.national(d, code, W.value(d, 'nac', code)), row.nac_text, code + ' in its own currency');
  if (row.change) {
    const t = W.pctTenths(W.value(d, 'nac', code), W.value(d, 'nac', code, d.yearAgo));
    same((t > 0 ? '+' : t < 0 ? '−' : '') + W.tenths(t), row.change, code + ' change in a year');
  }
}

// The map's legend and summary, the comparison and the EU's card, as Jekyll drew them
for (const m of MEASURES) {
  same(W.legendLabels(m, page.map_scales[m]), page.legend[m], m + ' legend');
  same(W.summary(d, m), page.summary[m], m + ' summary');
}
const [A, B] = page.default_pair;
same([A, B], [page.compare.a, page.compare.b]);
same(W.verdict(d, A, B), page.compare.sentence, 'the comparison sentence');
same(W.compareRows(d, A, B), page.compare.rows, 'the comparison table');
same(W.historyRows(d, A, B), page.compare.history, 'the comparison half-years');
const eu = W.card(d, null, 'eur');
same({ name: eu.name, value: eu.value, unit: eu.unit, rows: eu.rows, note: eu.note }, page.eu_card, 'the EU card');
same(W.card(d, null, 'pps'), eu, 'the EU card is the same in either measure');

// Switching measure: the card's big figure, its unit and its rows swap, and the table's order follows
{
  const ro = page.rows.find(r => r.code === 'RO');
  const inEuros = W.card(d, 'RO', 'eur'), inPps = W.card(d, 'RO', 'pps');
  same(inEuros.value, '€' + ro.eur_text);
  same(inPps.value, ro.pps_text + ' PPS');
  same(inEuros.unit, 'a month, gross, on ' + W.longDate(page.date));
  same(inPps.unit, 'a month in purchasing power standards' + (ro.pps_flag.includes('e') ? ', estimated' : '') + ', on ' + W.longDate(page.date));
  same(inEuros.rows[0], ['Rank in euros', W.ordinal(ro.eur_rank) + ' of ' + page.with_rate, '']);
  same(inPps.rows[0], ['Rank by purchasing power', W.ordinal(ro.pps_rank) + ' of ' + page.with_rate, '']);
  same(inEuros.rows[1].slice(0, 2), ['By purchasing power', ro.pps_text + ' PPS']);
  same(inPps.rows[1].slice(0, 2), ['In euros', '€' + ro.eur_text]);
  same(inEuros.rows[2], ['In Romanian lei', ro.nac_text, '']);
  same(inEuros.rows.slice(2), inPps.rows.slice(2), 'the national currency and the year before are the same in either measure');
  same(inEuros.note, raw.conversions.RO);
  same(W.card(d, 'IE', 'eur').note, raw.conversions.IE);
  same(W.card(d, 'DE', 'eur').rows.some(r => r[0].startsWith('In ') && r[0] !== 'In euros'), false, 'no national currency row for a euro country');
  const top = { eur: W.tableOrder(d, 'eur', -1)[0], pps: W.tableOrder(d, 'pps', -1)[0] };
  same(top, { eur: page.extremes.eur.highest.codes[0], pps: page.extremes.pps.highest.codes[0] });
  same(page.rows[0].eur_class, W.legendLabels('eur', page.map_scales.eur).length - 1, 'the highest in euros takes the darkest shade');
}

// Ties: equal figures share a rank and the card says with whom
{
  const ties = page.rows.filter(r => r.eur_tied);
  for (const row of ties) {
    const others = W.tiedWith(d, 'eur', row.code);
    assert.ok(others.length > 0); checks++;
    same(W.card(d, row.code, 'eur').rows[0][1], W.ordinal(row.eur_rank) + ' of ' + page.with_rate + ', shared with ' + W.join(others.map(c => W.place(d.names[c]))));
  }
  const tied = altered(copy => { copy.eur.HR[copy.periods.indexOf(copy.period)] = copy.eur.BG[copy.periods.indexOf(copy.period)]; });
  const r = W.ranks(tied, 'eur'), above = W.rated(tied).filter(c => W.value(tied, 'eur', c) > W.value(tied, 'eur', 'BG')).length;
  same([r.BG, r.HR], [{ rank: above + 1, tied: true }, { rank: above + 1, tied: true }], 'Bulgaria and Croatia share a rank');
  const next = W.ranked(tied, 'eur').filter(c => W.value(tied, 'eur', c) < W.value(tied, 'eur', 'BG'))[0];
  if (next) same(r[next].rank, above + 3, 'the next rank skips the shared places');
  const list = W.tableOrder(tied, 'eur', -1);
  same(list.indexOf('HR'), list.indexOf('BG') + 1, 'a tie is listed by name');
  same(W.ranks(tied, 'pps'), order.pps, 'the other measure is untouched');
}

// No national minimum wage: never zero, never ranked, the same in either measure
for (const code of page.no_national) {
  for (const m of MEASURES) {
    same(W.card(d, code, m), { name: d.names[code], value: 'No national minimum wage', unit: '', empty: true, rows: [],
      note: 'Eurostat records no national figure: pay floors are set by collective agreements, sector by sector.' }, code + ' card in ' + m);
  }
}
same(W.verdict(d, 'AT', 'IE'), 'Austria has no national minimum wage, so there is nothing to set against Ireland’s minimum wage.');
same(W.verdict(d, 'IE', 'SE'), 'Sweden has no national minimum wage, so there is nothing to set against Ireland’s minimum wage.');
same(W.verdict(d, 'AT', 'IT'), 'Neither Austria nor Italy has a national minimum wage.');
same(W.compareRows(d, 'AT', 'IE')[0], ['Gross a month, in euros', 'No national minimum wage', W.inUnit('eur', W.value(d, 'eur', 'IE')), '']);
same(W.compareRows(d, 'AT', 'IE')[1], ['Rank in euros', '–', page.rows.find(r => r.code === 'IE').eur_ordinal, '']);
same(W.compareRows(d, 'DK', 'SE').length, 4, 'no national-currency row when neither has a figure in it');
same(W.historyRows(d, 'AT', 'IT'), [], 'two countries that never had a rate have no half-years');
{
  const h = W.historyRows(d, 'AT', 'IE');
  same(h.every(r => r[1] === 'No national rate' && r[3] === 'No national rate'), true, 'Austria is "No national rate" every half-year');
}

// A country with a rate but no figure for the date (the script would hold the page back a half-year instead, but the
// page must still say it properly rather than show a zero)
{
  const gap = altered(copy => {
    const i = copy.periods.indexOf(copy.period);
    copy.status.RO = copy.status.RO.slice(0, i) + '-' + copy.status.RO.slice(i + 1);
    copy.eur.RO[i] = null; copy.pps.RO[i] = null; copy.nac.RO[i] = null;
  });
  same(W.status(gap, 'RO'), 'missing');
  same(W.rated(gap).length, page.with_rate - 1);
  same(W.card(gap, 'RO', 'eur'), { name: 'Romania', value: 'No figure', unit: '', empty: true, rows: [], note: 'Eurostat has no figure for Romania on ' + W.longDate(page.date) + '.' });
  same(W.verdict(gap, 'RO', 'DE'), 'Romania has no figure for this date, so there is nothing to set against Germany’s minimum wage.');
  same(W.compareRows(gap, 'RO', 'DE')[0][1], 'No figure');
  same(W.historyRows(gap, 'RO', 'DE')[0][1], '–', 'a dash, not a zero');
  same(W.tableOrder(gap, 'eur', -1).slice(-6), ['AT', 'DK', 'FI', 'IT', 'RO', 'SE'], 'countries with no figure sort last, by name');
  same(W.card(gap, null, 'eur').value, (page.with_rate - 1) + ' of 27');
  same(W.ranks(gap, 'pps').RO, undefined);
}

// The table's orders
{
  const codes = page.rows.map(r => r.code);
  same(W.tableOrder(d, 'eur', -1), codes, 'highest in euros first, as Jekyll drew it');
  const up = W.tableOrder(d, 'eur', 1);
  same(up.slice(-5), page.no_national, 'countries without a rate stay last, whichever way');
  same(up[0], page.extremes.eur.lowest.codes[0]);
  const pps = W.tableOrder(d, 'pps', -1);
  for (let i = 1; i < page.with_rate; i++) assert.ok(W.value(d, 'pps', pps[i - 1]) >= W.value(d, 'pps', pps[i]), 'pps order');
  checks++;
  same(W.tableOrder(d, 'name', 1), d.codes.slice().sort((a, b) => d.names[a] < d.names[b] ? -1 : 1));
  same(W.tableOrder(d, 'name', -1), W.tableOrder(d, 'name', 1).reverse());
  const moved = W.tableOrder(d, 'shift', -1);
  same(W.shift(d, moved[0]), Math.max(...page.rows.filter(r => r.status === 'rate').map(r => r.shift)), 'the biggest climb first');
}

// Numbers and words: the same rules as the script (tests/test_minimum_wage_updater.py pins the same cases)
same([W.amount(2391), W.amount(1316.52), W.amount(4050), W.amount(1234567), W.amount(620)], ['2,391', '1,316.52', '4,050', '1,234,567', '620']);
same([W.pctTenths(2391, 2343), W.pctTenths(1756, 2164), W.pctTenths(2000, 2000), W.pctTenths(1001, 2000)], [20, -189, 0, -500]);
same([W.pctTenths(20010, 20000), W.pctTenths(19990, 20000), W.pctTenths(20009, 20000), W.pctTenths(1316.52, 1000)], [1, -1, 0, 317]);
same([W.ratioTenths(2771, 620), W.ratioTenths(2164, 935), W.ratioTenths(1250, 1000)], [45, 23, 13]);
same([W.tenths(45), W.tenths(-189), W.tenths(0)], ['4.5', '18.9', '0.0']);
same([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(W.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
same([W.place('Netherlands'), W.possessive('Netherlands'), W.possessive('Cyprus'), W.possessive('Ireland')], ['the Netherlands', 'the Netherlands’', 'Cyprus’', 'Ireland’s']);
same([W.longDate('2026-07-01'), W.periodName('2026-S1'), W.shortPeriod('2026-S2')], ['1 July 2026', '1 January 2026', 'Jul 2026']);
same([W.difference(2391, 2343), W.difference(1756, 2164), W.difference(5, 5), W.difference(null, 5)], ['2.0% higher', '18.9% lower', 'the same', '']);
same(W.legendLabels('eur', [1000, 1500, 2000, 2500]), ['Under €1,000', '€1,000 to €1,500', '€1,500 to €2,000', '€2,000 to €2,500', '€2,500 or more']);
same([W.bandClass(999, [1000, 1500]), W.bandClass(1000, [1000, 1500]), W.bandClass(1500, [1000, 1500])], [0, 1, 2], 'a figure on a break joins the band above');

// The address fragment
{
  const home = { a: A, b: B };
  const view = (over) => Object.assign({ measure: 'eur', sel: null, a: A, b: B }, over);
  same(W.hashFor(view({}), home), '', 'the opening view writes no fragment');
  same(W.hashFor(view({ measure: 'pps' }), home), '#measure=pps');
  same(W.hashFor(view({ sel: 'RO', a: 'RO' }), home), '#country=RO');
  same(W.hashFor(view({ sel: 'RO', a: 'RO', b: 'BG', measure: 'pps' }), home), '#country=RO&with=BG&measure=pps');
  same(W.parseHash('#country=RO&with=BG&measure=pps', d), { country: 'RO', other: 'BG', measure: 'pps' });
  same(W.parseHash('#measure=eur', d), { measure: 'eur' });
  same(W.parseHash('#country=GR', d), { country: 'GR' }, 'Greece is GR on the page, as on the other maps');
  for (const bad of ['', '#', '#foo=bar', '#country=XX', '#country=EL', '#country=ro', '#country=RO&measure=usd', '#country=RO&with=RO', '#country=RO&with=']) {
    same(W.parseHash(bad, d), null, 'refused: ' + bad);
  }
}

console.log(`minimum-wage-europe: ${checks} checks passed`);
