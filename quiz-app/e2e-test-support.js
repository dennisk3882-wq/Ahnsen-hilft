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

  app.use('/api/e2e', (req, res, next) => {
    if (!safeEqual(req.headers['x-quiztime-e2e-secret'], secret)) return res.status(404).end();
    next();
  });

  app.get('/api/e2e/mailbox', (req, res) => {
    const to = String(req.query?.to || '').trim().toLowerCase();
    const messages = emailService._test.listMessages()
      .filter(message => !to || String(message.to || '').trim().toLowerCase() === to)
      .slice(-20);
    res.json({ messages });
  });

  app.delete('/api/e2e/mailbox', (_req, res) => {
    emailService._test.clearMessages();
    res.json({ ok: true });
  });

  app.get('/api/e2e/status', (_req, res) => res.json({ enabled: true, mailbox: emailService._test.listMessages().length }));
  return true;
}

module.exports = { installE2ETestSupport, _test: { safeEqual } };
