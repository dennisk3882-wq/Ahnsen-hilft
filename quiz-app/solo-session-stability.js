'use strict';

const crypto = require('crypto');
const answerLayout = require('./answer-layout');
const db = require('./platform-db');
const profileAuth = require('./solo-profile-auth');
const soloRoutes = require('./solo-routes');
const { enrichQuestion } = require('./question-explanations');
const { runMigrations } = require('./migration-runner');

const ALLOWED_COUNTS = new Set([5, 10, 15, 25, 50]);
let patched = false;

function calculateScore({ correct, mode, remainingSeconds = 0 }) {
  if (mode === 'relaxed') return correct ? 10 : 0;
  return correct ? 10 + Math.max(0, Math.ceil(Number(remainingSeconds) || 0)) : -5;
}

function installPersistentRoutes(app, dependencies) {
  const { getQuestionSets, chooseQuestions, questionSeconds = 20, now = () => Date.now() } = dependencies;

  function catalogFor(type) {
    const sets = getQuestionSets();
    return Array.isArray(sets[type]) ? sets[type].map(enrichQuestion) : [];
  }

  function questionFor(state) {
    if (Array.isArray(state.questions) && state.questions[state.currentIndex]) {
      return state.questions[state.currentIndex];
    }
    const id = state.questionIds[state.currentIndex];
    return catalogFor(state.quizType).find(question => question.id === id) || null;
  }

  function publicQuestion(question, reveal = false) {
    if (!question) return null;
    return {
      id: question.id,
      category: question.category,
      text: question.text,
      options: question.options,
      ...(question.imageUrl ? { imageUrl: question.imageUrl } : {}),
      ...(reveal ? { correctIndex: question.correctIndex, explanation: question.explanation } : {}),
    };
  }

  function remainingMs(state) {
    if (state.mode !== 'timed' || state.answered || state.finished) return null;
    return Math.max(0, Number(state.durationSec || questionSeconds) * 1000 - (now() - Number(state.questionStartedAt)));
  }

  function summary(state) {
    const answered = Number(state.correct || 0) + Number(state.wrong || 0) + Number(state.unanswered || 0);
    return {
      score: Number(state.score || 0),
      correct: Number(state.correct || 0),
      wrong: Number(state.wrong || 0),
      unanswered: Number(state.unanswered || 0),
      answered,
      accuracy: answered ? Math.round(Number(state.correct || 0) / answered * 100) : 0,
    };
  }

  function publicState(state) {
    const question = questionFor(state);
    const totalQuestions = Array.isArray(state.questions) && state.questions.length
      ? state.questions.length
      : state.questionIds.length;
    return {
      sessionId: state.id,
      profile: { id: state.profileId, name: state.profileName },
      quizType: state.quizType,
      category: state.category,
      mode: state.mode,
      totalQuestions,
      currentIndex: state.currentIndex,
      progressLabel: state.finished ? 'Geschafft' : `Frage ${state.currentIndex + 1} von ${totalQuestions}`,
      question: state.finished ? null : publicQuestion(question, state.answered),
      questionStartedAt: state.questionStartedAt,
      durationSec: state.mode === 'timed' ? state.durationSec : null,
      serverNow: now(),
      answered: Boolean(state.answered),
      result: state.result || null,
      finished: Boolean(state.finished),
      completedAt: state.completedAt || null,
      summary: summary(state),
      persisted: true,
      answerLayoutVersion: Number(state.answerLayoutVersion || 0),
    };
  }

  async function ready() {
    if (!db.enabled()) return false;
    await runMigrations();
    return true;
  }

  async function load(client, id, profileId, lock = false) {
    const { rows } = await client.query(`
      SELECT state FROM quiz_solo_sessions
       WHERE id=$1 AND profile_id=$2 AND expires_at>NOW()
       ${lock ? 'FOR UPDATE' : ''}
    `, [id, profileId]);
    return rows[0]?.state || null;
  }

  async function save(client, state) {
    const completed = Boolean(state.finished);
    await client.query(`
      UPDATE quiz_solo_sessions SET state=$3::jsonb,updated_at=NOW(),
        expires_at=NOW()+CASE WHEN $4 THEN INTERVAL '24 hours' ELSE INTERVAL '2 hours' END,
        completed_at=CASE WHEN $4 THEN COALESCE(completed_at,NOW()) ELSE completed_at END
       WHERE id=$1 AND profile_id=$2
    `, [state.id, state.profileId, JSON.stringify(state), completed]);
  }

  function finishQuestion(state, answerIndex, timedOut = false) {
    if (state.answered || state.finished) return null;
    const question = questionFor(state);
    if (!question) throw new Error('Die aktuelle Frage wurde nicht gefunden.');
    const remaining = state.mode === 'timed' ? Math.max(0, Math.ceil(Number(remainingMs(state) || 0) / 1000)) : 0;
    const valid = Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex <= 3;
    const expired = timedOut || (state.mode === 'timed' && Number(remainingMs(state) || 0) <= 0 && !valid);
    const correct = !expired && valid && answerIndex === question.correctIndex;
    const delta = expired ? 0 : calculateScore({ correct, mode: state.mode, remainingSeconds: remaining });
    state.score = Number(state.score || 0) + delta;
    if (expired) state.unanswered = Number(state.unanswered || 0) + 1;
    else if (correct) state.correct = Number(state.correct || 0) + 1;
    else state.wrong = Number(state.wrong || 0) + 1;
    state.answered = true;
    state.result = { answerIndex: valid ? answerIndex : null, correctIndex: question.correctIndex, correct, timedOut: expired, delta, remainingSeconds: remaining };
    state.lastActivityAt = now();
    return { question, answerIndex: valid ? answerIndex : null, correct, timedOut: expired, delta };
  }

  async function insertAttempt(client, state, attempt) {
    if (!attempt) return;
    await client.query(`
      INSERT INTO quiz_solo_attempts
        (profile_id,session_id,question_index,quiz_type,category,mode,question_id,question_text,
         answer_index,correct_index,correct,timed_out,delta,answered_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
      ON CONFLICT(session_id,question_index) DO NOTHING
    `, [state.profileId, state.id, state.currentIndex, state.quizType, attempt.question.category, state.mode,
      attempt.question.id, attempt.question.text, attempt.answerIndex, attempt.question.correctIndex,
      Boolean(attempt.correct), Boolean(attempt.timedOut), Number(attempt.delta || 0)]);
  }

  app.post('/api/solo/start', profileAuth.requireProfile, async (req, res, next) => {
    if (!await ready().catch(() => false)) return next();
    try {
      const quizType = req.body?.quizType === 'adult' ? 'adult' : 'child';
      const category = String(req.body?.category || 'Gemischt').trim() || 'Gemischt';
      const mode = req.body?.mode === 'timed' ? 'timed' : 'relaxed';
      const requestedCount = Number(req.body?.questionCount || 10);
      if (!ALLOWED_COUNTS.has(requestedCount)) return res.status(400).json({ error: 'Bitte eine gültige Fragenzahl auswählen.' });
      const catalog = catalogFor(quizType);
      const available = category === 'Gemischt' ? catalog.length : catalog.filter(question => question.category === category).length;
      if (!available) return res.status(400).json({ error: 'Für diese Kategorie sind keine Fragen vorhanden.' });
      const selectedIds = chooseQuestions(quizType, category, Math.min(requestedCount, available));
      if (!selectedIds.length) return res.status(400).json({ error: 'Es konnten keine Fragen ausgewählt werden.' });

      const byId = new Map(catalog.map(question => [question.id, question]));
      const selectedQuestions = selectedIds.map(id => byId.get(id)).filter(Boolean);
      if (selectedQuestions.length !== selectedIds.length) {
        return res.status(409).json({ error: 'Der aktuelle Fragenkatalog hat sich während der Auswahl verändert. Bitte starte das Quiz erneut.' });
      }

      const timestamp = now();
      const sessionId = crypto.randomUUID();
      const questions = answerLayout.prepareBalancedQuestions(selectedQuestions, `solo:${sessionId}`);
      const state = {
        id: sessionId,
        profileId: req.soloProfile.id,
        profileName: req.soloProfile.name,
        quizType,
        category,
        mode,
        durationSec: Math.max(5, Number(questionSeconds) || 20),
        questionIds: questions.map(question => question.id),
        questions,
        answerLayoutVersion: 1,
        currentIndex: 0,
        questionStartedAt: timestamp,
        answered: false,
        result: null,
        finished: false,
        completedAt: null,
        score: 0,
        correct: 0,
        wrong: 0,
        unanswered: 0,
        createdAt: timestamp,
        lastActivityAt: timestamp,
      };
      await db.query(`
        INSERT INTO quiz_solo_sessions(id,profile_id,state,expires_at)
        VALUES($1,$2,$3::jsonb,NOW()+INTERVAL '2 hours')
      `, [state.id, state.profileId, JSON.stringify(state)]);
      res.json(publicState(state));
    } catch (error) { next(error); }
  });

  app.get('/api/solo/state/:sessionId', profileAuth.requireProfile, async (req, res, next) => {
    if (!await ready().catch(() => false)) return next();
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const state = await load(client, req.params.sessionId, req.soloProfile.id, true);
      if (!state) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Dieses Solo-Quiz ist nicht mehr verfügbar.' }); }
      if (!state.answered && !state.finished && state.mode === 'timed' && Number(remainingMs(state) || 0) <= 0) {
        const attempt = finishQuestion(state, null, true);
        await insertAttempt(client, state, attempt);
      }
      state.lastActivityAt = now();
      await save(client, state);
      await client.query('COMMIT');
      res.json(publicState(state));
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); }
    finally { client.release(); }
  });

  app.post('/api/solo/answer', profileAuth.requireProfile, async (req, res, next) => {
    if (!await ready().catch(() => false)) return next();
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const state = await load(client, String(req.body?.sessionId || ''), req.soloProfile.id, true);
      if (!state) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Dieses Solo-Quiz ist nicht mehr verfügbar.' }); }
      if (state.finished) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Das Solo-Quiz ist bereits beendet.' }); }
      if (!state.answered) {
        const answerIndex = req.body?.answerIndex === null ? null : Number(req.body?.answerIndex);
        const timedOut = state.mode === 'timed' && Number(remainingMs(state) || 0) <= 0;
        if (!timedOut && (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Bitte eine gültige Antwort auswählen.' });
        }
        const attempt = finishQuestion(state, answerIndex, timedOut);
        await insertAttempt(client, state, attempt);
        await save(client, state);
      }
      await client.query('COMMIT');
      res.json(publicState(state));
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); }
    finally { client.release(); }
  });

  app.post('/api/solo/next', profileAuth.requireProfile, async (req, res, next) => {
    if (!await ready().catch(() => false)) return next();
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const state = await load(client, String(req.body?.sessionId || ''), req.soloProfile.id, true);
      if (!state) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Dieses Solo-Quiz ist nicht mehr verfügbar.' }); }
      if (!state.finished && !state.answered) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Bitte zuerst die aktuelle Frage beantworten.' }); }
      if (!state.finished) {
        const totalQuestions = Array.isArray(state.questions) && state.questions.length
          ? state.questions.length
          : state.questionIds.length;
        if (state.currentIndex + 1 >= totalQuestions) {
          state.finished = true;
          state.completedAt = now();
        } else {
          state.currentIndex += 1;
          state.questionStartedAt = now();
          state.answered = false;
          state.result = null;
        }
        state.lastActivityAt = now();
        await save(client, state);
      }
      await client.query('COMMIT');
      res.json(publicState(state));
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); }
    finally { client.release(); }
  });

  app.delete('/api/solo/session/:sessionId', profileAuth.requireProfile, async (req, res, next) => {
    if (!await ready().catch(() => false)) return next();
    try {
      const result = await db.query('DELETE FROM quiz_solo_sessions WHERE id=$1 AND profile_id=$2', [req.params.sessionId, req.soloProfile.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Dieses Solo-Quiz ist nicht mehr verfügbar.' });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
}

function patchSoloRoutes() {
  if (patched) return;
  patched = true;
  const original = soloRoutes.installSoloRoutes;
  soloRoutes.installSoloRoutes = function installStableSoloRoutes(app, dependencies) {
    installPersistentRoutes(app, dependencies);
    return original(app, dependencies);
  };
}

module.exports = { patchSoloRoutes, _test: { calculateScore } };
