'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const tests = [
  'test/core.test.js',
  'test/solo.test.js',
  'test/start-page.test.js',
  'test/stage1-webapp.test.js',
  'test/phase2-profiles.test.js',
  'test/phase3-offline.test.js',
  'test/phase4-online.test.js',
  'test/platform-features.test.js',
  'test/account-admin.test.js',
  'test/browser-automation.test.js',
  'test/phase10.test.js',
  'test/stability-v101.test.js',
  'test/answer-layout.test.js',
  'test/phase105.test.js',
  'test/phase11.test.js',
  'test/phase12-13.test.js',
  'test/phase13-1-hardening.test.js',
  'test/question-expansion-batch1.test.js',
  'test/elevenlabs.test.js',
  'test/screen-qr.test.js',
  'test/v70.test.js',
];

const isolatedSecret = `isolated-${'x'.repeat(40)}`;
const isolatedEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: '',
  ELEVENLABS_API_KEY: '',
  ELEVENLABS_VOICE_ID: '',
  BREVO_API_KEY: '',
  RESEND_API_KEY: '',
  LEGAL_CONTACT_EMAIL: 'test@quiztime.example',
  PROFILE_SESSION_SECRET: isolatedSecret,
  PLATFORM_SECURITY_SECRET: isolatedSecret,
  PLATFORM_INTERNAL_SECRET: isolatedSecret,
};

for (const testFile of tests) {
  const result = spawnSync(process.execPath, [testFile], {
    cwd: root,
    env: isolatedEnvironment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('All isolated core tests passed without production services.');
