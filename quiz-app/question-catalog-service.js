'use strict';

const crypto = require('crypto');
const db = require('./platform-db');
const adultQuestionBank = require('./data/adult-question-catalog');
const childQuestionBank = require('./data/child-question-bank');
const { enrichQuestion } = require('./question-explanations');

const canonical = Object.freeze({
  adult: Object.freeze(adultQuestionBank.map(enrichQuestion)),
  child: Object.freeze(childQuestionBank.map(enrichQuestion)),
});
let published = {
  adult: canonical.adult.map(cloneQuestion),
  child: canonical.child.map(cloneQuestion),
};
let updatedAt = Date.now();

function cloneQuestion(question) {
  return { ...question, options: [...question.options] };
}

function normalizeCatalog(values, fallback) {
  const source = Array.isArray(values) && values.length ? values : fallback;
  const ids = new Set();
  const normalized = source.map(enrichQuestion).filter(question => {
    if (!question?.id || ids.has(question.id) || !Array.isArray(question.options) || question.options.length !== 4) return false;
    ids.add(question.id);
    return true;
  }).map(cloneQuestion);

  for (const standard of fallback) {
    if (ids.has(standard.id)) continue;
    normalized.push(cloneQuestion(standard));
    ids.add(standard.id);
  }
  return normalized;
}

function canonicalCatalog(type) {
  return (type === 'child' ? canonical.child : canonical.adult).map(cloneQuestion);
}

function currentCatalog(type) {
  return (type === 'child' ? published.child : published.adult).map(cloneQuestion);
}

function currentCatalogs() {
  return { adult: currentCatalog('adult'), child: currentCatalog('child') };
}

function setPublishedCatalog(type, values) {
  const key = type === 'child' ? 'child' : 'adult';
  published[key] = normalizeCatalog(values, canonical[key]);
  updatedAt = Date.now();
  return currentCatalog(key);
}

function setPublishedCatalogs(catalogs = {}) {
  setPublishedCatalog('adult', catalogs.adult);
  setPublishedCatalog('child', catalogs.child);
  return currentCatalogs();
}

function versionFor(catalogs = canonical) {
  const hash = crypto.createHash('sha256');
  for (const type of ['adult', 'child']) {
    for (const question of catalogs[type] || []) {
      hash.update(`${type}\0${question.id}\0${question.text}\0${(question.options || []).join('\0')}\0${question.correctIndex}\0${question.explanation || ''}`);
    }
  }
  return hash.digest('hex').slice(0, 16);
}

async function disabledQuestionIds() {
  if (!db.enabled()) return new Set();
  try {
    const exists = await db.query("SELECT to_regclass('public.quiz_phase11_question_controls') AS name");
    if (!exists.rows[0]?.name) return new Set();
    const { rows } = await db.query('SELECT question_id FROM quiz_phase11_question_controls WHERE disabled');
    return new Set(rows.map(row => row.question_id));
  } catch {
    return new Set();
  }
}

async function databaseCatalog(type) {
  const key = type === 'child' ? 'child' : 'adult';
  if (!db.enabled()) return currentCatalog(key);
  try {
    const [{ rows }, disabled] = await Promise.all([
      db.query('SELECT questions FROM quiz_question_sets WHERE quiz_type=$1', [key]),
      disabledQuestionIds(),
    ]);
    return normalizeCatalog(rows[0]?.questions, canonical[key]).filter(question => !disabled.has(question.id));
  } catch {
    return currentCatalog(key);
  }
}

async function reloadFromDatabase() {
  const catalogs = { adult: await databaseCatalog('adult'), child: await databaseCatalog('child') };
  return setPublishedCatalogs(catalogs);
}

async function diagnostics() {
  const runtime = currentCatalogs();
  const database = { adult: await databaseCatalog('adult'), child: await databaseCatalog('child') };
  const disabled = await disabledQuestionIds();
  const byType = {};
  for (const type of ['adult', 'child']) {
    const standardIds = new Set(canonical[type].map(question => question.id));
    const runtimeById = new Map(runtime[type].map(question => [question.id, question]));
    const databaseById = new Map(database[type].map(question => [question.id, question]));
    const changedStandards = canonical[type].filter(question => {
      const other = runtimeById.get(question.id);
      return other && JSON.stringify([question.text, question.options, question.correctIndex, question.explanation || ''])
        !== JSON.stringify([other.text, other.options, other.correctIndex, other.explanation || '']);
    }).length;
    const disabledForType = canonical[type].filter(question => disabled.has(question.id)).length;
    byType[type] = {
      canonical: canonical[type].length,
      runtime: runtime[type].length,
      database: database[type].length,
      disabled: disabledForType,
      custom: runtime[type].filter(question => !standardIds.has(question.id)).length,
      missingStandards: canonical[type].filter(question => !runtimeById.has(question.id) && !disabled.has(question.id)).length,
      changedStandards,
      databaseMatchesRuntime: versionFor({ [type]: database[type] }) === versionFor({ [type]: runtime[type] }),
      databaseMissingRuntime: runtime[type].filter(question => !databaseById.has(question.id)).length,
    };
  }
  return {
    canonicalVersion: versionFor(canonical),
    publishedVersion: versionFor(runtime),
    databaseVersion: versionFor(database),
    updatedAt,
    consistent: Object.values(byType).every(item => item.missingStandards === 0 && item.databaseMatchesRuntime),
    disabledQuestions: disabled.size,
    byType,
    policy: 'Der in PostgreSQL veröffentlichte Fragenkatalog wird als gemeinsamer Laufzeitkatalog für Live, Solo, Offline, Online, Duelle, Turniere, offizielle Events und Schwächen-Training verwendet. Administrativ deaktivierte Fragen werden zentral ausgeschlossen.',
  };
}

module.exports = {
  canonicalCatalog,
  currentCatalog,
  currentCatalogs,
  setPublishedCatalog,
  setPublishedCatalogs,
  reloadFromDatabase,
  versionFor,
  databaseCatalog,
  diagnostics,
  disabledQuestionIds,
};
