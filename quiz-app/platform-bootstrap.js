'use strict';

const profileAuth = require('./solo-profile-auth');
const accountStorage = require('./account-storage');
const adminProfileStorage = require('./platform-admin-profile-storage');
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

storage.ensureReady().catch(error => {
  console.error('QuizTime-Plattformtabellen konnten nicht vorbereitet werden:', error.message);
});

if (!profileAuth.__quiztimePlatformWrapped) {
  const originalInstall = profileAuth.installProfileRoutes;
  profileAuth.installProfileRoutes = function installProfileRoutesWithPlatform(app) {
    installPlatformSecurity(app);
    originalInstall(app);
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
