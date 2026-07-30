'use strict';

const crypto = require('crypto');

let runtime = {
  rooms: null,
  streams: null,
  questionTimers: null,
};

function configure({ rooms, streams, questionTimers } = {}) {
  runtime = { rooms: rooms || null, streams: streams || null, questionTimers: questionTimers || null };
}

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('base64url');
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function roomForCode(code) {
  return runtime.rooms?.get(normalizeCode(code)) || null;
}

function playerForToken(room, token) {
  const digest = hashToken(token);
  return Object.values(room?.players || {}).find(player => secureEqual(player.tokenHash, digest)) || null;
}

function sendRemoved(entry, message) {
  try {
    if (!entry?.res || entry.res.writableEnded) return;
    entry.res.write(`event: removed\ndata: ${JSON.stringify({ message })}\n\n`);
    entry.res.end();
  } catch { /* Verbindung ist bereits beendet. */ }
}

function endForReconnect(entry) {
  try {
    if (!entry?.res || entry.res.writableEnded) return;
    entry.res.end();
  } catch { /* Verbindung ist bereits beendet. */ }
}

function forceReconnect(code) {
  const normalized = normalizeCode(code);
  const entries = runtime.streams?.get(normalized) || new Set();
  for (const entry of [...entries]) endForReconnect(entry);
  runtime.streams?.delete(normalized);
}

function closeRoom(code, reason = 'Dieser Raum wurde durch die Plattform-Moderation geschlossen.') {
  const normalized = normalizeCode(code);
  if (!runtime.rooms) return false;
  const room = runtime.rooms.get(normalized);
  const timer = runtime.questionTimers?.get(normalized);
  if (timer) clearTimeout(timer);
  runtime.questionTimers?.delete(normalized);
  const entries = runtime.streams?.get(normalized) || new Set();
  for (const entry of entries) sendRemoved(entry, reason);
  runtime.streams?.delete(normalized);
  runtime.rooms.delete(normalized);
  return Boolean(room);
}

function kickPlayer(code, playerId, reason = 'Du wurdest durch die Plattform-Moderation aus diesem Raum entfernt.') {
  const normalized = normalizeCode(code);
  const room = roomForCode(normalized);
  if (!room?.players?.[playerId]) return null;
  const player = room.players[playerId];
  const targetHash = player.tokenHash;
  delete room.players[playerId];
  if (room.responses) delete room.responses[playerId];

  if (room.hostPlayerId === playerId) {
    const successor = Object.values(room.players || {}).sort((left, right) => Number(left.joinedAt || 0) - Number(right.joinedAt || 0))[0] || null;
    room.hostPlayerId = successor?.id || null;
    if (successor) successor.ready = true;
  }
  room.updatedAt = Date.now();

  const entries = runtime.streams?.get(normalized) || new Set();
  for (const entry of [...entries]) {
    if (targetHash && secureEqual(hashToken(entry.token), targetHash)) {
      sendRemoved(entry, reason);
      entries.delete(entry);
    } else {
      endForReconnect(entry);
      entries.delete(entry);
    }
  }
  if (entries.size) runtime.streams?.set(normalized, entries);
  else runtime.streams?.delete(normalized);
  return { id: player.id, name: player.name };
}

function transferHost(code, token, targetPlayerId) {
  const room = roomForCode(code);
  if (!room) throw new Error('Dieser Online-Raum wurde nicht gefunden.');
  const actor = playerForToken(room, token);
  if (!actor || room.hostPlayerId !== actor.id) throw new Error('Nur der aktuelle Gastgeber kann die Leitung übertragen.');
  const target = room.players?.[targetPlayerId];
  if (!target || target.id === actor.id) throw new Error('Bitte einen anderen verbundenen Spieler auswählen.');
  if (!target.connected) throw new Error('Der neue Gastgeber muss aktuell verbunden sein.');
  room.hostPlayerId = target.id;
  target.ready = true;
  room.updatedAt = Date.now();
  forceReconnect(room.code);
  return { room, previousHost: { id: actor.id, name: actor.name }, host: { id: target.id, name: target.name } };
}

function hostOptions(code, token) {
  const room = roomForCode(code);
  if (!room) throw new Error('Dieser Online-Raum wurde nicht gefunden.');
  const actor = playerForToken(room, token);
  if (!actor) throw new Error('Die Spieleranmeldung für diesen Raum ist ungültig.');
  return {
    isHost: room.hostPlayerId === actor.id,
    phase: room.phase,
    players: Object.values(room.players || {}).map(player => ({ id: player.id, name: player.name, connected: Boolean(player.connected), isHost: player.id === room.hostPlayerId })),
  };
}

function shuffleQuestions(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(0, index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function replaceQuestions(code, catalog, category = 'Gemischt') {
  const room = roomForCode(code);
  if (!room) throw new Error('Dieser Online-Raum wurde nicht gefunden.');
  const source = category === 'Gemischt' ? catalog : catalog.filter(question => question.category === category);
  const pool = source.length ? source : catalog;
  if (!pool.length) throw new Error('Der veröffentlichte Fragenkatalog enthält keine passenden Fragen.');
  const questions = [];
  let batch = shuffleQuestions(pool);
  while (questions.length < Number(room.questionCount || 10)) {
    if (!batch.length) batch = shuffleQuestions(pool);
    questions.push(structuredClone(batch.pop()));
  }
  room.category = category;
  room.questions = questions;
  room.currentIndex = 0;
  room.updatedAt = Date.now();
  forceReconnect(room.code);
  return room;
}

function spectatorState(code) {
  const room = roomForCode(code);
  if (!room) return null;
  const reveal = room.phase === 'revealed' || room.phase === 'finished';
  const question = room.questions?.[room.currentIndex] || null;
  const players = Object.values(room.players || {}).map(player => ({
    id: player.id,
    name: player.name,
    team: player.team || null,
    score: Number(player.score || 0),
    correct: Number(player.correct || 0),
    wrong: Number(player.wrong || 0),
    unanswered: Number(player.unanswered || 0),
    connected: Boolean(player.connected),
    isHost: player.id === room.hostPlayerId,
  })).sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name, 'de'));
  return {
    code: room.code,
    title: room.title,
    phase: room.phase,
    quizType: room.quizType,
    category: room.category,
    gameMode: room.gameMode,
    currentIndex: Number(room.currentIndex || 0),
    totalQuestions: Number(room.questionCount || room.questions?.length || 0),
    questionStartedAt: room.questionStartedAt || null,
    durationSec: 20,
    serverNow: Date.now(),
    question: question ? {
      id: question.id,
      category: question.category,
      text: question.text,
      options: question.options,
      ...(question.imageUrl ? { imageUrl: question.imageUrl } : {}),
      ...(reveal ? { correctIndex: question.correctIndex, explanation: question.explanation } : {}),
    } : null,
    answeredCount: Object.keys(room.responses || {}).length,
    players,
  };
}

function status() {
  return {
    configured: Boolean(runtime.rooms && runtime.streams && runtime.questionTimers),
    activeRooms: runtime.rooms?.size || 0,
    activeStreams: runtime.streams ? [...runtime.streams.values()].reduce((sum, entries) => sum + Number(entries?.size || 0), 0) : 0,
  };
}

module.exports = {
  configure,
  closeRoom,
  kickPlayer,
  transferHost,
  hostOptions,
  replaceQuestions,
  spectatorState,
  roomForCode,
  forceReconnect,
  status,
  _test: { hashToken, normalizeCode, shuffleQuestions },
};
