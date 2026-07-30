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
  'test/elevenlabs.test.js',
  'test/screen-qr.test.js',
  'test/v70.test.js',
];

const isolatedEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: '',
  ELEVENLABS_API_KEY: '',
  ELEVENLABS_VOICE_ID: '',
  PROFILE_SESSION_SECRET: 'isolated-test-session-secret',
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
