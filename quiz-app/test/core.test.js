'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { calculateAnswerScore } = require('../lib/scoring');
const { _test: { mergeCatalog } } = require('../db');

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
    assert.ok(typeof question.explanation === 'string' && question.explanation.trim().length >= 15, `Fehlende oder zu kurze Erklärung in ${file}: ${question.id}`);
  }
}

const adults = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'adult-questions.json'), 'utf8'));
const children = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'child-questions.json'), 'utf8'));
assert.strictEqual(adults.length, 300);
assert.strictEqual(children.length, 200);

for (const [type, catalog] of [['adult', adults], ['child', children]]) {
  const deliberatelyCorrupted = catalog.map((question, index) => ({
    ...question,
    explanation: catalog[(index + 1) % catalog.length].explanation,
  }));
  const repaired = mergeCatalog(deliberatelyCorrupted, catalog, type);
  assert.strictEqual(repaired.length, catalog.length);
  repaired.forEach((question, index) => {
    assert.strictEqual(
      question.explanation,
      catalog[index].explanation,
      `${type} ${question.id}: Vertauschte Erklärung wurde nicht anhand von Frage und richtiger Antwort repariert.`,
    );
  });
}

const madrid = children.find(question => {
  const answer = question.options[question.correctIndex];
  return answer === 'Madrid' && /Hauptstadt/.test(question.text) && /Spanien/.test(question.text);
});
assert(madrid);
assert.strictEqual(madrid.explanation, 'Madrid ist die Hauptstadt von Spanien.');

const drums = children.find(question => {
  const answer = question.options[question.correctIndex];
  return answer === 'Schlagzeug' && /Stöcken/.test(question.text);
});
assert(drums);
assert.strictEqual(drums.explanation, 'Beim Schlagzeug spielt man mit Stöcken auf Trommelfelle und Becken.');

console.log('Scoring tests passed.');
console.log('Catalog tests passed.');
console.log('Explanation mapping tests passed for all 500 questions.');
