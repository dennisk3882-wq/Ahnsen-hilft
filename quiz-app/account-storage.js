'use strict';

const db = require('./platform-db');

let schemaPromise = null;

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email)) return '';
  return email;
}

function emailKey(value) {
  return normalizeEmail(value);
}

function tokenHash(value) {
  return db.crypto.createHash('sha256').update(String(value || '')).digest('base64url');
}

function randomToken(bytes = 32) {
  return db.crypto.randomBytes(bytes).toString('base64url');
}

async function ensureReady() {
  if (!await db.ready()) return false;
  if (!schemaPromise) {
    schemaPromise = db.pool.query(`
      ALTER TABLE quiz_solo_profiles ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE quiz_solo_profiles ADD COLUMN IF NOT EXISTS email_key TEXT;
      ALTER TABLE quiz_solo_profiles ADD COLUMN IF NOT EXISTS pending_email TEXT;
      ALTER TABLE quiz_solo_profiles ADD COLUMN IF NOT EXISTS pending_email_key TEXT;
      ALTER TABLE quiz_solo_profiles ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
      ALTER TABLE quiz_solo_profiles ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE quiz_solo_profiles ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE quiz_solo_profiles ADD COLUMN IF NOT EXISTS status_reason TEXT;
      ALTER TABLE quiz_solo_profiles ADD COLUMN IF NOT EXISTS status_until TIMESTAMPTZ;

      CREATE UNIQUE INDEX IF NOT EXISTS quiz_solo_profiles_email_unique
        ON quiz_solo_profiles(email_key) WHERE email_key IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS quiz_solo_profiles_pending_email_unique
        ON quiz_solo_profiles(pending_email_key) WHERE pending_email_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS quiz_solo_profiles_account_status
        ON quiz_solo_profiles(account_status, status_until);

      CREATE TABLE IF NOT EXISTS quiz_account_preferences (
        profile_id UUID PRIMARY KEY REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
        leaderboard_visible BOOLEAN NOT NULL DEFAULT TRUE,
        public_profile BOOLEAN NOT NULL DEFAULT TRUE,
        allow_friend_requests BOOLEAN NOT NULL DEFAULT TRUE,
        invite_policy TEXT NOT NULL DEFAULT 'friends' CHECK(invite_policy IN ('all','friends','none')),
        email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
        push_notifications BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS quiz_account_email_verifications (
        token_hash TEXT PRIMARY KEY,
        profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        email_key TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS quiz_account_email_verifications_profile
        ON quiz_account_email_verifications(profile_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS quiz_account_password_resets (
        token_hash TEXT PRIMARY KEY,
        profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS quiz_account_password_resets_profile
        ON quiz_account_password_resets(profile_id, created_at DESC);
    `).then(async () => {
      await db.pool.query(`
        INSERT INTO quiz_account_preferences(profile_id)
        SELECT id FROM quiz_solo_profiles
        ON CONFLICT(profile_id) DO NOTHING
      `);
      return true;
    }).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function q(text, params = []) {
  await ensureReady();
  return db.pool.query(text, params);
}

async function normalizeExpiredStatus(profileId, row) {
  if (!row || row.account_status === 'active' || !row.status_until) return row;
  if (new Date(row.status_until).getTime() > Date.now()) return row;
  const { rows } = await q(`
    UPDATE quiz_solo_profiles
       SET account_status='active', status_reason=NULL, status_until=NULL, updated_at=NOW()
     WHERE id=$1
     RETURNING *
  `, [profileId]);
  return rows[0] || row;
}

async function ensurePreferences(profileId) {
  await q('INSERT INTO quiz_account_preferences(profile_id) VALUES($1) ON CONFLICT(profile_id) DO NOTHING', [profileId]);
}

async function getAuthState(profileId) {
  if (!profileId || !await ensureReady()) return null;
  const { rows } = await q(`
    SELECT id, session_version, account_status, status_reason, status_until,
           email, email_verified_at
      FROM quiz_solo_profiles WHERE id=$1
  `, [profileId]);
  const row = await normalizeExpiredStatus(profileId, rows[0]);
  if (!row) return null;
  return {
    id: row.id,
    sessionVersion: Number(row.session_version || 1),
    status: row.account_status || 'active',
    statusReason: row.status_reason || null,
    statusUntil: row.status_until || null,
    email: row.email || null,
    emailVerified: Boolean(row.email_verified_at),
  };
}

async function getAccount(profileId) {
  if (!profileId || !await ensureReady()) return null;
  await ensurePreferences(profileId);
  const { rows } = await q(`
    SELECT p.id,p.name,p.email,p.pending_email,p.email_verified_at,p.created_at,p.updated_at,p.last_login_at,
           p.session_version,p.account_status,p.status_reason,p.status_until,
           s.leaderboard_visible,s.public_profile,s.allow_friend_requests,s.invite_policy,
           s.email_notifications,s.push_notifications
      FROM quiz_solo_profiles p
      JOIN quiz_account_preferences s ON s.profile_id=p.id
     WHERE p.id=$1
  `, [profileId]);
  const row = await normalizeExpiredStatus(profileId, rows[0]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    pendingEmail: row.pending_email || null,
    emailVerified: Boolean(row.email_verified_at),
    emailVerifiedAt: row.email_verified_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    sessionVersion: Number(row.session_version || 1),
    status: row.account_status || 'active',
    statusReason: row.status_reason || null,
    statusUntil: row.status_until || null,
    preferences: {
      leaderboardVisible: Boolean(row.leaderboard_visible),
      publicProfile: Boolean(row.public_profile),
      allowFriendRequests: Boolean(row.allow_friend_requests),
      invitePolicy: row.invite_policy || 'friends',
      emailNotifications: Boolean(row.email_notifications),
      pushNotifications: Boolean(row.push_notifications),
    },
  };
}

async function requestEmailVerification(profileId, value) {
  const email = normalizeEmail(value);
  if (!email) throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.');
  await ensureReady();
  const client = await db.pool.connect();
  const token = randomToken();
  try {
    await client.query('BEGIN');
    const duplicate = await client.query(`
      SELECT id FROM quiz_solo_profiles
       WHERE id<>$1 AND (email_key=$2 OR pending_email_key=$2)
       LIMIT 1
    `, [profileId, emailKey(email)]);
    if (duplicate.rowCount) throw Object.assign(new Error('Diese E-Mail-Adresse wird bereits verwendet.'), { code: 'EMAIL_TAKEN' });
    const profile = await client.query('SELECT id,name FROM quiz_solo_profiles WHERE id=$1 FOR UPDATE', [profileId]);
    if (!profile.rows[0]) throw new Error('Profil wurde nicht gefunden.');
    await client.query(`
      UPDATE quiz_solo_profiles
         SET pending_email=$2,pending_email_key=$3,updated_at=NOW()
       WHERE id=$1
    `, [profileId, email, emailKey(email)]);
    await client.query('DELETE FROM quiz_account_email_verifications WHERE profile_id=$1 OR expires_at<NOW()', [profileId]);
    await client.query(`
      INSERT INTO quiz_account_email_verifications(token_hash,profile_id,email,email_key,expires_at)
      VALUES($1,$2,$3,$4,NOW()+INTERVAL '24 hours')
    `, [tokenHash(token), profileId, email, emailKey(email)]);
    await client.query('COMMIT');
    return { token, email, name: profile.rows[0].name };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function verifyEmailToken(rawToken) {
  const hash = tokenHash(rawToken);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const token = await client.query(`
      SELECT * FROM quiz_account_email_verifications
       WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()
       FOR UPDATE
    `, [hash]);
    const row = token.rows[0];
    if (!row) throw new Error('Der Bestätigungslink ist ungültig oder abgelaufen.');
    const duplicate = await client.query('SELECT id FROM quiz_solo_profiles WHERE id<>$1 AND email_key=$2 LIMIT 1', [row.profile_id, row.email_key]);
    if (duplicate.rowCount) throw new Error('Diese E-Mail-Adresse wird inzwischen von einem anderen Profil verwendet.');
    await client.query(`
      UPDATE quiz_solo_profiles
         SET email=$2,email_key=$3,email_verified_at=NOW(),pending_email=NULL,pending_email_key=NULL,updated_at=NOW()
       WHERE id=$1
    `, [row.profile_id, row.email, row.email_key]);
    await client.query('UPDATE quiz_account_email_verifications SET used_at=NOW() WHERE token_hash=$1', [hash]);
    await client.query('COMMIT');
    return { profileId: row.profile_id, email: row.email };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function createPasswordReset(value) {
  const email = normalizeEmail(value);
  if (!email || !await ensureReady()) return null;
  const { rows } = await q(`
    SELECT id,name,email FROM quiz_solo_profiles
     WHERE email_key=$1 AND email_verified_at IS NOT NULL AND account_status<>'banned'
     LIMIT 1
  `, [emailKey(email)]);
  const profile = rows[0];
  if (!profile) return null;
  const token = randomToken();
  await q('DELETE FROM quiz_account_password_resets WHERE profile_id=$1 OR expires_at<NOW()', [profile.id]);
  await q(`
    INSERT INTO quiz_account_password_resets(token_hash,profile_id,expires_at)
    VALUES($1,$2,NOW()+INTERVAL '30 minutes')
  `, [tokenHash(token), profile.id]);
  return { token, profileId: profile.id, name: profile.name, email: profile.email };
}

async function createPasswordResetForProfile(profileId) {
  const { rows } = await q(`
    SELECT id,name,email FROM quiz_solo_profiles
     WHERE id=$1 AND email_verified_at IS NOT NULL
  `, [profileId]);
  const profile = rows[0];
  if (!profile) throw new Error('Für dieses Profil ist keine bestätigte E-Mail-Adresse hinterlegt.');
  const token = randomToken();
  await q('DELETE FROM quiz_account_password_resets WHERE profile_id=$1 OR expires_at<NOW()', [profile.id]);
  await q(`INSERT INTO quiz_account_password_resets(token_hash,profile_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')`, [tokenHash(token), profile.id]);
  return { token, profileId: profile.id, name: profile.name, email: profile.email };
}

async function consumePasswordReset(rawToken, passwordSalt, passwordHash) {
  const hash = tokenHash(rawToken);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const reset = await client.query(`
      SELECT * FROM quiz_account_password_resets
       WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()
       FOR UPDATE
    `, [hash]);
    const row = reset.rows[0];
    if (!row) throw new Error('Der Link ist ungültig, abgelaufen oder wurde bereits verwendet.');
    await client.query(`
      UPDATE quiz_solo_profiles
         SET password_salt=$2,password_hash=$3,session_version=session_version+1,updated_at=NOW()
       WHERE id=$1
    `, [row.profile_id, passwordSalt, passwordHash]);
    await client.query('UPDATE quiz_account_password_resets SET used_at=NOW() WHERE token_hash=$1', [hash]);
    await client.query('COMMIT');
    return row.profile_id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function updateName(profileId, name, nameKey) {
  const { rows } = await q(`
    UPDATE quiz_solo_profiles SET name=$2,name_key=$3,updated_at=NOW()
     WHERE id=$1 RETURNING id,name
  `, [profileId, name, nameKey]);
  return rows[0] || null;
}

async function updatePassword(profileId, passwordSalt, passwordHash) {
  const { rows } = await q(`
    UPDATE quiz_solo_profiles
       SET password_salt=$2,password_hash=$3,session_version=session_version+1,updated_at=NOW()
     WHERE id=$1 RETURNING session_version
  `, [profileId, passwordSalt, passwordHash]);
  return Number(rows[0]?.session_version || 1);
}

async function revokeSessions(profileId) {
  const { rows } = await q(`
    UPDATE quiz_solo_profiles SET session_version=session_version+1,updated_at=NOW()
     WHERE id=$1 RETURNING session_version
  `, [profileId]);
  return Number(rows[0]?.session_version || 1);
}

async function updatePreferences(profileId, values = {}) {
  await ensurePreferences(profileId);
  const invitePolicy = ['all', 'friends', 'none'].includes(values.invitePolicy) ? values.invitePolicy : 'friends';
  const { rows } = await q(`
    UPDATE quiz_account_preferences SET
      leaderboard_visible=$2,
      public_profile=$3,
      allow_friend_requests=$4,
      invite_policy=$5,
      email_notifications=$6,
      push_notifications=$7,
      updated_at=NOW()
    WHERE profile_id=$1 RETURNING *
  `, [
    profileId,
    values.leaderboardVisible !== false,
    values.publicProfile !== false,
    values.allowFriendRequests !== false,
    invitePolicy,
    values.emailNotifications !== false,
    values.pushNotifications !== false,
  ]);
  return rows[0];
}

async function deleteProfile(profileId) {
  const result = await q('DELETE FROM quiz_solo_profiles WHERE id=$1', [profileId]);
  return result.rowCount > 0;
}

async function filterPublicProfiles(profiles) {
  if (!profiles.length || !await ensureReady()) return profiles;
  const ids = profiles.map(item => item.id);
  const { rows } = await q(`
    SELECT p.id FROM quiz_solo_profiles p
    LEFT JOIN quiz_account_preferences s ON s.profile_id=p.id
    WHERE p.id=ANY($1::uuid[])
      AND (p.account_status='active' OR (p.status_until IS NOT NULL AND p.status_until<NOW()))
      AND COALESCE(s.public_profile,TRUE)
  `, [ids]);
  const allowed = new Set(rows.map(row => row.id));
  return profiles.filter(item => allowed.has(item.id));
}

async function filterLeaderboard(entries) {
  if (!entries.length || !await ensureReady()) return entries;
  const ids = entries.map(item => item.id);
  const { rows } = await q(`
    SELECT p.id FROM quiz_solo_profiles p
    LEFT JOIN quiz_account_preferences s ON s.profile_id=p.id
    WHERE p.id=ANY($1::uuid[])
      AND (p.account_status='active' OR (p.status_until IS NOT NULL AND p.status_until<NOW()))
      AND COALESCE(s.leaderboard_visible,TRUE)
  `, [ids]);
  const allowed = new Set(rows.map(row => row.id));
  return entries.filter(item => allowed.has(item.id)).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

async function canRequestFriend(targetId) {
  await ensurePreferences(targetId);
  const { rows } = await q(`
    SELECT p.account_status,p.status_until,s.allow_friend_requests
      FROM quiz_solo_profiles p JOIN quiz_account_preferences s ON s.profile_id=p.id
     WHERE p.id=$1
  `, [targetId]);
  const row = await normalizeExpiredStatus(targetId, rows[0]);
  return Boolean(row && row.account_status === 'active' && row.allow_friend_requests);
}

async function canInvite(senderId, recipientId) {
  await ensurePreferences(recipientId);
  const { rows } = await q(`
    SELECT p.account_status,p.status_until,s.invite_policy
      FROM quiz_solo_profiles p JOIN quiz_account_preferences s ON s.profile_id=p.id
     WHERE p.id=$1
  `, [recipientId]);
  const row = await normalizeExpiredStatus(recipientId, rows[0]);
  if (!row || row.account_status !== 'active' || row.invite_policy === 'none') return false;
  if (row.invite_policy === 'all') return true;
  const friendship = await q(`
    SELECT 1 FROM quiz_platform_friendships
     WHERE status='accepted' AND ((profile_low=$1 AND profile_high=$2) OR (profile_low=$2 AND profile_high=$1))
  `, [senderId, recipientId]).catch(() => ({ rowCount: 0 }));
  return friendship.rowCount > 0;
}

async function exportProfileData(profileId) {
  const account = await getAccount(profileId);
  if (!account) return null;
  const tables = {
    attempts: ['SELECT * FROM quiz_solo_attempts WHERE profile_id=$1 ORDER BY answered_at DESC', [profileId]],
    friendships: [`SELECT * FROM quiz_platform_friendships WHERE profile_low=$1 OR profile_high=$1`, [profileId]],
    blocks: [`SELECT * FROM quiz_platform_blocks WHERE blocker_id=$1 OR blocked_id=$1`, [profileId]],
    invites: [`SELECT * FROM quiz_platform_invites WHERE sender_id=$1 OR recipient_id=$1`, [profileId]],
    reports: [`SELECT * FROM quiz_platform_reports WHERE reporter_id=$1 OR target_profile_id=$1`, [profileId]],
    notifications: [`SELECT * FROM quiz_platform_notifications WHERE profile_id=$1 ORDER BY created_at DESC`, [profileId]],
    tournaments: [`SELECT t.*,tp.score,tp.wins,tp.losses,tp.joined_at FROM quiz_platform_tournament_players tp JOIN quiz_platform_tournaments t ON t.id=tp.tournament_id WHERE tp.profile_id=$1`, [profileId]],
    matchResults: [`SELECT * FROM quiz_platform_match_results WHERE profile_id=$1 ORDER BY finished_at DESC`, [profileId]],
  };
  const data = { exportedAt: new Date().toISOString(), account, data: {} };
  for (const [key, [text, params]] of Object.entries(tables)) {
    try { data.data[key] = (await q(text, params)).rows; } catch { data.data[key] = []; }
  }
  return data;
}

async function adminListProfiles({ search = '', status = 'all', limit = 100 } = {}) {
  const term = db.safeText(search, 80);
  const safeStatus = ['active', 'suspended', 'banned'].includes(status) ? status : 'all';
  const params = [`%${term}%`, Math.max(1, Math.min(300, Number(limit) || 100))];
  const statusClause = safeStatus === 'all' ? '' : `AND p.account_status='${safeStatus}'`;
  const { rows } = await q(`
    SELECT p.id,p.name,p.email,p.email_verified_at,p.created_at,p.last_login_at,p.account_status,p.status_reason,p.status_until,p.session_version,
           COALESCE(s.leaderboard_visible,TRUE) AS leaderboard_visible,
           COUNT(DISTINCT a.session_id)::int AS games,COUNT(a.id)::int AS answers,
           COALESCE(SUM(a.delta),0)::int AS points,MAX(a.answered_at) AS last_played_at,
           COUNT(DISTINCT r.id)::int AS reports
      FROM quiz_solo_profiles p
      LEFT JOIN quiz_account_preferences s ON s.profile_id=p.id
      LEFT JOIN quiz_solo_attempts a ON a.profile_id=p.id
      LEFT JOIN quiz_platform_reports r ON r.target_profile_id=p.id
     WHERE ($1='%%' OR p.name ILIKE $1 OR COALESCE(p.email,'') ILIKE $1) ${statusClause}
     GROUP BY p.id,s.leaderboard_visible
     ORDER BY COALESCE(MAX(a.answered_at),p.last_login_at,p.created_at) DESC
     LIMIT $2
  `, params);
  return rows;
}

async function adminProfileDetails(profileId) {
  const account = await getAccount(profileId);
  if (!account) return null;
  const [stats, reports, friends, recent] = await Promise.all([
    q(`SELECT COUNT(DISTINCT session_id)::int AS games,COUNT(*)::int AS answers,COUNT(*) FILTER(WHERE correct)::int AS correct,COALESCE(SUM(delta),0)::int AS points FROM quiz_solo_attempts WHERE profile_id=$1`, [profileId]),
    q(`SELECT * FROM quiz_platform_reports WHERE reporter_id=$1 OR target_profile_id=$1 ORDER BY created_at DESC LIMIT 50`, [profileId]).catch(() => ({ rows: [] })),
    q(`SELECT * FROM quiz_platform_friendships WHERE profile_low=$1 OR profile_high=$1 ORDER BY updated_at DESC LIMIT 100`, [profileId]).catch(() => ({ rows: [] })),
    q(`SELECT session_id,quiz_type,category,correct,timed_out,delta,answered_at FROM quiz_solo_attempts WHERE profile_id=$1 ORDER BY answered_at DESC LIMIT 50`, [profileId]),
  ]);
  return { account, stats: stats.rows[0], reports: reports.rows, friendships: friends.rows, recentAnswers: recent.rows };
}

async function adminSetStatus(profileId, status, reason, until = null) {
  const safeStatus = ['active', 'suspended', 'banned'].includes(status) ? status : 'active';
  const safeUntil = safeStatus === 'suspended' && until ? new Date(until) : null;
  const { rows } = await q(`
    UPDATE quiz_solo_profiles
       SET account_status=$2,status_reason=$3,status_until=$4,
           session_version=CASE WHEN $2='active' THEN session_version ELSE session_version+1 END,
           updated_at=NOW()
     WHERE id=$1 RETURNING id,name,account_status,status_reason,status_until,session_version
  `, [profileId, safeStatus, db.safeText(reason, 500) || null, safeUntil]);
  return rows[0] || null;
}

async function adminRenameProfile(profileId, name, nameKey) {
  return updateName(profileId, name, nameKey);
}

async function adminDeleteProfile(profileId) {
  return deleteProfile(profileId);
}

module.exports = {
  ensureReady,
  normalizeEmail,
  emailKey,
  tokenHash,
  getAuthState,
  getAccount,
  requestEmailVerification,
  verifyEmailToken,
  createPasswordReset,
  createPasswordResetForProfile,
  consumePasswordReset,
  updateName,
  updatePassword,
  revokeSessions,
  updatePreferences,
  deleteProfile,
  filterPublicProfiles,
  filterLeaderboard,
  canRequestFriend,
  canInvite,
  exportProfileData,
  adminListProfiles,
  adminProfileDetails,
  adminSetStatus,
  adminRenameProfile,
  adminDeleteProfile,
  _test: { normalizeEmail, tokenHash },
};
