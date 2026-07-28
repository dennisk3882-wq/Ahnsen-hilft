'use strict';

const { Pool } = require('pg');

const rawUrl = String(process.env.DATABASE_URL || '').trim();
let pool = null;
let readyPromise = null;

function strictConnectionString(value) {
  if (!value) return '';
  const parsed = new URL(value);
  parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      );

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
    SELECT p.id, p.name, p.created_at, p.last_login_at,
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
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    lastPlayedAt: row.last_played_at,
    games: Number(row.games || 0),
  }));
}

async function findProfileByNameKey(nameKey) {
  if (!await ensureReady()) return null;
  const { rows } = await pool.query(
    'SELECT id, name, name_key, password_salt, password_hash, created_at, last_login_at FROM quiz_solo_profiles WHERE name_key = $1',
    [nameKey],
  );
  return rows[0] || null;
}

async function getProfileById(id) {
  if (!id || !await ensureReady()) return null;
  const { rows } = await pool.query(
    'SELECT id, name, name_key, created_at, last_login_at FROM quiz_solo_profiles WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

async function createProfile({ id, name, nameKey, passwordSalt, passwordHash }) {
  if (!await ensureReady()) throw new Error('Die Datenbank ist nicht verbunden.');
  const { rows } = await pool.query(`
    INSERT INTO quiz_solo_profiles (id, name, name_key, password_salt, password_hash, last_login_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id, name, created_at, last_login_at
  `, [id, name, nameKey, passwordSalt, passwordHash]);
  return rows[0];
}

async function touchProfileLogin(id) {
  if (!await ensureReady()) return false;
  await pool.query('UPDATE quiz_solo_profiles SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  return true;
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

function achievementList(stats) {
  const result = [];
  if (stats.games >= 1) result.push({ id: 'first-game', icon: '🎮', title: 'Erste Runde', text: 'Das erste Solo-Quiz wurde beendet.' });
  if (stats.correct >= 10) result.push({ id: 'ten-correct', icon: '⭐', title: 'Zehn Treffer', text: 'Mindestens zehn Fragen wurden richtig beantwortet.' });
  if (stats.correct >= 50) result.push({ id: 'fifty-correct', icon: '🏅', title: 'Quiz-Profi', text: 'Mindestens 50 richtige Antworten.' });
  if (stats.correct >= 100) result.push({ id: 'hundred-correct', icon: '🏆', title: 'Wissens-Champion', text: 'Mindestens 100 richtige Antworten.' });
  if (stats.answers >= 20 && stats.accuracy >= 80) result.push({ id: 'accuracy-80', icon: '🎯', title: 'Treffsicher', text: 'Mindestens 80 Prozent Trefferquote bei 20 Antworten.' });
  if (stats.bestScore >= 200) result.push({ id: 'score-200', icon: '🚀', title: 'Punkterakete', text: 'In einer Runde mindestens 200 Punkte erreicht.' });
  const strongCategory = stats.categories.find(category => category.correct >= 10 && category.accuracy >= 80);
  if (strongCategory) result.push({ id: `category-${strongCategory.category}`, icon: '🧠', title: `${strongCategory.category}-Kenner`, text: `Starke Leistungen in „${strongCategory.category}“.` });
  return result;
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

  const recentGames = [...sessions.values()]
    .map(session => ({ ...session, accuracy: session.questions ? Math.round(session.correct / session.questions * 100) : 0 }))
    .sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
  const categoryStats = [...categories.values()]
    .map(category => ({ ...category, accuracy: category.answers ? Math.round(category.correct / category.answers * 100) : 0 }))
    .sort((a, b) => b.answers - a.answers || a.category.localeCompare(b.category, 'de'));
  const answers = correct + wrong + unanswered;
  const stats = {
    profile: { id: profile.id, name: profile.name, createdAt: profile.created_at, lastLoginAt: profile.last_login_at },
    games: sessions.size,
    answers,
    correct,
    wrong,
    unanswered,
    points,
    accuracy: answers ? Math.round(correct / answers * 100) : 0,
    bestScore: recentGames.reduce((max, game) => Math.max(max, game.score), 0),
    bestAccuracy: recentGames.reduce((max, game) => Math.max(max, game.accuracy), 0),
    categories: categoryStats,
    recentGames: recentGames.slice(0, 12),
  };
  stats.achievements = achievementList(stats);
  return stats;
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
  enabled,
  ensureReady,
  listProfiles,
  findProfileByNameKey,
  getProfileById,
  createProfile,
  touchProfileLogin,
  saveSoloAttempt,
  getProfileStats,
  getSpeechAudio,
  saveSpeechAudio,
  speechCacheStats,
};