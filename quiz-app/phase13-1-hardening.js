'use strict';

const platformDb = require('./platform-db');

const DAILY_ACTIVITY_SQL = `WITH days AS (
    SELECT generated_at::date AS activity_day
      FROM generate_series(
        CURRENT_DATE - ($1::int - 1),
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS series(generated_at)
  ),
  regs AS (
    SELECT created_at::date AS activity_day,COUNT(*)::int AS value
      FROM quiz_solo_profiles
     WHERE created_at>NOW()-($1::int*INTERVAL '1 day')
     GROUP BY created_at::date
  ),
  solo AS (
    SELECT completed_at::date AS activity_day,COUNT(*)::int AS value
      FROM quiz_solo_sessions
     WHERE completed_at>NOW()-($1::int*INTERVAL '1 day')
     GROUP BY completed_at::date
  ),
  online AS (
    SELECT played_at::date AS activity_day,COUNT(DISTINCT COALESCE(room_code,source_id))::int AS value
      FROM quiz_phase10_match_history
     WHERE played_at>NOW()-($1::int*INTERVAL '1 day')
     GROUP BY played_at::date
  ),
  active AS (
    SELECT activity_day,COUNT(DISTINCT profile_id)::int AS value
      FROM (
        SELECT answered_at::date AS activity_day,profile_id
          FROM quiz_solo_attempts
         WHERE answered_at>NOW()-($1::int*INTERVAL '1 day')
        UNION ALL
        SELECT played_at::date AS activity_day,profile_id
          FROM quiz_phase10_match_history
         WHERE played_at>NOW()-($1::int*INTERVAL '1 day')
      ) AS activity_rows
     GROUP BY activity_day
  )
  SELECT d.activity_day AS "day",
         COALESCE(r.value,0) AS registrations,
         COALESCE(s.value,0)+COALESCE(o.value,0) AS games,
         COALESCE(a.value,0) AS active_users
    FROM days d
    LEFT JOIN regs r ON r.activity_day=d.activity_day
    LEFT JOIN solo s ON s.activity_day=d.activity_day
    LEFT JOIN online o ON o.activity_day=d.activity_day
    LEFT JOIN active a ON a.activity_day=d.activity_day
   ORDER BY d.activity_day`;

const DAILY_ERRORS_SQL = `WITH daily_errors AS (
    SELECT date_trunc('day',created_at)::date AS error_day,COUNT(*)::int AS errors
      FROM quiz_platform_metrics
     WHERE created_at>NOW()-($1::int*INTERVAL '1 day')
       AND (status_code>=400 OR event_type='client_error')
     GROUP BY date_trunc('day',created_at)::date
  )
  SELECT error_day AS "day",errors
    FROM daily_errors
   ORDER BY error_day`;

let storagePatched = false;
let databaseGuardInstalled = false;

function installStrictDatabaseGuard(database) {
  if (databaseGuardInstalled || !database?.databaseEnabled || typeof database.initDatabase !== 'function') return false;
  databaseGuardInstalled = true;
  const originalInitDatabase = database.initDatabase;
  database.initDatabase = async (...args) => {
    try {
      return await originalInitDatabase(...args);
    } catch (error) {
      console.error('QuizTime 13.1: Die konfigurierte PostgreSQL-Datenbank konnte beim Start nicht initialisiert werden.', error);
      process.exit(1);
    }
  };
  return true;
}

function createAnalytics(phase11Storage) {
  const query = async (text, params = []) => {
    await phase11Storage.ensureReady();
    return platformDb.query(text, params);
  };
  const safe = async (label, text, params = [], fallback = []) => {
    try {
      return (await query(text, params)).rows;
    } catch (error) {
      console.error(`QuizTime 13.1: Analytics-Abfrage ${label} fehlgeschlagen:`, error.message);
      return fallback;
    }
  };

  return async function analytics(days = 30) {
    const range = Math.max(1, Math.min(365, Number(days) || 30));
    const [overview, daily, categories, hardest, events, duration, errors, browsers, flags] = await Promise.all([
      safe('overview', `SELECT
        COUNT(*)::int profiles,
        COUNT(*) FILTER(WHERE created_at>NOW()-($1::int*INTERVAL '1 day'))::int new_profiles,
        COUNT(*) FILTER(WHERE email_verified_at IS NOT NULL)::int verified_profiles,
        COUNT(*) FILTER(WHERE last_login_at>NOW()-INTERVAL '24 hours')::int active_today
        FROM quiz_solo_profiles`, [range], [{}]),
      safe('daily', DAILY_ACTIVITY_SQL, [range]),
      safe('categories', `SELECT category,COUNT(*)::int answers,COUNT(*) FILTER(WHERE correct)::int correct,
        ROUND(100.0*COUNT(*) FILTER(WHERE correct)/NULLIF(COUNT(*),0),1) accuracy
        FROM quiz_solo_attempts WHERE answered_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY category ORDER BY answers DESC LIMIT 20`, [range]),
      safe('hardest', `SELECT question_id,MAX(question_text) question_text,MAX(category) category,COUNT(*)::int answers,
        COUNT(*) FILTER(WHERE correct)::int correct,ROUND(100.0*COUNT(*) FILTER(WHERE correct)/NULLIF(COUNT(*),0),1) accuracy
        FROM quiz_solo_attempts WHERE answered_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY question_id HAVING COUNT(*)>=3
        ORDER BY accuracy ASC,answers DESC LIMIT 30`, [range]),
      safe('events', `SELECT e.id,e.title,e.quiz_type,e.starts_at,e.ends_at,COUNT(ee.profile_id)::int participants,
        COALESCE(SUM(ee.attempts),0)::int attempts,COALESCE(ROUND(AVG(ee.best_score),1),0) average_score
        FROM quiz_phase10_events e LEFT JOIN quiz_phase10_event_entries ee ON ee.event_id=e.id
        WHERE e.starts_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY e.id ORDER BY e.starts_at DESC LIMIT 30`, [range]),
      safe('duration', `SELECT COUNT(*)::int started,COUNT(*) FILTER(WHERE completed_at IS NOT NULL)::int completed,
        COUNT(*) FILTER(WHERE completed_at IS NULL AND created_at<NOW()-INTERVAL '2 hours')::int abandoned,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (completed_at-created_at))/60) FILTER(WHERE completed_at IS NOT NULL),1),0) average_minutes
        FROM quiz_solo_sessions WHERE created_at>NOW()-($1::int*INTERVAL '1 day')`, [range], [{}]),
      safe('errors', DAILY_ERRORS_SQL, [range]),
      safe('devices', `SELECT COALESCE(details->>'browser','Unbekannt') browser,COALESCE(details->>'device','Unbekannt') device,COUNT(*)::int events
        FROM quiz_phase11_risk_flags WHERE last_seen_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY 1,2 ORDER BY events DESC`, [range]),
      safe('risk', `SELECT severity,COUNT(*)::int total FROM quiz_phase11_risk_flags WHERE status IN ('open','reviewing') GROUP BY severity`),
    ]);
    const started = Number(duration[0]?.started || 0);
    const completed = Number(duration[0]?.completed || 0);
    return {
      rangeDays: range,
      overview: {
        ...overview[0],
        completionRate: started ? Math.round(completed / started * 100) : 0,
        abandonmentRate: started ? Math.round(Number(duration[0]?.abandoned || 0) / started * 100) : 0,
        averageSessionMinutes: Number(duration[0]?.average_minutes || 0),
      },
      daily,
      categories,
      hardestQuestions: hardest,
      events,
      errors,
      devices: browsers,
      risk: flags,
    };
  };
}

function installStoragePatches() {
  if (storagePatched) return false;
  const phase11Storage = require('./phase11-storage');
  const hardenedAnalytics = createAnalytics(phase11Storage);
  phase11Storage.analytics = hardenedAnalytics;
  phase11Storage.snapshotAnalytics = async () => {
    const value = await hardenedAnalytics(30);
    await phase11Storage.ensureReady();
    await platformDb.query(`
      INSERT INTO quiz_phase11_daily_snapshots(snapshot_day,metrics)
      VALUES(CURRENT_DATE,$1::jsonb)
      ON CONFLICT(snapshot_day) DO UPDATE SET metrics=EXCLUDED.metrics,updated_at=NOW()
    `, [JSON.stringify(value)]);
    return value;
  };
  storagePatched = true;
  return true;
}

module.exports = {
  installStrictDatabaseGuard,
  installStoragePatches,
  _test: { DAILY_ACTIVITY_SQL, DAILY_ERRORS_SQL, createAnalytics },
};
