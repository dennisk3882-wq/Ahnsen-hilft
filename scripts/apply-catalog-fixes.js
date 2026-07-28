'use strict';

const fs = require('fs');
const path = require('path');

const childPath = path.resolve('quiz-app/data/child-questions.json');
const questions = JSON.parse(fs.readFileSync(childPath, 'utf8'));

const replacements = new Map([
  ['child-geo-002', {
    text: 'Welches Gebirge trennt Europa und Asien in Russland?',
    options: ['Ural', 'Karpaten', 'Alpen', 'Pyrenäen'],
    correctIndex: 0
  }],
  ['child-geo-018', {
    text: 'Durch welche deutsche Stadt fließt die Spree?',
    options: ['Berlin', 'Hamburg', 'München', 'Köln'],
    correctIndex: 0
  }],
  ['child-geo-021', {
    text: 'Auf welchem Kontinent liegt Ägypten größtenteils?',
    options: ['Afrika', 'Asien', 'Europa', 'Südamerika'],
    correctIndex: 0
  }],
  ['child-geo-022', {
    text: 'Wie heißt die Meerenge zwischen Europa und Afrika bei Spanien?',
    options: ['Straße von Gibraltar', 'Bosporus', 'Ärmelkanal', 'Beringstraße'],
    correctIndex: 0
  }],
  ['child-geo-023', {
    text: 'Welcher große Fluss fließt durch Budapest?',
    options: ['Donau', 'Rhein', 'Themse', 'Seine'],
    correctIndex: 0
  }],
  ['child-history-004', {
    text: 'Welche berühmte ägyptische Königin lebte zur Zeit der Römer?',
    options: ['Kleopatra', 'Nofretete', 'Elisabeth I.', 'Marie Antoinette'],
    correctIndex: 0
  }],
  ['child-history-014', {
    text: 'Wie nannte man die Schriftzeichen der alten Ägypter?',
    options: ['Hieroglyphen', 'Runen', 'Keilschrift', 'Morsezeichen'],
    correctIndex: 0
  }],
  ['child-music-005', {
    text: 'Welches Blechblasinstrument wird mit einem Zug gespielt?',
    options: ['Posaune', 'Trompete', 'Tuba', 'Horn'],
    correctIndex: 0
  }]
]);

const updatedIds = new Set();
const updated = questions.map((question) => {
  const replacement = replacements.get(question.id);
  if (!replacement) return question;
  updatedIds.add(question.id);
  return { ...question, ...replacement };
});

const missing = [...replacements.keys()].filter((id) => !updatedIds.has(id));
if (missing.length) {
  throw new Error(`Zu ersetzende Frage-IDs fehlen: ${missing.join(', ')}`);
}

fs.writeFileSync(childPath, `${JSON.stringify(updated, null, 2)}\n`);
console.log(`Ersetzte ${updatedIds.size} doppelte Kinderfragen durch eindeutige Fragen.`);
