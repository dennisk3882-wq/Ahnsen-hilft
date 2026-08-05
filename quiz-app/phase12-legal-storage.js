'use strict';

const emailService = require('./email-service');
const { db, accountStorage, PRIVACY_VERSION, TERMS_VERSION, hashToken, randomToken, legalConfig, q } = require('./phase12-shared');

async function legalConsent(profileId) {
  const { rows } = await q(`SELECT age_group,guardian_email,guardian_verified_at,privacy_version,terms_version,accepted_at FROM quiz_phase12_legal_consents WHERE profile_id=$1`, [profileId]);
  const row = rows[0] || {};
  const acceptedCurrent = row.privacy_version === PRIVACY_VERSION && row.terms_version === TERMS_VERSION && Boolean(row.accepted_at);
  const guardianRequired = row.age_group === 'under16';
  return { ageGroup: row.age_group || null, guardianEmail: row.guardian_email || null, guardianVerified: Boolean(row.guardian_verified_at), acceptedCurrent, guardianRequired, valid: acceptedCurrent && (!guardianRequired || Boolean(row.guardian_verified_at)), current: { privacyVersion: PRIVACY_VERSION, termsVersion: TERMS_VERSION } };
}

async function submitLegalConsent(profileId, values = {}) {
  const ageGroup = values.ageGroup === 'under16' ? 'under16' : values.ageGroup === '16plus' ? '16plus' : null;
  if (!ageGroup) throw new Error('Bitte gib an, ob du mindestens 16 Jahre alt bist.');
  if (values.accepted !== true) throw new Error('Datenschutzerklärung und Nutzungsbedingungen müssen bestätigt werden.');
  const guardianEmail = ageGroup === 'under16' ? accountStorage.normalizeEmail(values.guardianEmail) : null;
  if (ageGroup === 'under16' && !guardianEmail) throw new Error('Für Nutzer unter 16 Jahren wird eine Kontaktadresse eines Erziehungsberechtigten benötigt.');
  await q('SELECT 1');
  const client = await db.pool.connect(); let token = null;
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO quiz_phase12_legal_consents(profile_id,age_group,guardian_email,guardian_verified_at,privacy_version,terms_version,accepted_at,updated_at)
      VALUES($1,$2,$3,CASE WHEN $2='16plus' THEN NOW() ELSE NULL END,$4,$5,NOW(),NOW())
      ON CONFLICT(profile_id) DO UPDATE SET age_group=EXCLUDED.age_group,guardian_email=EXCLUDED.guardian_email,
      guardian_verified_at=CASE WHEN EXCLUDED.age_group='16plus' THEN NOW() WHEN quiz_phase12_legal_consents.guardian_email=EXCLUDED.guardian_email THEN quiz_phase12_legal_consents.guardian_verified_at ELSE NULL END,
      privacy_version=EXCLUDED.privacy_version,terms_version=EXCLUDED.terms_version,accepted_at=NOW(),updated_at=NOW()`, [profileId, ageGroup, guardianEmail, PRIVACY_VERSION, TERMS_VERSION]);
    if (ageGroup === 'under16') {
      token = randomToken();
      await client.query('DELETE FROM quiz_phase12_guardian_tokens WHERE profile_id=$1 OR expires_at<NOW()', [profileId]);
      await client.query(`INSERT INTO quiz_phase12_guardian_tokens(token_hash,profile_id,guardian_email,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '48 hours')`, [hashToken(token), profileId, guardianEmail]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  let guardianEmailSent = null;
  if (token) {
    const account = await accountStorage.getAccount(profileId); const url = `${emailService.APP_BASE_URL}/legal/guardian?token=${encodeURIComponent(token)}`;
    guardianEmailSent = await emailService.sendEmail({ to: guardianEmail, subject: 'QuizTime-Zustimmung bestätigen', text: `Für das Profil ${account?.name || ''} wurde eine Zustimmung angefragt. Link: ${url}`, html: `<p>Für das Profil wurde eine Zustimmung angefragt.</p><p><a href="${url}">Zustimmung bestätigen</a></p>` }).catch(() => false);
  }
  return { ...await legalConsent(profileId), guardianEmailSent };
}

async function verifyGuardian(rawToken) {
  await q('SELECT 1');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const token = await client.query(`SELECT * FROM quiz_phase12_guardian_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE`, [hashToken(rawToken)]);
    const row = token.rows[0]; if (!row) throw new Error('Der Zustimmungslink ist ungültig, abgelaufen oder bereits verwendet.');
    await client.query(`UPDATE quiz_phase12_legal_consents SET guardian_verified_at=NOW(),updated_at=NOW() WHERE profile_id=$1 AND age_group='under16' AND guardian_email=$2`, [row.profile_id, row.guardian_email]);
    await client.query('UPDATE quiz_phase12_guardian_tokens SET used_at=NOW() WHERE token_hash=$1', [hashToken(rawToken)]);
    await client.query('COMMIT'); return { ok: true, profileId: row.profile_id };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
}

module.exports = { legalConfig, legalConsent, submitLegalConsent, verifyGuardian };
