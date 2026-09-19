const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const path='Syndikat/js/core.js';
let src=fs.readFileSync(path,'utf8');
new Function(src);

const inject=`
renderAll=function(){};
renderCity=function(){};
renderBusinesses=function(){};
renderActions=function(){};
renderStaff=function(){};
renderCorruption=function(){};
renderFinance=function(){};
renderMissions=function(){};
renderRanking=function(){};
toast=function(){};
openDialog=function(){};
closeDialog=function(){};
showScreen=function(){};
updateContinueButton=function(){};
showHandoff=function(){};
showGameOver=function(){};
saveGame=function(){};
window.__TEST__={
  DISTRICTS,BUSINESSES,AI_PROFILES,blankPlayer,initPlayer,ensureMissions,processEndOfTurn,advanceIndex,aiTurn,
  powerIndex,rankName,controlledDistricts,netWorth,districtShare,checkVictory,buyBusiness,migrateState,
  getState:()=>state,setState:v=>{state=v;}
};
`;
src=src.replace(/\n\s*init\(\);\s*\n\}\)\(\);\s*$/m,'\n'+inject+'\n})();');

function element(){
  return {open:false,disabled:false,textContent:'',innerHTML:'',value:'',checked:false,dataset:{},style:{},
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    addEventListener(){},removeEventListener(){},querySelector(){return null},querySelectorAll(){return[]},
    showModal(){this.open=true},close(){this.open=false},append(){},appendChild(){},insertAdjacentHTML(){},click(){},remove(){}};
}
const storage=new Map();
const context={
  console,
  localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  document:{querySelector(){return element()},querySelectorAll(){return[]},createElement(){return element()},addEventListener(){},body:element()},
  navigator:{},location:{protocol:'https:'},confirm:()=>true,
  addEventListener(){},setTimeout(){return 0},clearTimeout(){},setInterval(){return 0},clearInterval(){},requestAnimationFrame(){return 0},
  Blob:function(){},URL:{createObjectURL(){return'blob:'},revokeObjectURL(){}},
  Date,Math,Object,Array,Set,Map,JSON,Number,String,Boolean,RegExp,Promise,parseInt,parseFloat,isNaN,Infinity,NaN
};
context.window=context;
vm.createContext(context);
vm.runInContext(src,context,{filename:path});
const T=context.__TEST__;

function seeded(seed){let x=seed>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296}}
function mk({ais=0,length='normal',difficulty='normal'}={}){
  const ps=[T.blankPlayer('Tester','Leone','human')];
  for(let i=0;i<ais;i++){
    const pr=T.AI_PROFILES[i%T.AI_PROFILES.length],p=T.blankPlayer(pr.family,pr.family,'ai',pr.style);
    const m={easy:.85,normal:1,hard:1.2,boss:1.45}[difficulty]||1;
    p.clean=Math.round(p.clean*m);p.dirty=Math.round(p.dirty*m);ps.push(p);
  }
  const st={version:4,round:1,currentIndex:0,players:ps,settings:{difficulty,length},log:[],winnerId:null,gameOver:false,initialPlayerCount:ps.length,initialHumanCount:1};
  T.setState(st);ps.forEach(p=>{T.initPlayer(p);T.ensureMissions(p)});return st;
}

// Start progression.
{
  const st=mk(),p=st.players[0];
  assert.strictEqual(T.rankName(p),'Niemand');
  assert(T.powerIndex(p)<5,'new player power must stay low');
  assert(p.inventory&&p.investigation&&p.story&&Array.isArray(p.crews),'v4 systems must migrate/init');
  assert(p.prisonState&&p.leadership&&p.finalCrisis,'final gameplay systems must initialize');
}

// No solo auto-win.
{
  const st=mk();st.round=22;T.checkVictory();
  assert.strictEqual(st.gameOver,false,'solo game must not auto-win at round 22');
}

// All eliminated should end cleanly.
{
  const st=mk({ais:1});st.players.forEach(p=>p.eliminated=true);
  assert.doesNotThrow(()=>T.checkVictory());
  assert.strictEqual(st.gameOver,true);
  assert.strictEqual(st.winnerId,null);
}

// Human elimination cannot hang on AI turn.
{
  const st=mk({ais:3});st.players[0].eliminated=true;T.checkVictory();
  assert.strictEqual(st.gameOver,true);
  assert(st.winnerId,'an AI winner should be resolved');
}

// 100 empty turns must not create wealth.
{
  context.Math.random=seeded(7);
  const st=mk({length:'long'}),p=st.players[0],before=T.netWorth(p);
  for(let i=0;i<100&&!st.gameOver;i++){T.processEndOfTurn(p);if(!st.gameOver)T.advanceIndex();}
  assert(T.netWorth(p)<=before*1.05,'idle turns must not be a wealth generator');
}

// A single machine bundle plus pure idling must not snowball.
{
  context.Math.random=seeded(11);
  const st=mk({length:'long'}),p=st.players[0];
  T.buyBusiness('machines','oldtown');
  const afterBuy=T.netWorth(p);
  for(let i=0;i<100&&!st.gameOver;i++){T.processEndOfTurn(p);if(!st.gameOver)T.advanceIndex();}
  assert(T.netWorth(p)<=afterBuy*1.15,'single-business idle farming must not snowball');
}

// Tier 2 business requires clean capital.
{
  const st=mk(),p=st.players[0];p.clean=0;p.dirty=250000;p.actionPoints=3;
  const before=p.businesses.length;T.buyBusiness('bar','oldtown');
  assert.strictEqual(p.businesses.length,before,'bar must be blocked without clean money');
}

// Finite campaigns always resolve by deadline, even if human idles.
{
  context.Math.random=seeded(19);
  const st=mk({ais:3,length:'short'});let guard=0;
  while(!st.gameOver&&guard++<2000){
    const p=st.players[st.currentIndex];
    if(p.type==='ai')T.aiTurn(p);
    T.processEndOfTurn(p);
    if(!st.gameOver)T.advanceIndex();
  }
  assert.strictEqual(st.gameOver,true,'short campaign must resolve');
  assert(st.round<=92,'short campaign should resolve around round 90');
}

assert(src.includes('SYNDIKAT_V4_SYSTEMS_BEGIN'));
assert(src.includes('SYNDIKAT_V42_META_BEGIN'));
assert(src.includes('SYNDIKAT_V43_DEPTH_BEGIN'));
assert(src.includes('SYNDIKAT_V44_ECONOMY_DEPTH_BEGIN'));
assert(src.includes('SYNDIKAT_V51_VISUAL_STORY_BEGIN'));
assert(src.includes('SYNDIKAT_V52_WORLD_DEPTH_BEGIN'));
assert(src.includes("chapter:20"),'expanded story must reach chapter 20');
assert(src.includes('SYNDIKAT_V45_CLOUD_UI_BEGIN'));
assert(src.includes('SYNDIKAT_V46_DECISIONS_BEGIN'));
assert(src.includes('SYNDIKAT_V47_JUSTICE_BEGIN'));
assert(src.includes('SYNDIKAT_V49_FINAL_GAMEPLAY_BEGIN'));

// New-state migration must create the v4 economy/meta structures without losing the save.
{
  const st=mk();
  const migrated=T.migrateState(JSON.parse(JSON.stringify(st)));
  T.setState(migrated);
  assert(Array.isArray(migrated.propertyMarket),'property market must exist after migration');
  assert(migrated.propertyMarket.length>=24,'property market should provide multiple lots per district');
  assert(Array.isArray(migrated.players[0].propertyIds),'player property ids must migrate');
  assert(Array.isArray(migrated.players[0].pendingDecisions),'decision queue must migrate');
  assert.strictEqual(migrated.players[0].story.version,51,'story must migrate to visual 12-chapter campaign');
}

// Prepared cloud adapter/schema must be syntactically valid and locked down by RLS.
{
  const cloud=fs.readFileSync('Syndikat/js/cloud.js','utf8');
  const cfg=fs.readFileSync('Syndikat/cloud-config.js','utf8');
  const schema=fs.readFileSync('Syndikat/supabase/schema.sql','utf8');
  new Function(cloud);new Function(cfg);
  assert(schema.includes('enable row level security'));
  assert(schema.includes('syndikat_private.token_hash'));
  assert(schema.includes('revoke all on table public.syndikat_online_games from anon, authenticated'));
  assert(schema.includes('grant select ('),'cloud schema must use restricted column grants');
  assert(!cloud.includes('service_role'),'public client must never contain a service-role key');
  assert(cloud.includes('watchGame'),'online client must support realtime updates');
  assert(cloud.includes('signInAccount'),'cloud account login must be implemented');
  assert(cloud.includes('accountSaveSlot'),'account save slots must be implemented');
  assert(cloud.includes('syndikat_submit_turn'),'online turns must use server validation RPC');
  assert(cfg.includes('enabled: true'),'cloud configuration must be enabled for v5');
  assert(schema.includes('syndikat_private'),'schema must isolate Syndikat helpers');
  assert(schema.includes('syndikat_turn_audit'),'server must keep an immutable turn audit trail');
  assert(schema.includes('syndikat_account_saves'),'authenticated account saves must exist');
  assert(schema.includes('syndikat_account_save_slot'),'account saves must use authenticated RPCs');
  assert(schema.includes('syndikat_start_game'),'online starts must be server validated');
  assert(schema.includes('syndikat_submit_turn'),'online turns must be server validated');
  assert(schema.includes('revoke update on public.syndikat_online_games from anon'),'clients must not directly overwrite online game state');
  assert(!schema.includes('active_token_hash'),'player token hashes must not be exposed through active game state');
}

// Offline shell must include the modular/cloud files and update path.
{
  const sw=fs.readFileSync('Syndikat/sw.js','utf8');
  const index=fs.readFileSync('Syndikat/index.html','utf8');
  assert(sw.includes('./js/cloud.js'));
  assert(sw.includes('SKIP_WAITING'));
  assert(index.includes('./cloud-config.js'));
  assert(index.includes('@supabase/supabase-js'),'realtime client library must be loaded');
  assert(index.includes('updateNotice'));
  const css=fs.readFileSync('Syndikat/style.css','utf8');
  assert(css.includes("./assets/start-user.webp"),'startup must use the user-provided artwork');
  assert(sw.includes("./assets/start-user.webp"),'startup artwork must be available offline');
  assert(sw.includes("./assets/business-casino.svg"),'business art must be cached');
  assert(sw.includes("./assets/rival-moretti.svg"),'rival art must be cached');
  assert(sw.includes("./assets/person-julia-costa.svg"),'unique staff portraits must be cached');
  assert(sw.includes("./assets/contact-judge.svg"),'authority portraits must be cached');
  assert(sw.includes("./assets/property-prime.svg"),'property art must be cached');
  for(const asset of ['city-map.webp','portrait-vittorio.webp','portrait-marco.webp','portrait-sofia.webp','portrait-keller.webp','event-raid.webp','event-court.webp','event-prison-break.webp']){
    assert(fs.existsSync('Syndikat/assets/'+asset),'missing visual asset '+asset);
    assert(sw.includes('./assets/'+asset),'visual asset must be cached offline: '+asset);
  }
}

{
  const base=fs.readFileSync('Syndikat/src/core-base.js','utf8');
  const moduleNames=[
    '10-legacy-v3.js','20-organization-operations.js','30-meta-progression.js',
    '40-ai-espionage-events.js','50-economy-property.js','55-visual-story.js','58-world-depth.js','60-cloud-online.js',
    '70-decisions.js','80-justice.js','90-final-gameplay.js'
  ];
  assert(base.includes('__SYNDIKAT_MODULES__'),'modular core base must expose build marker');
  for(const name of moduleNames) assert(fs.existsSync('Syndikat/src/modules/'+name),'missing source module '+name);
}

console.log('Syndikat regression suite: OK');

// v5.3.1 visual regression guards
{
  const worldDepthSource531=fs.readFileSync('Syndikat/src/modules/58-world-depth.js','utf8');
  const runtimeSource531=fs.readFileSync('Syndikat/js/core.js','utf8');
  assert(worldDepthSource531.includes("$('#staffGrid [data-staff-person]').forEach"),'named staff portrait renderer must iterate all staff buttons');
  assert(worldDepthSource531.includes("$('.dialog-option',root).forEach"),'property artwork decorator must iterate all dialog options');
  assert(!worldDepthSource531.includes("    $('#staffGrid [data-staff-person]').forEach"),'single-element selector must not be used as an iterable for staff portraits');
  assert(!worldDepthSource531.includes("    $('.dialog-option',root).forEach"),'single-element selector must not be used as an iterable for property artwork');
  assert(!runtimeSource531.includes("$$('#staffGrid"),'generated runtime must not contain a triple-dollar staff selector');
  assert(!runtimeSource531.includes("$$('.dialog-option',root)"),'generated runtime must not contain a triple-dollar property selector');
}
