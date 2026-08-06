'use strict';

const assert = require('assert');
const answerLayout = require('../answer-layout');
const childQuestions = require('../data/child-question-bank');

function sentenceCount(value) {
  return String(value || '').split(/(?<=[.!?])\s+/u).filter(Boolean).length;
}

assert.strictEqual(childQuestions.length, 1500, 'Der Kinderkatalog muss exakt 1.500 Fragen enthalten.');
assert.strictEqual(new Set(childQuestions.map(question => question.id)).size, 1500, 'Alle Kinderfragen benötigen eindeutige IDs.');
assert.strictEqual(new Set(childQuestions.map(question => question.text)).size, 1500, 'Alle Kinderfragen benötigen eindeutige Texte.');
assert.deepStrictEqual(answerLayout.distribution(childQuestions), [375, 375, 375, 375], 'Der Quellkatalog muss A bis D exakt ausgleichen.');
assert(childQuestions.every(question => sentenceCount(question.explanation) >= 2 && sentenceCount(question.explanation) <= 3), 'Jede Kinderfrage benötigt zwei bis drei Erklärungssätze.');

for (let attempt = 0; attempt < 100; attempt += 1) {
  const positions = answerLayout.balancedPositions(50, `test-${attempt}`);
  const counts = positions.reduce((values, position) => {
    values[position] += 1;
    return values;
  }, [0, 0, 0, 0]);
  assert(Math.max(...counts) - Math.min(...counts) <= 1, `50er-Verteilung ist unausgeglichen: ${counts.join('/')}`);
  assert(answerLayout.longestStreak(positions) <= 2, 'Eine richtige Antwortposition darf höchstens zweimal hintereinander vorkommen.');
}

const source = childQuestions.slice(0, 50);
const prepared = answerLayout.prepareBalancedQuestions(source, 'fester-50er-test');
assert.deepStrictEqual(answerLayout.distribution(prepared).sort((a, b) => a - b), [12, 12, 13, 13]);
assert(answerLayout.longestStreak(prepared.map(question => question.correctIndex)) <= 2);
prepared.forEach((question, index) => {
  const original = source[index];
  assert.strictEqual(question.options[question.correctIndex], original.options[original.correctIndex], 'Die richtige Antwort muss beim Mischen erhalten bleiben.');
  assert.deepStrictEqual([...question.options].sort(), [...original.options].sort(), 'Beim Mischen dürfen keine Antworten verloren gehen oder hinzukommen.');
});

console.log('Answer layout and 1.500-child-question tests passed.');
