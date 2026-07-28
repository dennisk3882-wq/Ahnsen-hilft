'use strict';

const crypto = require('crypto');
const elevenlabs = require('./elevenlabs');
const storage = require('./extended-storage');
const profileAuth = require('./solo-profile-auth');
const { enrichQuestion } = require('./question-explanations');

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
  profileAuth.installProfileRoutes(app);

  function cleanupSessions() {
    const cutoff = now() - SESSION_TTL_MS;
    for (const [id, session] of sessions) {
      if (session.lastActivityAt < cutoff) sessions.delete(id);
    }
  }

  function catalogFor(type) {
    const sets = getQuestionSets();
    return Array.isArray(sets[type]) ? sets[type].map(enrichQuestion) : [];
  }

  function findQuestion(session) {
    const id = session.questionIds[session.currentIndex];
    return catalogFor(session.quizType).find(question => question.id === id) || null;
  }

  function findQuestionByContent(type, text, options) {
    const normalizedText = String(text || '').trim();
    const normalizedOptions = Array.isArray(options) ? options.map(option => String(option || '').trim()) : [];
    return catalogFor(type).find(question => question.text === normalizedText
      && question.options.length === normalizedOptions.length
      && question.options.every((option, index) => option === normalizedOptions[index])) || null;
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
      profile: { id: session.profileId, name: session.profileName },
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

  function ensureOwnSession(req, res) {
    const sessionId = String(req.body?.sessionId || req.params?.sessionId || '');
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Dieses Solo-Quiz ist nicht mehr verfügbar.' });
      return null;
    }
    if (session.profileId !== req.soloProfile.id) {
      res.status(403).json({ error: 'Dieses Solo-Quiz gehört zu einem anderen Profil.' });
      return null;
    }
    return session;
  }

  function finishCurrentQuestion(session, answerIndex, { timedOut = false } = {}) {
    if (session.answered || session.finished) return null;
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
    return { question, answerIndex: validAnswer ? answerIndex : null, correct, timedOut: isTimedOut, delta };
  }

  async function persistAttempt(session, finished) {
    if (!finished) return;
    await storage.saveSoloAttempt({
      profileId: session.profileId,
      sessionId: session.id,
      questionIndex: session.currentIndex,
      quizType: session.quizType,
      category: finished.question.category,
      mode: session.mode,
      questionId: finished.question.id,
      questionText: finished.question.text,
      answerIndex: finished.answerIndex,
      correctIndex: finished.question.correctIndex,
      correct: finished.correct,
      timedOut: finished.timedOut,
      delta: finished.delta,
    });
  }

  app.get('/api/solo/config', async (_req, res) => {
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
    let speechCache = { files: 0, bytes: 0 };
    try { speechCache = await storage.speechCacheStats(); } catch { /* optionale Anzeige */ }
    res.json({
      questionCounts: [...ALLOWED_COUNTS],
      questionSeconds,
      profileRequired: true,
      speechCache,
      catalogs: { adult: makeConfig('adult'), child: makeConfig('child') },
    });
  });

  app.get('/api/solo/speech/config', async (_req, res) => {
    try {
      res.json(await elevenlabs.getPublicConfig());
    } catch (error) {
      res.status(503).json({ enabled: false, error: error.message });
    }
  });

  app.post('/api/solo/speech', profileAuth.requireProfile, async (req, res) => {
    try {
      const quizType = req.body?.quizType === 'adult' ? 'adult' : 'child';
      const question = findQuestionByContent(quizType, req.body?.questionText, req.body?.options);
      if (!question) return res.status(404).json({ error: 'Die Quizfrage wurde im aktuellen Katalog nicht gefunden.' });
      const result = await elevenlabs.synthesize({
        question,
        scope: req.body?.scope,
        quizType,
        voiceId: String(req.body?.voiceId || ''),
        ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(),
      });
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(result.buffer.length),
        'Cache-Control': 'private, max-age=31536000, immutable',
        ETag: `"${result.key}"`,
        'X-Audio-Cache': result.cache,
        'X-ElevenLabs-Voice': result.voiceId,
      });
      res.send(result.buffer);
    } catch (error) {
      res.status(Number(error.statusCode) || 502).json({ error: error.message || 'Sprachausgabe fehlgeschlagen.' });
    }
  });

  app.post('/api/solo/start', profileAuth.requireProfile, (req, res) => {
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
      profileId: req.soloProfile.id,
      profileName: req.soloProfile.name,
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

  app.get('/api/solo/state/:sessionId', profileAuth.requireProfile, async (req, res) => {
    cleanupSessions();
    const session = ensureOwnSession(req, res);
    if (!session) return;
    if (!session.answered && !session.finished && session.mode === 'timed' && remainingMs(session) <= 0) {
      const finished = finishCurrentQuestion(session, null, { timedOut: true });
      await persistAttempt(session, finished);
    }
    session.lastActivityAt = now();
    res.json(stateFor(session));
  });

  app.post('/api/solo/answer', profileAuth.requireProfile, async (req, res) => {
    cleanupSessions();
    const session = ensureOwnSession(req, res);
    if (!session) return;
    if (session.finished) return res.status(409).json({ error: 'Das Solo-Quiz ist bereits beendet.' });
    if (session.answered) return res.json(stateFor(session));

    const answerIndex = req.body?.answerIndex === null ? null : Number(req.body?.answerIndex);
    const timedOut = session.mode === 'timed' && remainingMs(session) <= 0;
    if (!timedOut && (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3)) {
      return res.status(400).json({ error: 'Bitte eine gültige Antwort auswählen.' });
    }

    const finished = finishCurrentQuestion(session, answerIndex, { timedOut });
    await persistAttempt(session, finished);
    res.json(stateFor(session));
  });

  app.post('/api/solo/next', profileAuth.requireProfile, (req, res) => {
    cleanupSessions();
    const session = ensureOwnSession(req, res);
    if (!session) return;
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

  app.delete('/api/solo/session/:sessionId', profileAuth.requireProfile, (req, res) => {
    const session = ensureOwnSession(req, res);
    if (!session) return;
    sessions.delete(session.id);
    res.json({ ok: true });
  });
}

module.exports = { installSoloRoutes, calculateSoloScore };