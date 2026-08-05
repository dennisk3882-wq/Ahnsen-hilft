'use strict';

const profileAuth = require('./solo-profile-auth');
const { requirePlatformAdmin } = require('./platform-routes');
const { installPhase1213Routes } = require('./phase12-13-routes');
const storage = require('./phase12-13-storage');

storage.ensureReady().catch(error => console.error('QuizTime Phase 12/13 konnte nicht vorbereitet werden:', error.message));

if (!profileAuth.__quiztimePhase1213Wrapped) {
  const previousInstall = profileAuth.installProfileRoutes;
  profileAuth.installProfileRoutes = function installProfileRoutesWithPhase1213(app) {
    previousInstall(app);
    installPhase1213Routes(app, {
      requireProfile: profileAuth.requireProfile,
      requireAdmin: requirePlatformAdmin,
      profileForRequest: profileAuth.profileForRequest,
    });
  };
  profileAuth.__quiztimePhase1213Wrapped = true;
}
