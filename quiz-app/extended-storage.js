'use strict';

const { Pool } = require('pg');
const {
  progressionSummary,
  streakSummary,
  achievementList,
  dayKey,
} = require('./progression');

const rawUrl = String(process.env.DATABASE_URL || '').trim();
const AVATAR_IDS = Object.freeze(['robot', 'fox', 'owl', 'rocket', 'crown', 'crystal']);
let pool = null;
let readyPromise = null;

function strictConnectionString(value) {
  if (!value) return '';
  const parsed = new URL(value);
  parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
}

function normalizeAvatarId(value) {
  const id = String(value || '').trim().toLowerCase();
  return AVATAR_IDS.includes(id) ? id : 'robot';
}

function isAvatarId(value) {
  return AVATAR_IDS.includes(String(value || '').trim().toLowerCase());
}

if (rawUrl) {
  pool = new Pool({
    connectionString: strictConnectionString(rawUrl),
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

async function ensureReady() {
  if (!pool) return false;
  if (!readyPromise) {
    readyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_solo_profiles (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_id TEXT NOT NULL DEFAULT 'robot',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      );

      ALTER TABLE quiz_solo_profiles
        ADD COLUMN IF NOT EXISTS avatar_id TEXT NOT NULL DEFAULT 'robot';

      CREATE TABLE IF NOT EXISTS quiz_solo_attempts (
        id BIGSERIAL PRIMARY KEY,
        profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
        session_id UUID NOT NULL,
        question_index INTEGER NOT NULL,
        quiz_type TEXT NOT NULL,
        category TEXT NOT NULL,
        mode TEXT NOT NULL,
        question_id TEXT NOT NULL,
        question_text TEXT NOT NULL,
        answer_index INTEGER,
        correct_index INTEGER NOT NULL,
        correct BOOLEAN NOT NULL,
        timed_out BOOLEAN NOT NULL DEFAULT FALSE,
        delta INTEGER NOT NULL DEFAULT 0,
        answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(session_id, question_index)
      );

      CREATE INDEX IF NOT EXISTS quiz_solo_attempts_profile_time
        ON quiz_solo_attempts(profile_id, answered_at DESC);

      CREATE INDEX IF NOT EXISTS quiz_solo_attempts_profile_question
        ON quiz_solo_attempts(profile_id, quiz_type, question_id, answered_at DESC);

      CREATE TABLE IF NOT EXISTS quiz_speech_cache (
        cache_key TEXT PRIMARY KEY,
        voice_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        model_id TEXT NOT NULL,
        audio BYTEA NOT NULL,
        byte_size INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).then(() => true).catch(error => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

function enabled() {
  return Boolean(pool);
}

async function listProfiles() {
  if (!await ensureReady()) return [];
  const { rows } = await pool.query(`
    SELECT p.id, p.name, p.avatar_id, p.created_at, p.last_login_at,
           MAX(a.answered_at) AS last_played_at,
           COUNT(DISTINCT a.session_id)::int AS games
      FROM quiz_solo_profiles p
      LEFT JOIN quiz_solo_attempts a ON a.profile_id = p.id
     GROUP BY p.id
     ORDER BY COALESCE(MAX(a.answered_at), p.created_at) DESC, p.name ASC
  `);
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    avatarId: normalizeAvatarId(row.avatar_id),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    lastPlayedAt: row.last_played_at,
    games: Number(row.games || 0),
  }));
}

async function findProfileByNameKey(nameKey) {
  if (!await ensureReady()) return null;
  const { rows } = await pool.query(
    'SELECT id, name, name_key, password_salt, password_hash, avatar_id, created_at, last_login_at FROM quiz_solo_profiles WHERE name_key = $1',
    [nameKey],
  );
  return rows[0] || null;
}

async function getProfileById(id) {
  if (!id || !await ensureReady()) return null;
  const { rows } = await pool.query(
    'SELECT id, name, name_key, avatar_id, created_at, last_login_at FROM quiz_solo_profiles WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

async function createProfile({ id, name, nameKey, passwordSalt, passwordHash, avatarId = 'robot' }) {
  if (!await ensureReady()) throw new Error('Die Datenbank ist nicht verbunden.');
  const { rows } = await pool.query(`
    INSERT INTO quiz_solo_profiles (id, name, name_key, password_salt, password_hash, avatar_id, last_login_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id, name, avatar_id, created_at, last_login_at
  `, [id, name, nameKey, passwordSalt, passwordHash, normalizeAvatarId(avatarId)]);
  return rows[0];
}

async function touchProfileLogin(id) {
  if (!await ensureReady()) return false;
  await pool.query('UPDATE quiz_solo_profiles SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  return true;
}

async function updateProfileAvatar(id, avatarId) {
  if (!await ensureReady()) return null;
  const normalized = normalizeAvatarId(avatarId);
  const { rows } = await pool.query(`
    UPDATE quiz_solo_profiles
       SET avatar_id = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, avatar_id, created_at, last_login_at
  `, [id, normalized]);
  return rows[0] || null;
}

async function saveSoloAttempt(attempt) {
  if (!await ensureReady()) return false;
  const result = await pool.query(`
    INSERT INTO quiz_solo_attempts
      (profile_id, session_id, question_index, quiz_type, category, mode, question_id, question_text,
       answer_index, correct_index, correct, timed_out, delta, answered_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
    ON CONFLICT (session_id, question_index) DO NOTHING
  `, [
    attempt.profileId,
    attempt.sessionId,
    attempt.questionIndex,
    attempt.quizType,
    attempt.category,
    attempt.mode,
    attempt.questionId,
    attempt.questionText,
    Number.isInteger(attempt.answerIndex) ? attempt.answerIndex : null,
    attempt.correctIndex,
    Boolean(attempt.correct),
    Boolean(attempt.timedOut),
    Number(attempt.delta || 0),
  ]);
  return result.rowCount > 0;
}

function sessionAndCategoryStats(rows) {
  const sessions = new Map();
  const categories = new Map();
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  let points = 0;

  for (const row of rows) {
    if (row.timed_out) unanswered += 1;
    else if (row.correct) correct += 1;
    else wrong += 1;
    points += Number(row.delta || 0);

    if (!sessions.has(row.session_id)) {
      sessions.set(row.session_id, {
        sessionId: row.session_id,
        quizType: row.quiz_type,
        mode: row.mode,
        startedAt: row.answered_at,
        finishedAt: row.answered_at,
        score: 0,
        correct: 0,
        wrong: 0,
        unanswered: 0,
        questions: 0,
      });
    }
    const session = sessions.get(row.session_id);
    session.score += Number(row.delta || 0);
    session.questions += 1;
    if (new Date(row.answered_at) < new Date(session.startedAt)) session.startedAt = row.answered_at;
    if (new Date(row.answered_at) > new Date(session.finishedAt)) session.finishedAt = row.answered_at;
    if (row.timed_out) session.unanswered += 1;
    else if (row.correct) session.correct += 1;
    else session.wrong += 1;

    if (!categories.has(row.category)) categories.set(row.category, { category: row.category, answers: 0, correct: 0, wrong: 0, unanswered: 0 });
    const category = categories.get(row.category);
    category.answers += 1;
    if (row.timed_out) category.unanswered += 1;
    else if (row.correct) category.correct += 1;
    else category.wrong += 1;
  }

  const games = [...sessions.values()]
    .map(session => ({ ...session, accuracy: session.questions ? Math.round(session.correct / session.questions * 100) : 0 }))
    .sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
  const categoryStats = [...categories.values()]
    .map(category => ({ ...category, accuracy: category.answers ? Math.round(category.correct / category.answers * 100) : 0 }))
    .sort((a, b) => b.answers - a.answers || a.category.localeCompare(b.category, 'de'));

  return { sessions, games, categories: categoryStats, correct, wrong, unanswered, points };
}

function latestWeakQuestions(rows) {
  const latest = new Map();
  for (const row of rows) {
    if (!latest.has(row.question_id)) latest.set(row.question_id, row);
  }
  return [...latest.values()]
    .filter(row => !row.correct)
    .sort((a, b) => new Date(b.answered_at) - new Date(a.answered_at))
    .map(row => ({
      id: row.question_id,
      quizType: row.quiz_type,
      category: row.category,
      text: row.question_text,
      timedOut: Boolean(row.timed_out),
      lastAnsweredAt: row.answered_at,
    }));
}

async function getProfileStats(profileId) {
  if (!await ensureReady()) return null;
  const profile = await getProfileById(profileId);
  if (!profile) return null;
  const { rows } = await pool.query(`
    SELECT session_id, question_index, quiz_type, category, mode, question_id, question_text,
           answer_index, correct_index, correct, timed_out, delta, answered_at
      FROM quiz_solo_attempts
     WHERE profile_id = $1
     ORDER BY answered_at DESC, id DESC
  `, [profileId]);

  const calculated = sessionAndCategoryStats(rows);
  const answers = calculated.correct + calculated.wrong + calculated.unanswered;
  const bestScore = calculated.games.reduce((max, game) => Math.max(max, game.score), 0);
  const bestAccuracy = calculated.games.reduce((max, game) => Math.max(max, game.accuracy), 0);
  const progression = progressionSummary({ games: calculated.sessions.size, correct: calculated.correct, points: calculated.points });
  const streak = streakSummary(calculated.games.map(game => game.finishedAt));
  const weakQuestions = latestWeakQuestions(rows);
  const today = dayKey(new Date());
  const todayRows = rows.filter(row => dayKey(row.answered_at) === today);
  const weakQuestionCounts = {
    adult: weakQuestions.filter(question => question.quizType === 'adult').length,
    child: weakQuestions.filter(question => question.quizType === 'child').length,
    total: weakQuestions.length,
  };

  const stats = {
    profile: {
      id: profile.id,
      name: profile.name,
      avatarId: normalizeAvatarId(profile.avatar_id),
      createdAt: profile.created_at,
      lastLoginAt: profile.last_login_at,
    },
    games: calculated.sessions.size,
    answers,
    correct: calculated.correct,
    wrong: calculated.wrong,
    unanswered: calculated.unanswered,
    points: calculated.points,
    accuracy: answers ? Math.round(calculated.correct / answers * 100) : 0,
    bestScore,
    bestAccuracy,
    categories: calculated.categories,
    recentGames: calculated.games.slice(0, 12),
    weakQuestions: weakQuestions.slice(0, 50),
    weakQuestionCounts,
    currentStreak: streak.current,
    bestStreak: streak.best,
    playedToday: streak.playedToday,
    dailyTask: {
      label: '10 Fragen beantworten',
      target: 10,
      progress: Math.min(10, todayRows.length),
      completed: todayRows.length >= 10,
      correctToday: todayRows.filter(row => row.correct).length,
    },
    ...progression,
  };
  stats.achievements = achievementList(stats);
  return stats;
}

async function getLeaderboard(limit = 50) {
  if (!await ensureReady()) return [];
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const { rows } = await pool.query(`
    SELECT p.id, p.name, p.avatar_id,
           COUNT(DISTINCT a.session_id)::int AS games,
           COUNT(a.id)::int AS answers,
           COUNT(a.id) FILTER (WHERE a.correct)::int AS correct,
           COALESCE(SUM(a.delta), 0)::int AS points,
           MAX(a.answered_at) AS last_played_at
      FROM quiz_solo_profiles p
      LEFT JOIN quiz_solo_attempts a ON a.profile_id = p.id
     GROUP BY p.id
  `);
  return rows.map(row => {
    const games = Number(row.games || 0);
    const answers = Number(row.answers || 0);
    const correct = Number(row.correct || 0);
    const points = Number(row.points || 0);
    return {
      id: row.id,
      name: row.name,
      avatarId: normalizeAvatarId(row.avatar_id),
      games,
      answers,
      correct,
      points,
      accuracy: answers ? Math.round(correct / answers * 100) : 0,
      lastPlayedAt: row.last_played_at,
      ...progressionSummary({ games, correct, points }),
    };
  }).sort((a, b) => b.xp - a.xp || b.points - a.points || b.accuracy - a.accuracy || a.name.localeCompare(b.name, 'de'))
    .slice(0, safeLimit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

async function getWeakQuestionIds(profileId, quizType, limit = 50) {
  if (!profileId || !await ensureReady()) return [];
  const safeType = quizType === 'adult' ? 'adult' : 'child';
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const { rows } = await pool.query(`
    SELECT question_id, answered_at
      FROM (
        SELECT DISTINCT ON (question_id)
               question_id, correct, answered_at, id
          FROM quiz_solo_attempts
         WHERE profile_id = $1 AND quiz_type = $2
         ORDER BY question_id, answered_at DESC, id DESC
      ) latest
     WHERE NOT correct
     ORDER BY answered_at DESC
     LIMIT $3
  `, [profileId, safeType, safeLimit]);
  return rows.map(row => row.question_id);
}

async function getSpeechAudio(cacheKey) {
  if (!cacheKey || !await ensureReady()) return null;
  const { rows } = await pool.query('SELECT audio FROM quiz_speech_cache WHERE cache_key = $1', [cacheKey]);
  if (!rows[0]?.audio) return null;
  pool.query('UPDATE quiz_speech_cache SET last_used_at = NOW() WHERE cache_key = $1', [cacheKey]).catch(() => {});
  return Buffer.from(rows[0].audio);
}

async function saveSpeechAudio({ cacheKey, voiceId, scope, modelId, buffer }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || !await ensureReady()) return false;
  await pool.query(`
    INSERT INTO quiz_speech_cache (cache_key, voice_id, scope, model_id, audio, byte_size, created_at, last_used_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
    ON CONFLICT (cache_key) DO UPDATE
      SET audio = EXCLUDED.audio, byte_size = EXCLUDED.byte_size, voice_id = EXCLUDED.voice_id,
          scope = EXCLUDED.scope, model_id = EXCLUDED.model_id, last_used_at = NOW()
  `, [cacheKey, voiceId, scope, modelId, buffer, buffer.length]);
  return true;
}

async function speechCacheStats() {
  if (!await ensureReady()) return { files: 0, bytes: 0 };
  const { rows } = await pool.query('SELECT COUNT(*)::int AS files, COALESCE(SUM(byte_size),0)::bigint AS bytes FROM quiz_speech_cache');
  return { files: Number(rows[0]?.files || 0), bytes: Number(rows[0]?.bytes || 0) };
}

module.exports = {
  AVATAR_IDS,
  normalizeAvatarId,
  isAvatarId,
  enabled,
  ensureReady,
  listProfiles,
  findProfileByNameKey,
  getProfileById,
  createProfile,
  touchProfileLogin,
  updateProfileAvatar,
  saveSoloAttempt,
  getProfileStats,
  getLeaderboard,
  getWeakQuestionIds,
  getSpeechAudio,
  saveSpeechAudio,
  speechCacheStats,
};
