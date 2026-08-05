'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const hardening = require('../phase13-1-hardening');
const { databaseErrors, checkLogFile } = require('../scripts/check-postgres-log');

assert.match(hardening._test.DAILY_ACTIVITY_SQL, /AS activity_day/u);
assert.match(hardening._test.DAILY_ACTIVITY_SQL, /AS "day"/u);
assert.doesNotMatch(hardening._test.DAILY_ACTIVITY_SQL, /\)::date day\b/u);
assert.match(hardening._test.DAILY_ERRORS_SQL, /AS error_day/u);
assert.match(hardening._test.DAILY_ERRORS_SQL, /AS "day"/u);

const opsSource = fs.readFileSync(path.join(__dirname, '..', 'platform-ops-storage.js'), 'utf8');
assert.doesNotMatch(opsSource, /jsonb_object_length/u);
assert.match(opsSource, /jsonb_object_keys/u);

const startupSource = fs.readFileSync(path.join(__dirname, '..', 'startup-schema.js'), 'utf8');
assert.ok(startupSource.indexOf('baseDatabase.ensureBaseSchema') < startupSource.indexOf('profiles.ensureReady'));

const readinessSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'release-readiness.js'), 'utf8');
assert.match(readinessSource, /require\('\.\.\/package\.json'\)/u);
assert.match(readinessSource, /result\.status === 'fail'/u);
assert.doesNotMatch(readinessSource, /result\.status === 'warning'/u);

const cleanLog = 'LOG: database system is ready\nWARNING: no usable locales\n';
assert.deepStrictEqual(databaseErrors(cleanLog), []);
const brokenLog = '2026-08-05 UTC [1] ERROR: relation fehlt\n2026 UTC [2] FATAL: Abbruch\n';
assert.strictEqual(databaseErrors(brokenLog).length, 2);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quiztime-pg-log-'));
const cleanPath = path.join(directory, 'clean.log');
const brokenPath = path.join(directory, 'broken.log');
fs.writeFileSync(cleanPath, cleanLog);
fs.writeFileSync(brokenPath, brokenLog);
assert.strictEqual(checkLogFile(cleanPath).errors, 0);
assert.throws(() => checkLogFile(brokenPath), /2 Datenbankfehler/u);
fs.rmSync(directory, { recursive: true, force: true });

console.log('QuizTime 13.1 hardening tests passed.');
