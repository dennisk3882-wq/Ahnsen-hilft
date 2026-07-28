'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const { calculateAnswerScore } = require('./lib/scoring');
const {
  initDatabase,
  saveQuestionSet,
  saveLiveState,
  saveQuizRun,
  listQuizRuns,
  getQuizRun,
  deleteQuizRun,
  pingDatabase,
  databaseEnabled,
} = require('./db');

const PORT = Number(process.env.PORT || 3000);
const QUIZ_TITLE = process.env.QUIZ_TITLE || 'Ahnsen Quizabend';
const QUESTION_SECONDS = Math.max(5, Number(process.env.QUESTION_SECONDS || 20));
const EVENT_PASSWORD = process.env.EVENT_PASSWORD || 'ahnsen2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'quizmaster2026';
const ACTIVE_PHASES = new Set(['ready', 'question', 'revealed', 'paused']);
const ADMIN_IDLE_MS = 90 * 60 * 1000;
const ADMIN_MAX_MS = 24 * 60 * 60 * 1000;

const defaultSets = {
  adult: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'adult-questions.json'), 'utf8')),
  child: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'child-questions.json'), 'utf8')),
};
let questionSets = structuredClone(defaultSets);
let dbConnected = false;

function freshState(existingPlayers = {}) {
  return {
    schemaVersion: 6,
    title: QUIZ_TITLE,
    phase: 'lobby',
    quizType: 'adult',
    category: 'Gemischt',
    questionCount: 25,
    selectedQuestionIds: [],
    currentIndex: 0,
    questionStartedAt: null,
    questionDurationSec: QUESTION_SECONDS,
    responses: {},
    players: existingPlayers,
    answerHistory: [],
    skippedQuestionIds: [],
    overlay: null,
    pause: null,
    runUuid: null,
    startedAt: null,
    preparedAt: null,
    finishedAt: null,
    savedRunUuid: null,
    updatedAt: Date.now(),
  };
}

let state = freshState();
const adminSessions = new Map();
const attemptBuckets = new Map();
const handledCommands = new Map();
let persistTimer = null;
let persistChain = Promise.resolve();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket', 'polling'] });

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/screen', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));

function now() { return Date.now(); }
function randomToken(bytes = 24) { return crypto.randomBytes(bytes).toString('base64url'); }
function safeName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 30); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function getIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }
function getQuestion(type, id) { return (questionSets[type] || []).find(q => q.id === id) || null; }
function currentQuestion() { return state.selectedQuestionIds.length ? getQuestion(state.quizType, state.selectedQuestionIds[state.currentIndex]) : null; }
function activePlayers() { return Object.values(state.players).filter(p => !p.excluded); }
function currentRemainingMs() {
  if (state.phase !== 'question' || !state.questionStartedAt) return 0;
  return Math.max(0, state.questionDurationSec * 1000 - (now() - state.questionStartedAt));
}

function leaderboard() {
  return activePlayers()
    .map(p => ({
      id: p.id,
      name: p.name,
      score: Number(p.score || 0),
      correct: Number(p.correct || 0),
      wrong: Number(p.wrong || 0),
      unanswered: Number(p.unanswered || 0),
      averageAnswerMs: p.answerCount ? Math.round(p.totalAnswerMs / p.answerCount) : null,
      latencyMs: p.latencyMs ?? null,
      connected: Boolean(p.connected),
    }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct || (a.averageAnswerMs ?? Infinity) - (b.averageAnswerMs ?? Infinity) || a.name.localeCompare(b.name, 'de'))
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

function answerDistribution() {
  const question = currentQuestion();
  if (!question) return null;
  const counts = question.options.map(() => 0);
  for (const response of Object.values(state.responses || {})) {
    if (Number.isInteger(response.answerIndex) && counts[response.answerIndex] !== undefined) counts[response.answerIndex] += 1;
  }
  const total = counts.reduce((sum, count) => sum + count, 0);
  return counts.map((count, index) => ({
    index,
    label: question.options[index],
    count,
    percent: total ? Math.round((count / total) * 100) : 0,
    correct: index === question.correctIndex,
  }));
}

function normalizedStateForStorage() {
  const copy = structuredClone(state);
  for (const player of Object.values(copy.players)) {
    player.connected = false;
    player.latencyMs = null;
  }
  copy.updatedAt = now();
  return copy;
}

function schedulePersist(delay = 80) {
  if (!dbConnected) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const snapshot = normalizedStateForStorage();
    persistChain = persistChain
      .then(() => saveLiveState(snapshot))
      .catch(error => console.error('Live-Spielstand konnte nicht gespeichert werden:', error.message));
  }, delay);
}

async function persistNow() {
  if (!dbConnected) return;
  clearTimeout(persistTimer);
  const snapshot = normalizedStateForStorage();
  persistChain = persistChain
    .then(() => saveLiveState(snapshot))
    .catch(error => console.error('Live-Spielstand konnte nicht gespeichert werden:', error.message));
  await persistChain;
}

function publicQuestion({ reveal = false } = {}) {
  const question = currentQuestion();
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

function basePublicState() {
  const reveal = state.phase === 'revealed' || state.phase === 'finished';
  return {
    title: state.title,
    phase: state.phase,
    quizType: state.quizType,
    category: state.category,
    questionCount: state.questionCount,
    currentIndex: state.currentIndex,
    progressLabel: state.selectedQuestionIds.length ? `Frage ${Math.min(state.currentIndex + 1, state.selectedQuestionIds.length)} von ${state.selectedQuestionIds.length}` : '',
    questionStartedAt: state.questionStartedAt,
    questionDurationSec: state.questionDurationSec,
    serverNow: now(),
    question: publicQuestion({ reveal }),
    responseCount: Object.keys(state.responses || {}).length,
    activePlayerCount: activePlayers().length,
    distribution: reveal ? answerDistribution() : null,
    overlay: state.overlay,
    pause: state.pause,
    leaderboard: state.overlay?.type === 'leaderboard' || state.phase === 'finished' ? leaderboard() : null,
    skippedCount: state.skippedQuestionIds.length,
  };
}

function playerState(playerId) {
  const player = state.players[playerId];
  const base = basePublicState();
  return {
    ...base,
    player: player ? {
      id: player.id,
      name: player.name,
      score: player.score,
      correct: player.correct,
      wrong: player.wrong,
      unanswered: player.unanswered,
      excluded: player.excluded,
      connected: player.connected,
      latencyMs: player.latencyMs ?? null,
    } : null,
    ownResponse: state.responses[playerId] || null,
  };
}

function adminState() {
  return {
    ...basePublicState(),
    databaseEnabled,
    databaseConnected: dbConnected,
    question: currentQuestion(),
    players: Object.values(state.players)
      .map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        correct: p.correct,
        wrong: p.wrong,
        unanswered: p.unanswered,
        connected: p.connected,
        excluded: p.excluded,
        latencyMs: p.latencyMs ?? null,
        joinedAt: p.joinedAt,
      }))
      .sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.score - a.score || a.name.localeCompare(b.name, 'de')),
    leaderboard: leaderboard(),
    selectedQuestionIds: state.selectedQuestionIds,
    runUuid: state.runUuid,
    startedAt: state.startedAt,
    preparedAt: state.preparedAt,
    finishedAt: state.finishedAt,
    categories: {
      adult: [...new Set((questionSets.adult || []).map(q => q.category))].sort((a, b) => a.localeCompare(b, 'de')),
      child: [...new Set((questionSets.child || []).map(q => q.category))].sort((a, b) => a.localeCompare(b, 'de')),
    },
    categoryCounts: {
      adult: Object.fromEntries([...new Set((questionSets.adult || []).map(q => q.category))].map(category => [category, questionSets.adult.filter(q => q.category === category).length])),
      child: Object.fromEntries([...new Set((questionSets.child || []).map(q => q.category))].map(category => [category, questionSets.child.filter(q => q.category === category).length])),
    },
    catalogSizes: { adult: questionSets.adult?.length || 0, child: questionSets.child?.length || 0 },
  };
}

function broadcastAll() {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.role === 'player' && socket.data.playerId) socket.emit('state', playerState(socket.data.playerId));
    else if (socket.data.role === 'admin') socket.emit('admin_state', adminState());
    else if (socket.data.role === 'screen') socket.emit('screen_state', basePublicState());
  }
}

function resetPlayerScores() {
  for (const player of Object.values(state.players)) {
    player.score = 0;
    player.correct = 0;
    player.wrong = 0;
    player.unanswered = 0;
    player.totalAnswerMs = 0;
    player.answerCount = 0;
    player.excluded = false;
  }
}

function shuffle(list, seed = randomToken(8)) {
  const result = [...list];
  let hash = crypto.createHash('sha256').update(seed).digest();
  let pointer = 0;
  function rand() {
    if (pointer + 4 > hash.length) { hash = crypto.createHash('sha256').update(hash).digest(); pointer = 0; }
    const n = hash.readUInt32BE(pointer); pointer += 4; return n / 0xffffffff;
  }
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function chooseQuestions(type, category, count) {
  const catalog = questionSets[type] || [];
  if (category && category !== 'Gemischt') {
    return shuffle(catalog.filter(q => q.category === category), randomToken()).slice(0, count).map(q => q.id);
  }
  const groups = new Map();
  for (const q of catalog) {
    if (!groups.has(q.category)) groups.set(q.category, []);
    groups.get(q.category).push(q);
  }
  const groupLists = [...groups.values()].map(group => shuffle(group, randomToken()));
  const selected = [];
  let round = 0;
  while (selected.length < count) {
    let added = false;
    for (const group of groupLists) {
      if (group[round] && selected.length < count) { selected.push(group[round].id); added = true; }
    }
    if (!added) break;
    round += 1;
  }
  return shuffle(selected, randomToken());
}

function rollbackCurrentQuestion() {
  const question = currentQuestion();
  if (!question) return;
  for (const [playerId, response] of Object.entries(state.responses || {})) {
    const player = state.players[playerId];
    if (!player) continue;
    player.score -= Number(response.delta || 0);
    if (response.correct) player.correct = Math.max(0, player.correct - 1);
    else player.wrong = Math.max(0, player.wrong - 1);
    player.totalAnswerMs = Math.max(0, player.totalAnswerMs - Number(response.answerMs || 0));
    player.answerCount = Math.max(0, player.answerCount - 1);
  }
  if (state.phase === 'revealed') {
    const responded = new Set(Object.keys(state.responses || {}));
    for (const player of activePlayers()) {
      if (!responded.has(player.id)) player.unanswered = Math.max(0, player.unanswered - 1);
    }
    const last = state.answerHistory[state.answerHistory.length - 1];
    if (last?.questionId === question.id && last?.questionIndex === state.currentIndex) state.answerHistory.pop();
  }
  state.responses = {};
}

function startQuestion() {
  if (!currentQuestion()) throw new Error('Keine Frage ausgewählt.');
  state.phase = 'question';
  state.questionStartedAt = now();
  state.questionDurationSec = QUESTION_SECONDS;
  state.responses = {};
  state.overlay = null;
  state.pause = null;
  state.updatedAt = now();
  schedulePersist();
  broadcastAll();
}

function revealQuestion({ automatic = false } = {}) {
  if (!currentQuestion() || state.phase !== 'question') return;
  const responded = new Set(Object.keys(state.responses || {}));
  for (const player of activePlayers()) {
    if (!responded.has(player.id)) player.unanswered += 1;
  }
  state.phase = 'revealed';
  state.questionStartedAt = null;
  state.answerHistory.push({
    questionId: currentQuestion().id,
    questionIndex: state.currentIndex,
    category: currentQuestion().category,
    text: currentQuestion().text,
    options: currentQuestion().options,
    correctIndex: currentQuestion().correctIndex,
    responses: structuredClone(state.responses),
    distribution: answerDistribution(),
    automatic,
    revealedAt: now(),
  });
  state.updatedAt = now();
  schedulePersist();
  broadcastAll();
}

async function moveToNextQuestion() {
  if (state.currentIndex + 1 >= state.selectedQuestionIds.length) return finishQuiz();
  state.currentIndex += 1;
  state.phase = 'ready';
  state.questionStartedAt = null;
  state.questionDurationSec = QUESTION_SECONDS;
  state.responses = {};
  state.overlay = null;
  state.pause = null;
  state.updatedAt = now();
  schedulePersist();
  broadcastAll();
}

async function finishQuiz() {
  if (state.phase === 'question') revealQuestion();
  state.phase = 'finished';
  state.finishedAt = now();
  state.overlay = null;
  state.pause = null;
  state.questionStartedAt = null;
  state.updatedAt = now();
  const board = leaderboard();
  const run = {
    runUuid: state.runUuid || crypto.randomUUID(),
    quizType: state.quizType,
    title: state.title,
    category: state.category,
    questionCount: state.selectedQuestionIds.length,
    startedAt: state.startedAt,
    leaderboard: board,
    answerHistory: state.answerHistory,
    settings: { skippedQuestionIds: state.skippedQuestionIds, selectedQuestionIds: state.selectedQuestionIds },
  };
  if (dbConnected && state.savedRunUuid !== run.runUuid) {
    await saveQuizRun(run);
    state.savedRunUuid = run.runUuid;
  }
  await persistNow();
  broadcastAll();
}

function startPause(minutes) {
  const durationMs = clamp(Number(minutes), 5, 15) * 60 * 1000;
  if (state.phase === 'paused') throw new Error('Es läuft bereits eine Pause.');
  const previousPhase = state.phase;
  const questionRemainingSec = previousPhase === 'question' ? Math.max(1, Math.ceil(currentRemainingMs() / 1000)) : null;
  state.pause = { until: now() + durationMs, durationMs, previousPhase, questionRemainingSec, startedAt: now() };
  state.phase = 'paused';
  state.questionStartedAt = null;
  state.overlay = null;
  state.updatedAt = now();
  schedulePersist();
  broadcastAll();
}

function resumePause() {
  if (state.phase !== 'paused' || !state.pause) return;
  const pause = state.pause;
  state.phase = pause.previousPhase || 'ready';
  if (state.phase === 'question') {
    state.questionDurationSec = Math.max(1, Number(pause.questionRemainingSec || QUESTION_SECONDS));
    state.questionStartedAt = now();
  }
  state.pause = null;
  state.updatedAt = now();
  schedulePersist();
  broadcastAll();
}

function isQuizSessionActive() {
  return Boolean(state.preparedAt) && ACTIVE_PHASES.has(state.phase);
}

function checkRateLimit(key, maxAttempts, windowMs, lockMs) {
  const time = now();
  let bucket = attemptBuckets.get(key);
  if (!bucket || time - bucket.windowStart > windowMs) bucket = { windowStart: time, attempts: 0, lockedUntil: 0 };
  if (bucket.lockedUntil > time) return { allowed: false, retryAfterMs: bucket.lockedUntil - time };
  bucket.attempts += 1;
  if (bucket.attempts > maxAttempts) {
    bucket.lockedUntil = time + lockMs;
    bucket.attempts = 0;
    bucket.windowStart = time;
    attemptBuckets.set(key, bucket);
    return { allowed: false, retryAfterMs: lockMs };
  }
  attemptBuckets.set(key, bucket);
  return { allowed: true };
}

function clearRateLimit(key) { attemptBuckets.delete(key); }

function createAdminSession() {
  const token = randomToken(32);
  adminSessions.set(token, { createdAt: now(), lastActivity: now() });
  return token;
}

function validateAdminToken(token, { touch = true } = {}) {
  const session = adminSessions.get(token);
  if (!session) return false;
  const time = now();
  if (time - session.createdAt > ADMIN_MAX_MS || (!isQuizSessionActive() && time - session.lastActivity > ADMIN_IDLE_MS)) {
    adminSessions.delete(token);
    return false;
  }
  if (touch) session.lastActivity = time;
  return true;
}

function ensureAdmin(req, res, next) {
  const token = req.cookies.admin_token;
  if (!validateAdminToken(token)) return res.status(401).json({ error: 'Quizmaster-Anmeldung erforderlich.' });
  req.adminToken = token;
  return next();
}

function playerFromToken(token) {
  return Object.values(state.players).find(player => player.token === token) || null;
}

function getPlayerToken(req) {
  return String(req.headers['x-player-token'] || req.body?.playerToken || req.query?.playerToken || '').trim();
}

function ensurePlayer(req, res, next) {
  const player = playerFromToken(getPlayerToken(req));
  if (!player) return res.status(401).json({ error: 'Spieleranmeldung erforderlich.' });
  req.player = player;
  next();
}

function acceptCommand(commandId) {
  const id = String(commandId || '').trim();
  if (!id) return false;
  const time = now();
  for (const [key, timestamp] of handledCommands) if (time - timestamp > 10 * 60 * 1000) handledCommands.delete(key);
  if (handledCommands.has(id)) return false;
  handledCommands.set(id, time);
  return true;
}

app.get('/health', async (_req, res) => {
  let database = false;
  try { database = await pingDatabase(); } catch { database = false; }
  res.json({ ok: true, database, phase: state.phase, version: '6.0.0' });
});

app.get('/api/config', (_req, res) => res.json({ title: QUIZ_TITLE, questionSeconds: QUESTION_SECONDS }));

app.post('/api/player/login', async (req, res) => {
  const ip = getIp(req);
  const limit = checkRateLimit(`player:${ip}`, 20, 10 * 60 * 1000, 5 * 60 * 1000);
  if (!limit.allowed) return res.status(429).json({ error: 'Zu viele Anmeldeversuche.', retryAfterMs: limit.retryAfterMs });
  const name = safeName(req.body?.name);
  const password = String(req.body?.password || '');
  const existingToken = String(req.body?.playerToken || '').trim();
  if (password !== EVENT_PASSWORD) return res.status(403).json({ error: 'Falsches Quiz-Passwort.' });
  if (name.length < 2) return res.status(400).json({ error: 'Bitte einen Namen mit mindestens zwei Zeichen eingeben.' });

  let player = existingToken ? playerFromToken(existingToken) : null;
  if (player) {
    player.name = name;
    player.connected = true;
    clearRateLimit(`player:${ip}`);
    schedulePersist();
    broadcastAll();
    return res.json({ playerToken: player.token, state: playerState(player.id) });
  }

  const nameTaken = Object.values(state.players).some(p => p.name.localeCompare(name, 'de', { sensitivity: 'base' }) === 0);
  if (nameTaken) return res.status(409).json({ error: 'Dieser Spielername ist bereits vergeben.' });
  const id = crypto.randomUUID();
  player = {
    id,
    token: randomToken(32),
    name,
    score: 0,
    correct: 0,
    wrong: 0,
    unanswered: 0,
    totalAnswerMs: 0,
    answerCount: 0,
    connected: true,
    excluded: false,
    latencyMs: null,
    joinedAt: now(),
  };
  state.players[id] = player;
  clearRateLimit(`player:${ip}`);
  await persistNow();
  broadcastAll();
  res.json({ playerToken: player.token, state: playerState(player.id) });
});

app.get('/api/player/state', ensurePlayer, (req, res) => res.json(playerState(req.player.id)));

app.post('/api/player/answer', ensurePlayer, async (req, res) => {
  const player = req.player;
  if (player.excluded) return res.status(403).json({ error: 'Du wurdest vom Quiz ausgeschlossen.' });
  if (state.phase !== 'question') return res.status(409).json({ error: 'Aktuell läuft keine beantwortbare Frage.' });
  if (state.responses[player.id]) return res.status(409).json({ error: 'Antwort wurde bereits gespeichert.' });
  const answerIndex = Number(req.body?.answerIndex);
  const question = currentQuestion();
  if (!question || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return res.status(400).json({ error: 'Ungültige Antwort.' });
  const remainingMs = currentRemainingMs();
  if (remainingMs <= 0) return res.status(409).json({ error: 'Die Zeit ist abgelaufen.' });
  const remainingSeconds = clamp(Math.ceil(remainingMs / 1000), 0, state.questionDurationSec);
  const correct = answerIndex === question.correctIndex;
  const delta = calculateAnswerScore({ correct, remainingSeconds });
  const answerMs = Math.max(0, state.questionDurationSec * 1000 - remainingMs);
  state.responses[player.id] = { answerIndex, correct, delta, remainingSeconds, answerMs, respondedAt: now() };
  player.score += delta;
  player.correct += correct ? 1 : 0;
  player.wrong += correct ? 0 : 1;
  player.totalAnswerMs += answerMs;
  player.answerCount += 1;
  await persistNow();
  broadcastAll();
  res.json({ ok: true, response: state.responses[player.id], score: player.score });
});

app.post('/api/admin/login', (req, res) => {
  const ip = getIp(req);
  const key = `admin:${ip}`;
  const limit = checkRateLimit(key, 5, 10 * 60 * 1000, 15 * 60 * 1000);
  if (!limit.allowed) return res.status(429).json({ error: 'Zu viele falsche Anmeldungen. Bitte später erneut versuchen.', retryAfterMs: limit.retryAfterMs });
  if (String(req.body?.password || '') !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Falsches Quizmaster-Passwort.' });
  clearRateLimit(key);
  const token = createAdminSession();
  res.cookie('admin_token', token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: ADMIN_MAX_MS, path: '/' });
  res.json({ ok: true, state: adminState() });
});

app.post('/api/admin/logout', ensureAdmin, (req, res) => {
  adminSessions.delete(req.adminToken);
  res.clearCookie('admin_token', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/state', ensureAdmin, (_req, res) => res.json(adminState()));

app.post('/api/admin/prepare', ensureAdmin, async (req, res) => {
  const type = req.body?.quizType === 'child' ? 'child' : 'adult';
  const category = String(req.body?.category || 'Gemischt');
  const catalog = questionSets[type] || [];
  const available = category === 'Gemischt' ? catalog.length : catalog.filter(q => q.category === category).length;
  const count = clamp(Number(req.body?.questionCount || 25), 1, available);
  if (!available) return res.status(400).json({ error: 'Für diese Auswahl sind keine Fragen vorhanden.' });
  resetPlayerScores();
  state = {
    ...freshState(state.players),
    phase: 'ready',
    quizType: type,
    category,
    questionCount: count,
    selectedQuestionIds: chooseQuestions(type, category, count),
    currentIndex: 0,
    runUuid: crypto.randomUUID(),
    startedAt: now(),
    preparedAt: now(),
  };
  await persistNow();
  broadcastAll();
  res.json(adminState());
});

app.post('/api/admin/action', ensureAdmin, async (req, res) => {
  if (!acceptCommand(req.body?.commandId)) return res.json({ ok: true, duplicate: true, state: adminState() });
  const action = String(req.body?.action || '');
  try {
    switch (action) {
      case 'start_question':
        if (state.phase !== 'ready') throw new Error('Die Frage kann in diesem Zustand nicht gestartet werden.');
        startQuestion();
        break;
      case 'repeat_question':
        if (!['question', 'revealed'].includes(state.phase)) throw new Error('Es gibt keine laufende oder aufgelöste Frage zum Wiederholen.');
        rollbackCurrentQuestion();
        startQuestion();
        break;
      case 'reveal_question':
        if (state.phase !== 'question') throw new Error('Es läuft keine Frage.');
        revealQuestion();
        break;
      case 'skip_question':
        if (!['ready', 'question', 'revealed'].includes(state.phase)) throw new Error('Diese Frage kann aktuell nicht übersprungen werden.');
        if (state.phase !== 'ready') rollbackCurrentQuestion();
        if (currentQuestion()) state.skippedQuestionIds.push(currentQuestion().id);
        await moveToNextQuestion();
        break;
      case 'next_question':
        if (state.phase !== 'revealed') throw new Error('Bitte zuerst die aktuelle Frage auflösen.');
        await moveToNextQuestion();
        break;
      case 'show_leaderboard':
        if (state.phase === 'question' || state.phase === 'paused') throw new Error('Die Zwischenrangliste kann nicht während einer laufenden Frage oder Pause gezeigt werden.');
        state.overlay = { type: 'leaderboard', shownAt: now(), intermediate: state.phase !== 'finished' };
        state.updatedAt = now();
        schedulePersist();
        broadcastAll();
        break;
      case 'hide_leaderboard':
        state.overlay = null;
        state.updatedAt = now();
        schedulePersist();
        broadcastAll();
        break;
      case 'pause':
        startPause(Number(req.body?.minutes || 5));
        break;
      case 'resume_pause':
        resumePause();
        break;
      case 'exclude_player': {
        const player = state.players[String(req.body?.playerId || '')];
        if (!player) throw new Error('Spieler nicht gefunden.');
        player.excluded = true;
        player.connected = false;
        state.updatedAt = now();
        await persistNow();
        broadcastAll();
        break;
      }
      case 'restore_player': {
        const player = state.players[String(req.body?.playerId || '')];
        if (!player) throw new Error('Spieler nicht gefunden.');
        player.excluded = false;
        state.updatedAt = now();
        await persistNow();
        broadcastAll();
        break;
      }
      case 'finish_quiz':
        await finishQuiz();
        break;
      case 'reset_scores': {
        if (state.phase === 'question' || state.phase === 'paused') throw new Error('Punkte können nicht während einer laufenden Frage oder Pause zurückgesetzt werden.');
        resetPlayerScores();
        state.currentIndex = 0;
        state.responses = {};
        state.answerHistory = [];
        state.skippedQuestionIds = [];
        state.overlay = null;
        state.pause = null;
        state.questionStartedAt = null;
        state.questionDurationSec = QUESTION_SECONDS;
        state.finishedAt = null;
        state.savedRunUuid = null;
        if (state.preparedAt && state.selectedQuestionIds.length) {
          state.phase = 'ready';
          state.runUuid = crypto.randomUUID();
          state.startedAt = now();
        } else {
          state.phase = 'lobby';
        }
        state.updatedAt = now();
        await persistNow();
        broadcastAll();
        break;
      }
      case 'reset_quiz': {
        const players = state.players;
        for (const player of Object.values(players)) {
          player.score = 0; player.correct = 0; player.wrong = 0; player.unanswered = 0;
          player.totalAnswerMs = 0; player.answerCount = 0; player.excluded = false;
        }
        state = freshState(players);
        await persistNow();
        broadcastAll();
        break;
      }
      case 'remove_all_players': {
        for (const client of io.sockets.sockets.values()) {
          if (client.data.role === 'player') {
            client.emit('auth_error', 'Der Quizmaster hat alle Teilnehmer entfernt. Bitte neu anmelden.');
            client.disconnect(true);
          }
        }
        state = freshState({});
        await persistNow();
        broadcastAll();
        break;
      }
      default:
        throw new Error('Unbekannter Quizmaster-Befehl.');
    }
    res.json({ ok: true, state: adminState() });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.get('/api/admin/questions', ensureAdmin, (req, res) => {
  const type = req.query.type === 'child' ? 'child' : 'adult';
  res.json({ type, questions: questionSets[type], categories: [...new Set(questionSets[type].map(q => q.category))].sort((a, b) => a.localeCompare(b, 'de')) });
});

app.put('/api/admin/questions', ensureAdmin, async (req, res) => {
  const type = req.body?.type === 'child' ? 'child' : 'adult';
  const incoming = Array.isArray(req.body?.questions) ? req.body.questions : [];
  if (!incoming.length) return res.status(400).json({ error: 'Der Fragenkatalog darf nicht leer sein.' });
  const ids = new Set();
  const validated = [];
  for (let i = 0; i < incoming.length; i += 1) {
    const q = incoming[i] || {};
    const id = String(q.id || `${type}-custom-${crypto.randomUUID()}`).trim();
    const text = String(q.text || '').trim();
    const category = String(q.category || 'Allgemeinwissen').trim();
    const options = Array.isArray(q.options) ? q.options.map(v => String(v).trim()) : [];
    const correctIndex = Number(q.correctIndex);
    const imageUrl = String(q.imageUrl || '').trim();
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      return res.status(400).json({ error: `Frage ${i + 1}: Der optionale Bildlink muss mit http:// oder https:// beginnen.` });
    }
    if (!id || ids.has(id) || !text || !category || options.length !== 4 || options.some(v => !v) || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      return res.status(400).json({ error: `Frage ${i + 1} ist unvollständig oder ungültig.` });
    }
    ids.add(id);
    validated.push({ id, category, text, options, correctIndex, ...(imageUrl ? { imageUrl } : {}) });
  }
  questionSets[type] = validated;
  await saveQuestionSet(type, validated);
  broadcastAll();
  res.json({ ok: true, type, questions: validated });
});

app.get('/api/admin/history', ensureAdmin, async (_req, res) => {
  const runs = await listQuizRuns(200);
  res.json(runs.map(run => ({
    id: run.id,
    runUuid: run.run_uuid,
    quizType: run.quiz_type,
    title: run.title,
    category: run.category || 'Gemischt',
    questionCount: run.question_count || run.answer_history?.length || 0,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    playerCount: Array.isArray(run.leaderboard) ? run.leaderboard.length : 0,
    winner: Array.isArray(run.leaderboard) ? run.leaderboard[0]?.name || null : null,
  })));
});

app.get('/api/admin/history/:id', ensureAdmin, async (req, res) => {
  const run = await getQuizRun(Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'Quizabend nicht gefunden.' });
  res.json({
    id: run.id,
    runUuid: run.run_uuid,
    quizType: run.quiz_type,
    title: run.title,
    category: run.category || 'Gemischt',
    questionCount: run.question_count || run.answer_history?.length || 0,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    leaderboard: run.leaderboard || [],
    answerHistory: run.answer_history || [],
    settings: run.settings || {},
  });
});

app.delete('/api/admin/history/:id', ensureAdmin, async (req, res) => {
  const deleted = await deleteQuizRun(Number(req.params.id));
  res.json({ ok: deleted });
});

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const idx = part.indexOf('=');
    return idx < 0 ? [part, ''] : [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
  }));
}

io.on('connection', socket => {
  const role = String(socket.handshake.auth?.role || 'screen');
  if (role === 'player') {
    const player = playerFromToken(String(socket.handshake.auth?.playerToken || ''));
    if (player) {
      socket.data.role = 'player';
      socket.data.playerId = player.id;
      player.connected = true;
      socket.emit('state', playerState(player.id));
      schedulePersist(500);
      broadcastAll();
    } else {
      socket.emit('auth_error', 'Spieleranmeldung ungültig.');
    }
  } else if (role === 'admin') {
    const token = parseCookies(socket.handshake.headers.cookie || '').admin_token;
    if (validateAdminToken(token)) {
      socket.data.role = 'admin';
      socket.emit('admin_state', adminState());
    } else socket.emit('auth_error', 'Quizmaster-Anmeldung erforderlich.');
  } else {
    socket.data.role = 'screen';
    socket.emit('screen_state', basePublicState());
  }

  socket.on('latency_ping', (_sentAt, callback) => {
    if (typeof callback === 'function') callback(now());
  });
  socket.on('latency_report', value => {
    if (socket.data.role !== 'player' || !socket.data.playerId) return;
    const player = state.players[socket.data.playerId];
    if (!player) return;
    player.latencyMs = clamp(Math.round(Number(value) || 0), 0, 9999);
    for (const adminSocket of io.sockets.sockets.values()) {
      if (adminSocket.data.role === 'admin') adminSocket.emit('admin_state', adminState());
    }
  });
  socket.on('disconnect', () => {
    if (socket.data.role === 'player' && socket.data.playerId && state.players[socket.data.playerId]) {
      state.players[socket.data.playerId].connected = false;
      schedulePersist(500);
      broadcastAll();
    }
  });
});

setInterval(() => {
  if (state.phase === 'question' && currentRemainingMs() <= 0) revealQuestion({ automatic: true });
  if (state.phase === 'paused' && state.pause?.until <= now()) resumePause();
}, 250);

setInterval(() => {
  const time = now();
  for (const [token, session] of adminSessions) {
    if (time - session.createdAt > ADMIN_MAX_MS || (!isQuizSessionActive() && time - session.lastActivity > ADMIN_IDLE_MS)) adminSessions.delete(token);
  }
}, 60 * 1000);

async function bootstrap() {
  try {
    const initialized = await initDatabase(defaultSets);
    questionSets = initialized.questionSets;
    dbConnected = initialized.enabled;
    if (initialized.liveState && typeof initialized.liveState === 'object') {
      state = { ...freshState(), ...initialized.liveState, title: QUIZ_TITLE };
      state.players = state.players || {};
      state.responses = state.responses || {};
      state.answerHistory = state.answerHistory || [];
      state.skippedQuestionIds = state.skippedQuestionIds || [];
      for (const player of Object.values(state.players)) { player.connected = false; player.latencyMs = null; }
      if (state.phase === 'question' && currentRemainingMs() <= 0) revealQuestion({ automatic: true });
      if (state.phase === 'paused' && state.pause?.until <= now()) resumePause();
    }
    console.log(dbConnected ? 'Neon-Datenbank verbunden.' : 'Keine DATABASE_URL: lokale Speicherung aktiv.');
  } catch (error) {
    console.error('Neon-Verbindung fehlgeschlagen; lokale Speicherung aktiv:', error.message);
    questionSets = structuredClone(defaultSets);
    dbConnected = false;
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Ahnsen Quizabend v6 läuft auf Port ${PORT}.`);
  });
}

bootstrap();
