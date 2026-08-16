import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEEP = process.env.DEEP_TEST === '1';

function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function load(seed){
  let s=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
  s=s.replace("const app = document.getElementById('app');",'const app = null;');
  s=s.replace(/saveGame\(this\);\s*renderGame\(this(?:,\s*true)?\);/g,';');
  s=s.replace(/addScore\(this\);/g,';');
  s=s.replace(/\s*if \('serviceWorker' in navigator\)[\s\S]*?\s*renderHome\(\);\s*\}\)\(\);\s*$/,"\n globalThis.__T={Game,ITEMS};\n})();\n");
  const m=Object.create(Math);m.random=rng(seed);const c=vm.createContext({console,Intl,Date,Math:m});vm.runInContext(s,c,{timeout:3000});return c.__T;
}
function buy(g,key,reserve=0,max=1){let n=0;while(n<max&&g.canBuy(key)){const c=g.market[key]*(key==='food'?100:1);if(g.cash-c<reserve)break;g.buy(key);n++;}return n;}

const PARAMS=[];
const taxLevels=[10,12,14,16];
const foodBuffers=[1.05,1.35,1.7];
const housingTargets=[1.08,1.16,1.25];
const growthRates=[.05,.10,.18];
const jobTargets=[.72,.86,.98];
for(const tax of taxLevels) for(const foodBuffer of foodBuffers) for(const housingTarget of housingTargets) for(const growthRate of growthRates) for(const jobTarget of jobTargets){
  PARAMS.push({tax,foodBuffer,housingTarget,growthRate,jobTarget});
}

function act(g,p,objective){
  const need=Math.max(1,g.monthlyFoodNeed());
  const f=g.forecast();
  const reserve=Math.max(120,Math.min(3500,g.monthlyMaintenance()*1.6));

  // Maintain food, but never spend the entire treasury merely to hoard it.
  let guard=0;
  while(g.inventory.food/need<p.foodBuffer&&g.canBuy('food')&&guard++<30){
    const cost=g.market.food*100;
    if(g.cash-cost<Math.min(reserve,500)&&g.inventory.food>=need*.95) break;
    g.buy('food');
  }

  // Keep enough buildable land for the next small expansion.
  if(g.landFree()<3&&g.cash>reserve+g.market.land) buy(g,'land',reserve,6);

  // Housing is capacity, not a goal by itself.
  if(g.housingCapacity()/Math.max(1,g.population)<p.housingTarget&&g.cash>reserve){
    if(g.population>1400&&g.cash>reserve+g.market.towers&&g.landFree()>=2) buy(g,'towers',reserve,1);
    else buy(g,'houses',reserve,3);
  }

  // Add commercial capacity only if demand remains meaningful afterward.
  let j=0;
  while(g.employmentCoverage()<p.jobTarget&&g.cash>reserve&&j++<5){
    if(g.population>900&&g.inventory.supermarkets<Math.max(1,Math.floor(g.population/2300))&&g.commerceUtilization('supermarkets')>.48){
      if(!buy(g,'supermarkets',reserve,1)) break;
    }else if(g.commerceUtilization('shops')>.48){
      if(!buy(g,'shops',reserve,1)) break;
    }else break;
  }

  // Education is delayed until the town can afford it.
  if(g.population>500&&g.educationCoverage()<.72&&g.cash>reserve+400){
    if(g.population>4500&&g.cash>reserve+g.market.universities*1.05) buy(g,'universities',reserve,1);
    else buy(g,'schools',reserve,1);
  }

  // Supermarkets become a logistics investment in larger towns.
  if(g.population>1500&&g.inventory.supermarkets<Math.max(1,Math.floor(g.population/3000))&&g.commerceUtilization('supermarkets')>.55&&g.cash>reserve+g.market.supermarkets){
    buy(g,'supermarkets',reserve,1);
  }

  let tax=p.tax;
  if(objective==='cash') tax=Math.min(17,tax+2);
  if(f.sustainableBalance<0&&g.approval>52) tax=Math.min(17,tax+2);
  if(g.cash<0&&g.approval>45) tax=Math.min(18,tax+3);
  if(g.approval<42) tax=Math.min(tax,9);
  if(g.approval<30) tax=Math.min(tax,6);
  if(g.approval<22) tax=3;

  const spare=Math.max(0,g.housingCapacity()-g.population);
  let admit=Math.min(spare,Math.max(1,Math.round(g.population*p.growthRate)));
  if(objective==='cash') admit=Math.round(admit*.7);
  if(g.employmentCoverage()<.58) admit=Math.min(admit,Math.max(1,Math.round(g.population*.008)));
  if(g.inventory.food<need*.85) admit=0;
  if(g.approval<28) admit=0;

  g.advanceMonth({taxRate:tax,foodAllocation:Math.min(g.inventory.food,g.monthlyFoodNeed()),admitLimit:Math.min(5000,admit)});
}

function run(objective,p,seed,maxMonths){
  const {Game}=load(seed);const g=new Game({winCondition:objective});let months=0;
  while(!g.ended&&months<maxMonths){act(g,p,objective);months++;}
  return {win:!!g.ending?.win,months,pop:g.population,cash:g.cash,approval:g.approval,status:g.status(),reason:g.ending?.reason||'timeout'};
}

const objectives=['fouryears','cash','population','modern'];
const maxParams=DEEP?PARAMS.length:Math.min(PARAMS.length,180);
const searchSeeds=DEEP?[101,907,2027]:[101];
const verifySeeds=DEEP?[101,907,2027,4093,8011,12007,17011,23003]:[101,907,2027,4093];
const maxMonths=objective=>objective==='fouryears'?72:600;
let critical=false;

console.log(`# Multi-strategy planner (${DEEP?'deep':'standard'})`);
for(const objective of objectives){
  const candidates=[];
  for(let i=0;i<maxParams;i++){
    const p=PARAMS[i];
    let searchWins=0,totalMonths=0;
    for(const seed of searchSeeds){const r=run(objective,p,seed,maxMonths(objective));if(r.win){searchWins++;totalMonths+=r.months;}}
    if(searchWins)candidates.push({p,searchWins,avg:totalMonths/searchWins});
  }
  candidates.sort((a,b)=>b.searchWins-a.searchWins||a.avg-b.avg);
  const top=candidates.slice(0,DEEP?8:4);
  let best=null;
  for(const c of top){
    const runs=verifySeeds.map(seed=>run(objective,c.p,seed,maxMonths(objective)));
    const wins=runs.filter(r=>r.win);
    const entry={params:c.p,wins:wins.length,runs:runs.length,winRate:wins.length/runs.length,medianMonths:wins.length?wins.map(x=>x.months).sort((a,b)=>a-b)[Math.floor(wins.length/2)]:null,samples:runs.slice(0,2)};
    if(!best||entry.wins>best.wins||(entry.wins===best.wins&&(entry.medianMonths??9999)<(best.medianMonths??9999)))best=entry;
  }
  console.log(`\n=== ${objective} ===`);
  console.log(JSON.stringify({searched:maxParams,candidateCount:candidates.length,best},null,2));
  if(!best||best.wins===0){console.error(`UNREACHABLE_BY_PLANNER: ${objective}`);critical=true;}
}

// Diagnostic only: main autonomous suite decides CI pass/fail. A missing path is printed prominently
// so balancing work can distinguish proof failure from engine corruption.
if(critical) console.error('Planner did not find at least one winning path for every objective.');
