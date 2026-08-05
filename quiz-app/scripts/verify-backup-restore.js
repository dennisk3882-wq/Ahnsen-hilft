'use strict';

const crypto = require('crypto');
const db = require('../platform-db');
const releaseStorage = require('../phase12-13-storage');
const CRITICAL_TABLES = ['quiz_solo_profiles','quiz_solo_attempts','quiz_account_preferences','quiz_platform_friendships','quiz_platform_match_results','quiz_phase10_season_points','quiz_phase10_event_entries','quiz_phase12_question_reports','quiz_phase13_daily_activity'];

async function main() {
  if (!db.enabled()) throw new Error('DATABASE_URL fehlt.');
  await releaseStorage.ensureReady();
  const schema = `restore_check_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`; const checked = []; const client = await db.pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    for (const table of CRITICAL_TABLES) {
      const exists = await client.query('SELECT to_regclass($1) AS name', [`public.${table}`]); if (!exists.rows[0]?.name) continue;
      await client.query(`CREATE TABLE ${schema}.${table} AS TABLE public.${table} WITH NO DATA`);
      await client.query(`INSERT INTO ${schema}.${table} SELECT * FROM public.${table}`);
      const [source, restored] = await Promise.all([client.query(`SELECT COUNT(*)::int AS count FROM public.${table}`), client.query(`SELECT COUNT(*)::int AS count FROM ${schema}.${table}`)]);
      if (source.rows[0].count !== restored.rows[0].count) throw new Error(`Wiederherstellungsprüfung für ${table} fehlgeschlagen.`);
      checked.push({ table, rows: source.rows[0].count });
    }
    if (!checked.length) throw new Error('Keine kritischen Tabellen für die Wiederherstellungsprüfung gefunden.');
    await releaseStorage.recordBackupCheck('database-copy-restore', 'pass', { checked, schemaDropped: true }); console.log(JSON.stringify({ status: 'pass', checked }, null, 2));
  } catch (error) { await releaseStorage.recordBackupCheck('database-copy-restore', 'fail', { error: error.message, checked }).catch(() => {}); throw error; }
  finally { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {}); client.release(); await db.pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
