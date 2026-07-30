'use strict';
const db=require('./platform-db');
const account=require('./account-storage');
const social=require('./platform-social-storage');
const game=require('./platform-game-storage');
const ops=require('./platform-ops-storage');
async function ensureReady(){if(!db.enabled())return false;await Promise.all([account.ensureReady(),social.ensureReady(),game.ensureReady(),ops.ensureReady()]);return true;}
module.exports={enabled:db.enabled,ensureReady,safeText:db.safeText,safeCode:db.safeCode,...social,...game,...ops,account,_test:{normalizeQuestions:db.normalizeQuestions,pairIds:db.pairIds,randomCode:db.randomCode}};
