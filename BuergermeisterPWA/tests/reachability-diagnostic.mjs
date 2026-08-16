import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function rng(seed){ let a=seed>>>0; return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}; }

function engine(seed){
  let s=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
  s=s.replace("const app = document.getElementById('app');",'const app = null;');
  s=s.replace(/saveGame\(this\);\s*renderGame\(this(?:,\s*true)?\);/g,';');
  s=s.replace(/addScore\(this\);/g,';');
  s=s.replace(/\s*if \('serviceWorker' in navigator\)[\s\S]*?\s*renderHome\(\);\s*\}\)\(\);\s*$/,"\n  globalThis.__TEST__={Game,ITEMS};\n})();\n");
  const m=Object.create(Math); m.random=rng(seed);
  const c=vm.createContext({console,Intl,Date,Math:m});
  vm.runInContext(s,c,{timeout:3000});
  return c.__TEST__;
}

function buy(g,key,reserve=0,max=1){let n=0;while(n<max&&g.canBuy(key)){const cost=g.market[key]*(key==='food'?100:1);if(g.cash-cost<reserve)break;g.buy(key);n++;}return n;}

function stockFood(g,targetMonths,reserveFloor){
  const need=Math.max(1,g.monthlyFoodNeed());
  const target=Math.ceil(need*targetMonths);
  const missing=Math.max(0,target-g.inventory.food);
  const maxBatches=Math.max(1,Math.ceil(missing/100)+2);
  let bought=0;
  while(g.inventory.food<target&&g.canBuy('food')&&bought++<maxBatches){
    const cost=g.market.food*100;
    if(g.cash-cost<reserveFloor&&g.inventory.food>=need) break;
    g.buy('food');
  }
}

function policy(g,objective){
  const need=Math.max(1,g.monthlyFoodNeed());
  const earlyGrowth=objective!=='fouryears'&&g.cash<6000;
  const foodTarget=objective==='fouryears'?2.0:(earlyGrowth?1.03:1.55);
  const reserve=earlyGrowth?Math.max(120,g.monthlyMaintenance()*1.1):Math.max(250,g.monthlyMaintenance()*2.0);

  stockFood(g,foodTarget,earlyGrowth?80:150);

  if(g.landFree()<3&&g.cash>reserve+g.market.land) buy(g,'land',reserve,5);

  const housing=g.housingCapacity()/Math.max(1,g.population);
  if(housing<1.10&&g.cash>reserve){
    if(g.population>1100&&g.cash>reserve+g.market.towers) buy(g,'towers',reserve,1);
    else buy(g,'houses',reserve,3);
  }

  let j=0;
  while(g.employmentCoverage()<.92&&j++<5&&g.cash>reserve){
    if(g.population>800&&g.inventory.supermarkets<Math.max(1,Math.floor(g.population/2300))&&g.commerceUtilization('supermarkets')>.52){if(!buy(g,'supermarkets',reserve,1))break;}
    else if(g.commerceUtilization('shops')>.50){if(!buy(g,'shops',reserve,1))break;}
    else break;
  }

  if(g.population>430&&g.educationCoverage()<.70&&g.cash>reserve+250){
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
  if(g.employmentCoverage()<.65)admit=Math.min(admit,Math.max(2,Math.round(g.population*.01)));
  if(g.inventory.food<g.monthlyFoodNeed()*.92)admit=0;
  g.advanceMonth({taxRate:tax,foodAllocation:Math.min(g.inventory.food,g.monthlyFoodNeed()),admitLimit:admit});
}

function snapshot(g,m){
  const need=Math.max(1,g.monthlyFoodNeed());
  return {
    months:m,pop:g.population,cash:g.cash,approval:g.approval,status:g.status(),ending:g.ending,
    housing:g.housingCapacity(),housingRatio:Number((g.housingCapacity()/Math.max(1,g.population)).toFixed(3)),
    jobs:g.jobsCapacity(),employment:Number(g.employmentCoverage().toFixed(3)),
    commerceUtilization:Number(g.commerceUtilization().toFixed(3)),
    education:g.schoolCapacity(),educationCoverage:Number(g.educationCoverage().toFixed(3)),
    attractiveness:g.calculateAttractiveness(),food:g.inventory.food,foodNeed:need,foodMonths:Number((g.inventory.food/need).toFixed(3)),
    land:g.inventory.land,landFree:g.landFree(),taxRate:g.taxRate,forecast:g.forecast(),inventory:{...g.inventory}
  };
}

for(const objective of ['fouryears','cash','population','modern']){
  const outcomes={win:0,loss:0,timeout:0,reasons:{},samples:[]};
  for(let i=0;i<12;i++){
    const {Game}=engine(10000+i*97+objective.length*1000);
    const g=new Game({winCondition:objective});
    let m=0;
    while(!g.ended&&m<600){policy(g,objective);m++;}
    if(g.ending?.win)outcomes.win++; else if(g.ended){outcomes.loss++;outcomes.reasons[g.ending.reason]=(outcomes.reasons[g.ending.reason]||0)+1;} else outcomes.timeout++;
    outcomes.samples.push(snapshot(g,m));
  }
  console.log('\n===',objective,'===');
  console.log(JSON.stringify(outcomes,null,2));
}
