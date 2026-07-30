'use strict';

const phase10 = require('./phase10-storage');
const catalogService = require('./question-catalog-service');

function wrap(handler) {
  return async (req, res, next) => {
    try { await handler(req, res, next); } catch (error) { next(error); }
  };
}

function questionById(type, id) {
  const quizType = type === 'child' ? 'child' : 'adult';
  return catalogService.currentCatalog(quizType).find(question => question.id === id)
    || catalogService.canonicalCatalog(quizType).find(question => question.id === id)
    || null;
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

function normalizedEvent(event, session) {
  return event || {
    id: session.event_id,
    slug: session.slug,
    title: session.title,
    description: session.description,
    event_type: session.event_type,
    quiz_type: session.quiz_type,
    category: session.category,
    question_count: session.question_count,
    ends_at: session.ends_at,
    reward_xp: session.reward_xp,
    reward_season_points: session.reward_season_points,
    badge_id: session.badge_id,
  };
}

function eventState(eventValue, session) {
  const event = normalizedEvent(eventValue, session);
  const ids = Array.isArray(session.question_ids) ? session.question_ids : [];
  const completed = Boolean(session.completed_at);
  const question = questionById(event.quiz_type, ids[session.current_index]);
  return {
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      eventType: event.event_type,
      quizType: event.quiz_type,
      category: event.category,
      questionCount: ids.length,
      endsAt: event.ends_at,
      rewardXp: event.reward_xp,
      rewardSeasonPoints: event.reward_season_points,
      badgeId: event.badge_id,
      catalogVersion: catalogService.versionFor(catalogService.currentCatalogs()),
    },
    sessionId: session.id,
    currentIndex: Number(session.current_index || 0),
    totalQuestions: ids.length,
    score: Number(session.score || 0),
    correct: Number(session.correct || 0),
    wrong: Number(session.wrong || 0),
    answered: Boolean(session.answered),
    result: session.result || null,
    completed,
    resumed: Boolean(session.resumed),
    attemptNo: Number(session.attempt_no || 1),
    question: completed ? null : publicQuestion(question, Boolean(session.answered)),
  };
}

async function eventForSession(session) {
  return await phase10.eventById(session.event_id) || normalizedEvent(null, session);
}

function installEventRuntimeRoutes(app, { requireProfile }) {
  app.post('/api/platform/phase10/events/:id/start', requireProfile, wrap(async (req, res) => {
    const event = await phase10.eventById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event ist nicht aktiv.' });
    const created = await phase10.createEventSession(req.soloProfile.id, event.id, []);
    res.status(201).json(eventState(created.event, { ...created.session, resumed: Boolean(created.resumed) }));
  }));

  app.get('/api/platform/phase10/event-sessions/:id', requireProfile, wrap(async (req, res) => {
    const session = await phase10.eventSession(req.params.id, req.soloProfile.id);
    if (!session) return res.status(404).json({ error: 'Event-Runde wurde nicht gefunden.' });
    res.json(eventState(await eventForSession(session), session));
  }));

  app.post('/api/platform/phase10/event-sessions/:id/answer', requireProfile, wrap(async (req, res) => {
    const session = await phase10.eventSession(req.params.id, req.soloProfile.id);
    if (!session) return res.status(404).json({ error: 'Event-Runde wurde nicht gefunden.' });
    if (session.completed_at) return res.status(409).json({ error: 'Event-Runde ist bereits abgeschlossen.' });
    const event = await eventForSession(session);
    if (session.answered) return res.json(eventState(event, session));
    const ids = Array.isArray(session.question_ids) ? session.question_ids : [];
    const question = questionById(event.quiz_type, ids[session.current_index]);
    if (!question) throw new Error('Eventfrage wurde im veröffentlichten Fragenkatalog nicht gefunden.');
    const answerIndex = Number(req.body?.answerIndex);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return res.status(400).json({ error: 'Bitte eine Antwort auswählen.' });
    const correct = answerIndex === question.correctIndex;
    const updated = await phase10.updateEventSession(session.id, req.soloProfile.id, {
      currentIndex: session.current_index,
      score: Number(session.score || 0) + (correct ? 10 : 0),
      correct: Number(session.correct || 0) + (correct ? 1 : 0),
      wrong: Number(session.wrong || 0) + (correct ? 0 : 1),
      answered: true,
      result: { answerIndex, correctIndex: question.correctIndex, correct, delta: correct ? 10 : 0 },
      completed: false,
    });
    res.json(eventState(event, { ...session, ...updated }));
  }));

  app.post('/api/platform/phase10/event-sessions/:id/next', requireProfile, wrap(async (req, res) => {
    const session = await phase10.eventSession(req.params.id, req.soloProfile.id);
    if (!session) return res.status(404).json({ error: 'Event-Runde wurde nicht gefunden.' });
    if (!session.answered) return res.status(409).json({ error: 'Bitte zuerst die aktuelle Frage beantworten.' });
    const event = await eventForSession(session);
    const ids = Array.isArray(session.question_ids) ? session.question_ids : [];
    const completed = Number(session.current_index) + 1 >= ids.length;
    const updated = await phase10.updateEventSession(session.id, req.soloProfile.id, {
      currentIndex: completed ? session.current_index : Number(session.current_index) + 1,
      score: session.score,
      correct: session.correct,
      wrong: session.wrong,
      answered: false,
      result: null,
      completed,
    });
    res.json(eventState(event, { ...session, ...updated }));
  }));
}

module.exports = { installEventRuntimeRoutes, _test: { questionById, publicQuestion, eventState } };
