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
    category: 'Veraltete Kategorie',
    text: `Veraltete Fassung ${index + 1}?`,
    options: ['Alt A', 'Alt B', 'Alt C', 'Alt D'],
    correctIndex: 3,
    explanation: catalog[(index + 1) % catalog.length].explanation,
  }));

  const customQuestion = {
    id: `${type}-custom-testfrage`,
    category: 'Allgemeinwissen',
    text: 'Welche Zusatzfrage wurde im Editor erstellt?',
    options: ['Diese hier', 'Eine andere', 'Keine', 'Alle'],
    correctIndex: 0,
    explanation: 'Diese Frage wurde ausdrücklich im Frageneditor ergänzt.',
  };
  const legacyQuestion = {
    id: `${type}-legacy-999`,
    category: 'Altbestand',
    text: 'Diese alte Standardfrage darf nicht erneut angehängt werden?',
    options: ['Ja', 'Nein', 'Vielleicht', 'Unbekannt'],
    correctIndex: 0,
    explanation: 'Diese alte Fassung darf nicht mehr verwendet werden.',
  };

  const repaired = mergeCatalog([...deliberatelyCorrupted, customQuestion, legacyQuestion], catalog, type);
  assert.strictEqual(repaired.length, catalog.length + 1);
  assert.deepStrictEqual(repaired.slice(0, catalog.length), catalog, `${type}: Der Standardkatalog wurde nicht vollständig wiederhergestellt.`);
  assert.deepStrictEqual(repaired.at(-1), customQuestion, `${type}: Eine ausdrücklich erstellte Zusatzfrage ging verloren.`);
  assert.strictEqual(repaired.some(question => question.id === legacyQuestion.id), false, `${type}: Eine alte Legacy-Fassung wurde erneut übernommen.`);
}

const chameleon = children.find(question => question.id === 'child-nature-017');
assert(chameleon);
assert.strictEqual(chameleon.text, 'Welches Tier kann seine Farbe wechseln?');
assert.strictEqual(chameleon.options[chameleon.correctIndex], 'Chamäleon');
assert.strictEqual(chameleon.explanation, 'Ein Chamäleon kann seine Hautfarbe verändern.');

const drums = children.find(question => question.id === 'child-music-026');
assert(drums);
assert.strictEqual(drums.text, 'Welches Instrument wird mit zwei Stöcken auf Felle und Becken gespielt?');
assert.strictEqual(drums.options[drums.correctIndex], 'Schlagzeug');
assert.strictEqual(drums.explanation, 'Beim Schlagzeug spielt man mit Stöcken auf Trommelfelle und Becken.');

console.log('Scoring tests passed.');
console.log('Catalog tests passed.');
console.log('Canonical catalog restoration tests passed for all 500 standard questions.');
