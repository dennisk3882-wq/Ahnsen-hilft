'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../platform-db');

const ALLOWED_TABLES = new Set([
  'quiz_solo_profiles','quiz_account_preferences','quiz_solo_attempts','quiz_solo_sessions','quiz_platform_friendships','quiz_platform_notifications',
  'quiz_platform_seasons','quiz_phase10_rewards','quiz_phase10_season_points','quiz_phase10_mission_claims','quiz_phase10_duels',
  'quiz_phase10_duel_rounds','quiz_phase10_match_history','quiz_platform_tournaments','quiz_platform_tournament_players',
  'quiz_phase10_tournament_matches','quiz_phase10_league_archive','quiz_phase10_profile_leagues','quiz_phase10_events',
  'quiz_phase10_event_sessions','quiz_phase10_event_entries','quiz_phase10_result_ledger','quiz_phase10_reward_ledger','quiz_external_history_imports',
  'quiz_phase10_manual_adjustments','quiz_phase10_repair_log','quiz_schema_migrations',
]);

function placeholders(count, offset = 0) {
  return Array.from({ length: count }, (_, index) => `$${index + 1 + offset}`).join(',');
}

async function main() {
  const file = process.argv[2];
  const confirmed = process.argv.includes('--confirm=RESTORE');
  if (!file || !confirmed) throw new Error('Aufruf: node scripts/restore-critical-data.js <backup.json> --confirm=RESTORE');
  if (!db.enabled()) throw new Error('DATABASE_URL fehlt.');
  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (payload.format !== 'quiztime-critical-backup-v1') throw new Error('Unbekanntes Backupformat.');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('quiztime-critical-restore'))");
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    for (const [table, rows] of Object.entries(payload.tables || {})) {
      if (!ALLOWED_TABLES.has(table) || !Array.isArray(rows) || !rows.length) continue;
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map(column => row[column]);
        await client.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${placeholders(columns.length)}) ON CONFLICT DO NOTHING`, values);
      }
      console.log(`${table}: ${rows.length} Zeilen geprüft`);
    }
    await client.query('COMMIT');
    console.log('Wiederherstellung abgeschlossen. Bestehende Zeilen wurden nicht überschrieben.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
