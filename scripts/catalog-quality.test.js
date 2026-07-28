'use strict';

const fs = require('fs');
const path = require('path');

const localCandidate = path.resolve(__dirname, '..');
const repositoryCandidate = path.resolve(__dirname, '..', 'quiz-app');
const appRoot = fs.existsSync(path.join(localCandidate, 'package.json'))
  ? localCandidate
  : repositoryCandidate;

const catalogs = [
  {
    name: 'Erwachsene',
    key: 'adult',
    file: path.join(appRoot, 'data', 'adult-questions.json'),
    expectedCount: 300,
    categories: new Set([
      'Allgemeinwissen', 'Geografie', 'Geschichte', 'Natur & Wissenschaft',
      'Musik', 'Sport', 'Film & Fernsehen', 'Technik', 'Essen & Trinken'
    ])
  },
  {
    name: 'Kinder',
    key: 'child',
    file: path.join(appRoot, 'data', 'child-questions.json'),
    expectedCount: 200,
    categories: new Set([
      'Allgemeinwissen', 'Natur & Tiere', 'Geografie', 'Geschichte',
      'Musik', 'Sport', 'Film & Fernsehen'
    ])
  }
];

const errors = [];
const warnings = [];
const allQuestions = [];
const globalIds = new Map();
const globalTexts = new Map();

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenSet(text) {
  return new Set(text.split(' ').filter((token) => token.length > 2));
}

function similarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

for (const catalog of catalogs) {
  if (!fs.existsSync(catalog.file)) {
    errors.push(`${catalog.name}: Katalogdatei fehlt: ${catalog.file}`);
    continue;
  }

  let questions;
  try {
    questions = JSON.parse(fs.readFileSync(catalog.file, 'utf8'));
  } catch (error) {
    errors.push(`${catalog.name}: Katalog ist kein gültiges JSON (${error.message}).`);
    continue;
  }

  if (!Array.isArray(questions)) {
    errors.push(`${catalog.name}: Der Katalog muss ein Array sein.`);
    continue;
  }

  if (questions.length !== catalog.expectedCount) {
    errors.push(
      `${catalog.name}: Erwartet werden ${catalog.expectedCount} Fragen, gefunden wurden ${questions.length}.`
    );
  }

  const catalogTexts = new Map();

  questions.forEach((question, index) => {
    const label = `${catalog.name}[${index}]`;
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
      errors.push(`${label}: Frage ist kein gültiges Objekt.`);
      return;
    }

    const id = String(question.id ?? '').trim();
    const text = String(question.text ?? '').trim();
    const category = String(question.category ?? '').trim();
    const options = question.options;
    const correctIndex = question.correctIndex;

    if (!id) {
      errors.push(`${label}: Feste Frage-ID fehlt.`);
    } else if (globalIds.has(id.toLowerCase())) {
      errors.push(`${label}: Doppelte Frage-ID, bereits verwendet bei ${globalIds.get(id.toLowerCase())}.`);
    } else {
      globalIds.set(id.toLowerCase(), label);
    }

    const normalizedText = normalizeText(text);
    if (!normalizedText) {
      errors.push(`${label}: Fragetext fehlt.`);
    } else {
      if (catalogTexts.has(normalizedText)) {
        errors.push(`${label}: Exaktes Duplikat im selben Katalog zu ${catalogTexts.get(normalizedText)}.`);
      } else {
        catalogTexts.set(normalizedText, label);
      }

      if (globalTexts.has(normalizedText)) {
        const previous = globalTexts.get(normalizedText);
        if (previous.catalogKey !== catalog.key) {
          warnings.push(`${label}: Gleicher Fragetext auch in ${previous.label}.`);
        }
      } else {
        globalTexts.set(normalizedText, { catalogKey: catalog.key, label });
      }
    }

    if (!category) {
      errors.push(`${label}: Kategorie fehlt.`);
    } else if (!catalog.categories.has(category)) {
      errors.push(`${label}: Unzulässige Kategorie „${category}“.`);
    }

    if (!Array.isArray(options) || options.length !== 4) {
      errors.push(`${label}: Es müssen genau vier Antwortmöglichkeiten vorhanden sein.`);
    } else {
      const rawOptions = options.map((option) => String(option ?? '').trim());
      if (rawOptions.some((option) => option.length === 0)) {
        errors.push(`${label}: Mindestens eine Antwort ist leer.`);
      }

      const normalizedOptions = rawOptions.map(normalizeAnswer);
      if (new Set(normalizedOptions).size !== normalizedOptions.length) {
        errors.push(`${label}: Antwortmöglichkeiten sind innerhalb der Frage doppelt.`);
      }

      options.forEach((option, optionIndex) => {
        if (typeof option !== 'string') {
          errors.push(`${label}: Antwort ${optionIndex + 1} muss Text sein.`);
        }
        if (String(option ?? '').trim().length > 100) {
          warnings.push(`${label}: Antwort ${optionIndex + 1} ist ungewöhnlich lang.`);
        }
      });
    }

    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      errors.push(`${label}: correctIndex muss eine Ganzzahl von 0 bis 3 sein.`);
    }

    if (text.length < 10) warnings.push(`${label}: Sehr kurzer Fragetext.`);
    if (text.length > 220) warnings.push(`${label}: Sehr langer Fragetext für Handy oder Beamer.`);
    if (text && !/[?？]$/.test(text)) warnings.push(`${label}: Fragetext endet nicht mit einem Fragezeichen.`);

    allQuestions.push({ catalogKey: catalog.key, label, text: normalizedText });
  });
}

for (let left = 0; left < allQuestions.length; left += 1) {
  for (let right = left + 1; right < allQuestions.length; right += 1) {
    const a = allQuestions[left];
    const b = allQuestions[right];
    if (!a.text || !b.text || a.text === b.text) continue;
    if (a.catalogKey !== b.catalogKey) continue;
    const score = similarity(a.text, b.text);
    if (score >= 0.86) {
      warnings.push(
        `Mögliches ähnliches Fragenpaar (${Math.round(score * 100)} %): ${a.label} ↔ ${b.label}`
      );
    }
  }
}

const reportLines = [
  '# Automatische Qualitätsprüfung des Fragenkatalogs',
  '',
  `Geprüfte Fragen: **${allQuestions.length}**`,
  `Strukturelle Fehler: **${errors.length}**`,
  `Prüfhinweise: **${warnings.length}**`,
  '',
  '## Automatisch geprüft',
  '',
  '- 300 Erwachsenenfragen und 200 Kinderfragen',
  '- eindeutige feste Frage-IDs',
  '- zulässige Kategorien',
  '- genau vier nicht leere und unterschiedliche Antworten',
  '- gültiger correctIndex von 0 bis 3',
  '- exakte Duplikate und auffällig ähnliche Fragen',
  '- ungewöhnlich kurze oder lange Texte',
  '',
  '> Sachliche Richtigkeit, Aktualität und sprachliche Eindeutigkeit benötigen weiterhin menschliche Stichproben; sie lassen sich nicht vollständig automatisieren.',
  ''
];

if (errors.length) reportLines.push('## Fehler', '', ...errors.map((item) => `- ${item}`), '');
if (warnings.length) reportLines.push('## Hinweise', '', ...warnings.map((item) => `- ${item}`), '');

fs.writeFileSync(
  path.join(appRoot, 'CATALOG_QUALITY_REPORT.md'),
  `${reportLines.join('\n')}\n`
);

console.log(
  `Catalog quality check: ${allQuestions.length} questions, ${errors.length} errors, ${warnings.length} warnings.`
);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Catalog quality tests passed.');
