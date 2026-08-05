'use strict';

const baseQuestions = require('./adult-question-bank');
const expansion = require('./question-expansion-batch1');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9äöüß]+/giu, ' ')
    .trim();
}

const questions = [...baseQuestions, ...expansion.adult];
if (questions.length !== 1000) {
  throw new Error(`Der Erwachsenenfragenkatalog ist unvollständig: ${questions.length} statt 1000 Fragen.`);
}

const ids = new Set();
const texts = new Set();
for (const question of questions) {
  const id = String(question.id || '').trim().toLocaleLowerCase('de-DE');
  const text = normalizeText(question.text);
  if (!id || ids.has(id)) throw new Error(`Doppelte Erwachsenenfragen-ID: ${question.id || 'leer'}.`);
  if (!text || texts.has(text)) throw new Error(`Doppelte Erwachsenenfrage: ${question.text || 'leer'}.`);
  ids.add(id);
  texts.add(text);
}

Object.defineProperty(questions, 'meta', {
  enumerable: false,
  value: Object.freeze({
    baseCount: baseQuestions.length,
    expansionCount: expansion.adult.length,
    totalCount: questions.length,
    categories: Object.freeze([...new Set(questions.map(question => question.category))]),
  }),
});

module.exports = Object.freeze(questions);
