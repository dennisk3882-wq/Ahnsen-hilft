'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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
  return String(value || '')
    .trim()
    .split(/(?<=[.!?])\s+/u)
    .filter(Boolean).length;
}

function readBatch(prefix) {
  const directory = path.join(__dirname, 'question-expansion-batch1');
  const encoded = ['01', '02']
    .map(part => fs.readFileSync(path.join(directory, `${prefix}-${part}.b64`), 'utf8').trim())
    .join('');
  const json = zlib.inflateSync(Buffer.from(encoded, 'base64')).toString('utf8');
  return JSON.parse(json);
}

function validateBatch(questions, { expectedCount, idPrefix, categories, label }) {
  if (!Array.isArray(questions) || questions.length !== expectedCount) {
    throw new Error(`${label}: ${questions?.length || 0} statt ${expectedCount} Fragen.`);
  }

  const ids = new Set();
  const texts = new Set();
  const balance = [0, 0, 0, 0];

  questions.forEach((question, index) => {
    const position = `${label} ${index + 1}`;
    if (!question || typeof question !== 'object') throw new Error(`${position}: ungültiger Datensatz.`);
    if (!String(question.id || '').startsWith(idPrefix) || ids.has(question.id)) {
      throw new Error(`${position}: ungültige oder doppelte ID „${question.id || ''}“.`);
    }
    ids.add(question.id);

    const normalized = normalizeText(question.text);
    if (!normalized || texts.has(normalized)) throw new Error(`${position}: leerer oder doppelter Fragetext.`);
    texts.add(normalized);

    if (!categories.has(question.category)) throw new Error(`${position}: unbekannte Kategorie „${question.category}“.`);
    if (!Array.isArray(question.options) || question.options.length !== 4) throw new Error(`${position}: genau vier Antworten erforderlich.`);
    if (new Set(question.options.map(normalizeText)).size !== 4) throw new Error(`${position}: Antworten müssen eindeutig sein.`);
    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
      throw new Error(`${position}: correctIndex muss zwischen 0 und 3 liegen.`);
    }
    balance[question.correctIndex] += 1;

    const explanationSentences = sentenceCount(question.explanation);
    if (explanationSentences < 2 || explanationSentences > 3) {
      throw new Error(`${position}: Erklärung benötigt zwei oder drei Sätze.`);
    }
    if (Object.prototype.hasOwnProperty.call(question, 'difficulty')) {
      throw new Error(`${position}: Schwierigkeitsstufen sind nicht vorgesehen.`);
    }
  });

  const target = expectedCount / 4;
  if (balance.some(count => count !== target)) {
    throw new Error(`${label}: Antwortpositionen sind nicht ausgeglichen (${balance.join(', ')}).`);
  }
}

function freezeQuestions(questions) {
  return Object.freeze(questions.map(question => Object.freeze({
    ...question,
    options: Object.freeze([...question.options]),
  })));
}

const child = readBatch('child');
const adult = readBatch('adult');
validateBatch(child, { expectedCount: 500, idPrefix: 'child-b1-', categories: CHILD_CATEGORIES, label: 'Kinder-Erweiterung 1' });
validateBatch(adult, { expectedCount: 500, idPrefix: 'adult-b1-', categories: ADULT_CATEGORIES, label: 'Erwachsenen-Erweiterung 1' });

module.exports = Object.freeze({
  child: freezeQuestions(child),
  adult: freezeQuestions(adult),
  _test: Object.freeze({ normalizeText, sentenceCount }),
});
