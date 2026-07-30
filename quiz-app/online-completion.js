'use strict';

const runtimeRoomAdmin = require('./runtime-room-admin');
const onlineStorage = require('./online-room-storage');

function persistentSnapshot(room) {
  const snapshot = structuredClone(room);
  for (const player of Object.values(snapshot.players || {})) {
    player.connected = false;
    delete player.token;
  }
  return snapshot;
}

function sendRoomError(res, error) {
  const message = String(error?.message || 'Die Online-Aktion konnte nicht verarbeitet werden.');
  const status = /nicht gefunden/iu.test(message) ? 404
    : /Nur der aktuelle Gastgeber|Spieleranmeldung/iu.test(message) ? 403
      : /anderen verbundenen Spieler|aktuell verbunden/iu.test(message) ? 409
        : 500;
  res.status(status).json({ error: status === 500 ? 'Die Online-Aktion konnte nicht verarbeitet werden.' : message });
}

function installOnlineCompletionRoutes(app) {
  app.get('/api/online/rooms/:code/spectate', (req, res) => {
    const state = runtimeRoomAdmin.spectatorState(req.params.code);
    if (!state) return res.status(404).json({ error: 'Dieser Online-Raum wurde nicht gefunden oder ist nicht mehr aktiv.' });
    res.set('Cache-Control', 'no-store');
    res.json({ spectator: true, state });
  });

  app.get('/api/online/rooms/:code/host-options', (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(runtimeRoomAdmin.hostOptions(req.params.code, req.query.token));
    } catch (error) { sendRoomError(res, error); }
  });

  app.post('/api/online/rooms/:code/transfer-host', async (req, res) => {
    try {
      const result = runtimeRoomAdmin.transferHost(req.params.code, req.body?.token, String(req.body?.playerId || ''));
      if (onlineStorage.enabled) await onlineStorage.saveRoom(persistentSnapshot(result.room)).catch(error => {
        console.error('Gastgeberwechsel konnte nicht sofort persistiert werden:', error.message);
      });
      res.json({ ok: true, previousHost: result.previousHost, host: result.host });
    } catch (error) { sendRoomError(res, error); }
  });
}

module.exports = { installOnlineCompletionRoutes, _test: { persistentSnapshot, sendRoomError } };
