'use strict';

const crypto = require('crypto');
const db = require('./platform-db');
const accountStorage = require('./account-storage');
const { runMigrations } = require('./migration-runner');

const VERSION = '13.1.0';
const PRIVACY_VERSION = '2026-08-05';
const TERMS_VERSION = '2026-08-05';
const BERLIN_TIMEZONE = 'Europe/Berlin';
const OPERATOR = Object.freeze({ name: 'Dennis Koch', street: 'In der Flöte 19', postalCode: '31708', city: 'Ahnsen', country: 'Deutschland' });
let readyPromise = null;

function safeText(value, max = 500) { return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, max); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function hashToken(value) { return crypto.createHash('sha256').update(String(value || '')).digest('base64url'); }
function randomToken() { return crypto.randomBytes(32).toString('base64url'); }
function berlinDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BERLIN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function berlinHour(value = new Date()) { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: BERLIN_TIMEZONE, hour: '2-digit', hour12: false }).format(value)); }
function dateDiffDays(a, b) { return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000); }
function mondayFor(day = berlinDate()) {
  const date = new Date(`${day}T12:00:00Z`); const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1); return date.toISOString().slice(0, 10);
}
function legalConfig() {
  const contactEmail = accountStorage.normalizeEmail(process.env.LEGAL_CONTACT_EMAIL || process.env.SUPPORT_EMAIL || process.env.MAIL_FROM_EMAIL || (process.env.NODE_ENV === 'test' ? 'test@quiztime.example' : ''));
  return { operator: OPERATOR, contactEmail: contactEmail || null, contactConfigured: Boolean(contactEmail), privacyVersion: PRIVACY_VERSION, termsVersion: TERMS_VERSION, appVersion: VERSION, timezone: BERLIN_TIMEZONE };
}
async function ensureReady() {
  if (!db.enabled()) return false;
  if (!readyPromise) readyPromise = (async () => {
    await accountStorage.ensureReady(); await runMigrations();
    await db.query(`INSERT INTO quiz_phase13_engagement(profile_id) SELECT id FROM quiz_solo_profiles ON CONFLICT(profile_id) DO NOTHING;
      INSERT INTO quiz_phase12_legal_consents(profile_id) SELECT id FROM quiz_solo_profiles ON CONFLICT(profile_id) DO NOTHING;`);
    return true;
  })().catch(error => { readyPromise = null; throw error; });
  return readyPromise;
}
async function q(text, params = []) { await ensureReady(); return db.query(text, params); }

module.exports = { crypto, db, accountStorage, VERSION, PRIVACY_VERSION, TERMS_VERSION, BERLIN_TIMEZONE, OPERATOR, safeText, escapeHtml, hashToken, randomToken, berlinDate, berlinHour, dateDiffDays, mondayFor, legalConfig, ensureReady, q };
