'use strict';

const fs = require('fs');
const path = require('path');
const phase10 = require('./phase10-storage');
const platformStorage = require('./platform-storage');
const profileStore = require('./extended-storage');
const { enrichQuestion } = require('./question-explanations');

const PORT = Number(process.env.PORT || 3000);
const INTERNAL_SECRET = String(process.env.PLATFORM_INTERNAL_SECRET || process.env.ADMIN_PASSWORD || process.env.EVENT_PASSWORD || 'quiztime-internal');
const catalogs = {
  adult: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'adult-questions.json'), 'utf8')).map(enrichQuestion),
  child: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'child-questions.json'), 'utf8')).map(enrichQuestion),
};

function wrap(handler) {
  return async (req, res, next) => {
    try { await handler(req, res, next); } catch (error) { next(error); }
  };
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

function questionById(type, id) {
  return catalogs[type === 'child' ? 'child' : 'adult'].find(question => question.id === id) || null;
}

function chooseEventQuestions(event) {
  const source = catalogs[event.quiz_type === 'child' ? 'child' : 'adult'];
  const filtered = event.category === 'Gemischt' ? source : source.filter(question => question.category === event.category);
  const pool = filtered.length >= event.question_count ? filtered : source;
  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled.slice(0, Math.min(event.question_count, shuffled.length)).map(question => question.id);
}

async function createOnlineRoom({ title, quizType, category, questionCount = 10, profileA, profileB, duelId = null, tournamentMatchId = null }) {
  const base = `http://127.0.0.1:${PORT}`;
  const headers = { 'Content-Type': 'application/json', 'x-quiztime-internal': INTERNAL_SECRET };
  const createdResponse = await fetch(`${base}/api/online/rooms`, {
    method: 'POST', headers,
    body: JSON.stringify({
      hostName: profileA.name,
      profileId: profileA.id,
      title,
      visibility: 'private',
      gameMode: 'individual',
      quizType,
      category,
      questionCount,
      maxPlayers: 2,
      duelId,
      tournamentMatchId,
      competitionType: duelId ? 'duel' : tournamentMatchId ? 'tournament' : 'online',
    }),
  });
  const created = await createdResponse.json().catch(() => ({}));
  if (!createdResponse.ok) throw new Error(created.error || 'Wettbewerbsraum konnte nicht erstellt werden.');
  const joinedResponse = await fetch(`${base}/api/online/rooms/${encodeURIComponent(created.code)}/join`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: profileB.name, profileId: profileB.id }),
  });
  const joined = await joinedResponse.json().catch(() => ({}));
  if (!joinedResponse.ok) throw new Error(joined.error || 'Der zweite Spieler konnte dem Wettbewerbsraum nicht beitreten.');
  return {
    code: created.code,
    credentialsA: { code: created.code, token: created.token, playerId: created.playerId, name: profileA.name },
    credentialsB: { code: joined.code, token: joined.token, playerId: joined.playerId, name: profileB.name },
  };
}

async function notify(profileId, title, body, url) {
  await platformStorage.addNotification(profileId, { type: 'competition', title, body, url }).catch(() => false);
}

function eventState(event, session) {
  const ids = Array.isArray(session.question_ids) ? session.question_ids : [];
  const question = questionById(event.quiz_type, ids[session.current_index]);
  const completed = Boolean(session.completed_at);
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
    question: completed ? null : publicQuestion(question, Boolean(session.answered)),
  };
}

function installPhase10Routes(app, { requireProfile, requireAdmin }) {
  phase10.ensureReady().catch(error => console.error('Phase 10 konnte nicht vorbereitet werden:', error.message));

  app.get('/api/platform/phase10/overview', requireProfile, wrap(async (req, res) => {
    const [missions, league, events, rewards, duels] = await Promise.all([
      phase10.missions(req.soloProfile.id),
      phase10.leagueBoard(req.soloProfile.id, 100),
      phase10.listEvents(req.soloProfile.id),
      phase10.profileRewards(req.soloProfile.id),
      phase10.listDuels(req.soloProfile.id),
    ]);
    res.json({ missions, league, events, rewards, duels });
  }));

  app.get('/api/platform/phase10/duels', requireProfile, wrap(async (req, res) => {
    res.json({ duels: await phase10.listDuels(req.soloProfile.id) });
  }));

  app.post('/api/platform/phase10/duels', requireProfile, wrap(async (req, res) => {
    const duel = await phase10.createDuel(req.soloProfile.id, String(req.body?.opponentId || ''), req.body || {});
    await notify(duel.opponent_id, 'Neue Freundesduellanfrage', `${req.soloProfile.name} fordert dich zu einem Best-of-${duel.best_of} heraus.`, '/arena?tab=duels');
    res.status(201).json({ duel });
  }));

  app.get('/api/platform/phase10/duels/:id', requireProfile, wrap(async (req, res) => {
    const duel = await phase10.duelDetails(req.params.id, req.soloProfile.id);
    if (!duel) return res.status(404).json({ error: 'Duell wurde nicht gefunden.' });
    res.json({ duel });
  }));

  app.post('/api/platform/phase10/duels/:id/respond', requireProfile, wrap(async (req, res) => {
    const duel = await phase10.respondDuel(req.params.id, req.soloProfile.id, req.body?.accept === true);
    await notify(duel.challenger_id, req.body?.accept === true ? 'Duell angenommen' : 'Duell abgelehnt', `${req.soloProfile.name} hat deine Duellanfrage ${req.body?.accept === true ? 'angenommen' : 'abgelehnt'}.`, '/arena?tab=duels');
    res.json({ duel });
  }));

  app.post('/api/platform/phase10/duels/:id/cancel', requireProfile, wrap(async (req, res) => {
    res.json({ duel: await phase10.cancelDuel(req.params.id, req.soloProfile.id) });
  }));

  app.post('/api/platform/phase10/duels/:id/round', requireProfile, wrap(async (req, res) => {
    const duel = await phase10.duelForRoomCreation(req.params.id, req.soloProfile.id);
    const [challenger, opponent] = await Promise.all([profileStore.getProfileById(duel.challenger_id), profileStore.getProfileById(duel.opponent_id)]);
    if (!challenger || !opponent) throw new Error('Duellprofile wurden nicht gefunden.');
    const room = await createOnlineRoom({
      title: `Freundesduell · Runde ${Number(duel.current_round || 0) + 1}`,
      quizType: duel.quiz_type,
      category: duel.category,
      questionCount: 10,
      profileA: challenger,
      profileB: opponent,
      duelId: duel.id,
    });
    await phase10.setDuelRoom(duel.id, room.code, room.credentialsA, room.credentialsB);
    await Promise.all([
      notify(challenger.id, 'Duellrunde bereit', `Raum ${room.code} ist für eure nächste Runde bereit.`, '/arena?tab=duels'),
      notify(opponent.id, 'Duellrunde bereit', `Raum ${room.code} ist für eure nächste Runde bereit.`, '/arena?tab=duels'),
    ]);
    const credentials = req.soloProfile.id === challenger.id ? room.credentialsA : room.credentialsB;
    res.status(201).json({ code: room.code, credentials });
  }));

  app.get('/api/platform/phase10/history', requireProfile, wrap(async (req, res) => {
    res.json({ history: await phase10.history(req.soloProfile.id, { type: req.query.type, days: req.query.days, limit: req.query.limit }) });
  }));

  app.get('/api/platform/phase10/missions', requireProfile, wrap(async (req, res) => {
    res.json({ missions: await phase10.missions(req.soloProfile.id), rewards: await phase10.profileRewards(req.soloProfile.id) });
  }));

  app.post('/api/platform/phase10/missions/:key/claim', requireProfile, wrap(async (req, res) => {
    res.json(await phase10.claimMission(req.soloProfile.id, req.params.key));
  }));

  app.get('/api/platform/phase10/league', requireProfile, wrap(async (req, res) => {
    res.json(await phase10.leagueBoard(req.soloProfile.id, req.query.limit));
  }));

  app.post('/api/platform/phase10/tournaments/:code/bracket', requireProfile, wrap(async (req, res) => {
    res.json({ bracket: await phase10.generateBracket(req.params.code, req.soloProfile.id, false) });
  }));

  app.get('/api/platform/phase10/tournaments/:code/bracket', requireProfile, wrap(async (req, res) => {
    const bracket = await phase10.bracketDetails(req.params.code, req.soloProfile.id);
    if (!bracket) return res.status(404).json({ error: 'Turnier wurde nicht gefunden.' });
    res.json({ bracket });
  }));

  app.post('/api/platform/phase10/tournament-matches/:id/room', requireProfile, wrap(async (req, res) => {
    const match = await phase10.tournamentMatchForRoom(req.params.id, req.soloProfile.id, false);
    const [profileA, profileB] = await Promise.all([profileStore.getProfileById(match.profile_a), profileStore.getProfileById(match.profile_b)]);
    const room = await createOnlineRoom({
      title: `${match.name} · K.-o.-Runde ${match.round_no}`,
      quizType: 'adult', category: 'Gemischt', questionCount: 10,
      profileA, profileB, tournamentMatchId: match.id,
    });
    await phase10.setTournamentRoom(match.id, room.code, room.credentialsA, room.credentialsB);
    await Promise.all([
      notify(profileA.id, 'Turnierpartie bereit', `${profileB.name} wartet in Raum ${room.code}.`, `/arena?tab=tournaments&code=${match.code}`),
      notify(profileB.id, 'Turnierpartie bereit', `${profileA.name} wartet in Raum ${room.code}.`, `/arena?tab=tournaments&code=${match.code}`),
    ]);
    res.status(201).json({ code: room.code, credentials: req.soloProfile.id === profileA.id ? room.credentialsA : room.credentialsB });
  }));

  app.get('/api/platform/phase10/events', requireProfile, wrap(async (req, res) => {
    res.json({ events: await phase10.listEvents(req.soloProfile.id) });
  }));

  app.post('/api/platform/phase10/events/:id/start', requireProfile, wrap(async (req, res) => {
    const event = await phase10.eventById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event ist nicht aktiv.' });
    const questionIds = chooseEventQuestions(event);
    if (!questionIds.length) throw new Error('Für dieses Event stehen keine Fragen zur Verfügung.');
    const created = await phase10.createEventSession(req.soloProfile.id, event.id, questionIds);
    res.status(201).json(eventState(created.event, created.session));
  }));

  app.get('/api/platform/phase10/event-sessions/:id', requireProfile, wrap(async (req, res) => {
    const session = await phase10.eventSession(req.params.id, req.soloProfile.id);
    if (!session) return res.status(404).json({ error: 'Event-Runde wurde nicht gefunden.' });
    res.json(eventState(session, session));
  }));

  app.post('/api/platform/phase10/event-sessions/:id/answer', requireProfile, wrap(async (req, res) => {
    const session = await phase10.eventSession(req.params.id, req.soloProfile.id);
    if (!session) return res.status(404).json({ error: 'Event-Runde wurde nicht gefunden.' });
    if (session.completed_at) return res.status(409).json({ error: 'Event-Runde ist bereits abgeschlossen.' });
    if (session.answered) return res.json(eventState(session, session));
    const ids = Array.isArray(session.question_ids) ? session.question_ids : [];
    const question = questionById(session.quiz_type, ids[session.current_index]);
    if (!question) throw new Error('Eventfrage wurde nicht gefunden.');
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
    res.json(eventState(session, { ...updated, title: session.title, quiz_type: session.quiz_type, category: session.category, question_count: session.question_count, reward_xp: session.reward_xp, reward_season_points: session.reward_season_points, badge_id: session.badge_id, ends_at: session.ends_at }));
  }));

  app.post('/api/platform/phase10/event-sessions/:id/next', requireProfile, wrap(async (req, res) => {
    const session = await phase10.eventSession(req.params.id, req.soloProfile.id);
    if (!session) return res.status(404).json({ error: 'Event-Runde wurde nicht gefunden.' });
    if (!session.answered) return res.status(409).json({ error: 'Bitte zuerst die aktuelle Frage beantworten.' });
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
    res.json(eventState(session, { ...updated, title: session.title, quiz_type: session.quiz_type, category: session.category, question_count: session.question_count, reward_xp: session.reward_xp, reward_season_points: session.reward_season_points, badge_id: session.badge_id, ends_at: session.ends_at }));
  }));

  app.get('/api/platform/phase10/events/:id/leaderboard', requireProfile, wrap(async (req, res) => {
    res.json({ leaderboard: await phase10.eventLeaderboard(req.params.id, req.query.limit) });
  }));

  app.post('/api/platform/phase10/events/:id/claim', requireProfile, wrap(async (req, res) => {
    res.json(await phase10.claimEventReward(req.soloProfile.id, req.params.id));
  }));

  app.get('/api/platform/admin/phase10/summary', requireAdmin, wrap(async (_req, res) => {
    const [events, league] = await Promise.all([phase10.adminEvents(), phase10.leagueBoard(null, 300)]);
    const duels = await dbSummary('SELECT status,COUNT(*)::int count FROM quiz_phase10_duels GROUP BY status');
    const history = await dbSummary(`SELECT source_type,COUNT(*)::int count FROM quiz_phase10_match_history WHERE played_at>NOW()-INTERVAL '30 days' GROUP BY source_type`);
    res.json({ events, league, duels, history });
  }));

  app.post('/api/platform/admin/phase10/events', requireAdmin, wrap(async (req, res) => {
    res.status(201).json({ event: await phase10.saveEvent(req.body || {}) });
  }));

  app.patch('/api/platform/admin/phase10/events/:id', requireAdmin, wrap(async (req, res) => {
    res.json({ event: await phase10.saveEvent(req.body || {}, req.params.id) });
  }));

  app.post('/api/platform/admin/phase10/seasons/settle', requireAdmin, wrap(async (_req, res) => {
    res.json({ nextSeason: await phase10.settleSeason() });
  }));

  app.post('/api/platform/admin/phase10/tournaments/:code/bracket', requireAdmin, wrap(async (req, res) => {
    res.json({ bracket: await phase10.generateBracket(req.params.code, null, true) });
  }));
}

async function dbSummary(text) {
  const db = require('./platform-db');
  const { rows } = await db.query(text);
  return rows;
}

module.exports = { installPhase10Routes, _test: { chooseEventQuestions, publicQuestion } };
