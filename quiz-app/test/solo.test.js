'use strict';

// Dieser Test muss auch auf Render reproduzierbar bleiben und darf niemals
// die dort gesetzte Neon-Datenbank oder ElevenLabs-API verwenden.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.ELEVENLABS_API_KEY = '';
process.env.ELEVENLABS_VOICE_ID = '';
process.env.PROFILE_SESSION_SECRET = 'solo-api-test-session-secret';

const assert = require('assert');
const express = require('express');
const { installSoloRoutes, calculateSoloScore } = require('../solo-routes');

assert.strictEqual(calculateSoloScore({ correct: true, mode: 'timed', remainingSeconds: 20 }), 30);
assert.strictEqual(calculateSoloScore({ correct: true, mode: 'timed', remainingSeconds: 13 }), 23);
assert.strictEqual(calculateSoloScore({ correct: false, mode: 'timed', remainingSeconds: 18 }), -5);
assert.strictEqual(calculateSoloScore({ correct: true, mode: 'relaxed' }), 10);
assert.strictEqual(calculateSoloScore({ correct: false, mode: 'relaxed' }), 0);
assert.strictEqual(calculateSoloScore({ correct: true, mode: 'timed', remainingSeconds: -3 }), 10);

function makeQuestions(prefix, category) {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    category,
    text: `Testfrage ${index + 1}?`,
    options: ['Richtig', 'Falsch 1', 'Falsch 2', 'Falsch 3'],
    correctIndex: 0,
  }));
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json();
  return { response, body };
}

(async () => {
  let fakeNow = 1_000_000;
  const sets = {
    child: makeQuestions('child', 'Allgemeinwissen'),
    adult: makeQuestions('adult', 'Allgemeinwissen'),
  };
  const app = express();
  app.use(express.json());
  installSoloRoutes(app, {
    getQuestionSets: () => sets,
    chooseQuestions: (type, category, count) => sets[type]
      .filter(question => category === 'Gemischt' || question.category === category)
      .slice(0, count)
      .map(question => question.id),
    questionSeconds: 20,
    now: () => fakeNow,
  });

  const server = await new Promise(resolve => {
    const running = app.listen(0, '127.0.0.1', () => resolve(running));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const config = await request(baseUrl, '/api/solo/config');
    assert.strictEqual(config.response.status, 200);
    assert.strictEqual(config.body.catalogs.child.size, 5);
    assert.deepStrictEqual(config.body.questionCounts, [5, 10, 15, 25, 50]);

    const relaxedStart = await request(baseUrl, '/api/solo/start', {
      method: 'POST',
      body: JSON.stringify({ quizType: 'child', category: 'Gemischt', questionCount: 5, mode: 'relaxed' }),
    });
    assert.strictEqual(relaxedStart.response.status, 200);
    assert.strictEqual(relaxedStart.body.profile.name, 'Gast');
    assert.strictEqual(relaxedStart.body.question.correctIndex, undefined);
    assert.strictEqual(relaxedStart.body.totalQuestions, 5);

    const relaxedAnswer = await request(baseUrl, '/api/solo/answer', {
      method: 'POST',
      body: JSON.stringify({ sessionId: relaxedStart.body.sessionId, answerIndex: 0 }),
    });
    assert.strictEqual(relaxedAnswer.body.result.correct, true);
    assert.strictEqual(relaxedAnswer.body.result.delta, 10);
    assert.strictEqual(relaxedAnswer.body.question.correctIndex, 0);

    const next = await request(baseUrl, '/api/solo/next', {
      method: 'POST',
      body: JSON.stringify({ sessionId: relaxedStart.body.sessionId }),
    });
    assert.strictEqual(next.body.currentIndex, 1);
    assert.strictEqual(next.body.answered, false);

    const timedStart = await request(baseUrl, '/api/solo/start', {
      method: 'POST',
      body: JSON.stringify({ quizType: 'adult', category: 'Allgemeinwissen', questionCount: 5, mode: 'timed' }),
    });
    fakeNow += 21_000;
    const timeout = await request(baseUrl, '/api/solo/answer', {
      method: 'POST',
      body: JSON.stringify({ sessionId: timedStart.body.sessionId, answerIndex: null }),
    });
    assert.strictEqual(timeout.body.result.timedOut, true);
    assert.strictEqual(timeout.body.result.correct, false);
    assert.strictEqual(timeout.body.result.delta, 0);
    assert.strictEqual(timeout.body.summary.unanswered, 1);

    console.log('Solo scoring and API tests passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
