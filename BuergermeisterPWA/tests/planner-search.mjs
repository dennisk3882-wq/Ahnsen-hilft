import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEEP = process.env.DEEP_TEST === '1';

function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function load(seed){const s=fs.readFileSync(path.join(ROOT,'game-engine.js'),'utf8');const m=Object.create(Math);m.random=rng(seed);const c=vm.createContext({console,Intl,Date,Math:m,BGM_HOOKS:{save(){},render(){},score(){}}});vm.runInContext(s,c,{timeout:3000});return c.BGM_ENGINE;}
function buy(g,key,reserve=0,max=1){let n=0;while(n<max&&g.canBuy(key)){const c=g.market[key]*(key==='food'?100:1);if(g.cash-c<reserve)break;g.buy(key);n++;}return n;}
function stockFood(g,targetMonths,reserveFloor){
  const need=Math.max(1,g.monthlyFoodNeed());
  const target=Math.ceil(need*targetMonths);
  const missing=Math.max(0,target-g.inventory.food);
  const maxBatches=Math.max(1,Math.ceil(missing/100)+2);
  let bought=0;
  while(g.inventory.food<target&&g.canBuy('food')&&bought++<maxBatches){
    const cost=g.market.food*100;
    if(g.cash-cost<reserveFloor&&g.inventory.food>=need*.95) break;
    g.buy('food');
  }
}

const PARAMS=[];
const taxLevels=[10,12,14,16];
const foodBuffers=[1.05,1.35,1.7];
const housingTargets=[1.08,1.16,1.25];
const growthRates=[.05,.10,.18];
const jobTargets=[.72,.86,.98];
for(const tax of taxLevels) for(const foodBuffer of foodBuffers) for(const housingTarget of housingTargets) for(const growthRate of growthRates) for(const jobTarget of jobTargets){
  PARAMS.push({tax,foodBuffer,housingTarget,growthRate,jobTarget});
}

function gridAct(g,p,objective){
  const need=Math.max(1,g.monthlyFoodNeed());
  const f=g.forecast();
  const reserve=Math.max(120,Math.min(3500,g.monthlyMaintenance()*1.6));

  stockFood(g,p.foodBuffer,Math.min(reserve,500));
  if(g.landFree()<3&&g.cash>reserve+g.market.land) buy(g,'land',reserve,6);

  if(g.housingCapacity()/Math.max(1,g.population)<p.housingTarget&&g.cash>reserve){
    if(g.population>1400&&g.cash>reserve+g.market.towers&&g.landFree()>=2) buy(g,'towers',reserve,1);
    else buy(g,'houses',reserve,3);
  }

  let j=0;
  while(g.employmentCoverage()<p.jobTarget&&g.cash>reserve&&j++<5){
    if(g.population>900&&g.inventory.supermarkets<Math.max(1,Math.floor(g.population/2300))&&g.commerceUtilization('supermarkets')>.48){
      if(!buy(g,'supermarkets',reserve,1)) break;
    }else if(g.commerceUtilization('shops')>.48){
      if(!buy(g,'shops',reserve,1)) break;
    }else break;
  }

  if(g.population>500&&g.educationCoverage()<.72&&g.cash>reserve+400){
    if(g.population>4500&&g.cash>reserve+g.market.universities*1.05) buy(g,'universities',reserve,1);
    else buy(g,'schools',reserve,1);
  }

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

function adaptiveAct(g,_p,objective){
  const earlyGrowth=objective!=='fouryears'&&g.cash<6000;
  const foodTarget=objective==='fouryears'?2.0:(earlyGrowth?1.03:1.55);
  const reserve=earlyGrowth?Math.max(120,g.monthlyMaintenance()*1.1):Math.max(250,g.monthlyMaintenance()*2.0);

  stockFood(g,foodTarget,earlyGrowth?80:150);
  if(g.landFree()<3&&g.cash>reserve+g.market.land) buy(g,'land',reserve,5);

  if(g.housingCapacity()/Math.max(1,g.population)<1.10&&g.cash>reserve){
    if(g.population>1100&&g.cash>reserve+g.market.towers) buy(g,'towers',reserve,1);
    else buy(g,'houses',reserve,3);
  }

  let j=0;
  while(g.employmentCoverage()<.92&&j++<5&&g.cash>reserve){
    if(g.population>800&&g.inventory.supermarkets<Math.max(1,Math.floor(g.population/2300))&&g.commerceUtilization('supermarkets')>.52){
      if(!buy(g,'supermarkets',reserve,1)) break;
    }else if(g.commerceUtilization('shops')>.50){
      if(!buy(g,'shops',reserve,1)) break;
    }else break;
  }

  if(g.population>430&&g.educationCoverage()<.78&&g.cash>reserve+250){
    if(g.population>4200&&g.cash>reserve+g.market.universities) buy(g,'universities',reserve,1);
    else buy(g,'schools',reserve,1);
  }

  let tax=17;
  if(g.cash>7000) tax=objective==='cash'?16:14;
  if(g.cash>25000) tax=objective==='cash'?15:12;
  if(g.cash>80000) tax=objective==='cash'?14:10;
  if(g.approval<35) tax=Math.min(tax,10);
  if(g.approval<24) tax=6;

  const spare=Math.max(0,g.housingCapacity()-g.population);
  let admit=objective==='fouryears'
    ?Math.min(spare,Math.max(3,Math.round(g.population*.045)))
    :Math.min(spare,Math.max(10,Math.round(g.population*(earlyGrowth?.12:.20))));
  if(g.employmentCoverage()<.65) admit=Math.min(admit,Math.max(2,Math.round(g.population*.01)));
  if(g.inventory.food<g.monthlyFoodNeed()*.92) admit=0;
  g.advanceMonth({taxRate:tax,foodAllocation:Math.min(g.inventory.food,g.monthlyFoodNeed()),admitLimit:Math.min(5000,admit)});
}

function run(objective,p,seed,maxMonths,actor=gridAct){
  const {Game}=load(seed);const g=new Game({winCondition:objective});let months=0;
  while(!g.ended&&months<maxMonths){actor(g,p,objective);months++;}
  const need=Math.max(1,g.monthlyFoodNeed());
  return {
    win:!!g.ending?.win, months, pop:g.population, cash:g.cash, approval:g.approval,
    status:g.status(), reason:g.ending?.reason||'timeout',
    diagnostics:{
      housing:g.housingCapacity(), housingRatio:Number((g.housingCapacity()/Math.max(1,g.population)).toFixed(3)),
      jobs:g.jobsCapacity(), employmentCoverage:Number(g.employmentCoverage().toFixed(3)),
      commerceUtilization:Number(g.commerceUtilization().toFixed(3)),
      education:g.schoolCapacity(), educationCoverage:Number(g.educationCoverage().toFixed(3)),
      attractiveness:g.calculateAttractiveness(), food:g.inventory.food, foodNeed:need,
      foodMonths:Number((g.inventory.food/need).toFixed(3)), land:g.inventory.land, landFree:g.landFree(),
      forecast:g.forecast(), inventory:{...g.inventory}
    }
  };
}

function adaptiveSeeds(objective){
  const count=DEEP?24:12;
  const base=10000+objective.length*1000;
  return Array.from({length:count},(_,i)=>base+i*97);
}

const objectives=['fouryears','cash','population','modern'];
const maxParams=PARAMS.length;
const searchSeeds=DEEP?[101,907,2027,4093]:[101,907];
const verifySeeds=DEEP?[101,907,2027,4093,8011,12007,17011,23003]:[101,907,2027,4093];
const maxMonths=objective=>objective==='fouryears'?72:600;
let critical=false;

console.log(`# Multi-strategy planner (${DEEP?'deep':'standard'})`);
for(const objective of objectives){
  const adaptiveRuns=adaptiveSeeds(objective).map(seed=>run(objective,null,seed,maxMonths(objective),adaptiveAct));
  const adaptiveWins=adaptiveRuns.filter(r=>r.win);
  const adaptiveSummary={
    runs:adaptiveRuns.length,
    wins:adaptiveWins.length,
    winRate:Number((adaptiveWins.length/adaptiveRuns.length).toFixed(3)),
    fastestWin:adaptiveWins.length?Math.min(...adaptiveWins.map(r=>r.months)):null,
    sampleWin:adaptiveWins[0]||null
  };

  const candidates=[];
  let bestFailed=null;
  for(let i=0;i<maxParams;i++){
    const p=PARAMS[i];
    let searchWins=0,totalMonths=0;
    for(const seed of searchSeeds){
      const r=run(objective,p,seed,maxMonths(objective));
      if(r.win){searchWins++;totalMonths+=r.months;}
      else if(!bestFailed || r.pop>bestFailed.result.pop || (r.pop===bestFailed.result.pop&&r.cash>bestFailed.result.cash)) bestFailed={params:p,result:r};
    }
    if(searchWins)candidates.push({p,searchWins,avg:totalMonths/searchWins});
  }
  candidates.sort((a,b)=>b.searchWins-a.searchWins||a.avg-b.avg);
  const top=candidates.slice(0,DEEP?10:6);
  let best=null;
  for(const c of top){
    const runs=verifySeeds.map(seed=>run(objective,c.p,seed,maxMonths(objective)));
    const wins=runs.filter(r=>r.win);
    const entry={params:c.p,wins:wins.length,runs:runs.length,winRate:wins.length/runs.length,medianMonths:wins.length?wins.map(x=>x.months).sort((a,b)=>a-b)[Math.floor(wins.length/2)]:null,samples:runs.slice(0,2)};
    if(!best||entry.wins>best.wins||(entry.wins===best.wins&&(entry.medianMonths??9999)<(best.medianMonths??9999)))best=entry;
  }

  const reachable=adaptiveWins.length>0||!!best?.wins;
  console.log(`\n=== ${objective} ===`);
  console.log(JSON.stringify({adaptive:adaptiveSummary,grid:{searched:maxParams,candidateCount:candidates.length,best,bestFailed:candidates.length?undefined:bestFailed},reachable},null,2));
  if(!reachable){console.error(`UNREACHABLE_BY_PLANNER: ${objective}`);critical=true;}
  else if(adaptiveSummary.winRate<.15&&(!best||best.winRate<.25)) console.warn(`LOW_ROBUSTNESS: ${objective} is reachable but highly sensitive to strategy/random events.`);
}

if(critical) {
  console.error('Planner did not find at least one winning path for every objective.');
  process.exitCode=1;
} else {
  console.log('\nREACHABILITY_OK: every win condition has at least one verified strategy under real game randomness.');
}
