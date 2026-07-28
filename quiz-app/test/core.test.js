'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { calculateAnswerScore } = require('../lib/scoring');

assert.strictEqual(calculateAnswerScore({ correct: true, remainingSeconds: 20 }), 30);
assert.strictEqual(calculateAnswerScore({ correct: true, remainingSeconds: 13 }), 23);
assert.strictEqual(calculateAnswerScore({ correct: false, remainingSeconds: 20 }), -5);

for (const file of ['adult-questions.json', 'child-questions.json']) {
  const questions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', file), 'utf8'));
  const ids = new Set();
  for (const question of questions) {
    assert.ok(question.id && !ids.has(question.id), `Doppelte oder fehlende ID in ${file}`);
    ids.add(question.id);
    assert.ok(question.category);
    assert.ok(question.text);
    assert.strictEqual(question.options.length, 4);
    assert.ok(Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < 4);
  }
}
const adults = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'adult-questions.json'), 'utf8'));
const children = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'child-questions.json'), 'utf8'));
assert.strictEqual(adults.length, 300);
assert.strictEqual(children.length, 200);
console.log('Scoring tests passed.');
console.log('Catalog tests passed.');
