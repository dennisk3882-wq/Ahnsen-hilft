'use strict';

const { Pool } = require('pg');

const rawUrl = String(process.env.DATABASE_URL || '').trim();

function connectionStringWithTls(value) {
  if (!value) return '';
  const parsed = new URL(value);
  parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
}

const connectionString = connectionStringWithTls(rawUrl);
const pool = connectionString
  ? new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

let readyPromise = null;

async function ensureReady() {
  if (!pool) return false;
  if (!readyPromise) {
    readyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_online_rooms (
        code TEXT PRIMARY KEY,
        room JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS quiz_online_rooms_expires_at
        ON quiz_online_rooms(expires_at);
    `).then(() => true).catch(error => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

async function loadRooms(limit = 200) {
  if (!await ensureReady()) return [];
  await pool.query('DELETE FROM quiz_online_rooms WHERE expires_at <= NOW()');
  const { rows } = await pool.query(
    `SELECT room
       FROM quiz_online_rooms
      WHERE expires_at > NOW()
      ORDER BY updated_at DESC
      LIMIT $1`,
    [Math.max(1, Math.min(500, Number(limit) || 200))],
  );
  return rows.map(row => row.room).filter(Boolean);
}

async function saveRoom(room, ttlMs) {
  if (!room?.code || !await ensureReady()) return false;
  const lifetime = Math.max(60 * 1000, Number(ttlMs) || 24 * 60 * 60 * 1000);
  const expiresAt = new Date(Date.now() + lifetime);
  await pool.query(
    `INSERT INTO quiz_online_rooms (code, room, updated_at, expires_at)
     VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (code) DO UPDATE
       SET room = EXCLUDED.room,
           updated_at = NOW(),
           expires_at = EXCLUDED.expires_at`,
    [String(room.code), JSON.stringify(room), expiresAt],
  );
  return true;
}

async function deleteRoom(code) {
  if (!code || !await ensureReady()) return false;
  const result = await pool.query('DELETE FROM quiz_online_rooms WHERE code = $1', [String(code)]);
  return result.rowCount > 0;
}

async function pruneRooms() {
  if (!await ensureReady()) return 0;
  const result = await pool.query('DELETE FROM quiz_online_rooms WHERE expires_at <= NOW()');
  return result.rowCount;
}

async function ping() {
  if (!await ensureReady()) return false;
  await pool.query('SELECT 1');
  return true;
}

module.exports = {
  enabled: Boolean(pool),
  ensureReady,
  loadRooms,
  saveRoom,
  deleteRoom,
  pruneRooms,
  ping,
};
