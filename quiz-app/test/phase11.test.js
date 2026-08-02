'use strict';

const assert = require('assert');
const phase11 = require('../phase11-storage');

assert.strictEqual(phase11._test.browserFamily('Mozilla/5.0 Chrome/140.0 Safari/537.36'), 'Chrome');
assert.strictEqual(phase11._test.browserFamily('Mozilla/5.0 Edg/140.0 Chrome/140.0'), 'Edge');
assert.strictEqual(phase11._test.browserFamily('Mozilla/5.0 Firefox/141.0'), 'Firefox');
assert.strictEqual(phase11._test.deviceFamily('Mozilla/5.0 (iPhone) Mobile Safari'), 'Smartphone');
assert.strictEqual(phase11._test.deviceFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Desktop');

const solo = phase11._test.answerSource({
  path: '/api/solo/answer',
  body: { sessionId: 'solo-session', questionKey: 'Frage 1' },
});
assert.deepStrictEqual(solo, { type: 'solo', id: 'solo-session', question: 'Frage 1' });

const event = phase11._test.answerSource({
  path: '/api/platform/phase10/event-sessions/event-session/answer',
  body: { questionId: 'adult-1' },
});
assert.deepStrictEqual(event, { type: 'event', id: 'event-session', question: 'adult-1' });

const online = phase11._test.answerSource({
  path: '/api/online/rooms/ABC123/answer',
  body: { questionIndex: 4 },
});
assert.deepStrictEqual(online, { type: 'online', id: 'ABC123', question: '4' });
assert.strictEqual(phase11._test.answerSource({ path: '/api/solo/start', body: {} }), null);

const filtered = phase11._test.filterLeaderboardRows([
  { id: 'a', rank: 1, points: 100 },
  { id: 'b', rank: 2, points: 90 },
  { id: 'c', rank: 3, points: 80 },
], new Set(['b']));
assert.deepStrictEqual(filtered.map(item => [item.id, item.rank]), [['a', 1], ['c', 2]]);

assert.strictEqual(phase11.ONBOARDING_STEPS.length, 7);
assert.deepStrictEqual(new Set(phase11.ONBOARDING_STEPS.map(step => step.key)).size, 7);

console.log('Phase 11 core tests passed.');
