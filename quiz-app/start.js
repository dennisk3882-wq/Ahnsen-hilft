'use strict';

process.env.QUIZ_TITLE = 'QuizTime';
require('./test-pg-ssl-compat');
require('./answer-layout-patch');
require('./phase12-13-bootstrap');

(async () => {
  await require('./startup-schema').prepareStartupSchema();
  require('./platform-bootstrap');
  require('./server');
})().catch(error => {
  console.error('QuizTime konnte nicht sicher gestartet werden:', error);
  process.exitCode = 1;
});
