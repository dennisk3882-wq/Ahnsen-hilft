'use strict';

const profileAuth = require('./solo-profile-auth');
const { installPlatformSecurity } = require('./platform-security');
const { installPlatformRoutes } = require('./platform-routes');

if (!profileAuth.__quiztimePlatformWrapped) {
  const originalInstall = profileAuth.installProfileRoutes;
  profileAuth.installProfileRoutes = function installProfileRoutesWithPlatform(app) {
    installPlatformSecurity(app);
    originalInstall(app);
    installPlatformRoutes(app, {
      requireProfile: profileAuth.requireProfile,
      profileForRequest: profileAuth.profileForRequest,
    });
  };
  profileAuth.__quiztimePlatformWrapped = true;
}
