'use strict';

const db = require('./platform-db');
const gameStorage = require('./platform-game-storage');
const { dayKey } = require('./progression');

let schemaPromise = null;

const DAILY_MISSIONS = Object.freeze([
  { key: 'daily-play', title: 'Aufwärmrunde', text: 'Beende heute ein Quiz.', metric: 'games', target: 1, xp: 80, seasonPoints: 25, icon: '🎮' },
  { key: 'daily-answers', title: 'Wissensdurst', text: 'Beantworte heute 10 Fragen.', metric: 'answers', target: 10, xp: 100, seasonPoints: 30, icon: '🧠' },
  { key: 'daily-correct', title: 'Treffsicher', text: 'Beantworte heute 5 Fragen richtig.', metric: 'correct', target: 5, xp: 120, seasonPoints: 35, icon: '🎯' },
  { key: 'daily-online', title: 'Gemeinsam spielen', text: 'Beende heute ein Online-Spiel oder Duell.', metric: 'onlineGames', target: 1, xp: 140, seasonPoints: 40, icon: '🌐' },
]);

const WEEKLY_MISSIONS = Object.freeze([
  { key: 'weekly-games', title: 'Quizwoche', text: 'Beende in dieser Woche 5 Spiele.', metric: 'games', target: 5, xp: 350, seasonPoints: 120, icon: '📅' },
  { key: 'weekly-answers', title: '50 Antworten', text: 'Beantworte in dieser Woche 50 Fragen.', metric: 'answers', target: 50, xp: 450, seasonPoints: 150, icon: '⚡' },
  { key: 'weekly-duels', title: 'Duellmeister', text: 'Gewinne in dieser Woche 2 Freundesduelle.', metric: 'duelWins', target: 2, xp: 500, seasonPoints: 180, icon: '⚔️' },
  { key: 'weekly-official', title: 'Quiz der Woche', text: 'Schließe das offizielle Quiz der Woche ab.', metric: 'weeklyQuiz', target: 1, xp: 600, seasonPoints: 220, icon: '🏆', badge: 'weekly-finisher' },
]);

function mondayOf(date = new Date()) {
  const value = new Date(date);
  const day = value.getUTCDay() || 7;
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value;
}

function isoWeekKey(date = new Date()) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function leagueForPoints(value) {
  const points = Math.max(0, Number(value || 0));
  if (points >= 2500) return { id: 'master', name: 'Meister-Liga', icon: '👑', floor: 2500, next: null };
  if (points >= 1200) return { id: 'gold', name: 'Gold-Liga', icon: '🥇', floor: 1200, next: 2500 };
  if (points >= 500) return { id: 'silver', name: 'Silber-Liga', icon: '🥈', floor: 500, next: 1200 };
  return { id: 'bronze', name: 'Bronze-Liga', icon: '🥉', floor: 0, next: 500 };
}

function bracketSize(count) {
  let size = 2;
  while (size < Math.max(2, Number(count || 0))) size *= 2;
  return size;
}

async function ensureReady() {
  if (!await db.ready()) return false;
  if (!schemaPromise) schemaPromise = db.pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_phase10_rewards (
      profile_id UUID PRIMARY KEY REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      bonus_xp INTEGER NOT NULL DEFAULT 0,
      badges JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS quiz_phase10_season_points (
      season_id UUID NOT NULL REFERENCES quiz_platform_seasons(id) ON DELETE CASCADE,
      profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      points INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      games INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(season_id, profile_id)
    );
    CREATE TABLE IF NOT EXISTS quiz_phase10_mission_claims (
      profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      mission_key TEXT NOT NULL,
      period_key TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      reward_xp INTEGER NOT NULL DEFAULT 0,
      reward_season_points INTEGER NOT NULL DEFAULT 0,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(profile_id, mission_key, period_key)
    );
    CREATE TABLE IF NOT EXISTS quiz_phase10_duels (
      id UUID PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      challenger_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      opponent_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      best_of INTEGER NOT NULL DEFAULT 1,
      quiz_type TEXT NOT NULL DEFAULT 'adult',
      category TEXT NOT NULL DEFAULT 'Gemischt',
      status TEXT NOT NULL DEFAULT 'pending',
      challenger_wins INTEGER NOT NULL DEFAULT 0,
      opponent_wins INTEGER NOT NULL DEFAULT 0,
      current_round INTEGER NOT NULL DEFAULT 0,
      active_room_code TEXT,
      credentials_challenger JSONB,
      credentials_opponent JSONB,
      winner_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '7 days',
      CHECK(challenger_id <> opponent_id)
    );
    CREATE INDEX IF NOT EXISTS quiz_phase10_duels_profiles ON quiz_phase10_duels(challenger_id,opponent_id,updated_at DESC);
    CREATE TABLE IF NOT EXISTS quiz_phase10_duel_rounds (
      id UUID PRIMARY KEY,
      duel_id UUID NOT NULL REFERENCES quiz_phase10_duels(id) ON DELETE CASCADE,
      round_no INTEGER NOT NULL,
      room_code TEXT NOT NULL UNIQUE,
      winner_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
      scores JSONB NOT NULL DEFAULT '{}'::jsonb,
      completed_at TIMESTAMPTZ,
      UNIQUE(duel_id,round_no)
    );
    CREATE TABLE IF NOT EXISTS quiz_phase10_match_history (
      id UUID PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT,
      room_code TEXT,
      profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      opponent_profile_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
      result TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      opponent_score INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      wrong INTEGER NOT NULL DEFAULT 0,
      unanswered INTEGER NOT NULL DEFAULT 0,
      quiz_type TEXT,
      category TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(room_code,profile_id)
    );
    CREATE INDEX IF NOT EXISTS quiz_phase10_history_profile_time ON quiz_phase10_match_history(profile_id,played_at DESC);
    CREATE TABLE IF NOT EXISTS quiz_phase10_tournament_matches (
      id UUID PRIMARY KEY,
      tournament_id UUID NOT NULL REFERENCES quiz_platform_tournaments(id) ON DELETE CASCADE,
      round_no INTEGER NOT NULL,
      position INTEGER NOT NULL,
      profile_a UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
      profile_b UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
      winner_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
      score_a INTEGER,
      score_b INTEGER,
      room_code TEXT UNIQUE,
      credentials_a JSONB,
      credentials_b JSONB,
      status TEXT NOT NULL DEFAULT 'waiting',
      next_match_id UUID,
      next_slot TEXT,
      completed_at TIMESTAMPTZ,
      UNIQUE(tournament_id,round_no,position)
    );
    CREATE INDEX IF NOT EXISTS quiz_phase10_tournament_round ON quiz_phase10_tournament_matches(tournament_id,round_no,position);
    CREATE TABLE IF NOT EXISTS quiz_phase10_league_archive (
      season_id UUID NOT NULL REFERENCES quiz_platform_seasons(id) ON DELETE CASCADE,
      profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      league_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      points INTEGER NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'stayed',
      archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(season_id,profile_id)
    );
    CREATE TABLE IF NOT EXISTS quiz_phase10_events (
      id UUID PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      event_type TEXT NOT NULL DEFAULT 'official',
      quiz_type TEXT NOT NULL DEFAULT 'adult',
      category TEXT NOT NULL DEFAULT 'Gemischt',
      question_count INTEGER NOT NULL DEFAULT 10,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      reward_xp INTEGER NOT NULL DEFAULT 250,
      reward_season_points INTEGER NOT NULL DEFAULT 100,
      badge_id TEXT,
      community_target INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS quiz_phase10_events_active ON quiz_phase10_events(active,starts_at,ends_at);
    CREATE TABLE IF NOT EXISTS quiz_phase10_event_sessions (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES quiz_phase10_events(id) ON DELETE CASCADE,
      profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      question_ids JSONB NOT NULL,
      current_index INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      wrong INTEGER NOT NULL DEFAULT 0,
      answered BOOLEAN NOT NULL DEFAULT FALSE,
      result JSONB,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '2 hours',
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS quiz_phase10_event_entries (
      event_id UUID NOT NULL REFERENCES quiz_phase10_events(id) ON DELETE CASCADE,
      profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      best_score INTEGER NOT NULL DEFAULT 0,
      best_correct INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMPTZ,
      reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY(event_id,profile_id)
    );
  `).then(() => true).catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
  await ensureOfficialEvents();
  return true;
}

async function q(text, params = []) { await ensureReady(); return db.pool.query(text, params); }

async function addSeasonPoints(profileId, points, outcome = null) {
  const season = await gameStorage.activeSeason();
  const delta = Math.max(0, Math.round(Number(points || 0)));
  await q(`INSERT INTO quiz_phase10_season_points(season_id,profile_id,points,wins,losses,games)
    VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(season_id,profile_id) DO UPDATE SET points=quiz_phase10_season_points.points+EXCLUDED.points,
      wins=quiz_phase10_season_points.wins+EXCLUDED.wins,losses=quiz_phase10_season_points.losses+EXCLUDED.losses,
      games=quiz_phase10_season_points.games+EXCLUDED.games,updated_at=NOW()`,
  [season.id, profileId, delta, outcome === 'win' ? 1 : 0, outcome === 'loss' ? 1 : 0, outcome ? 1 : 0]);
  return season;
}

async function rewardProfile(profileId, xp, seasonPoints, badge = null) {
  const badgeList = badge ? [badge] : [];
  await q(`INSERT INTO quiz_phase10_rewards(profile_id,bonus_xp,badges) VALUES($1,$2,$3::jsonb)
    ON CONFLICT(profile_id) DO UPDATE SET bonus_xp=quiz_phase10_rewards.bonus_xp+EXCLUDED.bonus_xp,
      badges=(SELECT COALESCE(jsonb_agg(DISTINCT value),'[]'::jsonb) FROM jsonb_array_elements(quiz_phase10_rewards.badges||EXCLUDED.badges)),updated_at=NOW()`,
  [profileId, Math.max(0, Math.round(Number(xp || 0))), JSON.stringify(badgeList)]);
  if (seasonPoints) await addSeasonPoints(profileId, seasonPoints);
}

async function profileRewards(profileId) {
  const { rows } = await q('SELECT bonus_xp,badges,updated_at FROM quiz_phase10_rewards WHERE profile_id=$1', [profileId]);
  return rows[0] || { bonus_xp: 0, badges: [], updated_at: null };
}

async function createDuel(challengerId, opponentId, data = {}) {
  if (!opponentId || challengerId === opponentId) throw new Error('Bitte einen anderen Spieler auswählen.');
  const friend = await q(`SELECT 1 FROM quiz_platform_friendships WHERE status='accepted' AND ((profile_low=$1 AND profile_high=$2) OR (profile_low=$2 AND profile_high=$1))`, [challengerId, opponentId]);
  if (!friend.rowCount) throw new Error('Freundesduelle sind nur zwischen bestätigten Freunden möglich.');
  const open = await q(`SELECT 1 FROM quiz_phase10_duels WHERE status IN ('pending','active') AND ((challenger_id=$1 AND opponent_id=$2) OR (challenger_id=$2 AND opponent_id=$1)) LIMIT 1`, [challengerId, opponentId]);
  if (open.rowCount) throw new Error('Zwischen euch läuft bereits eine Duellanfrage oder Serie.');
  const id = db.crypto.randomUUID();
  const code = db.randomCode(8);
  const bestOf = [1, 3, 5].includes(Number(data.bestOf)) ? Number(data.bestOf) : 1;
  const quizType = data.quizType === 'child' ? 'child' : 'adult';
  const category = db.safeText(data.category || 'Gemischt', 50) || 'Gemischt';
  const { rows } = await q(`INSERT INTO quiz_phase10_duels(id,code,challenger_id,opponent_id,best_of,quiz_type,category)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, code, challengerId, opponentId, bestOf, quizType, category]);
  return rows[0];
}

async function listDuels(profileId) {
  const { rows } = await q(`SELECT d.*,c.name AS challenger_name,c.avatar_id AS challenger_avatar,o.name AS opponent_name,o.avatar_id AS opponent_avatar,
    CASE WHEN d.challenger_id=$1 THEN d.credentials_challenger ELSE d.credentials_opponent END AS credentials
    FROM quiz_phase10_duels d JOIN quiz_solo_profiles c ON c.id=d.challenger_id JOIN quiz_solo_profiles o ON o.id=d.opponent_id
    WHERE d.challenger_id=$1 OR d.opponent_id=$1 ORDER BY d.updated_at DESC LIMIT 100`, [profileId]);
  return rows.map(row => ({ ...row, credentials_challenger: undefined, credentials_opponent: undefined }));
}

async function duelDetails(id, profileId) {
  const { rows } = await q(`SELECT d.*,c.name AS challenger_name,o.name AS opponent_name,
    CASE WHEN d.challenger_id=$2 THEN d.credentials_challenger ELSE d.credentials_opponent END AS credentials
    FROM quiz_phase10_duels d JOIN quiz_solo_profiles c ON c.id=d.challenger_id JOIN quiz_solo_profiles o ON o.id=d.opponent_id
    WHERE d.id=$1 AND (d.challenger_id=$2 OR d.opponent_id=$2)`, [id, profileId]);
  if (!rows[0]) return null;
  const rounds = await q(`SELECT r.*,p.name AS winner_name FROM quiz_phase10_duel_rounds r LEFT JOIN quiz_solo_profiles p ON p.id=r.winner_id WHERE r.duel_id=$1 ORDER BY round_no`, [id]);
  return { ...rows[0], credentials_challenger: undefined, credentials_opponent: undefined, rounds: rounds.rows };
}

async function respondDuel(id, profileId, accept) {
  const { rows } = await q(`UPDATE quiz_phase10_duels SET status=$3,updated_at=NOW() WHERE id=$1 AND opponent_id=$2 AND status='pending' RETURNING *`, [id, profileId, accept ? 'active' : 'declined']);
  if (!rows[0]) throw new Error('Duellanfrage nicht gefunden oder bereits bearbeitet.');
  return rows[0];
}

async function cancelDuel(id, profileId) {
  const { rows } = await q(`UPDATE quiz_phase10_duels SET status='cancelled',updated_at=NOW() WHERE id=$1 AND (challenger_id=$2 OR opponent_id=$2) AND status IN ('pending','active') RETURNING *`, [id, profileId]);
  if (!rows[0]) throw new Error('Duell kann nicht mehr abgebrochen werden.');
  return rows[0];
}

async function duelForRoomCreation(id, profileId) {
  const { rows } = await q(`SELECT d.*,c.name AS challenger_name,o.name AS opponent_name FROM quiz_phase10_duels d
    JOIN quiz_solo_profiles c ON c.id=d.challenger_id JOIN quiz_solo_profiles o ON o.id=d.opponent_id
    WHERE d.id=$1 AND (d.challenger_id=$2 OR d.opponent_id=$2) AND d.status='active'`, [id, profileId]);
  const duel = rows[0];
  if (!duel) throw new Error('Aktive Duellserie nicht gefunden.');
  if (duel.active_room_code) throw new Error('Die aktuelle Duellrunde wurde bereits vorbereitet.');
  const needed = Math.floor(duel.best_of / 2) + 1;
  if (duel.challenger_wins >= needed || duel.opponent_wins >= needed) throw new Error('Diese Duellserie ist bereits entschieden.');
  return duel;
}

async function setDuelRoom(id, roomCode, credentialsChallenger, credentialsOpponent) {
  const { rows } = await q(`UPDATE quiz_phase10_duels SET current_round=current_round+1,active_room_code=$2,
    credentials_challenger=$3::jsonb,credentials_opponent=$4::jsonb,updated_at=NOW() WHERE id=$1 AND status='active' RETURNING *`,
  [id, roomCode, JSON.stringify(credentialsChallenger), JSON.stringify(credentialsOpponent)]);
  if (!rows[0]) throw new Error('Duellraum konnte nicht gespeichert werden.');
  await q(`INSERT INTO quiz_phase10_duel_rounds(id,duel_id,round_no,room_code) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [db.crypto.randomUUID(), id, rows[0].current_round, roomCode]);
  return rows[0];
}

async function createHistoryEntry(data) {
  await q(`INSERT INTO quiz_phase10_match_history(id,source_type,source_id,room_code,profile_id,opponent_profile_id,result,score,opponent_score,correct,wrong,unanswered,quiz_type,category,metadata,played_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,NOW()) ON CONFLICT(room_code,profile_id) DO NOTHING`,
  [db.crypto.randomUUID(), data.sourceType, data.sourceId || null, data.roomCode || null, data.profileId, data.opponentProfileId || null, data.result,
    data.score || 0, data.opponentScore || 0, data.correct || 0, data.wrong || 0, data.unanswered || 0, data.quizType || null, data.category || null, JSON.stringify(data.metadata || {})]);
}

async function recordRoomResult(room) {
  await ensureReady();
  const players = Object.values(room?.players || {}).filter(player => player.profileId);
  if (!players.length || !room?.code || room.competitionRecordedAt) return false;
  const ranking = [...players].sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.correct || 0) - Number(a.correct || 0));
  const best = Number(ranking[0]?.score || 0);
  const winners = ranking.filter(player => Number(player.score || 0) === best);
  const sourceType = room.duelId ? 'duel' : room.tournamentMatchId ? 'tournament' : 'online';
  for (const player of players) {
    const opponent = players.find(item => item.profileId !== player.profileId) || null;
    const result = winners.length > 1 ? 'draw' : winners[0]?.profileId === player.profileId ? 'win' : 'loss';
    await createHistoryEntry({ sourceType, sourceId: room.duelId || room.tournamentMatchId || null, roomCode: room.code, profileId: player.profileId,
      opponentProfileId: opponent?.profileId, result, score: player.score, opponentScore: opponent?.score || 0, correct: player.correct, wrong: player.wrong,
      unanswered: player.unanswered, quizType: room.quizType, category: room.category, metadata: { title: room.title, gameMode: room.gameMode } });
    await q(`INSERT INTO quiz_platform_match_results(id,room_code,profile_id,score,correct,placement,won,finished_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(room_code,profile_id) DO NOTHING`,
    [db.crypto.randomUUID(), room.code, player.profileId, Number(player.score || 0), Number(player.correct || 0), ranking.findIndex(item => item.id === player.id) + 1, result === 'win']);
    await addSeasonPoints(player.profileId, Math.max(10, Math.max(0, Number(player.score || 0)) + Number(player.correct || 0) * 5 + (result === 'win' ? 60 : result === 'draw' ? 30 : 15)), result === 'win' ? 'win' : result === 'loss' ? 'loss' : null);
  }
  if (room.duelId) await completeDuelRound(room.duelId, room.code, ranking);
  if (room.tournamentMatchId) await completeTournamentMatch(room.tournamentMatchId, ranking);
  room.competitionRecordedAt = Date.now();
  return true;
}

async function completeDuelRound(duelId, roomCode, ranking) {
  const duelResult = await q('SELECT * FROM quiz_phase10_duels WHERE id=$1 FOR UPDATE', [duelId]);
  const duel = duelResult.rows[0];
  if (!duel || duel.status !== 'active') return false;
  const topScore = Number(ranking[0]?.score || 0);
  const tied = ranking.filter(player => Number(player.score || 0) === topScore);
  const winnerId = tied.length === 1 ? ranking[0].profileId : null;
  const scores = Object.fromEntries(ranking.map(player => [player.profileId, Number(player.score || 0)]));
  await q(`UPDATE quiz_phase10_duel_rounds SET winner_id=$3,scores=$4::jsonb,completed_at=NOW() WHERE duel_id=$1 AND room_code=$2`, [duelId, roomCode, winnerId, JSON.stringify(scores)]);
  let challengerWins = Number(duel.challenger_wins || 0);
  let opponentWins = Number(duel.opponent_wins || 0);
  if (winnerId === duel.challenger_id) challengerWins += 1;
  if (winnerId === duel.opponent_id) opponentWins += 1;
  const needed = Math.floor(Number(duel.best_of) / 2) + 1;
  const completed = challengerWins >= needed || opponentWins >= needed;
  const seriesWinner = completed ? (challengerWins > opponentWins ? duel.challenger_id : duel.opponent_id) : null;
  await q(`UPDATE quiz_phase10_duels SET challenger_wins=$2,opponent_wins=$3,status=$4,winner_id=$5,active_room_code=NULL,
    credentials_challenger=NULL,credentials_opponent=NULL,updated_at=NOW() WHERE id=$1`, [duelId, challengerWins, opponentWins, completed ? 'completed' : 'active', seriesWinner]);
  if (seriesWinner) {
    await rewardProfile(seriesWinner, 250 + Number(duel.best_of) * 50, 120 + Number(duel.best_of) * 20, 'duel-winner');
  }
  return true;
}

async function history(profileId, { type = 'all', days = 365, limit = 100 } = {}) {
  const since = new Date(Date.now() - Math.max(1, Math.min(3650, Number(days) || 365)) * 86400000);
  const online = await q(`SELECT h.*,op.name AS opponent_name FROM quiz_phase10_match_history h LEFT JOIN quiz_solo_profiles op ON op.id=h.opponent_profile_id
    WHERE h.profile_id=$1 AND h.played_at>=$2 AND ($3='all' OR h.source_type=$3) ORDER BY h.played_at DESC LIMIT $4`, [profileId, since, type, Math.max(1, Math.min(300, Number(limit) || 100))]);
  let solo = [];
  if (type === 'all' || type === 'solo') {
    const result = await q(`SELECT session_id::text AS source_id,MIN(answered_at) AS started_at,MAX(answered_at) AS played_at,quiz_type,
      CASE WHEN COUNT(DISTINCT category)=1 THEN MIN(category) ELSE 'Gemischt' END AS category,SUM(delta)::int AS score,
      COUNT(*) FILTER(WHERE correct)::int AS correct,COUNT(*) FILTER(WHERE NOT correct AND NOT timed_out)::int AS wrong,
      COUNT(*) FILTER(WHERE timed_out)::int AS unanswered,COUNT(*)::int AS questions
      FROM quiz_solo_attempts WHERE profile_id=$1 AND answered_at>=$2 GROUP BY session_id,quiz_type ORDER BY played_at DESC LIMIT $3`, [profileId, since, Math.max(1, Math.min(300, Number(limit) || 100))]);
    solo = result.rows.map(row => ({ id: `solo-${row.source_id}`, source_type: 'solo', source_id: row.source_id, result: 'completed', opponent_name: null, opponent_score: 0, ...row }));
  }
  return [...online.rows, ...solo].sort((a, b) => new Date(b.played_at) - new Date(a.played_at)).slice(0, Math.max(1, Math.min(300, Number(limit) || 100)));
}

async function missionMetrics(profileId, start, end) {
  const { rows } = await q(`WITH solo AS (
      SELECT COUNT(DISTINCT session_id)::int games,COUNT(*)::int answers,COUNT(*) FILTER(WHERE correct)::int correct
      FROM quiz_solo_attempts WHERE profile_id=$1 AND answered_at>=$2 AND answered_at<$3
    ), matches AS (
      SELECT COUNT(DISTINCT room_code)::int games,COUNT(*) FILTER(WHERE result='win' AND source_type='duel')::int duel_wins
      FROM quiz_phase10_match_history WHERE profile_id=$1 AND played_at>=$2 AND played_at<$3
    ), weekly AS (
      SELECT COUNT(*)::int completed FROM quiz_phase10_event_entries ee JOIN quiz_phase10_events e ON e.id=ee.event_id
      WHERE ee.profile_id=$1 AND ee.completed_at>=$2 AND ee.completed_at<$3 AND e.event_type='weekly'
    ) SELECT COALESCE(s.games,0)+COALESCE(m.games,0) games,COALESCE(s.answers,0) answers,COALESCE(s.correct,0) correct,
      COALESCE(m.games,0) online_games,COALESCE(m.duel_wins,0) duel_wins,CASE WHEN COALESCE(w.completed,0)>0 THEN 1 ELSE 0 END weekly_quiz
    FROM solo s CROSS JOIN matches m CROSS JOIN weekly w`, [profileId, start, end]);
  const row = rows[0] || {};
  return { games: Number(row.games || 0), answers: Number(row.answers || 0), correct: Number(row.correct || 0), onlineGames: Number(row.online_games || 0), duelWins: Number(row.duel_wins || 0), weeklyQuiz: Number(row.weekly_quiz || 0) };
}

async function missions(profileId, date = new Date()) {
  const dayStart = new Date(`${dayKey(date)}T00:00:00+02:00`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const weekStart = mondayOf(date);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  const [dailyMetrics, weeklyMetrics, claims] = await Promise.all([
    missionMetrics(profileId, dayStart, dayEnd), missionMetrics(profileId, weekStart, weekEnd),
    q('SELECT mission_key,period_key,claimed_at FROM quiz_phase10_mission_claims WHERE profile_id=$1 AND period_key IN ($2,$3)', [profileId, dayKey(date), isoWeekKey(date)]),
  ]);
  const claimed = new Set(claims.rows.map(row => `${row.mission_key}:${row.period_key}`));
  const map = (mission, period, metrics) => {
    const progress = Math.min(mission.target, Number(metrics[mission.metric] || 0));
    return { ...mission, period, progress, completed: progress >= mission.target, claimed: claimed.has(`${mission.key}:${period}`) };
  };
  return {
    dayKey: dayKey(date), weekKey: isoWeekKey(date),
    daily: DAILY_MISSIONS.map(item => map(item, dayKey(date), dailyMetrics)),
    weekly: WEEKLY_MISSIONS.map(item => map(item, isoWeekKey(date), weeklyMetrics)),
  };
}

async function claimMission(profileId, missionKey, date = new Date()) {
  const current = await missions(profileId, date);
  const mission = [...current.daily, ...current.weekly].find(item => item.key === missionKey);
  if (!mission) throw new Error('Mission wurde nicht gefunden.');
  if (!mission.completed) throw new Error('Diese Mission ist noch nicht abgeschlossen.');
  const result = await q(`INSERT INTO quiz_phase10_mission_claims(profile_id,mission_key,period_key,progress,reward_xp,reward_season_points)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *`, [profileId, mission.key, mission.period, mission.progress, mission.xp, mission.seasonPoints]);
  if (!result.rowCount) throw new Error('Diese Belohnung wurde bereits abgeholt.');
  await rewardProfile(profileId, mission.xp, mission.seasonPoints, mission.badge || null);
  return { mission: { ...mission, claimed: true }, rewards: await profileRewards(profileId) };
}

async function leagueBoard(profileId, limit = 100) {
  const season = await gameStorage.activeSeason();
  const { rows } = await q(`WITH solo AS (
      SELECT profile_id,(COUNT(DISTINCT session_id)*20+COUNT(*) FILTER(WHERE correct)*5+GREATEST(COALESCE(SUM(delta),0),0))::int points
      FROM quiz_solo_attempts WHERE answered_at BETWEEN $1 AND $2 GROUP BY profile_id
    ), extra AS (SELECT profile_id,points,wins,losses,games FROM quiz_phase10_season_points WHERE season_id=$3)
    SELECT p.id,p.name,p.avatar_id,(COALESCE(s.points,0)+COALESCE(e.points,0))::int points,COALESCE(e.wins,0)::int wins,
      COALESCE(e.losses,0)::int losses,COALESCE(e.games,0)::int online_games
    FROM quiz_solo_profiles p LEFT JOIN solo s ON s.profile_id=p.id LEFT JOIN extra e ON e.profile_id=p.id
    ORDER BY points DESC,p.name LIMIT $4`, [season.starts_at, season.ends_at, season.id, Math.max(10, Math.min(300, Number(limit) || 100))]);
  const buckets = { master: [], gold: [], silver: [], bronze: [] };
  rows.forEach(row => { const league = leagueForPoints(row.points); buckets[league.id].push({ ...row, league }); });
  Object.values(buckets).forEach(entries => entries.forEach((entry, index) => {
    entry.rank = index + 1;
    entry.outcome = index < Math.max(1, Math.ceil(entries.length * 0.15)) && entry.league.id !== 'master' ? 'promotion' : index >= Math.floor(entries.length * 0.85) && entries.length >= 5 && entry.league.id !== 'bronze' ? 'relegation' : 'stay';
  }));
  const leaderboard = ['master', 'gold', 'silver', 'bronze'].flatMap(id => buckets[id]);
  return { season, leaderboard, me: leaderboard.find(entry => entry.id === profileId) || null, leagues: buckets };
}

async function settleSeason() {
  const board = await leagueBoard(null, 1000);
  for (const [leagueId, entries] of Object.entries(board.leagues)) {
    for (const entry of entries) await q(`INSERT INTO quiz_phase10_league_archive(season_id,profile_id,league_id,rank,points,outcome)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(season_id,profile_id) DO UPDATE SET league_id=EXCLUDED.league_id,rank=EXCLUDED.rank,points=EXCLUDED.points,outcome=EXCLUDED.outcome`,
    [board.season.id, entry.id, leagueId, entry.rank, entry.points, entry.outcome]);
  }
  await q('UPDATE quiz_platform_seasons SET active=FALSE WHERE id=$1', [board.season.id]);
  return gameStorage.activeSeason();
}

async function generateBracket(code, actorId = null, isAdmin = false) {
  const tournamentResult = await q('SELECT * FROM quiz_platform_tournaments WHERE code=$1', [db.safeCode(code, 8)]);
  const tournament = tournamentResult.rows[0];
  if (!tournament) throw new Error('Turnier nicht gefunden.');
  if (!isAdmin && tournament.owner_id !== actorId) throw new Error('Nur der Turnierveranstalter kann den Turnierbaum starten.');
  if (tournament.format !== 'knockout') throw new Error('Ein Turnierbaum ist nur für K.-o.-Turniere verfügbar.');
  const existing = await q('SELECT 1 FROM quiz_phase10_tournament_matches WHERE tournament_id=$1 LIMIT 1', [tournament.id]);
  if (existing.rowCount) return bracketDetails(code);
  const players = (await q(`SELECT tp.profile_id,p.name FROM quiz_platform_tournament_players tp JOIN quiz_solo_profiles p ON p.id=tp.profile_id WHERE tp.tournament_id=$1 ORDER BY tp.joined_at,p.name`, [tournament.id])).rows;
  if (players.length < 2) throw new Error('Mindestens zwei Teilnehmer sind erforderlich.');
  const size = bracketSize(players.length);
  const rounds = Math.log2(size);
  const ids = [];
  for (let round = 1; round <= rounds; round += 1) {
    ids[round] = [];
    for (let position = 1; position <= size / (2 ** round); position += 1) ids[round][position] = db.crypto.randomUUID();
  }
  for (let round = 1; round <= rounds; round += 1) {
    for (let position = 1; position <= size / (2 ** round); position += 1) {
      const nextId = round < rounds ? ids[round + 1][Math.ceil(position / 2)] : null;
      const nextSlot = round < rounds ? (position % 2 === 1 ? 'a' : 'b') : null;
      await q(`INSERT INTO quiz_phase10_tournament_matches(id,tournament_id,round_no,position,next_match_id,next_slot) VALUES($1,$2,$3,$4,$5,$6)`, [ids[round][position], tournament.id, round, position, nextId, nextSlot]);
    }
  }
  const seeded = [...players];
  while (seeded.length < size) seeded.push(null);
  for (let position = 1; position <= size / 2; position += 1) {
    const a = seeded[position - 1];
    const b = seeded[size - position];
    await q(`UPDATE quiz_phase10_tournament_matches SET profile_a=$2,profile_b=$3,status=$4 WHERE id=$1`, [ids[1][position], a?.profile_id || null, b?.profile_id || null, a && b ? 'ready' : 'waiting']);
    if ((a && !b) || (!a && b)) await advanceTournamentWinner(ids[1][position], (a || b).profile_id, 0, 0, true);
  }
  await q(`UPDATE quiz_platform_tournaments SET status='running',updated_at=NOW() WHERE id=$1`, [tournament.id]);
  return bracketDetails(code);
}

async function advanceTournamentWinner(matchId, winnerId, scoreA, scoreB, bye = false) {
  const matchResult = await q('SELECT * FROM quiz_phase10_tournament_matches WHERE id=$1', [matchId]);
  const match = matchResult.rows[0];
  if (!match || match.status === 'completed') return false;
  await q(`UPDATE quiz_phase10_tournament_matches SET winner_id=$2,score_a=$3,score_b=$4,status='completed',completed_at=NOW() WHERE id=$1`, [matchId, winnerId, scoreA, scoreB]);
  if (match.next_match_id) {
    const column = match.next_slot === 'b' ? 'profile_b' : 'profile_a';
    await q(`UPDATE quiz_phase10_tournament_matches SET ${column}=$2,status=CASE WHEN ${column === 'profile_a' ? 'profile_b' : 'profile_a'} IS NOT NULL THEN 'ready' ELSE status END WHERE id=$1`, [match.next_match_id, winnerId]);
  } else {
    await q(`UPDATE quiz_platform_tournaments SET status='finished',updated_at=NOW() WHERE id=$1`, [match.tournament_id]);
    if (!bye) await rewardProfile(winnerId, 1000, 500, 'tournament-champion');
  }
  return true;
}

async function completeTournamentMatch(matchId, ranking) {
  const matchResult = await q('SELECT * FROM quiz_phase10_tournament_matches WHERE id=$1', [matchId]);
  const match = matchResult.rows[0];
  if (!match || match.status === 'completed') return false;
  const scoreA = Number(ranking.find(player => player.profileId === match.profile_a)?.score || 0);
  const scoreB = Number(ranking.find(player => player.profileId === match.profile_b)?.score || 0);
  let winnerId = scoreA > scoreB ? match.profile_a : scoreB > scoreA ? match.profile_b : null;
  if (!winnerId) {
    const correctA = Number(ranking.find(player => player.profileId === match.profile_a)?.correct || 0);
    const correctB = Number(ranking.find(player => player.profileId === match.profile_b)?.correct || 0);
    winnerId = correctA >= correctB ? match.profile_a : match.profile_b;
  }
  return advanceTournamentWinner(matchId, winnerId, scoreA, scoreB);
}

async function tournamentMatchForRoom(matchId, profileId, isAdmin = false) {
  const { rows } = await q(`SELECT m.*,t.code,t.name,t.owner_id,pa.name AS profile_a_name,pb.name AS profile_b_name FROM quiz_phase10_tournament_matches m
    JOIN quiz_platform_tournaments t ON t.id=m.tournament_id LEFT JOIN quiz_solo_profiles pa ON pa.id=m.profile_a LEFT JOIN quiz_solo_profiles pb ON pb.id=m.profile_b
    WHERE m.id=$1`, [matchId]);
  const match = rows[0];
  if (!match || match.status !== 'ready' || !match.profile_a || !match.profile_b) throw new Error('Diese Turnierpartie ist noch nicht spielbereit.');
  if (!isAdmin && ![match.owner_id, match.profile_a, match.profile_b].includes(profileId)) throw new Error('Keine Berechtigung für diese Turnierpartie.');
  if (match.room_code) throw new Error('Für diese Partie wurde bereits ein Raum erstellt.');
  return match;
}

async function setTournamentRoom(matchId, roomCode, credentialsA, credentialsB) {
  const { rows } = await q(`UPDATE quiz_phase10_tournament_matches SET room_code=$2,credentials_a=$3::jsonb,credentials_b=$4::jsonb,status='playing' WHERE id=$1 RETURNING *`, [matchId, roomCode, JSON.stringify(credentialsA), JSON.stringify(credentialsB)]);
  return rows[0] || null;
}

async function bracketDetails(code, profileId = null) {
  const tournamentResult = await q(`SELECT t.*,owner.name AS owner_name FROM quiz_platform_tournaments t JOIN quiz_solo_profiles owner ON owner.id=t.owner_id WHERE t.code=$1`, [db.safeCode(code, 8)]);
  const tournament = tournamentResult.rows[0];
  if (!tournament) return null;
  const { rows } = await q(`SELECT m.*,pa.name AS profile_a_name,pb.name AS profile_b_name,pw.name AS winner_name,
    CASE WHEN m.profile_a=$2 THEN m.credentials_a WHEN m.profile_b=$2 THEN m.credentials_b ELSE NULL END AS credentials
    FROM quiz_phase10_tournament_matches m LEFT JOIN quiz_solo_profiles pa ON pa.id=m.profile_a LEFT JOIN quiz_solo_profiles pb ON pb.id=m.profile_b
    LEFT JOIN quiz_solo_profiles pw ON pw.id=m.winner_id WHERE m.tournament_id=$1 ORDER BY m.round_no,m.position`, [tournament.id, profileId]);
  return { tournament, matches: rows.map(row => ({ ...row, credentials_a: undefined, credentials_b: undefined })) };
}

async function ensureOfficialEvents(date = new Date()) {
  if (!db.enabled()) return false;
  const weekStart = mondayOf(date);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  const weekKey = isoWeekKey(date);
  const categories = ['Allgemeinwissen', 'Natur & Wissenschaft', 'Geschichte', 'Geografie', 'Sport', 'Film & Fernsehen'];
  const numericWeek = Number(weekKey.slice(-2));
  const category = categories[numericWeek % categories.length];
  await db.pool.query(`INSERT INTO quiz_phase10_events(id,slug,title,description,event_type,quiz_type,category,question_count,starts_at,ends_at,reward_xp,reward_season_points,badge_id,community_target,settings)
    VALUES($1,$2,$3,$4,'weekly','adult',$5,10,$6,$7,600,220,$8,250,$9::jsonb) ON CONFLICT(slug) DO NOTHING`,
  [db.crypto.randomUUID(), `quiz-der-woche-${weekKey.toLowerCase()}`, `Quiz der Woche · ${category}`, `Zehn offizielle Fragen aus der Kategorie ${category}. Deine beste Runde zählt für die Wochenrangliste.`, category, weekStart, weekEnd, `weekly-${weekKey}`, JSON.stringify({ maxAttempts: 5, featured: true })]);
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const monthKey = monthStart.toISOString().slice(0, 7);
  await db.pool.query(`INSERT INTO quiz_phase10_events(id,slug,title,description,event_type,quiz_type,category,question_count,starts_at,ends_at,reward_xp,reward_season_points,badge_id,community_target,settings)
    VALUES($1,$2,$3,$4,'monthly','adult','Gemischt',15,$5,$6,900,350,$7,1000,$8::jsonb) ON CONFLICT(slug) DO NOTHING`,
  [db.crypto.randomUUID(), `monats-challenge-${monthKey}`, 'Monats-Challenge', 'Das große offizielle Monatsquiz mit 15 gemischten Fragen und einem gemeinsamen Community-Ziel.', monthStart, monthEnd, `monthly-${monthKey}`, JSON.stringify({ maxAttempts: 10, featured: true })]);
  return true;
}

async function listEvents(profileId) {
  await ensureOfficialEvents();
  const { rows } = await q(`SELECT e.*,COALESCE(ee.best_score,0)::int best_score,COALESCE(ee.best_correct,0)::int best_correct,COALESCE(ee.attempts,0)::int attempts,
    ee.completed_at,ee.reward_claimed,(SELECT COUNT(*)::int FROM quiz_phase10_event_entries x WHERE x.event_id=e.id AND x.completed_at IS NOT NULL) participants,
    (SELECT COALESCE(SUM(best_correct),0)::int FROM quiz_phase10_event_entries x WHERE x.event_id=e.id) community_progress
    FROM quiz_phase10_events e LEFT JOIN quiz_phase10_event_entries ee ON ee.event_id=e.id AND ee.profile_id=$1
    WHERE e.active AND e.ends_at>NOW() ORDER BY (e.settings->>'featured')::boolean DESC,e.starts_at`, [profileId]);
  return rows;
}

async function eventById(id) {
  const { rows } = await q('SELECT * FROM quiz_phase10_events WHERE id=$1 AND active AND starts_at<=NOW() AND ends_at>NOW()', [id]);
  return rows[0] || null;
}

async function createEventSession(profileId, eventId, questionIds) {
  const event = await eventById(eventId);
  if (!event) throw new Error('Dieses Event ist aktuell nicht verfügbar.');
  const existing = await q('SELECT attempts FROM quiz_phase10_event_entries WHERE event_id=$1 AND profile_id=$2', [eventId, profileId]);
  const maxAttempts = Math.max(1, Number(event.settings?.maxAttempts || 5));
  if (Number(existing.rows[0]?.attempts || 0) >= maxAttempts) throw new Error('Du hast die maximale Zahl an Versuchen für dieses Event erreicht.');
  const id = db.crypto.randomUUID();
  const { rows } = await q(`INSERT INTO quiz_phase10_event_sessions(id,event_id,profile_id,question_ids) VALUES($1,$2,$3,$4::jsonb) RETURNING *`, [id, eventId, profileId, JSON.stringify(questionIds)]);
  return { event, session: rows[0] };
}

async function eventSession(id, profileId) {
  const { rows } = await q(`SELECT s.*,e.title,e.quiz_type,e.category,e.question_count,e.reward_xp,e.reward_season_points,e.badge_id,e.ends_at
    FROM quiz_phase10_event_sessions s JOIN quiz_phase10_events e ON e.id=s.event_id WHERE s.id=$1 AND s.profile_id=$2 AND s.expires_at>NOW()`, [id, profileId]);
  return rows[0] || null;
}

async function updateEventSession(id, profileId, patch) {
  const { rows } = await q(`UPDATE quiz_phase10_event_sessions SET current_index=$3,score=$4,correct=$5,wrong=$6,answered=$7,result=$8::jsonb,
    completed_at=CASE WHEN $9 THEN NOW() ELSE completed_at END WHERE id=$1 AND profile_id=$2 RETURNING *`,
  [id, profileId, patch.currentIndex, patch.score, patch.correct, patch.wrong, Boolean(patch.answered), JSON.stringify(patch.result || null), Boolean(patch.completed)]);
  if (!rows[0]) throw new Error('Event-Sitzung wurde nicht gefunden.');
  if (patch.completed) await completeEventEntry(rows[0]);
  return rows[0];
}

async function completeEventEntry(session) {
  const { rows } = await q(`INSERT INTO quiz_phase10_event_entries(event_id,profile_id,best_score,best_correct,attempts,completed_at)
    VALUES($1,$2,$3,$4,1,NOW()) ON CONFLICT(event_id,profile_id) DO UPDATE SET best_score=GREATEST(quiz_phase10_event_entries.best_score,EXCLUDED.best_score),
    best_correct=GREATEST(quiz_phase10_event_entries.best_correct,EXCLUDED.best_correct),attempts=quiz_phase10_event_entries.attempts+1,completed_at=NOW() RETURNING *`,
  [session.event_id, session.profile_id, session.score, session.correct]);
  return rows[0];
}

async function claimEventReward(profileId, eventId) {
  const result = await q(`UPDATE quiz_phase10_event_entries SET reward_claimed=TRUE WHERE event_id=$1 AND profile_id=$2 AND completed_at IS NOT NULL AND NOT reward_claimed RETURNING *`, [eventId, profileId]);
  if (!result.rowCount) throw new Error('Belohnung nicht verfügbar oder bereits abgeholt.');
  const event = await q('SELECT * FROM quiz_phase10_events WHERE id=$1', [eventId]);
  const value = event.rows[0];
  await rewardProfile(profileId, value.reward_xp, value.reward_season_points, value.badge_id || null);
  return { entry: result.rows[0], rewards: await profileRewards(profileId) };
}

async function eventLeaderboard(eventId, limit = 100) {
  const { rows } = await q(`SELECT p.id,p.name,p.avatar_id,ee.best_score,ee.best_correct,ee.attempts,ee.completed_at
    FROM quiz_phase10_event_entries ee JOIN quiz_solo_profiles p ON p.id=ee.profile_id WHERE ee.event_id=$1 AND ee.completed_at IS NOT NULL
    ORDER BY ee.best_score DESC,ee.best_correct DESC,ee.completed_at LIMIT $2`, [eventId, Math.max(1, Math.min(200, Number(limit) || 100))]);
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

async function adminEvents() {
  const { rows } = await q(`SELECT e.*,(SELECT COUNT(*)::int FROM quiz_phase10_event_entries x WHERE x.event_id=e.id) participants,
    (SELECT COALESCE(SUM(best_correct),0)::int FROM quiz_phase10_event_entries x WHERE x.event_id=e.id) community_progress FROM quiz_phase10_events e ORDER BY e.starts_at DESC LIMIT 200`);
  return rows;
}

async function saveEvent(data, id = null) {
  const values = {
    title: db.safeText(data.title, 120), description: db.safeText(data.description, 600), eventType: ['weekly','monthly','special'].includes(data.eventType) ? data.eventType : 'special',
    quizType: data.quizType === 'child' ? 'child' : 'adult', category: db.safeText(data.category || 'Gemischt', 50) || 'Gemischt',
    questionCount: Math.max(5, Math.min(25, Number(data.questionCount) || 10)), startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt),
    rewardXp: Math.max(0, Math.min(5000, Number(data.rewardXp) || 250)), rewardSeasonPoints: Math.max(0, Math.min(2000, Number(data.rewardSeasonPoints) || 100)),
    badgeId: db.safeText(data.badgeId, 80) || null, communityTarget: Math.max(0, Number(data.communityTarget) || 0), active: data.active !== false,
  };
  if (!values.title || Number.isNaN(values.startsAt.getTime()) || Number.isNaN(values.endsAt.getTime()) || values.endsAt <= values.startsAt) throw new Error('Eventdaten sind unvollständig.');
  if (id) {
    const { rows } = await q(`UPDATE quiz_phase10_events SET title=$2,description=$3,event_type=$4,quiz_type=$5,category=$6,question_count=$7,starts_at=$8,ends_at=$9,
      reward_xp=$10,reward_season_points=$11,badge_id=$12,community_target=$13,active=$14,updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id, values.title, values.description, values.eventType, values.quizType, values.category, values.questionCount, values.startsAt, values.endsAt, values.rewardXp, values.rewardSeasonPoints, values.badgeId, values.communityTarget, values.active]);
    return rows[0] || null;
  }
  const slug = `${values.eventType}-${Date.now()}-${db.randomCode(4).toLowerCase()}`;
  const { rows } = await q(`INSERT INTO quiz_phase10_events(id,slug,title,description,event_type,quiz_type,category,question_count,starts_at,ends_at,reward_xp,reward_season_points,badge_id,community_target,active)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`, [db.crypto.randomUUID(), slug, values.title, values.description, values.eventType, values.quizType, values.category, values.questionCount, values.startsAt, values.endsAt, values.rewardXp, values.rewardSeasonPoints, values.badgeId, values.communityTarget, values.active]);
  return rows[0];
}

module.exports = {
  ensureReady, DAILY_MISSIONS, WEEKLY_MISSIONS, isoWeekKey, leagueForPoints, bracketSize,
  addSeasonPoints, rewardProfile, profileRewards,
  createDuel, listDuels, duelDetails, respondDuel, cancelDuel, duelForRoomCreation, setDuelRoom,
  recordRoomResult, history, missions, claimMission, leagueBoard, settleSeason,
  generateBracket, bracketDetails, tournamentMatchForRoom, setTournamentRoom,
  listEvents, eventById, createEventSession, eventSession, updateEventSession, claimEventReward, eventLeaderboard,
  adminEvents, saveEvent,
};