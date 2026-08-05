'use strict';

const baseDatabase = require('./db');
const profiles = require('./extended-storage');
const accounts = require('./account-storage');
const platformStorage = require('./platform-storage');
const games = require('./platform-game-storage');
const phase10 = require('./phase10-storage');
const { runMigrations } = require('./migration-runner');

let startupPromise = null;

async function prepareStartupSchema() {
  if (!profiles.enabled()) return false;
  if (!startupPromise) {
    startupPromise = (async () => {
      await baseDatabase.ensureBaseSchema();
      await profiles.ensureReady();
      await accounts.ensureReady();
      await platformStorage.ensureReady();
      await games.ensureReady();
      await phase10.ensureReady();
      await runMigrations();
      console.log('QuizTime 13.1: Datenbankschema und Migrationen vollständig vorbereitet.');
      return true;
    })().catch(error => {
      startupPromise = null;
      throw error;
    });
  }
  return startupPromise;
}

module.exports = { prepareStartupSchema };
