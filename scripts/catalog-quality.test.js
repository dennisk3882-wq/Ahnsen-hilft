'use strict';

const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..', 'quiz-app');
const errors = [];
const warnings = [];
const questions = [];
const loadedModules = new Set();
const visitedObjects = new WeakSet();

const textKeys = ['question', 'text', 'prompt', 'frage', 'title'];
const answerKeys = ['answers', 'options', 'choices', 'antworten'];
const correctKeys = [
  'correctIndex', 'correct', 'answer', 'correctAnswer',
  'correctOption', 'richtigeAntwort', 'richtig'
];
const categoryKeys = ['category', 'kategorie', 'topic', 'bereich'];
const idKeys = ['id', 'questionId', 'frageId'];

function firstValue(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) return object[key];
  }
  return undefined;
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function looksLikeQuestion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof firstValue(value, textKeys) === 'string'
    && Array.isArray(firstValue(value, answerKeys));
}

function collect(value, source, trail = 'root') {
  if (!value || typeof value !== 'object') return;
  if (visitedObjects.has(value)) return;
  visitedObjects.add(value);

  if (looksLikeQuestion(value)) {
    questions.push({ raw: value, source, trail });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collect(entry, source, `${trail}[${index}]`));
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    collect(entry, source, `${trail}.${key}`);
  }
}

function requireAndCollect(filePath) {
  const absolute = path.resolve(filePath);
  if (loadedModules.has(absolute) || !fs.existsSync(absolute)) return;
  loadedModules.add(absolute);

  try {
    if (absolute.endsWith('.json')) {
      collect(JSON.parse(fs.readFileSync(absolute, 'utf8')), absolute);
    } else {
      collect(require(absolute), absolute);
    }
  } catch (error) {
    warnings.push(
      `Modul konnte nicht automatisch geprüft werden: ${path.relative(appRoot, absolute)} (${error.message})`
    );
  }
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'public'].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(fullPath));
    else result.push(fullPath);
  }
  return result;
}

const coreTestPath = path.join(appRoot, 'tests', 'scoring.test.js');
if (fs.existsSync(coreTestPath)) {
  const coreSource = fs.readFileSync(coreTestPath, 'utf8');
  const requirePattern = /require\(\s*['"](\.\.\/[^'"]+)['"]\s*\)/g;
  for (const match of coreSource.matchAll(requirePattern)) {
    const requested = path.resolve(path.dirname(coreTestPath), match[1]);
    [requested, `${requested}.js`, `${requested}.json`, path.join(requested, 'index.js')]
      .forEach(requireAndCollect);
  }
}

for (const filePath of walk(appRoot)) {
  const relative = path.relative(appRoot, filePath);
  if (!/\.(js|cjs|json)$/i.test(filePath)) continue;
  if (relative === 'server.js' || relative.startsWith(`tests${path.sep}`)) continue;
  if (!/(question|fragen|catalog|katalog|bank|quiz|data)/i.test(relative)) continue;
  requireAndCollect(filePath);
}

if (questions.length === 0) errors.push('Es konnten keine Fragenobjekte im Projekt gefunden werden.');

const textMap = new Map();
const idMap = new Map();
const normalizedQuestions = [];

questions.forEach((entry) => {
  const question = entry.raw;
  const label = `${path.relative(appRoot, entry.source)}:${entry.trail}`;
  const text = firstValue(question, textKeys);
  const answers = firstValue(question, answerKeys);
  const correct = firstValue(question, correctKeys);
  const category = firstValue(question, categoryKeys);
  const id = firstValue(question, idKeys);
  const normalizedText = normalize(text);

  if (!normalizedText) errors.push(`${label}: Fragetext fehlt.`);
  if (!Array.isArray(answers) || answers.length !== 4) {
    errors.push(`${label}: Es müssen genau vier Antwortmöglichkeiten vorhanden sein.`);
    return;
  }

  const normalizedAnswers = answers.map(normalize);
  if (normalizedAnswers.some((answer) => !answer)) {
    errors.push(`${label}: Mindestens eine Antwort ist leer.`);
  }
  if (new Set(normalizedAnswers).size !== normalizedAnswers.length) {
    errors.push(`${label}: Antwortmöglichkeiten sind innerhalb der Frage doppelt.`);
  }

  let validCorrect = false;
  if (Number.isInteger(correct)) {
    validCorrect = (correct >= 0 && correct < answers.length)
      || (correct >= 1 && correct <= answers.length);
  } else if (typeof correct === 'string') {
    validCorrect = /^[a-d]$/i.test(correct.trim())
      || normalizedAnswers.includes(normalize(correct));
  }
  if (!validCorrect) {
    errors.push(`${label}: Die richtige Antwort fehlt oder passt nicht eindeutig zu einer Antwort.`);
  }

  if (normalizedText) {
    if (textMap.has(normalizedText)) {
      errors.push(`${label}: Exaktes Fragenduplikat zu ${textMap.get(normalizedText)}.`);
    } else {
      textMap.set(normalizedText, label);
    }
    normalizedQuestions.push({ text: normalizedText, label });
  }

  if (id !== undefined && id !== null && String(id).trim()) {
    const normalizedId = String(id).trim().toLowerCase();
    if (idMap.has(normalizedId)) {
      errors.push(`${label}: Doppelte Frage-ID, bereits verwendet bei ${idMap.get(normalizedId)}.`);
    } else {
      idMap.set(normalizedId, label);
    }
  } else {
    warnings.push(`${label}: Keine feste Frage-ID vorhanden.`);
  }

  if (!category || !String(category).trim()) warnings.push(`${label}: Kategorie fehlt.`);
  if (String(text).trim().length < 10) {
    warnings.push(`${label}: Sehr kurzer Fragetext – bitte auf Verständlichkeit prüfen.`);
  }
  if (String(text).trim().length > 220) {
    warnings.push(`${label}: Sehr langer Fragetext – auf Handy und Beamer prüfen.`);
  }
  if (!/[?？]$/.test(String(text).trim())) {
    warnings.push(`${label}: Fragetext endet nicht mit einem Fragezeichen.`);
  }
  answers.forEach((answer, index) => {
    if (String(answer).trim().length > 100) {
      warnings.push(`${label}: Antwort ${index + 1} ist ungewöhnlich lang.`);
    }
  });
});

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

const nearDuplicates = [];
for (let left = 0; left < normalizedQuestions.length; left += 1) {
  for (let right = left + 1; right < normalizedQuestions.length; right += 1) {
    const score = similarity(normalizedQuestions[left].text, normalizedQuestions[right].text);
    if (score >= 0.86 && normalizedQuestions[left].text !== normalizedQuestions[right].text) {
      nearDuplicates.push({
        score,
        left: normalizedQuestions[left].label,
        right: normalizedQuestions[right].label
      });
    }
  }
}

nearDuplicates
  .sort((a, b) => b.score - a.score)
  .slice(0, 50)
  .forEach((duplicate) => {
    warnings.push(
      `Mögliches ähnliches Fragenpaar (${Math.round(duplicate.score * 100)} %): ${duplicate.left} ↔ ${duplicate.right}`
    );
  });

const reportLines = [
  '# Automatische Qualitätsprüfung des Fragenkatalogs',
  '',
  `Geprüfte Fragenobjekte: **${questions.length}**`,
  `Strukturelle Fehler: **${errors.length}**`,
  `Prüfhinweise: **${warnings.length}**`,
  '',
  '## Geprüfte Punkte',
  '',
  '- genau vier Antwortmöglichkeiten',
  '- vorhandene und gültige richtige Antwort',
  '- leere sowie doppelte Antworten',
  '- exakte doppelte Fragetexte',
  '- doppelte Frage-IDs',
  '- fehlende Kategorien und IDs',
  '- auffällig kurze oder lange Texte',
  '- mögliche sehr ähnliche Fragen',
  '',
  '> Sachliche Richtigkeit, Aktualität und sprachliche Eindeutigkeit können nicht vollständig automatisiert garantiert werden und benötigen weiterhin Stichproben durch einen Menschen.',
  ''
];

if (errors.length) reportLines.push('## Fehler', '', ...errors.map((item) => `- ${item}`), '');
if (warnings.length) reportLines.push('## Hinweise', '', ...warnings.map((item) => `- ${item}`), '');

fs.writeFileSync(
  path.join(appRoot, 'CATALOG_QUALITY_REPORT.md'),
  `${reportLines.join('\n')}\n`
);

console.log(
  `Catalog quality check: ${questions.length} questions, ${errors.length} errors, ${warnings.length} warnings.`
);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Catalog quality tests passed.');
