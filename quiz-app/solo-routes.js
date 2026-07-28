'use strict';

const crypto = require('crypto');

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const ALLOWED_COUNTS = new Set([5, 10, 15, 25, 50]);

function calculateSoloScore({ correct, mode, remainingSeconds = 0 }) {
  if (mode === 'relaxed') return correct ? 10 : 0;
  return correct ? 10 + Math.max(0, Math.ceil(Number(remainingSeconds) || 0)) : -5;
}

function installSoloRoutes(app, {
  getQuestionSets,
  chooseQuestions,
  questionSeconds = 20,
  now = () => Date.now(),
}) {
  const sessions = new Map();

  function cleanupSessions() {
    const cutoff = now() - SESSION_TTL_MS;
    for (const [id, session] of sessions) {
      if (session.lastActivityAt < cutoff) sessions.delete(id);
    }
  }

  function catalogFor(type) {
    const sets = getQuestionSets();
    return Array.isArray(sets[type]) ? sets[type] : [];
  }

  function findQuestion(session) {
    const id = session.questionIds[session.currentIndex];
    return catalogFor(session.quizType).find(question => question.id === id) || null;
  }

  function publicQuestion(question, reveal = false) {
    if (!question) return null;
    return {
      id: question.id,
      category: question.category,
      text: question.text,
      options: question.options,
      ...(question.imageUrl ? { imageUrl: question.imageUrl } : {}),
      ...(reveal ? { correctIndex: question.correctIndex } : {}),
    };
  }

  function remainingMs(session) {
    if (session.mode !== 'timed' || session.answered || session.finished) return null;
    return Math.max(0, session.durationSec * 1000 - (now() - session.questionStartedAt));
  }

  function summary(session) {
    const answered = session.correct + session.wrong + session.unanswered;
    return {
      score: session.score,
      correct: session.correct,
      wrong: session.wrong,
      unanswered: session.unanswered,
      answered,
      accuracy: answered ? Math.round((session.correct / answered) * 100) : 0,
    };
  }

  function stateFor(session) {
    const question = findQuestion(session);
    return {
      sessionId: session.id,
      quizType: session.quizType,
      category: session.category,
      mode: session.mode,
      totalQuestions: session.questionIds.length,
      currentIndex: session.currentIndex,
      progressLabel: session.finished ? 'Geschafft' : `Frage ${session.currentIndex + 1} von ${session.questionIds.length}`,
      question: session.finished ? null : publicQuestion(question, session.answered),
      questionStartedAt: session.questionStartedAt,
      durationSec: session.mode === 'timed' ? session.durationSec : null,
      serverNow: now(),
      answered: session.answered,
      result: session.result,
      finished: session.finished,
      completedAt: session.completedAt,
      summary: summary(session),
    };
  }

  function finishCurrentQuestion(session, answerIndex, { timedOut = false } = {}) {
    if (session.answered || session.finished) return;
    const question = findQuestion(session);
    if (!question) throw new Error('Die aktuelle Frage wurde nicht gefunden.');

    const remaining = session.mode === 'timed'
      ? Math.max(0, Math.ceil(remainingMs(session) / 1000))
      : 0;
    const validAnswer = Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex <= 3;
    const isTimedOut = timedOut || (session.mode === 'timed' && remainingMs(session) <= 0 && !validAnswer);
    const correct = !isTimedOut && validAnswer && answerIndex === question.correctIndex;
    const delta = isTimedOut ? 0 : calculateSoloScore({ correct, mode: session.mode, remainingSeconds: remaining });

    session.score += delta;
    if (isTimedOut) session.unanswered += 1;
    else if (correct) session.correct += 1;
    else session.wrong += 1;

    session.answered = true;
    session.result = {
      answerIndex: validAnswer ? answerIndex : null,
      correctIndex: question.correctIndex,
      correct,
      timedOut: isTimedOut,
      delta,
      remainingSeconds: remaining,
    };
    session.lastActivityAt = now();
  }

  app.get('/api/solo/config', (_req, res) => {
    cleanupSessions();
    const sets = getQuestionSets();
    const makeConfig = type => {
      const catalog = Array.isArray(sets[type]) ? sets[type] : [];
      const categories = [...new Set(catalog.map(question => question.category))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'de'));
      return {
        size: catalog.length,
        categories,
        categoryCounts: Object.fromEntries(categories.map(category => [
          category,
          catalog.filter(question => question.category === category).length,
        ])),
      };
    };
    res.json({
      questionCounts: [...ALLOWED_COUNTS],
      questionSeconds,
      catalogs: { adult: makeConfig('adult'), child: makeConfig('child') },
    });
  });

  app.post('/api/solo/start', (req, res) => {
    cleanupSessions();
    const quizType = req.body?.quizType === 'adult' ? 'adult' : 'child';
    const category = String(req.body?.category || 'Gemischt').trim() || 'Gemischt';
    const mode = req.body?.mode === 'timed' ? 'timed' : 'relaxed';
    const requestedCount = Number(req.body?.questionCount || 10);
    if (!ALLOWED_COUNTS.has(requestedCount)) {
      return res.status(400).json({ error: 'Bitte eine gültige Fragenzahl auswählen.' });
    }

    const catalog = catalogFor(quizType);
    const available = category === 'Gemischt'
      ? catalog.length
      : catalog.filter(question => question.category === category).length;
    if (!available) return res.status(400).json({ error: 'Für diese Kategorie sind keine Fragen vorhanden.' });

    const count = Math.min(requestedCount, available);
    const questionIds = chooseQuestions(quizType, category, count);
    if (!questionIds.length) return res.status(400).json({ error: 'Es konnten keine Fragen ausgewählt werden.' });

    const timestamp = now();
    const session = {
      id: crypto.randomUUID(),
      quizType,
      category,
      mode,
      durationSec: Math.max(5, Number(questionSeconds) || 20),
      questionIds,
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
    sessions.set(session.id, session);
    res.json(stateFor(session));
  });

  app.get('/api/solo/state/:sessionId', (req, res) => {
    cleanupSessions();
    const session = sessions.get(String(req.params.sessionId || ''));
    if (!session) return res.status(404).json({ error: 'Dieses Solo-Quiz ist nicht mehr verfügbar.' });
    if (!session.answered && !session.finished && session.mode === 'timed' && remainingMs(session) <= 0) {
      finishCurrentQuestion(session, null, { timedOut: true });
    }
    session.lastActivityAt = now();
    res.json(stateFor(session));
  });

  app.post('/api/solo/answer', (req, res) => {
    cleanupSessions();
    const session = sessions.get(String(req.body?.sessionId || ''));
    if (!session) return res.status(404).json({ error: 'Dieses Solo-Quiz ist nicht mehr verfügbar.' });
    if (session.finished) return res.status(409).json({ error: 'Das Solo-Quiz ist bereits beendet.' });
    if (session.answered) return res.json(stateFor(session));

    const answerIndex = req.body?.answerIndex === null ? null : Number(req.body?.answerIndex);
    const timedOut = session.mode === 'timed' && remainingMs(session) <= 0;
    if (!timedOut && (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3)) {
      return res.status(400).json({ error: 'Bitte eine gültige Antwort auswählen.' });
    }

    finishCurrentQuestion(session, answerIndex, { timedOut });
    res.json(stateFor(session));
  });

  app.post('/api/solo/next', (req, res) => {
    cleanupSessions();
    const session = sessions.get(String(req.body?.sessionId || ''));
    if (!session) return res.status(404).json({ error: 'Dieses Solo-Quiz ist nicht mehr verfügbar.' });
    if (session.finished) return res.json(stateFor(session));
    if (!session.answered) return res.status(409).json({ error: 'Bitte zuerst die aktuelle Frage beantworten.' });

    if (session.currentIndex + 1 >= session.questionIds.length) {
      session.finished = true;
      session.completedAt = now();
      session.lastActivityAt = now();
      return res.json(stateFor(session));
    }

    session.currentIndex += 1;
    session.questionStartedAt = now();
    session.answered = false;
    session.result = null;
    session.lastActivityAt = now();
    res.json(stateFor(session));
  });

  app.delete('/api/solo/session/:sessionId', (req, res) => {
    sessions.delete(String(req.params.sessionId || ''));
    res.json({ ok: true });
  });
}

module.exports = { installSoloRoutes, calculateSoloScore };
