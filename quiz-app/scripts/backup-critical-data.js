'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../platform-db');

const TABLES = [
  'quiz_solo_profiles',
  'quiz_account_preferences',
  'quiz_solo_attempts',
  'quiz_solo_sessions',
  'quiz_platform_friendships',
  'quiz_platform_notifications',
  'quiz_platform_seasons',
  'quiz_phase10_rewards',
  'quiz_phase10_season_points',
  'quiz_phase10_mission_claims',
  'quiz_phase10_duels',
  'quiz_phase10_duel_rounds',
  'quiz_phase10_match_history',
  'quiz_platform_tournaments',
  'quiz_platform_tournament_players',
  'quiz_phase10_tournament_matches',
  'quiz_phase10_league_archive',
  'quiz_phase10_profile_leagues',
  'quiz_phase10_events',
  'quiz_phase10_event_sessions',
  'quiz_phase10_event_entries',
  'quiz_phase10_result_ledger',
  'quiz_phase10_reward_ledger',
  'quiz_external_history_imports',
  'quiz_phase10_manual_adjustments',
  'quiz_phase10_repair_log',
  'quiz_schema_migrations',
];

async function main() {
  if (!db.enabled()) throw new Error('DATABASE_URL fehlt.');
  const outputDirectory = path.resolve(process.argv[2] || path.join(__dirname, '..', 'backups'));
  fs.mkdirSync(outputDirectory, { recursive: true });
  const payload = {
    format: 'quiztime-critical-backup-v1',
    createdAt: new Date().toISOString(),
    tables: {},
  };
  for (const table of TABLES) {
    const exists = await db.query('SELECT to_regclass($1) name', [`public.${table}`]);
    if (!exists.rows[0]?.name) continue;
    const { rows } = await db.query(`SELECT * FROM ${table}`);
    payload.tables[table] = rows;
    console.log(`${table}: ${rows.length} Zeilen`);
  }
  const filename = `quiztime-backup-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`;
  const output = path.join(outputDirectory, filename);
  fs.writeFileSync(output, JSON.stringify(payload, null, 2), { mode: 0o600 });
  console.log(`Backup geschrieben: ${output}`);
  await db.pool.end();
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
