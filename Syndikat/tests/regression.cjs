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
    showModal(){this.open=true},close(){this.open=false},append(){},appendChild(){},prepend(){},insertBefore(){},insertAdjacentHTML(){},insertAdjacentElement(){},click(){},remove(){},setAttribute(){},getAttribute(){return null},
    getContext(){return {scale(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}}}};
}
const storage=new Map();
const context={
  console,
  localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  document:{querySelector(){return element()},querySelectorAll(){return[]},createElement(){return element()},addEventListener(){},body:element(),head:element(),documentElement:element()},
  navigator:{},location:{protocol:'https:'},confirm:()=>true,
  addEventListener(){},setTimeout(){return 0},clearTimeout(){},setInterval(){return 0},clearInterval(){},requestAnimationFrame(){return 0},
  Blob:function(){},URL:{createObjectURL(){return'blob:'},revokeObjectURL(){}},FileReader:function(){},MutationObserver:class{constructor(cb){this.cb=cb}observe(){}disconnect(){}},queueMicrotask:fn=>fn(),devicePixelRatio:1,
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
  assert.strictEqual(migrated.players[0].story.version,51,'story must migrate to the visual campaign state');
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
  assert(schema.includes('syndikat_private.validate_game_state'),'online/account states must pass the v5.5 structural validator');
  assert(schema.includes('security invoker set search_path=pg_catalog,syndikat_private'),'public privileged RPC surfaces must be security-invoker wrappers');
  assert(schema.includes('start_game_impl')&&schema.includes('submit_turn_impl'),'privileged online implementations must live in the private schema');
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
    '40-ai-espionage-events.js','50-economy-property.js','55-visual-story.js','58-world-depth.js','59-visual-expansion.js','60-cloud-online.js','65-ui-art.js',
    '70-decisions.js','80-justice.js','90-final-gameplay.js'
  ];
  assert(base.includes('__SYNDIKAT_MODULES__'),'modular core base must expose build marker');
  for(const name of moduleNames) assert(fs.existsSync('Syndikat/src/modules/'+name),'missing source module '+name);
}


// v5.5 selector/runtime integration guards
{
  const runtime=fs.readFileSync('Syndikat/js/core.js','utf8');
  const moduleFiles=fs.readdirSync('Syndikat/src/modules').filter(x=>x.endsWith('.js'));
  const badCollection=/(?<!\$)\$\(([^()\n]{1,260})\)\.(forEach|filter|map)\(/g;
  assert.strictEqual([...runtime.matchAll(badCollection)].length,0,'runtime must never iterate a single-element $() selector');
  for(const name of moduleFiles){
    const mod=fs.readFileSync('Syndikat/src/modules/'+name,'utf8');
    assert.strictEqual([...mod.matchAll(badCollection)].length,0,name+' contains a single-element selector used as a collection');
  }
  assert(!runtime.includes('const oldPlanner=v4OpenOperationPlanner'),'world-depth must not reach into the private V4 module scope');
  assert(runtime.includes('const oldPlanner=window.SyndikatV4?.openOperation'),'operation artwork must decorate the exported V4 planner API');
  assert(runtime.includes('storyVictoryTarget'),'chapter 20 must scale with the selected campaign victory rules');
  assert(runtime.includes('data-freeplay'),'a human winner must be able to continue optional story/content after victory');
}

// v5.4 complete visual expansion guards
{
  const visualExpansion=fs.readFileSync('Syndikat/src/modules/59-visual-expansion.js','utf8');
  assert(visualExpansion.includes('SYNDIKAT_V54_VISUAL_EXPANSION_BEGIN'),'visual expansion module missing');
  assert(visualExpansion.includes('story-20.svg'),'all story chapters must have dedicated art');
  assert(visualExpansion.includes('ending-shadow.svg'),'ending art mapping missing');
  assert(visualExpansion.includes('spec-highstakes.svg'),'specialization art mapping missing');
  const visualAssets=["story-01.svg","story-02.svg","story-03.svg","story-04.svg","story-05.svg","story-06.svg","story-07.svg","story-08.svg","story-09.svg","story-10.svg","story-11.svg","story-12.svg","story-13.svg","story-14.svg","story-15.svg","story-16.svg","story-17.svg","story-18.svg","story-19.svg","story-20.svg","event-blackout.svg","event-tourism.svg","event-scandal.svg","event-dockstrike.svg","crime-machine.svg","crime-mug.svg","crime-car.svg","crime-bar.svg","crime-bank.svg","diplomacy-tribute.svg","diplomacy-venture.svg","diplomacy-swap.svg","diplomacy-betray.svg","endgame-legit.svg","endgame-politics.svg","endgame-war.svg","prison-cell.svg","prison-appeal.svg","prison-bribe.svg","prison-network.svg","prison-contraband.svg","prison-tunnel.svg","prison-delegate.svg","prison-escape.svg","court-hearing.svg","court-fight.svg","court-deal.svg","court-corrupt.svg","court-archive.svg","spec-lowprofile.svg","spec-highroller.svg","spec-discreet.svg","spec-premium.svg","spec-lounge.svg","spec-speakeasy.svg","spec-sportsbook.svg","spec-bookmaking.svg","spec-family.svg","spec-night.svg","spec-vip.svg","spec-backroom.svg","spec-elite.svg","spec-discretion.svg","spec-resort.svg","spec-highstakes.svg","spec-luxuryhotel.svg","spec-conference.svg","spec-legit.svg","spec-shells.svg","protection-kiosk.svg","protection-friseursalon.svg","protection-spati.svg","protection-taxi-zentrale.svg","protection-werkstatt.svg","protection-pfandleihe.svg","protection-gemusehandler.svg","protection-nachtcafe.svg","protection-lagerbetrieb.svg","protection-billardsalon.svg","protection-schneiderei.svg","protection-tabakladen.svg","achievement-first_biz.svg","achievement-crew.svg","achievement-million.svg","achievement-ten_million.svg","achievement-district.svg","achievement-three_districts.svg","achievement-operations.svg","achievement-untouchable.svg","achievement-underboss.svg","achievement-syndicate.svg","person-alessio-marchetti.svg","person-bianca-serra.svg","person-matteo-ricci.svg","person-clara-venturi.svg","person-paolo-gallo.svg","person-francesca-neri.svg","person-stefano-riva.svg","person-lucia-ferraro.svg","person-bruno-amato.svg","person-rosa-mancini.svg","person-gabriel-esposito.svg","person-nina-lombardi.svg","person-tomaso-greco.svg","person-adriana-vitale.svg","person-renato-leone.svg","person-camilla-de-santis.svg","person-emilio-caruso.svg","person-vera-romano.svg","person-silvio-morelli.svg","person-anita-bianchi.svg","person-massimo-fontana.svg","person-greta-costa.svg","person-dante-rizzo.svg","person-lea-conti.svg","ending-empire.svg","ending-shadow.svg","ending-crown.svg","ending-family.svg"];
  for(const asset of visualAssets){assert(fs.existsSync('Syndikat/assets/'+asset),'missing v5.4 visual asset '+asset);}
}

// v5.4.1 menu and management artwork guards
{
  const uiArt=fs.readFileSync('Syndikat/src/modules/65-ui-art.js','utf8');
  const sw=fs.readFileSync('Syndikat/sw.js','utf8');
  assert(uiArt.includes('SYNDIKAT_V541_UI_ART_BEGIN'),'UI artwork module missing');
  const uiAssets=["ui-mainmenu.webp","ui-saves-cloud.webp","ui-online-lobby.webp","ui-settings-help.webp","ui-finance.webp","ui-hall-fame.webp","ui-tutorial.webp","ui-stats-admin.webp"];
  for(const asset of uiAssets){
    assert(fs.existsSync('Syndikat/assets/'+asset),'missing UI artwork '+asset);
    assert(sw.includes('./assets/'+asset),'UI artwork must be cached offline: '+asset);
    assert(uiArt.includes(asset),'UI artwork must be mapped: '+asset);
  }
  assert(sw.includes('syndikat-v5-5-0'),'PWA cache must match the v5.5 stability release');
}

// Deterministic campaign soak: every finite mode must resolve repeatedly without exceptions.
{
  for(const length of ['short','normal','long']){
    for(let seed=1;seed<=10;seed++){
      context.Math.random=seeded(seed*7919+length.length);
      const st=mk({ais:3,length,difficulty:'normal'});
      let guard=0;
      assert.doesNotThrow(()=>{
        while(!st.gameOver&&guard++<1600){
          const p=st.players[st.currentIndex];
          if(p.type==='ai')T.aiTurn(p);
          T.processEndOfTurn(p);
          if(!st.gameOver)T.advanceIndex();
        }
      },length+' campaign simulation must not throw');
      assert.strictEqual(st.gameOver,true,length+' campaign must resolve');
    }
  }
  const endless=mk({ais:0,length:'endless'});endless.round=500;T.checkVictory();
  assert.strictEqual(endless.gameOver,false,'endless mode must never auto-resolve');
}

console.log('Syndikat regression suite: OK');
