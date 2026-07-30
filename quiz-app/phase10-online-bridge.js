'use strict';

const onlineStorage = require('./online-room-storage');
const phase10 = require('./phase10-storage');
const profileStore = require('./extended-storage');

const INTERNAL_SECRET = String(process.env.PLATFORM_INTERNAL_SECRET || process.env.ADMIN_PASSWORD || process.env.EVENT_PASSWORD || 'quiztime-internal');
const competitions = new Map();
let patched = false;

function internalRequest(req) {
  return String(req.headers['x-quiztime-internal'] || '') === INTERNAL_SECRET;
}

function metadataFor(code) {
  const key = String(code || '').toUpperCase();
  if (!competitions.has(key)) competitions.set(key, { profiles: {}, profileNames: {} });
  return competitions.get(key);
}

function captureResponse(req, payload) {
  if (!internalRequest(req) || !payload?.code || !payload?.playerId) return;
  const meta = metadataFor(payload.code);
  if (/\/api\/online\/rooms\/?(?:\?|$)/.test(req.originalUrl) && req.method === 'POST') {
    meta.duelId = req.body?.duelId || null;
    meta.tournamentMatchId = req.body?.tournamentMatchId || null;
    meta.competitionType = req.body?.competitionType || (meta.duelId ? 'duel' : meta.tournamentMatchId ? 'tournament' : 'online');
  }
  const playerId = String(payload.playerId);
  if (req.body?.profileId) meta.profiles[playerId] = String(req.body.profileId);
  else {
    const name = String(req.body?.hostName || req.body?.name || '').trim();
    if (name) meta.profileNames[playerId] = name;
  }
}

function installRequestCapture(app) {
  app.use('/api/online', (req, res, next) => {
    if (!internalRequest(req)) return next();
    const originalJson = res.json.bind(res);
    res.json = payload => {
      try { captureResponse(req, payload); } catch (error) { console.error('Wettbewerbsraum-Metadaten konnten nicht erfasst werden:', error.message); }
      return originalJson(payload);
    };
    next();
  });
}

async function resolveProfiles(code) {
  const meta = competitions.get(String(code || '').toUpperCase());
  if (!meta) return;
  for (const [playerId, name] of Object.entries(meta.profileNames || {})) {
    if (meta.profiles[playerId]) continue;
    const profile = await profileStore.findProfileByNameKey(String(name).trim().toLocaleLowerCase('de-DE')).catch(() => null);
    if (profile?.id) meta.profiles[playerId] = profile.id;
  }
}

function enrichRoom(room) {
  if (!room?.code) return room;
  const meta = competitions.get(String(room.code).toUpperCase());
  if (!meta) return room;
  const copy = structuredClone(room);
  copy.duelId = meta.duelId || copy.duelId || null;
  copy.tournamentMatchId = meta.tournamentMatchId || copy.tournamentMatchId || null;
  copy.competitionType = meta.competitionType || copy.competitionType || null;
  copy.competitionRecordedAt = meta.competitionRecordedAt || copy.competitionRecordedAt || null;
  for (const [playerId, profileId] of Object.entries(meta.profiles || {})) {
    if (copy.players?.[playerId]) copy.players[playerId].profileId = profileId;
  }
  return copy;
}

function rememberRoom(room) {
  if (!room?.code) return;
  const hasCompetition = room.duelId || room.tournamentMatchId || Object.values(room.players || {}).some(player => player.profileId);
  if (!hasCompetition) return;
  const meta = metadataFor(room.code);
  meta.duelId = room.duelId || meta.duelId || null;
  meta.tournamentMatchId = room.tournamentMatchId || meta.tournamentMatchId || null;
  meta.competitionType = room.competitionType || meta.competitionType || null;
  meta.competitionRecordedAt = room.competitionRecordedAt || meta.competitionRecordedAt || null;
  for (const player of Object.values(room.players || {})) if (player.profileId) meta.profiles[player.id] = player.profileId;
}

function patchOnlineStorage() {
  if (patched) return;
  patched = true;
  const originalSave = onlineStorage.saveRoom.bind(onlineStorage);
  const originalLoad = onlineStorage.loadRooms.bind(onlineStorage);
  const originalDelete = onlineStorage.deleteRoom.bind(onlineStorage);

  onlineStorage.saveRoom = async (room, ttl) => {
    rememberRoom(room);
    await resolveProfiles(room?.code);
    const enriched = enrichRoom(room);
    const saved = await originalSave(enriched, ttl);
    if (enriched?.phase === 'finished' && !enriched.competitionRecordedAt && (enriched.duelId || enriched.tournamentMatchId || Object.values(enriched.players || {}).some(player => player.profileId))) {
      try {
        const recorded = await phase10.recordRoomResult(enriched);
        if (recorded) {
          const meta = metadataFor(enriched.code);
          meta.competitionRecordedAt = enriched.competitionRecordedAt || Date.now();
          enriched.competitionRecordedAt = meta.competitionRecordedAt;
          await originalSave(enriched, ttl);
        }
      } catch (error) {
        console.error(`Wettbewerbsergebnis für Raum ${enriched.code} konnte nicht gespeichert werden:`, error.message);
      }
    }
    return saved;
  };

  onlineStorage.loadRooms = async (...args) => {
    const rooms = await originalLoad(...args);
    rooms.forEach(rememberRoom);
    return rooms;
  };

  onlineStorage.deleteRoom = async code => {
    competitions.delete(String(code || '').toUpperCase());
    return originalDelete(code);
  };
}

module.exports = { installRequestCapture, patchOnlineStorage, _test: { enrichRoom, captureResponse } };
