'use strict';
require('./test-pg-ssl-compat');
require('./answer-layout-patch');

(async () => {
  await require('./startup-schema').prepareStartupSchema();
  const hardening = require('./phase13-1-hardening');
  hardening.installStrictDatabaseGuard(require('./db'));
  hardening.installStoragePatches();
  require('./phase12-13-bootstrap');
  require('./platform-bootstrap');
  require('./server');
})().catch(error => {
  console.error('QuizTime 13.1 konnte nicht sicher gestartet werden:', error);
  process.exit(1);
});
