'use strict';

const db = require('./platform-db');
let schemaPromise = null;
async function ensureReady(){
  if(!await db.ready())return false;
  if(!schemaPromise)schemaPromise=db.pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_platform_push_keys(id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1),public_jwk JSONB NOT NULL,private_jwk JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS quiz_platform_push_subscriptions(profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,endpoint TEXT NOT NULL,expiration_time BIGINT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(profile_id,endpoint));
    CREATE TABLE IF NOT EXISTS quiz_platform_notifications(id UUID PRIMARY KEY,profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,url TEXT,read_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS quiz_platform_notifications_profile ON quiz_platform_notifications(profile_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS quiz_platform_metrics(id BIGSERIAL PRIMARY KEY,event_type TEXT NOT NULL,route TEXT,status_code INTEGER,duration_ms INTEGER,profile_id UUID,room_code TEXT,details JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS quiz_platform_metrics_time ON quiz_platform_metrics(created_at DESC);
    CREATE TABLE IF NOT EXISTS quiz_platform_audit(id BIGSERIAL PRIMARY KEY,actor_type TEXT NOT NULL,actor_id TEXT,action TEXT NOT NULL,target TEXT,ip_hash TEXT,details JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS quiz_platform_audit_time ON quiz_platform_audit(created_at DESC);
    CREATE TABLE IF NOT EXISTS quiz_platform_bans(key_hash TEXT PRIMARY KEY,reason TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  `).then(()=>true).catch(error=>{schemaPromise=null;throw error;});
  return schemaPromise;
}
async function q(text,params=[]){await ensureReady();return db.pool.query(text,params);}
async function getPushKeys(){await ensureReady();let result=await db.pool.query('SELECT public_jwk,private_jwk FROM quiz_platform_push_keys WHERE id=1');if(result.rows[0])return result.rows[0];const{publicKey,privateKey}=db.crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const pub=publicKey.export({format:'jwk'});const priv=privateKey.export({format:'jwk'});result=await db.pool.query(`INSERT INTO quiz_platform_push_keys(id,public_jwk,private_jwk) VALUES(1,$1::jsonb,$2::jsonb) ON CONFLICT(id) DO UPDATE SET public_jwk=quiz_platform_push_keys.public_jwk RETURNING public_jwk,private_jwk`,[JSON.stringify(pub),JSON.stringify(priv)]);return result.rows[0];}
async function savePushSubscription(profileId,subscription){const endpoint=db.safeText(subscription?.endpoint,2000);if(!endpoint.startsWith('https://'))throw new Error('Ungültige Push-Adresse.');await q(`INSERT INTO quiz_platform_push_subscriptions(profile_id,endpoint,expiration_time) VALUES($1,$2,$3) ON CONFLICT(profile_id,endpoint) DO UPDATE SET expiration_time=EXCLUDED.expiration_time,last_used_at=NOW()`,[profileId,endpoint,subscription.expirationTime||null]);return true;}
async function removePushSubscription(profileId,endpoint){await q('DELETE FROM quiz_platform_push_subscriptions WHERE profile_id=$1 AND endpoint=$2',[profileId,db.safeText(endpoint,2000)]);return true;}
async function listPushSubscriptions(profileId){const{rows}=await q('SELECT endpoint,expiration_time FROM quiz_platform_push_subscriptions WHERE profile_id=$1',[profileId]);return rows;}
async function addNotification(profileId,{type='info',title,body,url}){const id=db.crypto.randomUUID();await q(`INSERT INTO quiz_platform_notifications(id,profile_id,type,title,body,url) VALUES($1,$2,$3,$4,$5,$6)`,[id,profileId,db.safeText(type,30),db.safeText(title,120),db.safeText(body,300),db.safeText(url,500)||null]);return id;}
async function listNotifications(profileId){const{rows}=await q('SELECT * FROM quiz_platform_notifications WHERE profile_id=$1 ORDER BY created_at DESC LIMIT 100',[profileId]);return rows;}
async function markNotificationsRead(profileId){await q('UPDATE quiz_platform_notifications SET read_at=COALESCE(read_at,NOW()) WHERE profile_id=$1',[profileId]);return true;}
async function recordMetric(event){if(!db.enabled())return false;try{await ensureReady();await db.pool.query(`INSERT INTO quiz_platform_metrics(event_type,route,status_code,duration_ms,profile_id,room_code,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[db.safeText(event.type,50)||'request',db.safeText(event.route,180)||null,event.statusCode||null,event.durationMs||null,event.profileId||null,db.safeCode(event.roomCode,6)||null,JSON.stringify(event.details||{})]);return true;}catch{return false;}}
async function audit(entry){if(!db.enabled())return false;try{await ensureReady();await db.pool.query(`INSERT INTO quiz_platform_audit(actor_type,actor_id,action,target,ip_hash,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[db.safeText(entry.actorType,30)||'system',db.safeText(entry.actorId,80)||null,db.safeText(entry.action,80),db.safeText(entry.target,160)||null,db.safeText(entry.ipHash,100)||null,JSON.stringify(entry.details||{})]);return true;}catch{return false;}}
async function banKey(keyHash,reason,minutes=30){if(!db.safeText(keyHash,100))throw new Error('Sperrschlüssel fehlt.');await q(`INSERT INTO quiz_platform_bans(key_hash,reason,expires_at) VALUES($1,$2,NOW()+($3*INTERVAL '1 minute')) ON CONFLICT(key_hash) DO UPDATE SET reason=EXCLUDED.reason,expires_at=EXCLUDED.expires_at`,[db.safeText(keyHash,100),db.safeText(reason,180),Math.max(1,Math.min(10080,Number(minutes)||30))]);return true;}
async function activeBan(keyHash){const{rows}=await q('SELECT reason,expires_at FROM quiz_platform_bans WHERE key_hash=$1 AND expires_at>NOW()',[db.safeText(keyHash,100)]);return rows[0]||null;}
async function dashboardSummary(){
  const safeQuery=async(text,fallback)=>{try{return(await q(text)).rows;}catch{return fallback;}};
  const [profiles,rooms,reports,activity,errors,push,tournaments,packs,queue,auditRows]=await Promise.all([
    safeQuery(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE last_login_at>NOW()-INTERVAL '24 hours')::int AS active_day FROM quiz_solo_profiles`,[{total:0,active_day:0}]),
    safeQuery(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE room->>'phase'='question')::int AS playing,COALESCE(SUM(jsonb_object_length(room->'players')),0)::int AS players FROM quiz_online_rooms WHERE expires_at>NOW()`,[{total:0,playing:0,players:0}]),
    safeQuery(`SELECT COUNT(*)::int AS open FROM quiz_platform_reports WHERE status IN ('open','reviewing')`,[{open:0}]),
    safeQuery(`SELECT COUNT(*)::int AS requests,COALESCE(ROUND(AVG(duration_ms)),0)::int AS avg_ms,COUNT(*) FILTER(WHERE status_code>=500)::int AS server_errors FROM quiz_platform_metrics WHERE created_at>NOW()-INTERVAL '24 hours'`,[{requests:0,avg_ms:0,server_errors:0}]),
    safeQuery(`SELECT event_type,route,status_code,duration_ms,details,created_at FROM quiz_platform_metrics WHERE status_code>=400 OR event_type='client_error' ORDER BY created_at DESC LIMIT 50`,[]),
    safeQuery('SELECT COUNT(*)::int AS subscriptions FROM quiz_platform_push_subscriptions',[{subscriptions:0}]),
    safeQuery(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status IN ('open','running'))::int AS active FROM quiz_platform_tournaments`,[{total:0,active:0}]),
    safeQuery('SELECT COUNT(*)::int AS total,COALESCE(SUM(plays),0)::int AS plays FROM quiz_platform_packs',[{total:0,plays:0}]),
    safeQuery('SELECT COUNT(*)::int AS waiting FROM quiz_platform_matchmaking_queue',[{waiting:0}]),
    safeQuery('SELECT actor_type,actor_id,action,target,details,created_at FROM quiz_platform_audit ORDER BY created_at DESC LIMIT 50',[]),
  ]);
  return{profiles:profiles[0],rooms:rooms[0],reports:reports[0],activity:activity[0],errors,push:push[0],tournaments:tournaments[0],packs:packs[0],queue:queue[0],audit:auditRows};
}
async function exportData(){
  const queries={
    quiz_solo_profiles:`SELECT id,name,email,email_verified_at,avatar_id,account_status,status_reason,status_until,created_at,updated_at,last_login_at FROM quiz_solo_profiles`,
    quiz_account_preferences:`SELECT profile_id,leaderboard_visible,public_profile,allow_friend_requests,invite_policy,email_notifications,push_notifications,updated_at FROM quiz_account_preferences`,
    quiz_platform_friendships:`SELECT * FROM quiz_platform_friendships`,
    quiz_platform_blocks:`SELECT * FROM quiz_platform_blocks`,
    quiz_platform_invites:`SELECT * FROM quiz_platform_invites`,
    quiz_platform_reports:`SELECT * FROM quiz_platform_reports`,
    quiz_platform_seasons:`SELECT * FROM quiz_platform_seasons`,
    quiz_platform_match_results:`SELECT * FROM quiz_platform_match_results`,
    quiz_platform_tournaments:`SELECT * FROM quiz_platform_tournaments`,
    quiz_platform_tournament_players:`SELECT * FROM quiz_platform_tournament_players`,
    quiz_platform_legacy_packs:`SELECT id,code,owner_id,title,description,visibility,plays,created_at,updated_at FROM quiz_platform_packs`,
    quiz_platform_notifications:`SELECT * FROM quiz_platform_notifications`,
  };
  const data={exportedAt:new Date().toISOString(),securityNote:'Passwort-Hashes, Salts, Reset-Tokens, Verifizierungstokens, private Push-Schlüssel und Sitzungs-Cookies sind ausgeschlossen.',tables:{}};
  for(const[table,text]of Object.entries(queries)){try{data.tables[table]=(await q(text)).rows;}catch{data.tables[table]=[];}}
  return data;
}
module.exports={ensureReady,getPushKeys,savePushSubscription,removePushSubscription,listPushSubscriptions,addNotification,listNotifications,markNotificationsRead,recordMetric,audit,banKey,activeBan,dashboardSummary,exportData};
