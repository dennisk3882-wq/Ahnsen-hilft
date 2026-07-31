'use strict';

const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const childQuestions = require(path.join(appRoot, 'data', 'child-question-bank'));
const adultQuestions = JSON.parse(fs.readFileSync(path.join(appRoot, 'data', 'adult-questions.json'), 'utf8'));

const catalogs = [
  {
    name: 'Erwachsene',
    key: 'adult',
    questions: adultQuestions,
    expectedCount: 300,
    categories: new Set([
      'Allgemeinwissen', 'Geografie', 'Geschichte', 'Natur & Wissenschaft',
      'Musik', 'Sport', 'Film & Fernsehen', 'Technik', 'Essen & Trinken',
    ]),
  },
  {
    name: 'Kinder',
    key: 'child',
    questions: childQuestions,
    expectedCount: 500,
    categories: new Set([
      'Mathematik', 'Sprache', 'Natur & Tiere', 'Technik & Wissenschaft',
      'Geografie', 'Alltag & Verkehr', 'Essen & Gesundheit', 'Allgemeinwissen',
      'Geschichte', 'Musik', 'Sport', 'Film & Fernsehen',
    ]),
  },
];

const errors = [];
const warnings = [];
const globalIds = new Map();
const globalTexts = new Map();

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\+/g, ' plus ')
    .replace(/[−-]/g, ' minus ')
    .replace(/[×*]/g, ' mal ')
    .replace(/[÷/:]/g, ' geteilt ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9äöüß]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeAnswer(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function sentenceCount(value) {
  return String(value || '').split(/(?<=[.!?])\s+/u).filter(sentence => sentence.trim()).length;
}

for (const catalog of catalogs) {
  const questions = catalog.questions;
  if (!Array.isArray(questions)) {
    errors.push(`${catalog.name}: Der Katalog muss ein Array sein.`);
    continue;
  }
  if (questions.length !== catalog.expectedCount) {
    errors.push(`${catalog.name}: Erwartet werden ${catalog.expectedCount} Fragen, gefunden wurden ${questions.length}.`);
  }

  const distribution = [0, 0, 0, 0];
  const catalogTexts = new Map();
  questions.forEach((question, index) => {
    const label = `${catalog.name}[${index}]`;
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
      errors.push(`${label}: Frage ist kein gültiges Objekt.`);
      return;
    }

    const id = String(question.id || '').trim();
    const text = String(question.text || '').trim();
    const category = String(question.category || '').trim();
    const options = question.options;
    const correctIndex = question.correctIndex;
    const explanation = String(question.explanation || '').trim();

    if (!id) errors.push(`${label}: Feste Frage-ID fehlt.`);
    else if (globalIds.has(id.toLowerCase())) errors.push(`${label}: Doppelte Frage-ID zu ${globalIds.get(id.toLowerCase())}.`);
    else globalIds.set(id.toLowerCase(), label);

    const normalizedText = normalizeText(text);
    if (!normalizedText) errors.push(`${label}: Fragetext fehlt.`);
    else if (catalogTexts.has(normalizedText)) errors.push(`${label}: Doppelter Fragetext zu ${catalogTexts.get(normalizedText)}.`);
    else {
      catalogTexts.set(normalizedText, label);
      const previous = globalTexts.get(normalizedText);
      if (previous && previous.catalogKey !== catalog.key) warnings.push(`${label}: Gleicher Grundfragetext auch in ${previous.label}.`);
      else if (!previous) globalTexts.set(normalizedText, { catalogKey: catalog.key, label });
    }

    if (!category) errors.push(`${label}: Kategorie fehlt.`);
    else if (!catalog.categories.has(category)) errors.push(`${label}: Unzulässige Kategorie „${category}“.`);

    if (!Array.isArray(options) || options.length !== 4) {
      errors.push(`${label}: Es müssen genau vier Antwortmöglichkeiten vorhanden sein.`);
    } else {
      const normalizedOptions = options.map(normalizeAnswer);
      if (normalizedOptions.some(option => !option)) errors.push(`${label}: Mindestens eine Antwort ist leer.`);
      if (new Set(normalizedOptions).size !== 4) errors.push(`${label}: Antwortmöglichkeiten sind innerhalb der Frage exakt doppelt.`);
      if (options.some(option => typeof option !== 'string')) errors.push(`${label}: Alle Antworten müssen Text sein.`);
    }

    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      errors.push(`${label}: correctIndex muss eine Ganzzahl von 0 bis 3 sein.`);
    } else distribution[correctIndex] += 1;

    if (!explanation) errors.push(`${label}: Lern-Erklärung fehlt.`);
    else {
      const sentences = sentenceCount(explanation);
      if (catalog.key === 'child' && (sentences < 2 || sentences > 3)) {
        errors.push(`${label}: Kinder-Erklärung muss aus zwei oder drei Sätzen bestehen, gefunden: ${sentences}.`);
      }
      if (catalog.key === 'child' && explanation.length < 30) errors.push(`${label}: Kinder-Lern-Erklärung ist zu kurz.`);
      if (catalog.key === 'adult' && explanation.length < 30) warnings.push(`${label}: Erwachsenen-Erklärung ist sehr kurz.`);
      if (explanation.length > 320) warnings.push(`${label}: Lern-Erklärung ist für ein Handy ungewöhnlich lang.`);
      if (!/[.!?]$/u.test(explanation)) errors.push(`${label}: Lern-Erklärung endet nicht mit einem Satzzeichen.`);
    }

    if (text && !/[?？]$/u.test(text)) warnings.push(`${label}: Fragetext endet nicht mit einem Fragezeichen.`);
    if (text.length > 220) warnings.push(`${label}: Sehr langer Fragetext für Handy oder Beamer.`);
  });

  if (catalog.key === 'child') {
    const expectedPerPosition = catalog.expectedCount / 4;
    if (distribution.some(value => value !== expectedPerPosition)) {
      errors.push(`${catalog.name}: Richtige Antwortpositionen sind nicht exakt ausgeglichen: ${distribution.join('/')}.`);
    }
  }
}

const reportLines = [
  '# Automatische Qualitätsprüfung des Fragenkatalogs',
  '',
  `Geprüfte Fragen: **${catalogs.reduce((sum, catalog) => sum + catalog.questions.length, 0)}**`,
  `Strukturelle Fehler: **${errors.length}**`,
  `Prüfhinweise: **${warnings.length}**`,
  '',
  '## Automatisch geprüft',
  '',
  '- 300 Erwachsenenfragen und 500 Kinderfragen',
  '- eindeutige feste Frage-IDs und Fragetexte innerhalb jedes Katalogs',
  '- Rechenzeichen bleiben bei der Duplikatprüfung unterscheidbar',
  '- zulässige Kategorien',
  '- genau vier nicht leere und exakt unterschiedliche Antworten',
  '- gültiger correctIndex von 0 bis 3',
  '- bei Kinderfragen exakt 125 richtige Antworten je Position A, B, C und D',
  '- bei Kinderfragen zwei bis drei verständliche Erklärungssätze',
  '',
  '> Sachliche Richtigkeit und Aktualität benötigen weiterhin redaktionelle Stichproben; sie lassen sich nicht vollständig automatisieren.',
  '',
];
if (errors.length) reportLines.push('## Fehler', '', ...errors.map(item => `- ${item}`), '');
if (warnings.length) reportLines.push('## Hinweise', '', ...warnings.map(item => `- ${item}`), '');
fs.writeFileSync(path.join(appRoot, 'CATALOG_QUALITY_REPORT.md'), `${reportLines.join('\n')}\n`);

console.log(`Catalog quality check: ${errors.length} errors, ${warnings.length} warnings.`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Catalog quality tests passed.');
