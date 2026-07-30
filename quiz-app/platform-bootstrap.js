'use strict';

const profileAuth = require('./solo-profile-auth');
const accountStorage = require('./account-storage');
const adminProfileStorage = require('./platform-admin-profile-storage');
const adminStorage = require('./platform-admin-storage');
const runtimeRoomAdmin = require('./runtime-room-admin');
const storage = require('./platform-storage');
const { installPlatformSecurity } = require('./platform-security');
const { installPlatformRoutes } = require('./platform-routes');

accountStorage.adminListProfiles = adminProfileStorage.listProfiles;
for (const method of ['verifyEmailToken', 'consumePasswordReset']) {
  const original = accountStorage[method];
  accountStorage[method] = async (...args) => {
    await accountStorage.ensureReady();
    return original(...args);
  };
}

if (!adminStorage.__quiztimeRuntimeWrapped) {
  const closePersistedRoom = adminStorage.closeRoom;
  adminStorage.closeRoom = async (code, reason) => {
    runtimeRoomAdmin.closeRoom(code, reason);
    return closePersistedRoom(code, reason);
  };
  const kickPersistedPlayer = adminStorage.kickRoomPlayer;
  adminStorage.kickRoomPlayer = async (code, playerId, reason) => {
    const runtimePlayer = runtimeRoomAdmin.kickPlayer(code, playerId, reason);
    const persistedPlayer = await kickPersistedPlayer(code, playerId, reason).catch(error => {
      if (runtimePlayer) return runtimePlayer;
      throw error;
    });
    return persistedPlayer || runtimePlayer;
  };
  adminStorage.__quiztimeRuntimeWrapped = true;
}

storage.ensureReady().catch(error => {
  console.error('QuizTime-Plattformtabellen konnten nicht vorbereitet werden:', error.message);
});

if (!profileAuth.__quiztimePlatformWrapped) {
  const originalInstall = profileAuth.installProfileRoutes;
  profileAuth.installProfileRoutes = function installProfileRoutesWithPlatform(app) {
    installPlatformSecurity(app);

    const NativeMap = global.Map;
    const capturedMaps = [];
    class CapturedMap extends NativeMap {
      constructor(...args) {
        super(...args);
        capturedMaps.push(this);
      }
    }
    global.Map = CapturedMap;
    try {
      originalInstall(app);
    } finally {
      global.Map = NativeMap;
    }
    runtimeRoomAdmin.configure({
      rooms: capturedMaps[0],
      streams: capturedMaps[1],
      questionTimers: capturedMaps[2],
    });

    app.use('/api/platform', async (_req, res, next) => {
      try {
        if (!storage.enabled()) return res.status(503).json({ error: 'Für Community-Funktionen wird PostgreSQL benötigt.' });
        await storage.ensureReady();
        next();
      } catch (error) {
        res.status(503).json({ error: `QuizTime Community wird vorbereitet: ${error.message}` });
      }
    });
    installPlatformRoutes(app, {
      requireProfile: profileAuth.requireProfile,
      profileForRequest: profileAuth.profileForRequest,
    });
  };
  profileAuth.__quiztimePlatformWrapped = true;
}
