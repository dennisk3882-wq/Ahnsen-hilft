'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const storage = require('./extended-storage');
const { enrichQuestion } = require('./question-explanations');

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const ALLOWED_COUNTS = new Set([5, 10, 15, 25, 50]);
const catalogs = {
  adult: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'adult-questions.json'), 'utf8')).map(enrichQuestion),
  child: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'child-questions.json'), 'utf8')).map(enrichQuestion),
};

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

function installWeakPracticeRoutes(app, requireProfile, { now = () => Date.now() } = {}) {
  const sessions = new Map();

  function cleanup() {
    const cutoff = now() - SESSION_TTL_MS;
    for (const [id, session] of sessions) {
      if (session.lastActivityAt < cutoff) sessions.delete(id);
    }
  }

  function ownSession(req, res, next) {
    const sessionId = String(req.body?.sessionId || req.params?.sessionId || '');
    const session = sessions.get(sessionId);
    if (!session) return next();
    if (session.profileId !== req.soloProfile.id) {
      res.status(403).json({ error: 'Dieses Fehlertraining gehört zu einem anderen Profil.' });
      return null;
    }
    return session;
  }

  function currentQuestion(session) {
    return catalogs[session.quizType].find(question => question.id === session.questionIds[session.currentIndex]) || null;
  }

  function summary(session) {
    const answered = session.correct + session.wrong;
    return {
      score: session.score,
      correct: session.correct,
      wrong: session.wrong,
      unanswered: 0,
      answered,
      accuracy: answered ? Math.round(session.correct / answered * 100) : 0,
    };
  }

  function stateFor(session) {
    const question = currentQuestion(session);
    return {
      sessionId: session.id,
      profile: { id: session.profileId, name: session.profileName },
      quizType: session.quizType,
      category: 'Fehlertraining',
      mode: 'relaxed',
      practiceWrong: true,
      totalQuestions: session.questionIds.length,
      currentIndex: session.currentIndex,
      progressLabel: session.finished ? 'Geschafft' : `Frage ${session.currentIndex + 1} von ${session.questionIds.length}`,
      question: session.finished ? null : publicQuestion(question, session.answered),
      questionStartedAt: session.questionStartedAt,
      durationSec: null,
      serverNow: now(),
      answered: session.answered,
      result: session.result,
      finished: session.finished,
      completedAt: session.completedAt,
      summary: summary(session),
    };
  }

  app.post('/api/solo/practice/start', requireProfile, async (req, res) => {
    cleanup();
    const quizType = req.body?.quizType === 'adult' ? 'adult' : 'child';
    const requestedCount = Number(req.body?.questionCount || 10);
    if (!ALLOWED_COUNTS.has(requestedCount)) {
      return res.status(400).json({ error: 'Bitte eine gültige Fragenzahl auswählen.' });
    }
    try {
      const weakIds = await storage.getWeakQuestionIds(req.soloProfile.id, quizType, 50);
      const availableIds = new Set(catalogs[quizType].map(question => question.id));
      const questionIds = weakIds.filter(id => availableIds.has(id)).slice(0, requestedCount);
      if (!questionIds.length) {
        return res.status(400).json({ error: 'Für diesen Quizbereich gibt es aktuell keine falschen Fragen zum Wiederholen.' });
      }
      const timestamp = now();
      const session = {
        id: crypto.randomUUID(),
        profileId: req.soloProfile.id,
        profileName: req.soloProfile.name,
        quizType,
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
        createdAt: timestamp,
        lastActivityAt: timestamp,
      };
      sessions.set(session.id, session);
      res.json(stateFor(session));
    } catch (error) {
      res.status(503).json({ error: `Fehlertraining konnte nicht vorbereitet werden: ${error.message}` });
    }
  });

  app.get('/api/solo/state/:sessionId', requireProfile, (req, res, next) => {
    cleanup();
    const session = ownSession(req, res, next);
    if (!session) return;
    session.lastActivityAt = now();
    res.json(stateFor(session));
  });

  app.post('/api/solo/answer', requireProfile, async (req, res, next) => {
    cleanup();
    const session = ownSession(req, res, next);
    if (!session) return;
    if (session.finished) return res.status(409).json({ error: 'Das Fehlertraining ist bereits beendet.' });
    if (session.answered) return res.json(stateFor(session));

    const answerIndex = Number(req.body?.answerIndex);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
      return res.status(400).json({ error: 'Bitte eine gültige Antwort auswählen.' });
    }
    const question = currentQuestion(session);
    if (!question) return res.status(404).json({ error: 'Die Trainingsfrage wurde nicht gefunden.' });
    const correct = answerIndex === question.correctIndex;
    const delta = correct ? 10 : 0;
    session.score += delta;
    if (correct) session.correct += 1;
    else session.wrong += 1;
    session.answered = true;
    session.result = {
      answerIndex,
      correctIndex: question.correctIndex,
      correct,
      timedOut: false,
      delta,
      remainingSeconds: 0,
    };
    session.lastActivityAt = now();

    try {
      await storage.saveSoloAttempt({
        profileId: session.profileId,
        sessionId: session.id,
        questionIndex: session.currentIndex,
        quizType: session.quizType,
        category: question.category,
        mode: 'practice',
        questionId: question.id,
        questionText: question.text,
        answerIndex,
        correctIndex: question.correctIndex,
        correct,
        timedOut: false,
        delta,
      });
      res.json(stateFor(session));
    } catch (error) {
      res.status(503).json({ error: `Trainingsantwort konnte nicht gespeichert werden: ${error.message}` });
    }
  });

  app.post('/api/solo/next', requireProfile, (req, res, next) => {
    cleanup();
    const session = ownSession(req, res, next);
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

  app.delete('/api/solo/session/:sessionId', requireProfile, (req, res, next) => {
    const session = ownSession(req, res, next);
    if (!session) return;
    sessions.delete(session.id);
    res.json({ ok: true });
  });
}

module.exports = { installWeakPracticeRoutes };
