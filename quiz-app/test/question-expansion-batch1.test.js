'use strict';

const assert = require('assert');
const expansion = require('../data/question-expansion-batch1');
const childCatalog = require('../data/child-question-bank');
const adultCatalog = require('../data/adult-question-catalog');
const catalogService = require('../question-catalog-service');

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
  return String(value || '').trim().split(/(?<=[.!?])\s+/u).filter(Boolean).length;
}

function validateNewQuestions(questions, { prefix, categories, label }) {
  assert.strictEqual(questions.length, 500, `${label}: Es müssen exakt 500 neue Fragen sein.`);
  const ids = new Set();
  const texts = new Set();
  const balance = [0, 0, 0, 0];

  questions.forEach((question, index) => {
    const position = `${label}[${index}]`;
    assert(String(question.id).startsWith(prefix), `${position}: falscher ID-Präfix.`);
    assert(!ids.has(question.id), `${position}: doppelte ID.`);
    ids.add(question.id);

    const normalizedText = normalizeText(question.text);
    assert(normalizedText, `${position}: Fragetext fehlt.`);
    assert(!texts.has(normalizedText), `${position}: doppelter Fragetext.`);
    texts.add(normalizedText);

    assert(categories.has(question.category), `${position}: neue oder falsche Kategorie ${question.category}.`);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(question, 'difficulty'), false, `${position}: keine Schwierigkeitsstufe erlaubt.`);
    assert(Array.isArray(question.options), `${position}: Antworten fehlen.`);
    assert.strictEqual(question.options.length, 4, `${position}: genau vier Antworten erforderlich.`);
    assert.strictEqual(new Set(question.options.map(normalizeText)).size, 4, `${position}: Antworten müssen eindeutig sein.`);
    assert(Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex <= 3, `${position}: falscher correctIndex.`);
    balance[question.correctIndex] += 1;
    assert([2, 3].includes(sentenceCount(question.explanation)), `${position}: Erklärung muss zwei oder drei Sätze haben.`);
  });

  assert.deepStrictEqual(balance, [125, 125, 125, 125], `${label}: A–D sind nicht exakt ausgeglichen.`);
}

function validateCombinedCatalog(questions, { expectedPrefix, label }) {
  assert.strictEqual(questions.length, 1500, `${label}: Gesamtkatalog muss 1.500 Fragen enthalten.`);
  assert.strictEqual(questions.filter(question => String(question.id).startsWith(expectedPrefix)).length, 500, `${label}: erster Ausbauanteil muss weiterhin exakt 500 betragen.`);
  assert.strictEqual(new Set(questions.map(question => String(question.id).toLocaleLowerCase('de-DE'))).size, 1500, `${label}: doppelte IDs im Gesamtkatalog.`);
  assert.strictEqual(new Set(questions.map(question => normalizeText(question.text))).size, 1500, `${label}: doppelte Texte im Gesamtkatalog.`);
}

validateNewQuestions(expansion.child, { prefix: 'child-b1-', categories: CHILD_CATEGORIES, label: 'Kinder-Ausbau 1' });
validateNewQuestions(expansion.adult, { prefix: 'adult-b1-', categories: ADULT_CATEGORIES, label: 'Erwachsenen-Ausbau 1' });
validateCombinedCatalog(childCatalog, { expectedPrefix: 'child-b1-', label: 'Kinder' });
validateCombinedCatalog(adultCatalog, { expectedPrefix: 'adult-b1-', label: 'Erwachsene' });

assert.strictEqual(catalogService.canonicalCatalog('child').length, 1500, 'Katalogservice veröffentlicht nicht alle 1.500 Kinderfragen.');
assert.strictEqual(catalogService.canonicalCatalog('adult').length, 1500, 'Katalogservice veröffentlicht nicht alle 1.500 Erwachsenenfragen.');
assert.strictEqual(adultCatalog.meta.baseCount, 500, 'Erwachsenen-Basiskatalog wurde unerwartet verändert.');
assert.strictEqual(adultCatalog.meta.expansion1Count, 500, 'Der erste Erwachsenen-Ausbau enthält nicht mehr exakt 500 Fragen.');
assert.strictEqual(adultCatalog.meta.expansion2Count, 500, 'Der zweite Erwachsenen-Ausbau enthält nicht exakt 500 Fragen.');
assert.strictEqual(adultCatalog.meta.expansionCount, 1000, 'Beide Erwachsenen-Ausbaustufen enthalten zusammen nicht exakt 1.000 Fragen.');

console.log('QuizTime question expansion batch 1 remains valid inside the 1.500-question catalogs.');
