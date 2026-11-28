// Run: node tests/fuel-cost.cjs. The fuel cost calculator's sums, sentences and share links (assets/js/fuel-cost.js),
// on this week's prices from _data/fuel_prices.json and _data/uk_fuel_prices.json, read the way the page hands them to
// the script: each price per 1,000 litres in the country's own money (pounds for the UK, "uk"), under a lower-case
// country code, with the EU average as "eu", and the pounds-to-the-euro rate as fx.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../assets/js/fuel-cost.js');   // with no document, it only sets globalThis.FuelCost
const F = globalThis.FuelCost;
const page = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_data/fuel_prices.json'), 'utf8'));
const per1000 = f => (f ? Math.round(parseFloat(f.price) * 1000) : null);
const prices = { eu: { name: 'EU average', petrol: per1000(page.eu.petrol), diesel: per1000(page.eu.diesel) } };
page.rows.forEach(r => { prices[r.code.toLowerCase()] = { name: r.name, petrol: per1000(r.petrol), diesel: per1000(r.diesel) }; });
const ukFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_data/uk_fuel_prices.json'), 'utf8'));
prices.uk = { name: 'United Kingdom', cur: 'gbp', week: ukFile.week, petrol: ukFile.petrol.per1000, diesel: ukFile.diesel.per1000 };
const fx = ukFile.gbp_per_eur;
let checks = 0;
const same = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const near = (a, b, what) => { assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} is not ${b}`); checks++; };
// What the page's Liquid include (_includes/fuel-cost-money.html) prints for litres at a price: rounded to the cent once
const liquid = (price, litres, symbol = '€') => { const c = Math.round(price / 1000 * litres * 100); return symbol + Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0'); };
const drive = over => Object.assign({ fuel: 'petrol', use: 6, unit: 'l100', dist: 'km', legs: [{ code: 'fr', distance: 500 }], back: false, people: 1, cur: null }, over);
const fr = prices.fr.petrol;

// One country: 500 km at 6 litres per 100 km is 30 litres
let r = F.calculate(prices, drive());
near(r.litres, 30, 'litres'); near(r.km, 500, 'km'); near(r.cents, 30 * fr / 10, 'cost in cents');
same(F.euros(r.cents), liquid(fr, 30), 'the calculator and the page round the same way');
same(F.euros(r.per100km), liquid(fr, 6), 'per 100 km is the table’s figure');
same(r.cheapest, null, 'one country has no cheaper country');
same(F.verdict(r, drive()), `Driving 500 km in France costs ${liquid(fr, 30)} in petrol at this week’s average price.`);

// The table's 100 km figure, for every EU country and fuel, matches what Liquid prints
for (const [code, p] of Object.entries(prices)) {
  if (code === 'uk') continue;
  for (const fuel of ['petrol', 'diesel']) {
    if (p[fuel] == null) continue;
    const one = F.calculate(prices, drive({ fuel, legs: [{ code, distance: 100 }] }));
    same(F.euros(one.cents), liquid(p[fuel], 6), `${code} ${fuel}: 100 km`);
  }
}

// mpg (UK) and miles
r = F.calculate(prices, drive({ unit: 'mpg', use: F.L100_PER_MPG / 6 }));
near(r.l100, 6, 'mpg turned into litres per 100 km');
near(F.L100_PER_MPG, 100 * 4.54609 / 1.609344, 'the mpg constant');
r = F.calculate(prices, drive({ dist: 'mi', legs: [{ code: 'fr', distance: 100 }] }));
near(r.km, 160.9344, 'miles into km'); near(r.perMile, r.cents / 100, 'per mile');
same(F.verdict(r, drive({ dist: 'mi', legs: [{ code: 'fr', distance: 100 }] })).slice(0, 34), 'Driving 100 miles in France costs ');

// The way back doubles everything; people split the bill
const both = drive({ back: true, people: 3 });
r = F.calculate(prices, both);
near(r.litres, 60, 'return litres'); near(r.distance, 1000, 'return distance'); near(r.each, r.cents / 3, 'each of three');
same(F.verdict(r, both), `Driving 500 km each way in France, 1,000 km in all, costs ${F.euros(r.cents)} in petrol at this week’s average price. Split among three people, that is ${F.euros(r.cents / 3)} each.`);
same(F.verdict(F.calculate(prices, drive({ people: 2 })), drive({ people: 2 })).endsWith(`Split between two people, that is ${F.euros(30 * fr / 10 / 2)} each.`), true);

// Several countries: each stretch at its own price, and the cheapest country on the route
const route = drive({ legs: [{ code: 'fr', distance: 500 }, { code: 'de', distance: 300 }, { code: 'pl', distance: 200 }] });
r = F.calculate(prices, route);
near(r.cents, (30 * fr + 18 * prices.de.petrol + 12 * prices.pl.petrol) / 10, 'the route’s cost');
same(r.legs.map(l => l.code), ['fr', 'de', 'pl']);
const low = ['fr', 'de', 'pl'].reduce((a, b) => (prices[b].petrol < prices[a].petrol ? b : a));
same(r.cheapest.code, low, 'the cheapest country on the route');
near(r.cheapest.cents, 60 * prices[low].petrol / 10, 'all the litres at the lowest price');
near(r.cheapest.saving, r.cents - r.cheapest.cents, 'the saving');
same(F.verdict(r, route).startsWith('Driving 1,000 km through France, Germany and Poland costs '), true);
same(F.verdict(r, route).includes('average prices.'), true, 'several countries, several prices');
same(F.cheapestText(r).startsWith(`Bought in ${prices[low].name}, the cheapest country on this route, the same 60.0 litres would cost `), true);
// The EU average is never "the cheapest country", and one country twice is still one country
same(F.calculate(prices, drive({ legs: [{ code: 'fr', distance: 100 }, { code: 'eu', distance: 100 }] })).cheapest, null);
same(F.calculate(prices, drive({ legs: [{ code: 'fr', distance: 100 }, { code: 'fr', distance: 100 }] })).cheapest, null);
same(F.verdict(F.calculate(prices, drive({ legs: [{ code: 'nl', distance: 50 }] })), drive({ legs: [{ code: 'nl', distance: 50 }] })).startsWith('Driving 50 km in the Netherlands'), true);
same(F.verdict(F.calculate(prices, drive({ legs: [{ code: 'eu', distance: 50 }] })), drive({ legs: [{ code: 'eu', distance: 50 }] })).startsWith('Driving 50 km in the EU'), true);
// A country with no price for the fuel is refused, never priced at zero
assert.throws(() => F.calculate({ xx: { name: 'X', petrol: null, diesel: 1500 } }, drive({ legs: [{ code: 'xx', distance: 10 }] }))); checks++;

// Words
same(F.litres(1), '1.0 litre'); same(F.litres(1234.56), '1,234.6 litres'); same(F.distance(1, 'mi'), '1 mile');
same(F.distance(12.25, 'km'), '12.3 km'); same(F.euros(123456.4), '€1,234.56'); same(F.euros(0.4), '€0.00');

// Share links: inputs only, back exactly as they went in
const linked = drive({ fuel: 'diesel', use: 47.5, unit: 'mpg', dist: 'mi', back: true, people: 4,
  legs: [{ code: 'fr', distance: 312.25 }, { code: 'es', distance: 80 }, { code: 'eu', distance: 1 }] });
const hash = F.writeHash(linked);
same(hash, '#fuel=diesel&use=47.5&unit=mpg&dist=mi&route=fr-312.25_es-80_eu-1&back=yes&people=4');
same(F.readHash(hash, prices), linked, 'a link opens the drive it was made from');
same(F.readHash('', prices), null); same(F.readHash('#fuel-cost-questions', prices), null, 'a jump to a section is not a drive');
const bad = h => { assert.throws(() => F.readHash(h, prices), /link/, h); checks++; };
const ok = 'fuel=petrol&use=6&unit=l100&dist=km&route=fr-500&back=no&people=1';
F.readHash('#' + ok, prices); checks++;
[ok.replace('petrol', 'lpg'), ok.replace('use=6', 'use=0.5'), ok.replace('use=6', 'use=41'), ok.replace('unit=l100&', 'unit=mpg&'),
 ok.replace('use=6', 'use=6.125'), ok.replace('use=6', 'use=6,5'), ok.replace('dist=km', 'dist=nm'), ok.replace('fr-500', 'ch-500'),
 ok.replace('fr-500', 'FR-500'), ok.replace('fr-500', 'fr-0'), ok.replace('fr-500', 'fr-20001'), ok.replace('fr-500', 'fr-500_'),
 ok.replace('fr-500', 'fr-1_de-1_at-1_be-1_bg-1_hr-1_cy-1_cz-1_dk-1'), ok.replace('back=no', 'back=maybe'), ok.replace('&back=no', ''),
 ok.replace('people=1', 'people=9'), ok.replace('people=1', 'people=0'), ok.replace('people=1', 'people=1.5'), ok.replace('&people=1', '')
].forEach(h => bad('#' + h));
same(F.readHash('#' + ok.replace('fr-500', 'fr-1_de-1_at-1_be-1_bg-1_hr-1_cy-1_cz-1'), prices).legs.length, 8, 'eight countries is the limit');
bad('#' + ok + '&cur=usd'); bad('#' + ok + '&cur=');

// The UK, in pounds, and pounds and euros either way --------------------------------------------------------------
const uk = prices.uk.petrol;
// The table's UK row in euros, as the page's Liquid works it out: pounds per 1,000 litres ÷ the rate
for (const fuel of ['petrol', 'diesel']) {
  const eur = prices.uk[fuel] / fx;
  same((eur / 1000).toFixed(3), ukFile[fuel].eur, `UK ${fuel}: the euro price a litre in the file is the script’s`);
  const one = F.calculate(prices, drive({ fuel, legs: [{ code: 'uk', distance: 100 }] }), fx);
  same(F.euros(one.cents), liquid(eur, 6), `UK ${fuel}: 100 km in euros matches the page`);
  same(one.converted, true, 'pounds shown as euros are converted');
  const gbp = F.calculate(prices, drive({ fuel, cur: 'gbp', legs: [{ code: 'uk', distance: 100 }] }), fx);
  same(F.money(gbp.cents, 'gbp'), liquid(prices.uk[fuel], 6, '£'), `UK ${fuel}: 100 km in pounds`);
  same(gbp.converted, false, 'pounds shown as pounds are not');
  for (const [code, p] of Object.entries(prices)) {
    if (code === 'uk' || p[fuel] == null) continue;
    const eu = F.calculate(prices, drive({ fuel, cur: 'gbp', legs: [{ code, distance: 100 }] }), fx);
    near(eu.cents, 6 * p[fuel] * fx / 10, `${code} ${fuel}: 100 km in pounds`);
  }
}
// The page's example without JavaScript: 30 litres of UK petrol
same(liquid(uk, 30, '£'), F.money(30 * uk / 10, 'gbp'));
r = F.calculate(prices, drive({ cur: 'gbp', dist: 'mi', legs: [{ code: 'uk', distance: 300 }] }), fx);
same(F.verdict(r, drive({ cur: 'gbp', dist: 'mi', legs: [{ code: 'uk', distance: 300 }] })), `Driving 300 miles in the UK costs ${F.money(r.cents, 'gbp')} in petrol at this week’s average price.`);
near(r.perMile, r.cents / 300, 'pence a mile');
same(F.small(15.24, 'gbp'), '15.2p'); same(F.small(15.26, 'eur'), '15.3 cents');
same(F.money(123456.4, 'gbp'), '£1,234.56'); same(F.euros(5), '€0.05');
// Across the Channel: France in pounds, and the cheaper of the two found in the same money
const channel = drive({ cur: 'gbp', legs: [{ code: 'uk', distance: 200 }, { code: 'fr', distance: 500 }] });
r = F.calculate(prices, channel, fx);
near(r.cents, (12 * uk + 30 * fr * fx) / 10, 'the UK and France in pounds');
same(r.converted, true, 'France in pounds is converted');
same(r.cheapest && r.cheapest.code, uk < fr * fx ? 'uk' : 'fr', 'the cheaper of the UK and France');
same(F.verdict(r, channel).startsWith('Driving 700 km through the UK and France costs £'), true);
same(F.cheapestText(r).includes(' would cost £'), true, 'the cheapest country in pounds too');
const inEuros = F.calculate(prices, Object.assign({}, channel, { cur: 'eur' }), fx);
near(inEuros.cents * fx, r.cents, 'the same drive in euros is the same money');
same(F.autoCur(['fr', 'uk'], prices), 'gbp'); same(F.autoCur(['fr', 'de'], prices), 'eur'); same(F.autoCur([], prices), 'eur');
near(F.convert(F.convert(1619.6, 'gbp', 'eur', fx), 'eur', 'gbp', fx), 1619.6, 'there and back');
same(F.convert(1500, 'eur', 'eur'), 1500, 'no rate needed for no conversion');
assert.throws(() => F.calculate(prices, drive({ cur: 'gbp' }))); checks++;   // pounds with no rate: refused
// Links: the money only when the reader chose it, and read back
same(F.writeHash(drive({ cur: 'gbp' })).includes('cur='), false, 'a money the reader didn’t pick stays out of the link');
const chosen = F.writeHash(drive({ cur: 'gbp', curSet: true, legs: [{ code: 'uk', distance: 120 }] }));
same(chosen, '#fuel=petrol&use=6&unit=l100&dist=km&route=uk-120&back=no&people=1&cur=gbp');
same(F.readHash(chosen, prices).cur, 'gbp'); same(F.readHash('#' + ok, prices).cur, null, 'an older link leaves the money to the route');

console.log(`All ${checks} fuel cost checks passed.`);
