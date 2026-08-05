'use strict';

const fs = require('fs');
const path = require('path');

function databaseErrors(text) {
  return String(text || '')
    .split(/\r?\n/u)
    .filter(line => /\b(?:ERROR|FATAL|PANIC):\s/u.test(line));
}

function checkLogFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`PostgreSQL-Protokoll fehlt: ${resolved}`);
  const errors = databaseErrors(fs.readFileSync(resolved, 'utf8'));
  if (errors.length) {
    const preview = errors.slice(0, 30).join('\n');
    throw new Error(`PostgreSQL meldete ${errors.length} Datenbankfehler:\n${preview}`);
  }
  return { file: resolved, errors: 0 };
}

if (require.main === module) {
  try {
    const result = checkLogFile(process.argv[2] || 'postgres.log');
    console.log(`✓ PostgreSQL-Protokoll ohne ERROR, FATAL oder PANIC: ${result.file}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { databaseErrors, checkLogFile };
