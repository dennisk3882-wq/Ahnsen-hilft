'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./platform-db');

let migrationPromise = null;

function migrationFiles() {
  const directory = path.join(__dirname, 'migrations');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(name => /^\d+_.+\.sql$/u.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function runMigrations() {
  if (!db.enabled()) return false;
  if (!migrationPromise) {
    migrationPromise = (async () => {
      await db.ready();
      await db.pool.query(`
        CREATE TABLE IF NOT EXISTS quiz_schema_migrations (
          version TEXT PRIMARY KEY,
          checksum TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      for (const file of migrationFiles()) {
        const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
        const digest = checksum(sql);
        const current = await db.pool.query('SELECT checksum FROM quiz_schema_migrations WHERE version=$1', [file]);
        if (current.rows[0]) {
          if (current.rows[0].checksum !== digest) {
            throw new Error(`Migration ${file} wurde nachträglich verändert.`);
          }
          continue;
        }

        const client = await db.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query("SELECT pg_advisory_xact_lock(hashtext('quiztime-schema-migrations'))");
          const repeated = await client.query('SELECT checksum FROM quiz_schema_migrations WHERE version=$1 FOR UPDATE', [file]);
          if (!repeated.rows[0]) {
            await client.query(sql);
            await client.query('INSERT INTO quiz_schema_migrations(version,checksum) VALUES($1,$2)', [file, digest]);
          } else if (repeated.rows[0].checksum !== digest) {
            throw new Error(`Migration ${file} weist eine andere Prüfsumme auf.`);
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          client.release();
        }
      }
      return true;
    })().catch(error => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

module.exports = { runMigrations, _test: { migrationFiles, checksum } };
