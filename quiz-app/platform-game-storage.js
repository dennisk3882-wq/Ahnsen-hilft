'use strict';

const db = require('./platform-db');
let schemaPromise = null;
async function ensureReady() {
  if (!await db.ready()) return false;
  if (!schemaPromise) schemaPromise = db.pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_platform_seasons (
      id UUID PRIMARY KEY,name TEXT NOT NULL,starts_at TIMESTAMPTZ NOT NULL,ends_at TIMESTAMPTZ NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS quiz_platform_match_results (
      id UUID PRIMARY KEY,room_code TEXT NOT NULL,profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      score INTEGER NOT NULL DEFAULT 0,correct INTEGER NOT NULL DEFAULT 0,placement INTEGER,won BOOLEAN NOT NULL DEFAULT FALSE,
      finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(room_code,profile_id));
    CREATE TABLE IF NOT EXISTS quiz_platform_tournaments (
      id UUID PRIMARY KEY,code TEXT NOT NULL UNIQUE,owner_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,description TEXT,status TEXT NOT NULL DEFAULT 'open',format TEXT NOT NULL DEFAULT 'leaderboard',
      starts_at TIMESTAMPTZ,settings JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS quiz_platform_tournament_players (
      tournament_id UUID NOT NULL REFERENCES quiz_platform_tournaments(id) ON DELETE CASCADE,
      profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,score INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(tournament_id,profile_id));
    CREATE TABLE IF NOT EXISTS quiz_platform_packs (
      id UUID PRIMARY KEY,code TEXT NOT NULL UNIQUE,owner_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,description TEXT,visibility TEXT NOT NULL DEFAULT 'private',questions JSONB NOT NULL,
      plays INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS quiz_platform_packs_visibility ON quiz_platform_packs(visibility,updated_at DESC);
    CREATE TABLE IF NOT EXISTS quiz_platform_matchmaking_queue (
      profile_id UUID PRIMARY KEY REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,quiz_type TEXT NOT NULL DEFAULT 'adult',
      game_mode TEXT NOT NULL DEFAULT 'individual',joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),instance_id TEXT);
    CREATE TABLE IF NOT EXISTS quiz_platform_matches (
      id UUID PRIMARY KEY,profile_a UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
      profile_b UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,room_code TEXT,credentials_a JSONB,credentials_b JSONB,
      status TEXT NOT NULL DEFAULT 'creating',error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '30 minutes');
    CREATE INDEX IF NOT EXISTS quiz_platform_matches_profiles ON quiz_platform_matches(profile_a,profile_b,created_at DESC);
  `).then(()=>true).catch(error=>{schemaPromise=null;throw error;});
  return schemaPromise;
}
async function q(text,params=[]){await ensureReady();return db.pool.query(text,params);}
async function activeSeason(){
  let {rows}=await q('SELECT * FROM quiz_platform_seasons WHERE active AND starts_at<=NOW() AND ends_at>NOW() ORDER BY starts_at DESC LIMIT 1');
  if(rows[0])return rows[0];
  const now=new Date();const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
  const id=db.crypto.randomUUID();const name=`Saison ${start.toLocaleDateString('de-DE',{month:'long',year:'numeric',timeZone:'UTC'})}`;
  ({rows}=await q(`INSERT INTO quiz_platform_seasons(id,name,starts_at,ends_at,active) VALUES($1,$2,$3,$4,TRUE) RETURNING *`,[id,name,start,end]));return rows[0];
}
async function seasonLeaderboard(limit=100){
  const season=await activeSeason();const{rows}=await q(`SELECT p.id,p.name,p.avatar_id,
    COALESCE(SUM(a.delta) FILTER(WHERE a.answered_at BETWEEN $1 AND $2),0)::int + COALESCE(SUM(m.score) FILTER(WHERE m.finished_at BETWEEN $1 AND $2),0)::int AS score,
    COUNT(a.id) FILTER(WHERE a.correct AND a.answered_at BETWEEN $1 AND $2)::int + COALESCE(SUM(m.correct) FILTER(WHERE m.finished_at BETWEEN $1 AND $2),0)::int AS correct,
    COUNT(DISTINCT a.session_id) FILTER(WHERE a.answered_at BETWEEN $1 AND $2)::int + COUNT(DISTINCT m.room_code) FILTER(WHERE m.finished_at BETWEEN $1 AND $2)::int AS games,
    COUNT(m.id) FILTER(WHERE m.won AND m.finished_at BETWEEN $1 AND $2)::int AS wins
    FROM quiz_solo_profiles p LEFT JOIN quiz_solo_attempts a ON a.profile_id=p.id LEFT JOIN quiz_platform_match_results m ON m.profile_id=p.id
    GROUP BY p.id ORDER BY score DESC,correct DESC,p.name LIMIT $3`,[season.starts_at,season.ends_at,Math.max(1,Math.min(200,Number(limit)||100))]);
  return {season,leaderboard:rows.map((row,index)=>({...row,rank:index+1}))};
}
async function createTournament(ownerId,data){const id=db.crypto.randomUUID();const code=db.randomCode(8);const name=db.safeText(data.name,100);if(name.length<3)throw new Error('Turniername ist zu kurz.');const{rows}=await q(`INSERT INTO quiz_platform_tournaments(id,code,owner_id,name,description,format,starts_at,settings) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,[id,code,ownerId,name,db.safeText(data.description,500)||null,data.format==='knockout'?'knockout':'leaderboard',data.startsAt?new Date(data.startsAt):null,JSON.stringify(data.settings||{})]);await q('INSERT INTO quiz_platform_tournament_players(tournament_id,profile_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,ownerId]);return rows[0];}
async function listTournaments(profileId){const{rows}=await q(`SELECT t.*,owner.name AS owner_name,COUNT(tp.profile_id)::int AS player_count,BOOL_OR(tp.profile_id=$1) AS joined FROM quiz_platform_tournaments t JOIN quiz_solo_profiles owner ON owner.id=t.owner_id LEFT JOIN quiz_platform_tournament_players tp ON tp.tournament_id=t.id WHERE t.status<>'cancelled' GROUP BY t.id,owner.name ORDER BY t.created_at DESC LIMIT 100`,[profileId]);return rows;}
async function joinTournament(profileId,code){const{rows}=await q(`SELECT id,status FROM quiz_platform_tournaments WHERE code=$1`,[db.safeCode(code,8)]);if(!rows[0]||rows[0].status!=='open')throw new Error('Turnier ist nicht offen.');await q('INSERT INTO quiz_platform_tournament_players(tournament_id,profile_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[rows[0].id,profileId]);return true;}
async function tournamentDetails(code){const{rows}=await q(`SELECT t.*,owner.name AS owner_name FROM quiz_platform_tournaments t JOIN quiz_solo_profiles owner ON owner.id=t.owner_id WHERE t.code=$1`,[db.safeCode(code,8)]);if(!rows[0])return null;const players=await q(`SELECT p.id,p.name,p.avatar_id,tp.score,tp.wins,tp.losses,tp.joined_at FROM quiz_platform_tournament_players tp JOIN quiz_solo_profiles p ON p.id=tp.profile_id WHERE tp.tournament_id=$1 ORDER BY tp.score DESC,tp.wins DESC,p.name`,[rows[0].id]);return{...rows[0],players:players.rows};}
async function updateTournament(ownerId,code,data){const status=['open','running','finished','cancelled'].includes(data.status)?data.status:'open';const{rows}=await q(`UPDATE quiz_platform_tournaments SET name=COALESCE($3,name),description=COALESCE($4,description),status=$5,updated_at=NOW() WHERE code=$1 AND owner_id=$2 RETURNING *`,[db.safeCode(code,8),ownerId,db.safeText(data.name,100)||null,db.safeText(data.description,500)||null,status]);if(!rows[0])throw new Error('Turnier nicht gefunden oder keine Berechtigung.');return rows[0];}
async function recordTournamentScore(ownerId,code,profileId,score,won){const tournament=await q('SELECT id FROM quiz_platform_tournaments WHERE code=$1 AND owner_id=$2',[db.safeCode(code,8),ownerId]);if(!tournament.rows[0])throw new Error('Keine Berechtigung.');const delta=Math.max(-10000,Math.min(10000,Math.round(Number(score)||0)));const{rows}=await q(`UPDATE quiz_platform_tournament_players SET score=score+$3,wins=wins+$4,losses=losses+$5 WHERE tournament_id=$1 AND profile_id=$2 RETURNING *`,[tournament.rows[0].id,profileId,delta,won?1:0,won?0:1]);return rows[0]||null;}
async function createPack(ownerId,data){const questions=db.normalizeQuestions(data.questions);const id=db.crypto.randomUUID();const code=db.randomCode(8);const visibility=['private','friends','public'].includes(data.visibility)?data.visibility:'private';const title=db.safeText(data.title,100);if(title.length<3)throw new Error('Titel ist zu kurz.');const{rows}=await q(`INSERT INTO quiz_platform_packs(id,code,owner_id,title,description,visibility,questions) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,[id,code,ownerId,title,db.safeText(data.description,500)||null,visibility,JSON.stringify(questions)]);return rows[0];}
async function listPacks(profileId){const{rows}=await q(`SELECT p.*,owner.name AS owner_name,(p.owner_id=$1) AS owned FROM quiz_platform_packs p JOIN quiz_solo_profiles owner ON owner.id=p.owner_id WHERE p.owner_id=$1 OR p.visibility='public' OR (p.visibility='friends' AND EXISTS(SELECT 1 FROM quiz_platform_friendships f WHERE f.status='accepted' AND ((f.profile_low=$1 AND f.profile_high=p.owner_id) OR (f.profile_high=$1 AND f.profile_low=p.owner_id)))) ORDER BY p.updated_at DESC LIMIT 100`,[profileId]);return rows.map(row=>({...row,questions:undefined,questionCount:Array.isArray(row.questions)?row.questions.length:0}));}
async function getPack(code,viewerId=null){const{rows}=await q(`SELECT p.*,owner.name AS owner_name FROM quiz_platform_packs p JOIN quiz_solo_profiles owner ON owner.id=p.owner_id WHERE p.code=$1`,[db.safeCode(code,8)]);const pack=rows[0];if(!pack)return null;if(pack.visibility==='private'&&pack.owner_id!==viewerId)return null;if(pack.visibility==='friends'&&pack.owner_id!==viewerId){if(!viewerId)return null;const f=await q(`SELECT 1 FROM quiz_platform_friendships WHERE status='accepted' AND ((profile_low=$1 AND profile_high=$2) OR (profile_low=$2 AND profile_high=$1))`,[viewerId,pack.owner_id]);if(!f.rowCount)return null;}return pack;}
async function registerPackPlay(code){await q('UPDATE quiz_platform_packs SET plays=plays+1 WHERE code=$1',[db.safeCode(code,8)]);return true;}
async function enqueueMatch(profileId,quizType='adult',gameMode='individual',instanceId=null){await q(`INSERT INTO quiz_platform_matchmaking_queue(profile_id,quiz_type,game_mode,joined_at,instance_id) VALUES($1,$2,$3,NOW(),$4) ON CONFLICT(profile_id) DO UPDATE SET quiz_type=EXCLUDED.quiz_type,game_mode=EXCLUDED.game_mode,joined_at=NOW(),instance_id=EXCLUDED.instance_id`,[profileId,quizType==='child'?'child':'adult',gameMode==='teams'?'teams':'individual',instanceId]);return tryPairMatch(profileId);}
async function leaveMatchQueue(profileId){await q('DELETE FROM quiz_platform_matchmaking_queue WHERE profile_id=$1',[profileId]);return true;}
async function tryPairMatch(profileId){await ensureReady();const client=await db.pool.connect();try{await client.query('BEGIN');const mine=(await client.query('SELECT * FROM quiz_platform_matchmaking_queue WHERE profile_id=$1 FOR UPDATE',[profileId])).rows[0];if(!mine){await client.query('ROLLBACK');return null;}const other=(await client.query(`SELECT q.* FROM quiz_platform_matchmaking_queue q WHERE q.profile_id<>$1 AND q.quiz_type=$2 AND q.game_mode=$3 AND NOT EXISTS(SELECT 1 FROM quiz_platform_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=q.profile_id) OR (b.blocker_id=q.profile_id AND b.blocked_id=$1)) ORDER BY q.joined_at FOR UPDATE SKIP LOCKED LIMIT 1`,[profileId,mine.quiz_type,mine.game_mode])).rows[0];if(!other){await client.query('COMMIT');return null;}const id=db.crypto.randomUUID();await client.query('DELETE FROM quiz_platform_matchmaking_queue WHERE profile_id IN ($1,$2)',[profileId,other.profile_id]);await client.query(`INSERT INTO quiz_platform_matches(id,profile_a,profile_b,status) VALUES($1,$2,$3,'creating')`,[id,profileId,other.profile_id]);await client.query('COMMIT');return{id,profileA:profileId,profileB:other.profile_id,quizType:mine.quiz_type,gameMode:mine.game_mode};}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}}
async function setMatchReady(id,roomCode,credentialsA,credentialsB){await q(`UPDATE quiz_platform_matches SET room_code=$2,credentials_a=$3::jsonb,credentials_b=$4::jsonb,status='ready' WHERE id=$1`,[id,db.safeCode(roomCode,6),JSON.stringify(credentialsA),JSON.stringify(credentialsB)]);return true;}
async function setMatchFailed(id,error){await q(`UPDATE quiz_platform_matches SET status='failed',error=$2 WHERE id=$1`,[id,db.safeText(error,300)]);return true;}
async function matchStatus(profileId){const{rows}=await q(`SELECT * FROM quiz_platform_matches WHERE (profile_a=$1 OR profile_b=$1) AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1`,[profileId]);const match=rows[0];if(!match)return null;return{...match,credentials:match.profile_a===profileId?match.credentials_a:match.credentials_b,credentials_a:undefined,credentials_b:undefined};}
module.exports={ensureReady,activeSeason,seasonLeaderboard,createTournament,listTournaments,joinTournament,tournamentDetails,updateTournament,recordTournamentScore,createPack,listPacks,getPack,registerPackPlay,enqueueMatch,leaveMatchQueue,matchStatus,setMatchReady,setMatchFailed};
