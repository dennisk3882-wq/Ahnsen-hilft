'use strict';

const db = require('./platform-db');
const phase10 = require('./phase10-storage');
const gameStorage = require('./platform-game-storage');
const onlineStorage = require('./online-room-storage');
const accountStorage = require('./account-storage');
const profileStore = require('./extended-storage');
const platformStorage = require('./platform-storage');
const { runMigrations } = require('./migration-runner');
const catalogService = require('./question-catalog-service');

const INTERNAL_SECRET = String(process.env.PLATFORM_INTERNAL_SECRET || process.env.ADMIN_PASSWORD || process.env.EVENT_PASSWORD || 'quiztime-internal');
const BERLIN_ZONE = 'Europe/Berlin';
const profileBindings = new Map();
let storagePatched = false;
let phase10Patched = false;
let schedulerStarted = false;

const LEAGUES = Object.freeze({
  bronze: { id: 'bronze', name: 'Bronze-Liga', icon: '🥉', floor: 0, next: 500 },
  silver: { id: 'silver', name: 'Silber-Liga', icon: '🥈', floor: 500, next: 1200 },
  gold: { id: 'gold', name: 'Gold-Liga', icon: '🥇', floor: 1200, next: 2500 },
  master: { id: 'master', name: 'Meister-Liga', icon: '👑', floor: 2500, next: null },
});
const LEAGUE_ORDER = ['bronze', 'silver', 'gold', 'master'];

function safeText(value, max = 160) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function leagueInfo(id) {
  return LEAGUES[id] || LEAGUES.bronze;
}

function nextLeague(id, direction) {
  const index = Math.max(0, LEAGUE_ORDER.indexOf(id));
  if (direction === 'promotion') return LEAGUE_ORDER[Math.min(LEAGUE_ORDER.length - 1, index + 1)];
  if (direction === 'relegation') return LEAGUE_ORDER[Math.max(0, index - 1)];
  return LEAGUE_ORDER[index];
}

function berlinParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function berlinDayKey(date = new Date()) {
  const parts = berlinParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function berlinIsoWeekKey(date = new Date()) {
  const parts = berlinParts(date);
  const value = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function periodBounds(date = new Date()) {
  const { rows } = await db.query(`
    SELECT
      (date_trunc('day', timezone($2, $1::timestamptz)) AT TIME ZONE $2) AS day_start,
      ((date_trunc('day', timezone($2, $1::timestamptz)) + INTERVAL '1 day') AT TIME ZONE $2) AS day_end,
      (date_trunc('week', timezone($2, $1::timestamptz)) AT TIME ZONE $2) AS week_start,
      ((date_trunc('week', timezone($2, $1::timestamptz)) + INTERVAL '7 days') AT TIME ZONE $2) AS week_end
  `, [date, BERLIN_ZONE]);
  return rows[0];
}

async function ensureActiveSeasonTx(client, reference = new Date()) {
  let result = await client.query(`
    SELECT * FROM quiz_platform_seasons
     WHERE active AND starts_at <= $1 AND ends_at > $1
     ORDER BY starts_at DESC LIMIT 1
  `, [reference]);
  if (result.rows[0]) return result.rows[0];

  await client.query("SELECT pg_advisory_xact_lock(hashtext('quiztime-active-season'))");
  result = await client.query(`
    SELECT * FROM quiz_platform_seasons
     WHERE active AND starts_at <= $1 AND ends_at > $1
     ORDER BY starts_at DESC LIMIT 1
  `, [reference]);
  if (result.rows[0]) return result.rows[0];

  const stale = await client.query(`
    SELECT id,ends_at FROM quiz_platform_seasons
     WHERE active AND ends_at <= $1
     ORDER BY starts_at ASC LIMIT 1
  `, [reference]);
  if (stale.rows[0]) {
    const error = new Error('Die abgelaufene Saison wird gerade abgeschlossen. Bitte die Anfrage erneut senden.');
    error.code = 'SEASON_SETTLEMENT_REQUIRED';
    throw error;
  }

  const now = new Date(reference);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const name = `Saison ${start.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
  const id = db.crypto.randomUUID();
  result = await client.query(`
    INSERT INTO quiz_platform_seasons(id,name,starts_at,ends_at,active)
    VALUES($1,$2,$3,$4,TRUE) RETURNING *
  `, [id, name, start, end]);
  return result.rows[0];
}

async function prepareCurrentSeason() {
  if (!db.enabled()) return null;
  let settled = null;
  while ((settled = await stableSettleSeason({ automatic: true, skipPrepare: true }))) { /* versäumte Monatswechsel nachholen */ }
  return settled;
}

async function applyRewardTx(client, {
  rewardKey,
  profileId,
  rewardType,
  xp = 0,
  seasonPoints = 0,
  badgeId = null,
  reason = null,
  metadata = {},
}) {
  const inserted = await client.query(`
    INSERT INTO quiz_phase10_reward_ledger(reward_key,profile_id,reward_type,xp,season_points,badge_id,reason,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    ON CONFLICT DO NOTHING RETURNING reward_key
  `, [rewardKey, profileId, rewardType, Math.round(Number(xp) || 0), Math.round(Number(seasonPoints) || 0), badgeId, safeText(reason, 300) || null, JSON.stringify(metadata || {})]);
  if (!inserted.rowCount) return false;

  const badgeList = badgeId ? [badgeId] : [];
  await client.query(`
    INSERT INTO quiz_phase10_rewards(profile_id,bonus_xp,badges)
    VALUES($1,$2,$3::jsonb)
    ON CONFLICT(profile_id) DO UPDATE SET
      bonus_xp=quiz_phase10_rewards.bonus_xp+EXCLUDED.bonus_xp,
      badges=(SELECT COALESCE(jsonb_agg(DISTINCT value),'[]'::jsonb)
                FROM jsonb_array_elements(quiz_phase10_rewards.badges||EXCLUDED.badges)),
      updated_at=NOW()
  `, [profileId, Math.max(0, Math.round(Number(xp) || 0)), JSON.stringify(badgeList)]);

  const points = Math.round(Number(seasonPoints) || 0);
  if (points !== 0) {
    const season = await ensureActiveSeasonTx(client);
    await client.query(`
      INSERT INTO quiz_phase10_season_points(season_id,profile_id,points,wins,losses,games)
      VALUES($1,$2,$3,0,0,0)
      ON CONFLICT(season_id,profile_id) DO UPDATE SET
        points=quiz_phase10_season_points.points+EXCLUDED.points,
        updated_at=NOW()
    `, [season.id, profileId, points]);
  }
  return true;
}

async function missionMetrics(profileId, start, end) {
  const { rows } = await db.query(`
    WITH solo AS (
      SELECT COUNT(DISTINCT session_id)::int games,
             COUNT(*)::int answers,
             COUNT(*) FILTER(WHERE correct)::int correct
        FROM quiz_solo_attempts
       WHERE profile_id=$1 AND answered_at >= $2 AND answered_at < $3
    ), matches AS (
      SELECT COUNT(DISTINCT room_code)::int games,
             COUNT(*) FILTER(WHERE result='win' AND source_type='duel')::int duel_wins
        FROM quiz_phase10_match_history
       WHERE profile_id=$1 AND played_at >= $2 AND played_at < $3
         AND source_type IN ('online','duel','tournament')
    ), weekly AS (
      SELECT COUNT(*)::int completed
        FROM quiz_phase10_event_entries ee
        JOIN quiz_phase10_events e ON e.id=ee.event_id
       WHERE ee.profile_id=$1 AND ee.completed_at >= $2 AND ee.completed_at < $3
         AND e.event_type='weekly'
    )
    SELECT COALESCE(s.games,0)+COALESCE(m.games,0) games,
           COALESCE(s.answers,0) answers,
           COALESCE(s.correct,0) correct,
           COALESCE(m.games,0) online_games,
           COALESCE(m.duel_wins,0) duel_wins,
           CASE WHEN COALESCE(w.completed,0)>0 THEN 1 ELSE 0 END weekly_quiz
      FROM solo s CROSS JOIN matches m CROSS JOIN weekly w
  `, [profileId, start, end]);
  const row = rows[0] || {};
  return {
    games: Number(row.games || 0),
    answers: Number(row.answers || 0),
    correct: Number(row.correct || 0),
    onlineGames: Number(row.online_games || 0),
    duelWins: Number(row.duel_wins || 0),
    weeklyQuiz: Number(row.weekly_quiz || 0),
  };
}

async function stableMissions(profileId, date = new Date()) {
  await phase10.ensureReady();
  const bounds = await periodBounds(date);
  const [dailyMetrics, weeklyMetrics, claims] = await Promise.all([
    missionMetrics(profileId, bounds.day_start, bounds.day_end),
    missionMetrics(profileId, bounds.week_start, bounds.week_end),
    db.query(`
      SELECT mission_key,period_key,claimed_at
        FROM quiz_phase10_mission_claims
       WHERE profile_id=$1 AND period_key IN ($2,$3)
    `, [profileId, berlinDayKey(date), berlinIsoWeekKey(date)]),
  ]);
  const claimed = new Set(claims.rows.map(row => `${row.mission_key}:${row.period_key}`));
  const map = (mission, period, metrics) => {
    const progress = Math.min(mission.target, Number(metrics[mission.metric] || 0));
    return { ...mission, period, progress, completed: progress >= mission.target, claimed: claimed.has(`${mission.key}:${period}`) };
  };
  return {
    dayKey: berlinDayKey(date),
    weekKey: berlinIsoWeekKey(date),
    daily: phase10.DAILY_MISSIONS.map(item => map(item, berlinDayKey(date), dailyMetrics)),
    weekly: phase10.WEEKLY_MISSIONS.map(item => map(item, berlinIsoWeekKey(date), weeklyMetrics)),
  };
}

async function stableClaimMission(profileId, missionKey, date = new Date()) {
  await prepareCurrentSeason();
  const current = await stableMissions(profileId, date);
  const mission = [...current.daily, ...current.weekly].find(item => item.key === missionKey);
  if (!mission) throw new Error('Mission wurde nicht gefunden.');
  if (!mission.completed) throw new Error('Diese Mission ist noch nicht abgeschlossen.');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mission:${profileId}:${mission.key}:${mission.period}`]);
    const claim = await client.query(`
      INSERT INTO quiz_phase10_mission_claims(profile_id,mission_key,period_key,progress,reward_xp,reward_season_points)
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT DO NOTHING RETURNING *
    `, [profileId, mission.key, mission.period, mission.progress, mission.xp, mission.seasonPoints]);
    if (!claim.rowCount) throw new Error('Diese Belohnung wurde bereits abgeholt.');
    await applyRewardTx(client, {
      rewardKey: `mission:${mission.key}:${mission.period}`,
      profileId,
      rewardType: 'mission',
      xp: mission.xp,
      seasonPoints: mission.seasonPoints,
      badgeId: mission.badge || null,
      reason: mission.title,
      metadata: { progress: mission.progress, target: mission.target },
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { mission: { ...mission, claimed: true }, rewards: await phase10.profileRewards(profileId) };
}

async function stableListEvents(profileId) {
  await phase10.ensureReady();
  const { rows } = await db.query(`
    SELECT e.*,
           COALESCE(ee.best_score,0)::int best_score,
           COALESCE(ee.best_correct,0)::int best_correct,
           (SELECT COUNT(*)::int FROM quiz_phase10_event_sessions sa WHERE sa.event_id=e.id AND sa.profile_id=$1) attempts,
           ee.completed_at,ee.reward_claimed,
           (SELECT COUNT(*)::int FROM quiz_phase10_event_entries x WHERE x.event_id=e.id AND x.completed_at IS NOT NULL) participants,
           (SELECT COALESCE(SUM(best_correct),0)::int FROM quiz_phase10_event_entries x WHERE x.event_id=e.id) community_progress,
           CASE WHEN e.starts_at>NOW() THEN 'upcoming' WHEN e.ends_at<=NOW() THEN 'ended' ELSE 'active' END availability,
           GREATEST(0,EXTRACT(EPOCH FROM (e.starts_at-NOW()))::int) starts_in_seconds,
           GREATEST(1,COALESCE((e.settings->>'maxAttempts')::int,5)) max_attempts,
           (SELECT s.id FROM quiz_phase10_event_sessions s
             WHERE s.event_id=e.id AND s.profile_id=$1 AND s.completed_at IS NULL
               AND s.abandoned_at IS NULL AND s.expires_at>NOW()
             ORDER BY s.started_at DESC LIMIT 1) open_session_id
      FROM quiz_phase10_events e
      LEFT JOIN quiz_phase10_event_entries ee ON ee.event_id=e.id AND ee.profile_id=$1
     WHERE e.active AND e.ends_at>NOW()
     ORDER BY (e.settings->>'featured')::boolean DESC,e.starts_at
  `, [profileId]);
  return rows;
}

async function stableCreateEventSession(profileId, eventId, questionIds) {
  await phase10.ensureReady();
  await prepareCurrentSeason();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`event-attempt:${eventId}:${profileId}`]);
    const eventResult = await client.query(`
      SELECT * FROM quiz_phase10_events
       WHERE id=$1 AND active AND starts_at<=NOW() AND ends_at>NOW()
       FOR UPDATE
    `, [eventId]);
    const event = eventResult.rows[0];
    if (!event) throw new Error('Dieses Event ist aktuell nicht verfügbar.');

    const open = await client.query(`
      SELECT * FROM quiz_phase10_event_sessions
       WHERE event_id=$1 AND profile_id=$2 AND completed_at IS NULL AND abandoned_at IS NULL AND expires_at>NOW()
       ORDER BY started_at DESC LIMIT 1 FOR UPDATE
    `, [eventId, profileId]);
    if (open.rows[0]) {
      await client.query('COMMIT');
      return { event, session: open.rows[0], resumed: true };
    }

    const attemptsResult = await client.query(`
      SELECT COUNT(*)::int attempts FROM quiz_phase10_event_sessions
       WHERE event_id=$1 AND profile_id=$2
    `, [eventId, profileId]);
    const attempts = Number(attemptsResult.rows[0]?.attempts || 0);
    const maxAttempts = Math.max(1, Number(event.settings?.maxAttempts || 5));
    if (attempts >= maxAttempts) throw new Error('Du hast die maximale Zahl an Versuchen für dieses Event erreicht.');

    const id = db.crypto.randomUUID();
    const sessionResult = await client.query(`
      INSERT INTO quiz_phase10_event_sessions(id,event_id,profile_id,question_ids,attempt_no)
      VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *
    `, [id, eventId, profileId, JSON.stringify(questionIds), attempts + 1]);
    await client.query('COMMIT');
    return { event, session: sessionResult.rows[0], resumed: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function stableUpdateEventSession(id, profileId, patch) {
  await phase10.ensureReady();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(`
      SELECT * FROM quiz_phase10_event_sessions
       WHERE id=$1 AND profile_id=$2 AND expires_at>NOW()
       FOR UPDATE
    `, [id, profileId]);
    const current = currentResult.rows[0];
    if (!current) throw new Error('Event-Sitzung wurde nicht gefunden.');
    if (current.completed_at) {
      await client.query('COMMIT');
      return current;
    }

    const completed = Boolean(patch.completed);
    const updatedResult = await client.query(`
      UPDATE quiz_phase10_event_sessions SET
        current_index=$3,score=$4,correct=$5,wrong=$6,answered=$7,result=$8::jsonb,
        completed_at=CASE WHEN $9 THEN COALESCE(completed_at,NOW()) ELSE completed_at END,
        completion_recorded_at=CASE WHEN $9 THEN COALESCE(completion_recorded_at,NOW()) ELSE completion_recorded_at END
      WHERE id=$1 AND profile_id=$2 RETURNING *
    `, [id, profileId, patch.currentIndex, patch.score, patch.correct, patch.wrong, Boolean(patch.answered), JSON.stringify(patch.result || null), completed]);
    const updated = updatedResult.rows[0];

    if (completed) {
      const attempts = await client.query(`
        SELECT COUNT(*)::int count FROM quiz_phase10_event_sessions
         WHERE event_id=$1 AND profile_id=$2
      `, [updated.event_id, profileId]);
      await client.query(`
        INSERT INTO quiz_phase10_event_entries(event_id,profile_id,best_score,best_correct,attempts,completed_at)
        VALUES($1,$2,$3,$4,$5,NOW())
        ON CONFLICT(event_id,profile_id) DO UPDATE SET
          best_score=GREATEST(quiz_phase10_event_entries.best_score,EXCLUDED.best_score),
          best_correct=GREATEST(quiz_phase10_event_entries.best_correct,EXCLUDED.best_correct),
          attempts=GREATEST(quiz_phase10_event_entries.attempts,EXCLUDED.attempts),
          completed_at=NOW()
      `, [updated.event_id, profileId, updated.score, updated.correct, Number(attempts.rows[0]?.count || 1)]);
    }
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function stableClaimEventReward(profileId, eventId) {
  await phase10.ensureReady();
  await prepareCurrentSeason();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`event-reward:${eventId}:${profileId}`]);
    const entryResult = await client.query(`
      SELECT ee.*,e.reward_xp,e.reward_season_points,e.badge_id,e.title
        FROM quiz_phase10_event_entries ee
        JOIN quiz_phase10_events e ON e.id=ee.event_id
       WHERE ee.event_id=$1 AND ee.profile_id=$2 AND ee.completed_at IS NOT NULL
       FOR UPDATE OF ee
    `, [eventId, profileId]);
    const entry = entryResult.rows[0];
    if (!entry || entry.reward_claimed) throw new Error('Belohnung nicht verfügbar oder bereits abgeholt.');
    await applyRewardTx(client, {
      rewardKey: `event:${eventId}`,
      profileId,
      rewardType: 'event',
      xp: entry.reward_xp,
      seasonPoints: entry.reward_season_points,
      badgeId: entry.badge_id || null,
      reason: entry.title,
      metadata: { bestScore: entry.best_score, bestCorrect: entry.best_correct },
    });
    const updated = await client.query(`
      UPDATE quiz_phase10_event_entries SET reward_claimed=TRUE
       WHERE event_id=$1 AND profile_id=$2 RETURNING *
    `, [eventId, profileId]);
    await client.query('COMMIT');
    return { entry: updated.rows[0], rewardCommitted: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function seedLeagueAssignmentsTx(client, seasonId) {
  await client.query(`
    INSERT INTO quiz_phase10_profile_leagues(profile_id,season_id,league_id,last_outcome)
    SELECT id,$1,'bronze','new' FROM quiz_solo_profiles
    ON CONFLICT(profile_id) DO UPDATE SET season_id=$1,updated_at=NOW()
  `, [seasonId]);
}

async function leagueRowsTx(client, season, profileId = null, includePrivate = false) {
  await seedLeagueAssignmentsTx(client, season.id);
  const { rows } = await client.query(`
    WITH solo AS (
      SELECT profile_id,(COUNT(DISTINCT session_id)*20+COUNT(*) FILTER(WHERE correct)*5+GREATEST(COALESCE(SUM(delta),0),0))::int points
        FROM quiz_solo_attempts WHERE answered_at BETWEEN $1 AND $2 GROUP BY profile_id
    ), extra AS (
      SELECT profile_id,points,wins,losses,games FROM quiz_phase10_season_points WHERE season_id=$3
    )
    SELECT p.id,p.name,p.avatar_id,l.league_id,l.previous_league_id,l.last_outcome,
           (COALESCE(s.points,0)+COALESCE(e.points,0))::int points,
           COALESCE(e.wins,0)::int wins,COALESCE(e.losses,0)::int losses,
           COALESCE(e.games,0)::int online_games
      FROM quiz_solo_profiles p
      JOIN quiz_phase10_profile_leagues l ON l.profile_id=p.id
      LEFT JOIN quiz_account_preferences pref ON pref.profile_id=p.id
      LEFT JOIN solo s ON s.profile_id=p.id
      LEFT JOIN extra e ON e.profile_id=p.id
     WHERE p.email_verified_at IS NOT NULL
       AND ($4::boolean OR COALESCE(pref.leaderboard_visible,TRUE) OR p.id=$5)
     ORDER BY l.league_id,points DESC,p.name
  `, [season.starts_at, season.ends_at, season.id, includePrivate, profileId]);
  return rows;
}

function buildLeagueBoard(season, rows, profileId = null, limit = 200) {
  const buckets = { master: [], gold: [], silver: [], bronze: [] };
  for (const row of rows) {
    const league = leagueInfo(row.league_id);
    buckets[league.id].push({ ...row, league });
  }
  for (const entries of Object.values(buckets)) {
    entries.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'de'));
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
      const promotionCount = Math.max(1, Math.ceil(entries.length * 0.15));
      const relegationStart = Math.floor(entries.length * 0.85);
      entry.outcome = index < promotionCount && entry.league.id !== 'master'
        ? 'promotion'
        : index >= relegationStart && entries.length >= 5 && entry.league.id !== 'bronze'
          ? 'relegation'
          : 'stay';
    });
  }
  const full = ['master', 'gold', 'silver', 'bronze'].flatMap(id => buckets[id]);
  const max = Math.max(10, Math.min(10000, Number(limit) || 200));
  const visible = full.slice(0, max);
  const me = full.find(entry => entry.id === profileId) || null;
  if (me && !visible.some(entry => entry.id === me.id)) visible.push(me);
  return { season, leaderboard: visible, me, leagues: buckets, totalPlayers: full.length };
}

async function stableLeagueBoard(profileId, limit = 200) {
  await phase10.ensureReady();
  await prepareCurrentSeason();
  const client = await db.pool.connect();
  try {
    const season = await ensureActiveSeasonTx(client);
    const rows = await leagueRowsTx(client, season, profileId, false);
    return buildLeagueBoard(season, rows, profileId, limit);
  } finally {
    client.release();
  }
}

async function seasonSettlementPreview() {
  await phase10.ensureReady();
  const client = await db.pool.connect();
  try {
    const seasonResult = await client.query(`
      SELECT * FROM quiz_platform_seasons WHERE active ORDER BY starts_at ASC LIMIT 1
    `);
    const season = seasonResult.rows[0];
    if (!season) return null;
    const rows = await leagueRowsTx(client, season, null, true);
    return buildLeagueBoard(season, rows, null, 10000);
  } finally {
    client.release();
  }
}

async function stableSettleSeason(options = {}) {
  await phase10.ensureReady();
  const automatic = Boolean(options.automatic);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('quiztime-season-settlement'))");
    const seasonResult = await client.query(`
      SELECT * FROM quiz_platform_seasons
       WHERE active ${automatic ? 'AND ends_at<=NOW()' : ''}
       ORDER BY starts_at ASC LIMIT 1 FOR UPDATE
    `);
    const season = seasonResult.rows[0];
    if (!season) {
      await client.query('COMMIT');
      return null;
    }
    if (!automatic && new Date(season.ends_at).getTime() > Date.now()) {
      throw new Error('Die laufende Saison kann erst nach ihrem regulären Enddatum abgeschlossen werden.');
    }

    const rows = await leagueRowsTx(client, season, null, true);
    const board = buildLeagueBoard(season, rows, null, 10000);
    for (const [leagueId, entries] of Object.entries(board.leagues)) {
      for (const entry of entries) {
        await client.query(`
          INSERT INTO quiz_phase10_league_archive(season_id,profile_id,league_id,rank,points,outcome)
          VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(season_id,profile_id) DO UPDATE SET
            league_id=EXCLUDED.league_id,rank=EXCLUDED.rank,points=EXCLUDED.points,outcome=EXCLUDED.outcome
        `, [season.id, entry.id, leagueId, entry.rank, entry.points, entry.outcome]);
        const newLeague = nextLeague(leagueId, entry.outcome);
        await client.query(`
          UPDATE quiz_phase10_profile_leagues SET
            previous_league_id=league_id,league_id=$2,last_outcome=$3,updated_at=NOW()
           WHERE profile_id=$1
        `, [entry.id, newLeague, entry.outcome]);
        if (entry.rank <= 3) {
          const xp = entry.rank === 1 ? 600 : entry.rank === 2 ? 400 : 250;
          await applyRewardTx(client, {
            rewardKey: `season:${season.id}:${leagueId}:${entry.rank}`,
            profileId: entry.id,
            rewardType: 'season',
            xp,
            seasonPoints: 0,
            badgeId: entry.rank === 1 ? `season-${season.id}-${leagueId}-champion` : null,
            reason: `${leagueInfo(leagueId).name} · Platz ${entry.rank}`,
          });
        }
      }
    }

    await client.query('UPDATE quiz_platform_seasons SET active=FALSE WHERE id=$1', [season.id]);
    const nextStart = new Date(season.ends_at);
    const nextEnd = new Date(Date.UTC(nextStart.getUTCFullYear(), nextStart.getUTCMonth() + 1, 1));
    const nextName = `Saison ${nextStart.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
    let nextSeason = await client.query(`
      SELECT * FROM quiz_platform_seasons
       WHERE starts_at=$1 AND ends_at=$2
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE
    `, [nextStart, nextEnd]);
    if (nextSeason.rows[0]) {
      nextSeason = await client.query('UPDATE quiz_platform_seasons SET active=TRUE WHERE id=$1 RETURNING *', [nextSeason.rows[0].id]);
    } else {
      nextSeason = await client.query(`
        INSERT INTO quiz_platform_seasons(id,name,starts_at,ends_at,active)
        VALUES($1,$2,$3,$4,TRUE) RETURNING *
      `, [db.crypto.randomUUID(), nextName, nextStart, nextEnd]);
    }
    await client.query('UPDATE quiz_phase10_profile_leagues SET season_id=$1,updated_at=NOW()', [nextSeason.rows[0].id]);
    await client.query('COMMIT');
    return nextSeason.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function resultForPlayer(room, player, allPlayers) {
  if (room.gameMode === 'teams') {
    const teams = new Map();
    for (const item of allPlayers) {
      const key = item.team || item.id;
      const current = teams.get(key) || { score: 0, correct: 0 };
      current.score += Number(item.score || 0);
      current.correct += Number(item.correct || 0);
      teams.set(key, current);
    }
    const mine = teams.get(player.team || player.id) || { score: 0, correct: 0 };
    const bestScore = Math.max(...[...teams.values()].map(value => value.score));
    const scoreWinners = [...teams.entries()].filter(([, value]) => value.score === bestScore);
    if (scoreWinners.length === 1) return scoreWinners[0][0] === (player.team || player.id) ? 'win' : 'loss';
    const bestCorrect = Math.max(...scoreWinners.map(([, value]) => value.correct));
    const correctWinners = scoreWinners.filter(([, value]) => value.correct === bestCorrect);
    if (correctWinners.length === 1) return correctWinners[0][0] === (player.team || player.id) ? 'win' : 'loss';
    return 'draw';
  }
  const bestScore = Math.max(...allPlayers.map(item => Number(item.score || 0)));
  const scoreWinners = allPlayers.filter(item => Number(item.score || 0) === bestScore);
  if (scoreWinners.length === 1) return scoreWinners[0].id === player.id ? 'win' : 'loss';
  const bestCorrect = Math.max(...scoreWinners.map(item => Number(item.correct || 0)));
  const correctWinners = scoreWinners.filter(item => Number(item.correct || 0) === bestCorrect);
  if (correctWinners.length === 1) return correctWinners[0].id === player.id ? 'win' : 'loss';
  return 'draw';
}

async function completeDuelTx(client, room, allPlayers) {
  if (!room.duelId) return;
  const duelResult = await client.query('SELECT * FROM quiz_phase10_duels WHERE id=$1 FOR UPDATE', [room.duelId]);
  const duel = duelResult.rows[0];
  if (!duel || duel.status !== 'active') return;
  const challenger = allPlayers.find(item => item.profileId === duel.challenger_id);
  const opponent = allPlayers.find(item => item.profileId === duel.opponent_id);
  if (!challenger || !opponent) return;
  const challengerResult = resultForPlayer(room, challenger, [challenger, opponent]);
  const winnerId = challengerResult === 'win' ? duel.challenger_id : challengerResult === 'loss' ? duel.opponent_id : null;
  const scores = { [duel.challenger_id]: Number(challenger.score || 0), [duel.opponent_id]: Number(opponent.score || 0) };
  await client.query(`
    UPDATE quiz_phase10_duel_rounds SET winner_id=$3,scores=$4::jsonb,completed_at=NOW()
     WHERE duel_id=$1 AND room_code=$2
  `, [duel.id, room.code, winnerId, JSON.stringify(scores)]);
  let challengerWins = Number(duel.challenger_wins || 0) + (winnerId === duel.challenger_id ? 1 : 0);
  let opponentWins = Number(duel.opponent_wins || 0) + (winnerId === duel.opponent_id ? 1 : 0);
  const needed = Math.floor(Number(duel.best_of) / 2) + 1;
  const completed = challengerWins >= needed || opponentWins >= needed;
  const seriesWinner = completed ? (challengerWins > opponentWins ? duel.challenger_id : duel.opponent_id) : null;
  await client.query(`
    UPDATE quiz_phase10_duels SET challenger_wins=$2,opponent_wins=$3,status=$4,winner_id=$5,
      active_room_code=NULL,credentials_challenger=NULL,credentials_opponent=NULL,updated_at=NOW()
     WHERE id=$1
  `, [duel.id, challengerWins, opponentWins, completed ? 'completed' : 'active', seriesWinner]);
  if (seriesWinner) {
    await applyRewardTx(client, {
      rewardKey: `duel-series:${duel.id}`,
      profileId: seriesWinner,
      rewardType: 'duel-series',
      xp: 250 + Number(duel.best_of) * 50,
      seasonPoints: 120 + Number(duel.best_of) * 20,
      badgeId: 'duel-winner',
      reason: `Best-of-${duel.best_of}-Freundesduell gewonnen`,
    });
  }
}

async function completeTournamentTx(client, room, allPlayers) {
  if (!room.tournamentMatchId) return;
  const matchResult = await client.query(`
    SELECT m.*,t.id tournament_id,t.settings,t.name tournament_name
      FROM quiz_phase10_tournament_matches m
      JOIN quiz_platform_tournaments t ON t.id=m.tournament_id
     WHERE m.id=$1 FOR UPDATE OF m,t
  `, [room.tournamentMatchId]);
  const match = matchResult.rows[0];
  if (!match || match.status === 'completed') return;
  const a = allPlayers.find(item => item.profileId === match.profile_a);
  const b = allPlayers.find(item => item.profileId === match.profile_b);
  if (!a || !b) return;
  const scoreA = Number(a.score || 0);
  const scoreB = Number(b.score || 0);
  const correctA = Number(a.correct || 0);
  const correctB = Number(b.correct || 0);
  let winnerId = scoreA > scoreB ? match.profile_a : scoreB > scoreA ? match.profile_b : null;
  if (!winnerId) winnerId = correctA > correctB ? match.profile_a : correctB > correctA ? match.profile_b : null;
  if (!winnerId) {
    await client.query(`
      UPDATE quiz_phase10_tournament_matches SET status='ready',room_code=NULL,credentials_a=NULL,credentials_b=NULL,
        tiebreak_count=tiebreak_count+1,last_tie_at=NOW()
       WHERE id=$1
    `, [match.id]);
    return;
  }

  await client.query(`
    UPDATE quiz_phase10_tournament_matches SET winner_id=$2,score_a=$3,score_b=$4,status='completed',completed_at=NOW()
     WHERE id=$1
  `, [match.id, winnerId, scoreA, scoreB]);
  if (match.next_match_id) {
    const column = match.next_slot === 'b' ? 'profile_b' : 'profile_a';
    const other = column === 'profile_a' ? 'profile_b' : 'profile_a';
    await client.query(`
      UPDATE quiz_phase10_tournament_matches SET ${column}=$2,
        status=CASE WHEN ${other} IS NOT NULL THEN 'ready' ELSE status END
       WHERE id=$1
    `, [match.next_match_id, winnerId]);
  } else {
    await client.query("UPDATE quiz_platform_tournaments SET status='finished',updated_at=NOW() WHERE id=$1", [match.tournament_id]);
    await applyRewardTx(client, {
      rewardKey: `tournament:${match.tournament_id}`,
      profileId: winnerId,
      rewardType: 'tournament',
      xp: 1000,
      seasonPoints: 500,
      badgeId: 'tournament-champion',
      reason: `${match.tournament_name} gewonnen`,
    });
  }
}

async function stableRecordRoomResult(room) {
  await phase10.ensureReady();
  await prepareCurrentSeason();
  const allPlayers = Object.values(room?.players || {});
  const players = allPlayers.filter(player => player.profileId);
  if (!players.length || !room?.code || room.competitionRecordedAt) return false;
  const resultKey = safeText(room.resultKey || `${room.code}:${room.finishedAt || room.updatedAt || Date.now()}`, 180);
  const sourceType = room.duelId ? 'duel' : room.tournamentMatchId ? 'tournament' : 'online';
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`room-result:${resultKey}`]);
    let recordedAny = false;
    for (const player of players) {
      const result = resultForPlayer(room, player, allPlayers);
      const opponent = allPlayers.find(item => item.profileId && item.profileId !== player.profileId) || null;
      const ledger = await client.query(`
        INSERT INTO quiz_phase10_result_ledger(result_key,profile_id,entry_type,source_type,source_id,payload)
        VALUES($1,$2,'match-result',$3,$4,$5::jsonb)
        ON CONFLICT DO NOTHING RETURNING result_key
      `, [resultKey, player.profileId, sourceType, room.duelId || room.tournamentMatchId || null, JSON.stringify({ roomCode: room.code, result, score: player.score })]);
      if (!ledger.rowCount) continue;
      recordedAny = true;
      await client.query(`
        INSERT INTO quiz_phase10_match_history(id,source_type,source_id,room_code,profile_id,opponent_profile_id,result,score,opponent_score,correct,wrong,unanswered,quiz_type,category,metadata,played_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,NOW())
        ON CONFLICT(room_code,profile_id) DO NOTHING
      `, [db.crypto.randomUUID(), sourceType, room.duelId || room.tournamentMatchId || null, resultKey, player.profileId,
        opponent?.profileId || null, result, Number(player.score || 0), Number(opponent?.score || 0), Number(player.correct || 0),
        Number(player.wrong || 0), Number(player.unanswered || 0), room.quizType || null, room.category || null,
        JSON.stringify({ title: room.title, gameMode: room.gameMode, originalRoomCode: room.code })]);
      await client.query(`
        INSERT INTO quiz_platform_match_results(id,room_code,profile_id,score,correct,placement,won,finished_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(room_code,profile_id) DO NOTHING
      `, [db.crypto.randomUUID(), resultKey, player.profileId, Number(player.score || 0), Number(player.correct || 0),
        [...allPlayers].sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.correct || 0) - Number(a.correct || 0)).findIndex(item => item.id === player.id) + 1,
        result === 'win']);
      const season = await ensureActiveSeasonTx(client);
      const points = Math.max(10, Math.max(0, Number(player.score || 0)) + Number(player.correct || 0) * 5 + (result === 'win' ? 60 : result === 'draw' ? 30 : 15));
      await client.query(`
        INSERT INTO quiz_phase10_season_points(season_id,profile_id,points,wins,losses,games)
        VALUES($1,$2,$3,$4,$5,1)
        ON CONFLICT(season_id,profile_id) DO UPDATE SET
          points=quiz_phase10_season_points.points+EXCLUDED.points,
          wins=quiz_phase10_season_points.wins+EXCLUDED.wins,
          losses=quiz_phase10_season_points.losses+EXCLUDED.losses,
          games=quiz_phase10_season_points.games+1,updated_at=NOW()
      `, [season.id, player.profileId, points, result === 'win' ? 1 : 0, result === 'loss' ? 1 : 0]);
    }
    if (recordedAny) {
      await completeDuelTx(client, room, allPlayers);
      await completeTournamentTx(client, room, allPlayers);
    }
    await client.query('COMMIT');
    room.competitionRecordedAt = Date.now();
    room.resultKey = resultKey;
    return recordedAny;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function bindingMap(code) {
  const key = String(code || '').toUpperCase();
  if (!profileBindings.has(key)) profileBindings.set(key, new Map());
  return profileBindings.get(key);
}

function rememberRoomBindings(room) {
  if (!room?.code) return;
  for (const player of Object.values(room.players || {})) {
    if (player.profileId) bindingMap(room.code).set(String(player.id), String(player.profileId));
  }
}

function enrichRoomBindings(room) {
  if (!room?.code) return room;
  const copy = structuredClone(room);
  const bindings = bindingMap(copy.code);
  for (const player of Object.values(copy.players || {})) {
    const profileId = bindings.get(String(player.id));
    if (profileId) player.profileId = profileId;
  }
  if (copy.phase === 'lobby' && !copy.finishedAt && copy.competitionRecordedAt) {
    copy.competitionRecordedAt = null;
    copy.resultKey = null;
  }
  if (copy.phase === 'finished' && !copy.resultKey) {
    copy.resultKey = `${copy.code}:${copy.finishedAt || Date.now()}`;
  }
  return copy;
}

async function persistBinding(code, playerId, profileId) {
  bindingMap(code).set(String(playerId), String(profileId));
  if (!onlineStorage.enabled) return;
  const rooms = await onlineStorage.loadRooms(500).catch(() => []);
  const room = rooms.find(item => String(item.code).toUpperCase() === String(code).toUpperCase());
  if (!room?.players?.[playerId]) return;
  room.players[playerId].profileId = profileId;
  await onlineStorage.saveRoom(room).catch(() => false);
}

function patchOnlineStorage() {
  if (storagePatched) return;
  storagePatched = true;
  const originalSave = onlineStorage.saveRoom.bind(onlineStorage);
  const originalLoad = onlineStorage.loadRooms.bind(onlineStorage);
  const originalDelete = onlineStorage.deleteRoom.bind(onlineStorage);
  onlineStorage.saveRoom = async (room, ttl) => {
    rememberRoomBindings(room);
    return originalSave(enrichRoomBindings(room), ttl);
  };
  onlineStorage.loadRooms = async (...args) => {
    const rooms = await originalLoad(...args);
    rooms.forEach(rememberRoomBindings);
    return rooms;
  };
  onlineStorage.deleteRoom = async code => {
    profileBindings.delete(String(code || '').toUpperCase());
    return originalDelete(code);
  };
}

function validateProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const required = ['DATABASE_URL', 'EVENT_PASSWORD', 'ADMIN_PASSWORD', 'PROFILE_SESSION_SECRET', 'PLATFORM_SECURITY_SECRET', 'PLATFORM_INTERNAL_SECRET'];
  const missing = required.filter(key => String(process.env[key] || '').length < (key.endsWith('SECRET') ? 32 : 8));
  if (missing.length) throw new Error(`Unsichere Produktionskonfiguration. Fehlend oder zu kurz: ${missing.join(', ')}`);
}

function patchPhase10() {
  if (phase10Patched) return;
  phase10Patched = true;
  const originalEnsureReady = phase10.ensureReady.bind(phase10);
  phase10.ensureReady = async () => {
    const ready = await originalEnsureReady();
    if (!ready) return false;
    await runMigrations();
    return true;
  };
  phase10.missions = stableMissions;
  phase10.claimMission = stableClaimMission;
  phase10.listEvents = stableListEvents;
  phase10.createEventSession = stableCreateEventSession;
  phase10.updateEventSession = stableUpdateEventSession;
  phase10.claimEventReward = stableClaimEventReward;
  phase10.leagueBoard = stableLeagueBoard;
  phase10.settleSeason = stableSettleSeason;
  phase10.recordRoomResult = stableRecordRoomResult;
}

function installRequestHardening(app) {
  app.use((req, res, next) => {
    res.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https:",
      "media-src 'self' blob:",
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '));
    if (req.path?.startsWith('/api/account') || req.path?.startsWith('/api/platform/admin')) {
      res.set('Cache-Control', 'no-store');
    }
    next();
  });

  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.quiztimeInternal) return next();
    const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    if (fetchSite === 'cross-site') return res.status(403).json({ error: 'Browseranfrage von einer fremden Website wurde blockiert.' });
    const origin = String(req.headers.origin || '').trim();
    if (!origin) return next();
    try {
      const expectedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      const expectedProtocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
      const expected = `${expectedProtocol}://${expectedHost}`;
      if (new URL(origin).origin !== new URL(expected).origin) return res.status(403).json({ error: 'Ungültige Anfragequelle.' });
      next();
    } catch {
      return res.status(403).json({ error: 'Ungültige Anfragequelle.' });
    }
  });
}

function installOnlineProfileBinding(app, profileForRequest) {
  app.use('/api/online/rooms', async (req, res, next) => {
    const isInternal = Boolean(INTERNAL_SECRET) && String(req.headers['x-quiztime-internal'] || '') === INTERNAL_SECRET;
    const isCreate = req.method === 'POST' && (req.path === '/' || req.path === '');
    const isJoin = req.method === 'POST' && /\/join$/u.test(req.path || '');
    if (isInternal || (!isCreate && !isJoin)) return next();
    try {
      const profile = await profileForRequest(req);
      if (!profile) return next();
      const auth = await accountStorage.getAuthState(profile.id);
      if (!auth?.emailVerified) return next();
      req.body ||= {};
      req.body.profileId = profile.id;
      if (isCreate) req.body.hostName = profile.name;
      if (isJoin) req.body.name = profile.name;
      const originalJson = res.json.bind(res);
      res.json = payload => {
        if (res.statusCode < 400 && payload?.code && payload?.playerId) {
          persistBinding(payload.code, payload.playerId, profile.id).catch(error => {
            console.error('Online-Profilbindung konnte nicht gespeichert werden:', error.message);
          });
        }
        return originalJson(payload);
      };
      next();
    } catch (error) {
      next(error);
    }
  });
}

function requireVerified(req, res, next) {
  if (req.soloAccount?.emailVerified) return next();
  return res.status(403).json({
    error: 'Bitte bestätige zuerst deine E-Mail-Adresse. Danach stehen Community, Arena, Duelle und Turniere zur Verfügung.',
    reason: 'email_unverified',
  });
}

function installPlatformGuards(app, requireProfile) {
  app.use('/api/platform/phase10', requireProfile, requireVerified);
  app.use('/api/platform', (req, res, next) => {
    if (req.method === 'GET' || req.path.startsWith('/admin/') || req.path === '/client-error') return next();
    const protectedPath = /^\/(friends|invites|matchmaking|tournaments)(?:\/|$)/u.test(req.path || '');
    if (!protectedPath) return next();
    return requireProfile(req, res, () => requireVerified(req, res, next));
  });
}

async function createCompetitionRoom({ title, quizType, category, questionCount, profileA, profileB, tournamentMatchId }) {
  const port = Number(process.env.PORT || 3000);
  const headers = { 'Content-Type': 'application/json', 'x-quiztime-internal': INTERNAL_SECRET };
  const createdResponse = await fetch(`http://127.0.0.1:${port}/api/online/rooms`, {
    method: 'POST', headers,
    body: JSON.stringify({
      hostName: profileA.name, profileId: profileA.id, title, visibility: 'private', gameMode: 'individual',
      quizType, category, questionCount, maxPlayers: 2, tournamentMatchId, competitionType: 'tournament',
    }),
  });
  const created = await createdResponse.json().catch(() => ({}));
  if (!createdResponse.ok) throw new Error(created.error || 'Turnierraum konnte nicht erstellt werden.');
  const joinedResponse = await fetch(`http://127.0.0.1:${port}/api/online/rooms/${encodeURIComponent(created.code)}/join`, {
    method: 'POST', headers, body: JSON.stringify({ name: profileB.name, profileId: profileB.id }),
  });
  const joined = await joinedResponse.json().catch(() => ({}));
  if (!joinedResponse.ok) throw new Error(joined.error || 'Zweiter Turnierspieler konnte nicht beitreten.');
  return {
    code: created.code,
    credentialsA: { code: created.code, token: created.token, playerId: created.playerId, name: profileA.name },
    credentialsB: { code: joined.code, token: joined.token, playerId: joined.playerId, name: profileB.name },
  };
}

async function notify(profileId, title, body, url) {
  await platformStorage.addNotification(profileId, { type: 'competition', title, body, url }).catch(() => false);
}

function installAdditionalRoutes(app, { requireProfile, requireAdmin }) {
  app.post('/api/platform/phase10/tournament-matches/:id/room', requireProfile, requireVerified, async (req, res, next) => {
    try {
      await phase10.ensureReady();
      const { rows } = await db.query(`
        SELECT m.*,t.code,t.name,t.owner_id,t.settings,
               pa.name profile_a_name,pb.name profile_b_name
          FROM quiz_phase10_tournament_matches m
          JOIN quiz_platform_tournaments t ON t.id=m.tournament_id
          JOIN quiz_solo_profiles pa ON pa.id=m.profile_a
          JOIN quiz_solo_profiles pb ON pb.id=m.profile_b
         WHERE m.id=$1
      `, [req.params.id]);
      const match = rows[0];
      if (!match || match.status !== 'ready' || !match.profile_a || !match.profile_b) throw new Error('Diese Turnierpartie ist noch nicht spielbereit.');
      if (![match.owner_id, match.profile_a, match.profile_b].includes(req.soloProfile.id)) throw new Error('Keine Berechtigung für diese Turnierpartie.');
      if (match.room_code) throw new Error('Für diese Partie wurde bereits ein Raum erstellt.');
      const [profileA, profileB] = await Promise.all([profileStore.getProfileById(match.profile_a), profileStore.getProfileById(match.profile_b)]);
      const settings = match.settings || {};
      const room = await createCompetitionRoom({
        title: `${match.name} · ${Number(match.tiebreak_count || 0) ? `Entscheidungsrunde ${Number(match.tiebreak_count)}` : `K.-o.-Runde ${match.round_no}`}`,
        quizType: settings.quizType === 'child' ? 'child' : 'adult',
        category: safeText(settings.category || 'Gemischt', 50) || 'Gemischt',
        questionCount: Number(match.tiebreak_count || 0) ? 5 : [5, 10, 15, 25].includes(Number(settings.questionCount)) ? Number(settings.questionCount) : 10,
        profileA, profileB, tournamentMatchId: match.id,
      });
      await db.query(`
        UPDATE quiz_phase10_tournament_matches SET room_code=$2,credentials_a=$3::jsonb,credentials_b=$4::jsonb,status='playing'
         WHERE id=$1
      `, [match.id, room.code, JSON.stringify(room.credentialsA), JSON.stringify(room.credentialsB)]);
      await Promise.all([
        notify(profileA.id, 'Turnierpartie bereit', `${profileB.name} wartet in Raum ${room.code}.`, `/arena?tab=tournaments&code=${match.code}`),
        notify(profileB.id, 'Turnierpartie bereit', `${profileA.name} wartet in Raum ${room.code}.`, `/arena?tab=tournaments&code=${match.code}`),
      ]);
      res.status(201).json({ code: room.code, credentials: req.soloProfile.id === profileA.id ? room.credentialsA : room.credentialsB });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/platform/history/import', requireProfile, requireVerified, async (req, res, next) => {
    try {
      await phase10.ensureReady();
      const sourceType = req.body?.sourceType === 'live' ? 'live' : req.body?.sourceType === 'offline' ? 'offline' : '';
      const importKey = safeText(req.body?.importKey, 160);
      if (!sourceType || importKey.length < 8) return res.status(400).json({ error: 'Ungültiger Historienimport.' });
      const score = Math.max(-100000, Math.min(100000, Math.round(Number(req.body?.score) || 0)));
      const correct = Math.max(0, Math.min(10000, Math.round(Number(req.body?.correct) || 0)));
      const wrong = Math.max(0, Math.min(10000, Math.round(Number(req.body?.wrong) || 0)));
      const unanswered = Math.max(0, Math.min(10000, Math.round(Number(req.body?.unanswered) || 0)));
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query(`
          INSERT INTO quiz_external_history_imports(import_key,profile_id,source_type,payload)
          VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING RETURNING import_key
        `, [importKey, req.soloProfile.id, sourceType, JSON.stringify(req.body || {})]);
        if (inserted.rowCount) {
          await client.query(`
            INSERT INTO quiz_phase10_match_history(id,source_type,source_id,room_code,profile_id,result,score,correct,wrong,unanswered,quiz_type,category,metadata,played_at)
            VALUES($1,$2,$3,$4,$5,'completed',$6,$7,$8,$9,$10,$11,$12::jsonb,COALESCE($13::timestamptz,NOW()))
            ON CONFLICT(room_code,profile_id) DO NOTHING
          `, [db.crypto.randomUUID(), sourceType, importKey, `external:${sourceType}:${importKey}`, req.soloProfile.id, score, correct, wrong, unanswered,
            req.body?.quizType === 'child' ? 'child' : 'adult', safeText(req.body?.category || 'Gemischt', 50),
            JSON.stringify({ title: safeText(req.body?.title || (sourceType === 'live' ? 'Live-Quiz' : 'Offline-Mehrspieler'), 120), excludedFromLeague: true }),
            req.body?.playedAt || null]);
        }
        await client.query('COMMIT');
        res.status(inserted.rowCount ? 201 : 200).json({ ok: true, imported: Boolean(inserted.rowCount), excludedFromLeague: true });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/platform/stability/status', async (_req, res) => {
    if (db.enabled()) await phase10.ensureReady().catch(() => false);
    const databaseReachable = db.enabled() ? await db.query('SELECT 1').then(() => true).catch(() => false) : false;
    res.json({
      version: '10.1.0',
      databaseReachable,
      migrations: databaseReachable ? (await db.query('SELECT version,applied_at FROM quiz_schema_migrations ORDER BY version')).rows : [],
      timezone: BERLIN_ZONE,
      strictSecurity: process.env.NODE_ENV === 'production',
      catalog: databaseReachable ? await catalogService.diagnostics() : null,
    });
  });

  app.get('/api/platform/stability/catalog', async (_req, res, next) => {
    try { res.json(await catalogService.diagnostics()); } catch (error) { next(error); }
  });

  app.get('/api/platform/admin/stability/summary', requireAdmin, async (_req, res, next) => {
    try {
      await phase10.ensureReady();
      const [ledger, sessions, adjustments, migrations, catalog] = await Promise.all([
        db.query(`SELECT source_type,COUNT(*)::int count FROM quiz_phase10_result_ledger GROUP BY source_type`),
        db.query(`SELECT COUNT(*) FILTER(WHERE completed_at IS NULL AND expires_at<NOW())::int expired_open,
                         COUNT(*) FILTER(WHERE completed_at IS NULL AND expires_at>NOW())::int active_open
                    FROM quiz_phase10_event_sessions`),
        db.query('SELECT COUNT(*)::int count FROM quiz_phase10_manual_adjustments'),
        db.query('SELECT version,applied_at FROM quiz_schema_migrations ORDER BY version'),
        catalogService.diagnostics(),
      ]);
      res.json({ ledger: ledger.rows, sessions: sessions.rows[0], adjustments: adjustments.rows[0]?.count || 0, migrations: migrations.rows, catalog });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/platform/admin/stability/season-preview', requireAdmin, async (_req, res, next) => {
    try { res.json({ preview: await seasonSettlementPreview() }); } catch (error) { next(error); }
  });

  app.post('/api/platform/admin/stability/reconcile', requireAdmin, async (_req, res, next) => {
    try {
      await phase10.ensureReady();
      const rooms = await onlineStorage.loadRooms(500);
      let repaired = 0;
      for (const room of rooms) {
        const enriched = enrichRoomBindings(room);
        if (enriched.phase !== 'finished' || enriched.competitionRecordedAt || !Object.values(enriched.players || {}).some(player => player.profileId)) continue;
        if (await stableRecordRoomResult(enriched)) {
          await onlineStorage.saveRoom(enriched);
          repaired += 1;
        }
      }
      const abandoned = await db.query(`
        UPDATE quiz_phase10_event_sessions SET abandoned_at=NOW()
         WHERE completed_at IS NULL AND abandoned_at IS NULL AND expires_at<NOW()
      `);
      await db.query(`
        INSERT INTO quiz_phase10_repair_log(id,repair_type,result,details)
        VALUES($1,'reconcile','success',$2::jsonb)
      `, [db.crypto.randomUUID(), JSON.stringify({ repairedRooms: repaired, abandonedSessions: abandoned.rowCount })]);
      res.json({ repairedRooms: repaired, abandonedSessions: abandoned.rowCount });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/platform/admin/stability/adjust-profile', requireAdmin, async (req, res, next) => {
    try {
      await phase10.ensureReady();
      const profileId = String(req.body?.profileId || '');
      const reason = safeText(req.body?.reason, 300);
      const xpDelta = Math.max(-10000, Math.min(10000, Math.round(Number(req.body?.xpDelta) || 0)));
      const seasonDelta = Math.max(-5000, Math.min(5000, Math.round(Number(req.body?.seasonPointsDelta) || 0)));
      if (!profileId || !reason || (!xpDelta && !seasonDelta)) return res.status(400).json({ error: 'Profil, Begründung und eine Änderung sind erforderlich.' });
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        if (xpDelta) {
          await client.query(`
            INSERT INTO quiz_phase10_rewards(profile_id,bonus_xp,badges) VALUES($1,$2,'[]'::jsonb)
            ON CONFLICT(profile_id) DO UPDATE SET bonus_xp=GREATEST(0,quiz_phase10_rewards.bonus_xp+$2),updated_at=NOW()
          `, [profileId, xpDelta]);
        }
        if (seasonDelta) {
          const season = await ensureActiveSeasonTx(client);
          await client.query(`
            INSERT INTO quiz_phase10_season_points(season_id,profile_id,points) VALUES($1,$2,$3)
            ON CONFLICT(season_id,profile_id) DO UPDATE SET points=GREATEST(0,quiz_phase10_season_points.points+$3),updated_at=NOW()
          `, [season.id, profileId, seasonDelta]);
        }
        const id = db.crypto.randomUUID();
        await client.query(`
          INSERT INTO quiz_phase10_manual_adjustments(id,profile_id,xp_delta,season_points_delta,reason,admin_actor)
          VALUES($1,$2,$3,$4,$5,'platform-admin')
        `, [id, profileId, xpDelta, seasonDelta, reason]);
        await client.query('COMMIT');
        res.status(201).json({ id, profileId, xpDelta, seasonPointsDelta: seasonDelta });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/platform/admin/stability/duels/:id/reset-room', requireAdmin, async (req, res, next) => {
    try {
      const { rows } = await db.query(`
        UPDATE quiz_phase10_duels SET active_room_code=NULL,credentials_challenger=NULL,credentials_opponent=NULL,updated_at=NOW()
         WHERE id=$1 AND status='active' RETURNING *
      `, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Aktives Duell wurde nicht gefunden.' });
      res.json({ duel: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/platform/admin/stability/tournament-matches/:id/reset', requireAdmin, async (req, res, next) => {
    try {
      const { rows } = await db.query(`
        UPDATE quiz_phase10_tournament_matches SET room_code=NULL,credentials_a=NULL,credentials_b=NULL,status='ready',completed_at=NULL,winner_id=NULL
         WHERE id=$1 AND profile_a IS NOT NULL AND profile_b IS NOT NULL RETURNING *
      `, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Turnierpartie wurde nicht gefunden.' });
      res.json({ match: rows[0] });
    } catch (error) { next(error); }
  });
}

async function cleanupUnverifiedProfiles() {
  if (!db.enabled()) return 0;
  const result = await db.query(`
    DELETE FROM quiz_solo_profiles p
     WHERE p.email_verified_at IS NULL
       AND p.created_at < NOW()-INTERVAL '7 days'
       AND NOT EXISTS(SELECT 1 FROM quiz_solo_attempts a WHERE a.profile_id=p.id)
       AND NOT EXISTS(SELECT 1 FROM quiz_platform_friendships f WHERE f.profile_low=p.id OR f.profile_high=p.id)
       AND NOT EXISTS(SELECT 1 FROM quiz_phase10_event_sessions s WHERE s.profile_id=p.id)
  `);
  return result.rowCount;
}

function installScheduler() {
  if (schedulerStarted || !db.enabled()) return;
  schedulerStarted = true;
  const run = async () => {
    try {
      await phase10.ensureReady();
      while (await stableSettleSeason({ automatic: true })) { /* mehrere versäumte Monatsabschlüsse nacheinander */ }
      await cleanupUnverifiedProfiles();
    } catch (error) {
      console.error('Automatische QuizTime-Wartung fehlgeschlagen:', error.message);
    }
  };
  const initial = setTimeout(run, 60 * 1000);
  initial.unref?.();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref?.();
}

module.exports = {
  validateProductionSecrets,
  patchPhase10,
  patchOnlineStorage,
  installRequestHardening,
  installOnlineProfileBinding,
  installPlatformGuards,
  installAdditionalRoutes,
  installScheduler,
  _test: {
    berlinDayKey,
    berlinIsoWeekKey,
    leagueInfo,
    nextLeague,
    resultForPlayer,
    enrichRoomBindings,
  },
};
