'use strict';

const testMailbox = require('./test-mailbox');

const APP_BASE_URL = String(
  process.env.APP_BASE_URL
  || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '')
  || `http://localhost:${process.env.PORT || 3000}`,
).replace(/\/$/, '');
const FROM_EMAIL = String(process.env.MAIL_FROM_EMAIL || 'noreply@quiztime.app').trim();
const FROM_NAME = String(process.env.MAIL_FROM_NAME || 'QuizTime').trim();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function configuredProvider() {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.RESEND_API_KEY) return 'resend';
  return null;
}

function status() {
  return {
    configured: Boolean(configuredProvider()),
    provider: configuredProvider(),
    from: FROM_EMAIL,
    baseUrl: APP_BASE_URL,
  };
}

async function sendWithBrevo({ to, subject, html, text }) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': String(process.env.BREVO_API_KEY),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo-E-Mail fehlgeschlagen (${response.status}): ${detail.slice(0, 300)}`);
  }
  return true;
}

async function sendWithResend({ to, subject, html, text }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${String(process.env.RESEND_API_KEY)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend-E-Mail fehlgeschlagen (${response.status}): ${detail.slice(0, 300)}`);
  }
  return true;
}

async function sendEmail(message) {
  const provider = configuredProvider();
  if (!provider) {
    if (process.env.NODE_ENV === 'test') return testMailbox.add(message);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[QuizTime Mail-Vorschau] ${message.subject} -> ${message.to}\n${message.text}`);
    }
    return false;
  }
  if (provider === 'brevo') return sendWithBrevo(message);
  return sendWithResend(message);
}

function layout(title, intro, actionLabel, actionUrl, footer) {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeActionLabel = escapeHtml(actionLabel);
  const safeActionUrl = escapeHtml(actionUrl);
  const safeFooter = escapeHtml(footer);
  return `<!doctype html><html lang="de"><body style="margin:0;background:#070914;color:#f7f7ff;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:34px 18px"><div style="background:linear-gradient(145deg,#161a38,#0a1022);border:1px solid #6e4bd0;border-radius:24px;padding:32px"><div style="font-size:28px;font-weight:800;margin-bottom:22px">QuizTime</div><h1 style="font-size:27px;margin:0 0 15px">${safeTitle}</h1><p style="color:#c2c8df;line-height:1.65">${safeIntro}</p><p style="margin:28px 0"><a href="${safeActionUrl}" style="display:inline-block;background:linear-gradient(135deg,#8b3dff,#6047eb);color:white;text-decoration:none;font-weight:800;border-radius:13px;padding:14px 22px">${safeActionLabel}</a></p><p style="color:#8994b4;font-size:13px;line-height:1.5">${safeFooter}</p><p style="color:#727d9d;font-size:12px;word-break:break-all">${safeActionUrl}</p></div></div></body></html>`;
}

async function sendVerificationEmail({ to, name, token }) {
  const url = `${APP_BASE_URL}/recover?verify=${encodeURIComponent(token)}`;
  const subject = 'E-Mail-Adresse für QuizTime bestätigen';
  const text = `Hallo ${name}, bestätige deine E-Mail-Adresse über diesen Link: ${url}\nDer Link ist 24 Stunden gültig.`;
  return sendEmail({
    to,
    subject,
    text,
    html: layout(
      'E-Mail-Adresse bestätigen',
      `Hallo ${name}, mit der bestätigten E-Mail-Adresse kannst du dein QuizTime-Passwort sicher zurücksetzen und wichtige Kontohinweise erhalten.`,
      'E-Mail bestätigen',
      url,
      'Dieser Link ist 24 Stunden gültig. Hast du diese Änderung nicht angefordert, kannst du die Nachricht ignorieren.',
    ),
  });
}

async function sendPasswordResetEmail({ to, name, token }) {
  const url = `${APP_BASE_URL}/recover?reset=${encodeURIComponent(token)}`;
  const subject = 'QuizTime-Passwort zurücksetzen';
  const text = `Hallo ${name}, setze dein QuizTime-Passwort über diesen Link neu: ${url}\nDer Link ist 30 Minuten gültig.`;
  return sendEmail({
    to,
    subject,
    text,
    html: layout(
      'Passwort zurücksetzen',
      `Hallo ${name}, über den folgenden Link kannst du ein neues QuizTime-Passwort festlegen. Dein bisheriges Passwort wird niemals per E-Mail versendet.`,
      'Neues Passwort festlegen',
      url,
      'Dieser Link ist 30 Minuten gültig und kann nur einmal verwendet werden. Hast du die Anfrage nicht gestellt, musst du nichts tun.',
    ),
  });
}

module.exports = {
  status,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  APP_BASE_URL,
  _test: {
    escapeHtml,
    listMessages: testMailbox.list,
    clearMessages: testMailbox.clear,
  },
};
