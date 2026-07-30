'use strict';

const profileAuth = require('./solo-profile-auth');
const accountStorage = require('./account-storage');
const adminProfileStorage = require('./platform-admin-profile-storage');
const adminStorage = require('./platform-admin-storage');
const runtimeRoomAdmin = require('./runtime-room-admin');
const platformDb = require('./platform-db');
const storage = require('./platform-storage');
const testMailbox = require('./test-mailbox');
const phase10Bridge = require('./phase10-online-bridge');
const phase10Progression = require('./phase10-progression-bridge');
const { installPlatformSecurity } = require('./platform-security');
const { installPlatformRoutes, requirePlatformAdmin } = require('./platform-routes');
const { installPhase10Routes } = require('./phase10-routes');
const { installBrowserTestStatusRoute } = require('./browser-test-status');
const { installE2ETestSupport } = require('./e2e-test-support');

phase10Bridge.patchOnlineStorage();
phase10Progression.patchProgression();

accountStorage.adminListProfiles = adminProfileStorage.listProfiles;
for (const method of ['verifyEmailToken', 'consumePasswordReset']) {
  const original = accountStorage[method];
  accountStorage[method] = async (...args) => {
    await accountStorage.ensureReady();
    return original(...args);
  };
}

if (process.env.NODE_ENV === 'test' && !accountStorage.__quiztimeE2ELinksWrapped) {
  const requestVerification = accountStorage.requestEmailVerification;
  accountStorage.requestEmailVerification = async (...args) => {
    const result = await requestVerification(...args);
    testMailbox.add({
      to: result.email,
      subject: 'E-Mail-Adresse für QuizTime bestätigen',
      text: `Bestätigungslink: ${process.env.APP_BASE_URL || 'http://127.0.0.1:3000'}/recover?verify=${encodeURIComponent(result.token)}`,
    });
    return result;
  };
  const createReset = accountStorage.createPasswordReset;
  accountStorage.createPasswordReset = async (...args) => {
    const result = await createReset(...args);
    if (result) testMailbox.add({
      to: result.email,
      subject: 'QuizTime-Passwort zurücksetzen',
      text: `Passwortlink: ${process.env.APP_BASE_URL || 'http://127.0.0.1:3000'}/recover?reset=${encodeURIComponent(result.token)}`,
    });
    return result;
  };
  accountStorage.__quiztimeE2ELinksWrapped = true;
}

const loadBaseAccount = accountStorage.getAccount;
accountStorage.getAccount = async profileId => {
  const account = await loadBaseAccount(profileId);
  if (!account || !platformDb.enabled()) return account;
  const { rows } = await platformDb.query(`
    SELECT leaderboard_visible,public_profile,allow_friend_requests,invite_policy,
           email_notifications,push_notifications
      FROM quiz_account_preferences WHERE profile_id=$1
  `, [profileId]);
  const preferences = rows[0];
  if (!preferences) return account;
  account.preferences = {
    leaderboardVisible: Boolean(preferences.leaderboard_visible),
    publicProfile: Boolean(preferences.public_profile),
    allowFriendRequests: Boolean(preferences.allow_friend_requests),
    invitePolicy: preferences.invite_policy || 'friends',
    emailNotifications: Boolean(preferences.email_notifications),
    pushNotifications: Boolean(preferences.push_notifications),
  };
  return account;
};

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
    phase10Bridge.installRequestCapture(app);

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
      installE2ETestSupport(app);
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
    installPhase10Routes(app, {
      requireProfile: profileAuth.requireProfile,
      requireAdmin: requirePlatformAdmin,
    });
    installBrowserTestStatusRoute(app, requirePlatformAdmin);
  };
  profileAuth.__quiztimePlatformWrapped = true;
}
