'use strict';

const db = require('./platform-db');
const accountStorage = require('./account-storage');

async function listProfiles({ search = '', status = 'all', limit = 100 } = {}) {
  await accountStorage.ensureReady();
  const term = db.safeText(search, 80);
  const safeStatus = ['active', 'suspended', 'banned'].includes(status) ? status : 'all';
  const safeLimit = Math.max(1, Math.min(300, Number(limit) || 100));
  try {
    const { rows } = await db.pool.query(`
      WITH attempts AS (
        SELECT profile_id,
               COUNT(DISTINCT session_id)::int AS games,
               COUNT(*)::int AS answers,
               COALESCE(SUM(delta),0)::int AS points,
               MAX(answered_at) AS last_played_at
          FROM quiz_solo_attempts
         GROUP BY profile_id
      ), reports AS (
        SELECT target_profile_id AS profile_id,COUNT(*)::int AS reports
          FROM quiz_platform_reports
         WHERE target_profile_id IS NOT NULL
         GROUP BY target_profile_id
      )
      SELECT p.id,p.name,p.email,p.email_verified_at,p.created_at,p.last_login_at,
             p.account_status,p.status_reason,p.status_until,p.session_version,
             COALESCE(pref.leaderboard_visible,TRUE) AS leaderboard_visible,
             COALESCE(a.games,0)::int AS games,
             COALESCE(a.answers,0)::int AS answers,
             COALESCE(a.points,0)::int AS points,
             a.last_played_at,
             COALESCE(r.reports,0)::int AS reports
        FROM quiz_solo_profiles p
        LEFT JOIN quiz_account_preferences pref ON pref.profile_id=p.id
        LEFT JOIN attempts a ON a.profile_id=p.id
        LEFT JOIN reports r ON r.profile_id=p.id
       WHERE ($1::text='' OR p.name ILIKE $2::text OR COALESCE(p.email,'') ILIKE $2::text)
         AND ($3::text='all' OR p.account_status=$3::text)
       ORDER BY COALESCE(a.last_played_at,p.last_login_at,p.created_at) DESC,p.name
       LIMIT $4::int
    `, [term, `%${term}%`, safeStatus, safeLimit]);
    return rows;
  } catch (error) {
    console.error('Admin-Profilliste konnte nicht abgefragt werden:', error.message);
    throw error;
  }
}

module.exports = { listProfiles };
