(() => {
'use strict';
const $ = s => document.querySelector(s);
const moneyFmt = n => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const numFmt = n => new Intl.NumberFormat('de-DE').format(Math.round(n));
const monthNames=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const SAVE_KEY='buergermeister2026-save-v1';
const GRID_W=18, GRID_H=14;

const BUILDINGS={
 road:{name:'Straße',emoji:'🛣️',cost:3000,upkeep:40,color:'#59636b',jobs:0,capacity:0,happy:0},
 house:{name:'Wohnhaus',emoji:'🏠',cost:14000,upkeep:55,color:'#d99c58',jobs:0,capacity:28,happy:0},
 apartments:{name:'Mehrfamilienhaus',emoji:'🏢',cost:42000,upkeep:180,color:'#be8761',jobs:0,capacity:95,happy:-1},
 shop:{name:'Geschäft',emoji:'🏪',cost:28000,upkeep:120,color:'#d68a45',jobs:35,capacity:0,happy:1},
 factory:{name:'Gewerbe',emoji:'🏭',cost:65000,upkeep:260,color:'#9a8b78',jobs:120,capacity:0,happy:-4},
 park:{name:'Park',emoji:'🌳',cost:18000,upkeep:90,color:'#4f8b4d',jobs:3,capacity:0,happy:5},
 kindergarten:{name:'Kita',emoji:'🧸',cost:85000,upkeep:1250,color:'#e4b75f',jobs:22,capacity:0,happy:5,service:'education'},
 school:{name:'Schule',emoji:'🏫',cost:180000,upkeep:3200,color:'#b37a55',jobs:55,capacity:0,happy:7,service:'education'},
 fire:{name:'Feuerwehr',emoji:'🚒',cost:120000,upkeep:2600,color:'#b94d47',jobs:28,capacity:0,happy:6,service:'safety'},
 clinic:{name:'Gesundheitszentrum',emoji:'🏥',cost:210000,upkeep:4200,color:'#d8dee5',jobs:75,capacity:0,happy:8,service:'health'},
 solar:{name:'Solarpark',emoji:'☀️',cost:95000,upkeep:400,color:'#4e84a8',jobs:8,capacity:0,happy:3,service:'energy'},
 townhall:{name:'Rathaus',emoji:'🏛️',cost:0,upkeep:5200,color:'#d0b17b',jobs:38,capacity:0,happy:2,unique:true}
};

const EVENTS=[
 {title:'Starkregen',text:'Mehrere Straßen stehen unter Wasser. Der Bauhof benötigt zusätzliche Mittel.',choices:[
   {label:'Soforthilfe bereitstellen',detail:'25.000 € Kosten, Zufriedenheit +5',apply:s=>{s.money-=25000;s.happiness+=5;s.approval+=3}},
   {label:'Nur Gefahrenstellen sichern',detail:'8.000 € Kosten, Zufriedenheit -2',apply:s=>{s.money-=8000;s.happiness-=2;s.approval-=1}}
 ]},
 {title:'Förderprogramm Radverkehr',text:'Das Land fördert nachhaltige kommunale Infrastruktur.',choices:[
   {label:'Förderung beantragen',detail:'40.000 € Zuschuss, Umwelt +3',apply:s=>{s.money+=40000;s.environment+=3}},
   {label:'Nicht teilnehmen',detail:'Keine unmittelbaren Folgen',apply:s=>{}}
 ]},
 {title:'Unternehmen sucht Standort',text:'Ein mittelständischer Betrieb möchte sich in deiner Gemeinde ansiedeln.',choices:[
   {label:'Gewerbesteuer-Rabatt gewähren',detail:'Jobs +80, zunächst 15.000 € Kosten',apply:s=>{s.money-=15000;s.bonusJobs+=80;s.happiness+=2}},
   {label:'Reguläre Konditionen',detail:'20.000 € Einnahmen, Zufriedenheit -1',apply:s=>{s.money+=20000;s.happiness-=1}}
 ]},
 {title:'Jugendrat fordert Treffpunkt',text:'Jugendliche wünschen sich einen modernen Treffpunkt und mehr Freizeitangebote.',choices:[
   {label:'Projekt finanzieren',detail:'35.000 € Kosten, Zufriedenheit +6',apply:s=>{s.money-=35000;s.happiness+=6;s.approval+=4}},
   {label:'Auf später verschieben',detail:'Zufriedenheit -4',apply:s=>{s.happiness-=4;s.approval-=3}}
 ]},
 {title:'Defekte Hauptleitung',text:'Ein alter Leitungsabschnitt muss dringend repariert werden.',choices:[
   {label:'Komplett erneuern',detail:'55.000 € Kosten, Versorgung langfristig +5',apply:s=>{s.money-=55000;s.infrastructure+=5;s.happiness+=2}},
   {label:'Nur reparieren',detail:'18.000 € Kosten, Risiko bleibt',apply:s=>{s.money-=18000;s.infrastructure-=1}}
 ]}
];

function emptyGrid(){return Array.from({length:GRID_H},()=>Array(GRID_W).fill(null));}
function starterState(){
 const g=emptyGrid();
 for(let x=2;x<16;x++) g[7][x]={type:'road'};
 for(let y=3;y<12;y++) g[y][8]={type:'road'};
 g[6][7]={type:'townhall'};g[5][5]={type:'house'};g[5][6]={type:'house'};g[8][5]={type:'house'};g[8][6]={type:'house'};g[4][10]={type:'house'};g[9][11]={type:'shop'};g[5][11]={type:'park'};
 return {version:1,cityName:'Musterstadt',year:2026,month:0,money:350000,population:850,happiness:65,approval:62,environment:55,infrastructure:58,bonusJobs:0,grid:g,selected:'road',speed:1,monthsPlayed:0,lastEvent:0,eventLog:[],electionsWon:0,gameOver:false,stats:{income:0,expenses:0,balance:0,tax:0,business:0,fees:0},objectives:{pop1500:false,happy75:false,balance:false,services:false}};
}
let state=load()||starterState();

const canvas=$('#gameCanvas'),ctx=canvas.getContext('2d');
let view={scale:1,offsetX:0,offsetY:0};
let dragging=false,lastPointer=null;
let lastTick=performance.now(),toastTimer=null;

function save(){localStorage.setItem(SAVE_KEY,JSON.stringify(state));}
function load(){try{const s=JSON.parse(localStorage.getItem(SAVE_KEY));return s&&s.version===1?s:null}catch{return null}}
function resetGame(){state=starterState();save();fitMap();renderPanel('overview');showToast('Neues Spiel gestartet');}

function counts(){const c={};for(const row of state.grid)for(const cell of row)if(cell)c[cell.type]=(c[cell.type]||0)+1;return c;}
function metrics(){
 const c=counts();let capacity=0,jobs=state.bonusJobs,upkeep=0,happyMod=0;
 for(const [t,n] of Object.entries(c)){const b=BUILDINGS[t];capacity+=b.capacity*n;jobs+=b.jobs*n;upkeep+=b.upkeep*n;happyMod+=b.happy*n;}
 const employed=Math.min(state.population,Math.max(0,jobs));
 const unemployment=state.population?Math.max(0,100-employed/state.population*100):0;
 const tax=Math.round(state.population*31);
 const business=Math.round((c.shop||0)*3200+(c.factory||0)*9800+state.bonusJobs*35);
 const fees=Math.round(state.population*8.5);
 const income=tax+business+fees;
 const expenses=Math.round(upkeep+state.population*5.2);
 const balance=income-expenses;
 const edu=(c.school||0)*900+(c.kindergarten||0)*350;
 const safety=(c.fire||0)*1800;
 const health=(c.clinic||0)*2200;
 const services={education:Math.min(100,edu/Math.max(1,state.population)*100),safety:Math.min(100,safety/Math.max(1,state.population)*100),health:Math.min(100,health/Math.max(1,state.population)*100)};
 return {c,capacity,jobs,unemployment,tax,business,fees,income,expenses,balance,happyMod,services};
}

function simulateMonth(){
 if(state.gameOver)return;
 state.month++;state.monthsPlayed++;
 if(state.month>11){state.month=0;state.year++;}
 const m=metrics();
 state.stats={income:m.income,expenses:m.expenses,balance:m.balance,tax:m.tax,business:m.business,fees:m.fees};
 state.money+=m.balance;
 const demand=Math.max(-20,Math.min(28,Math.round((state.happiness-50)/3 + (m.jobs-state.population)/60)));
 const room=Math.max(0,m.capacity-state.population);
 const delta=Math.max(-Math.ceil(state.population*.02),Math.min(room,demand));
 state.population=Math.max(120,state.population+delta);
 let serviceScore=(m.services.education+m.services.safety+m.services.health)/3;
 let target=50 + Math.min(16,m.happyMod) + (m.unemployment<8?5:m.unemployment>20?-8:0) + (serviceScore>55?5:serviceScore<15?-7:0) + (state.environment-50)/10;
 if(state.money<0)target-=8;
 state.happiness=Math.max(5,Math.min(98,Math.round(state.happiness+(target-state.happiness)*.18)));
 state.approval=Math.max(5,Math.min(98,Math.round(state.approval+(state.happiness-state.approval)*.13+(m.balance>0?.4:-.5))));
 state.infrastructure=Math.max(10,state.infrastructure-.15);
 state.environment=Math.max(10,Math.min(100,state.environment-.03));
 checkObjectives(m);
 if(state.monthsPlayed-state.lastEvent>=5 && Math.random()<.28){state.lastEvent=state.monthsPlayed;triggerEvent();}
 if(state.monthsPlayed>0 && state.monthsPlayed%48===0) election();
 if(state.money<-400000){state.gameOver=true;openModal(`<h2>💸 Gemeinde zahlungsunfähig</h2><p>Der Haushalt ist dauerhaft aus dem Ruder gelaufen. Deine Amtszeit endet.</p><button class="primary" id="restartBtn">Neues Spiel</button>`);setTimeout(()=>$('#restartBtn')?.addEventListener('click',()=>{closeModal();resetGame()}),0)}
 save();updateHUD();if($('#panel').classList.contains('open'))renderPanel($('.dock button.active')?.dataset.panel||'overview');
}
function checkObjectives(m){
 if(state.population>=1500)state.objectives.pop1500=true;
 if(state.happiness>=75)state.objectives.happy75=true;
 if(m.balance>=10000)state.objectives.balance=true;
 if(m.services.education>40&&m.services.safety>40&&m.services.health>40)state.objectives.services=true;
}

function triggerEvent(){
 const ev=EVENTS[Math.floor(Math.random()*EVENTS.length)];
 openModal(`<div class="tag">Ereignis</div><h2>${ev.title}</h2><p>${ev.text}</p>${ev.choices.map((c,i)=>`<button class="choice" data-choice="${i}"><b>${c.label}</b><small>${c.detail}</small></button>`).join('')}`);
 document.querySelectorAll('[data-choice]').forEach(btn=>btn.onclick=()=>{const ch=ev.choices[+btn.dataset.choice];ch.apply(state);state.happiness=Math.max(5,Math.min(98,state.happiness));state.eventLog.unshift({date:`${monthNames[state.month]} ${state.year}`,title:ev.title,choice:ch.label});state.eventLog=state.eventLog.slice(0,20);closeModal();save();updateHUD();showToast('Entscheidung übernommen');});
}
function election(){
 const score=Math.round((state.approval*.6+state.happiness*.4));
 if(score>=50){state.electionsWon++;state.money+=25000;openModal(`<h2>🗳️ Wiedergewählt!</h2><p>Du erreichst <b>${score}%</b>. Die Bürger geben dir eine weitere Amtszeit.</p><p class="good">25.000 € Investitionsbonus wurden freigegeben.</p><button class="primary" id="continueBtn">Weiterregieren</button>`);$('#continueBtn').onclick=closeModal;}
 else{state.gameOver=true;openModal(`<h2>🗳️ Wahl verloren</h2><p>Mit <b>${score}%</b> reicht es nicht für eine weitere Amtszeit.</p><button class="primary" id="restartBtn">Neue Amtszeit starten</button>`);$('#restartBtn').onclick=()=>{closeModal();resetGame()};}
 save();
}

function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.floor(r.width*d);canvas.height=Math.floor(r.height*d);ctx.setTransform(d,0,0,d,0,0);draw();}
function cellSize(){return 52*view.scale}
function fitMap(){const r=canvas.getBoundingClientRect();view.scale=Math.max(.55,Math.min(1.15,Math.min((r.width-40)/(GRID_W*52),(r.height-40)/(GRID_H*52))));view.offsetX=(r.width-GRID_W*52*view.scale)/2;view.offsetY=(r.height-GRID_H*52*view.scale)/2;draw();}
function draw(){
 const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);
 ctx.fillStyle='#29452e';ctx.fillRect(0,0,r.width,r.height);
 const cs=cellSize();
 for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++){
   const px=view.offsetX+x*cs,py=view.offsetY+y*cs;
   ctx.fillStyle=(x+y)%2?'#4d7045':'#517848';ctx.fillRect(px,py,cs+1,cs+1);
   ctx.strokeStyle='rgba(15,35,18,.16)';ctx.strokeRect(px,py,cs,cs);
   const cell=state.grid[y][x];if(cell)drawBuilding(cell.type,px,py,cs,x,y);
 }
}
function drawBuilding(type,px,py,cs,x,y){const b=BUILDINGS[type];if(type==='road'){ctx.fillStyle='#5a6064';ctx.fillRect(px,py+cs*.23,cs,cs*.54);ctx.fillStyle='#d7d08b';ctx.fillRect(px+cs*.08,py+cs*.49,cs*.18,Math.max(1,cs*.035));ctx.fillRect(px+cs*.41,py+cs*.49,cs*.18,Math.max(1,cs*.035));ctx.fillRect(px+cs*.74,py+cs*.49,cs*.18,Math.max(1,cs*.035));return}
 ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(px+cs*.53,py+cs*.77,cs*.30,cs*.12,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=b.color;ctx.fillRect(px+cs*.19,py+cs*.28,cs*.62,cs*.48);ctx.fillStyle='#60442e';ctx.beginPath();ctx.moveTo(px+cs*.12,py+cs*.32);ctx.lineTo(px+cs*.5,py+cs*.08);ctx.lineTo(px+cs*.88,py+cs*.32);ctx.closePath();ctx.fill();
 ctx.font=`${Math.max(13,cs*.31)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.emoji,px+cs*.5,py+cs*.52);
}
function pointerCell(clientX,clientY){const r=canvas.getBoundingClientRect(),cs=cellSize();const x=Math.floor((clientX-r.left-view.offsetX)/cs),y=Math.floor((clientY-r.top-view.offsetY)/cs);return{x,y};}
function validCell(x,y){return x>=0&&y>=0&&x<GRID_W&&y<GRID_H}
function hasRoadAdjacent(x,y){return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>state.grid[y+dy]?.[x+dx]?.type==='road')}
function buildAt(x,y){
 if(!validCell(x,y)||state.gameOver)return;const type=state.selected,b=BUILDINGS[type];
 if(type==='bulldoze'){const old=state.grid[y][x];if(!old||old.type==='townhall'){showToast(old?'Das Rathaus kann nicht abgerissen werden':'Hier steht nichts');return}state.grid[y][x]=null;state.money-=1000;showToast('Gebäude abgerissen (-1.000 €)');save();updateHUD();draw();return}
 if(state.grid[y][x]){showToast('Feld ist bereits belegt');return}
 if(type!=='road'&&!hasRoadAdjacent(x,y)){showToast('Gebäude benötigen eine angrenzende Straße');return}
 if(b.unique&&counts()[type]){showToast(`${b.name} ist bereits vorhanden`);return}
 if(state.money<b.cost){showToast('Nicht genügend Geld');return}
 state.money-=b.cost;state.grid[y][x]={type};if(type==='park')state.environment=Math.min(100,state.environment+2);if(type==='road')state.infrastructure=Math.min(100,state.infrastructure+.3);showToast(`${b.name} gebaut: ${moneyFmt(b.cost)}`);save();updateHUD();draw();renderPanel('build');
}

canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);dragging=true;lastPointer={x:e.clientX,y:e.clientY,moved:false};});
canvas.addEventListener('pointermove',e=>{if(!dragging||!lastPointer)return;const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;if(Math.abs(dx)+Math.abs(dy)>6){view.offsetX+=dx;view.offsetY+=dy;lastPointer={x:e.clientX,y:e.clientY,moved:true};draw();}});
canvas.addEventListener('pointerup',e=>{if(dragging&&lastPointer&&!lastPointer.moved){const c=pointerCell(e.clientX,e.clientY);buildAt(c.x,c.y)}dragging=false;lastPointer=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();const old=view.scale;view.scale=Math.max(.45,Math.min(1.8,view.scale*(e.deltaY<0?1.1:.9)));const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;view.offsetX=mx-(mx-view.offsetX)*(view.scale/old);view.offsetY=my-(my-view.offsetY)*(view.scale/old);draw();},{passive:false});

function updateHUD(){
 $('#cityName').textContent=state.cityName;$('#money').textContent=moneyFmt(state.money);$('#population').textContent=numFmt(state.population);$('#happiness').textContent=`${state.happiness}%`;$('#dateLabel').textContent=`${monthNames[state.month]} ${state.year}`;
 $('#money').className=state.money<0?'bad':'';$('#happiness').className=state.happiness>=70?'good':state.happiness<45?'bad':'';
}
function meter(label,value,colorClass='good'){return `<div class="stat-row"><span>${label}</span><b>${Math.round(value)}%</b></div><div class="meter ${colorClass}" style="color:var(--${colorClass})"><i style="width:${Math.max(0,Math.min(100,value))}%"></i></div>`}
function objective(label,done){return `<div class="card objective"><span>${done?'✅':'⬜'}</span><b>${label}</b><span class="tag">${done?'Erreicht':'Offen'}</span></div>`}
function renderPanel(which){
 document.querySelectorAll('.dock button').forEach(b=>b.classList.toggle('active',b.dataset.panel===which));$('#panel').classList.add('open');const m=metrics();let html='',title='',sub='';
 if(which==='overview'){title='Übersicht';sub='Deine Gemeinde auf einen Blick';html=`<div class="card"><h3>Monatlicher Haushalt</h3><div class="stat-row"><span>Einnahmen</span><b class="good">${moneyFmt(m.income)}</b></div><div class="stat-row"><span>Ausgaben</span><b class="bad">${moneyFmt(m.expenses)}</b></div><div class="stat-row"><span>Saldo</span><b class="${m.balance>=0?'good':'bad'}">${moneyFmt(m.balance)}</b></div></div><div class="card"><h3>Entwicklung</h3><div class="stat-row"><span>Wohnraum</span><b>${numFmt(m.capacity)} Plätze</b></div><div class="stat-row"><span>Arbeitsplätze</span><b>${numFmt(m.jobs)}</b></div><div class="stat-row"><span>Arbeitslosigkeit</span><b>${m.unemployment.toFixed(1)}%</b></div>${meter('Infrastruktur',state.infrastructure,state.infrastructure<40?'bad':'good')}${meter('Umwelt',state.environment,state.environment<40?'bad':'good')}</div><h3>Ziele</h3>${objective('1.500 Einwohner erreichen',state.objectives.pop1500)}${objective('75% Zufriedenheit erreichen',state.objectives.happy75)}${objective('Monatssaldo +10.000 €',state.objectives.balance)}${objective('Grundversorgung ausbauen',state.objectives.services)}`;}
 if(which==='build'){title='Bauen';sub='Wähle ein Projekt und tippe auf die Karte';html=`<div class="grid-buttons">${Object.entries(BUILDINGS).filter(([k])=>k!=='townhall').map(([k,b])=>`<button class="build-btn ${state.selected===k?'selected':''}" data-build="${k}"><span class="emoji">${b.emoji}</span><b>${b.name}</b><small>${moneyFmt(b.cost)} · ${moneyFmt(b.upkeep)}/Monat</small></button>`).join('')}<button class="build-btn ${state.selected==='bulldoze'?'selected':''}" data-build="bulldoze"><span class="emoji">🧨</span><b>Abriss</b><small>1.000 € pro Gebäude</small></button></div>`;}
 if(which==='finance'){title='Finanzen';sub='Kommunaler Haushalt';html=`<div class="card"><h3>Einnahmen</h3><div class="stat-row"><span>Einwohner-/Steueranteil</span><b class="good">${moneyFmt(m.tax)}</b></div><div class="stat-row"><span>Gewerbesteuer</span><b class="good">${moneyFmt(m.business)}</b></div><div class="stat-row"><span>Gebühren</span><b class="good">${moneyFmt(m.fees)}</b></div><div class="stat-row"><b>Gesamt</b><b class="good">${moneyFmt(m.income)}</b></div></div><div class="card"><h3>Ausgaben</h3><div class="stat-row"><span>Betrieb & Personal</span><b class="bad">${moneyFmt(m.expenses)}</b></div><div class="stat-row"><b>Monatssaldo</b><b class="${m.balance>=0?'good':'bad'}">${moneyFmt(m.balance)}</b></div></div><div class="card"><h3>Rücklage</h3><div style="font-size:25px;font-weight:900" class="${state.money>=0?'good':'bad'}">${moneyFmt(state.money)}</div><p class="muted">Negative Rücklagen verschlechtern Zufriedenheit und Wiederwahlchancen.</p></div>`;}
 if(which==='citizens'){title='Einwohner';sub='Bevölkerung, Arbeit und Versorgung';html=`<div class="card"><div class="stat-row"><span>Bevölkerung</span><b>${numFmt(state.population)}</b></div><div class="stat-row"><span>Wohnkapazität</span><b>${numFmt(m.capacity)}</b></div><div class="stat-row"><span>Arbeitsplätze</span><b>${numFmt(m.jobs)}</b></div><div class="stat-row"><span>Arbeitslosigkeit</span><b>${m.unemployment.toFixed(1)}%</b></div></div><div class="card"><h3>Versorgung</h3>${meter('Bildung',m.services.education,m.services.education<35?'warn':'good')}${meter('Sicherheit',m.services.safety,m.services.safety<35?'warn':'good')}${meter('Gesundheit',m.services.health,m.services.health<35?'warn':'good')}</div><div class="card"><h3>Stimmung</h3>${meter('Zufriedenheit',state.happiness,state.happiness<45?'bad':state.happiness<65?'warn':'good')}</div>`;}
 if(which==='politics'){title='Politik';sub='Amtszeit und Wiederwahl';const months=48-(state.monthsPlayed%48||0);html=`<div class="election"><h3>🗳️ Nächste Kommunalwahl</h3><div style="font-size:28px;font-weight:900">in ${months} Monaten</div><p>Aktuelle Zustimmung: <b>${state.approval}%</b></p>${meter('Wahlprognose',state.approval,state.approval<50?'bad':state.approval<60?'warn':'good')}</div><div class="card"><div class="stat-row"><span>Gewonnene Wahlen</span><b>${state.electionsWon}</b></div><div class="stat-row"><span>Amtszeit</span><b>${state.monthsPlayed} Monate</b></div></div><div class="card"><h3>Bürgermeisterbüro</h3><div class="toolbar-row"><button class="secondary" id="renameBtn">Gemeinde umbenennen</button><button class="danger" id="newGameBtn">Neues Spiel</button></div></div>`;}
 if(which==='events'){title='Ereignisse';sub='Deine politischen Entscheidungen';html=state.eventLog.length?state.eventLog.map(e=>`<div class="card"><div class="tag">${e.date}</div><h3>${e.title}</h3><div class="muted">${e.choice}</div></div>`).join(''):`<div class="card"><p>Noch keine besonderen Ereignisse. Im Laufe der Amtszeit erscheinen neue Entscheidungen.</p></div>`;}
 $('#panelTitle').textContent=title;$('#panelSubtitle').textContent=sub;$('#panelContent').innerHTML=html;
 document.querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.build;renderPanel('build');showToast(`${b.querySelector('b')?.textContent||'Werkzeug'} ausgewählt`)});
 $('#newGameBtn')?.addEventListener('click',()=>openModal(`<h2>Neues Spiel?</h2><p>Der aktuelle lokale Spielstand wird ersetzt.</p><div class="toolbar-row"><button class="danger" id="confirmReset">Neu starten</button><button class="secondary" id="cancelReset">Abbrechen</button></div>`));
 setTimeout(()=>{if($('#confirmReset')){$('#confirmReset').onclick=()=>{closeModal();resetGame()};$('#cancelReset').onclick=closeModal}},0);
 $('#renameBtn')?.addEventListener('click',()=>{const n=prompt('Name deiner Gemeinde:',state.cityName);if(n&&n.trim()){state.cityName=n.trim().slice(0,24);save();updateHUD();renderPanel('politics')}});
}
function showToast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1800)}
function openModal(html){$('#modalContent').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden')}

$('.dock').addEventListener('click',e=>{const b=e.target.closest('button[data-panel]');if(b)renderPanel(b.dataset.panel)});$('#closePanel').onclick=()=>$('#panel').classList.remove('open');$('#menuBtn').onclick=()=>renderPanel('overview');
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{state.speed=+b.dataset.speed;document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('active',x===b));save()});

function loop(now){const interval=state.speed===2?1800:state.speed===1?3600:Infinity;if(now-lastTick>interval){lastTick=now;simulateMonth()}draw();requestAnimationFrame(loop)}
window.addEventListener('resize',()=>{resize();fitMap()});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();showToast('Die App kann über das Browsermenü installiert werden')});
if('serviceWorker' in navigator)navigator.serviceWorker.register('service-worker.js').catch(()=>{});
updateHUD();resize();fitMap();renderPanel('overview');requestAnimationFrame(loop);
})();
