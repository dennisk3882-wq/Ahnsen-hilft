'use strict';

const db = require('./platform-db');

async function preferenceAllows(recipientId, senderId) {
  if (!recipientId || !senderId || recipientId === senderId || !db.enabled()) return true;
  const { rows } = await db.query(`
    SELECT muted,notifications_enabled
      FROM quiz_friend_preferences
     WHERE profile_id=$1 AND friend_id=$2
  `, [recipientId, senderId]);
  const preference = rows[0];
  return !preference || (!preference.muted && preference.notifications_enabled !== false);
}

async function removeRecentNotification(recipientId, types) {
  if (!recipientId || !db.enabled()) return 0;
  const result = await db.query(`
    DELETE FROM quiz_platform_notifications
     WHERE profile_id=$1
       AND type=ANY($2::text[])
       AND created_at>NOW()-INTERVAL '3 minutes'
       AND read_at IS NULL
  `, [recipientId, types]);
  return result.rowCount;
}

async function suppressIfNeeded(recipientId, senderId, types) {
  if (await preferenceAllows(recipientId, senderId)) return false;
  await removeRecentNotification(recipientId, types);
  return true;
}

function installFriendNotificationFilter(app) {
  app.use('/api/platform', (req, res, next) => {
    if (req.method !== 'POST') return next();
    const path = String(req.path || '');
    const isInvite = path === '/invites';
    const isDuelCreate = path === '/phase10/duels';
    const isDuelAction = /^\/phase10\/duels\/[^/]+\/(?:respond|round)$/u.test(path);
    if (!isInvite && !isDuelCreate && !isDuelAction) return next();

    const senderId = req.soloProfile?.id || null;
    const originalJson = res.json.bind(res);
    res.json = payload => {
      if (res.statusCode < 400 && senderId) {
        const task = async () => {
          if (isInvite) {
            await suppressIfNeeded(String(req.body?.recipientId || ''), senderId, ['invite']);
            return;
          }
          if (isDuelCreate) {
            await suppressIfNeeded(String(req.body?.opponentId || ''), senderId, ['competition']);
            return;
          }
          const duel = payload?.duel || (await db.query('SELECT challenger_id,opponent_id FROM quiz_phase10_duels WHERE id=$1', [String(req.params?.id || '')])).rows[0];
          if (!duel) return;
          const recipientId = duel.challenger_id === senderId ? duel.opponent_id : duel.challenger_id;
          await suppressIfNeeded(recipientId, senderId, ['competition']);
        };
        task().catch(error => console.error('Freundesbenachrichtigung konnte nicht gefiltert werden:', error.message));
      }
      return originalJson(payload);
    };
    next();
  });
}

module.exports = { installFriendNotificationFilter, _test: { preferenceAllows } };
