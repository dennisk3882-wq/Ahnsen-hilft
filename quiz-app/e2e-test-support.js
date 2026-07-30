'use strict';

const crypto = require('crypto');
const emailService = require('./email-service');

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function installE2ETestSupport(app) {
  const secret = String(process.env.QUIZTIME_E2E_SECRET || '');
  if (process.env.NODE_ENV !== 'test' || !secret) return false;

  const messages = [];
  const remember = message => {
    messages.push({ ...message, createdAt: new Date().toISOString() });
    if (messages.length > 100) messages.splice(0, messages.length - 100);
    return true;
  };

  emailService.sendVerificationEmail = async ({ to, name, token }) => remember({
    to,
    subject: 'E-Mail-Adresse für QuizTime bestätigen',
    text: `Hallo ${name}, bestätige deine E-Mail-Adresse über diesen Link: ${emailService.APP_BASE_URL}/recover?verify=${encodeURIComponent(token)}\nDer Link ist 24 Stunden gültig.`,
  });
  emailService.sendPasswordResetEmail = async ({ to, name, token }) => remember({
    to,
    subject: 'QuizTime-Passwort zurücksetzen',
    text: `Hallo ${name}, setze dein QuizTime-Passwort über diesen Link neu: ${emailService.APP_BASE_URL}/recover?reset=${encodeURIComponent(token)}\nDer Link ist 30 Minuten gültig.`,
  });

  app.use('/api/e2e', (req, res, next) => {
    if (!safeEqual(req.headers['x-quiztime-e2e-secret'], secret)) return res.status(404).end();
    next();
  });

  app.get('/api/e2e/mailbox', (req, res) => {
    const to = String(req.query?.to || '').trim().toLowerCase();
    res.json({
      messages: messages
        .filter(message => !to || String(message.to || '').trim().toLowerCase() === to)
        .slice(-20),
    });
  });

  app.delete('/api/e2e/mailbox', (_req, res) => {
    messages.length = 0;
    emailService._test.clearMessages();
    res.json({ ok: true });
  });

  app.get('/api/e2e/status', (_req, res) => res.json({ enabled: true, mailbox: messages.length }));
  return true;
}

module.exports = { installE2ETestSupport, _test: { safeEqual } };
