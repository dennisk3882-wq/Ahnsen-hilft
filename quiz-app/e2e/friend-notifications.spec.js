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

async function notificationTitles(page) {
  const response = await jsonFetch(page, '/api/platform/notifications');
  expect(response.status).toBe(200);
  return (response.body.notifications || []).map(item => item.title);
}

test('Stummschaltung und Freundesbenachrichtigungen filtern Einladungen unabhängig voneinander', async ({ browser, request }) => {
  const senderIdentity = uniqueIdentity('NotifySender');
  const recipientIdentity = uniqueIdentity('NotifyRecipient');
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();

  try {
    await registerAndVerifyProfile(sender, request, senderIdentity);
    await registerAndVerifyProfile(recipient, request, recipientIdentity);

    const senderMe = await jsonFetch(sender, '/api/platform/me');
    const recipientMe = await jsonFetch(recipient, '/api/platform/me');
    const senderId = senderMe.body.profile.id;
    const recipientId = recipientMe.body.profile.id;

    expect((await jsonFetch(sender, '/api/platform/friends/request', {
      method: 'POST', body: JSON.stringify({ profileId: recipientId }),
    })).status).toBe(201);
    expect((await jsonFetch(recipient, '/api/platform/friends/respond', {
      method: 'POST', body: JSON.stringify({ profileId: senderId, accept: true }),
    })).status).toBe(200);

    const muted = await jsonFetch(recipient, `/api/platform/friends/${senderId}/preferences`, {
      method: 'PATCH', body: JSON.stringify({ muted: true, notificationsEnabled: true }),
    });
    expect(muted.status).toBe(200);
    expect(muted.body.preferences).toMatchObject({ muted: true, notificationsEnabled: true });

    expect((await jsonFetch(sender, '/api/platform/invites', {
      method: 'POST', body: JSON.stringify({ recipientId, type: 'room', roomCode: 'MUTE01', message: 'Stummtest' }),
    })).status).toBe(201);
    expect(await notificationTitles(recipient)).not.toContain('Neue QuizTime-Einladung');

    const mutedInvites = await jsonFetch(recipient, '/api/platform/invites');
    expect(mutedInvites.body.invites.some(item => item.room_code === 'MUTE01')).toBe(true);

    const notificationsOff = await jsonFetch(recipient, `/api/platform/friends/${senderId}/preferences`, {
      method: 'PATCH', body: JSON.stringify({ muted: false, notificationsEnabled: false }),
    });
    expect(notificationsOff.body.preferences).toMatchObject({ muted: false, notificationsEnabled: false });

    expect((await jsonFetch(sender, '/api/platform/invites', {
      method: 'POST', body: JSON.stringify({ recipientId, type: 'room', roomCode: 'OFF002', message: 'Benachrichtigung-aus-Test' }),
    })).status).toBe(201);
    expect(await notificationTitles(recipient)).not.toContain('Neue QuizTime-Einladung');

    const notificationsOn = await jsonFetch(recipient, `/api/platform/friends/${senderId}/preferences`, {
      method: 'PATCH', body: JSON.stringify({ notificationsEnabled: true }),
    });
    expect(notificationsOn.body.preferences).toMatchObject({ muted: false, notificationsEnabled: true });

    expect((await jsonFetch(sender, '/api/platform/invites', {
      method: 'POST', body: JSON.stringify({ recipientId, type: 'room', roomCode: 'ON0003', message: 'Benachrichtigung-an-Test' }),
    })).status).toBe(201);
    await expect.poll(() => notificationTitles(recipient)).toContain('Neue QuizTime-Einladung');
  } finally {
    await senderContext.close();
    await recipientContext.close();
  }
});
