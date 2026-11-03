'use strict';
const assert = require('node:assert/strict');
const {payment, mortgage} = require('../assets/js/rate-scenarios.js');
let checks = 0;
function near(actual, expected, tolerance = 1e-8) { assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`); checks++; }
function bad(fn) { assert.throws(fn, e => e.name === 'RangeError'); checks++; }
near(payment(120000, 0, 120), 1000);
near(payment(200000, .015, 300), 799.8726524727);
near(payment(200000, .04, 300), 1055.673680596);
const example = mortgage(200000,25,.015,.04,.15);
near(example.newPayment,897.3226285062);
near(example.change,.121831863775);
near(mortgage(200000,25,.015,.04,example.breakEvenFall).newPayment,example.oldPayment);
near(mortgage(200000,25,.04,.04,0).difference,0);
near(mortgage(200000,25,.04,.04,1).newPayment,0);
near(payment(120000,1e-14,120),1000,1e-6);
bad(() => mortgage(200000,0,.015,.04,0));
bad(() => mortgage(200000,25.5,.015,.04,0));
bad(() => mortgage(200000,25,.015,.04,1.01));
bad(() => payment(1,-.01,12));
console.log(`${checks} rate-scenario maths checks passed`);
