(() => {
'use strict';

const $ = s => document.querySelector(s);
const moneyFmt = n => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Math.round(n));
const numFmt = n => new Intl.NumberFormat('de-DE').format(Math.round(n));
const pct = n => `${Math.round(n)}%`;
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const rand = (min,max) => Math.random()*(max-min)+min;
const monthNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const SAVE_KEY = 'buergermeister2026-save-v4';
const LEGACY_SAVE_KEYS = ['buergermeister2026-save-v3','buergermeister2026-save-v2','buergermeister2026-save-v1'];
const GRID_W=18, GRID_H=14;

const BUILDINGS={
 road:{name:'Straße',emoji:'🛣️',cost:12000,upkeep:120,buildMonths:0,jobs:0,capacity:0,happy:0},
 house:{name:'Wohnquartier',emoji:'🏠',cost:150000,upkeep:950,buildMonths:2,jobs:8,capacity:140,happy:1,propertyBase:5200},
 apartments:{name:'Mehrfamilienhäuser',emoji:'🏢',cost:420000,upkeep:2800,buildMonths:4,jobs:18,capacity:380,happy:-1,propertyBase:14500},
 shop:{name:'Ortszentrum',emoji:'🏪',cost:260000,upkeep:1750,buildMonths:3,jobs:95,capacity:0,happy:2,businessBase:9800},
 factory:{name:'Gewerbegebiet',emoji:'🏭',cost:620000,upkeep:4200,buildMonths:5,jobs:230,capacity:0,happy:-5,businessBase:25000},
 park:{name:'Park',emoji:'🌳',cost:90000,upkeep:650,buildMonths:1,jobs:5,capacity:0,happy:6},
 kindergarten:{name:'Kita',emoji:'🧸',cost:680000,upkeep:9600,buildMonths:5,jobs:35,capacity:0,happy:5,service:'education',serviceCapacity:220},
 school:{name:'Schule',emoji:'🏫',cost:1600000,upkeep:22000,buildMonths:8,jobs:70,capacity:0,happy:7,service:'education',serviceCapacity:540},
 fire:{name:'Feuerwehr',emoji:'🚒',cost:920000,upkeep:13500,buildMonths:6,jobs:34,capacity:0,happy:6,service:'safety',serviceCapacity:850},
 clinic:{name:'Gesundheitszentrum',emoji:'🏥',cost:1800000,upkeep:26000,buildMonths:8,jobs:82,capacity:0,happy:8,service:'health',serviceCapacity:1000},
 solar:{name:'Solarpark',emoji:'☀️',cost:360000,upkeep:1600,buildMonths:4,jobs:12,capacity:0,happy:3,energyBase:8500},
 townhall:{name:'Rathaus',emoji:'🏛️',cost:0,upkeep:11000,buildMonths:0,jobs:42,capacity:0,happy:2,unique:true}
};

const PROMISES={
 budget:{title:'Solide Finanzen',desc:'Betriebshaushalt ausgleichen und Schulden beherrschbar halten.'},
 families:{title:'Familienfreundliche Gemeinde',desc:'Bildung, Wohnraum und Zufriedenheit für Familien sichern.'},
 economy:{title:'Arbeitsplätze & Gewerbe',desc:'Wirtschaftsklima stärken und Arbeitslosigkeit niedrig halten.'},
 infrastructure:{title:'Verlässliche Infrastruktur',desc:'Straßen und Sicherheit auf gutem Niveau halten.'},
 climate:{title:'Lebenswerte & grüne Gemeinde',desc:'Umweltqualität erhöhen und erneuerbare Energie ausbauen.'},
 growth:{title:'Gesundes Wachstum',desc:'Bevölkerung steigern, ohne Versorgung und Lebensqualität zu überlasten.'}
};

const ISSUE_DEFS={
 housing:{title:'Wohnraummangel',desc:'Die freien Wohnungen werden knapp.',months:9},
 education:{title:'Bildung überlastet',desc:'Kita- und Schulkapazitäten reichen nicht mehr.',months:8},
 safety:{title:'Sicherheitslücke',desc:'Feuerwehr und Gefahrenabwehr sind unterdimensioniert.',months:8},
 health:{title:'Gesundheitsversorgung kritisch',desc:'Die medizinische Grundversorgung reicht nicht aus.',months:8},
 roads:{title:'Sanierungsstau',desc:'Straßen und Infrastruktur verschlechtern sich sichtbar.',months:10},
 jobs:{title:'Arbeitsmarkt unter Druck',desc:'Zu viele Einwohner finden keine ausreichende Beschäftigung.',months:10},
 deficit:{title:'Strukturelles Haushaltsloch',desc:'Die laufenden Ausgaben liegen dauerhaft über den Einnahmen.',months:9},
 debt:{title:'Verschuldung außer Kontrolle',desc:'Die Pro-Kopf-Verschuldung wird politisch und finanziell kritisch.',months:12},
 trust:{title:'Vertrauenskrise',desc:'Zustimmung und Zufriedenheit fallen auf gefährliche Werte.',months:7}
};

const EVENTS=[
 {id:'rain',title:'Starkregen und Straßenschäden',when:(m,s)=>s.infrastructure<72||Math.random()<.35,text:'Mehrere Straßen und ein Regenwassergraben müssen kurzfristig repariert werden.',choices:[
  {label:'Gründlich sanieren',detail:'120.000 € · Infrastruktur +9 · politisches Kapital +1',apply:s=>{s.money-=120000;s.infrastructure+=9;s.politicalCapital+=1}},
  {label:'Nur Notreparatur',detail:'40.000 € · Infrastruktur +2 · Zustimmung -2',apply:s=>{s.money-=40000;s.infrastructure+=2;s.approval-=2}}
 ]},
 {id:'company',title:'Unternehmen prüft Ansiedlung',when:(m)=>m.businessClimate>48,text:'Ein regionaler Betrieb sucht eine neue Fläche. Er erwartet schnelle Verfahren und gute Erreichbarkeit.',choices:[
  {label:'Ansiedlung aktiv begleiten',detail:'70.000 € · +110 Jobs · Wirtschaft +4 · Verwaltung belastet',apply:s=>{s.money-=70000;s.bonusJobs+=110;s.economy+=4;s.actionPoints=Math.max(0,s.actionPoints-1)}},
  {label:'Keine Sonderbehandlung',detail:'kein Aufwand · Wirtschaftsklima -3',apply:s=>{s.economy-=3;s.councilSupport+=1}}
 ]},
 {id:'parents',title:'Elterninitiative fordert Maßnahmen',when:(m)=>m.serviceLevels.education<75,text:'Eltern kritisieren fehlende Kita- und Schulkapazitäten.',choices:[
  {label:'Übergangslösung finanzieren',detail:'55.000 € · Bildung temporär +12 · Zustimmung +3',apply:s=>{s.money-=55000;s.tempEducationBoost=12;s.tempEducationMonths=8;s.approval+=3}},
  {label:'Auf Neubau verweisen',detail:'kein Geld · Zufriedenheit -4',apply:s=>{s.happiness-=4;s.councilSupport-=2}}
 ]},
 {id:'doctor',title:'Ärztemangel',when:(m)=>m.serviceLevels.health<72,text:'Eine Praxis schließt. Die Gemeinde muss entscheiden, ob sie die Nachfolge unterstützt.',choices:[
  {label:'Niederlassung fördern',detail:'95.000 € · Gesundheit temporär +18 · Wirtschaft +1',apply:s=>{s.money-=95000;s.tempHealthBoost=18;s.tempHealthMonths=12;s.economy+=1}},
  {label:'Markt entscheiden lassen',detail:'Zufriedenheit -5',apply:s=>{s.happiness-=5;s.approval-=2}}
 ]},
 {id:'grant',title:'Förderprogramm Klimaschutz',when:(m)=>m.c.solar===0||m.c.park<2,text:'Das Land fördert kommunale Klima- und Freiraumprojekte.',choices:[
  {label:'Förderung sichern',detail:'+140.000 € zweckfreier Spielzuschuss · Umwelt +2',apply:s=>{s.money+=140000;s.environment+=2}},
  {label:'Verwaltungsaufwand vermeiden',detail:'politisches Kapital +2',apply:s=>{s.politicalCapital+=2}}
 ]},
 {id:'levy',title:'Kreis erhöht Umlage',when:()=>true,text:'Der Landkreis kündigt eine höhere Umlage an. Das belastet den laufenden Haushalt.',choices:[
  {label:'Akzeptieren und einplanen',detail:'Kreisumlage steigt dauerhaft',apply:s=>{s.levyModifier+=1}},
  {label:'Politisch dagegenhalten',detail:'Umlage steigt · Ratsunterstützung +2 · politisches Kapital -3',apply:s=>{s.levyModifier+=1;s.councilSupport+=2;s.politicalCapital-=3}}
 ]},
 {id:'youth',title:'Jugendrat fordert Treffpunkt',when:(m)=>m.leisureScore<20,text:'Jugendliche wünschen sich einen Treffpunkt und bessere Freizeitangebote.',choices:[
  {label:'Sofortprogramm starten',detail:'65.000 € · Zufriedenheit +5 · Umwelt +2',apply:s=>{s.money-=65000;s.happiness+=5;s.environment+=2}},
  {label:'Ablehnen',detail:'Zufriedenheit -4 · Zustimmung -2',apply:s=>{s.happiness-=4;s.approval-=2}}
 ]}
];

function emptyGrid(){return Array.from({length:GRID_H},()=>Array(GRID_W).fill(null));}
function defaultMandate(){return ['budget','families','economy'];}
function baseStarterState(){
 const g=emptyGrid();
 for(let x=2;x<16;x++)g[7][x]={type:'road'};
 for(let y=3;y<12;y++)g[y][8]={type:'road'};
 g[6][7]={type:'townhall'};
 g[6][4]={type:'house'};g[6][5]={type:'house'};g[8][4]={type:'house'};g[8][5]={type:'house'};g[4][9]={type:'house'};
 g[6][10]={type:'shop'};g[8][11]={type:'park'};g[8][10]={type:'kindergarten'};
 return {
  version:4,cityName:'Musterstadt',year:2026,month:0,money:950000,debt:0,interestRate:3.4,inflation:2.0,economy:55,
  population:620,happiness:63,approval:60,councilSupport:58,environment:56,infrastructure:61,bonusJobs:0,levyModifier:0,
  taxRates:{property:100,business:100,fees:100},maintenanceLevel:100,serviceFunding:100,budgetFreezeMonths:0,
  politicalCapital:68,actionPoints:3.5,actionCapacity:3.5,projectLimit:3,taxCooldown:0,policyCooldown:0,
  capitalSpentYear:0,capitalSpentLastYear:0,fiscalHistory:[],grid:g,selected:'inspect',speed:1,monthsPlayed:0,lastEvent:0,eventLog:[],electionsWon:0,
  gameOver:false,termNumber:1,termStartPopulation:620,termStartDebt:0,mandate:defaultMandate(),activeIssues:[],issueCooldowns:{},neglectedIssues:0,
  consecutiveDeficitMonths:0,noConfidenceMonths:0,socialCrisisMonths:0,serviceCrisisMonths:0,infrastructureCrisisMonths:0,oversightLevel:0,
  tempEducationBoost:0,tempEducationMonths:0,tempHealthBoost:0,tempHealthMonths:0,legacyMilestone:false,
  stats:{income:0,expenses:0,operating:0,propertyTax:0,residentShare:0,businessTax:0,fees:0,grants:0,energy:0,admin:0,facilities:0,social:0,roads:0,levy:0,interest:0,repayment:0,attractiveness:0,commuters:0,servicePressure:0,businessClimate:0,families:0,workingAge:0,seniors:0,youth:0,companies:0,accessibility:100,waste:0},
  objectives:{pop1500:false,happy75:false,balance:false,services:false}
 };
}
function normalizeState(raw){
 const base=baseStarterState();const s={...base,...(raw||{})};s.version=4;
 s.taxRates={...base.taxRates,...(raw?.taxRates||{})};s.stats={...base.stats,...(raw?.stats||{})};s.objectives={...base.objectives,...(raw?.objectives||{})};
 s.issueCooldowns={...(raw?.issueCooldowns||{})};s.activeIssues=Array.isArray(raw?.activeIssues)?raw.activeIssues:[];s.mandate=Array.isArray(raw?.mandate)&&raw.mandate.length?raw.mandate:defaultMandate();
 s.grid=Array.isArray(raw?.grid)?raw.grid:base.grid;s.selected=['inspect','bulldoze',...Object.keys(BUILDINGS)].includes(raw?.selected)?raw.selected:'inspect';
 for(const k of ['money','debt','interestRate','inflation','economy','population','happiness','approval','councilSupport','environment','infrastructure','politicalCapital','actionPoints']) if(!Number.isFinite(s[k]))s[k]=base[k];
 return s;
}
function save(){localStorage.setItem(SAVE_KEY,JSON.stringify(state));}
function load(){try{let raw=localStorage.getItem(SAVE_KEY);if(!raw){for(const k of LEGACY_SAVE_KEYS){raw=localStorage.getItem(k);if(raw)break;}}return raw?normalizeState(JSON.parse(raw)):null}catch{return null}}
let state=load()||baseStarterState();

const canvas=$('#gameCanvas'),ctx=canvas.getContext('2d');
let view={scale:1,offsetX:0,offsetY:0},dragging=false,lastPointer=null,lastTick=performance.now(),toastTimer=null;

function resetGame(){state=baseStarterState();save();fitMap();renderPanel('overview');showToast('Neue Amtszeit gestartet');}
function cellKey(x,y){return `${x},${y}`;}
function counts(activeOnly=false){const c={};for(const row of state.grid)for(const cell of row){if(!cell)continue;if(activeOnly&&cell.underConstruction)continue;c[cell.type]=(c[cell.type]||0)+1;}return c;}
function buildingCount(type){let n=0;for(const row of state.grid)for(const cell of row)if(cell?.type===type)n++;return n;}
function constructionProjects(){const a=[];for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++){const c=state.grid[y][x];if(c?.underConstruction)a.push({x,y,...c,name:BUILDINGS[c.type]?.name||c.type});}return a;}
function demographicSnapshot(pop=state.population,attractiveness=state.stats.attractiveness||55){const familyBias=clamp((attractiveness-50)*.002,-.035,.05);const youth=Math.round(pop*clamp(.17+familyBias,.12,.23));const seniors=Math.round(pop*clamp(.22-familyBias*.45,.16,.29));const workingAge=Math.max(0,pop-youth-seniors);return{youth,seniors,workingAge,families:Math.round(pop/2.35)};}

function roadNetwork(){
 const roads=[];for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++)if(state.grid[y][x]?.type==='road'&&!state.grid[y][x]?.underConstruction)roads.push([x,y]);
 const town=[];for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++)if(state.grid[y][x]?.type==='townhall')town.push([x,y]);
 const starts=[];for(const [tx,ty] of town)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(state.grid[ty+dy]?.[tx+dx]?.type==='road')starts.push([tx+dx,ty+dy]);
 if(!starts.length&&roads.length)starts.push(roads[0]);
 const seen=new Set(),q=[...starts];while(q.length){const [x,y]=q.shift(),k=cellKey(x,y);if(seen.has(k))continue;if(state.grid[y]?.[x]?.type!=='road')continue;seen.add(k);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(!seen.has(cellKey(x+dx,y+dy))&&state.grid[y+dy]?.[x+dx]?.type==='road')q.push([x+dx,y+dy]);}
 return seen;
}
function adjacentConnectedRoad(x,y,network=roadNetwork()){return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>network.has(cellKey(x+dx,y+dy)));}
function isAccessible(x,y,network){const cell=state.grid[y]?.[x];if(!cell)return false;if(cell.type==='road')return network.has(cellKey(x,y));if(cell.type==='townhall')return true;return adjacentConnectedRoad(x,y,network);}

function progressConstruction(){const done=[];for(const row of state.grid)for(const cell of row){if(!cell?.underConstruction)continue;cell.monthsLeft=Math.max(0,(cell.monthsLeft||1)-1);if(cell.monthsLeft<=0){cell.underConstruction=false;done.push(BUILDINGS[cell.type]?.name||cell.type);}}if(done.length){state.eventLog.unshift({date:`${monthNames[state.month]} ${state.year}`,title:'Bauprojekte fertiggestellt',choice:[...new Set(done)].join(', ')});state.eventLog=state.eventLog.slice(0,30);showToast(`${done.length} Projekt${done.length===1?'':'e'} fertiggestellt`);}}

function metrics(){
 const c=counts(true),network=roadNetwork();let residentialCapacity=0,localJobs=state.bonusJobs,facilityUpkeepBase=0,happinessMod=0,propertyBase=0,businessBase=0,energyBase=0,leisureScore=0,accessibleBuildings=0,totalBuildings=0,waste=0;
 const serviceCapacity={education:0,safety:0,health:0};
 for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++){
  const cell=state.grid[y][x];if(!cell||cell.underConstruction||cell.type==='road')continue;const b=BUILDINGS[cell.type];if(!b)continue;totalBuildings++;
  const access=isAccessible(x,y,network);if(access)accessibleBuildings++;const factor=access?1:.2;
  residentialCapacity+=(b.capacity||0)*factor;localJobs+=(b.jobs||0)*factor;facilityUpkeepBase+=(b.upkeep||0);happinessMod+=(b.happy||0)*factor;propertyBase+=(b.propertyBase||0)*factor;businessBase+=(b.businessBase||0)*factor;energyBase+=(b.energyBase||0)*factor;
  if(b.service)serviceCapacity[b.service]+=(b.serviceCapacity||0)*factor;if(cell.type==='park')leisureScore+=10*factor;if(cell.type==='shop')leisureScore+=4*factor;
 }
 const accessibility=totalBuildings?accessibleBuildings/totalBuildings*100:100;
 const demographics=demographicSnapshot(state.population);
 const employableDemand=Math.max(0,demographics.workingAge),commuterPool=Math.round(state.population*.31*clamp(accessibility/100,.7,1)),localResidentJobs=Math.round(localJobs*.68),employedResidents=Math.min(employableDemand,Math.max(0,localResidentJobs+commuterPool));
 const unemployment=employableDemand?Math.max(0,100-employedResidents/employableDemand*100):0;
 let education=clamp(30+serviceCapacity.education/Math.max(1,demographics.youth)*70,0,160),health=clamp(58+serviceCapacity.health/Math.max(1,state.population)*42,0,160),safety=clamp(58+serviceCapacity.safety/Math.max(1,state.population)*42,0,160);
 if(state.tempEducationMonths>0)education+=state.tempEducationBoost;if(state.tempHealthMonths>0)health+=state.tempHealthBoost;
 education=clamp(education*(state.serviceFunding/100),0,170);health=clamp(health*(state.serviceFunding/100),0,170);safety=clamp(safety*(state.serviceFunding/100),0,170);
 const serviceLevels={education,safety,health};
 const taxPressure=((state.taxRates.property-100)+(state.taxRates.business-100)+(state.taxRates.fees-100))/3;
 const attractiveness=clamp(46+(state.happiness-50)*.38+(state.environment-50)*.19+(state.infrastructure-50)*.21+(education-70)*.08+(health-70)*.07+leisureScore*.18-unemployment*.25-taxPressure*.32+(accessibility-80)*.08,5,96);
 const businessClimate=clamp(50+(state.economy-50)*.55+(state.infrastructure-50)*.22-(state.taxRates.business-100)*.38+(c.shop||0)*1.4+(accessibility-80)*.12,5,98);
 const companies=(c.shop||0)*14+(c.factory||0)*9+Math.round(state.bonusJobs/25);
 const residentShare=Math.round(state.population*74*(1+state.economy/300));
 const propertyTax=Math.round(propertyBase*(state.taxRates.property/100)*(1+state.population/7000));
 const businessTax=Math.round(businessBase*(state.taxRates.business/100)*(.6+state.economy/100));
 const fees=Math.round(state.population*17*(state.taxRates.fees/100));
 const grants=Math.round(10500+state.population*11+Math.max(0,72-attractiveness)*75);
 const energy=Math.round(energyBase*(.85+state.economy/200));
 const income=residentShare+propertyTax+businessTax+fees+grants+energy;
 const inflationFactor=1+state.inflation/100,freeze=state.budgetFreezeMonths>0?.86:1;
 const admin=Math.round((12500+state.population*6.5)*inflationFactor*freeze);
 const facilities=Math.round(facilityUpkeepBase*inflationFactor*(state.serviceFunding/100)*freeze);
 const social=Math.round(state.population*(10.5+unemployment*.34)*inflationFactor);
 const roads=Math.round(((c.road||0)*650+state.population*3+Math.max(0,70-state.infrastructure)*270)*inflationFactor*(state.maintenanceLevel/100));
 const levy=Math.round((9000+state.population*(11+state.levyModifier*.8))*inflationFactor);
 const interest=Math.round(state.debt*(state.interestRate/100)/12),repayment=Math.round(state.debt>0?Math.min(Math.max(7000,state.debt*.008),state.debt):0);
 const expenses=admin+facilities+social+roads+levy+interest+repayment,operating=income-expenses;
 const housingUtil=state.population/Math.max(1,residentialCapacity)*100;
 waste+=Math.max(0,education-125)*30+Math.max(0,health-125)*25+Math.max(0,safety-125)*20;
 return{c,network,residentialCapacity,localJobs,commuterPool,unemployment,serviceCapacity,serviceLevels,propertyTax,residentShare,businessTax,fees,grants,energy,income,admin,facilities,social,roads,levy,interest,repayment,expenses,operating,happinessMod,attractiveness,leisureScore,demographics,businessClimate,companies,accessibility,housingUtil,waste,freeHomes:Math.max(0,residentialCapacity-state.population),debtPerCapita:state.debt/Math.max(1,state.population)};
}

function promiseProgress(id,m){
 if(id==='budget'){const op=clamp(50+m.operating/1200,0,100),debt=clamp(100-m.debtPerCapita/18,0,100);return Math.round(op*.55+debt*.45)}
 if(id==='families')return Math.round(clamp(m.serviceLevels.education,0,100)*.4+clamp(110-m.housingUtil,0,100)*.25+state.happiness*.35);
 if(id==='economy')return Math.round(m.businessClimate*.45+clamp(100-m.unemployment*3,0,100)*.35+clamp(m.companies*3,0,100)*.2);
 if(id==='infrastructure')return Math.round(state.infrastructure*.55+clamp(m.serviceLevels.safety,0,100)*.45);
 if(id==='climate')return Math.round(state.environment*.65+clamp((m.c.solar||0)*30+(m.c.park||0)*12,0,100)*.35);
 if(id==='growth'){const growth=(state.population/state.termStartPopulation-1)*100;return Math.round(clamp(growth*5,0,100)*.55+m.attractiveness*.45)}
 return 0;
}
function promiseDone(id,m){return promiseProgress(id,m)>=72;}
function selectMandate(m){const ids=Object.keys(PROMISES).map(id=>({id,p:promiseProgress(id,m)})).sort((a,b)=>a.p-b.p);return ids.slice(0,3).map(x=>x.id);}
function legacyScore(m=metrics()){
 const finance=clamp(55+m.operating/1500-m.debtPerCapita/30,0,100),services=(clamp(m.serviceLevels.education,0,100)+clamp(m.serviceLevels.safety,0,100)+clamp(m.serviceLevels.health,0,100))/3;
 const mandate=state.mandate.reduce((a,id)=>a+promiseProgress(id,m),0)/Math.max(1,state.mandate.length);
 return Math.round(finance*.2+services*.2+state.approval*.18+state.councilSupport*.1+state.infrastructure*.1+state.environment*.07+m.businessClimate*.08+mandate*.07);
}

function needFor(type,m){
 let score=50,reason='Ausgewogener Bedarf';
 if(type==='road'){score=clamp(100-state.infrastructure+constructionProjects().length*2,15,95);reason=state.infrastructure<55?'Sanierungs- und Erschließungsbedarf hoch':'Nur bauen, wenn neue Flächen erschlossen werden';}
 if(type==='house'||type==='apartments'){score=clamp(105-m.housingUtil+(m.attractiveness-50)*.4,5,95);reason=m.housingUtil>92?'Wohnraum ist knapp':m.housingUtil<70?'Derzeit deutliche Wohnraumreserve':'Mittlerer Wohnraumbedarf';}
 if(type==='shop'){score=clamp((state.population/18)-m.companies+m.businessClimate*.35,5,95);reason=m.businessClimate>60?'Gutes Umfeld für Ortszentrum/Gewerbe':'Wirtschaftsklima zunächst verbessern';}
 if(type==='factory'){score=clamp(m.unemployment*3+m.businessClimate*.35-(m.c.factory||0)*12,5,95);reason=m.unemployment>15?'Arbeitsplätze werden dringend gebraucht':'Nur bei ausreichender Nachfrage sinnvoll';}
 if(type==='park'){score=clamp((65-state.environment)*1.4+(65-state.happiness)*.9+25,5,95);reason=state.environment<55||state.happiness<55?'Freiraum würde spürbar helfen':'Zusätzlicher Park hat begrenzten Grenznutzen';}
 if(type==='kindergarten'||type==='school'){score=clamp(105-m.serviceLevels.education,5,98);reason=m.serviceLevels.education<70?'Bildungskapazität ist kritisch':'Kapazitäten aktuell ausreichend';}
 if(type==='fire'){score=clamp(105-m.serviceLevels.safety,5,98);reason=m.serviceLevels.safety<70?'Sicherheitsversorgung ist kritisch':'Kapazitäten aktuell ausreichend';}
 if(type==='clinic'){score=clamp(105-m.serviceLevels.health,5,98);reason=m.serviceLevels.health<70?'Gesundheitsversorgung ist kritisch':'Kapazitäten aktuell ausreichend';}
 if(type==='solar'){score=clamp((70-state.environment)+30-(m.c.solar||0)*12,5,92);reason=(m.c.solar||0)===0?'Erster Solarpark diversifiziert Einnahmen':'Weitere Anlagen nur bei Umwelt-/Finanzstrategie';}
 const label=score>=70?'Hoch':score>=42?'Mittel':'Gering';return{score,label,reason};
}
function projectPoliticalCost(b){if(!b)return 0;if(b.cost>=1500000)return 20;if(b.cost>=900000)return 15;if(b.cost>=500000)return 10;if(b.cost>=200000)return 6;if(b.cost>=100000)return 4;return 1;}
function projectAdminCost(b){if(!b)return 0;if(b.cost>=900000)return 2;if(b.cost>=200000)return 1;return .5;}

function addIssue(id,severity=1){if(state.activeIssues.some(i=>i.id===id))return;if((state.issueCooldowns[id]||0)>state.monthsPlayed)return;const d=ISSUE_DEFS[id];if(!d)return;state.activeIssues.push({id,severity,created:state.monthsPlayed,deadline:state.monthsPlayed+d.months});}
function issueResolved(id,m){if(id==='housing')return m.housingUtil<88;if(id==='education')return m.serviceLevels.education>=75;if(id==='safety')return m.serviceLevels.safety>=75;if(id==='health')return m.serviceLevels.health>=75;if(id==='roads')return state.infrastructure>=55;if(id==='jobs')return m.unemployment<=12;if(id==='deficit')return m.operating>=0;if(id==='debt')return m.debtPerCapita<900;if(id==='trust')return state.approval>=45&&state.happiness>=45;return false;}
function applyIssuePenalty(id){state.neglectedIssues++;state.approval-=3;state.councilSupport-=2;if(id==='housing')state.happiness-=4;if(id==='education'||id==='health'||id==='safety')state.happiness-=5;if(id==='roads')state.infrastructure-=4;if(id==='jobs')state.economy-=3;if(id==='deficit')state.oversightLevel=Math.max(state.oversightLevel,1);if(id==='debt')state.politicalCapital-=6;if(id==='trust')state.councilSupport-=5;state.issueCooldowns[id]=state.monthsPlayed+6;}
function evaluateIssues(m){
 if(m.housingUtil>94)addIssue('housing',2);if(m.serviceLevels.education<60)addIssue('education',2);if(m.serviceLevels.safety<55)addIssue('safety',2);if(m.serviceLevels.health<55)addIssue('health',2);if(state.infrastructure<42)addIssue('roads',2);if(m.unemployment>19)addIssue('jobs',1);if(state.consecutiveDeficitMonths>=4)addIssue('deficit',2);if(m.debtPerCapita>1300)addIssue('debt',2);if(state.approval<35||state.happiness<35)addIssue('trust',2);
 const kept=[];for(const issue of state.activeIssues){if(issueResolved(issue.id,m)){state.approval+=1;state.politicalCapital+=1;state.issueCooldowns[issue.id]=state.monthsPlayed+4;continue;}if(state.monthsPlayed>issue.deadline){applyIssuePenalty(issue.id);state.eventLog.unshift({date:`${monthNames[state.month]} ${state.year}`,title:`Problem ungelöst: ${ISSUE_DEFS[issue.id].title}`,choice:'Frist verpasst – Vertrauen und Handlungsfähigkeit sinken'});continue;}kept.push(issue);}state.activeIssues=kept;
}
function evaluateFailure(m){
 state.consecutiveDeficitMonths=m.operating<-18000?state.consecutiveDeficitMonths+1:Math.max(0,state.consecutiveDeficitMonths-1);
 state.noConfidenceMonths=state.councilSupport<22?state.noConfidenceMonths+1:Math.max(0,state.noConfidenceMonths-1);
 state.socialCrisisMonths=(state.happiness<25&&state.approval<30)?state.socialCrisisMonths+1:Math.max(0,state.socialCrisisMonths-1);
 state.serviceCrisisMonths=(Math.min(m.serviceLevels.education,m.serviceLevels.safety,m.serviceLevels.health)<20)?state.serviceCrisisMonths+1:Math.max(0,state.serviceCrisisMonths-1);
 state.infrastructureCrisisMonths=state.infrastructure<18?state.infrastructureCrisisMonths+1:Math.max(0,state.infrastructureCrisisMonths-1);
 if(state.consecutiveDeficitMonths>=6||m.debtPerCapita>1200||state.money<0)state.oversightLevel=Math.max(state.oversightLevel,1);
 if(state.consecutiveDeficitMonths>=12||m.debtPerCapita>1900)state.oversightLevel=Math.max(state.oversightLevel,2);
 if(m.operating>0&&state.money>100000&&m.debtPerCapita<900)state.oversightLevel=Math.max(0,state.oversightLevel-1);
 if(state.noConfidenceMonths>=4)return loseGame('🏛️ Misstrauensvotum','Du hast die Ratsmehrheit dauerhaft verloren. Der Rat entzieht dir die politische Handlungsfähigkeit.');
 if(state.socialCrisisMonths>=5)return loseGame('📉 Rücktritt nach Vertrauenskrise','Zufriedenheit und Zustimmung sind über Monate kollabiert. Deine Amtsführung ist politisch nicht mehr haltbar.');
 if(state.serviceCrisisMonths>=6)return loseGame('🚨 Grundversorgung zusammengebrochen','Mindestens ein zentraler Bereich der Daseinsvorsorge war über Monate kritisch unterversorgt.');
 if(state.infrastructureCrisisMonths>=6)return loseGame('🛣️ Infrastruktur-Notstand','Der Sanierungsstau ist außer Kontrolle geraten. Die Gemeinde verliert ihre Handlungsfähigkeit.');
 if(state.oversightLevel>=2&&state.consecutiveDeficitMonths>=18)return loseGame('💸 Haushaltsaufsicht übernimmt','Der Haushalt ist strukturell nicht mehr genehmigungsfähig. Die Kommunalaufsicht greift ein.');
 if(m.debtPerCapita>2800&&state.money<0)return loseGame('💸 Überschuldung','Schulden und Liquiditätsprobleme überschreiten das tragbare Maß.');
 if(state.neglectedIssues>=7)return loseGame('📋 Verwaltungspolitisches Scheitern','Zu viele dringende Probleme wurden trotz Fristen nicht gelöst.');
 return false;
}
function loseGame(title,text){if(state.gameOver)return true;state.gameOver=true;state.speed=0;save();openModal(`<h2>${title}</h2><p>${text}</p><div class="card"><div class="stat-row"><span>Amtszeit</span><b>${state.monthsPlayed} Monate</b></div><div class="stat-row"><span>Vermächtnis-Score</span><b>${legacyScore()}</b></div><div class="stat-row"><span>Ungelöste Probleme</span><b>${state.neglectedIssues}</b></div></div><button class="primary" id="restartBtn">Neue Gemeinde übernehmen</button>`);setTimeout(()=>{$('#restartBtn').onclick=()=>{closeModal();resetGame();}},0);return true;}

function changeRate(kind,delta){if(state.taxCooldown>0)return showToast(`Steuerpolitik erst in ${state.taxCooldown} Monaten wieder änderbar`);if(state.actionPoints<.5)return showToast('Verwaltungskapazität für diesen Monat aufgebraucht');if(state.politicalCapital<3)return showToast('Zu wenig politisches Kapital');const old=state.taxRates[kind];state.taxRates[kind]=clamp(old+delta,75,150);state.taxCooldown=3;state.actionPoints-=.5;state.politicalCapital-=3;if(delta>0){state.approval-=1.5;state.councilSupport-=.5}else{state.approval+=1;state.councilSupport+=.5}save();renderPanel('finance');updateHUD();}
function setPolicy(kind,value){if(state.policyCooldown>0)return showToast(`Haushaltspolitik erst in ${state.policyCooldown} Monaten wieder änderbar`);if(state.actionPoints<.5)return showToast('Verwaltungskapazität aufgebraucht');if(state.politicalCapital<4)return showToast('Zu wenig politisches Kapital');state[kind]=value;state.policyCooldown=3;state.actionPoints-=.5;state.politicalCapital-=4;if(kind==='serviceFunding'){state.happiness+=value>100?1:-1;state.councilSupport+=value>100?.5:-.5}save();renderPanel('finance');}
function takeLoan(){const m=metrics();if(state.oversightLevel>=2)return showToast('Kommunalaufsicht genehmigt keinen weiteren Kredit');if(m.debtPerCapita>2200)return showToast('Verschuldungsgrenze erreicht');if(state.politicalCapital<6)return showToast('Zu wenig politisches Kapital für Kreditbeschluss');state.debt+=250000;state.money+=250000;state.politicalCapital-=6;state.approval-=1;state.councilSupport-=1;save();renderPanel('finance');updateHUD();showToast('Kredit über 250.000 € beschlossen');}
function repayDebt(){const amount=Math.min(50000,state.debt,Math.max(0,state.money-100000));if(amount<=0)return showToast('Keine ausreichenden freien Mittel');state.debt-=amount;state.money-=amount;state.approval+=.5;state.politicalCapital+=1;save();renderPanel('finance');updateHUD();showToast(`Sondertilgung ${moneyFmt(amount)}`);}
function startBudgetFreeze(){if(state.budgetFreezeMonths>0)return showToast('Haushaltssperre ist bereits aktiv');if(state.politicalCapital<5)return showToast('Zu wenig politisches Kapital');state.budgetFreezeMonths=6;state.politicalCapital-=5;state.councilSupport-=2;state.approval-=1;save();renderPanel('finance');showToast('Haushaltssperre für 6 Monate verhängt');}

function checkObjectives(m){state.objectives.pop1500=state.population>=1500;state.objectives.happy75=state.happiness>=75;state.objectives.balance=m.operating>=10000;state.objectives.services=m.serviceLevels.education>=85&&m.serviceLevels.safety>=85&&m.serviceLevels.health>=85;}
function pickEvent(m){const eligible=EVENTS.filter(e=>e.when(m,state));return eligible.length?eligible[Math.floor(Math.random()*eligible.length)]:EVENTS[0];}
function triggerEvent(){const m=metrics(),ev=pickEvent(m);openModal(`<div class="tag">Entscheidung</div><h2>${ev.title}</h2><p>${ev.text}</p>${ev.choices.map((c,i)=>`<button class="choice" data-choice="${i}"><b>${c.label}</b><small>${c.detail}</small></button>`).join('')}`);document.querySelectorAll('[data-choice]').forEach(btn=>btn.onclick=()=>{const ch=ev.choices[+btn.dataset.choice];ch.apply(state);state.happiness=clamp(state.happiness,5,98);state.approval=clamp(state.approval,5,98);state.councilSupport=clamp(state.councilSupport,5,95);state.politicalCapital=clamp(state.politicalCapital,0,100);state.environment=clamp(state.environment,5,100);state.infrastructure=clamp(state.infrastructure,5,100);state.economy=clamp(state.economy,15,95);state.eventLog.unshift({date:`${monthNames[state.month]} ${state.year}`,title:ev.title,choice:ch.label});state.eventLog=state.eventLog.slice(0,30);closeModal();save();updateHUD();renderPanel('events');});}
function election(){const m=metrics();const results=state.mandate.map(id=>({id,done:promiseDone(id,m),progress:promiseProgress(id,m)}));const kept=results.filter(x=>x.done).length,broken=results.length-kept;const debtPenalty=clamp(m.debtPerCapita/80,0,18),promiseEffect=kept*4-broken*6;const score=Math.round(state.approval*.42+state.happiness*.2+m.attractiveness*.1+state.councilSupport*.12+legacyScore(m)*.16-debtPenalty+promiseEffect);if(score<50)return loseGame('🗳️ Wahl verloren',`Du erreichst ${score}%. ${broken} von ${results.length} Wahlversprechen wurden nicht ausreichend erfüllt.`);state.electionsWon++;state.money+=80000;state.termNumber++;state.termStartPopulation=state.population;state.termStartDebt=state.debt;state.approval=clamp(state.approval+kept*2-broken*2,10,95);state.politicalCapital=clamp(state.politicalCapital+12,0,100);state.mandate=selectMandate(m);const milestone=state.electionsWon>=3&&legacyScore(m)>=75;openModal(`<h2>🗳️ Wiedergewählt: ${score}%</h2><p>${kept} von ${results.length} Wahlversprechen erfüllt. Die neue Amtszeit beginnt mit neuen Schwerpunkten.</p>${milestone?'<p class="good"><b>🏆 Historischer Erfolg:</b> Drei Wiederwahlen bei starkem Vermächtnis-Score.</p>':''}<button class="primary" id="continueBtn">Neue Amtszeit beginnen</button>`);state.legacyMilestone=state.legacyMilestone||milestone;save();setTimeout(()=>{$('#continueBtn').onclick=closeModal},0);}

function simulateMonth(){
 if(state.gameOver)return;state.month++;state.monthsPlayed++;if(state.month>11){state.month=0;state.capitalSpentLastYear=state.capitalSpentYear;state.fiscalHistory.unshift({year:state.year,income:state.stats.income*12,expenses:state.stats.expenses*12,capital:state.capitalSpentYear,debt:state.debt});state.fiscalHistory=state.fiscalHistory.slice(0,5);state.capitalSpentYear=0;state.year++;}
 progressConstruction();state.actionCapacity=clamp(2.5+state.councilSupport/45+(state.oversightLevel===0?.5:0),2.5,5);state.actionPoints=state.actionCapacity;state.politicalCapital=clamp(state.politicalCapital+(state.approval>55?1.5:.4)+(state.councilSupport>50?.7:-.4)-state.oversightLevel*.5,0,100);
 state.taxCooldown=Math.max(0,state.taxCooldown-1);state.policyCooldown=Math.max(0,state.policyCooldown-1);state.budgetFreezeMonths=Math.max(0,state.budgetFreezeMonths-1);if(state.tempEducationMonths>0)state.tempEducationMonths--;if(state.tempHealthMonths>0)state.tempHealthMonths--;
 state.economy=clamp(state.economy+rand(-2.3,2.4)-state.oversightLevel*.2,20,95);state.inflation=clamp(state.inflation+rand(-.15,.2),1,8);state.interestRate=clamp(state.interestRate+rand(-.07,.1)+(state.oversightLevel*.02),2,9);
 const m=metrics();state.stats={income:m.income,expenses:m.expenses,operating:m.operating,propertyTax:m.propertyTax,residentShare:m.residentShare,businessTax:m.businessTax,fees:m.fees,grants:m.grants,energy:m.energy,admin:m.admin,facilities:m.facilities,social:m.social,roads:m.roads,levy:m.levy,interest:m.interest,repayment:m.repayment,attractiveness:m.attractiveness,commuters:m.commuterPool,servicePressure:Math.round((m.serviceLevels.education+m.serviceLevels.safety+m.serviceLevels.health)/3),businessClimate:m.businessClimate,families:m.demographics.families,workingAge:m.demographics.workingAge,seniors:m.demographics.seniors,youth:m.demographics.youth,companies:m.companies,accessibility:m.accessibility,waste:m.waste};
 state.money+=m.operating;state.debt=Math.max(0,state.debt-m.repayment);if(state.money<-25000){const needed=Math.ceil(Math.abs(state.money)/25000)*25000+25000;state.debt+=needed;state.money+=needed;state.approval-=2;state.councilSupport-=1;state.oversightLevel=Math.max(1,state.oversightLevel);showToast(`Kassenkredit automatisch: ${moneyFmt(needed)}`);}
 const freeHomes=Math.max(0,m.residentialCapacity-state.population),taxPenalty=(state.taxRates.property-100)*.18+(state.taxRates.fees-100)*.14+(state.taxRates.business-100)*.08;const moveIntent=m.attractiveness*.2+(m.localJobs-state.population)*.018+freeHomes*.014-taxPenalty-state.oversightLevel*3;let growth=clamp(Math.round(moveIntent/3),-28,38);if(m.housingUtil>99)growth=Math.min(growth,-3);growth=Math.min(growth,Math.max(0,freeHomes));state.population=Math.max(150,state.population+growth);
 const servicesAvg=(m.serviceLevels.education+m.serviceLevels.safety+m.serviceLevels.health)/3,economicMood=(state.economy-50)*.13,fiscalMood=m.operating>=0?2.2:-4.5,debtMood=-Math.min(10,m.debtPerCapita/150),freezeMood=state.budgetFreezeMonths>0?-3:0,issueMood=-state.activeIssues.length*1.1;const targetHappy=clamp(52+m.happinessMod+(servicesAvg-75)*.11+(state.environment-50)*.14+(state.infrastructure-50)*.12+economicMood+fiscalMood+debtMood+freezeMood+issueMood-m.unemployment*.2,7,95);state.happiness=clamp(Math.round(state.happiness+(targetHappy-state.happiness)*.22),5,98);state.approval=clamp(state.approval+(state.happiness-state.approval)*.1+(m.operating>0?.5:-.7)-state.activeIssues.length*.12,5,98);state.councilSupport=clamp(state.councilSupport+(state.approval-state.councilSupport)*.07+(m.operating>0?.25:-.35)-state.oversightLevel*.25,5,95);
 const maintenanceDelta=(state.maintenanceLevel-100)/100*.5;state.infrastructure=clamp(state.infrastructure-.32+buildingCount('road')*.008+maintenanceDelta,5,100);state.environment=clamp(state.environment-.1-buildingCount('factory')*.28+buildingCount('park')*.22+buildingCount('solar')*.16,5,100);
 checkObjectives(m);evaluateIssues(m);if(evaluateFailure(m))return;if(state.monthsPlayed-state.lastEvent>=4&&Math.random()<.32){state.lastEvent=state.monthsPlayed;triggerEvent();}if(state.monthsPlayed>0&&state.monthsPlayed%48===0)election();
 save();updateHUD();if($('#panel').classList.contains('open'))renderPanel(document.querySelector('.dock button.active')?.dataset.panel||'overview');
}

function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.floor(r.width*d);canvas.height=Math.floor(r.height*d);ctx.setTransform(d,0,0,d,0,0);draw();}
function cellSize(){return 52*view.scale}
function fitMap(){const r=canvas.getBoundingClientRect();view.scale=Math.max(.55,Math.min(1.08,Math.min((r.width-40)/(GRID_W*52),(r.height-40)/(GRID_H*52))));view.offsetX=(r.width-GRID_W*52*view.scale)/2;view.offsetY=(r.height-GRID_H*52*view.scale)/2;draw();}
function roadNeighbors(x,y){return{n:state.grid[y-1]?.[x]?.type==='road',e:state.grid[y]?.[x+1]?.type==='road',s:state.grid[y+1]?.[x]?.type==='road',w:state.grid[y]?.[x-1]?.type==='road'}}
function drawTileGrass(px,py,cs,x,y){const g=ctx.createLinearGradient(px,py,px,py+cs);g.addColorStop(0,(x+y)%2?'#638b54':'#6d965b');g.addColorStop(1,(x+y)%2?'#567e49':'#5e8650');ctx.fillStyle=g;ctx.fillRect(px,py,cs+1,cs+1);ctx.fillStyle='rgba(255,255,255,.035)';ctx.fillRect(px+cs*.08,py+cs*.08,cs*.11,cs*.11);ctx.fillStyle='rgba(0,0,0,.07)';ctx.fillRect(px+cs*.72,py+cs*.68,cs*.08,cs*.08)}
function drawRoad(px,py,cs,x,y){const n=roadNeighbors(x,y);ctx.fillStyle='#5f666b';ctx.fillRect(px+cs*.31,py+cs*.31,cs*.38,cs*.38);if(n.n)ctx.fillRect(px+cs*.31,py,cs*.38,cs*.34);if(n.s)ctx.fillRect(px+cs*.31,py+cs*.66,cs*.38,cs*.34);if(n.w)ctx.fillRect(px,py+cs*.31,cs*.34,cs*.38);if(n.e)ctx.fillRect(px+cs*.66,py+cs*.31,cs*.34,cs*.38);ctx.fillStyle='#7c8388';ctx.fillRect(px+cs*.34,py+cs*.34,cs*.32,cs*.32);if(n.n)ctx.fillRect(px+cs*.34,py,cs*.32,cs*.36);if(n.s)ctx.fillRect(px+cs*.34,py+cs*.64,cs*.32,cs*.36);if(n.w)ctx.fillRect(px,py+cs*.34,cs*.36,cs*.32);if(n.e)ctx.fillRect(px+cs*.64,py+cs*.34,cs*.36,cs*.32);ctx.strokeStyle='#e8d98c';ctx.lineWidth=Math.max(1,cs*.03);ctx.setLineDash([cs*.11,cs*.08]);ctx.beginPath();if(n.n||n.s){ctx.moveTo(px+cs*.5,py+(n.n?0:cs*.34));ctx.lineTo(px+cs*.5,py+(n.s?cs:cs*.66))}if(n.e||n.w||(!n.n&&!n.s)){ctx.moveTo(px+(n.w?0:cs*.34),py+cs*.5);ctx.lineTo(px+(n.e?cs:cs*.66),py+cs*.5)}ctx.stroke();ctx.setLineDash([])}
function drawPlot(px,py,cs){ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(px+cs*.54,py+cs*.8,cs*.3,cs*.11,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#769a63';ctx.fillRect(px+cs*.12,py+cs*.16,cs*.76,cs*.64);ctx.strokeStyle='rgba(255,255,255,.15)';ctx.strokeRect(px+cs*.12,py+cs*.16,cs*.76,cs*.64)}
function drawRoof(px,py,w,h,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(px,py+h);ctx.lineTo(px+w*.5,py);ctx.lineTo(px+w,py+h);ctx.closePath();ctx.fill()}
function drawWindowGrid(x,y,cols,rows,w,h,color='#c8e6ff'){const gx=w/cols,gy=h/rows;ctx.fillStyle=color;for(let cy=0;cy<rows;cy++)for(let cx=0;cx<cols;cx++)ctx.fillRect(x+cx*gx+gx*.18,y+cy*gy+gy*.18,gx*.45,gy*.42)}
function drawHouse(px,py,cs){drawPlot(px,py,cs);ctx.fillStyle='#f2c38a';ctx.fillRect(px+cs*.26,py+cs*.38,cs*.46,cs*.28);drawRoof(px+cs*.22,py+cs*.24,cs*.54,cs*.18,'#9b543c');ctx.fillStyle='#f3eddc';ctx.fillRect(px+cs*.43,py+cs*.5,cs*.08,cs*.16);drawWindowGrid(px+cs*.3,py+cs*.45,2,1,cs*.18,cs*.12);drawWindowGrid(px+cs*.54,py+cs*.45,2,1,cs*.12,cs*.12)}
function drawApartments(px,py,cs){drawPlot(px,py,cs);ctx.fillStyle='#d4b2a1';ctx.fillRect(px+cs*.18,py+cs*.28,cs*.62,cs*.4);ctx.fillStyle='#ba7c65';ctx.fillRect(px+cs*.2,py+cs*.24,cs*.58,cs*.09);drawWindowGrid(px+cs*.24,py+cs*.34,4,3,cs*.48,cs*.25);ctx.fillStyle='#f3eddc';ctx.fillRect(px+cs*.46,py+cs*.55,cs*.08,cs*.13)}
function drawShop(px,py,cs){drawPlot(px,py,cs);ctx.fillStyle='#f3dcc3';ctx.fillRect(px+cs*.18,py+cs*.38,cs*.62,cs*.24);ctx.fillStyle='#b26e49';ctx.fillRect(px+cs*.18,py+cs*.3,cs*.62,cs*.1);ctx.fillStyle='#c63f38';for(let i=0;i<5;i++)ctx.fillRect(px+cs*(.2+i*.12),py+cs*.4,cs*.06,cs*.08);ctx.fillStyle='#cde6ff';ctx.fillRect(px+cs*.24,py+cs*.49,cs*.22,cs*.08);ctx.fillRect(px+cs*.52,py+cs*.49,cs*.18,cs*.08)}
function drawFactory(px,py,cs){drawPlot(px,py,cs);ctx.fillStyle='#a5a19c';ctx.fillRect(px+cs*.18,py+cs*.4,cs*.58,cs*.22);ctx.fillStyle='#8d6d60';ctx.fillRect(px+cs*.55,py+cs*.2,cs*.1,cs*.26);ctx.fillStyle='#73635b';ctx.beginPath();ctx.moveTo(px+cs*.18,py+cs*.4);ctx.lineTo(px+cs*.36,py+cs*.28);ctx.lineTo(px+cs*.52,py+cs*.4);ctx.closePath();ctx.fill();drawWindowGrid(px+cs*.26,py+cs*.47,4,1,cs*.34,cs*.07)}
function drawPark(px,py,cs){drawPlot(px,py,cs);ctx.fillStyle='#5d8a42';ctx.beginPath();ctx.arc(px+cs*.48,py+cs*.42,cs*.16,0,Math.PI*2);ctx.arc(px+cs*.61,py+cs*.45,cs*.14,0,Math.PI*2);ctx.arc(px+cs*.4,py+cs*.48,cs*.14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#734b32';ctx.fillRect(px+cs*.47,py+cs*.46,cs*.05,cs*.16);ctx.fillStyle='#c9b47a';ctx.fillRect(px+cs*.2,py+cs*.6,cs*.4,cs*.05)}
function drawCivic(px,py,cs,body,roof,accent){drawPlot(px,py,cs);ctx.fillStyle=body;ctx.fillRect(px+cs*.18,py+cs*.34,cs*.62,cs*.3);drawRoof(px+cs*.15,py+cs*.2,cs*.68,cs*.18,roof);ctx.fillStyle=accent;ctx.fillRect(px+cs*.46,py+cs*.47,cs*.08,cs*.17);drawWindowGrid(px+cs*.24,py+cs*.42,3,2,cs*.48,cs*.16)}
function drawSolar(px,py,cs){drawPlot(px,py,cs);ctx.fillStyle='#366d9a';ctx.fillRect(px+cs*.18,py+cs*.38,cs*.22,cs*.18);ctx.fillRect(px+cs*.44,py+cs*.38,cs*.22,cs*.18);ctx.strokeStyle='rgba(255,255,255,.25)';for(const x of [.18,.44])for(let i=1;i<3;i++){ctx.beginPath();ctx.moveTo(px+cs*(x+i*.073),py+cs*.38);ctx.lineTo(px+cs*(x+i*.073),py+cs*.56);ctx.stroke()}ctx.fillStyle='#e8c85a';ctx.beginPath();ctx.arc(px+cs*.72,py+cs*.34,cs*.1,0,Math.PI*2);ctx.fill()}
function drawConstructionSite(cell,px,py,cs){drawPlot(px,py,cs);ctx.fillStyle='#c99b4d';ctx.fillRect(px+cs*.18,py+cs*.57,cs*.64,cs*.07);ctx.strokeStyle='#f2d48a';ctx.lineWidth=Math.max(1,cs*.025);for(let i=0;i<5;i++){const x=px+cs*(.2+i*.14);ctx.beginPath();ctx.moveTo(x,py+cs*.25);ctx.lineTo(x,py+cs*.63);ctx.stroke()}ctx.fillStyle='#33434e';ctx.fillRect(px+cs*.64,py+cs*.26,cs*.07,cs*.3);ctx.fillStyle='#f4cf53';ctx.fillRect(px+cs*.68,py+cs*.26,cs*.17,cs*.04);ctx.font=`${Math.max(9,cs*.16)}px system-ui`;ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(`${cell.monthsLeft||1}M`,px+cs*.5,py+cs*.75)}
function drawBuilding(cell,px,py,cs,x,y){const type=cell.type;if(cell.underConstruction)return drawConstructionSite(cell,px,py,cs);if(type==='road')return drawRoad(px,py,cs,x,y);if(type==='house')return drawHouse(px,py,cs);if(type==='apartments')return drawApartments(px,py,cs);if(type==='shop')return drawShop(px,py,cs);if(type==='factory')return drawFactory(px,py,cs);if(type==='park')return drawPark(px,py,cs);if(type==='kindergarten')return drawCivic(px,py,cs,'#f1d79b','#cb8747','#c9955a');if(type==='school')return drawCivic(px,py,cs,'#d4a17d','#8c4736','#8a5d3b');if(type==='fire')return drawCivic(px,py,cs,'#d4675c','#8e2d2d','#772323');if(type==='clinic')return drawCivic(px,py,cs,'#dce7ec','#6a8db3','#afc1cf');if(type==='solar')return drawSolar(px,py,cs);if(type==='townhall')return drawCivic(px,py,cs,'#d8c4a1','#7f684a','#6f5b40')}
function draw(){const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);const bg=ctx.createLinearGradient(0,0,0,r.height);bg.addColorStop(0,'#295033');bg.addColorStop(1,'#203c25');ctx.fillStyle=bg;ctx.fillRect(0,0,r.width,r.height);const cs=cellSize();for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++){const px=view.offsetX+x*cs,py=view.offsetY+y*cs;drawTileGrass(px,py,cs,x,y);ctx.strokeStyle='rgba(16,37,18,.12)';ctx.strokeRect(px,py,cs,cs);const cell=state.grid[y][x];if(cell)drawBuilding(cell,px,py,cs,x,y)}}
function pointerCell(clientX,clientY){const r=canvas.getBoundingClientRect(),cs=cellSize();return{x:Math.floor((clientX-r.left-view.offsetX)/cs),y:Math.floor((clientY-r.top-view.offsetY)/cs)}}
function validCell(x,y){return x>=0&&y>=0&&x<GRID_W&&y<GRID_H}
function inspectAt(x,y){if(!validCell(x,y))return;const cell=state.grid[y][x],m=metrics(),network=m.network;if(!cell){openModal(`<h2>🌿 Freies Grundstück</h2><p>${adjacentConnectedRoad(x,y,network)?'An das Straßennetz angeschlossen.':'Noch nicht an das zentrale Straßennetz angeschlossen.'}</p><button class="secondary" id="closeInfo">Schließen</button>`);setTimeout(()=>{$('#closeInfo').onclick=closeModal},0);return}const b=BUILDINGS[cell.type],access=isAccessible(x,y,network);openModal(`<h2>${b.emoji} ${b.name}</h2><div class="card"><div class="stat-row"><span>Status</span><b>${cell.underConstruction?`Bau · ${cell.monthsLeft} Mon.`:'In Betrieb'}</b></div><div class="stat-row"><span>Straßenanbindung</span><b class="${access?'good':'bad'}">${access?'verbunden':'getrennt'}</b></div><div class="stat-row"><span>Laufende Kosten</span><b>${moneyFmt(b.upkeep)}/Monat</b></div>${b.jobs?`<div class="stat-row"><span>Arbeitsplätze</span><b>${b.jobs}</b></div>`:''}${b.capacity?`<div class="stat-row"><span>Wohnkapazität</span><b>${b.capacity}</b></div>`:''}</div><button class="secondary" id="closeInfo">Schließen</button>`);setTimeout(()=>{$('#closeInfo').onclick=closeModal},0)}
function buildAt(x,y){if(!validCell(x,y)||state.gameOver)return;if(state.selected==='inspect')return inspectAt(x,y);const type=state.selected,b=BUILDINGS[type],m=metrics();if(type==='bulldoze'){const old=state.grid[y][x];if(!old||old.type==='townhall')return showToast(old?'Rathaus kann nicht abgerissen werden':'Hier steht nichts');const oldB=BUILDINGS[old.type];if(old.underConstruction){state.money+=Math.round(oldB.cost*.25);state.capitalSpentYear=Math.max(0,state.capitalSpentYear-Math.round(oldB.cost*.25))}else if(oldB.service&&m.serviceLevels[oldB.service]<80){state.happiness-=3;state.approval-=2}state.grid[y][x]=null;state.money-=5000;save();draw();renderPanel('build');return showToast('Abriss durchgeführt');}
 if(state.grid[y][x])return showToast('Feld ist belegt');if(state.budgetFreezeMonths>0&&type!=='road')return showToast('Haushaltssperre: neue Investitionsprojekte sind gesperrt');if(type==='road'){const network=m.network;if(network.size){const connected=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>network.has(cellKey(x+dx,y+dy)));if(!connected)return showToast('Neue Straßen müssen an das bestehende Netz anschließen');}}
 if(type!=='road'&&!adjacentConnectedRoad(x,y,m.network))return showToast('Gebäude brauchen eine Straße mit Verbindung zum Rathaus');if(b.unique&&buildingCount(type))return showToast(`${b.name} ist bereits vorhanden`);if(state.money<b.cost)return showToast('Nicht genügend freie Mittel');const political=type==='road'?0:projectPoliticalCost(b),admin=type==='road'?.15:projectAdminCost(b);if(state.politicalCapital<political)return showToast(`Zu wenig politisches Kapital (${political} nötig)`);if(state.actionPoints<admin)return showToast('Verwaltungskapazität für diesen Monat reicht nicht');if(type!=='road'&&constructionProjects().length>=state.projectLimit)return showToast(`Maximal ${state.projectLimit} parallele Bauprojekte`);if(b.cost>=900000&&state.councilSupport<42)return showToast('Ratsmehrheit für dieses Großprojekt fehlt');if(state.oversightLevel>=2&&b.cost>=200000)return showToast('Kommunalaufsicht sperrt neue größere Investitionen');
 const need=needFor(type,m);if(need.score<30){state.approval-=1;state.councilSupport-=1;showToast('Projekt hat derzeit geringen Bedarf – politische Kritik nimmt zu');}
 state.money-=b.cost;state.capitalSpentYear+=b.cost;state.politicalCapital-=political;state.actionPoints-=admin;const months=b.buildMonths||0;state.grid[y][x]=months?{type,underConstruction:true,monthsLeft:months}:{type};if(type==='park')state.environment+=2;if(type==='road')state.infrastructure+=.35;if(type==='factory')state.economy+=1;save();updateHUD();draw();renderPanel('build');showToast(months?`${b.name}: ${months} Monate Bauzeit`:`${b.name} gebaut`)}

canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);dragging=true;lastPointer={x:e.clientX,y:e.clientY,moved:false}});canvas.addEventListener('pointermove',e=>{if(!dragging||!lastPointer)return;const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;if(Math.abs(dx)+Math.abs(dy)>6){view.offsetX+=dx;view.offsetY+=dy;lastPointer={x:e.clientX,y:e.clientY,moved:true};draw()}});canvas.addEventListener('pointerup',e=>{if(dragging&&lastPointer&&!lastPointer.moved){const c=pointerCell(e.clientX,e.clientY);buildAt(c.x,c.y)}dragging=false;lastPointer=null});canvas.addEventListener('wheel',e=>{e.preventDefault();const old=view.scale;view.scale=clamp(view.scale*(e.deltaY<0?1.1:.9),.45,1.8);const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;view.offsetX=mx-(mx-view.offsetX)*(view.scale/old);view.offsetY=my-(my-view.offsetY)*(view.scale/old);draw()},{passive:false});
function updateHUD(){$('#cityName').textContent=state.cityName;$('#money').textContent=moneyFmt(state.money);$('#population').textContent=numFmt(state.population);$('#happiness').textContent=pct(state.happiness);$('#dateLabel').textContent=`${monthNames[state.month]} ${state.year}`;$('#money').className=state.money<0?'bad':state.money>300000?'good':'';$('#happiness').className=state.happiness>=70?'good':state.happiness<45?'bad':''}
function meter(label,value,colorClass='good'){return `<div class="stat-row"><span>${label}</span><b>${Math.round(value)}%</b></div><div class="meter ${colorClass}" style="color:var(--${colorClass})"><i style="width:${clamp(value,0,100)}%"></i></div>`}
function objective(label,done){return `<div class="card objective"><span>${done?'✅':'⬜'}</span><b>${label}</b><span class="tag">${done?'Erreicht':'Offen'}</span></div>`}
function promiseCard(id,m){const p=promiseProgress(id,m),d=PROMISES[id];return `<div class="promise-card"><div class="promise-head"><b>${d.title}</b><span class="status-chip ${p>=72?'ok':p<40?'danger':'warn'}">${p}%</span></div><small>${d.desc}</small><div class="meter" style="color:${p>=72?'var(--good)':p<40?'var(--bad)':'var(--warn)'}"><i style="width:${clamp(p,0,100)}%"></i></div></div>`}
function issueCard(issue){const d=ISSUE_DEFS[issue.id],left=Math.max(0,issue.deadline-state.monthsPlayed);return `<div class="issue-card"><div><b>⚠️ ${d.title}</b><small>${d.desc}</small></div><span class="deadline ${left<=3?'urgent':''}">${left} Mon.</span></div>`}
function financeRateControl(title,key,current){return `<div class="card"><h3>${title}</h3><div class="stat-row"><span>Niveau</span><b>${current}%</b></div><div class="toolbar-row"><button class="secondary" data-rate="${key}" data-delta="-5">-5</button><button class="secondary" data-rate="${key}" data-delta="5">+5</button></div></div>`}
function riskLabel(m){if(state.gameOver)return['Amtszeit beendet','bad'];if(state.oversightLevel>=2)return['Haushaltsaufsicht kritisch','bad'];if(state.noConfidenceMonths>0)return['Ratsmehrheit gefährdet','bad'];if(state.activeIssues.length>=3)return['Mehrere Krisen offen','warn'];if(m.operating<0)return['Haushalt angespannt','warn'];return['Lage stabil','good']}

function renderPanel(which){
 document.querySelectorAll('.dock button').forEach(b=>b.classList.toggle('active',b.dataset.panel===which));$('#panel').classList.add('open');const m=metrics(),score=legacyScore(m),[risk,riskClass]=riskLabel(m);let html='',title='',sub='';
 if(which==='overview'){title='Lagezentrum';sub='Probleme lösen, bevor sie zur Krise werden';html=`<div class="hero-score"><div><span>Vermächtnis</span><b>${score}</b><small>/ 100</small></div><div><span>Amtslage</span><b class="${riskClass}">${risk}</b><small>Amtszeit ${state.termNumber}</small></div></div><div class="resource-strip"><span>🏛️ Politik <b>${Math.round(state.politicalCapital)}</b></span><span>🗂️ Verwaltung <b>${state.actionPoints.toFixed(1)}/${state.actionCapacity.toFixed(1)}</b></span><span>🚧 Projekte <b>${constructionProjects().length}/${state.projectLimit}</b></span></div><div class="card"><h3>Haushalt</h3><div class="stat-row"><span>Betriebssaldo / Monat</span><b class="${m.operating>=0?'good':'bad'}">${moneyFmt(m.operating)}</b></div><div class="stat-row"><span>Rücklage</span><b>${moneyFmt(state.money)}</b></div><div class="stat-row"><span>Schulden / Einwohner</span><b>${moneyFmt(m.debtPerCapita)}</b></div><div class="stat-row"><span>Aufsicht</span><b class="${state.oversightLevel?'warn':''}">${['keine','Beobachtung','strenge Aufsicht'][state.oversightLevel]}</b></div></div><h3>Wahlversprechen</h3>${state.mandate.map(id=>promiseCard(id,m)).join('')}<h3>Dringende Aufgaben</h3>${state.activeIssues.length?state.activeIssues.map(issueCard).join(''):'<div class="card good">✓ Keine akute Problemfrist.</div>'}<div class="card"><h3>Kernindikatoren</h3>${meter('Zufriedenheit',state.happiness,state.happiness<45?'bad':'good')}${meter('Ratsmehrheit',state.councilSupport,state.councilSupport<35?'bad':'good')}${meter('Straßenanbindung',m.accessibility,m.accessibility<80?'warn':'good')}${meter('Infrastruktur',state.infrastructure,state.infrastructure<45?'bad':'good')}</div>`}
 if(which==='build'){title='Investitionen';sub='Baue nur, wenn Bedarf, Geld und politische Mehrheit vorhanden sind';html=`<div class="resource-strip"><span>🏛️ <b>${Math.round(state.politicalCapital)}</b> Politik</span><span>🗂️ <b>${state.actionPoints.toFixed(1)}</b> Verwaltung</span><span>🚧 <b>${constructionProjects().length}/${state.projectLimit}</b> Projekte</span></div><button class="build-btn inspect-tool ${state.selected==='inspect'?'selected':''}" data-build="inspect"><span class="emoji">🔎</span><b>Prüfen</b><small>Gebäude antippen und Kosten/Anbindung ansehen</small></button><div class="grid-buttons">${Object.entries(BUILDINGS).filter(([k])=>k!=='townhall').map(([k,b])=>{const n=needFor(k,m),pc=projectPoliticalCost(b);return `<button class="build-btn ${state.selected===k?'selected':''}" data-build="${k}"><span class="emoji">${b.emoji}</span><b>${b.name}</b><span class="need-badge ${n.score>=70?'high':n.score<42?'low':'mid'}">Bedarf ${n.label}</span><small>${n.reason}</small><small>${moneyFmt(b.cost)} · ${moneyFmt(b.upkeep)}/Mon. · 🏛️ ${pc}${b.buildMonths?` · ${b.buildMonths} Mon.`:''}</small></button>`}).join('')}<button class="build-btn ${state.selected==='bulldoze'?'selected':''}" data-build="bulldoze"><span class="emoji">🧨</span><b>Abriss</b><small>Kann Versorgung und Zustimmung verschlechtern</small></button></div>`}
 if(which==='finance'){title='Finanzen';sub='Laufender Haushalt, Schulden und politische Stellschrauben';html=`<div class="card"><h3>Einnahmen</h3><div class="stat-row"><span>Einkommensteueranteil</span><b class="good">${moneyFmt(m.residentShare)}</b></div><div class="stat-row"><span>Grundsteuer</span><b>${moneyFmt(m.propertyTax)}</b></div><div class="stat-row"><span>Gewerbesteuer</span><b>${moneyFmt(m.businessTax)}</b></div><div class="stat-row"><span>Gebühren</span><b>${moneyFmt(m.fees)}</b></div><div class="stat-row"><span>Zuweisungen/Energie</span><b>${moneyFmt(m.grants+m.energy)}</b></div><div class="stat-row"><b>Gesamt</b><b class="good">${moneyFmt(m.income)}</b></div></div><div class="card"><h3>Ausgaben</h3><div class="stat-row"><span>Verwaltung</span><b>${moneyFmt(m.admin)}</b></div><div class="stat-row"><span>Einrichtungen</span><b>${moneyFmt(m.facilities)}</b></div><div class="stat-row"><span>Soziales</span><b>${moneyFmt(m.social)}</b></div><div class="stat-row"><span>Straßen</span><b>${moneyFmt(m.roads)}</b></div><div class="stat-row"><span>Kreisumlage</span><b>${moneyFmt(m.levy)}</b></div><div class="stat-row"><span>Zins + Tilgung</span><b>${moneyFmt(m.interest+m.repayment)}</b></div><div class="stat-row"><b>Gesamt</b><b class="bad">${moneyFmt(m.expenses)}</b></div></div><div class="card"><h3>Finanzstatus</h3><div class="stat-row"><span>Betriebssaldo</span><b class="${m.operating>=0?'good':'bad'}">${moneyFmt(m.operating)}</b></div><div class="stat-row"><span>Jahresprognose</span><b>${moneyFmt(m.operating*12)}</b></div><div class="stat-row"><span>Schuldenstand</span><b>${moneyFmt(state.debt)}</b></div><div class="stat-row"><span>Defizitserie</span><b>${state.consecutiveDeficitMonths} Monate</b></div><div class="toolbar-row"><button class="secondary" id="loanBtn">Kredit +250.000 €</button><button class="secondary" id="repayBtn">50.000 € tilgen</button>${state.budgetFreezeMonths?`<button class="danger" disabled>Haushaltssperre ${state.budgetFreezeMonths} Mon.</button>`:'<button class="danger" id="freezeBtn">Haushaltssperre 6 Mon.</button>'}</div></div>${financeRateControl('Grundsteuer','property',state.taxRates.property)}${financeRateControl('Gewerbesteuer','business',state.taxRates.business)}${financeRateControl('Gebühren','fees',state.taxRates.fees)}<div class="card"><h3>Unterhaltspolitik</h3><div class="stat-row"><span>Straßenunterhalt</span><b>${state.maintenanceLevel}%</b></div><div class="toolbar-row"><button class="secondary" data-policy="maintenanceLevel" data-value="80">80%</button><button class="secondary" data-policy="maintenanceLevel" data-value="100">100%</button><button class="secondary" data-policy="maintenanceLevel" data-value="120">120%</button></div><div class="stat-row"><span>Daseinsvorsorge</span><b>${state.serviceFunding}%</b></div><div class="toolbar-row"><button class="secondary" data-policy="serviceFunding" data-value="90">90%</button><button class="secondary" data-policy="serviceFunding" data-value="100">100%</button><button class="secondary" data-policy="serviceFunding" data-value="115">115%</button></div></div>`}
 if(which==='citizens'){title='Einwohner';sub='Bedarf entsteht aus Demografie, Arbeit, Wohnraum und Versorgung';html=`<div class="card"><div class="stat-row"><span>Einwohner</span><b>${numFmt(state.population)}</b></div><div class="stat-row"><span>Wohnkapazität</span><b>${numFmt(m.residentialCapacity)}</b></div><div class="stat-row"><span>Auslastung Wohnraum</span><b class="${m.housingUtil>95?'bad':''}">${m.housingUtil.toFixed(0)}%</b></div><div class="stat-row"><span>Familien/Haushalte</span><b>${numFmt(m.demographics.families)}</b></div><div class="stat-row"><span>Kinder/Jugendliche</span><b>${numFmt(m.demographics.youth)}</b></div><div class="stat-row"><span>Erwerbsalter</span><b>${numFmt(m.demographics.workingAge)}</b></div><div class="stat-row"><span>Senioren</span><b>${numFmt(m.demographics.seniors)}</b></div><div class="stat-row"><span>Arbeitslosigkeit</span><b>${m.unemployment.toFixed(1)}%</b></div></div><div class="card"><h3>Daseinsvorsorge</h3>${meter('Bildung',m.serviceLevels.education,m.serviceLevels.education<60?'bad':'good')}${meter('Sicherheit',m.serviceLevels.safety,m.serviceLevels.safety<60?'bad':'good')}${meter('Gesundheit',m.serviceLevels.health,m.serviceLevels.health<60?'bad':'good')}</div><div class="card"><h3>Standort</h3>${meter('Attraktivität',m.attractiveness,m.attractiveness<45?'bad':'good')}${meter('Wirtschaftsklima',m.businessClimate,m.businessClimate<45?'warn':'good')}<div class="stat-row"><span>Betriebe</span><b>${m.companies}</b></div><div class="stat-row"><span>Pendler</span><b>${m.commuterPool}</b></div></div>`}
 if(which==='politics'){title='Politik';sub='Wiederwahl ist nur ein Teil – auch der Rat kann dich stoppen';const months=48-(state.monthsPlayed%48||0);html=`<div class="election"><h3>🗳️ Nächste Kommunalwahl</h3><div style="font-size:28px;font-weight:900">in ${months} Monaten</div>${meter('Zustimmung',state.approval,state.approval<45?'bad':'good')}${meter('Ratsmehrheit',state.councilSupport,state.councilSupport<35?'bad':'good')}</div><div class="card"><h3>Handlungsfähigkeit</h3><div class="stat-row"><span>Politisches Kapital</span><b>${Math.round(state.politicalCapital)}/100</b></div><div class="stat-row"><span>Verwaltungskapazität</span><b>${state.actionPoints.toFixed(1)}/${state.actionCapacity.toFixed(1)}</b></div><div class="stat-row"><span>Haushaltsaufsicht</span><b>${['keine','Beobachtung','strenge Aufsicht'][state.oversightLevel]}</b></div><div class="stat-row"><span>Offene Problemfristen</span><b>${state.activeIssues.length}</b></div><div class="stat-row"><span>Verpasste Fristen</span><b>${state.neglectedIssues}</b></div></div><h3>Wahlversprechen Amtszeit ${state.termNumber}</h3>${state.mandate.map(id=>promiseCard(id,m)).join('')}<div class="card"><h3>Karriere</h3><div class="stat-row"><span>Wiederwahlen</span><b>${state.electionsWon}</b></div><div class="stat-row"><span>Vermächtnis-Score</span><b>${score}/100</b></div><div class="stat-row"><span>Konjunktur</span><b>${state.economy.toFixed(0)}%</b></div><div class="toolbar-row"><button class="secondary" id="renameBtn">Gemeinde umbenennen</button><button class="danger" id="newGameBtn">Neues Spiel</button></div></div>`}
 if(which==='events'){title='Entscheidungen';sub='Fristen und politische Folgen';html=`${state.activeIssues.length?`<h3>Offene Problemfristen</h3>${state.activeIssues.map(issueCard).join('')}`:''}<h3>Chronik</h3>${state.eventLog.length?state.eventLog.map(e=>`<div class="card"><div class="tag">${e.date}</div><h3>${e.title}</h3><div class="muted">${e.choice}</div></div>`).join(''):'<div class="card">Noch keine besonderen Entscheidungen.</div>'}`}
 $('#panelTitle').textContent=title;$('#panelSubtitle').textContent=sub;$('#panelContent').innerHTML=html;
 document.querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.build;renderPanel('build');showToast(`${b.querySelector('b')?.textContent||'Werkzeug'} ausgewählt`)});document.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>changeRate(b.dataset.rate,+b.dataset.delta));document.querySelectorAll('[data-policy]').forEach(b=>b.onclick=()=>setPolicy(b.dataset.policy,+b.dataset.value));$('#loanBtn')?.addEventListener('click',takeLoan);$('#repayBtn')?.addEventListener('click',repayDebt);$('#freezeBtn')?.addEventListener('click',startBudgetFreeze);
 $('#newGameBtn')?.addEventListener('click',()=>openModal(`<h2>Neues Spiel?</h2><p>Der aktuelle Spielstand wird ersetzt.</p><div class="toolbar-row"><button class="danger" id="confirmReset">Neu starten</button><button class="secondary" id="cancelReset">Abbrechen</button></div>`));setTimeout(()=>{if($('#confirmReset')){$('#confirmReset').onclick=()=>{closeModal();resetGame()};$('#cancelReset').onclick=closeModal}},0);$('#renameBtn')?.addEventListener('click',()=>{const n=prompt('Name deiner Gemeinde:',state.cityName);if(n&&n.trim()){state.cityName=n.trim().slice(0,24);save();updateHUD();renderPanel('politics')}});
}
function showToast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200)}
function openModal(html){$('#modalContent').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden')}
$('.dock').addEventListener('click',e=>{const b=e.target.closest('button[data-panel]');if(b)renderPanel(b.dataset.panel)});$('#closePanel').onclick=()=>$('#panel').classList.remove('open');$('#menuBtn').onclick=()=>renderPanel('overview');document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{state.speed=+b.dataset.speed;document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('active',x===b));save()});
function loop(now){const interval=state.speed===2?1700:state.speed===1?3400:Infinity;if(now-lastTick>interval){lastTick=now;simulateMonth()}draw();requestAnimationFrame(loop)}
window.addEventListener('resize',()=>{resize();fitMap()});window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();showToast('Die App kann über das Browsermenü installiert werden')});if('serviceWorker' in navigator)navigator.serviceWorker.register('service-worker.js').catch(()=>{});
updateHUD();resize();fitMap();renderPanel('overview');requestAnimationFrame(loop);
})();
