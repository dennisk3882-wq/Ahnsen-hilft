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

function policy(g,objective){
  const need=Math.max(1,g.monthlyFoodNeed());
  const reserve=Math.max(250,g.monthlyMaintenance()*2.2);

  let guard=0;
  while(g.inventory.food/Math.max(1,g.monthlyFoodNeed())<2.2&&g.canBuy('food')&&guard++<30){
    const cost=g.market.food*100;
    if(g.cash-cost<150&&g.inventory.food>=need)break;
    g.buy('food');
  }

  if(g.landFree()<4&&g.cash>reserve+g.market.land) buy(g,'land',reserve,4);

  const housing=g.housingCapacity()/Math.max(1,g.population);
  if(housing<1.12&&g.cash>reserve){
    if(g.population>1200&&g.cash>reserve+g.market.towers) buy(g,'towers',reserve,1);
    else buy(g,'houses',reserve,3);
  }

  let j=0;
  while(g.employmentCoverage()<.9&&j++<4&&g.cash>reserve){
    if(g.population>850&&g.inventory.supermarkets<Math.max(1,Math.floor(g.population/2500))&&g.commerceUtilization('supermarkets')>.55){if(!buy(g,'supermarkets',reserve,1))break;}
    else if(g.commerceUtilization('shops')>.52){if(!buy(g,'shops',reserve,1))break;}
    else break;
  }

  if(g.population>450&&g.educationCoverage()<.72&&g.cash>reserve+300){
    if(g.population>4500&&g.cash>reserve+g.market.universities) buy(g,'universities',reserve,1);
    else buy(g,'schools',reserve,1);
  }

  let tax=17;
  if(g.cash>8000) tax=objective==='cash'?15:13;
  if(g.cash>30000) tax=objective==='cash'?14:11;
  if(g.approval<35) tax=Math.min(tax,10);
  if(g.approval<24) tax=6;

  const spare=Math.max(0,g.housingCapacity()-g.population);
  let admit=objective==='fouryears'?Math.min(spare,Math.max(4,Math.round(g.population*.06))):Math.min(spare,Math.max(8,Math.round(g.population*.14)));
  if(g.employmentCoverage()<.65)admit=Math.min(admit,Math.max(2,Math.round(g.population*.01)));
  if(g.inventory.food<g.monthlyFoodNeed()*1.05)admit=0;
  g.advanceMonth({taxRate:tax,foodAllocation:Math.min(g.inventory.food,g.monthlyFoodNeed()),admitLimit:admit});
}

for(const objective of ['fouryears','cash','population','modern']){
  const outcomes={win:0,loss:0,timeout:0,reasons:{},samples:[]};
  for(let i=0;i<12;i++){
    const {Game}=engine(10000+i*97+objective.length*1000);
    const g=new Game({winCondition:objective});
    let m=0;
    while(!g.ended&&m<600){policy(g,objective);m++;}
    if(g.ending?.win)outcomes.win++; else if(g.ended){outcomes.loss++;outcomes.reasons[g.ending.reason]=(outcomes.reasons[g.ending.reason]||0)+1;} else outcomes.timeout++;
    outcomes.samples.push({months:m,pop:g.population,cash:g.cash,approval:g.approval,status:g.status(),ending:g.ending});
  }
  console.log('\n===',objective,'===');
  console.log(JSON.stringify(outcomes,null,2));
}
