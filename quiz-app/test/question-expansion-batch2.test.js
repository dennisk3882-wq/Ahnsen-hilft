'use strict';

const assert = require('assert');
const expansion = require('../data/question-expansion-batch2');
const childCatalog = require('../data/child-question-bank');
const adultCatalog = require('../data/adult-question-catalog');

const CHILD_CATEGORIES = new Set([
  'Mathematik', 'Sprache', 'Natur & Tiere', 'Technik & Wissenschaft',
  'Geografie', 'Alltag & Verkehr', 'Essen & Gesundheit', 'Allgemeinwissen',
  'Geschichte', 'Musik', 'Sport', 'Film & Fernsehen',
]);
const ADULT_CATEGORIES = new Set([
  'Allgemeinwissen', 'Geografie', 'Geschichte', 'Natur & Wissenschaft',
  'Musik', 'Technik', 'Sport', 'Film & Fernsehen', 'Essen & Trinken',
]);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9äöüß]+/giu, ' ')
    .trim();
}

function sentenceCount(value) {
  return String(value || '').split(/(?<=[.!?])\s+/u).filter(Boolean).length;
}

function validateBatch(questions, prefix, categories, label) {
  assert.strictEqual(questions.length, 500, `${label} muss exakt 500 Fragen enthalten.`);
  assert.strictEqual(new Set(questions.map(question => question.id)).size, 500, `${label}: IDs müssen eindeutig sein.`);
  assert.strictEqual(new Set(questions.map(question => normalizeText(question.text))).size, 500, `${label}: Texte müssen eindeutig sein.`);
  assert.deepStrictEqual(
    questions.reduce((counts, question) => {
      counts[question.correctIndex] += 1;
      return counts;
    }, [0, 0, 0, 0]),
    [125, 125, 125, 125],
    `${label}: richtige Antworten müssen exakt auf A bis D verteilt sein.`,
  );

  questions.forEach(question => {
    assert(String(question.id).startsWith(prefix), `${label}: falscher ID-Präfix.`);
    assert(categories.has(question.category), `${label}: unbekannte Kategorie ${question.category}.`);
    assert(Array.isArray(question.options) && question.options.length === 4, `${label}: vier Antworten erforderlich.`);
    assert.strictEqual(new Set(question.options.map(normalizeText)).size, 4, `${label}: Antworten müssen eindeutig sein.`);
    assert(Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex <= 3, `${label}: correctIndex ungültig.`);
    assert(sentenceCount(question.explanation) >= 2 && sentenceCount(question.explanation) <= 3, `${label}: Erklärung benötigt zwei bis drei Sätze.`);
    assert(!Object.prototype.hasOwnProperty.call(question, 'difficulty'), `${label}: Schwierigkeitsstufen sind nicht vorgesehen.`);
  });
}

validateBatch(expansion.child, 'child-b2-', CHILD_CATEGORIES, 'Kinder-Erweiterung 2');
validateBatch(expansion.adult, 'adult-b2-', ADULT_CATEGORIES, 'Erwachsenen-Erweiterung 2');

assert.strictEqual(childCatalog.length, 1500, 'Der vollständige Kinderkatalog muss 1.500 Fragen enthalten.');
assert.strictEqual(adultCatalog.length, 1500, 'Der vollständige Erwachsenenkatalog muss 1.500 Fragen enthalten.');
assert.strictEqual(childCatalog.filter(question => String(question.id).startsWith('child-b2-')).length, 500);
assert.strictEqual(adultCatalog.filter(question => String(question.id).startsWith('adult-b2-')).length, 500);

for (const [label, catalog] of [['Kinder', childCatalog], ['Erwachsene', adultCatalog]]) {
  assert.strictEqual(new Set(catalog.map(question => String(question.id).toLowerCase())).size, 1500, `${label}: alle IDs müssen eindeutig sein.`);
  assert.strictEqual(new Set(catalog.map(question => normalizeText(question.text))).size, 1500, `${label}: alle Fragetexte müssen eindeutig sein.`);
}

assert.deepStrictEqual(
  childCatalog.reduce((counts, question) => {
    counts[question.correctIndex] += 1;
    return counts;
  }, [0, 0, 0, 0]),
  [375, 375, 375, 375],
  'Der vollständige Kinderkatalog muss A bis D exakt ausgleichen.',
);

console.log('Question expansion batch 2 tests passed: 500 child and 500 adult questions.');
