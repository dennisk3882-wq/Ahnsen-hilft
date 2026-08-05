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

const ids = new Set();
const texts = new Set();
for (const question of questions) {
  const text = String(question.text || '').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[^a-z0-9äöüß]+/giu, ' ').trim();
  if (!question.id || ids.has(question.id)) throw new Error(`Doppelte Kinderfragen-ID: ${question.id || 'leer'}.`);
  if (!text || texts.has(text)) throw new Error(`Doppelte Kinderfrage: ${question.text || 'leer'}.`);
  ids.add(question.id);
  texts.add(text);
}

module.exports = Object.freeze(questions);
