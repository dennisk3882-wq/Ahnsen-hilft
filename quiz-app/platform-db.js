'use strict';

const crypto = require('crypto');
const { Pool } = require('pg');
const profileStore = require('./extended-storage');

const rawUrl = String(process.env.DATABASE_URL || '').trim();
const pool = rawUrl ? new Pool({
  connectionString: (() => { const url = new URL(rawUrl); url.searchParams.set('sslmode', 'verify-full'); return url.toString(); })(),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
}) : null;

function enabled() { return Boolean(pool); }
function safeText(value, max = 160) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function safeCode(value, length = 8) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length); }
function randomCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < length; index += 1) code += alphabet[crypto.randomInt(0, alphabet.length)];
  return code;
}
function pairIds(a, b) { return String(a).localeCompare(String(b)) < 0 ? [a, b] : [b, a]; }
function normalizeQuestions(values) {
  if (!Array.isArray(values)) throw new Error('Fragen fehlen.');
  const questions = values.slice(0, 100).map((value, index) => {
    const text = safeText(value?.text, 300);
    const options = Array.isArray(value?.options) ? value.options.slice(0, 4).map(option => safeText(option, 160)) : [];
    const correctIndex = Number(value?.correctIndex);
    const explanation = safeText(value?.explanation, 500);
    if (!text || options.length !== 4 || options.some(option => !option) || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      throw new Error(`Frage ${index + 1} ist unvollständig.`);
    }
    return { id: crypto.randomUUID(), text, options, correctIndex, explanation };
  });
  if (questions.length < 3) throw new Error('Ein Quizpaket benötigt mindestens drei Fragen.');
  return questions;
}
async function ready() {
  if (!pool) return false;
  await profileStore.ensureReady();
  return true;
}
async function query(text, params = []) {
  if (!await ready()) throw new Error('PostgreSQL ist nicht verbunden.');
  return pool.query(text, params);
}

module.exports = { crypto, pool, enabled, ready, query, safeText, safeCode, randomCode, pairIds, normalizeQuestions };
