'use strict';
const db=require('./platform-db');
const account=require('./account-storage');
const social=require('./platform-social-storage');
const game=require('./platform-game-storage');
const ops=require('./platform-ops-storage');
async function ensureReady(){
  if(!db.enabled())return false;
  await account.ensureReady();
  await social.ensureReady();
  await game.ensureReady();
  await ops.ensureReady();
  return true;
}
module.exports={...social,...game,...ops,enabled:db.enabled,ensureReady,safeText:db.safeText,safeCode:db.safeCode,account,_test:{normalizeQuestions:db.normalizeQuestions,pairIds:db.pairIds,randomCode:db.randomCode}};
