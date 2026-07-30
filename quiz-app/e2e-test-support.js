'use strict';

const crypto = require('crypto');
const testMailbox = require('./test-mailbox');

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function installE2ETestSupport(app) {
  const secret = String(process.env.QUIZTIME_E2E_SECRET || '');
  if (process.env.NODE_ENV !== 'test' || !secret) return false;
  testMailbox.clear();

  app.use('/api/e2e', (req, res, next) => {
    if (!safeEqual(req.headers['x-quiztime-e2e-secret'], secret)) return res.status(404).end();
    next();
  });

  app.get('/api/e2e/mailbox', (req, res) => {
    const to = String(req.query?.to || '').trim().toLowerCase();
    res.json({
      messages: testMailbox.list()
        .filter(message => !to || String(message.to || '').trim().toLowerCase() === to)
        .slice(-20),
    });
  });

  app.delete('/api/e2e/mailbox', (_req, res) => {
    testMailbox.clear();
    res.json({ ok: true });
  });

  app.get('/api/e2e/status', (_req, res) => res.json({ enabled: true, mailbox: testMailbox.list().length }));
  return true;
}

module.exports = { installE2ETestSupport, _test: { safeEqual } };
