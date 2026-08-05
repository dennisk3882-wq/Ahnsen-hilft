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
const questions = [...firstHundred, ...remaining, ...expansion.child];

if (questions.length !== 1000) {
  throw new Error(`Der Kinderfragenkatalog ist unvollständig: ${questions.length} statt 1000 Fragen.`);
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[^a-z0-9äöüß]+/giu, ' ').trim();
}

const ids = new Map();
const texts = new Map();
const duplicateIds = [];
const duplicateTexts = [];
for (const [index, question] of questions.entries()) {
  const id = String(question.id || '').trim();
  const text = normalizeText(question.text);
  if (!id) duplicateIds.push(`leer@${index + 1}`);
  else if (ids.has(id)) duplicateIds.push(`${id}@${ids.get(id) + 1}/${index + 1}`);
  else ids.set(id, index);

  if (!text) duplicateTexts.push(`leer@${index + 1}`);
  else if (texts.has(text)) {
    const first = texts.get(text);
    duplicateTexts.push(`„${question.text}“@${first + 1}/${index + 1}`);
  } else texts.set(text, index);
}

if (duplicateIds.length || duplicateTexts.length) {
  throw new Error([
    duplicateIds.length ? `Doppelte Kinderfragen-IDs: ${duplicateIds.join(' | ')}` : '',
    duplicateTexts.length ? `Doppelte Kinderfragen: ${duplicateTexts.join(' | ')}` : '',
  ].filter(Boolean).join('\n'));
}

module.exports = Object.freeze(questions);
