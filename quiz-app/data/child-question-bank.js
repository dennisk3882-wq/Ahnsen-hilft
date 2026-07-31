'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const directory = path.join(__dirname, 'child-questions');
const firstHundred = [
  ...require('./child-questions/child-01.json'),
  ...require('./child-questions/child-02.json'),
];
const compressed = ['01', '02', '03', '04']
  .map(part => fs.readFileSync(path.join(directory, `child-rest-${part}.b64`), 'utf8').trim())
  .join('');
const remaining = JSON.parse(zlib.inflateSync(Buffer.from(compressed, 'base64')).toString('utf8'));
const questions = [...firstHundred, ...remaining];

if (questions.length !== 500) {
  throw new Error(`Der Kinderfragenkatalog ist unvollständig: ${questions.length} statt 500 Fragen.`);
}

module.exports = questions;
