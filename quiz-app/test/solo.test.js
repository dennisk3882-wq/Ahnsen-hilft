'use strict';

const assert = require('assert');
const { calculateSoloScore } = require('../solo-routes');

assert.strictEqual(calculateSoloScore({ correct: true, mode: 'timed', remainingSeconds: 20 }), 30);
assert.strictEqual(calculateSoloScore({ correct: true, mode: 'timed', remainingSeconds: 13 }), 23);
assert.strictEqual(calculateSoloScore({ correct: false, mode: 'timed', remainingSeconds: 18 }), -5);
assert.strictEqual(calculateSoloScore({ correct: true, mode: 'relaxed' }), 10);
assert.strictEqual(calculateSoloScore({ correct: false, mode: 'relaxed' }), 0);
assert.strictEqual(calculateSoloScore({ correct: true, mode: 'timed', remainingSeconds: -3 }), 10);

console.log('Solo scoring tests passed.');
