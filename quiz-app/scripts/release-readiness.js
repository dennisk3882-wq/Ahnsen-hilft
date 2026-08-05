'use strict';

const { version: expectedVersion } = require('../package.json');
const baseUrl = String(process.env.PRODUCTION_URL || process.env.APP_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

(async () => {
  const response = await fetch(`${baseUrl}/api/platform/release-readiness`);
  const result = await response.json().catch(() => ({}));
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok() || result.version !== expectedVersion || result.status === 'fail') process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
