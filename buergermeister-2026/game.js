(() => {
'use strict';

const $ = s => document.querySelector(s);
const moneyFmt = n => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const numFmt = n => new Intl.NumberFormat('de-DE').format(Math.round(n));
const pct = n => `${Number(n).toFixed(1).replace('.',',')}%`;
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const monthNames=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const SAVE_KEY='buergermeister2026-save-v1';
const GRID_W=18, GRID_H=14;

// Ein Kartenfeld steht für einen ganzen Block / ein Quartier, nicht für ein einzelnes Gebäude.
const BUILDINGS={
 road:{name:'Straße',emoji:'🛣️',cost:25000,opCost:180,color:'#59636b',jobs:0,capacity:0,happy:0,public:true},
 house:{name:'Wohnquartier',emoji:'🏠',cost:45000,opCost:0,color:'#d99c58',jobs:4,capacity:180,happy:0,propertyBase:420000},
 apartments:{name:'Mehrfamilienquartier',emoji:'🏢',cost:120000,opCost:0,color:'#be8761',jobs:8,capacity:420,happy:-1,propertyBase:1050000},
 shop:{name:'Geschäftsviertel',emoji:'🏪',cost:85000,opCost:0,color:'#d68a45',jobs:95,capacity:0,happy:1,propertyBase:760000,tradeBase:52000},
 factory:{name:'Gewerbegebiet',emoji:'🏭',cost:240000,opCost:0,color:'#9a8b78',jobs:330,capacity:0,happy:-4,propertyBase:2100000,tradeBase:185000},
 park:{name:'Park',emoji:'🌳',cost:90000,opCost:950,color:'#4f8b4d',jobs:5,capacity:0,happy:5,public:true,recreation:480},
 kindergarten:{name:'Kita',emoji:'🧸',cost:650000,opCost:22000,color:'#e4b75f',jobs:32,capacity:0,happy:5,public:true,kitaCapacity:350},
 school:{name:'Schule',emoji:'🏫',cost:1600000,opCost:48000,color:'#b37a55',jobs:82,capacity:0,happy:7,public:true,schoolCapacity:800},
 fire:{name:'Feuerwehr',emoji:'🚒',cost:850000,opCost:28000,color:'#b94d47',jobs:45,capacity:0,happy:6,public:true,safetyCapacity:2500},
 clinic:{name:'Gesundheitszentrum',emoji:'🏥',cost:1200000,opCost:45000,color:'#d8dee5',jobs:95,capacity:0,happy:8,public:true,healthCapacity:3000},
 solar:{name:'Solarpark',emoji:'☀️',cost:550000,opCost:3200,color:'#4e84a8',jobs:10,capacity:0,happy:3,public:true,energyRevenue:12500},
 townhall:{name:'Rathaus',emoji:'🏛️',cost:0,opCost:16000,color:'#d0b17b',jobs:42,capacity:0,happy:2,public:true,unique:true}
};

const EVENTS=[
 {title:'Starkregen',text:'Mehrere Straßen stehen unter Wasser. Der Bauhof benötigt zusätzliche Mittel.',choices:[
   {label:'Gründlich sanieren',detail:'75.000 € Sonderausgabe · Infrastruktur +5 · Zustimmung +2',apply:()=>{spendOneOff(75000);state.infrastructure+=5;state.approval+=2}},
   {label:'Nur Gefahrenstellen sichern',detail:'22.000 € Sonderausgabe · Infrastruktur -1 · Zustimmung -2',apply:()=>{spendOneOff(22000);state.infrastructure-=1;state.approval-=2}}
 ]},
 {title:'Förderprogramm Radverkehr',text:'Das Land bietet einen Investitionszuschuss für nachhaltige Mobilität an.',choices:[
   {label:'Förderung beantragen',detail:'120.000 € Zuschuss · Umwelt +3',apply:()=>{receiveOneOff(120000);state.environment+=3}},
   {label:'Nicht teilnehmen',detail:'Keine unmittelbaren Folgen',apply:()=>{}}
 ]},
 {title:'Unternehmen sucht Standort',text:'Ein mittelständischer Betrieb möchte sich in der Region ansiedeln.',choices:[
   {label:'Ansiedlung fördern',detail:'90.000 € Wirtschaftsförderung · +110 Jobs · Wirtschaft +2',apply:()=>{spendOneOff(90000);state.bonusJobs+=110;state.economyIndex+=2}},
   {label:'Keine Sonderkonditionen',detail:'25.000 € einmalige Einnahme · Wirtschaft -1',apply:()=>{receiveOneOff(25000);state.economyIndex-=1}}
 ]},
 {title:'Jugendrat fordert Treffpunkt',text:'Jugendliche wünschen sich einen modernen Treffpunkt und mehr Freizeitangebote.',choices:[
   {label:'Projekt finanzieren',detail:'140.000 € Investition · Zufriedenheit +6',apply:()=>{spendCapital(140000);state.happiness+=6;state.approval+=3}},
   {label:'Auf später verschieben',detail:'Zufriedenheit -4 · Zustimmung -3',apply:()=>{state.happiness-=4;state.approval-=3}}
 ]},
 {title:'Defekte Hauptleitung',text:'Ein alter Leitungsabschnitt muss dringend repariert werden.',choices:[
   {label:'Komplett erneuern',detail:'210.000 € Investition · Infrastruktur +7',apply:()=>{spendCapital(210000);state.infrastructure+=7;state.happiness+=2}},
   {label:'Nur reparieren',detail:'58.000 € Sonderausgabe · Infrastruktur -2',apply:()=>{spendOneOff(58000);state.infrastructure-=2}}
 ]},
 {title:'Kreisumlage steigt',text:'Der Landkreis erhöht vorübergehend seine Umlage. Deine laufenden Ausgaben steigen.',choices:[
   {label:'Haushalt auffangen',detail:'80.000 € Sonderausgabe · Zustimmung stabil',apply:()=>{spendOneOff(80000)}},
   {label:'Leistungen kürzen',detail:'35.000 € Sonderausgabe · Zufriedenheit -5',apply:()=>{spendOneOff(35000);state.happiness-=5;state.approval-=3}}
 ]},
 {title:'Bürgerfest',text:'Vereine schlagen ein großes gemeinsames Bürgerfest vor.',choices:[
   {label:'Fest unterstützen',detail:'28.000 € Sonderausgabe · Zufriedenheit +4 · Zustimmung +3',apply:()=>{spendOneOff(28000);state.happiness+=4;state.approval+=3}},
   {label:'Nicht finanzieren',detail:'Keine Kosten · Zustimmung -1',apply:()=>{state.approval-=1}}
 ]}
];

function emptyGrid(){return Array.from({length:GRID_H},()=>Array(GRID_W).fill(null));}

function starterState(){
 const g=emptyGrid();
 for(let x=2;x<16;x++) g[7][x]={type:'road'};
 for(let y=3;y<12;y++) g[y][8]={type:'road'};
 g[6][7]={type:'townhall'};
 g[5][5]={type:'house'};g[5][6]={type:'house'};g[8][5]={type:'house'};g[8][6]={type:'house'};g[4][10]={type:'house'};
 g[9][11]={type:'shop'};g[5][11]={type:'park'};
 return {
   version:2,cityName:'Musterstadt',year:2026,month:0,money:650000,debt:480000,interestRate:3.4,
   population:850,happiness:65,approval:62,environment:58,infrastructure:64,economyIndex:100,bonusJobs:0,
   taxRates:{property:360,trade:380,fees:100},
   grid:g,selected:'road',speed:1,monthsPlayed:0,lastEvent:0,eventLog:[],electionsWon:0,gameOver:false,
   inflationIndex:1,monthCapital:0,monthOneOff:0,monthFinancing:0,history:[],
   stats:null,objectives:{pop1500:false,happy75:false,balance:false,services:false,debt:false}
 };
}

function migrate(raw){
 if(!raw)return null;
 if(raw.version===2){
   raw.taxRates ||= {property:360,trade:380,fees:100}; raw.debt ??= 0; raw.interestRate ??= 3.4;
   raw.economyIndex ??= 100; raw.inflationIndex ??= 1; raw.monthCapital ??= 0; raw.monthOneOff ??= 0; raw.monthFinancing ??= 0;
   raw.history ||= []; raw.objectives ||= {}; raw.objectives.debt ??= false; return raw;
 }
 if(raw.version===1){
   return {...raw,version:2,debt:0,interestRate:3.4,economyIndex:100,inflationIndex:1,
     taxRates:{property:360,trade:380,fees:100},monthCapital:0,monthOneOff:0,monthFinancing:0,history:[],
     stats:null,objectives:{...(raw.objectives||{}),debt:false}};
 }
 return null;
}

let state=load()||starterState();
const canvas=$('#gameCanvas'),ctx=canvas.getContext('2d');
let view={scale:1,offsetX:0,offsetY:0};
let dragging=false,lastPointer=null;
let lastTick=performance.now(),toastTimer=null;

function save(){localStorage.setItem(SAVE_KEY,JSON.stringify(state));}
function load(){try{return migrate(JSON.parse(localStorage.getItem(SAVE_KEY)))}catch{return null}}
function resetGame(){state=starterState();save();fitMap();renderPanel('overview');showToast('Neues Spiel gestartet');}

function counts(){const c={};for(const row of state.grid)for(const cell of row)if(cell)c[cell.type]=(c[cell.type]||0)+1;return c;}
function sumByBuildings(c,key){let total=0;for(const [t,n] of Object.entries(c))total+=(BUILDINGS[t]?.[key]||0)*n;return total;}

function metrics(){
 const c=counts();
 const population=Math.max(1,state.population);
 const housing=sumByBuildings(c,'capacity');
 const localJobs=sumByBuildings(c,'jobs')+state.bonusJobs;
 const workingAge=Math.round(population*.61);
 // Kleine Gemeinden leben stark von Pendlern: Ein Teil der Einwohner arbeitet außerhalb der Gemeinde.
 const regionalJobs=Math.round(population*.39);
 const employed=Math.min(workingAge,Math.round(localJobs*.72+regionalJobs));
 const unemployed=Math.max(0,workingAge-employed);
 const unemployment=workingAge?unemployed/workingAge*100:0;
 const occupancy=housing?population/housing*100:140;

 const childrenKita=Math.round(population*.055), childrenSchool=Math.round(population*.115);
 const kitaCapacity=120+sumByBuildings(c,'kitaCapacity');
 const schoolCapacity=260+sumByBuildings(c,'schoolCapacity');
 const safetyCapacity=900+sumByBuildings(c,'safetyCapacity');
 const healthCapacity=1200+sumByBuildings(c,'healthCapacity');
 const recreationCapacity=150+sumByBuildings(c,'recreation');
 const services={
   kita:clamp(kitaCapacity/Math.max(1,childrenKita)*100,0,100),
   school:clamp(schoolCapacity/Math.max(1,childrenSchool)*100,0,100),
   safety:clamp(safetyCapacity/population*100,0,100),
   health:clamp(healthCapacity/population*100,0,100),
   recreation:clamp(recreationCapacity/population*100,0,100)
 };
 services.education=(services.kita+services.school)/2;
 services.average=(services.education+services.safety+services.health+services.recreation)/4;

 const economy=state.economyIndex/100;
 const inflation=state.inflationIndex;
 const propertyFactor=state.taxRates.property/360;
 const tradeFactor=state.taxRates.trade/380;
 const feeFactor=state.taxRates.fees/100;
 const propertyBase=sumByBuildings(c,'propertyBase');
 const tradeBase=sumByBuildings(c,'tradeBase')+state.bonusJobs*520;

 // Monatliche kommunale Erträge: bewusst als Spielmodell, aber kausal aus Steuerbasis und Hebesätzen berechnet.
 const incomeTax=Math.round(population*91*economy*inflation);
 const propertyTax=Math.round(propertyBase*0.00072*propertyFactor*inflation);
 const tradeTax=Math.round(tradeBase/12*tradeFactor*economy*inflation);
 const fees=Math.round(population*17.5*feeFactor*inflation);
 const transfers=Math.round(population*(27+(100-state.economyIndex)*0.13)*inflation);
 const energyRevenue=Math.round(sumByBuildings(c,'energyRevenue')*inflation);
 const income=incomeTax+propertyTax+tradeTax+fees+transfers+energyRevenue;

 const publicOps=Math.round(sumByBuildings(c,'opCost')*inflation);
 const administration=Math.round((22000+population*34)*inflation);
 const social=Math.round(population*26*inflation);
 const infrastructureCost=Math.round(((c.road||0)*460+population*8.5)*inflation*(1+(70-state.infrastructure)/220));
 const countyLevy=Math.round((incomeTax+tradeTax+propertyTax)*0.235);
 const interest=Math.round(state.debt*(state.interestRate/100)/12);
 const principal=Math.min(state.debt,Math.round(state.debt*0.0022));
 const expenses=publicOps+administration+social+infrastructureCost+countyLevy+interest+principal;
 const balance=income-expenses;

 const taxPressure=clamp((state.taxRates.property-360)/20+(state.taxRates.trade-380)/22+(state.taxRates.fees-100)/5,-12,18);
 const roomRatio=housing?clamp((housing-population)/population*100,-30,60):-30;
 const jobScore=unemployment<5?8:unemployment<9?5:unemployment<14?1:unemployment<20?-5:-10;
 const serviceScore=(services.average-55)*0.24;
 const financeScore=balance>=0?clamp(balance/15000,0,6):-clamp(Math.abs(balance)/12000,0,9);
 const housingScore=roomRatio>18?6:roomRatio>5?3:roomRatio>=0?0:-8;
 const attractiveness=clamp(50+(state.happiness-60)*.35+jobScore+serviceScore+financeScore+housingScore+(state.infrastructure-60)*.12+(state.environment-55)*.08-taxPressure*.45,5,95);

 const annualForecast=balance*12;
 const debtPerCapita=state.debt/population;
 const liquidityMonths=expenses?state.money/expenses:0;
 return {c,housing,localJobs,workingAge,employed,unemployed,unemployment,occupancy,services,
   incomeTax,propertyTax,tradeTax,fees,transfers,energyRevenue,income,
   publicOps,administration,social,infrastructureCost,countyLevy,interest,principal,expenses,balance,annualForecast,
   propertyBase,tradeBase,taxPressure,attractiveness,debtPerCapita,liquidityMonths};
}

function spendCapital(amount){state.money-=amount;state.monthCapital+=amount;}
function spendOneOff(amount){state.money-=amount;state.monthOneOff-=amount;}
function receiveOneOff(amount){state.money+=amount;state.monthOneOff+=amount;}

function simulateMonth(){
 if(state.gameOver)return;
 const bookedDate=`${monthNames[state.month]} ${state.year}`;
 const m=metrics();

 // Laufender Haushalt wird zum Monatsende verbucht. Investitionen/Ereignisse wurden bereits sofort aus der Kasse gezahlt.
 state.money+=m.balance;
 state.debt=Math.max(0,state.debt-m.principal);
 const cashChange=m.balance-state.monthCapital+state.monthOneOff+state.monthFinancing;
 state.stats={date:bookedDate,...m,capital:state.monthCapital,oneOff:state.monthOneOff,financing:state.monthFinancing,cashChange};
 state.history.push({date:bookedDate,income:m.income,expenses:m.expenses,balance:m.balance,capital:state.monthCapital,oneOff:state.monthOneOff,cashChange,money:state.money,debt:state.debt});
 state.history=state.history.slice(-24);
 state.monthCapital=0;state.monthOneOff=0;state.monthFinancing=0;

 // Liquiditätsproblem => automatischer Kassenkredit statt magischer negativer Kasse.
 if(state.money<0){
   const draw=Math.ceil((-state.money+50000)/25000)*25000;
   state.debt+=draw;state.money+=draw;state.approval-=2;
   state.eventLog.unshift({date:bookedDate,title:'Kassenkredit nötig',choice:`${moneyFmt(draw)} automatisch aufgenommen`});
 }

 // Bevölkerung reagiert auf Wohnraum, Arbeitsmarkt, Leistungen, Steuern und allgemeine Attraktivität.
 const refreshed=metrics();
 let migration=Math.round(state.population*(refreshed.attractiveness-50)/1600);
 if(refreshed.occupancy>98)migration=Math.min(migration,-Math.max(1,Math.round(state.population*.002)));
 if(refreshed.housing>state.population)migration=Math.min(migration,Math.max(1,Math.round((refreshed.housing-state.population)*.075)));
 migration=clamp(migration,-Math.ceil(state.population*.018),Math.ceil(state.population*.022));
 state.population=Math.max(120,state.population+migration);

 // Konjunktur reagiert träge; Hebesätze, Infrastruktur und Stimmung wirken auf Unternehmensentwicklung.
 const economyTarget=100+(state.infrastructure-60)*.13+(state.happiness-60)*.09-(state.taxRates.trade-380)*.025+(refreshed.services.average-55)*.04;
 state.economyIndex=clamp(state.economyIndex+(economyTarget-state.economyIndex)*.10+(Math.random()-.5)*1.1,75,125);

 const servicePenalty=refreshed.services.average<45?(45-refreshed.services.average)*.24:0;
 const jobPenalty=refreshed.unemployment>12?(refreshed.unemployment-12)*.35:0;
 const financePenalty=refreshed.balance<0?clamp(Math.abs(refreshed.balance)/18000,0,8):0;
 const debtPenalty=refreshed.debtPerCapita>1600?clamp((refreshed.debtPerCapita-1600)/450,0,6):0;
 const taxPenalty=Math.max(0,refreshed.taxPressure*.35);
 const targetHappiness=clamp(62+(state.environment-55)*.12+(state.infrastructure-60)*.16+(refreshed.services.average-55)*.20-jobPenalty-financePenalty-debtPenalty-taxPenalty,20,92);
 state.happiness=clamp(Math.round(state.happiness+(targetHappiness-state.happiness)*.16),5,98);
 state.approval=clamp(Math.round(state.approval+(state.happiness-state.approval)*.10+(refreshed.balance>=0?.5:-.7)-(state.taxRates.trade>440?.25:0)),5,98);

 // Infrastruktur altert abhängig von Netzgröße und Finanzlage.
 const decay=.18+(refreshed.c.road||0)*.006+(state.money<refreshed.expenses*2?.08:0);
 state.infrastructure=clamp(state.infrastructure-decay,10,100);
 state.environment=clamp(state.environment-.035+(refreshed.c.park||0)*.012-(refreshed.c.factory||0)*.02,10,100);

 state.month++;state.monthsPlayed++;
 if(state.month>11){state.month=0;state.year++;state.inflationIndex*=1.021;state.interestRate=clamp(state.interestRate+(Math.random()-.5)*.3,2.2,5.8);}

 checkObjectives(refreshed);
 if(state.monthsPlayed-state.lastEvent>=4 && Math.random()<.30){state.lastEvent=state.monthsPlayed;triggerEvent();}
 if(state.monthsPlayed>0 && state.monthsPlayed%48===0)election();
 if(state.debt>4500000&&state.money<100000){state.gameOver=true;openModal(`<h2>💸 Haushalt unter Aufsicht</h2><p>Die Verschuldung ist außer Kontrolle geraten. Deine politische Handlungsfähigkeit endet.</p><button class="primary" id="restartBtn">Neues Spiel</button>`);setTimeout(()=>$('#restartBtn')?.addEventListener('click',()=>{closeModal();resetGame()}),0)}
 save();updateHUD();if($('#panel').classList.contains('open'))renderPanel($('.dock button.active')?.dataset.panel||'overview');
}

function checkObjectives(m){
 if(state.population>=1500)state.objectives.pop1500=true;
 if(state.happiness>=75)state.objectives.happy75=true;
 if(m.balance>=25000)state.objectives.balance=true;
 if(m.services.education>70&&m.services.safety>70&&m.services.health>70)state.objectives.services=true;
 if(state.debt===0)state.objectives.debt=true;
}

function triggerEvent(){
 const ev=EVENTS[Math.floor(Math.random()*EVENTS.length)];
 openModal(`<div class="tag">Ereignis</div><h2>${ev.title}</h2><p>${ev.text}</p>${ev.choices.map((c,i)=>`<button class="choice" data-choice="${i}"><b>${c.label}</b><small>${c.detail}</small></button>`).join('')}`);
 document.querySelectorAll('[data-choice]').forEach(btn=>btn.onclick=()=>{
   const ch=ev.choices[+btn.dataset.choice];ch.apply();
   state.happiness=clamp(state.happiness,5,98);state.approval=clamp(state.approval,5,98);state.infrastructure=clamp(state.infrastructure,10,100);state.environment=clamp(state.environment,10,100);state.economyIndex=clamp(state.economyIndex,75,125);
   state.eventLog.unshift({date:`${monthNames[state.month]} ${state.year}`,title:ev.title,choice:ch.label});state.eventLog=state.eventLog.slice(0,25);
   closeModal();save();updateHUD();renderPanel('events');showToast('Entscheidung übernommen');
 });
}

function election(){
 const m=metrics();
 const financial=clamp(55+(m.balance/5000)-(m.debtPerCapita/100),20,80);
 const score=Math.round(state.approval*.48+state.happiness*.32+financial*.20);
 if(score>=50){state.electionsWon++;receiveOneOff(90000);openModal(`<h2>🗳️ Wiedergewählt!</h2><p>Du erreichst <b>${score}%</b>. Zufriedenheit, Haushaltslage und Verschuldung fließen jetzt gemeinsam in das Ergebnis ein.</p><p class="good">90.000 € Investitionspauschale wurden freigegeben.</p><button class="primary" id="continueBtn">Weiterregieren</button>`);$('#continueBtn').onclick=closeModal;}
 else{state.gameOver=true;openModal(`<h2>🗳️ Wahl verloren</h2><p>Mit <b>${score}%</b> reicht es nicht. Besonders Haushalt, Schulden und Bürgerzufriedenheit beeinflussen die Wahl.</p><button class="primary" id="restartBtn">Neue Amtszeit starten</button>`);$('#restartBtn').onclick=()=>{closeModal();resetGame()};}
 save();
}

function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.floor(r.width*d);canvas.height=Math.floor(r.height*d);ctx.setTransform(d,0,0,d,0,0);draw();}
function cellSize(){return 52*view.scale}
function fitMap(){const r=canvas.getBoundingClientRect();view.scale=Math.max(.55,Math.min(1.15,Math.min((r.width-40)/(GRID_W*52),(r.height-40)/(GRID_H*52))));view.offsetX=(r.width-GRID_W*52*view.scale)/2;view.offsetY=(r.height-GRID_H*52*view.scale)/2;draw();}
function draw(){
 const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);ctx.fillStyle='#29452e';ctx.fillRect(0,0,r.width,r.height);
 const cs=cellSize();
 for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++){
   const px=view.offsetX+x*cs,py=view.offsetY+y*cs;ctx.fillStyle=(x+y)%2?'#4d7045':'#517848';ctx.fillRect(px,py,cs+1,cs+1);ctx.strokeStyle='rgba(15,35,18,.16)';ctx.strokeRect(px,py,cs,cs);
   const cell=state.grid[y][x];if(cell)drawBuilding(cell.type,px,py,cs);
 }
}
function drawBuilding(type,px,py,cs){
 const b=BUILDINGS[type];if(!b)return;
 if(type==='road'){ctx.fillStyle='#5a6064';ctx.fillRect(px,py+cs*.23,cs,cs*.54);ctx.fillStyle='#d7d08b';for(const o of [.08,.41,.74])ctx.fillRect(px+cs*o,py+cs*.49,cs*.18,Math.max(1,cs*.035));return}
 ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(px+cs*.53,py+cs*.77,cs*.30,cs*.12,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=b.color;ctx.fillRect(px+cs*.19,py+cs*.28,cs*.62,cs*.48);ctx.fillStyle='#60442e';ctx.beginPath();ctx.moveTo(px+cs*.12,py+cs*.32);ctx.lineTo(px+cs*.5,py+cs*.08);ctx.lineTo(px+cs*.88,py+cs*.32);ctx.closePath();ctx.fill();
 ctx.font=`${Math.max(13,cs*.31)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.emoji,px+cs*.5,py+cs*.52);
}
function pointerCell(clientX,clientY){const r=canvas.getBoundingClientRect(),cs=cellSize();return{x:Math.floor((clientX-r.left-view.offsetX)/cs),y:Math.floor((clientY-r.top-view.offsetY)/cs)}}
function validCell(x,y){return x>=0&&y>=0&&x<GRID_W&&y<GRID_H}
function hasRoadAdjacent(x,y){return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>state.grid[y+dy]?.[x+dx]?.type==='road')}

function buildAt(x,y){
 if(!validCell(x,y)||state.gameOver)return;
 const type=state.selected;
 if(type==='bulldoze'){
   const old=state.grid[y][x];if(!old||old.type==='townhall'){showToast(old?'Das Rathaus kann nicht abgerissen werden':'Hier steht nichts');return}
   state.grid[y][x]=null;spendCapital(12000);showToast('Abriss und Rückbau: 12.000 €');save();updateHUD();draw();return;
 }
 const b=BUILDINGS[type];if(!b)return;
 if(state.grid[y][x]){showToast('Feld ist bereits belegt');return}
 if(type!=='road'&&!hasRoadAdjacent(x,y)){showToast('Projekt benötigt eine angrenzende Straße');return}
 if(b.unique&&counts()[type]){showToast(`${b.name} ist bereits vorhanden`);return}
 if(state.money<b.cost){showToast('Liquidität reicht nicht – Finanzierung prüfen');return}
 spendCapital(b.cost);state.grid[y][x]={type};
 if(type==='park')state.environment=clamp(state.environment+2,10,100);if(type==='road')state.infrastructure=clamp(state.infrastructure+.5,10,100);
 showToast(`${b.name} gebaut: ${moneyFmt(b.cost)}`);save();updateHUD();draw();renderPanel('build');
}

canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);dragging=true;lastPointer={x:e.clientX,y:e.clientY,moved:false};});
canvas.addEventListener('pointermove',e=>{if(!dragging||!lastPointer)return;const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;if(Math.abs(dx)+Math.abs(dy)>6){view.offsetX+=dx;view.offsetY+=dy;lastPointer={x:e.clientX,y:e.clientY,moved:true};draw();}});
canvas.addEventListener('pointerup',e=>{if(dragging&&lastPointer&&!lastPointer.moved){const c=pointerCell(e.clientX,e.clientY);buildAt(c.x,c.y)}dragging=false;lastPointer=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();const old=view.scale;view.scale=clamp(view.scale*(e.deltaY<0?1.1:.9),.45,1.8);const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;view.offsetX=mx-(mx-view.offsetX)*(view.scale/old);view.offsetY=my-(my-view.offsetY)*(view.scale/old);draw();},{passive:false});

function updateHUD(){
 $('#cityName').textContent=state.cityName;$('#money').textContent=moneyFmt(state.money);$('#population').textContent=numFmt(state.population);$('#happiness').textContent=`${state.happiness}%`;$('#dateLabel').textContent=`${monthNames[state.month]} ${state.year}`;
 $('#money').className=state.money<100000?'bad':state.money<250000?'warn':'';$('#happiness').className=state.happiness>=70?'good':state.happiness<45?'bad':'';
}
function meter(label,value,colorClass='good'){return `<div class="stat-row"><span>${label}</span><b>${Math.round(value)}%</b></div><div class="meter ${colorClass}" style="color:var(--${colorClass})"><i style="width:${clamp(value,0,100)}%"></i></div>`}
function objective(label,done){return `<div class="card objective"><span>${done?'✅':'⬜'}</span><b>${label}</b><span class="tag">${done?'Erreicht':'Offen'}</span></div>`}
function rateControl(label,key,value,unit=''){return `<div class="card"><h3>${label}</h3><div class="stat-row"><span>Aktuell</span><b>${value}${unit}</b></div><div class="toolbar-row"><button class="secondary" data-tax="${key}" data-delta="-${key==='fees'?5:20}">−</button><button class="secondary" data-tax="${key}" data-delta="${key==='fees'?5:20}">+</button></div></div>`}

function renderPanel(which){
 document.querySelectorAll('.dock button').forEach(b=>b.classList.toggle('active',b.dataset.panel===which));$('#panel').classList.add('open');
 const m=metrics();let html='',title='',sub='';
 const last=state.stats;

 if(which==='overview'){
   title='Übersicht';sub='Was gerade wirklich in deiner Gemeinde passiert';
   html=`<div class="card"><h3>Haushaltsprognose · ${monthNames[state.month]} ${state.year}</h3><div class="stat-row"><span>Laufende Einnahmen</span><b class="good">${moneyFmt(m.income)}</b></div><div class="stat-row"><span>Laufende Ausgaben</span><b class="bad">${moneyFmt(m.expenses)}</b></div><div class="stat-row"><b>Betriebssaldo</b><b class="${m.balance>=0?'good':'bad'}">${moneyFmt(m.balance)}</b></div><div class="stat-row"><span>Investitionen seit Monatsanfang</span><b class="bad">${moneyFmt(state.monthCapital)}</b></div><div class="stat-row"><span>Proj. Kassenbewegung</span><b class="${m.balance-state.monthCapital+state.monthOneOff+state.monthFinancing>=0?'good':'bad'}">${moneyFmt(m.balance-state.monthCapital+state.monthOneOff+state.monthFinancing)}</b></div></div>
   <div class="card"><h3>Finanzlage</h3><div class="stat-row"><span>Liquide Mittel</span><b>${moneyFmt(state.money)}</b></div><div class="stat-row"><span>Schulden</span><b>${moneyFmt(state.debt)}</b></div><div class="stat-row"><span>Schulden je Einwohner</span><b>${moneyFmt(m.debtPerCapita)}</b></div><div class="stat-row"><span>Jahresprognose Betrieb</span><b class="${m.annualForecast>=0?'good':'bad'}">${moneyFmt(m.annualForecast)}</b></div></div>
   <div class="card"><h3>Entwicklung</h3><div class="stat-row"><span>Attraktivität</span><b>${Math.round(m.attractiveness)}/100</b></div><div class="stat-row"><span>Wohnraum</span><b>${numFmt(state.population)} / ${numFmt(m.housing)}</b></div><div class="stat-row"><span>Lokale Arbeitsplätze</span><b>${numFmt(m.localJobs)}</b></div><div class="stat-row"><span>Arbeitslosigkeit</span><b>${pct(m.unemployment)}</b></div><div class="stat-row"><span>Konjunkturindex</span><b>${state.economyIndex.toFixed(1)}</b></div>${meter('Infrastruktur',state.infrastructure,state.infrastructure<40?'bad':'good')}${meter('Umwelt',state.environment,state.environment<40?'bad':'good')}</div>
   <h3>Ziele</h3>${objective('1.500 Einwohner erreichen',state.objectives.pop1500)}${objective('75% Zufriedenheit erreichen',state.objectives.happy75)}${objective('Betriebssaldo +25.000 €',state.objectives.balance)}${objective('Grundversorgung über 70%',state.objectives.services)}${objective('Schuldenfrei werden',state.objectives.debt)}`;
 }

 if(which==='build'){
   title='Bauen';sub='Investitionen belasten die Kasse sofort, Betriebskosten den Monatshaushalt';
   html=`<div class="card"><div class="stat-row"><span>Verfügbare Liquidität</span><b>${moneyFmt(state.money)}</b></div><div class="stat-row"><span>Aktuelle Monatsinvestitionen</span><b>${moneyFmt(state.monthCapital)}</b></div></div><div class="grid-buttons">${Object.entries(BUILDINGS).filter(([k])=>k!=='townhall').map(([k,b])=>`<button class="build-btn ${state.selected===k?'selected':''}" data-build="${k}"><span class="emoji">${b.emoji}</span><b>${b.name}</b><small>${moneyFmt(b.cost)}${b.opCost?` · ${moneyFmt(b.opCost)}/Monat`:''}${b.capacity?` · ${numFmt(b.capacity)} Wohnen`:''}</small></button>`).join('')}<button class="build-btn ${state.selected==='bulldoze'?'selected':''}" data-build="bulldoze"><span class="emoji">🧨</span><b>Abriss</b><small>12.000 € Rückbau</small></button></div>`;
 }

 if(which==='finance'){
   title='Finanzen';sub='Prognose, Hebesätze, Schulden und tatsächliche Buchungen';
   html=`<div class="card"><h3>Prognose aktueller Monat</h3><div class="stat-row"><span>Einkommensteueranteil</span><b class="good">${moneyFmt(m.incomeTax)}</b></div><div class="stat-row"><span>Grundsteuer</span><b class="good">${moneyFmt(m.propertyTax)}</b></div><div class="stat-row"><span>Gewerbesteuer</span><b class="good">${moneyFmt(m.tradeTax)}</b></div><div class="stat-row"><span>Gebühren</span><b class="good">${moneyFmt(m.fees)}</b></div><div class="stat-row"><span>Zuweisungen</span><b class="good">${moneyFmt(m.transfers)}</b></div><div class="stat-row"><span>Energieerlöse</span><b class="good">${moneyFmt(m.energyRevenue)}</b></div><div class="stat-row"><b>Einnahmen gesamt</b><b class="good">${moneyFmt(m.income)}</b></div></div>
   <div class="card"><h3>Laufende Ausgaben</h3><div class="stat-row"><span>Verwaltung & Personal</span><b class="bad">${moneyFmt(m.administration)}</b></div><div class="stat-row"><span>Kommunale Einrichtungen</span><b class="bad">${moneyFmt(m.publicOps)}</b></div><div class="stat-row"><span>Soziales & Leistungen</span><b class="bad">${moneyFmt(m.social)}</b></div><div class="stat-row"><span>Straßen & Infrastruktur</span><b class="bad">${moneyFmt(m.infrastructureCost)}</b></div><div class="stat-row"><span>Kreisumlage</span><b class="bad">${moneyFmt(m.countyLevy)}</b></div><div class="stat-row"><span>Zinsen</span><b class="bad">${moneyFmt(m.interest)}</b></div><div class="stat-row"><span>Tilgung</span><b class="bad">${moneyFmt(m.principal)}</b></div><div class="stat-row"><b>Ausgaben gesamt</b><b class="bad">${moneyFmt(m.expenses)}</b></div><div class="stat-row"><b>Betriebssaldo</b><b class="${m.balance>=0?'good':'bad'}">${moneyFmt(m.balance)}</b></div></div>
   <div class="card"><h3>Investitionshaushalt</h3><div class="stat-row"><span>Investitionen laufender Monat</span><b class="bad">${moneyFmt(state.monthCapital)}</b></div><div class="stat-row"><span>Sondereffekte</span><b class="${state.monthOneOff>=0?'good':'bad'}">${moneyFmt(state.monthOneOff)}</b></div><p class="muted">Bauprojekte und einmalige Entscheidungen werden sofort aus der Kasse bezahlt und nicht ein zweites Mal im Betriebssaldo abgezogen.</p></div>
   <div class="card"><h3>Schulden & Finanzierung</h3><div class="stat-row"><span>Schuldenstand</span><b>${moneyFmt(state.debt)}</b></div><div class="stat-row"><span>Zinssatz</span><b>${pct(state.interestRate)}</b></div><div class="stat-row"><span>Schulden je Einwohner</span><b>${moneyFmt(m.debtPerCapita)}</b></div><div class="toolbar-row"><button class="secondary" id="borrowBtn">+ 250.000 € Kredit</button><button class="secondary" id="repayBtn">100.000 € tilgen</button></div></div>
   <h3>Steuerpolitik</h3>${rateControl('Grundsteuer-Hebesatz','property',state.taxRates.property,' %')}${rateControl('Gewerbesteuer-Hebesatz','trade',state.taxRates.trade,' %')}${rateControl('Gebührenniveau','fees',state.taxRates.fees,' %')}
   ${last?`<div class="card"><h3>Zuletzt gebucht · ${last.date}</h3><div class="stat-row"><span>Betriebssaldo</span><b class="${last.balance>=0?'good':'bad'}">${moneyFmt(last.balance)}</b></div><div class="stat-row"><span>Investitionen</span><b class="bad">${moneyFmt(last.capital)}</b></div><div class="stat-row"><span>Tatsächliche Kassenänderung</span><b class="${last.cashChange>=0?'good':'bad'}">${moneyFmt(last.cashChange)}</b></div></div>`:''}`;
 }

 if(which==='citizens'){
   title='Einwohner';sub='Wohnraum, Arbeitsmarkt, Versorgung und Wanderungsdruck';
   html=`<div class="card"><div class="stat-row"><span>Bevölkerung</span><b>${numFmt(state.population)}</b></div><div class="stat-row"><span>Wohnkapazität</span><b>${numFmt(m.housing)}</b></div><div class="stat-row"><span>Auslastung Wohnraum</span><b>${pct(m.occupancy)}</b></div><div class="stat-row"><span>Erwerbsfähige</span><b>${numFmt(m.workingAge)}</b></div><div class="stat-row"><span>Lokale Arbeitsplätze</span><b>${numFmt(m.localJobs)}</b></div><div class="stat-row"><span>Arbeitslosigkeit</span><b>${pct(m.unemployment)}</b></div><div class="stat-row"><span>Attraktivität / Zuzug</span><b>${Math.round(m.attractiveness)}/100</b></div></div>
   <div class="card"><h3>Versorgung</h3>${meter('Kita',m.services.kita,m.services.kita<55?'warn':'good')}${meter('Schule',m.services.school,m.services.school<55?'warn':'good')}${meter('Sicherheit',m.services.safety,m.services.safety<55?'warn':'good')}${meter('Gesundheit',m.services.health,m.services.health<55?'warn':'good')}${meter('Freizeit',m.services.recreation,m.services.recreation<55?'warn':'good')}</div><div class="card"><h3>Stimmung</h3>${meter('Zufriedenheit',state.happiness,state.happiness<45?'bad':state.happiness<65?'warn':'good')}</div>`;
 }

 if(which==='politics'){
   title='Politik';sub='Wahlen reagieren nun auch auf Haushalt und Verschuldung';const months=48-(state.monthsPlayed%48||0);
   const financial=clamp(55+(m.balance/5000)-(m.debtPerCapita/100),20,80);const forecast=Math.round(state.approval*.48+state.happiness*.32+financial*.20);
   html=`<div class="election"><h3>🗳️ Nächste Kommunalwahl</h3><div style="font-size:28px;font-weight:900">in ${months} Monaten</div><div class="stat-row"><span>Politische Zustimmung</span><b>${state.approval}%</b></div><div class="stat-row"><span>Finanzbewertung</span><b>${Math.round(financial)}%</b></div><div class="stat-row"><span>Aktuelle Wahlprognose</span><b>${forecast}%</b></div>${meter('Wahlprognose',forecast,forecast<50?'bad':forecast<60?'warn':'good')}</div><div class="card"><div class="stat-row"><span>Gewonnene Wahlen</span><b>${state.electionsWon}</b></div><div class="stat-row"><span>Amtszeit</span><b>${state.monthsPlayed} Monate</b></div></div><div class="card"><h3>Bürgermeisterbüro</h3><div class="toolbar-row"><button class="secondary" id="renameBtn">Gemeinde umbenennen</button><button class="danger" id="newGameBtn">Neues Spiel</button></div></div>`;
 }

 if(which==='events'){
   title='Ereignisse';sub='Entscheidungen und finanzielle Sonderwirkungen';
   html=state.eventLog.length?state.eventLog.map(e=>`<div class="card"><div class="tag">${e.date}</div><h3>${e.title}</h3><div class="muted">${e.choice}</div></div>`).join(''):`<div class="card"><p>Noch keine besonderen Ereignisse. Im Laufe der Amtszeit erscheinen neue Entscheidungen.</p></div>`;
 }

 $('#panelTitle').textContent=title;$('#panelSubtitle').textContent=sub;$('#panelContent').innerHTML=html;
 document.querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.build;renderPanel('build');showToast(`${b.querySelector('b')?.textContent||'Werkzeug'} ausgewählt`)});
 document.querySelectorAll('[data-tax]').forEach(b=>b.onclick=()=>changeTax(b.dataset.tax,+b.dataset.delta));
 $('#borrowBtn')?.addEventListener('click',()=>borrow(250000));$('#repayBtn')?.addEventListener('click',()=>repay(100000));
 $('#newGameBtn')?.addEventListener('click',()=>openModal(`<h2>Neues Spiel?</h2><p>Der aktuelle lokale Spielstand wird ersetzt.</p><div class="toolbar-row"><button class="danger" id="confirmReset">Neu starten</button><button class="secondary" id="cancelReset">Abbrechen</button></div>`));
 setTimeout(()=>{if($('#confirmReset')){$('#confirmReset').onclick=()=>{closeModal();resetGame()};$('#cancelReset').onclick=closeModal}},0);
 $('#renameBtn')?.addEventListener('click',()=>{const n=prompt('Name deiner Gemeinde:',state.cityName);if(n&&n.trim()){state.cityName=n.trim().slice(0,24);save();updateHUD();renderPanel('politics')}});
}

function changeTax(key,delta){
 const ranges={property:[240,620],trade:[260,600],fees:[70,150]};const [min,max]=ranges[key];state.taxRates[key]=clamp(state.taxRates[key]+delta,min,max);save();renderPanel('finance');showToast('Steuerpolitik angepasst – Wirkung ab laufendem Monat');
}
function borrow(amount){state.debt+=amount;state.money+=amount;state.monthFinancing+=amount;state.approval=clamp(state.approval-1,5,98);save();updateHUD();renderPanel('finance');showToast(`${moneyFmt(amount)} Kredit aufgenommen`);}
function repay(amount){const pay=Math.min(amount,state.debt,Math.max(0,state.money-100000));if(pay<25000){showToast('Zu wenig freie Liquidität für Sondertilgung');return}state.debt-=pay;state.money-=pay;state.monthFinancing-=pay;save();updateHUD();renderPanel('finance');showToast(`${moneyFmt(pay)} zusätzlich getilgt`);}
function showToast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2100)}
function openModal(html){$('#modalContent').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden')}

$('.dock').addEventListener('click',e=>{const b=e.target.closest('button[data-panel]');if(b)renderPanel(b.dataset.panel)});$('#closePanel').onclick=()=>$('#panel').classList.remove('open');$('#menuBtn').onclick=()=>renderPanel('overview');
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{state.speed=+b.dataset.speed;document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('active',x===b));save()});

function loop(now){const interval=state.speed===2?2200:state.speed===1?5000:Infinity;if(now-lastTick>interval){lastTick=now;simulateMonth()}draw();requestAnimationFrame(loop)}
window.addEventListener('resize',()=>{resize();fitMap()});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();showToast('Die App kann über das Browsermenü installiert werden')});
if('serviceWorker' in navigator)navigator.serviceWorker.register('service-worker.js').catch(()=>{});
updateHUD();resize();fitMap();renderPanel('overview');requestAnimationFrame(loop);
})();
