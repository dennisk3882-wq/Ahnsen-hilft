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

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('base64url');
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

function closeRoom(code, reason = 'Dieser Raum wurde durch die Plattform-Moderation geschlossen.') {
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
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
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const room = runtime.rooms?.get(normalized);
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
    if (targetHash && hashToken(entry.token) === targetHash) {
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

function status() {
  return {
    configured: Boolean(runtime.rooms && runtime.streams && runtime.questionTimers),
    activeRooms: runtime.rooms?.size || 0,
    activeStreams: runtime.streams ? [...runtime.streams.values()].reduce((sum, entries) => sum + Number(entries?.size || 0), 0) : 0,
  };
}

module.exports = { configure, closeRoom, kickPlayer, status, _test: { hashToken } };
