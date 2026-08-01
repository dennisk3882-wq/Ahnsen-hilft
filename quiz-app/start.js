'use strict';

process.env.QUIZ_TITLE = 'QuizTime';
require('./test-pg-ssl-compat');
require('./answer-layout-patch');
require('./platform-bootstrap');
require('./server');
