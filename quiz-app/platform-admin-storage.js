'use strict';

const db = require('./platform-db');

let schemaPromise = null;

function hashToken(value) {
  return db.crypto.createHash('sha256').update(String(value || '')).digest('base64url');
}

async function ensureReady() {
  if (!await db.ready()) return false;
  if (!schemaPromise) schemaPromise = db.pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_platform_closed_rooms (
      code TEXT PRIMARY KEY,
      reason TEXT,
      closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours'
    );
    CREATE TABLE IF NOT EXISTS quiz_platform_room_player_bans (
      code TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      player_id TEXT,
      player_name TEXT,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours',
      PRIMARY KEY(code,token_hash)
    );
    CREATE INDEX IF NOT EXISTS quiz_platform_room_player_bans_expiry
      ON quiz_platform_room_player_bans(expires_at);
  `).then(() => true).catch(error => { schemaPromise = null; throw error; });
  return schemaPromise;
}

async function q(text, params = []) {
  await ensureReady();
  return db.pool.query(text, params);
}

async function listRooms() {
  const { rows } = await q(`
    SELECT code,room,updated_at,expires_at
      FROM quiz_online_rooms
     WHERE expires_at>NOW()
     ORDER BY updated_at DESC
     LIMIT 300
  `).catch(() => ({ rows: [] }));
  return rows.map(row => {
    const room = row.room || {};
    const players = Object.values(room.players || {}).map(player => ({
      id: player.id,
      name: player.name,
      team: player.team || null,
      connected: Boolean(player.connected),
      ready: Boolean(player.ready),
      score: Number(player.score || 0),
      tokenHash: player.tokenHash || null,
    }));
    return {
      code: row.code,
      title: room.title || 'Online-Raum',
      phase: room.phase || 'lobby',
      visibility: room.visibility || 'private',
      gameMode: room.gameMode || 'individual',
      quizType: room.quizType || 'child',
      category: room.category || 'Gemischt',
      currentIndex: Number(room.currentIndex || 0),
      questionCount: Number(room.questionCount || room.questions?.length || 0),
      createdAt: room.createdAt || null,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      players,
    };
  });
}

async function closeRoom(code, reason = 'Durch Plattform-Administration geschlossen') {
  const safeCode = db.safeCode(code, 6);
  if (safeCode.length !== 6) throw new Error('Ungültiger Raumcode.');
  await q(`
    INSERT INTO quiz_platform_closed_rooms(code,reason,closed_at,expires_at)
    VALUES($1,$2,NOW(),NOW()+INTERVAL '24 hours')
    ON CONFLICT(code) DO UPDATE SET reason=EXCLUDED.reason,closed_at=NOW(),expires_at=EXCLUDED.expires_at
  `, [safeCode, db.safeText(reason, 300)]);
  await q('DELETE FROM quiz_online_rooms WHERE code=$1', [safeCode]).catch(() => false);
  return true;
}

async function isRoomClosed(code) {
  const safeCode = db.safeCode(code, 6);
  if (!safeCode) return false;
  const { rows } = await q('SELECT reason,expires_at FROM quiz_platform_closed_rooms WHERE code=$1 AND expires_at>NOW()', [safeCode]);
  return rows[0] || false;
}

async function kickRoomPlayer(code, playerId, reason = 'Durch Plattform-Administration entfernt') {
  const safeCode = db.safeCode(code, 6);
  const result = await q('SELECT room FROM quiz_online_rooms WHERE code=$1 FOR UPDATE', [safeCode]);
  const room = result.rows[0]?.room;
  if (!room) throw new Error('Raum wurde nicht gefunden.');
  const player = room.players?.[playerId];
  if (!player?.tokenHash) throw new Error('Spieler wurde nicht gefunden.');
  await q(`
    INSERT INTO quiz_platform_room_player_bans(code,token_hash,player_id,player_name,reason,expires_at)
    VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '24 hours')
    ON CONFLICT(code,token_hash) DO UPDATE SET reason=EXCLUDED.reason,expires_at=EXCLUDED.expires_at
  `, [safeCode, player.tokenHash, String(player.id), db.safeText(player.name, 80), db.safeText(reason, 300)]);
  delete room.players[playerId];
  if (room.hostPlayerId === playerId) {
    const successor = Object.values(room.players || {}).sort((a, b) => Number(a.joinedAt || 0) - Number(b.joinedAt || 0))[0];
    room.hostPlayerId = successor?.id || null;
    if (successor) successor.ready = true;
  }
  room.updatedAt = Date.now();
  await q('UPDATE quiz_online_rooms SET room=$2::jsonb,updated_at=NOW() WHERE code=$1', [safeCode, JSON.stringify(room)]);
  return { playerId: player.id, playerName: player.name };
}

async function isRoomPlayerBanned(code, token) {
  if (!token) return false;
  const safeCode = db.safeCode(code, 6);
  const { rows } = await q(`
    SELECT reason,expires_at FROM quiz_platform_room_player_bans
     WHERE code=$1 AND token_hash=$2 AND expires_at>NOW()
  `, [safeCode, hashToken(token)]);
  return rows[0] || false;
}

async function listTournaments() {
  const { rows } = await q(`
    SELECT t.*,p.name AS owner_name,COUNT(tp.profile_id)::int AS player_count
      FROM quiz_platform_tournaments t
      JOIN quiz_solo_profiles p ON p.id=t.owner_id
      LEFT JOIN quiz_platform_tournament_players tp ON tp.tournament_id=t.id
     GROUP BY t.id,p.name
     ORDER BY t.created_at DESC LIMIT 300
  `).catch(() => ({ rows: [] }));
  return rows;
}

async function setTournamentStatus(code, status) {
  const safeStatus = ['open', 'running', 'finished', 'cancelled'].includes(status) ? status : 'cancelled';
  const { rows } = await q(`UPDATE quiz_platform_tournaments SET status=$2,updated_at=NOW() WHERE code=$1 RETURNING *`, [db.safeCode(code, 8), safeStatus]);
  return rows[0] || null;
}

async function deleteTournament(code) {
  const result = await q('DELETE FROM quiz_platform_tournaments WHERE code=$1', [db.safeCode(code, 8)]);
  return result.rowCount > 0;
}

async function listLegacyPacks() {
  const { rows } = await q(`
    SELECT p.id,p.code,p.title,p.description,p.visibility,p.plays,p.created_at,p.updated_at,
           owner.id AS owner_id,owner.name AS owner_name,
           jsonb_array_length(p.questions)::int AS question_count
      FROM quiz_platform_packs p JOIN quiz_solo_profiles owner ON owner.id=p.owner_id
     ORDER BY p.updated_at DESC LIMIT 300
  `).catch(() => ({ rows: [] }));
  return rows;
}

async function deleteLegacyPack(code) {
  const result = await q('DELETE FROM quiz_platform_packs WHERE code=$1', [db.safeCode(code, 8)]);
  return result.rowCount > 0;
}

async function listBans() {
  const { rows } = await q(`
    SELECT key_hash,reason,expires_at,created_at
      FROM quiz_platform_bans
     WHERE expires_at>NOW()
     ORDER BY expires_at DESC LIMIT 300
  `).catch(() => ({ rows: [] }));
  return rows;
}

async function removeBan(keyHash) {
  const result = await q('DELETE FROM quiz_platform_bans WHERE key_hash=$1', [db.safeText(keyHash, 100)]);
  return result.rowCount > 0;
}

async function metrics(hours = 24) {
  const safeHours = Math.max(1, Math.min(720, Number(hours) || 24));
  const { rows } = await q(`
    SELECT date_trunc('hour',created_at) AS bucket,
           COUNT(*)::int AS requests,
           COUNT(*) FILTER(WHERE status_code>=400)::int AS errors,
           COUNT(*) FILTER(WHERE status_code>=500)::int AS server_errors,
           COALESCE(ROUND(AVG(duration_ms)),0)::int AS average_ms,
           COALESCE(MAX(duration_ms),0)::int AS maximum_ms
      FROM quiz_platform_metrics
     WHERE created_at>NOW()-($1*INTERVAL '1 hour')
     GROUP BY bucket ORDER BY bucket
  `, [safeHours]);
  return rows;
}

async function prune() {
  await ensureReady();
  await Promise.all([
    q('DELETE FROM quiz_platform_closed_rooms WHERE expires_at<NOW()'),
    q('DELETE FROM quiz_platform_room_player_bans WHERE expires_at<NOW()'),
  ]);
}

module.exports = {
  ensureReady,
  listRooms,
  closeRoom,
  isRoomClosed,
  kickRoomPlayer,
  isRoomPlayerBanned,
  listTournaments,
  setTournamentStatus,
  deleteTournament,
  listLegacyPacks,
  deleteLegacyPack,
  listBans,
  removeBan,
  metrics,
  prune,
  _test: { hashToken },
};
