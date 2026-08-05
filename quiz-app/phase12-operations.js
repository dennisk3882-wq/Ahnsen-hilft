'use strict';

const emailService = require('./email-service');
const questionCatalog = require('./question-catalog-service');
const { crypto, db, VERSION, BERLIN_TIMEZONE, safeText, legalConfig, ensureReady, q } = require('./phase12-shared');

async function recordError(source, error, context = {}) {
  if (!db.enabled()) return false;
  try {
    await ensureReady(); const message = safeText(error?.message || error, 1000) || 'Unbekannter Fehler';
    const stackHash = crypto.createHash('sha256').update(String(error?.stack || message)).digest('hex');
    await db.query(`INSERT INTO quiz_phase12_error_events(id,source,message,stack_hash,context) VALUES($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT(source,stack_hash) WHERE resolved_at IS NULL DO UPDATE SET occurrence_count=quiz_phase12_error_events.occurrence_count+1,last_seen_at=NOW(),message=EXCLUDED.message,context=EXCLUDED.context`,
      [crypto.randomUUID(), safeText(source, 120), message, stackHash, JSON.stringify(context || {})]); return true;
  } catch { return false; }
}
async function errorEvents() { return (await q('SELECT * FROM quiz_phase12_error_events ORDER BY last_seen_at DESC LIMIT 300')).rows; }
async function resolveError(id) { return (await q('UPDATE quiz_phase12_error_events SET resolved_at=NOW() WHERE id=$1 RETURNING *', [id])).rows[0] || null; }
async function backupChecks() { return (await q('SELECT * FROM quiz_phase12_backup_checks ORDER BY created_at DESC LIMIT 30')).rows; }
async function recordBackupCheck(checkType, status, details = {}) {
  const safeStatus = ['pass', 'warning', 'fail'].includes(status) ? status : 'warning';
  return (await q(`INSERT INTO quiz_phase12_backup_checks(id,check_type,status,details) VALUES($1,$2,$3,$4::jsonb) RETURNING *`, [crypto.randomUUID(), safeText(checkType, 100), safeStatus, JSON.stringify(details)])).rows[0];
}

async function releaseChecks({ persist = false } = {}) {
  const checks = []; const add = (key, ok, level, label, detail) => checks.push({ key, ok: Boolean(ok), level, label, detail }); let databaseOk = false;
  try { await ensureReady(); databaseOk = Boolean((await db.query('SELECT NOW() AS now')).rows[0]); } catch (error) { add('database', false, 'fail', 'PostgreSQL', safeText(error.message, 300)); }
  if (databaseOk) add('database', true, 'fail', 'PostgreSQL', 'Datenbank ist erreichbar.');
  let migrations = [];
  if (databaseOk) try { migrations = (await db.query('SELECT version,applied_at FROM quiz_schema_migrations ORDER BY version')).rows; add('migration-120', migrations.some(row => row.version === '120_phase12_13_release_quality.sql'), 'fail', 'Migration 120', 'Release-, Qualitäts- und Bindungstabellen sind vorhanden.'); }
  catch (error) { add('migration-120', false, 'fail', 'Migration 120', safeText(error.message, 300)); }
  const catalogs = questionCatalog.currentCatalogs();
  add('catalog-child', catalogs.child.length >= 500, 'fail', 'Kinderfragen', `${catalogs.child.length} veröffentlichte Fragen.`);
  add('catalog-adult', catalogs.adult.length >= 500, 'fail', 'Erwachsenenfragen', `${catalogs.adult.length} veröffentlichte Fragen.`);
  const mail = emailService.status(); add('email', mail.configured, 'warning', 'E-Mail-Versand', mail.configured ? `${mail.provider} ist konfiguriert.` : 'Kein E-Mail-Anbieter ist konfiguriert.');
  const legal = legalConfig(); add('legal-contact', legal.contactConfigured, 'fail', 'Impressums-E-Mail', legal.contactConfigured ? legal.contactEmail : 'LEGAL_CONTACT_EMAIL fehlt.');
  let backup = null; if (databaseOk) backup = (await db.query('SELECT * FROM quiz_phase12_backup_checks ORDER BY created_at DESC LIMIT 1').catch(() => ({ rows: [] }))).rows[0] || null;
  const configuredBackup = process.env.BACKUP_AUTOMATION_CONFIGURED === 'true' || Boolean(process.env.DATABASE_BACKUP_CONFIRMED_AT);
  const recentBackup = backup && Date.now() - new Date(backup.created_at).getTime() < 36 * 3600000 && backup.status === 'pass';
  add('backup', configuredBackup || recentBackup, 'warning', 'Verschlüsseltes Backup', recentBackup ? `Letzte Prüfung: ${backup.created_at}` : configuredBackup ? 'Externe Backup-Automation ist bestätigt.' : 'Backup-Automation muss noch mit GitHub-Secrets aktiviert werden.');
  let openErrors = 0; if (databaseOk) openErrors = Number((await db.query(`SELECT COALESCE(SUM(occurrence_count),0)::int AS total FROM quiz_phase12_error_events WHERE resolved_at IS NULL AND last_seen_at>NOW()-INTERVAL '24 hours'`).catch(() => ({ rows: [{ total: 0 }] }))).rows[0]?.total || 0);
  add('errors', openErrors < 20, 'warning', 'Zentrale Fehlerquote', `${openErrors} Fehlerereignisse in den letzten 24 Stunden.`);
  const status = checks.some(check => !check.ok && check.level === 'fail') ? 'fail' : checks.some(check => !check.ok) ? 'warning' : 'pass';
  const result = { version: VERSION, status, checkedAt: new Date().toISOString(), commitSha: process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || null, timezone: BERLIN_TIMEZONE, checks, migrations };
  if (persist && databaseOk) await db.query(`INSERT INTO quiz_phase12_release_checks(id,version,commit_sha,status,checks) VALUES($1,$2,$3,$4,$5::jsonb)`, [crypto.randomUUID(), VERSION, result.commitSha, status, JSON.stringify(checks)]);
  return result;
}
async function releaseHistory() { return (await q('SELECT * FROM quiz_phase12_release_checks ORDER BY created_at DESC LIMIT 50')).rows; }

module.exports = { recordError, errorEvents, resolveError, backupChecks, recordBackupCheck, releaseChecks, releaseHistory };
