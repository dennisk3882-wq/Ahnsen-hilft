'use strict';

const { test, expect } = require('@playwright/test');
const { uniqueIdentity, registerAndVerifyProfile } = require('./helpers');

async function jsonFetch(page, url, options = {}) {
  return page.evaluate(async ({ target, init }) => {
    const response = await fetch(target, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { target: url, init: options });
}

function longestStreak(values) {
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const value of values) {
    current = value === previous ? current + 1 : 1;
    previous = value;
    longest = Math.max(longest, current);
  }
  return longest;
}

test('50 Kinderfragen verteilen richtige Antworten ausgeglichen auf A bis D', async ({ page, request }) => {
  const identity = uniqueIdentity('AntwortMix');
  await registerAndVerifyProfile(page, request, identity);

  const config = await jsonFetch(page, '/api/solo/config');
  expect(config.status).toBe(200);
  expect(config.body.catalogs.child.size).toBeGreaterThanOrEqual(500);

  let response = await jsonFetch(page, '/api/solo/start', {
    method: 'POST',
    body: JSON.stringify({ quizType: 'child', category: 'Gemischt', questionCount: 50, mode: 'relaxed' }),
  });
  expect(response.status).toBe(200);
  const sessionId = response.body.sessionId;
  const correctPositions = [];

  for (let index = 0; index < 50; index += 1) {
    response = await jsonFetch(page, '/api/solo/answer', {
      method: 'POST',
      body: JSON.stringify({ sessionId, answerIndex: 0 }),
    });
    expect(response.status).toBe(200);
    expect(response.body.result.correctIndex).toBeGreaterThanOrEqual(0);
    expect(response.body.result.correctIndex).toBeLessThanOrEqual(3);
    correctPositions.push(response.body.result.correctIndex);

    response = await jsonFetch(page, '/api/solo/next', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
    expect(response.status).toBe(200);
  }

  const counts = correctPositions.reduce((values, position) => {
    values[position] += 1;
    return values;
  }, [0, 0, 0, 0]);
  expect(counts.sort((a, b) => a - b)).toEqual([12, 12, 13, 13]);
  expect(longestStreak(correctPositions)).toBeLessThanOrEqual(2);
  expect(response.body.finished).toBe(true);
});
