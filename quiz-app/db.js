'use strict';

const { Pool } = require('pg');

const rawUrl = String(process.env.DATABASE_URL || '').trim();

function databaseUrlWithStrictTls(value) {
  if (!value) return '';
  const parsed = new URL(value);
  parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
}

const connectionString = databaseUrlWithStrictTls(rawUrl);
const pool = connectionString
  ? new Pool({ connectionString, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 })
  : null;

function normalizeQuestion(question, type, index) {
  const options = Array.isArray(question.options) ? question.options.map(String).slice(0, 4) : [];
  while (options.length < 4) options.push(`Antwort ${options.length + 1}`);
  const category = String(question.category || 'Allgemeinwissen').trim() || 'Allgemeinwissen';
  const id = String(question.id || `${type}-legacy-${index + 1}`).trim();
  return {
    id,
    category,
    text: String(question.text || question.question || '').trim(),
    options,
    correctIndex: Math.max(0, Math.min(3, Number(question.correctIndex ?? question.correct ?? 0) || 0)),
    ...(String(question.imageUrl || '').trim() ? { imageUrl: String(question.imageUrl).trim() } : {}),
    ...(String(question.explanation || '').trim() ? { explanation: String(question.explanation).trim() } : {}),
  };
}

function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de');
}

function questionIdentityKey(question) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const correctIndex = Number(question?.correctIndex);
  const correctAnswer = Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length
    ? options[correctIndex]
    : '';
  return `${normalizeMatchText(question?.text)}\u0000${normalizeMatchText(correctAnswer)}`;
}

function isExplicitCustomQuestion(question, type) {
  return String(question?.id || '').startsWith(`${type}-custom-`);
}

function mergeCatalog(existing, defaults, type) {
  const defaultList = (Array.isArray(defaults) ? defaults : [])
    .map((question, index) => normalizeQuestion(question, type, index))
    .filter(question => question.text);

  // Die Dateien unter data/ sind für sämtliche 500 Standardfragen verbindlich.
  // Dadurch bleiben Fragetext, Antworten, richtige Lösung und Erklärung immer als
  // zusammengehöriger Datensatz erhalten, auch wenn Neon noch ältere Fassungen enthält.
  const merged = defaultList.map(question => ({
    ...question,
    options: [...question.options],
  }));

  const seenIds = new Set(merged.map(question => question.id));
  const seenIdentities = new Set(merged.map(questionIdentityKey));
  const existingList = (Array.isArray(existing) ? existing : [])
    .map((question, index) => normalizeQuestion(question, type, index))
    .filter(question => question.text);

  // Ausschließlich ausdrücklich über den Frageneditor erstellte Zusatzfragen bleiben
  // neben dem verbindlichen Standardkatalog erhalten. Alte Standard- und Legacy-Fassungen
  // werden nicht erneut angehängt, da sie genau die gemeldeten Zuordnungsfehler verursachen.
  for (const question of existingList) {
    if (!isExplicitCustomQuestion(question, type)) continue;
    const identity = questionIdentityKey(question);
    if (seenIds.has(question.id) || seenIdentities.has(identity)) continue;
    merged.push(question);
    seenIds.add(question.id);
    seenIdentities.add(identity);
  }

  return merged;
}

async function initDatabase(defaultSets) {
  if (!pool) {
    return { enabled: false, questionSets: defaultSets, liveState: null };
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_question_sets (
      quiz_type TEXT PRIMARY KEY,
      questions JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quiz_live_state (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quiz_runs (
      id BIGSERIAL PRIMARY KEY,
      quiz_type TEXT NOT NULL,
      title TEXT NOT NULL,
      finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      leaderboard JSONB NOT NULL,
      answer_history JSONB NOT NULL
    );
  `);

  await pool.query(`ALTER TABLE quiz_runs ADD COLUMN IF NOT EXISTS run_uuid TEXT`);
  await pool.query(`ALTER TABLE quiz_runs ADD COLUMN IF NOT EXISTS category TEXT`);
  await pool.query(`ALTER TABLE quiz_runs ADD COLUMN IF NOT EXISTS question_count INTEGER`);
  await pool.query(`ALTER TABLE quiz_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE quiz_runs ADD COLUMN IF NOT EXISTS settings JSONB`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS quiz_runs_run_uuid_unique ON quiz_runs(run_uuid) WHERE run_uuid IS NOT NULL`);

  const questionSets = {};
  for (const type of ['adult', 'child']) {
    const defaults = defaultSets[type] || [];
    const { rows } = await pool.query('SELECT questions FROM quiz_question_sets WHERE quiz_type = $1', [type]);
    const merged = mergeCatalog(rows[0]?.questions, defaults, type);
    await pool.query(
      `INSERT INTO quiz_question_sets (quiz_type, questions, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (quiz_type) DO UPDATE SET questions = EXCLUDED.questions, updated_at = NOW()`,
      [type, JSON.stringify(merged)],
    );
    questionSets[type] = merged;
  }

  const liveResult = await pool.query('SELECT state FROM quiz_live_state WHERE id = 1');
  return { enabled: true, questionSets, liveState: liveResult.rows[0]?.state || null };
}

async function saveQuestionSet(type, questions) {
  if (!pool) return false;
  await pool.query(
    `INSERT INTO quiz_question_sets (quiz_type, questions, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (quiz_type) DO UPDATE SET questions = EXCLUDED.questions, updated_at = NOW()`,
    [type, JSON.stringify(questions)],
  );
  return true;
}

async function saveLiveState(state) {
  if (!pool) return false;
  await pool.query(
    `INSERT INTO quiz_live_state (id, state, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
    [JSON.stringify(state)],
  );
  return true;
}

async function saveQuizRun(run) {
  if (!pool) return false;
  await pool.query(
    `INSERT INTO quiz_runs
      (run_uuid, quiz_type, title, category, question_count, started_at, finished_at, leaderboard, answer_history, settings)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7::jsonb, $8::jsonb, $9::jsonb)
     ON CONFLICT (run_uuid) DO NOTHING`,
    [
      run.runUuid,
      run.quizType,
      run.title,
      run.category,
      run.questionCount,
      run.startedAt ? new Date(run.startedAt) : null,
      JSON.stringify(run.leaderboard),
      JSON.stringify(run.answerHistory),
      JSON.stringify(run.settings || {}),
    ],
  );
  return true;
}

async function listQuizRuns(limit = 100) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT id, run_uuid, quiz_type, title, category, question_count, started_at, finished_at,
            leaderboard, answer_history, settings
       FROM quiz_runs
      ORDER BY finished_at DESC
      LIMIT $1`,
    [Math.max(1, Math.min(500, Number(limit) || 100))],
  );
  return rows;
}

async function getQuizRun(id) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT id, run_uuid, quiz_type, title, category, question_count, started_at, finished_at,
            leaderboard, answer_history, settings
       FROM quiz_runs WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

async function deleteQuizRun(id) {
  if (!pool) return false;
  const result = await pool.query('DELETE FROM quiz_runs WHERE id = $1', [id]);
  return result.rowCount > 0;
}

async function pingDatabase() {
  if (!pool) return false;
  await pool.query('SELECT 1');
  return true;
}

module.exports = {
  initDatabase,
  saveQuestionSet,
  saveLiveState,
  saveQuizRun,
  listQuizRuns,
  getQuizRun,
  deleteQuizRun,
  pingDatabase,
  databaseEnabled: Boolean(pool),
  _test: {
    mergeCatalog,
    questionIdentityKey,
    isExplicitCustomQuestion,
  },
};
