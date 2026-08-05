'use strict';

const platformStorage = require('./platform-storage');
const { db, VERSION, safeText, berlinDate, berlinHour, dateDiffDays, mondayFor, q, ensureReady } = require('./phase12-shared');

const ACHIEVEMENTS = Object.freeze({
  'first-game': { title: 'Erster Schritt', text: 'Dein erstes Quiz ist abgeschlossen.' },
  'games-10': { title: 'Quiz-Starter', text: 'Du hast zehn Quizrunden abgeschlossen.' },
  'games-50': { title: 'Quiz-Profi', text: 'Du hast fünfzig Quizrunden abgeschlossen.' },
  'games-100': { title: 'Quiz-Legende', text: 'Du hast einhundert Quizrunden abgeschlossen.' },
  'streak-3': { title: 'Drei Tage dabei', text: 'Du warst an drei Tagen in Folge aktiv.' },
  'streak-7': { title: 'Wochenserie', text: 'Du warst sieben Tage in Folge aktiv.' },
  'correct-100': { title: 'Hundert Treffer', text: 'Du hast einhundert Fragen richtig beantwortet.' },
  'correct-500': { title: 'Wissensmaschine', text: 'Du hast fünfhundert Fragen richtig beantwortet.' },
});
let reminderTimer = null;

async function refreshAchievements(profileId) {
  const { rows } = await q(`SELECT e.current_streak,e.longest_streak,COALESCE(SUM(d.games),0)::int AS games,COALESCE(SUM(d.correct),0)::int AS correct
    FROM quiz_phase13_engagement e LEFT JOIN quiz_phase13_daily_activity d ON d.profile_id=e.profile_id WHERE e.profile_id=$1 GROUP BY e.profile_id`, [profileId]);
  const stats = rows[0] || { games: 0, correct: 0, longest_streak: 0 }; const earned = [];
  if (stats.games >= 1) earned.push('first-game'); if (stats.games >= 10) earned.push('games-10'); if (stats.games >= 50) earned.push('games-50'); if (stats.games >= 100) earned.push('games-100');
  if (stats.longest_streak >= 3) earned.push('streak-3'); if (stats.longest_streak >= 7) earned.push('streak-7'); if (stats.correct >= 100) earned.push('correct-100'); if (stats.correct >= 500) earned.push('correct-500');
  for (const id of earned) await q(`INSERT INTO quiz_phase13_achievements(profile_id,achievement_id,details) VALUES($1,$2,$3::jsonb) ON CONFLICT(profile_id,achievement_id) DO NOTHING`, [profileId, id, JSON.stringify(ACHIEVEMENTS[id])]);
  return earned;
}

async function recordActivity(profileId, values = {}) {
  if (!profileId || !db.enabled()) return null;
  const day = berlinDate(); const activityType = safeText(values.activityType, 60) || 'app';
  const games = Math.max(0, Math.min(10, Number(values.games) || 0)); const answers = Math.max(0, Math.min(100, Number(values.answers) || 0));
  const correct = Math.max(0, Math.min(answers || 100, Number(values.correct) || 0)); const score = Math.max(-1000, Math.min(100000, Number(values.score) || 0));
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN'); await client.query('INSERT INTO quiz_phase13_engagement(profile_id) VALUES($1) ON CONFLICT(profile_id) DO NOTHING', [profileId]);
    const current = (await client.query('SELECT * FROM quiz_phase13_engagement WHERE profile_id=$1 FOR UPDATE', [profileId])).rows[0];
    let streak = Number(current.current_streak || 0);
    if (!current.last_active_day) streak = 1; else { const difference = dateDiffDays(day, String(current.last_active_day).slice(0, 10)); if (difference === 1) streak += 1; else if (difference > 1) streak = 1; }
    await client.query(`UPDATE quiz_phase13_engagement SET current_streak=$2,longest_streak=GREATEST(longest_streak,$2),last_active_day=$3,updated_at=NOW() WHERE profile_id=$1`, [profileId, streak, day]);
    await client.query(`INSERT INTO quiz_phase13_daily_activity(profile_id,activity_day,games,answers,correct,score,activity_types) VALUES($1,$2,$3,$4,$5,$6,jsonb_build_array($7::text))
      ON CONFLICT(profile_id,activity_day) DO UPDATE SET games=quiz_phase13_daily_activity.games+EXCLUDED.games,answers=quiz_phase13_daily_activity.answers+EXCLUDED.answers,
      correct=quiz_phase13_daily_activity.correct+EXCLUDED.correct,score=quiz_phase13_daily_activity.score+EXCLUDED.score,
      activity_types=CASE WHEN quiz_phase13_daily_activity.activity_types ? $7 THEN quiz_phase13_daily_activity.activity_types ELSE quiz_phase13_daily_activity.activity_types||jsonb_build_array($7::text) END,updated_at=NOW()`,
      [profileId, day, games, answers, correct, score, activityType]);
    await client.query(`INSERT INTO quiz_phase13_records(profile_id,record_key,record_value,details) VALUES($1,'best-single-score',$2,$3::jsonb)
      ON CONFLICT(profile_id,record_key) DO UPDATE SET record_value=GREATEST(quiz_phase13_records.record_value,EXCLUDED.record_value),
      details=CASE WHEN EXCLUDED.record_value>quiz_phase13_records.record_value THEN EXCLUDED.details ELSE quiz_phase13_records.details END,
      achieved_at=CASE WHEN EXCLUDED.record_value>quiz_phase13_records.record_value THEN NOW() ELSE quiz_phase13_records.achieved_at END`, [profileId, score, JSON.stringify({ activityType, day })]);
    await client.query('COMMIT'); await refreshAchievements(profileId).catch(() => {}); return { day, streak };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); return null; } finally { client.release(); }
}

async function recommendations(profileId) {
  const { rows } = await q(`SELECT category,COUNT(*)::int AS answers,ROUND(COUNT(*) FILTER(WHERE correct)*100.0/COUNT(*))::int AS accuracy FROM quiz_solo_attempts
    WHERE profile_id=$1 AND answered_at>NOW()-INTERVAL '120 days' GROUP BY category ORDER BY accuracy ASC,answers DESC`, [profileId]);
  if (!rows.length) return [{ type: 'start', title: 'Starte mit einem gemischten Quiz', text: 'Nach einigen Antworten erstellt QuizTime persönliche Kategorieempfehlungen.', href: '/solo' }];
  const weakest = rows.find(row => row.answers >= 5) || rows[0]; const favorite = [...rows].sort((a, b) => b.answers - a.answers)[0];
  return [{ type: 'practice', title: `${weakest.category} trainieren`, text: `Deine aktuelle Trefferquote liegt dort bei ${weakest.accuracy} %.`, href: `/solo?category=${encodeURIComponent(weakest.category)}` },
    { type: 'favorite', title: `Mehr aus ${favorite.category}`, text: 'Diese Kategorie spielst du besonders häufig.', href: `/solo?category=${encodeURIComponent(favorite.category)}` }];
}

async function friendActivity(profileId) {
  try { return (await q(`WITH friends AS (SELECT CASE WHEN profile_low=$1 THEN profile_high ELSE profile_low END AS friend_id FROM quiz_platform_friendships WHERE status='accepted' AND (profile_low=$1 OR profile_high=$1))
    SELECT p.id,p.name,p.avatar_id,MAX(a.answered_at) AS last_active_at,COUNT(DISTINCT a.session_id) FILTER(WHERE a.answered_at>NOW()-INTERVAL '7 days')::int AS games_7d,
    COUNT(*) FILTER(WHERE a.correct AND a.answered_at>NOW()-INTERVAL '7 days')::int AS correct_7d FROM friends f JOIN quiz_solo_profiles p ON p.id=f.friend_id
    LEFT JOIN quiz_solo_attempts a ON a.profile_id=p.id GROUP BY p.id ORDER BY MAX(a.answered_at) DESC NULLS LAST LIMIT 20`, [profileId])).rows; } catch { return []; }
}

async function engagementOverview(profileId) {
  await q('INSERT INTO quiz_phase13_engagement(profile_id) VALUES($1) ON CONFLICT(profile_id) DO NOTHING', [profileId]); await refreshAchievements(profileId).catch(() => {});
  const weekStart = mondayFor(); const [engagement, week, achievements, records, activity, friends, recs] = await Promise.all([
    q('SELECT * FROM quiz_phase13_engagement WHERE profile_id=$1', [profileId]),
    q(`SELECT COALESCE(SUM(games),0)::int AS games,COALESCE(SUM(answers),0)::int AS answers,COALESCE(SUM(correct),0)::int AS correct,COALESCE(SUM(score),0)::int AS score FROM quiz_phase13_daily_activity WHERE profile_id=$1 AND activity_day>=$2`, [profileId, weekStart]),
    q('SELECT * FROM quiz_phase13_achievements WHERE profile_id=$1 ORDER BY earned_at DESC', [profileId]), q('SELECT * FROM quiz_phase13_records WHERE profile_id=$1 ORDER BY achieved_at DESC', [profileId]),
    q(`SELECT * FROM quiz_phase13_daily_activity WHERE profile_id=$1 AND activity_day>=CURRENT_DATE-INTERVAL '30 days' ORDER BY activity_day`, [profileId]), friendActivity(profileId), recommendations(profileId),
  ]);
  const settings = engagement.rows[0]; const weekStats = week.rows[0] || { games: 0, answers: 0, correct: 0, score: 0 };
  return { version: VERSION, streak: { current: Number(settings.current_streak || 0), longest: Number(settings.longest_streak || 0), lastActiveDay: settings.last_active_day || null },
    weeklyGoal: { target: Number(settings.weekly_goal || 5), progress: Number(weekStats.games || 0), complete: Number(weekStats.games || 0) >= Number(settings.weekly_goal || 5), weekStart }, week: weekStats,
    achievements: achievements.rows.map(row => ({ ...row, ...(ACHIEVEMENTS[row.achievement_id] || {}) })), availableAchievements: ACHIEVEMENTS, records: records.rows, activity: activity.rows, friends,
    recommendations: settings.recommendation_opt_in ? recs : [], preferences: { reminderEnabled: Boolean(settings.reminder_enabled), reminderHour: Number(settings.reminder_hour || 18), recommendationOptIn: Boolean(settings.recommendation_opt_in) } };
}

async function updateEngagementPreferences(profileId, values = {}) {
  const weeklyGoal = Math.max(1, Math.min(50, Number(values.weeklyGoal) || 5)); const reminderHour = Math.max(0, Math.min(23, Number(values.reminderHour) || 18));
  return (await q(`INSERT INTO quiz_phase13_engagement(profile_id,weekly_goal,reminder_enabled,reminder_hour,recommendation_opt_in) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(profile_id) DO UPDATE SET weekly_goal=$2,reminder_enabled=$3,reminder_hour=$4,recommendation_opt_in=$5,updated_at=NOW() RETURNING *`,
    [profileId, weeklyGoal, values.reminderEnabled === true, reminderHour, values.recommendationOptIn !== false])).rows[0];
}

async function sendDueReminders() {
  if (!db.enabled()) return 0; await ensureReady(); const hour = berlinHour(); const day = berlinDate();
  const { rows } = await q(`SELECT e.profile_id,p.name FROM quiz_phase13_engagement e JOIN quiz_solo_profiles p ON p.id=e.profile_id
    WHERE e.reminder_enabled AND e.reminder_hour=$1 AND p.account_status='active' AND NOT EXISTS(SELECT 1 FROM quiz_phase13_daily_activity d WHERE d.profile_id=e.profile_id AND d.activity_day=$2)
    AND NOT EXISTS(SELECT 1 FROM quiz_platform_notifications n WHERE n.profile_id=e.profile_id AND n.type='phase13-reminder' AND n.created_at>=CURRENT_DATE) LIMIT 500`, [hour, day]);
  for (const row of rows) await platformStorage.addNotification(row.profile_id, { type: 'phase13-reminder', title: 'Deine QuizTime-Serie wartet', body: `${row.name}, eine kurze Quizrunde reicht, um heute aktiv zu bleiben.`, url: '/progress' }).catch(() => false);
  return rows.length;
}
function startSchedulers() { if (reminderTimer || process.env.NODE_ENV === 'test') return; reminderTimer = setInterval(() => sendDueReminders().catch(() => {}), 3600000); reminderTimer.unref?.(); setTimeout(() => sendDueReminders().catch(() => {}), 30000).unref?.(); }

module.exports = { ACHIEVEMENTS, recordActivity, engagementOverview, updateEngagementPreferences, sendDueReminders, startSchedulers, _test: { berlinDate, mondayFor, dateDiffDays } };
