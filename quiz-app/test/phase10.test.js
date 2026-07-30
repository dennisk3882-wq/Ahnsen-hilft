'use strict';

const assert = require('assert');
const phase10 = require('../phase10-storage');
const progression = require('../phase10-progression-bridge')._test;
const onlineBridge = require('../phase10-online-bridge')._test;

assert.deepStrictEqual(phase10.leagueForPoints(0).id, 'bronze');
assert.deepStrictEqual(phase10.leagueForPoints(499).id, 'bronze');
assert.deepStrictEqual(phase10.leagueForPoints(500).id, 'silver');
assert.deepStrictEqual(phase10.leagueForPoints(1200).id, 'gold');
assert.deepStrictEqual(phase10.leagueForPoints(2500).id, 'master');
assert.strictEqual(phase10.bracketSize(2), 2);
assert.strictEqual(phase10.bracketSize(3), 4);
assert.strictEqual(phase10.bracketSize(8), 8);
assert.strictEqual(phase10.bracketSize(9), 16);
assert.match(phase10.isoWeekKey(new Date('2026-07-30T12:00:00Z')), /^2026-W\d{2}$/);

const enriched = progression.progressionWithBonus({ xp: 450, points: 10, accuracy: 50, achievements: [] }, 100);
assert.strictEqual(enriched.xp, 550);
assert.strictEqual(enriched.level, 2);
assert.strictEqual(enriched.bonusXp, 100);
assert.strictEqual(enriched.xpIntoLevel, 50);

const achievements = progression.rewardAchievements({ achievements: [] }, { badges: ['duel-winner', 'weekly-2026-W31', 'tournament-champion'] });
assert.strictEqual(achievements.length, 3);
assert.ok(achievements.some(item => item.title === 'Duell-Sieger'));
assert.ok(achievements.some(item => item.title === 'Quiz der Woche'));
assert.ok(achievements.some(item => item.title === 'Turnier-Champion'));

const req = {
  headers: { 'x-quiztime-internal': process.env.PLATFORM_INTERNAL_SECRET || process.env.ADMIN_PASSWORD || process.env.EVENT_PASSWORD || 'quiztime-internal' },
  originalUrl: '/api/online/rooms',
  method: 'POST',
  body: { profileId: 'profile-a', duelId: 'duel-a', competitionType: 'duel' },
};
onlineBridge.captureResponse(req, { code: 'ABC123', playerId: 'player-a' });
const room = onlineBridge.enrichRoom({ code: 'ABC123', players: { 'player-a': { id: 'player-a' } } });
assert.strictEqual(room.duelId, 'duel-a');
assert.strictEqual(room.players['player-a'].profileId, 'profile-a');

console.log('Phase 10 core tests passed.');
