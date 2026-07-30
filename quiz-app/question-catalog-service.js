'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./platform-db');
const { enrichQuestion } = require('./question-explanations');

const canonical = Object.freeze({
  adult: Object.freeze(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'adult-questions.json'), 'utf8')).map(enrichQuestion)),
  child: Object.freeze(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'child-questions.json'), 'utf8')).map(enrichQuestion)),
});

function cloneQuestion(question) {
  return { ...question, options: [...question.options] };
}

function canonicalCatalog(type) {
  return (type === 'child' ? canonical.child : canonical.adult).map(cloneQuestion);
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

async function databaseCatalog(type) {
  if (!db.enabled()) return canonicalCatalog(type);
  try {
    const { rows } = await db.query('SELECT questions FROM quiz_question_sets WHERE quiz_type=$1', [type === 'child' ? 'child' : 'adult']);
    const values = Array.isArray(rows[0]?.questions) ? rows[0].questions : canonicalCatalog(type);
    return values.map(enrichQuestion).map(cloneQuestion);
  } catch {
    return canonicalCatalog(type);
  }
}

async function diagnostics() {
  const published = { adult: await databaseCatalog('adult'), child: await databaseCatalog('child') };
  const byType = {};
  for (const type of ['adult', 'child']) {
    const standardIds = new Set(canonical[type].map(question => question.id));
    const publishedById = new Map(published[type].map(question => [question.id, question]));
    const changedStandards = canonical[type].filter(question => {
      const other = publishedById.get(question.id);
      return other && JSON.stringify([question.text, question.options, question.correctIndex, question.explanation || ''])
        !== JSON.stringify([other.text, other.options, other.correctIndex, other.explanation || '']);
    }).length;
    byType[type] = {
      canonical: canonical[type].length,
      published: published[type].length,
      custom: published[type].filter(question => !standardIds.has(question.id)).length,
      missingStandards: canonical[type].filter(question => !publishedById.has(question.id)).length,
      changedStandards,
    };
  }
  return {
    canonicalVersion: versionFor(canonical),
    publishedVersion: versionFor(published),
    consistent: Object.values(byType).every(item => item.missingStandards === 0 && item.changedStandards === 0),
    byType,
    policy: 'Die 500 redaktionellen Standardfragen aus data/ sind für Solo, Offline, Online, Duelle, Turniere und offizielle Events verbindlich. Zusätzliche Adminfragen bleiben bis zu einer redaktionellen Veröffentlichung im Live-Quiz.',
  };
}

module.exports = { canonicalCatalog, versionFor, databaseCatalog, diagnostics };
