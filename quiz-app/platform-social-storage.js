'use strict';

const db = require('./platform-db');
let schemaPromise = null;
async function ensureReady() {
  if (!await db.ready()) return false;
  if (!schemaPromise) schemaPromise = db.pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_platform_friendships (
      profile_low UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      profile_high UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      requester_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(profile_low,profile_high), CHECK(profile_low<>profile_high));
    CREATE TABLE IF NOT EXISTS quiz_platform_blocks (
      blocker_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      blocked_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id));
    CREATE TABLE IF NOT EXISTS quiz_platform_invites (
      id UUID PRIMARY KEY, sender_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      recipient_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE, room_code TEXT,
      invite_type TEXT NOT NULL DEFAULT 'room', reference_code TEXT, message TEXT,
      status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours', responded_at TIMESTAMPTZ);
    CREATE INDEX IF NOT EXISTS quiz_platform_invites_recipient ON quiz_platform_invites(recipient_id,status,created_at DESC);
    CREATE TABLE IF NOT EXISTS quiz_platform_reports (
      id BIGSERIAL PRIMARY KEY, reporter_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
      target_profile_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL, target_name TEXT, room_code TEXT,
      reason TEXT NOT NULL, details TEXT, status TEXT NOT NULL DEFAULT 'open', admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ);
    CREATE INDEX IF NOT EXISTS quiz_platform_reports_status ON quiz_platform_reports(status,created_at DESC);
  `).then(() => true).catch(error => { schemaPromise = null; throw error; });
  return schemaPromise;
}
async function q(text, params=[]) { await ensureReady(); return db.pool.query(text, params); }

async function profileSearch(viewerId, term) {
  const query = db.safeText(term, 40);
  if (query.length < 2) return [];
  const { rows } = await q(`SELECT p.id,p.name,p.avatar_id FROM quiz_solo_profiles p
    WHERE p.id<>$1 AND p.name ILIKE $2 AND NOT EXISTS(SELECT 1 FROM quiz_platform_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=$1))
    ORDER BY p.name LIMIT 20`, [viewerId, `%${query}%`]);
  return rows;
}
async function listFriends(profileId) {
  const { rows } = await q(`SELECT f.status,f.requester_id,p.id,p.name,p.avatar_id
    FROM quiz_platform_friendships f JOIN quiz_solo_profiles p ON p.id=CASE WHEN f.profile_low=$1 THEN f.profile_high ELSE f.profile_low END
    WHERE (f.profile_low=$1 OR f.profile_high=$1) ORDER BY f.status,p.name`, [profileId]);
  return rows.map(row => ({ ...row, incoming: row.status === 'pending' && row.requester_id !== profileId }));
}
async function requestFriend(fromId, toId) {
  if (!toId || fromId === toId) throw new Error('Ungültiges Profil.');
  const [low, high] = db.pairIds(fromId, toId);
  const blocked = await q('SELECT 1 FROM quiz_platform_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [fromId, toId]);
  if (blocked.rowCount) throw new Error('Zwischen diesen Profilen ist keine Anfrage möglich.');
  await q(`INSERT INTO quiz_platform_friendships(profile_low,profile_high,requester_id,status) VALUES($1,$2,$3,'pending')
    ON CONFLICT(profile_low,profile_high) DO UPDATE SET requester_id=EXCLUDED.requester_id,status='pending',updated_at=NOW()`, [low, high, fromId]);
  return true;
}
async function respondFriend(profileId, otherId, accept) {
  const [low, high] = db.pairIds(profileId, otherId);
  if (accept) {
    const result = await q(`UPDATE quiz_platform_friendships SET status='accepted',updated_at=NOW()
      WHERE profile_low=$1 AND profile_high=$2 AND requester_id<>$3 AND status='pending'`, [low, high, profileId]);
    if (!result.rowCount) throw new Error('Anfrage wurde nicht gefunden.');
  } else await q('DELETE FROM quiz_platform_friendships WHERE profile_low=$1 AND profile_high=$2', [low, high]);
  return true;
}
async function removeFriend(profileId, otherId) { const [low, high] = db.pairIds(profileId, otherId); await q('DELETE FROM quiz_platform_friendships WHERE profile_low=$1 AND profile_high=$2', [low, high]); return true; }
async function blockProfile(profileId, otherId) {
  if (!otherId || profileId === otherId) throw new Error('Ungültiges Profil.');
  await q('INSERT INTO quiz_platform_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [profileId, otherId]);
  await removeFriend(profileId, otherId);
  return true;
}
async function unblockProfile(profileId, otherId) { await q('DELETE FROM quiz_platform_blocks WHERE blocker_id=$1 AND blocked_id=$2', [profileId, otherId]); return true; }
async function listBlocks(profileId) { const { rows } = await q('SELECT p.id,p.name,p.avatar_id,b.created_at FROM quiz_platform_blocks b JOIN quiz_solo_profiles p ON p.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC', [profileId]); return rows; }
async function createInvite({ senderId, recipientId, roomCode, type='room', referenceCode, message }) {
  const id = db.crypto.randomUUID();
  const { rows } = await q(`INSERT INTO quiz_platform_invites(id,sender_id,recipient_id,room_code,invite_type,reference_code,message)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, senderId, recipientId, db.safeCode(roomCode,6)||null, ['room','friend','tournament'].includes(type)?type:'room', db.safeCode(referenceCode,12)||null, db.safeText(message,300)||null]);
  return rows[0];
}
async function listInvites(profileId) { const { rows } = await q(`SELECT i.*,p.name AS sender_name,p.avatar_id AS sender_avatar FROM quiz_platform_invites i JOIN quiz_solo_profiles p ON p.id=i.sender_id WHERE i.recipient_id=$1 AND i.expires_at>NOW() ORDER BY i.created_at DESC LIMIT 100`, [profileId]); return rows; }
async function respondInvite(profileId, id, status) { const safe = status === 'accepted' ? 'accepted' : 'declined'; const { rows } = await q(`UPDATE quiz_platform_invites SET status=$3,responded_at=NOW() WHERE id=$1 AND recipient_id=$2 AND status='pending' RETURNING *`, [id, profileId, safe]); if (!rows[0]) throw new Error('Einladung wurde nicht gefunden.'); return rows[0]; }
async function createReport({ reporterId, targetProfileId, targetName, roomCode, reason, details }) {
  const safeReason = db.safeText(reason,120); if (safeReason.length < 3) throw new Error('Bitte einen Grund angeben.');
  const { rows } = await q(`INSERT INTO quiz_platform_reports(reporter_id,target_profile_id,target_name,room_code,reason,details) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [reporterId,targetProfileId||null,db.safeText(targetName,80)||null,db.safeCode(roomCode,6)||null,safeReason,db.safeText(details,1000)||null]); return rows[0];
}
async function listReports(status='open', limit=200) { const params=[]; let where=''; if(status!=='all'){params.push(status);where='WHERE r.status=$1';} params.push(Math.max(1,Math.min(500,Number(limit)||200))); const {rows}=await q(`SELECT r.*,reporter.name AS reporter_name,target.name AS target_profile_name FROM quiz_platform_reports r LEFT JOIN quiz_solo_profiles reporter ON reporter.id=r.reporter_id LEFT JOIN quiz_solo_profiles target ON target.id=r.target_profile_id ${where} ORDER BY r.created_at DESC LIMIT $${params.length}`,params); return rows; }
async function resolveReport(id,status,note){const safe=['open','reviewing','resolved','dismissed'].includes(status)?status:'reviewing';const{rows}=await q(`UPDATE quiz_platform_reports SET status=$2,admin_note=$3,resolved_at=CASE WHEN $2 IN ('resolved','dismissed') THEN NOW() ELSE NULL END WHERE id=$1 RETURNING *`,[Number(id),safe,db.safeText(note,1000)||null]);return rows[0]||null;}
module.exports={ensureReady,profileSearch,listFriends,requestFriend,respondFriend,removeFriend,blockProfile,unblockProfile,listBlocks,createInvite,listInvites,respondInvite,createReport,listReports,resolveReport};
