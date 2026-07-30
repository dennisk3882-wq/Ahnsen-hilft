'use strict';

process.env.QUIZ_TITLE = 'QuizTime';
require('./test-pg-ssl-compat');
require('./platform-bootstrap');
require('./server');
