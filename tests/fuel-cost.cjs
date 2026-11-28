// Run: node tests/fuel-cost.cjs. The fuel cost calculator's sums, sentences and share links (assets/js/fuel-cost.js),
// on this week's prices from _data/fuel_prices.json, read the way the page hands them to the script: each price in
// euros per 1,000 litres, under a lower-case country code, with the EU average as "eu".
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
let checks = 0;
const same = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const near = (a, b, what) => { assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} is not ${b}`); checks++; };
// What the page's Liquid include (_includes/fuel-cost-money.html) prints for litres at a price: rounded to the cent once
const liquid = (price, litres) => { const c = Math.round(price / 1000 * litres * 100); return '€' + Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0'); };
const drive = over => Object.assign({ fuel: 'petrol', use: 6, unit: 'l100', dist: 'km', legs: [{ code: 'fr', distance: 500 }], back: false, people: 1 }, over);
const fr = prices.fr.petrol;

// One country: 500 km at 6 litres per 100 km is 30 litres
let r = F.calculate(prices, drive());
near(r.litres, 30, 'litres'); near(r.km, 500, 'km'); near(r.cents, 30 * fr / 10, 'cost in cents');
same(F.euros(r.cents), liquid(fr, 30), 'the calculator and the page round the same way');
same(F.euros(r.per100km), liquid(fr, 6), 'per 100 km is the table’s figure');
same(r.cheapest, null, 'one country has no cheaper country');
same(F.verdict(r, drive()), `Driving 500 km in France costs ${liquid(fr, 30)} in petrol at this week’s average price.`);

// The table's 100 km figure, for every country and fuel, matches what Liquid prints
for (const [code, p] of Object.entries(prices)) {
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
 ok.replace('use=6', 'use=6.125'), ok.replace('use=6', 'use=6,5'), ok.replace('dist=km', 'dist=nm'), ok.replace('fr-500', 'uk-500'),
 ok.replace('fr-500', 'FR-500'), ok.replace('fr-500', 'fr-0'), ok.replace('fr-500', 'fr-20001'), ok.replace('fr-500', 'fr-500_'),
 ok.replace('fr-500', 'fr-1_de-1_at-1_be-1_bg-1_hr-1_cy-1_cz-1_dk-1'), ok.replace('back=no', 'back=maybe'), ok.replace('&back=no', ''),
 ok.replace('people=1', 'people=9'), ok.replace('people=1', 'people=0'), ok.replace('people=1', 'people=1.5'), ok.replace('&people=1', '')
].forEach(h => bad('#' + h));
same(F.readHash('#' + ok.replace('fr-500', 'fr-1_de-1_at-1_be-1_bg-1_hr-1_cy-1_cz-1'), prices).legs.length, 8, 'eight countries is the limit');

console.log(`All ${checks} fuel cost checks passed.`);
