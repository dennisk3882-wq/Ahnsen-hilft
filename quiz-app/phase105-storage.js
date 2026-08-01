'use strict';

const db = require('./platform-db');
const phase10 = require('./phase10-storage');
const profileStore = require('./extended-storage');
const gameStorage = require('./platform-game-storage');
const { runMigrations } = require('./migration-runner');

const VISIBILITIES = new Set(['public', 'friends', 'private']);
const ADULT_CATEGORIES = Object.freeze([
  'Allgemeinwissen', 'Geografie', 'Geschichte', 'Natur & Wissenschaft',
  'Musik', 'Sport', 'Film & Fernsehen', 'Technik', 'Essen & Trinken',
]);
const CHILD_CATEGORIES = Object.freeze([
  'Mathematik', 'Sprache', 'Natur & Tiere', 'Technik & Wissenschaft',
  'Geografie', 'Alltag & Verkehr', 'Essen & Gesundheit', 'Allgemeinwissen',
  'Geschichte', 'Musik', 'Sport', 'Film & Fernsehen',
]);

let readyPromise = null;

function safeText(value, max = 240) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalizeVisibility(value) {
  return VISIBILITIES.has(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'public';
}

function uniqueTextList(values, max = 3) {
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const clean = safeText(value, 80);
    if (clean && !result.includes(clean)) result.push(clean);
    if (result.length >= max) break;
  }
  return result;
}

async function ensureReady() {
  if (!db.enabled()) return false;
  if (!readyPromise) {
    readyPromise = (async () => {
      await runMigrations();
      await phase10.ensureReady();
      await db.query(`
        INSERT INTO quiz_phase105_profile_settings(profile_id)
        SELECT id FROM quiz_solo_profiles
        ON CONFLICT(profile_id) DO NOTHING
      `);
      await ensureCompetitionEvents();
      return true;
    })().catch(error => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

async function q(text, params = []) {
  await ensureReady();
  return db.query(text, params);
}

async function areFriends(left, right) {
  if (!left || !right || left === right) return left === right;
  const { rows } = await q(`
    SELECT 1
      FROM quiz_platform_friendships
     WHERE status='accepted'
       AND ((profile_low=$1 AND profile_high=$2) OR (profile_low=$2 AND profile_high=$1))
     LIMIT 1
  `, [left, right]);
  return Boolean(rows[0]);
}

async function profileSettings(profileId) {
  const { rows } = await q(`
    SELECT COALESCE(p.profile_visibility,CASE WHEN p.public_profile THEN 'public' ELSE 'private' END) profile_visibility,
           s.bio,s.featured_badges,s.show_recent_matches,s.show_favorite_categories,s.updated_at
      FROM quiz_account_preferences p
      LEFT JOIN quiz_phase105_profile_settings s ON s.profile_id=p.profile_id
     WHERE p.profile_id=$1
  `, [profileId]);
  const row = rows[0] || {};
  return {
    profileVisibility: normalizeVisibility(row.profile_visibility),
    bio: row.bio || '',
    featuredBadges: Array.isArray(row.featured_badges) ? row.featured_badges : [],
    showRecentMatches: row.show_recent_matches !== false,
    showFavoriteCategories: row.show_favorite_categories !== false,
    updatedAt: row.updated_at || null,
  };
}

async function updateProfileSettings(profileId, values = {}) {
  const visibility = normalizeVisibility(values.profileVisibility);
  const bio = safeText(values.bio, 240);
  const rewards = await phase10.profileRewards(profileId);
  const stats = await profileStore.getProfileStats(profileId).catch(() => null);
  const owned = new Set([
    ...(Array.isArray(rewards.badges) ? rewards.badges : []),
    ...(Array.isArray(stats?.achievements) ? stats.achievements.map(item => item.id || item.key).filter(Boolean) : []),
  ]);
  const requestedBadges = uniqueTextList(values.featuredBadges, 3);
  const featuredBadges = requestedBadges.filter(id => owned.has(id));
  const showRecentMatches = values.showRecentMatches !== false;
  const showFavoriteCategories = values.showFavoriteCategories !== false;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE quiz_account_preferences
         SET profile_visibility=$2,
             public_profile=$2<>'private',
             updated_at=NOW()
       WHERE profile_id=$1
    `, [profileId, visibility]);
    const { rows } = await client.query(`
      INSERT INTO quiz_phase105_profile_settings
        (profile_id,bio,featured_badges,show_recent_matches,show_favorite_categories,updated_at)
      VALUES($1,$2,$3::jsonb,$4,$5,NOW())
      ON CONFLICT(profile_id) DO UPDATE SET
        bio=EXCLUDED.bio,
        featured_badges=EXCLUDED.featured_badges,
        show_recent_matches=EXCLUDED.show_recent_matches,
        show_favorite_categories=EXCLUDED.show_favorite_categories,
        updated_at=NOW()
      RETURNING *
    `, [profileId, bio, JSON.stringify(featuredBadges), showRecentMatches, showFavoriteCategories]);
    await client.query('COMMIT');
    return {
      profileVisibility: visibility,
      bio: rows[0].bio,
      featuredBadges: rows[0].featured_badges,
      showRecentMatches: rows[0].show_recent_matches,
      showFavoriteCategories: rows[0].show_favorite_categories,
      updatedAt: rows[0].updated_at,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function categorySummary(profileId) {
  const { rows } = await q(`
    WITH values AS (
      SELECT category,COUNT(*)::int answers,COUNT(*) FILTER(WHERE correct)::int correct
        FROM quiz_solo_attempts
       WHERE profile_id=$1
       GROUP BY category
      UNION ALL
      SELECT category,COALESCE(SUM(correct+wrong+unanswered),0)::int answers,COALESCE(SUM(correct),0)::int correct
        FROM quiz_phase10_match_history
       WHERE profile_id=$1 AND category IS NOT NULL
       GROUP BY category
    )
    SELECT category,SUM(answers)::int answers,SUM(correct)::int correct
      FROM values
     GROUP BY category
     ORDER BY answers DESC,correct DESC,category
     LIMIT 6
  `, [profileId]);
  return rows.map(row => ({
    category: row.category,
    answers: Number(row.answers || 0),
    correct: Number(row.correct || 0),
    accuracy: Number(row.answers || 0) ? Math.round(Number(row.correct || 0) / Number(row.answers) * 100) : 0,
  }));
}

async function publicProfile(profileId, viewerId = null) {
  const { rows } = await q(`
    SELECT p.id,p.name,p.avatar_id,p.created_at,p.last_login_at,p.account_status,
           COALESCE(pref.profile_visibility,CASE WHEN pref.public_profile THEN 'public' ELSE 'private' END) profile_visibility,
           settings.bio,settings.featured_badges,settings.show_recent_matches,settings.show_favorite_categories
      FROM quiz_solo_profiles p
      JOIN quiz_account_preferences pref ON pref.profile_id=p.id
      LEFT JOIN quiz_phase105_profile_settings settings ON settings.profile_id=p.id
     WHERE p.id=$1 AND p.account_status='active'
  `, [profileId]);
  const profile = rows[0];
  if (!profile) return null;

  const visibility = normalizeVisibility(profile.profile_visibility);
  const isSelf = Boolean(viewerId && viewerId === profileId);
  const isFriend = !isSelf && Boolean(viewerId) ? await areFriends(viewerId, profileId) : false;
  const allowed = isSelf || visibility === 'public' || (visibility === 'friends' && isFriend);
  if (!allowed) {
    const error = new Error(visibility === 'private' ? 'Dieses Profil ist privat.' : 'Dieses Profil ist nur für Freunde sichtbar.');
    error.code = 'PROFILE_PRIVATE';
    throw error;
  }

  const [soloStats, matchStats, duelStats, rewards, currentStats, league, categories, recentMatches, archive, eventSuccesses, tournamentWins] = await Promise.all([
    q(`SELECT COUNT(DISTINCT session_id)::int games,COUNT(*)::int answers,COUNT(*) FILTER(WHERE correct)::int correct,
             COUNT(*) FILTER(WHERE NOT correct AND NOT timed_out)::int wrong,COUNT(*) FILTER(WHERE timed_out)::int unanswered,
             COALESCE(SUM(delta),0)::int points
        FROM quiz_solo_attempts WHERE profile_id=$1`, [profileId]),
    q(`SELECT COUNT(*)::int games,COUNT(*) FILTER(WHERE result='win')::int wins,COUNT(*) FILTER(WHERE result='loss')::int losses,
             COUNT(*) FILTER(WHERE result='draw')::int draws,COALESCE(SUM(score),0)::int points,
             COALESCE(SUM(correct),0)::int correct,COALESCE(SUM(correct+wrong+unanswered),0)::int answers
        FROM quiz_phase10_match_history WHERE profile_id=$1`, [profileId]),
    q(`SELECT COUNT(*) FILTER(WHERE status='completed')::int completed,
             COUNT(*) FILTER(WHERE winner_id=$1)::int won,
             COUNT(*) FILTER(WHERE status IN ('pending','active'))::int active
        FROM quiz_phase10_duels WHERE challenger_id=$1 OR opponent_id=$1`, [profileId]),
    phase10.profileRewards(profileId),
    profileStore.getProfileStats(profileId).catch(() => null),
    phase10.leagueBoard(profileId, 300).catch(() => null),
    categorySummary(profileId),
    phase10.history(profileId, { type: 'all', days: 3650, limit: 10 }).catch(() => []),
    q(`SELECT a.season_id,s.name,s.starts_at,s.ends_at,a.league_id,a.rank,a.points,a.outcome,a.archived_at
        FROM quiz_phase10_league_archive a JOIN quiz_platform_seasons s ON s.id=a.season_id
       WHERE a.profile_id=$1 ORDER BY s.ends_at DESC LIMIT 12`, [profileId]),
    q(`SELECT e.id,e.slug,e.title,e.event_type,ee.best_score,ee.best_correct,ee.attempts,ee.completed_at
        FROM quiz_phase10_event_entries ee JOIN quiz_phase10_events e ON e.id=ee.event_id
       WHERE ee.profile_id=$1 AND ee.completed_at IS NOT NULL
       ORDER BY ee.completed_at DESC LIMIT 12`, [profileId]),
    q(`SELECT t.id,t.code,t.name,m.completed_at
        FROM quiz_phase10_tournament_matches m
        JOIN quiz_platform_tournaments t ON t.id=m.tournament_id
       WHERE m.winner_id=$1 AND m.next_match_id IS NULL AND m.status='completed'
       ORDER BY m.completed_at DESC LIMIT 12`, [profileId]),
  ]);

  const solo = soloStats.rows[0] || {};
  const matches = matchStats.rows[0] || {};
  const totalAnswers = Number(solo.answers || 0) + Number(matches.answers || 0);
  const totalCorrect = Number(solo.correct || 0) + Number(matches.correct || 0);
  const allBadges = [...new Set([
    ...(Array.isArray(rewards.badges) ? rewards.badges : []),
    ...(Array.isArray(currentStats?.achievements) ? currentStats.achievements.map(item => item.id || item.key).filter(Boolean) : []),
  ])];
  const configuredFeatured = Array.isArray(profile.featured_badges) ? profile.featured_badges.filter(id => allBadges.includes(id)) : [];
  const showRecent = profile.show_recent_matches !== false;
  const showCategories = profile.show_favorite_categories !== false;

  return {
    profile: {
      id: profile.id,
      name: profile.name,
      avatarId: profile.avatar_id,
      memberSince: profile.created_at,
      lastLoginAt: isSelf || isFriend ? profile.last_login_at : null,
      bio: profile.bio || '',
      visibility,
    },
    viewer: { isSelf, isFriend, canChallenge: isFriend },
    progression: {
      level: Number(currentStats?.level || 1),
      xp: Number(currentStats?.xp || 0) + Number(rewards.bonus_xp || 0),
      title: currentStats?.title || null,
      currentStreak: Number(currentStats?.currentStreak || 0),
      bestStreak: Number(currentStats?.bestStreak || 0),
    },
    stats: {
      games: Number(solo.games || 0) + Number(matches.games || 0),
      soloGames: Number(solo.games || 0),
      competitionGames: Number(matches.games || 0),
      wins: Number(matches.wins || 0),
      losses: Number(matches.losses || 0),
      draws: Number(matches.draws || 0),
      answers: totalAnswers,
      correct: totalCorrect,
      wrong: Number(solo.wrong || 0),
      unanswered: Number(solo.unanswered || 0),
      points: Number(solo.points || 0) + Number(matches.points || 0),
      accuracy: totalAnswers ? Math.round(totalCorrect / totalAnswers * 100) : 0,
    },
    league: league?.me || null,
    duelStats: duelStats.rows[0] || { completed: 0, won: 0, active: 0 },
    badges: { featured: configuredFeatured.length ? configuredFeatured : allBadges.slice(0, 3), all: allBadges },
    favoriteCategories: showCategories ? categories : [],
    recentMatches: showRecent ? recentMatches : [],
    seasonArchive: archive.rows,
    eventSuccesses: eventSuccesses.rows,
    tournamentWins: tournamentWins.rows,
    privacy: { showRecentMatches: showRecent, showFavoriteCategories: showCategories },
  };
}

function weekStart(date = new Date()) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value;
}

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function seasonLabel(month) {
  if ([11, 0, 1].includes(month)) return { key: 'winter', name: 'Winter-Wissensfest', icon: '❄️' };
  if ([2, 3, 4].includes(month)) return { key: 'spring', name: 'Frühlings-Challenge', icon: '🌷' };
  if ([5, 6, 7].includes(month)) return { key: 'summer', name: 'Sommer-Wissenscup', icon: '☀️' };
  return { key: 'autumn', name: 'Herbst-Duellwochen', icon: '🍂' };
}

async function insertOfficialEvent(values) {
  const settings = { maxAttempts: values.maxAttempts, featured: values.featured !== false, official: true, audience: values.audience, calendarKind: values.calendarKind };
  await db.query(`
    INSERT INTO quiz_phase10_events
      (id,slug,title,description,event_type,quiz_type,category,question_count,starts_at,ends_at,
       reward_xp,reward_season_points,badge_id,community_target,active,settings)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,$15::jsonb)
    ON CONFLICT(slug) DO NOTHING
  `, [db.crypto.randomUUID(), values.slug, values.title, values.description, values.eventType, values.quizType, values.category,
    values.questionCount, values.startsAt, values.endsAt, values.rewardXp, values.rewardSeasonPoints, values.badgeId,
    values.communityTarget, JSON.stringify(settings)]);
}

async function ensureCompetitionEvents(date = new Date()) {
  if (!db.enabled()) return false;
  await runMigrations();
  const start = weekStart(date);
  const end = new Date(start.getTime() + 7 * 86400000);
  const weekKey = phase10.isoWeekKey(date);
  const weekNumber = Number(weekKey.slice(-2));
  const adultCategory = ADULT_CATEGORIES[weekNumber % ADULT_CATEGORIES.length];
  const childCategory = CHILD_CATEGORIES[(weekNumber + 3) % CHILD_CATEGORIES.length];

  await insertOfficialEvent({
    slug: `erwachsenen-themenwoche-${weekKey.toLowerCase()}`,
    title: `Themenwoche · ${adultCategory}`,
    description: `Eine offizielle Wettbewerbsrunde mit 15 zufällig gewählten Fragen aus ${adultCategory}. Der beste Versuch zählt.`,
    eventType: 'special', quizType: 'adult', category: adultCategory, questionCount: 15,
    startsAt: start, endsAt: end, rewardXp: 700, rewardSeasonPoints: 260,
    badgeId: `adult-week-${weekKey}`, communityTarget: 500, maxAttempts: 5, audience: 'adult', calendarKind: 'theme-week',
  });
  await insertOfficialEvent({
    slug: `kinderquiz-der-woche-${weekKey.toLowerCase()}`,
    title: `Kinderquiz der Woche · ${childCategory}`,
    description: `Zehn offizielle Kinderfragen aus ${childCategory}. Die Fragen werden zufällig aus dem vollständigen Kategorienpool ausgewählt.`,
    eventType: 'weekly', quizType: 'child', category: childCategory, questionCount: 10,
    startsAt: start, endsAt: end, rewardXp: 500, rewardSeasonPoints: 180,
    badgeId: `child-week-${weekKey}`, communityTarget: 300, maxAttempts: 5, audience: 'child', calendarKind: 'weekly-child',
  });

  const currentMonth = monthStart(date);
  const nextMonth = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() + 1, 1));
  const monthKey = currentMonth.toISOString().slice(0, 7);
  await insertOfficialEvent({
    slug: `kinder-monatschallenge-${monthKey}`,
    title: 'Kinder-Monatschallenge',
    description: 'Eine offizielle Monatsrangliste mit 15 gemischten Kinderfragen und einem gemeinsamen Community-Ziel.',
    eventType: 'monthly', quizType: 'child', category: 'Gemischt', questionCount: 15,
    startsAt: currentMonth, endsAt: nextMonth, rewardXp: 800, rewardSeasonPoints: 300,
    badgeId: `child-month-${monthKey}`, communityTarget: 1200, maxAttempts: 10, audience: 'child', calendarKind: 'monthly-child',
  });

  const seasonal = seasonLabel(date.getUTCMonth());
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  const quarterStart = new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
  const quarterEnd = new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth + 3, 1));
  const quarterKey = `${date.getUTCFullYear()}-${seasonal.key}`;
  await insertOfficialEvent({
    slug: `saison-event-${quarterKey}`,
    title: `${seasonal.icon} ${seasonal.name}`,
    description: 'Ein großes offizielles Saisonereignis mit gemischten Fragen, Saisonpunkten, Rangliste und exklusivem Abzeichen.',
    eventType: 'special', quizType: 'adult', category: 'Gemischt', questionCount: 25,
    startsAt: quarterStart, endsAt: quarterEnd, rewardXp: 1400, rewardSeasonPoints: 600,
    badgeId: `season-${quarterKey}`, communityTarget: 5000, maxAttempts: 12, audience: 'all', calendarKind: 'seasonal',
  });
  return true;
}

function eventStatus(event, now = Date.now()) {
  const starts = new Date(event.starts_at).getTime();
  const ends = new Date(event.ends_at).getTime();
  return now < starts ? 'upcoming' : now < ends ? 'live' : 'ended';
}

async function competitionCalendar(profileId, options = {}) {
  await ensureCompetitionEvents();
  const pastDays = Math.max(0, Math.min(365, Number(options.pastDays) || 60));
  const futureDays = Math.max(7, Math.min(365, Number(options.futureDays) || 180));
  const { rows } = await q(`
    SELECT e.*,COALESCE(entry.best_score,0)::int best_score,COALESCE(entry.best_correct,0)::int best_correct,
           COALESCE(entry.attempts,0)::int attempts,entry.completed_at,COALESCE(entry.reward_claimed,FALSE) reward_claimed,
           (SELECT COUNT(*)::int FROM quiz_phase10_event_entries all_entries WHERE all_entries.event_id=e.id AND all_entries.completed_at IS NOT NULL) participants,
           (SELECT COALESCE(SUM(best_correct),0)::int FROM quiz_phase10_event_entries all_entries WHERE all_entries.event_id=e.id) community_progress
      FROM quiz_phase10_events e
      LEFT JOIN quiz_phase10_event_entries entry ON entry.event_id=e.id AND entry.profile_id=$1
     WHERE e.starts_at<NOW()+($3::text||' days')::interval
       AND e.ends_at>NOW()-($2::text||' days')::interval
       AND COALESCE(e.publication_status,'published')='published'
     ORDER BY e.starts_at,e.title
  `, [profileId, pastDays, futureDays]);

  const events = [];
  for (const event of rows) {
    const leaders = await q(`
      SELECT p.id,p.name,p.avatar_id,ee.best_score,ee.best_correct,
             ROW_NUMBER() OVER(ORDER BY ee.best_score DESC,ee.best_correct DESC,ee.completed_at)::int rank
        FROM quiz_phase10_event_entries ee JOIN quiz_solo_profiles p ON p.id=ee.profile_id
       WHERE ee.event_id=$1 AND ee.completed_at IS NOT NULL
       ORDER BY ee.best_score DESC,ee.best_correct DESC,ee.completed_at LIMIT 3
    `, [event.id]);
    events.push({ ...event, status: eventStatus(event), leaders: leaders.rows });
  }
  return {
    generatedAt: new Date().toISOString(),
    live: events.filter(event => event.status === 'live'),
    upcoming: events.filter(event => event.status === 'upcoming'),
    recent: events.filter(event => event.status === 'ended').reverse(),
  };
}

async function seasonArchive(limit = 12) {
  const { rows } = await q(`
    SELECT s.id,s.name,s.starts_at,s.ends_at,s.active,
           COUNT(a.profile_id)::int participants,
           MAX(a.archived_at) archived_at
      FROM quiz_platform_seasons s
      JOIN quiz_phase10_league_archive a ON a.season_id=s.id
     GROUP BY s.id
     ORDER BY s.ends_at DESC
     LIMIT $1
  `, [Math.max(1, Math.min(36, Number(limit) || 12))]);
  const seasons = [];
  for (const season of rows) {
    const leaders = await q(`
      SELECT a.profile_id,p.name,p.avatar_id,a.league_id,a.rank,a.points,a.outcome
        FROM quiz_phase10_league_archive a JOIN quiz_solo_profiles p ON p.id=a.profile_id
       WHERE a.season_id=$1
       ORDER BY a.points DESC,a.rank,p.name LIMIT 3
    `, [season.id]);
    seasons.push({ ...season, leaders: leaders.rows });
  }
  return seasons;
}

async function seasonDetails(id) {
  const seasonResult = await q('SELECT * FROM quiz_platform_seasons WHERE id=$1', [id]);
  if (!seasonResult.rows[0]) return null;
  const entries = await q(`
    SELECT a.*,p.name,p.avatar_id
      FROM quiz_phase10_league_archive a JOIN quiz_solo_profiles p ON p.id=a.profile_id
     WHERE a.season_id=$1
     ORDER BY CASE a.league_id WHEN 'master' THEN 1 WHEN 'gold' THEN 2 WHEN 'silver' THEN 3 ELSE 4 END,
              a.rank,a.points DESC,p.name
  `, [id]);
  return { season: seasonResult.rows[0], leaderboard: entries.rows };
}

async function tournamentChampions(limit = 12) {
  const { rows } = await q(`
    SELECT t.id,t.code,t.name,t.description,t.format,m.completed_at,p.id profile_id,p.name,p.avatar_id
      FROM quiz_phase10_tournament_matches m
      JOIN quiz_platform_tournaments t ON t.id=m.tournament_id
      JOIN quiz_solo_profiles p ON p.id=m.winner_id
     WHERE m.next_match_id IS NULL AND m.status='completed'
     ORDER BY m.completed_at DESC LIMIT $1
  `, [Math.max(1, Math.min(50, Number(limit) || 12))]);
  return rows;
}

async function competitionOverview(profileId) {
  const [current, calendar, archive, champions] = await Promise.all([
    phase10.leagueBoard(profileId, 100),
    competitionCalendar(profileId),
    seasonArchive(12),
    tournamentChampions(12),
  ]);
  return { current, calendar, archive, tournamentChampions: champions };
}

module.exports = {
  ensureReady,
  normalizeVisibility,
  profileSettings,
  updateProfileSettings,
  publicProfile,
  ensureCompetitionEvents,
  competitionCalendar,
  seasonArchive,
  seasonDetails,
  tournamentChampions,
  competitionOverview,
  _test: { safeText, uniqueTextList, eventStatus, seasonLabel, weekStart, monthStart },
};
