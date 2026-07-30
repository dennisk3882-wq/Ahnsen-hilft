'use strict';

const assert = require('assert');
const stability = require('../phase10-stability')._test;
const migrations = require('../migration-runner')._test;
const onlineCompletion = require('../online-completion')._test;

assert.strictEqual(stability.berlinDayKey(new Date('2026-01-15T23:30:00Z')), '2026-01-16');
assert.strictEqual(stability.berlinDayKey(new Date('2026-07-30T22:30:00Z')), '2026-07-31');
assert.match(stability.berlinIsoWeekKey(new Date('2026-07-30T12:00:00Z')), /^2026-W\d{2}$/u);
assert.strictEqual(stability.nextLeague('bronze', 'promotion'), 'silver');
assert.strictEqual(stability.nextLeague('master', 'promotion'), 'master');
assert.strictEqual(stability.nextLeague('gold', 'relegation'), 'silver');
assert.strictEqual(stability.nextLeague('bronze', 'relegation'), 'bronze');

const players = [
  { id: 'a', profileId: 'profile-a', score: 100, correct: 8 },
  { id: 'b', profileId: 'profile-b', score: 100, correct: 7 },
];
assert.strictEqual(stability.resultForPlayer({ gameMode: 'individual' }, players[0], players), 'win');
assert.strictEqual(stability.resultForPlayer({ gameMode: 'individual' }, players[1], players), 'loss');
players[1].correct = 8;
assert.strictEqual(stability.resultForPlayer({ gameMode: 'individual' }, players[0], players), 'draw');

const teamPlayers = [
  { id: 'a', team: 'violet', score: 60, correct: 5 },
  { id: 'b', team: 'violet', score: 40, correct: 3 },
  { id: 'c', team: 'blue', score: 90, correct: 7 },
];
assert.strictEqual(stability.resultForPlayer({ gameMode: 'teams' }, teamPlayers[0], teamPlayers), 'win');
assert.strictEqual(stability.resultForPlayer({ gameMode: 'teams' }, teamPlayers[2], teamPlayers), 'loss');

const snapshot = onlineCompletion.persistentSnapshot({
  code: 'ABC123',
  players: {
    a: { id: 'a', connected: true, token: 'plain-token', tokenHash: 'hash-a' },
  },
});
assert.strictEqual(snapshot.players.a.connected, false);
assert.strictEqual(snapshot.players.a.token, undefined);
assert.strictEqual(snapshot.players.a.tokenHash, 'hash-a');

assert.strictEqual(migrations.checksum('SELECT 1;'), migrations.checksum('SELECT 1;'));
assert.notStrictEqual(migrations.checksum('SELECT 1;'), migrations.checksum('SELECT 2;'));
assert.ok(migrations.migrationFiles().includes('010_phase10_stability.sql'));
assert.ok(migrations.migrationFiles().includes('011_solo_sessions.sql'));
assert.ok(migrations.migrationFiles().includes('012_social_history_events.sql'));

console.log('QuizTime 10.1 stability tests passed.');
