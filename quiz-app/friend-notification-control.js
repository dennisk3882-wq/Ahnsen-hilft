'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const db = require('./platform-db');

const requestContext = new AsyncLocalStorage();
let storagePatched = false;
let schemaPromise = null;

async function ensureReady() {
  if (!db.enabled()) return false;
  if (!schemaPromise) {
    schemaPromise = db.query(`
      CREATE TABLE IF NOT EXISTS quiz_friend_preferences (
        profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
        friend_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
        muted BOOLEAN NOT NULL DEFAULT FALSE,
        notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(profile_id,friend_id),
        CHECK(profile_id<>friend_id)
      )
    `).then(() => true).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function acceptedFriend(profileId, friendId) {
  if (!profileId || !friendId || profileId === friendId || !db.enabled()) return false;
  await ensureReady();
  const { rows } = await db.query(`
    SELECT 1
      FROM quiz_platform_friendships
     WHERE status='accepted'
       AND ((profile_low=$1 AND profile_high=$2) OR (profile_low=$2 AND profile_high=$1))
     LIMIT 1
  `, [profileId, friendId]);
  return Boolean(rows[0]);
}

async function preferences(profileId, friendId) {
  if (!await acceptedFriend(profileId, friendId)) return null;
  const { rows } = await db.query(`
    SELECT muted,notifications_enabled
      FROM quiz_friend_preferences
     WHERE profile_id=$1 AND friend_id=$2
  `, [profileId, friendId]);
  return rows[0] || { muted: false, notifications_enabled: true };
}

async function notificationAllowed(recipientId, sourceProfileId) {
  if (!recipientId || !sourceProfileId || recipientId === sourceProfileId || !db.enabled()) return true;
  const value = await preferences(recipientId, sourceProfileId);
  if (!value) return true;
  return !Boolean(value.muted) && value.notifications_enabled !== false;
}

function withActor(requireProfile) {
  return (req, res, next) => requireProfile(req, res, () => {
    const actorId = req.soloProfile?.id || null;
    const current = requestContext.getStore();
    if (current?.actorId === actorId) return next();
    return requestContext.run({ actorId, suppressedPush: new Set() }, next);
  });
}

function patchStorage(storage) {
  if (storagePatched) return;
  storagePatched = true;

  const originalAddNotification = storage.addNotification.bind(storage);
  storage.addNotification = async (profileId, notification = {}) => {
    const context = requestContext.getStore();
    const sourceProfileId = notification.sourceProfileId || context?.actorId || null;
    const cleanNotification = { ...notification };
    delete cleanNotification.sourceProfileId;

    const allowed = await notificationAllowed(profileId, sourceProfileId).catch(error => {
      console.error('Freundes-Benachrichtigungseinstellung konnte nicht geprüft werden:', error.message);
      return true;
    });
    if (!allowed) {
      context?.suppressedPush?.add(String(profileId));
      return false;
    }
    return originalAddNotification(profileId, cleanNotification);
  };

  const originalListPushSubscriptions = storage.listPushSubscriptions.bind(storage);
  storage.listPushSubscriptions = async profileId => {
    const context = requestContext.getStore();
    const key = String(profileId);
    if (context?.suppressedPush?.has(key)) {
      context.suppressedPush.delete(key);
      return [];
    }
    return originalListPushSubscriptions(profileId);
  };
}

function installPreferenceRoute(app, { requireProfile, requireVerified }) {
  app.patch('/api/platform/friends/:id/preferences', requireProfile, requireVerified, async (req, res, next) => {
    try {
      const profileId = req.soloProfile.id;
      const friendId = String(req.params.id || '');
      if (!await acceptedFriend(profileId, friendId)) {
        const error = new Error('Diese Einstellung steht nur bestätigten Freunden zur Verfügung.');
        error.code = 'NOT_FRIENDS';
        throw error;
      }

      const current = await preferences(profileId, friendId) || { muted: false, notifications_enabled: true };
      const hasMuted = Object.prototype.hasOwnProperty.call(req.body || {}, 'muted');
      const hasNotifications = Object.prototype.hasOwnProperty.call(req.body || {}, 'notificationsEnabled');
      if (!hasMuted && !hasNotifications) return res.status(400).json({ error: 'Es wurde keine Einstellung übermittelt.' });

      const muted = hasMuted ? req.body.muted === true : Boolean(current.muted);
      const notificationsEnabled = hasNotifications
        ? req.body.notificationsEnabled !== false
        : current.notifications_enabled !== false;

      const { rows } = await db.query(`
        INSERT INTO quiz_friend_preferences(profile_id,friend_id,muted,notifications_enabled)
        VALUES($1,$2,$3,$4)
        ON CONFLICT(profile_id,friend_id) DO UPDATE SET
          muted=EXCLUDED.muted,
          notifications_enabled=EXCLUDED.notifications_enabled,
          updated_at=NOW()
        RETURNING muted,notifications_enabled,updated_at
      `, [profileId, friendId, muted, notificationsEnabled]);

      res.json({
        preferences: {
          muted: Boolean(rows[0].muted),
          notificationsEnabled: rows[0].notifications_enabled !== false,
          updatedAt: rows[0].updated_at,
        },
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  ensureReady,
  acceptedFriend,
  preferences,
  notificationAllowed,
  withActor,
  patchStorage,
  installPreferenceRoute,
  _test: { requestContext },
};
