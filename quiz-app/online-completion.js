'use strict';

const runtimeRoomAdmin = require('./runtime-room-admin');
const onlineStorage = require('./online-room-storage');

function installOnlineCompletionRoutes(app) {
  app.get('/api/online/rooms/:code/spectate', (req, res) => {
    const state = runtimeRoomAdmin.spectatorState(req.params.code);
    if (!state) return res.status(404).json({ error: 'Dieser Online-Raum wurde nicht gefunden oder ist nicht mehr aktiv.' });
    res.set('Cache-Control', 'no-store');
    res.json({ spectator: true, state });
  });

  app.get('/api/online/rooms/:code/host-options', (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(runtimeRoomAdmin.hostOptions(req.params.code, req.query.token));
    } catch (error) { next(error); }
  });

  app.post('/api/online/rooms/:code/transfer-host', async (req, res, next) => {
    try {
      const result = runtimeRoomAdmin.transferHost(req.params.code, req.body?.token, String(req.body?.playerId || ''));
      if (onlineStorage.enabled) await onlineStorage.saveRoom(result.room).catch(error => {
        console.error('Gastgeberwechsel konnte nicht sofort persistiert werden:', error.message);
      });
      res.json({ ok: true, previousHost: result.previousHost, host: result.host });
    } catch (error) { next(error); }
  });
}

module.exports = { installOnlineCompletionRoutes };
