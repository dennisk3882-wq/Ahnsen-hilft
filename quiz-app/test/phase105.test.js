'use strict';

const assert = require('assert');
const adultQuestions = require('../data/adult-question-bank');
const phase105 = require('../phase105-storage')._test;

assert.strictEqual(adultQuestions.length, 500, 'Der Erwachsenenfragenkatalog muss exakt 500 Fragen enthalten.');
assert.strictEqual(new Set(adultQuestions.map(question => question.category)).size, 9, 'Es dürfen keine zusätzlichen Erwachsenen-Kategorien entstehen.');
assert.ok(adultQuestions.every(question => !Object.prototype.hasOwnProperty.call(question, 'difficulty')), 'Schwierigkeitsstufen dürfen nicht eingeführt werden.');

const categoryCounts = adultQuestions.reduce((map, question) => map.set(question.category, (map.get(question.category) || 0) + 1), new Map());
assert.ok([...categoryCounts.values()].some(count => count > 50), 'Kategorienpools müssen unabhängig von der maximalen Quizlänge mehr als 50 Fragen enthalten dürfen.');

assert.strictEqual(phase105.safeText('  Ein   kurzer Text  ', 30), 'Ein kurzer Text');
assert.deepStrictEqual(phase105.uniqueTextList(['eins', 'eins', 'zwei', 'drei', 'vier'], 3), ['eins', 'zwei', 'drei']);
assert.strictEqual(phase105.eventStatus({ starts_at: '2099-01-01T00:00:00Z', ends_at: '2099-02-01T00:00:00Z' }, Date.parse('2098-12-01T00:00:00Z')), 'upcoming');
assert.strictEqual(phase105.eventStatus({ starts_at: '2099-01-01T00:00:00Z', ends_at: '2099-02-01T00:00:00Z' }, Date.parse('2099-01-15T00:00:00Z')), 'live');
assert.strictEqual(phase105.eventStatus({ starts_at: '2099-01-01T00:00:00Z', ends_at: '2099-02-01T00:00:00Z' }, Date.parse('2099-03-01T00:00:00Z')), 'ended');
assert.strictEqual(phase105.seasonLabel(0).key, 'winter');
assert.strictEqual(phase105.seasonLabel(3).key, 'spring');
assert.strictEqual(phase105.seasonLabel(6).key, 'summer');
assert.strictEqual(phase105.seasonLabel(9).key, 'autumn');

console.log('Phase 10.5 core tests passed.');
