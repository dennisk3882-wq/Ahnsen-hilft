'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const expansion = require('./question-expansion-batch1');

const directory = path.join(__dirname, 'child-questions');
const firstHundred = [
  ...require('./child-questions/child-01.json'),
  ...require('./child-questions/child-02.json'),
];
const compressed = ['01', '02', '03', '04']
  .map(part => fs.readFileSync(path.join(directory, `child-rest-${part}.b64`), 'utf8').trim())
  .join('');
const remaining = JSON.parse(zlib.inflateSync(Buffer.from(compressed, 'base64')).toString('utf8'));

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9äöüß]+/giu, ' ')
    .trim();
}

function replaceMathQuestion(question, { text, answer, distractors, explanation }) {
  const correctIndex = Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex <= 3
    ? question.correctIndex
    : 0;
  const options = distractors.slice(0, 3).map(String);
  options.splice(correctIndex, 0, String(answer));
  return Object.freeze({
    ...question,
    text,
    category: 'Mathematik',
    options: Object.freeze(options),
    correctIndex,
    explanation,
  });
}

const baseQuestions = [...firstHundred, ...remaining].map(question => ({
  ...question,
  options: [...question.options],
}));

// Drei bereits im früheren 500er-Bestand doppelt vorhandene Aufgaben werden
// durch neue, eindeutige Rechenfragen ersetzt. Die IDs bleiben stabil.
baseQuestions[42] = replaceMathQuestion(baseQuestions[42], {
  text: 'Berechne die Aufgabe 14 · 6.',
  answer: 84,
  distractors: [78, 82, 90],
  explanation: '14 mal 6 ergibt 84. Die Multiplikation fasst sechs Gruppen mit jeweils 14 zusammen.',
});
baseQuestions[46] = replaceMathQuestion(baseQuestions[46], {
  text: 'Berechne die Aufgabe 13 · 7.',
  answer: 91,
  distractors: [84, 88, 98],
  explanation: '13 mal 7 ergibt 91. Die Multiplikation fasst sieben Gruppen mit jeweils 13 zusammen.',
});
baseQuestions[50] = replaceMathQuestion(baseQuestions[50], {
  text: 'Berechne die Aufgabe 16 · 5.',
  answer: 80,
  distractors: [72, 75, 85],
  explanation: '16 mal 5 ergibt 80. Die Multiplikation fasst fünf Gruppen mit jeweils 16 zusammen.',
});

function uniqueExpansionText(text) {
  let match = /^Wie viel ist (\d+) \+ (\d+)\?$/u.exec(text);
  if (match) return `Berechne die Summe aus ${match[1]} und ${match[2]}.`;

  match = /^Wie viel ist (\d+) − (\d+)\?$/u.exec(text);
  if (match) return `Berechne die Differenz aus ${match[1]} und ${match[2]}.`;

  match = /^Wie viel ist (\d+) : (\d+)\?$/u.exec(text);
  if (match) return `Berechne den Quotienten aus ${match[1]} und ${match[2]}.`;

  return text;
}

const extensionQuestions = expansion.child.map(question => Object.freeze({
  ...question,
  text: uniqueExpansionText(question.text),
  options: Object.freeze([...question.options]),
}));

const questions = [...baseQuestions, ...extensionQuestions];
if (questions.length !== 1000) {
  throw new Error(`Der Kinderfragenkatalog ist unvollständig: ${questions.length} statt 1000 Fragen.`);
}

const ids = new Set();
const texts = new Set();
for (const question of questions) {
  const id = String(question.id || '').trim().toLocaleLowerCase('de-DE');
  const text = normalizeText(question.text);
  if (!id || ids.has(id)) throw new Error(`Doppelte Kinderfragen-ID: ${question.id || 'leer'}.`);
  if (!text || texts.has(text)) throw new Error(`Doppelte Kinderfrage: ${question.text || 'leer'}.`);
  ids.add(id);
  texts.add(text);
}

module.exports = Object.freeze(questions);
