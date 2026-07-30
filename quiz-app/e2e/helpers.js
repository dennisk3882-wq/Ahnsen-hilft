'use strict';

const { expect } = require('@playwright/test');

const E2E_SECRET = process.env.QUIZTIME_E2E_SECRET || 'quiztime-e2e-secret';

function uniqueIdentity(prefix = 'E2E') {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  return {
    name: `${prefix}${stamp}`.slice(0, 30),
    email: `${prefix.toLowerCase()}.${stamp}@example.test`,
    password: 'QuizTime2026!',
    newPassword: 'QuizTime2027!',
  };
}

async function latestMail(request, email, subjectPart) {
  let message = null;
  await expect.poll(async () => {
    const response = await request.get(`/api/e2e/mailbox?to=${encodeURIComponent(email)}`, {
      headers: { 'x-quiztime-e2e-secret': E2E_SECRET },
    });
    if (!response.ok()) return null;
    const data = await response.json();
    message = [...(data.messages || [])].reverse().find(item => String(item.subject || '').includes(subjectPart)) || null;
    return message?.subject || null;
  }, { timeout: 15_000, intervals: [250, 500, 1000] }).toContain(subjectPart);
  return message;
}

function extractRecoverUrl(message, parameter) {
  const expression = new RegExp(`https?:\\/\\/[^\\s]+\\/recover\\?${parameter}=[^\\s]+`);
  const match = String(message?.text || '').match(expression);
  if (!match) throw new Error(`Kein ${parameter}-Link in der Test-E-Mail gefunden.`);
  return match[0];
}

async function registerProfile(page, identity) {
  await page.goto('/solo');
  await page.locator('#profileRegisterForm').waitFor();
  await page.locator('#profileRegisterEmail').waitFor();
  await page.fill('#profileRegisterName', identity.name);
  await page.fill('#profileRegisterEmail', identity.email);
  await page.fill('#profileRegisterPassword', identity.password);
  await page.fill('#profileRegisterConfirmation', identity.password);
  await page.locator('#profileRegisterForm button[type="submit"]').click();
  await expect(page.locator('#profileCurrent')).toContainText(identity.name);
}

async function loginProfile(page, identity, password = identity.password) {
  await page.goto('/solo');
  await page.locator('#profileLoginForm').waitFor();
  await page.fill('#profileLoginName', identity.name);
  await page.fill('#profileLoginPassword', password);
  await page.locator('#profileLoginForm button[type="submit"]').click();
  await expect(page.locator('#profileCurrent')).toContainText(identity.name);
}

module.exports = { E2E_SECRET, uniqueIdentity, latestMail, extractRecoverUrl, registerProfile, loginProfile };
