'use strict';

const db = require('./platform-db');
const profiles = require('./extended-storage');
const accounts = require('./account-storage');
const platformStorage = require('./platform-storage');
const games = require('./platform-game-storage');
const phase10 = require('./phase10-storage');
const { runMigrations } = require('./migration-runner');

let preparation = null;

async function prepareStartupSchema() {
  if (!db.enabled()) return false;
  if (!preparation) {
    preparation = (async () => {
      // Die Reihenfolge ist absichtlich fest: spätere Tabellen besitzen
      // Fremdschlüssel auf Profile, Präferenzen, Saisons und Turniere.
      await profiles.ensureReady();
      await accounts.ensureReady();
      await platformStorage.ensureReady();
      await games.ensureReady();
      await phase10.ensureReady();
      await runMigrations();
      return true;
    })().catch(error => {
      preparation = null;
      throw error;
    });
  }
  return preparation;
}

module.exports = { prepareStartupSchema };
