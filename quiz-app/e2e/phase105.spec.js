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

test('500 Erwachsenenfragen, öffentliche Profile, Freundessichtbarkeit und Wettbewerbe funktionieren', async ({ browser, page, request }) => {
  const first = uniqueIdentity('PublicA');
  await registerAndVerifyProfile(page, request, first);
  const firstMe = await jsonFetch(page, '/api/platform/me');
  expect(firstMe.status).toBe(200);
  const firstId = firstMe.body.profile.id;

  const adultConfig = await jsonFetch(page, '/api/solo/config');
  expect(adultConfig.status).toBe(200);
  expect(adultConfig.body.catalogs.adult.size).toBeGreaterThanOrEqual(500);

  let settings = await jsonFetch(page, '/api/platform/public-profile/me/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      profileVisibility: 'public',
      bio: 'Ich spiele besonders gerne Geografie und Geschichte.',
      showRecentMatches: true,
      showFavoriteCategories: true,
      featuredBadges: [],
    }),
  });
  expect(settings.status).toBe(200);
  expect(settings.body.settings.profileVisibility).toBe('public');

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  const second = uniqueIdentity('PublicB');
  await registerAndVerifyProfile(secondPage, request, second);
  const secondMe = await jsonFetch(secondPage, '/api/platform/me');
  expect(secondMe.status).toBe(200);
  const secondId = secondMe.body.profile.id;

  let visible = await jsonFetch(secondPage, `/api/platform/public/profiles/${firstId}`);
  expect(visible.status).toBe(200);
  expect(visible.body.profile.name).toBe(first.name);
  expect(visible.body.profile.bio).toContain('Geografie');
  expect(visible.body.viewer.isFriend).toBe(false);

  settings = await jsonFetch(page, '/api/platform/public-profile/me/settings', {
    method: 'PATCH',
    body: JSON.stringify({ profileVisibility: 'friends', bio: 'Nur Freunde sehen dieses Profil.', showRecentMatches: true, showFavoriteCategories: true }),
  });
  expect(settings.status).toBe(200);
  visible = await jsonFetch(secondPage, `/api/platform/public/profiles/${firstId}`);
  expect(visible.status).toBe(403);

  const requestFriend = await jsonFetch(secondPage, '/api/platform/friends/request', {
    method: 'POST',
    body: JSON.stringify({ profileId: firstId }),
  });
  expect(requestFriend.status).toBe(201);
  const acceptFriend = await jsonFetch(page, '/api/platform/friends/respond', {
    method: 'POST',
    body: JSON.stringify({ profileId: secondId, accept: true }),
  });
  expect(acceptFriend.status).toBe(200);

  visible = await jsonFetch(secondPage, `/api/platform/public/profiles/${firstId}`);
  expect(visible.status).toBe(200);
  expect(visible.body.viewer.isFriend).toBe(true);
  expect(visible.body.profile.visibility).toBe('friends');

  settings = await jsonFetch(page, '/api/platform/public-profile/me/settings', {
    method: 'PATCH',
    body: JSON.stringify({ profileVisibility: 'private', bio: 'Privates Profil.', showRecentMatches: false, showFavoriteCategories: false }),
  });
  expect(settings.status).toBe(200);
  visible = await jsonFetch(secondPage, `/api/platform/public/profiles/${firstId}`);
  expect(visible.status).toBe(403);

  await page.goto(`/profile/${firstId}`);
  await expect(page.locator('#profileName')).toHaveText(first.name);
  await expect(page.locator('#profileEditor')).toBeVisible();
  await expect(page.locator('#profileVisibilityInput')).toHaveValue('private');

  await page.goto('/competitions');
  await expect(page.locator('#competitionsApp')).toBeVisible();
  await expect(page.locator('#eventCalendar .competition-event').first()).toBeVisible();
  await expect(page.locator('#currentSeason')).toContainText(/Saison|Liga/i);
  await expect(page.locator('#eventCalendar')).toContainText(/Kinder|Erwachsene/i);

  const overview = await jsonFetch(page, '/api/platform/phase105/competitions');
  expect(overview.status).toBe(200);
  expect(overview.body.current.season).toBeTruthy();
  const events = [...(overview.body.calendar.live || []), ...(overview.body.calendar.upcoming || []), ...(overview.body.calendar.recent || [])];
  expect(events.some(event => event.quiz_type === 'child')).toBe(true);
  expect(events.some(event => event.quiz_type === 'adult')).toBe(true);

  await secondContext.close();
});
