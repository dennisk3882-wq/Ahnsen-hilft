'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const mailboxPath = path.join(os.tmpdir(), `quiztime-e2e-mailbox-${process.pid}.json`);

function readMessages() {
  try {
    const parsed = JSON.parse(fs.readFileSync(mailboxPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMessages(messages) {
  const temporary = `${mailboxPath}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(messages), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, mailboxPath);
}

function add(message) {
  if (process.env.NODE_ENV !== 'test') return false;
  const messages = readMessages();
  messages.push({ ...message, createdAt: new Date().toISOString() });
  writeMessages(messages.slice(-100));
  return true;
}

function list() {
  return process.env.NODE_ENV === 'test' ? readMessages() : [];
}

function clear() {
  try { fs.unlinkSync(mailboxPath); } catch { /* bereits leer */ }
}

module.exports = { add, list, clear, _test: { mailboxPath } };
