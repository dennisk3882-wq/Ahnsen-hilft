
(() => {
  'use strict';

  const SAVE_KEY = 'syndikat_save_v3';
  const LEGACY_SAVE_KEY = 'unterwelt_save_v2';
  const VERSION = 3;
  const AUDIO_KEY = 'syndikat_audio_v3';

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const fmt = n => '$ ' + Math.round(Number(n)||0).toLocaleString('de-DE');
  const pct = n => `${Math.round(Number(n)||0)} %`;
  const rand = (min,max) => Math.floor(Math.random()*(max-min+1))+min;
  const chance = p => Math.random() < clamp(p,0,1);
  const uid = () => Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-5);
  const esc = v => String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
  const weighted = arr => { const total=arr.reduce((a,x)=>a+x.w,0); let r=Math.random()*total; for(const x of arr){r-=x.w;if(r<=0)return x.v;} return arr[arr.length-1]?.v; };

  const DISTRICTS = [
    {id:'oldtown',name:'Altstadt',icon:'◆',desc:'Bars, alte Geschäfte und hohe Laufkundschaft.',demand:1.08,police:1.00,risk:1.00,neutral:470,accent:'#d9ad54'},
    {id:'center',name:'Innenstadt',icon:'▦',desc:'Teure Lagen, Hotels und zahlungskräftige Kundschaft.',demand:1.22,police:1.25,risk:1.10,neutral:680,accent:'#e96862'},
    {id:'station',name:'Bahnhof',icon:'▤',desc:'Schnelles Geld, Schwarzmarkt und hohe Fluktuation.',demand:1.00,police:.92,risk:1.28,neutral:390,accent:'#6ea8ff'},
    {id:'redlight',name:'Rotlichtviertel',icon:'♥',desc:'Nachtleben, Clubs und diskrete Geschäfte.',demand:1.18,police:1.08,risk:1.22,neutral:510,accent:'#ed5c9a'},
    {id:'harbor',name:'Hafen',icon:'⚓',desc:'Lagerhallen, Schmuggel und große Warenströme.',demand:.94,police:.86,risk:1.35,neutral:430,accent:'#57b5c6'},
    {id:'industrial',name:'Industriegebiet',icon:'▧',desc:'Günstige Flächen, Lager und robuste Betriebe.',demand:.88,police:.80,risk:1.12,neutral:410,accent:'#a1aab4'},
    {id:'west',name:'Westend',icon:'♜',desc:'Wohlhabende Kundschaft und hochwertige Immobilien.',demand:1.15,police:1.18,risk:.95,neutral:620,accent:'#b680ff'},
    {id:'south',name:'Südviertel',icon:'●',desc:'Dichte Wohngebiete mit vielen kleinen Standorten.',demand:1.03,police:.95,risk:1.04,neutral:500,accent:'#53d38a'}
  ];

  const MAP_SHAPES = {
    harbor:'50,70 360,45 390,190 260,265 55,235',
    station:'390,55 685,60 700,225 520,250 390,190',
    west:'55,250 260,275 350,405 210,555 45,505',
    oldtown:'270,270 515,250 600,380 470,480 345,405',
    center:'520,260 705,235 810,365 660,485 600,380',
    redlight:'705,75 945,105 950,325 812,365 700,225',
    industrial:'665,495 825,380 955,345 955,585 745,590',
    south:'215,560 470,490 655,500 735,590 360,600'
  };
  const MAP_LABELS = {
    harbor:[190,155],station:[535,145],west:[170,395],oldtown:[420,345],center:[660,350],redlight:[830,210],industrial:[835,500],south:[490,555]
  };

  const BUSINESSES = {
    machines:{name:'3 Spielautomaten',icon:'♣',cost:15000,baseIncome:1100,upkeep:120,risk:7,launder:450,security:20,rep:1,tier:1,influence:18,desc:'Drei einzelne Automaten, frei aufstellbar und zu Routen kombinierbar.'},
    escort:{name:'Begleitservice',icon:'♦',cost:20000,baseIncome:1800,upkeep:350,risk:13,launder:900,security:15,rep:2,tier:1,influence:24,desc:'Hoher Cashflow, aber erhöhte Aufmerksamkeit.'},
    bar:{name:'Bar',icon:'◆',cost:80000,baseIncome:15000,upkeep:2800,risk:11,launder:6000,security:28,rep:5,tier:2,influence:55,desc:'Solider Treffpunkt und gutes Waschgeschäft.'},
    betting:{name:'Wettbüro',icon:'◈',cost:160000,baseIncome:23000,upkeep:4200,risk:14,launder:9000,security:30,rep:7,tier:3,influence:72,desc:'Profitables Geschäft mit hohem Bargeldanteil.'},
    arcade:{name:'Spielsalon',icon:'♠',cost:300000,baseIncome:44000,upkeep:7600,risk:15,launder:17000,security:38,rep:9,tier:3,influence:92,desc:'Großer Umsatz und Platz für zusätzliche Automaten.'},
    club:{name:'Nachtclub',icon:'✦',cost:520000,baseIncome:69000,upkeep:12800,risk:17,launder:28000,security:44,rep:12,tier:4,influence:120,desc:'Prestige, Kontakte und starke Abendumsätze.'},
    luxury:{name:'Luxusclub',icon:'✧',cost:1000000,baseIncome:93000,upkeep:22000,risk:18,launder:42000,security:50,rep:16,tier:4,influence:150,desc:'Exklusiver Treffpunkt für vermögende Gäste.'},
    casino:{name:'Casino',icon:'♛',cost:2400000,baseIncome:230000,upkeep:56000,risk:21,launder:95000,security:60,rep:24,tier:5,influence:205,desc:'Massiver Umsatz, aber ein Magnet für Ermittler.'},
    hotel:{name:'Grandhotel',icon:'▥',cost:10000000,baseIncome:620000,upkeep:155000,risk:10,launder:240000,security:72,rep:40,tier:6,influence:270,desc:'Prestigeobjekt mit hohem legalem Cashflow.'},
    holding:{name:'Holdinggesellschaft',icon:'▣',cost:18000000,baseIncome:820000,upkeep:190000,risk:6,launder:520000,security:80,rep:55,tier:6,influence:330,desc:'Legale Fassade für ein ausgewachsenes Syndikat.'}
  };

  const MACHINE_LOCATIONS = [
    {id:'pub',name:'Kneipe',mult:1.00,risk:1.0},
    {id:'bar',name:'Bar',mult:1.15,risk:1.05},
    {id:'station',name:'Bahnhofskiosk',mult:1.28,risk:1.25},
    {id:'club',name:'Nachtclub',mult:1.42,risk:1.20},
    {id:'arcade',name:'Spielhalle',mult:1.34,risk:1.08},
    {id:'private',name:'Hinterzimmer',mult:.86,risk:.72}
  ];

  const CRIMES = [
    {id:'machine',name:'Automat knacken',desc:'Kleine Beute, sehr geringe Einstiegshürde.',min:200,max:900,success:.90,heat:3,jail:1,ap:1},
    {id:'mug',name:'Passant ausrauben',desc:'Schneller Straßenraub mit überschaubarem Risiko.',min:120,max:1300,success:.88,heat:5,jail:2,ap:1},
    {id:'car',name:'Auto stehlen',desc:'Mehr Geld, aber deutlich größere Entdeckungsgefahr.',min:2200,max:4200,success:.58,heat:8,jail:3,ap:1},
    {id:'bar',name:'Bar überfallen',desc:'Hoher Ertrag, Polizei reagiert schnell.',min:4000,max:11000,success:.46,heat:12,jail:4,ap:1},
    {id:'bank',name:'Bankraub',desc:'Extrem riskant. Nur mit Vorbereitung sinnvoll.',min:50000,max:120000,success:.16,heat:28,jail:6,ap:2}
  ];

  const STAFF = {
    informant:{name:'Informant',icon:'◉',cost:10000,salary:900,desc:'Verbessert Aufklärung, Erfolgsquoten und Informationen über Rivalen.'},
    guard:{name:'Wächter',icon:'▰',cost:3000,salary:500,desc:'Erhöht Betriebssicherheit und erschwert Sabotage.'},
    bodyguard:{name:'Leibwächter',icon:'♜',cost:4000,salary:650,desc:'Senkt persönliches Risiko und schützt Führungspersonal.'},
    gunman:{name:'Revolverheld',icon:'✦',cost:6000,salary:1100,desc:'Wird für Sabotage, Entführung und weitere offensive Operationen benötigt.'},
    lawyer:{name:'Anwalt',icon:'§',cost:8000,salary:1300,desc:'Verkürzt Haft und erhöht Erfolg juristischer Schritte.'},
    manager:{name:'Manager',icon:'▣',cost:12000,salary:1600,desc:'Steigert Erträge und hält Betriebe effizient.'}
  };

  const STAFF_NAMES = ['Marco Bellini','Julia Costa','Vito Serra','Mara Conti','Enzo Vitale','Giulia Rizzo','Luca Ferraro','Sofia Greco','Carlo De Luca','Elena Marino','Nico Romano','Tessa Bianchi','Rico Falcone','Valentina Moretti','Dario Russo','Mina Leone'];
  const TRAITS = [
    {id:'loyal',name:'Loyal',loyalty:14,skill:0,salary:.03},
    {id:'veteran',name:'Veteran',loyalty:3,skill:14,salary:.14},
    {id:'discreet',name:'Diskret',loyalty:6,skill:8,salary:.06},
    {id:'greedy',name:'Gierig',loyalty:-8,skill:7,salary:.20},
    {id:'reckless',name:'Hitzkopf',loyalty:-4,skill:12,salary:.05},
    {id:'charismatic',name:'Charismatisch',loyalty:10,skill:6,salary:.10},
    {id:'nervous',name:'Nervös',loyalty:-2,skill:-5,salary:-.08}
  ];

  const CORRUPTION = {
    officer:{name:'Polizeiwachtmeister',cost:3000,shield:8,desc:'Kleine Kontrollen werden häufiger übersehen.'},
    inspector:{name:'Kommissar',cost:12000,shield:15,desc:'Senkt Heat-Zuwachs und warnt gelegentlich vor Razzien.'},
    judge:{name:'Untersuchungsrichter',cost:30000,shield:22,desc:'Reduziert die Wahrscheinlichkeit langer Haftstrafen.'},
    prosecutor:{name:'Staatsanwalt',cost:70000,shield:30,desc:'Ermittlungsdruck sinkt deutlich; Verfahren können versanden.'},
    mayor:{name:'Bürgermeister',cost:100000,shield:38,desc:'Höchster lokaler Einfluss mit starken Risiko- und Prestigeeffekten.'}
  };

  const AI_PROFILES = [
    {family:'Romano',style:'aggressive',label:'aggressiv'},
    {family:'Moretti',style:'economic',label:'wirtschaftlich'},
    {family:'Costa',style:'corrupt',label:'einflussreich'},
    {family:'Bianchi',style:'smuggler',label:'risikofreudig'},
    {family:'Russo',style:'balanced',label:'ausgewogen'},
    {family:'Conti',style:'defensive',label:'defensiv'},
    {family:'Falcone',style:'economic',label:'expansiv'}
  ];

  const EVENTS = [
    {name:'Großveranstaltung',text:'Bars und Clubs profitieren von einer Großveranstaltung.',apply:p=>incomeBoost(p,['bar','club','luxury'],1.22)},
    {name:'Glücksspielboom',text:'Automaten, Wettbüros und Casinos laufen außergewöhnlich gut.',apply:p=>incomeBoost(p,['machines','betting','arcade','casino'],1.20)},
    {name:'Polizeikontrollen',text:'Die Polizei fährt zusätzliche Kontrollen.',apply:p=>{p.heat=clamp(p.heat+rand(3,9),0,100);}},
    {name:'Schlechte Presse',text:'Negative Berichte drücken die Reputation.',apply:p=>{p.reputation=Math.max(0,p.reputation-rand(1,4));}},
    {name:'Diskreter Investor',text:'Ein diskreter Investor bringt sauberes Kapital.',apply:p=>{const v=rand(3000,12000);p.clean+=v;ledger(p,'Investor',v,'clean');}},
    {name:'Defekte Automaten',text:'Wartungskosten fressen einen Teil der Gewinne.',apply:p=>{const v=Math.min(totalLiquid(p),rand(1000,6000));spend(p,v);ledger(p,'Reparaturen',-v,'expense');}},
    {name:'Loyalitätskrise',text:'Unzufriedenes Personal fordert Aufmerksamkeit.',apply:p=>{const s=activeStaff(p).sort((a,b)=>a.loyalty-b.loyalty)[0];if(s)s.loyalty=Math.max(5,s.loyalty-rand(4,10));}},
    {name:'Straßenfest',text:'Schutzgeld und kleine Geschäfte florieren.',apply:p=>{const v=Math.round(totalProtectionIncome(p)*.35);if(v){p.dirty+=v;ledger(p,'Straßenfest',v,'dirty');}}}
  ];

  const TUTORIAL = [
    ['Willkommen bei Syndikat','Du startest klein. Verdiene Geld durch Aktionen und investiere es in Betriebe, damit dein Syndikat jede Runde automatisch wächst.'],
    ['Die Stadt ist nicht leer','Jedes Viertel besitzt neutralen Grundbesitz. Ein einzelner Automat gibt dir nur wenige Prozent Einfluss. Erst mehrere und größere Betriebe bringen echte Kontrolle.'],
    ['Ausspähen vor dem Handeln','Mit „Viertel auskundschaften“ deckst du Rivalen, Betriebe, Sicherheitslage und lukrative Möglichkeiten auf. Informanten erhöhen die Detailtiefe.'],
    ['Organisation aufbauen','Personal sind jetzt individuelle Figuren mit Fähigkeit, Loyalität, Eigenschaft und Gehalt. Gute Leute machen einen spürbaren Unterschied.'],
    ['Heat und Justiz','Kriminalität erhöht Heat. Kontakte, Untertauchen, Anwälte und Gefängnisaktionen helfen – hohe Aufmerksamkeit kann Razzien auslösen.'],
    ['Gewinnen','Vermögen allein reicht nicht. Kontrolliere Stadtteile, baue Einfluss und Organisation aus und erreiche die notwendige Dominanz für deine gewählte Partielänge.']
  ];

  let state=null, selectedDistrict='oldtown', currentView='city', deferredInstallPrompt=null;
  let audioPrefs=loadAudioPrefs(), audioCtx=null, musicNodes=[];

  function blankPlayer(name,family,type='human',profile='balanced'){
    const p={
      id:uid(),name,family,type,profile,clean:10000,dirty:15000,debt:0,heat:0,reputation:0,
      businesses:[],staff:{informant:0,guard:0,bodyguard:0,gunman:0,lawyer:0,manager:0},staffRoster:[],
      bribes:{officer:false,inspector:false,judge:false,prosecutor:false,mayor:false},pacts:{},alliances:{},relations:{},
      scouting:{},protection:{},routes:[],loans:[],missions:[],stats:{crimesSuccess:0,attacksSuccess:0,scouts:0,protection:0,trades:0},
      jailed:0,actionPoints:3,intel:0,ledger:[],history:[],lastIncome:0,lastExpenses:0,lastLaundered:0,
      eliminated:false,temporaryIncomeMultiplier:1,eventText:'',turnsInDebt:0,lastAction:'Noch keine Aktion',tutorialDone:false
    };
    return p;
  }

  function createGame(){
    const humanCount=+$('#humanCount').value, aiCount=Math.min(+$('#aiCount').value,8-humanCount);
    const pName=$('#playerName').value.trim()||'Spieler 1', family=$('#familyName').value.trim()||'Leone';
    const players=[];
    for(let i=0;i<humanCount;i++) players.push(blankPlayer(i===0?pName:`Spieler ${i+1}`,i===0?family:`Familie ${i+1}`,'human'));
    for(let i=0;i<aiCount;i++){
      const prof=AI_PROFILES[i%AI_PROFILES.length], p=blankPlayer(prof.family,prof.family,'ai',prof.style);
      const mult={easy:.85,normal:1,hard:1.2,boss:1.45}[$('#difficulty').value];p.clean=Math.round(p.clean*mult);p.dirty=Math.round(p.dirty*mult);players.push(p);
    }
    state={version:VERSION,round:1,currentIndex:0,players,settings:{difficulty:$('#difficulty').value,length:$('#gameLength').value},log:[],winnerId:null,gameOver:false,startedAt:Date.now()};
    players.forEach(p=>{initPlayer(p);ensureMissions(p);});
    saveGame();showScreen('gameScreen');currentView='city';renderAll();
    toast('Neue Partie gestartet. Die Stadt ist zunächst überwiegend neutral.');
    setTimeout(()=>startTutorial(0),250);
  }

  function initPlayer(p){
    p.clean=Number(p.clean)||0;p.dirty=Number(p.dirty)||0;p.debt=Number(p.debt)||0;p.heat=Number(p.heat)||0;p.reputation=Number(p.reputation)||0;
    p.businesses=Array.isArray(p.businesses)?p.businesses:[];p.staff=p.staff||{informant:0,guard:0,bodyguard:0,gunman:0,lawyer:0,manager:0};
    p.staffRoster=Array.isArray(p.staffRoster)?p.staffRoster:[];p.bribes=p.bribes||{officer:false,inspector:false,judge:false,prosecutor:false,mayor:false};
    p.pacts=p.pacts||{};p.alliances=p.alliances||{};p.relations=p.relations||{};p.scouting=p.scouting||{};p.protection=p.protection||{};p.routes=Array.isArray(p.routes)?p.routes:[];p.loans=Array.isArray(p.loans)?p.loans:[];
    p.missions=Array.isArray(p.missions)?p.missions:[];p.stats=p.stats||{crimesSuccess:0,attacksSuccess:0,scouts:0,protection:0,trades:0};
    p.ledger=Array.isArray(p.ledger)?p.ledger:[];p.history=Array.isArray(p.history)?p.history:[];p.actionPoints=Number.isFinite(p.actionPoints)?p.actionPoints:3;p.intel=p.intel||0;
    p.temporaryIncomeMultiplier=p.temporaryIncomeMultiplier||1;p.turnsInDebt=p.turnsInDebt||0;p.lastAction=p.lastAction||'Noch keine Aktion';p.eventText=p.eventText||'';p.tutorialDone=!!p.tutorialDone;
    // Migrate old staff counters into individual people.
    if(!p.staffRoster.length && Object.values(p.staff).some(v=>v>0)){
      for(const [role,count] of Object.entries(p.staff)) for(let i=0;i<count;i++) p.staffRoster.push(createStaffPerson(role));
    }
    p.businesses.forEach(b=>{b.level=b.level||1;b.health=Number.isFinite(b.health)?b.health:100;if(b.type==='machines'&&!Array.isArray(b.machines))b.machines=createMachineUnits();});
    syncStaffCounts(p);
  }

  function createStaffPerson(role){
    const def=STAFF[role], trait=TRAITS[rand(0,TRAITS.length-1)], baseSkill=rand(38,78)+trait.skill, loyalty=clamp(rand(48,82)+trait.loyalty,5,100);
    return {id:uid(),role,name:STAFF_NAMES[rand(0,STAFF_NAMES.length-1)],skill:clamp(baseSkill,15,98),loyalty,trait:trait.id,salary:Math.round(def.salary*(1+trait.salary)*(0.90+baseSkill/300)),heldUntil:0};
  }
  function createMachineUnits(){return [0,1,2].map((_,i)=>({id:uid(),name:`Automat ${i+1}`,location:MACHINE_LOCATIONS[i%MACHINE_LOCATIONS.length].id,condition:100}));}
  function activeStaff(p){return (p.staffRoster||[]).filter(s=>!s.heldUntil||s.heldUntil<=state.round);}
  function syncStaffCounts(p){for(const k of Object.keys(STAFF))p.staff[k]=0;for(const s of activeStaff(p))if(p.staff[s.role]!==undefined)p.staff[s.role]++;}
  function roleSkill(p,role){const a=activeStaff(p).filter(s=>s.role===role);return a.length?a.reduce((x,s)=>x+s.skill*(.65+s.loyalty/285),0)/a.length:0;}
  function traitName(id){return TRAITS.find(t=>t.id===id)?.name||id;}

  function totalLiquid(p){return p.clean+p.dirty;}
  function spend(p,amount,allowDebt=true){let a=Math.max(0,Math.round(amount));const c=Math.min(p.clean,a);p.clean-=c;a-=c;const d=Math.min(p.dirty,a);p.dirty-=d;a-=d;if(a>0&&allowDebt)p.debt+=a;return a===0;}
  function assetValue(p){return p.businesses.reduce((s,b)=>s+BUSINESSES[b.type].cost*(b.health/100)*(1+.18*(b.level-1))*.78,0);}
  function staffValue(p){return (p.staffRoster||[]).reduce((s,x)=>s+STAFF[x.role].cost*(.75+x.skill/400),0);}
  function outstandingLoans(p){return (p.loans||[]).reduce((s,l)=>s+l.remaining,0);}
  function netWorth(p){return Math.max(0,totalLiquid(p)+assetValue(p)+staffValue(p)-p.debt-outstandingLoans(p));}
  function businessInfluence(b){const def=BUSINESSES[b.type];return def.influence*(b.health/100)*(1+.15*((b.level||1)-1));}
  function playerInfluence(p,did){return p.businesses.filter(b=>b.district===did).reduce((s,b)=>s+businessInfluence(b),0)+(p.protection?.[did]?.level||0)*18;}
  function totalInfluenceInDistrict(did){const d=DISTRICTS.find(x=>x.id===did);return d.neutral+state.players.filter(p=>!p.eliminated).reduce((s,p)=>s+playerInfluence(p,did),0);}
  function districtShare(p,did){const t=totalInfluenceInDistrict(did);return t?playerInfluence(p,did)/t*100:0;}
  function neutralShare(did){const d=DISTRICTS.find(x=>x.id===did);return d.neutral/totalInfluenceInDistrict(did)*100;}
  function controlledDistricts(p){return DISTRICTS.filter(d=>districtShare(p,d.id)>=50).length;}
  function districtOwner(did){let best=null,bestShare=neutralShare(did);for(const p of state.players.filter(x=>!x.eliminated)){const s=districtShare(p,did);if(s>bestShare){best=p;bestShare=s;}}return bestShare>=50?{player:best,share:bestShare}:{player:null,share:bestShare};}
  function corruptionCount(p){return Object.values(p.bribes).filter(Boolean).length;}
  function powerIndex(p){
    const active=state.players.filter(x=>!x.eliminated), maxNW=Math.max(1,...active.map(netWorth));
    const wealth=(netWorth(p)/maxNW)*32, territory=DISTRICTS.reduce((s,d)=>s+districtShare(p,d.id),0)/(DISTRICTS.length*100)*32;
    const influence=corruptionCount(p)/5*12, org=Math.min(1,activeStaff(p).length/18)*14, rep=Math.min(1,p.reputation/100)*10;
    return clamp(wealth+territory+influence+org+rep,0,100);
  }
  function rankName(p){const n=netWorth(p),pow=powerIndex(p);if(pow>=82||n>=25000000)return'Syndikatschef';if(pow>=65||n>=10000000)return'Pate';if(pow>=48||n>=3000000)return'Unterweltboss';if(pow>=32||n>=1000000)return'Bandenchef';if(pow>=16||n>=250000)return'Geschäftsmann';if(n>=60000)return'Kleinganove';return'Niemand';}
  function currentPlayer(){return state?.players[state.currentIndex];}
  function ledger(p,label,amount,type='misc'){p.ledger.unshift({round:state.round,label,amount,type});if(p.ledger.length>60)p.ledger.length=60;}
  function log(msg){state.log.unshift({round:state.round,msg});if(state.log.length>50)state.log.length=50;}
  function metricCards(items){return items.map(([a,b,c])=>`<div class="metric-card ${c||''}"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join('');}

  function showScreen(id){$$('.screen').forEach(x=>x.classList.toggle('active',x.id===id));}
  function setView(name){currentView=name;$$('.view').forEach(v=>v.classList.toggle('active',v.id===`${name}View`));$$('.nav-btn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));renderAll();}

  function renderAll(){
    if(!state)return;const p=currentPlayer();syncStaffCounts(p);ensureMissions(p);
    $('#roundLabel').textContent=`Runde ${state.round}`;$('#turnLabel').textContent=p.type==='human'?`${p.name} ist am Zug`:`${p.family} handelt…`;
    $('#cashTop').textContent=fmt(totalLiquid(p));$('#heatTop').textContent=`${Math.round(p.heat)} / 100`;$('#powerTop').textContent=pct(powerIndex(p));$('#rankChip').textContent=rankName(p);
    const b=$('#statusBanner');
    if(p.jailed>0){b.className='status-banner danger';b.textContent=`Gefängnis: Noch ${p.jailed} Runde${p.jailed===1?'':'n'}. Nutze die Aktionen, um Haft zu verkürzen oder Kontakte aufzubauen.`;}
    else if(p.debt>0){b.className='status-banner';b.textContent=`Schulden: ${fmt(p.debt)} · ${p.turnsInDebt}/6 Runden im Minus. Ab Runde 6 droht Pfändung.`;}else b.className='status-banner hidden';
    renderCity();renderBusinesses();renderActions();renderStaff();renderCorruption();renderFinance();renderMissions();renderRanking();
    $('#endTurnBtn').disabled=p.type!=='human'||state.gameOver;$('#endTurnDesktop').disabled=p.type!=='human'||state.gameOver;if(state.gameOver)showGameOver();
  }

  function mapFillFor(did,p){const s=districtShare(p,did), owner=districtOwner(did);if(owner.player?.id===p.id)return `rgba(217,173,84,${.20+Math.min(.55,s/120)})`;if(owner.player)return 'rgba(224,83,78,.30)';if(s>0)return `rgba(217,173,84,${.10+Math.min(.25,s/150)})`;return 'rgba(50,62,77,.62)';}
  function renderCity(){
    const p=currentPlayer();$('#cityTitle').textContent=`${p.family}: ${rankName(p)} · ${controlledDistricts(p)} Viertel kontrolliert`;
    $('#districtGrid').classList.add('city-map-stage');
    $('#districtGrid').innerHTML=`<svg class="city-svg" viewBox="0 0 1000 620" role="img" aria-label="Interaktive Stadtkarte">
      <defs><filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <path class="road" d="M20 300 C230 205 355 285 520 195 S800 170 980 260"/><path class="road" d="M220 20 C250 180 430 250 370 610"/><path class="road" d="M640 20 C610 195 700 325 760 610"/><path class="road thin" d="M20 470 C280 430 545 460 980 420"/>
      ${DISTRICTS.map(d=>{const l=MAP_LABELS[d.id],s=districtShare(p,d.id),own=districtOwner(d.id);const ownerTxt=own.player?own.player.family:'Neutral';return `<g class="map-district ${selectedDistrict===d.id?'selected':''}" data-district="${d.id}"><polygon points="${MAP_SHAPES[d.id]}" fill="${mapFillFor(d.id,p)}" stroke="${d.accent}"/><text x="${l[0]}" y="${l[1]}" class="map-name">${esc(d.name)}</text><text x="${l[0]}" y="${l[1]+27}" class="map-share">Du ${Math.round(s)}% · ${esc(ownerTxt)}</text></g>`;}).join('')}
      <circle class="map-pulse" cx="420" cy="345" r="7"/><circle class="map-pulse p2" cx="830" cy="210" r="6"/>
    </svg>`;
    $$('#districtGrid [data-district]').forEach(el=>el.onclick=()=>{selectedDistrict=el.dataset.district;renderCity();});
    const d=DISTRICTS.find(x=>x.id===selectedDistrict),share=districtShare(p,d.id),businesses=p.businesses.filter(b=>b.district===d.id),owner=districtOwner(d.id),scout=p.scouting?.[d.id],prot=p.protection?.[d.id];
    const c=$('#districtControl');c.textContent=share>=50?'Kontrolliert':share>=25?'Starker Einfluss':share>0?'Präsenz':'Neutral';c.className=`pill ${share>=50?'good':''}`;
    const intelText=scout?`Intel Runde ${scout.round} · Stufe ${scout.level}`:'Noch nicht ausgekundschaftet';
    $('#districtDetail').innerHTML=`
      <p style="color:var(--muted);margin-top:0">${esc(d.desc)}</p>
      <div class="district-stats">
        <div class="mini-metric"><small>Dein Anteil</small><strong>${pct(share)}</strong></div><div class="mini-metric"><small>Neutraler Grundbesitz</small><strong>${pct(neutralShare(d.id))}</strong></div>
        <div class="mini-metric"><small>Deine Betriebe</small><strong>${businesses.length}</strong></div><div class="mini-metric"><small>Kontrolle</small><strong>${owner.player?esc(owner.player.family):'Neutral'}</strong></div>
        <div class="mini-metric"><small>Nachfrage</small><strong>${pct(d.demand*100)}</strong></div><div class="mini-metric"><small>Polizeidruck</small><strong>${pct(d.police*100)}</strong></div>
        <div class="mini-metric"><small>Schutzgeldnetz</small><strong>${prot?`Stufe ${prot.level}`:'Keins'}</strong></div><div class="mini-metric"><small>Aufklärung</small><strong>${esc(intelText)}</strong></div>
      </div>
      <div class="district-actions"><button class="btn btn-primary" data-action="buy-here">Geschäft kaufen</button><button class="btn btn-secondary" data-action="intel-district">${scout&&state.round-scout.round<=1?'Intel ansehen':'Viertel auskundschaften'}</button><button class="btn btn-secondary" data-action="protection-here">Schutzgeld</button></div>`;
    $('[data-action="buy-here"]',$('#districtDetail')).onclick=()=>openBuyDialog(d.id);$('[data-action="intel-district"]',$('#districtDetail')).onclick=()=>doScoutDistrict(d.id);$('[data-action="protection-here"]',$('#districtDetail')).onclick=()=>buildProtection(d.id);
    const ordered=[...state.players].filter(x=>!x.eliminated).sort((a,b)=>powerIndex(b)-powerIndex(a));
    $('#situationList').innerHTML=`<div class="situation-item"><span>Stärkster Rivale</span><strong>${esc(ordered.find(x=>x.id!==p.id)?.family||'Keiner')}</strong></div><div class="situation-item"><span>Dein Nettovermögen</span><strong>${fmt(netWorth(p))}</strong></div><div class="situation-item"><span>Letzte Einnahmen</span><strong style="color:var(--green)">${fmt(p.lastIncome)}</strong></div><div class="situation-item"><span>Letzte Aktion</span><strong>${esc(p.lastAction)}</strong></div><div class="situation-item"><span>Letztes Ereignis</span><strong>${esc(p.eventText||'Ruhige Lage')}</strong></div>`;
  }

  function renderBusinesses(){
    const p=currentPlayer(),gross=p.businesses.reduce((s,b)=>s+estimateIncome(p,b),0),upkeep=p.businesses.reduce((s,b)=>s+BUSINESSES[b.type].upkeep*(1+.08*((b.level||1)-1)),0)+staffPayroll(p),wash=p.businesses.reduce((s,b)=>s+BUSINESSES[b.type].launder*(1+.12*((b.level||1)-1)),0);
    $('#businessSummary').innerHTML=metricCards([['Betriebe',p.businesses.length,''],['Erwarteter Umsatz',fmt(gross),'positive'],['Laufende Kosten',fmt(upkeep),'negative'],['Waschkapazität',fmt(wash),'']]);
    if(!p.businesses.length){$('#businessList').innerHTML='<div class="panel empty-state">Noch kein Besitz. Ein Automatenpaket ist der günstigste Einstieg, gibt durch den neutralen Grundbesitz aber nur wenige Prozent Viertel-Einfluss.</div>';return;}
    $('#businessList').innerHTML=p.businesses.map(b=>{const def=BUSINESSES[b.type],d=DISTRICTS.find(x=>x.id===b.district),route=b.routeId?p.routes.find(r=>r.id===b.routeId):null;return `<article class="business-card"><div class="title"><strong>${def.icon} ${esc(b.name||def.name)}</strong><small>${esc(d.name)} · Stufe ${b.level||1}${route?` · ${esc(route.name)}`:''}</small></div><div class="business-stat mobile-keep"><small>Ertrag</small><span>${fmt(estimateIncome(p,b))}</span></div><div class="business-stat"><small>Einfluss</small><span>${Math.round(businessInfluence(b))}</span></div><div class="business-stat hide-md"><small>Geldwäsche</small><span>${fmt(def.launder)}</span></div><div class="business-stat hide-md"><small>Sicherheit</small><span>${Math.round(businessSecurity(p,b))}%</span></div><div class="business-stat"><small>Zustand ${Math.round(b.health)}%</small><div class="healthbar"><i style="width:${b.health}%"></i></div></div><button class="icon-btn" data-biz="${b.id}">•••</button></article>`;}).join('');
    $$('#businessList [data-biz]').forEach(btn=>btn.onclick=()=>openBusinessDialog(btn.dataset.biz));
  }

  function operationPanelHtml(){return `<div class="panel-head"><h3>Syndikatsaktionen</h3><small>Rivalen, Schutz und Beziehungen</small></div><div class="button-grid"><button class="btn btn-danger" data-op="attack">Sabotage</button><button class="btn btn-danger" data-op="kidnap">Entführung</button><button class="btn btn-danger" data-op="assassinate">Mordanschlag</button><button class="btn btn-secondary" data-op="protection">Schutzgeld</button><button class="btn btn-secondary" data-op="intel">Informationen</button><button class="btn btn-secondary" data-op="cooldown">Untertauchen</button><button class="btn btn-secondary" data-op="diplomacy">Diplomatie</button><button class="btn btn-secondary" data-op="missions">Aufträge</button></div>`;}
  function renderActions(){
    const p=currentPlayer();$('#actionPoints').textContent=`${p.actionPoints} AP`;const panel=$('#actionsView .action-panel');
    if(p.jailed>0){$('#crimeGrid').innerHTML=[
      ['appeal','Berufung vorbereiten','Anwälte und Einfluss nutzen, um die Resthaft zu reduzieren.','1 AP · ab $ 3.000'],['guardbribe','Wache bestechen','Riskanter, aber schneller Weg zu einer früheren Entlassung.','1 AP · $ 7.500'],['network','Gefängnisnetzwerk','Kontakte knüpfen, Reputation und eventuell einen Informanten gewinnen.','1 AP'],['escape','Fluchtversuch','Hohe Chance auf zusätzliche Haft bei Misserfolg.','2 AP · hohes Risiko']
    ].map(x=>`<article class="crime-card"><h3>${x[1]}</h3><p>${x[2]}</p><div class="crime-meta"><span>${x[3]}</span></div><button class="btn btn-secondary" data-prison="${x[0]}" ${p.actionPoints<(x[0]==='escape'?2:1)?'disabled':''}>Ausführen</button></article>`).join('');panel.innerHTML='<div class="panel-head"><h3>Organisation aus der Haft</h3><small>Deine Betriebe laufen weiter</small></div><div style="padding:1rem;color:var(--muted)">Nutze deine Aktionspunkte für juristische Schritte, Kontakte oder einen riskanten Fluchtversuch.</div>';$$('[data-prison]').forEach(b=>b.onclick=()=>doPrisonAction(b.dataset.prison));return;}
    $('#crimeGrid').innerHTML=CRIMES.map(c=>{const success=crimeSuccess(p,c);return `<article class="crime-card"><h3>${c.name}</h3><p>${c.desc}</p><div class="crime-meta"><span>Erfolg ${Math.round(success*100)}%</span><span>Heat +${c.heat}</span><span>Beute ${fmt(c.min)}–${fmt(c.max)}</span><span>${c.ap} AP</span></div><button class="btn btn-secondary" data-crime="${c.id}" ${p.actionPoints<c.ap?'disabled':''}>Ausführen</button></article>`;}).join('');
    $$('#crimeGrid [data-crime]').forEach(b=>b.onclick=()=>doCrime(b.dataset.crime));panel.innerHTML=operationPanelHtml();
    $('[data-op="attack"]',panel).onclick=openAttackDialog;$('[data-op="kidnap"]',panel).onclick=openKidnapDialog;$('[data-op="assassinate"]',panel).onclick=openAssassinationDialog;$('[data-op="protection"]',panel).onclick=openProtectionDialog;$('[data-op="intel"]',panel).onclick=()=>doScoutDistrict(selectedDistrict);$('[data-op="cooldown"]',panel).onclick=cooldown;$('[data-op="diplomacy"]',panel).onclick=openDiplomacyDialog;$('[data-op="missions"]',panel).onclick=()=>setView('missions');
  }

  function renderStaff(){
    const p=currentPlayer(),people=p.staffRoster||[];
    $('#staffGrid').innerHTML=`<article class="shop-card staff-recruit"><div class="shop-top"><div><small class="eyebrow">Rekrutierung</small><h3>Neue Leute anwerben</h3></div><span class="owned">${activeStaff(p).length}</span></div><p>Jede Rekrutierung erzeugt eine individuelle Figur mit Fähigkeit, Loyalität, Eigenschaft und eigenem Gehalt.</p><footer><button class="btn btn-primary" data-recruit>Personal wählen</button></footer></article>`+
      (people.length?people.map(s=>{const held=s.heldUntil>state.round;return `<article class="shop-card person-card ${held?'held':''}"><div class="shop-top"><div><small class="eyebrow">${STAFF[s.role].icon} ${esc(STAFF[s.role].name)}</small><h3>${esc(s.name)}</h3></div><span class="owned">${held?'ENTFÜHRT':s.skill}</span></div><p>${esc(traitName(s.trait))} · Fähigkeit ${s.skill}/100 · Loyalität ${s.loyalty}/100${held?` · bis Runde ${s.heldUntil}`:''}</p><div class="loyalty"><i style="width:${s.loyalty}%"></i></div><footer><span class="price">${fmt(s.salary)}/R</span><button class="btn btn-secondary" data-staff-person="${s.id}">Details</button></footer></article>`;}).join(''):'');
    $('[data-recruit]')?.addEventListener('click',openRecruitDialog);$$('[data-staff-person]').forEach(b=>b.onclick=()=>openStaffPerson(b.dataset.staffPerson));
  }

  function renderCorruption(){const p=currentPlayer();$('#corruptionGrid').innerHTML=Object.entries(CORRUPTION).map(([k,c])=>`<article class="shop-card"><div class="shop-top"><div><small class="eyebrow">Einfluss</small><h3>${esc(c.name)}</h3></div><span class="owned">${p.bribes[k]?'✓':'–'}</span></div><p>${esc(c.desc)}</p><footer><span class="price">${fmt(c.cost)}</span><button class="btn ${p.bribes[k]?'btn-ghost':'btn-secondary'}" data-bribe="${k}" ${p.bribes[k]||p.jailed?'disabled':''}>${p.bribes[k]?'Aktiv':'Bestechen'}</button></footer></article>`).join('');$$('#corruptionGrid [data-bribe]').forEach(b=>b.onclick=()=>buyBribe(b.dataset.bribe));}

  function renderFinance(){
    const p=currentPlayer(),loanTotal=outstandingLoans(p);$('#financeMetrics').innerHTML=metricCards([['Sauberes Geld',fmt(p.clean),'positive'],['Schmutziges Geld',fmt(p.dirty),''],['Besitzwert',fmt(assetValue(p)),''],['Kredite',fmt(loanTotal),'negative'],['Sonstige Schulden',fmt(p.debt),'negative'],['Nettovermögen',fmt(netWorth(p)),'positive']]);
    const loanRows=(p.loans||[]).map(l=>`<div class="ledger-row"><span class="muted">Bankkredit</span><span>${fmt(l.remaining)} offen · ${Math.round(l.rate*100)}% Zins/R</span><strong class="minus">Rate ${fmt(l.payment)}</strong></div>`).join('');
    $('#ledgerList').innerHTML=`<div class="finance-actions"><button class="btn btn-primary" data-loan>Kredit aufnehmen</button><button class="btn btn-secondary" data-export>Spielstand exportieren</button></div>${p.debt>0?`<div class="debt-repay"><div><strong>Offene sonstige Schulden: ${fmt(p.debt)}</strong><div class="muted">Verfügbar: ${fmt(totalLiquid(p))}</div></div><button class="btn btn-primary" data-repay ${totalLiquid(p)<=0?'disabled':''}>Tilgen</button></div>`:''}${loanRows}${p.ledger.length?p.ledger.slice(0,20).map(x=>`<div class="ledger-row"><span class="muted">Runde ${x.round}</span><span>${esc(x.label)}</span><strong class="${x.amount>=0?'plus':'minus'}">${x.amount>=0?'+':''}${fmt(x.amount)}</strong></div>`).join(''):'<div class="empty-state">Noch keine Buchungen.</div>'}`;
    $('[data-repay]')?.addEventListener('click',repayDebt);$('[data-loan]')?.addEventListener('click',openLoanDialog);$('[data-export]')?.addEventListener('click',exportSave);if(currentView==='finance')requestAnimationFrame(drawChart);
  }

  function renderMissions(){const p=currentPlayer();ensureMissions(p);const el=$('#missionList');if(!el)return;el.innerHTML=p.missions.map(m=>{const pr=missionProgress(p,m);return `<article class="mission-card panel"><div><p class="eyebrow">Auftrag</p><h3>${esc(m.title)}</h3><p>${esc(m.desc)}</p></div><div class="mission-progress"><div class="progress"><i style="width:${Math.min(100,pr.percent)}%"></i></div><small>${esc(pr.label)}</small></div><footer><span>Belohnung: ${fmt(m.reward)} + ${m.rep} Ruf</span><button class="btn ${pr.done?'btn-primary':'btn-secondary'}" data-claim="${m.id}" ${pr.done?'':'disabled'}>${pr.done?'Belohnung holen':'Läuft'}</button></footer></article>`;}).join('');$$('[data-claim]',el).forEach(b=>b.onclick=()=>claimMission(b.dataset.claim));}

  function renderRanking(){const sorted=[...state.players].sort((a,b)=>powerIndex(b)-powerIndex(a));$('#rankingList').innerHTML=sorted.map((p,i)=>`<article class="rank-row ${p.id===currentPlayer().id?'me':''}"><div class="rank-no">#${i+1}</div><div class="rank-name"><strong>${esc(p.family)}</strong><small>${p.type==='ai'?'KI · '+esc(p.profile):'Spieler'} · ${esc(rankName(p))}</small></div><div><small class="muted">Macht</small><strong>${pct(powerIndex(p))}</strong></div><div><small class="muted">Vermögen</small><strong>${fmt(netWorth(p))}</strong></div><div><small class="muted">Viertel</small><strong>${controlledDistricts(p)}</strong></div></article>`).join('');}

  function machineBundleMultiplier(p,b){if(b.type!=='machines'||!b.machines?.length)return 1;const locAvg=b.machines.reduce((s,m)=>s+(MACHINE_LOCATIONS.find(x=>x.id===m.location)?.mult||1)*(m.condition/100),0)/b.machines.length;const route=b.routeId?p.routes.find(r=>r.id===b.routeId):null;return locAvg*(route?1+.07*(route.level||1):1);}
  function allianceBonus(p){return Math.min(.10,Object.keys(p.alliances||{}).filter(id=>(p.alliances[id]||0)>=state.round).length*.025);}
  function estimateIncome(p,b){const def=BUSINESSES[b.type],d=DISTRICTS.find(x=>x.id===b.district),manager=1+Math.min(.35,(roleSkill(p,'manager')/100)*.18+p.staff.manager*.015),control=districtShare(p,b.district)>=50?1.10:1,level=1+.16*((b.level||1)-1);return def.baseIncome*d.demand*(b.health/100)*manager*control*level*machineBundleMultiplier(p,b)*(1+allianceBonus(p))*p.temporaryIncomeMultiplier;}
  function businessSecurity(p,b){const def=BUSINESSES[b.type];return clamp(def.security+roleSkill(p,'guard')*.16+roleSkill(p,'bodyguard')*.06+(b.level-1)*5,0,96);}
  function staffPayroll(p){return activeStaff(p).reduce((s,x)=>s+x.salary,0);}
  function shield(p){let s=0;for(const [k,v] of Object.entries(p.bribes))if(v)s+=CORRUPTION[k].shield;return Math.min(65,s);}
  function crimeSuccess(p,c){const info=Math.min(.18,roleSkill(p,'informant')/500+p.intel*.02),gun=c.id==='bank'?roleSkill(p,'gunman')/800:0,heatPenalty=Math.max(0,(p.heat-35)/300);return clamp(c.success+info+gun-heatPenalty,.05,.97);}

  function doCrime(id){const p=currentPlayer(),c=CRIMES.find(x=>x.id===id);if(!p||p.type!=='human'||p.jailed||p.actionPoints<c.ap)return;p.actionPoints-=c.ap;const success=chance(crimeSuccess(p,c)),shieldFactor=1-shield(p)/100;p.heat=clamp(p.heat+c.heat*shieldFactor,0,100);if(success){let take=rand(c.min,c.max);if(c.id==='bank')take=Math.round(take*(1+p.staff.gunman*.04));p.dirty+=take;p.reputation+=Math.max(1,Math.round(c.heat/5));p.stats.crimesSuccess++;p.lastAction=`${c.name}: erfolgreich`;ledger(p,c.name,take,'dirty');toast(`${c.name} erfolgreich: +${fmt(take)}.`);}else{const jailChance=clamp(.24+c.heat/100+p.heat/180-shield(p)/160-roleSkill(p,'lawyer')/900,.08,.82);if(chance(jailChance)){let rounds=Math.max(1,c.jail-Math.floor(p.staff.lawyer/2)-(p.bribes.judge?1:0));p.jailed=Math.max(p.jailed,rounds);p.lastAction=`${c.name}: festgenommen`;toast(`Festgenommen: ${rounds} Runde${rounds===1?'':'n'} Haft.`);}else{p.lastAction=`${c.name}: gescheitert`;toast('Gescheitert, aber entkommen.');}}saveGame();renderAll();}

  function openRecruitDialog(){const p=currentPlayer();if(p.jailed)return toast('Aus der Haft kannst du niemanden regulär anwerben.');openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Personalmarkt</p><h2>Rolle auswählen</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${Object.entries(STAFF).map(([k,s])=>`<div class="dialog-option"><div><strong>${s.icon} ${esc(s.name)}</strong><p>${esc(s.desc)}<br>Grundgehalt etwa ${fmt(s.salary)}/R</p></div><button class="btn btn-primary" data-hire="${k}" ${totalLiquid(p)<s.cost?'disabled':''}>${fmt(s.cost)}</button></div>`).join('')}</div></div>`);$$('[data-hire]').forEach(b=>b.onclick=()=>hireStaff(b.dataset.hire));}
  function hireStaff(key){const p=currentPlayer(),s=STAFF[key];if(!s||p.jailed)return;if(totalLiquid(p)<s.cost)return toast('Nicht genug Kapital.');spend(p,s.cost);const person=createStaffPerson(key);p.staffRoster.push(person);syncStaffCounts(p);p.lastAction=`${person.name} angeworben`;ledger(p,`${s.name} angeworben`,-s.cost,'expense');closeDialog();saveGame();renderAll();toast(`${person.name} (${s.name}) ist jetzt Teil deiner Organisation.`);}
  function openStaffPerson(id){const p=currentPlayer(),s=p.staffRoster.find(x=>x.id===id);if(!s)return;const bonusCost=5000;openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">${esc(STAFF[s.role].name)}</p><h2>${esc(s.name)}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="finance-grid">${metricCards([['Fähigkeit',`${s.skill}/100`,''],['Loyalität',`${s.loyalty}/100`,s.loyalty>60?'positive':''],['Eigenschaft',traitName(s.trait),''],['Gehalt',fmt(s.salary)+'/R','negative']])}</div><div class="dialog-footer"><button class="btn btn-secondary" data-bonus ${totalLiquid(p)<bonusCost?'disabled':''}>Bonus ${fmt(bonusCost)}</button><button class="btn btn-danger" data-fire>Entlassen</button></div></div>`);$('[data-bonus]')?.addEventListener('click',()=>{spend(p,bonusCost);s.loyalty=clamp(s.loyalty+rand(10,18),0,100);ledger(p,`Bonus für ${s.name}`,-bonusCost,'expense');closeDialog();saveGame();renderAll();toast('Loyalität gestiegen.');});$('[data-fire]').onclick=()=>{p.staffRoster=p.staffRoster.filter(x=>x.id!==id);syncStaffCounts(p);closeDialog();saveGame();renderAll();toast('Mitarbeiter entlassen.');};}
  function buyBribe(key){const p=currentPlayer(),c=CORRUPTION[key];if(!c||p.bribes[key]||p.jailed)return;if(totalLiquid(p)<c.cost)return toast('Nicht genug Kapital.');spend(p,c.cost);p.bribes[key]=true;p.reputation+=2;ledger(p,`${c.name} bestochen`,-c.cost,'expense');p.lastAction='Einfluss ausgebaut';saveGame();renderAll();toast(`Kontakt zu ${c.name} aufgebaut.`);}

  function doScoutDistrict(did){const p=currentPlayer(),old=p.scouting?.[did];if(old&&state.round-old.round<=1)return openDistrictIntel(did);if(p.jailed||p.actionPoints<1)return toast('Keine Aktionspunkte verfügbar.');const cost=1200;if(totalLiquid(p)<cost)return toast(`Du brauchst ${fmt(cost)} für Informanten und Auslagen.`);spend(p,cost);p.actionPoints--;const lvl=clamp(1+Math.floor(roleSkill(p,'informant')/35),1,3);p.scouting[did]={round:state.round,level:lvl};p.intel=Math.min(5,p.intel+1);p.stats.scouts++;p.lastAction=`${DISTRICTS.find(d=>d.id===did).name} ausgekundschaftet`;ledger(p,'Viertel ausgekundschaftet',-cost,'expense');saveGame();renderAll();openDistrictIntel(did);}
  function openDistrictIntel(did){const p=currentPlayer(),d=DISTRICTS.find(x=>x.id===did),intel=p.scouting?.[did];if(!intel)return toast('Dieses Viertel wurde noch nicht ausgekundschaftet.');const age=state.round-intel.round,level=intel.level;const rows=state.players.filter(x=>!x.eliminated).map(r=>{const sh=districtShare(r,did),biz=r.businesses.filter(b=>b.district===did);let detail=`Einfluss ${Math.round(sh)}%`;if(level>=2)detail+=` · ${biz.length} Betriebe${biz.length?`: ${biz.slice(0,4).map(b=>BUSINESSES[b.type].name).join(', ')}`:''}`;if(level>=3&&biz.length)detail+=` · Ø Sicherheit ${Math.round(biz.reduce((s,b)=>s+businessSecurity(r,b),0)/biz.length)}%`;return `<div class="intel-row"><strong>${esc(r.family)}${r.id===p.id?' (du)':''}</strong><span>${esc(detail)}</span></div>`;}).join('');const roi=Object.entries(BUSINESSES).map(([k,b])=>({k,b,roi:b.baseIncome*d.demand/b.cost})).sort((a,b)=>b.roi-a.roi).slice(0,3);openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Aufklärung Stufe ${level}</p><h2>${esc(d.name)}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="intel-summary"><span>Intel: Runde ${intel.round}${age>2?' · veraltet':''}</span><span>Neutral: ${Math.round(neutralShare(did))}%</span><span>Polizei: ${pct(d.police*100)}</span></div><div class="intel-list">${rows}</div><h3>Lukrative Möglichkeiten</h3><div class="dialog-list">${roi.map(x=>`<div class="dialog-option"><div><strong>${x.b.icon} ${esc(x.b.name)}</strong><p>Erwarteter Basisertrag ${fmt(x.b.baseIncome*d.demand)}/R · Einfluss ${x.b.influence}</p></div><button class="btn btn-primary" data-intel-buy="${x.k}">${fmt(x.b.cost)}</button></div>`).join('')}</div></div>`);$$('[data-intel-buy]').forEach(b=>b.onclick=()=>{closeDialog();openBuyDialog(did,b.dataset.intelBuy);});}
  function cooldown(){const p=currentPlayer();if(p.jailed||p.actionPoints<1)return toast('Keine Aktionspunkte verfügbar.');p.actionPoints--;const reduction=rand(10,18)+Math.round(shield(p)/8)+Math.round(roleSkill(p,'lawyer')/25);p.heat=clamp(p.heat-reduction,0,100);p.lastAction='Untergetaucht';saveGame();renderAll();toast(`Heat um ${reduction} gesenkt.`);}

  function protectionCompetitors(p,did){return state.players.filter(x=>x.id!==p.id&&!x.eliminated&&(x.protection?.[did]?.level||0)>0).length;}
  function protectionIncome(p,did){const pr=p.protection?.[did];if(!pr)return 0;const d=DISTRICTS.find(x=>x.id===did),competition=Math.max(.55,1-protectionCompetitors(p,did)*.12),control=1+districtShare(p,did)/180;return Math.round((2200+pr.level*1700)*pr.level*d.demand*competition*control);}
  function totalProtectionIncome(p){return DISTRICTS.reduce((s,d)=>s+protectionIncome(p,d.id),0);}
  function openProtectionDialog(){const p=currentPlayer();openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Straßenkontrolle</p><h2>Schutzgeldnetze</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${DISTRICTS.map(d=>{const pr=p.protection?.[d.id],next=(pr?.level||0)+1;return `<div class="dialog-option"><div><strong>${esc(d.name)} · ${pr?`Stufe ${pr.level}`:'kein Netz'}</strong><p>${pr?`Aktuell ca. ${fmt(protectionIncome(p,d.id))}/R`:`Aufbau erzeugt wiederkehrende schmutzige Einnahmen.`}</p></div><button class="btn btn-secondary" data-protect="${d.id}" ${next>3?'disabled':''}>${next>3?'Maximal':`Ausbauen ${fmt(2500*next)}`}</button></div>`;}).join('')}</div></div>`);$$('[data-protect]').forEach(b=>b.onclick=()=>buildProtection(b.dataset.protect));}
  function buildProtection(did){const p=currentPlayer();if(p.jailed||p.actionPoints<1)return toast('Dafür brauchst du 1 Aktionspunkt.');if(p.staff.gunman<1&&p.reputation<6)return toast('Du brauchst mindestens einen Revolverhelden oder mehr Reputation.');const level=p.protection?.[did]?.level||0;if(level>=3)return toast('Das Netz ist bereits maximal ausgebaut.');const cost=2500*(level+1);if(totalLiquid(p)<cost)return toast('Nicht genug Kapital.');spend(p,cost);p.actionPoints--;const d=DISTRICTS.find(x=>x.id===did),success=.62+p.staff.gunman*.045+roleSkill(p,'bodyguard')/850-d.police*.08;if(chance(success)){p.protection[did]={level:level+1,started:state.round};p.stats.protection++;p.reputation+=2;p.lastAction=`Schutzgeld in ${d.name}`;toast(`Schutzgeldnetz in ${d.name} auf Stufe ${level+1}.`);}else{p.heat=clamp(p.heat+10,0,100);toast('Die Aktion scheitert und zieht Polizeiaufmerksamkeit auf sich.');}ledger(p,'Schutzgeldnetz',-cost,'expense');closeDialog();saveGame();renderAll();}

  function relation(a,b){return a.relations?.[b.id]||0;}
  function adjustRelation(a,b,delta){a.relations=a.relations||{};b.relations=b.relations||{};a.relations[b.id]=clamp((a.relations[b.id]||0)+delta,-100,100);b.relations[a.id]=clamp((b.relations[a.id]||0)+delta,-100,100);}
  function pactActive(a,b){return (a.pacts?.[b.id]||0)>=state.round;}
  function allianceActive(a,b){return (a.alliances?.[b.id]||0)>=state.round;}
  function openDiplomacyDialog(){const p=currentPlayer();if(p.jailed)return toast('Aus der Haft sind neue Abkommen kaum verhandelbar.');const rivals=state.players.filter(x=>x.id!==p.id&&!x.eliminated);openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Beziehungen</p><h2>Diplomatie & Handel</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${rivals.map(r=>`<div class="diplomacy-card"><div><strong>${esc(r.family)}</strong><p>Beziehung ${relation(p,r)} · Macht ${pct(powerIndex(r))}${pactActive(p,r)?` · NAP bis R${p.pacts[r.id]}`:''}${allianceActive(p,r)?` · Bündnis bis R${p.alliances[r.id]}`:''}</p></div><div class="mini-actions"><button class="btn btn-secondary" data-gift="${r.id}">Geschenk</button><button class="btn btn-secondary" data-pact="${r.id}" ${pactActive(p,r)?'disabled':''}>Nichtangriff</button><button class="btn btn-secondary" data-alliance="${r.id}" ${allianceActive(p,r)?'disabled':''}>Bündnis</button><button class="btn btn-primary" data-trade="${r.id}">Handel</button></div></div>`).join('')}</div></div>`);$$('[data-gift]').forEach(b=>b.onclick=()=>diplomaticGift(b.dataset.gift));$$('[data-pact]').forEach(b=>b.onclick=()=>offerPact(b.dataset.pact));$$('[data-alliance]').forEach(b=>b.onclick=()=>offerAlliance(b.dataset.alliance));$$('[data-trade]').forEach(b=>b.onclick=()=>openTradeDialog(b.dataset.trade));}
  function targetAccepts(p,t,base){if(t.type==='human')return confirm(`${t.name} / ${t.family}: Angebot annehmen?`);let v=base+relation(p,t)/180+(powerIndex(p)-powerIndex(t))/400;if(t.profile==='aggressive')v-=.08;if(t.profile==='defensive')v+=.05;return chance(clamp(v,.08,.92));}
  function diplomaticGift(tid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),cost=10000;if(totalLiquid(p)<cost)return toast('Du brauchst 10.000 $.');spend(p,cost);t.clean+=Math.round(cost*.7);adjustRelation(p,t,18);p.reputation++;ledger(p,`Geschenk an ${t.family}`,-cost,'expense');closeDialog();saveGame();renderAll();toast(`Beziehung zu ${t.family} verbessert.`);}
  function offerPact(tid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),cost=5000;if(totalLiquid(p)<cost)return toast('Du brauchst 5.000 $.');spend(p,cost);ledger(p,'Diplomatische Vermittlung',-cost,'expense');if(targetAccepts(p,t,.58)){p.pacts[t.id]=state.round+6;t.pacts[p.id]=state.round+6;adjustRelation(p,t,8);toast(`Nichtangriffspakt mit ${t.family} bis Runde ${state.round+6}.`);}else toast(`${t.family} lehnt ab.`);closeDialog();saveGame();renderAll();}
  function offerAlliance(tid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),cost=15000;if(relation(p,t)<15)return toast('Die Beziehung ist zu schlecht. Erst Vertrauen aufbauen.');if(totalLiquid(p)<cost)return toast('Du brauchst 15.000 $.');spend(p,cost);if(targetAccepts(p,t,.40+relation(p,t)/250)){p.alliances[t.id]=state.round+8;t.alliances[p.id]=state.round+8;p.pacts[t.id]=state.round+8;t.pacts[p.id]=state.round+8;adjustRelation(p,t,12);toast(`Bündnis mit ${t.family} geschlossen.`);}else toast('Bündnis abgelehnt.');closeDialog();saveGame();renderAll();}
  function openTradeDialog(tid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid);if(!t)return;openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Handel mit ${esc(t.family)}</p><h2>Betriebe & Gebietstausch</h2></div><button class="icon-btn" data-close>✕</button></div><h3>Eigene Betriebe verkaufen</h3><div class="dialog-list">${p.businesses.length?p.businesses.map(b=>{const price=Math.round(BUSINESSES[b.type].cost*.80*(b.health/100));return `<div class="dialog-option"><div><strong>${esc(BUSINESSES[b.type].name)} · ${esc(DISTRICTS.find(d=>d.id===b.district).name)}</strong><p>Angebotspreis ${fmt(price)}</p></div><button class="btn btn-secondary" data-sellto="${b.id}" data-target="${t.id}">Anbieten</button></div>`;}).join(''):'<div class="empty-state">Keine eigenen Betriebe.</div>'}</div><h3>Rivalenbetrieb kaufen</h3><div class="dialog-list">${t.businesses.length?t.businesses.map(b=>{const price=Math.round(BUSINESSES[b.type].cost*1.25*(b.health/100));return `<div class="dialog-option"><div><strong>${esc(BUSINESSES[b.type].name)} · ${esc(DISTRICTS.find(d=>d.id===b.district).name)}</strong><p>Kaufangebot ${fmt(price)}</p></div><button class="btn btn-primary" data-buyfrom="${b.id}" data-target="${t.id}" ${totalLiquid(p)<price?'disabled':''}>Bieten</button></div>`;}).join(''):'<div class="empty-state">Keine Betriebe.</div>'}</div>${p.businesses.length&&t.businesses.length?'<div class="dialog-footer"><button class="btn btn-secondary" data-swap>Betrieb gegen Betrieb tauschen</button></div>':''}</div>`);$$('[data-sellto]').forEach(b=>b.onclick=()=>tradeSellBusiness(b.dataset.target,b.dataset.sellto));$$('[data-buyfrom]').forEach(b=>b.onclick=()=>tradeBuyBusiness(b.dataset.target,b.dataset.buyfrom));$('[data-swap]')?.addEventListener('click',()=>openSwapDialog(t.id));}
  function tradeSellBusiness(tid,bid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),b=p.businesses.find(x=>x.id===bid),price=Math.round(BUSINESSES[b.type].cost*.80*(b.health/100));if(totalLiquid(t)<price||!targetAccepts(p,t,.55+relation(p,t)/250))return toast(`${t.family} lehnt das Angebot ab.`);spend(t,price);p.clean+=price;p.businesses=p.businesses.filter(x=>x.id!==bid);b.routeId=null;t.businesses.push(b);adjustRelation(p,t,5);p.stats.trades++;ledger(p,`Betrieb an ${t.family} verkauft`,price,'clean');closeDialog();saveGame();renderAll();toast('Handel abgeschlossen.');}
  function tradeBuyBusiness(tid,bid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),b=t.businesses.find(x=>x.id===bid),price=Math.round(BUSINESSES[b.type].cost*1.25*(b.health/100));if(totalLiquid(p)<price)return toast('Nicht genug Kapital.');if(!targetAccepts(p,t,.42+relation(p,t)/260))return toast(`${t.family} lehnt dein Kaufangebot ab.`);spend(p,price);t.clean+=price;t.businesses=t.businesses.filter(x=>x.id!==bid);b.routeId=null;p.businesses.push(b);adjustRelation(p,t,4);p.stats.trades++;ledger(p,`Betrieb von ${t.family} gekauft`,-price,'asset');closeDialog();saveGame();renderAll();toast('Kauf abgeschlossen.');}
  function openSwapDialog(tid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid);openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Gebietstausch</p><h2>Betrieb gegen Betrieb</h2></div><button class="icon-btn" data-close>✕</button></div><div class="form-grid"><label><span>Dein Betrieb</span><select id="swapOwn">${p.businesses.map(b=>`<option value="${b.id}">${esc(BUSINESSES[b.type].name)} · ${esc(DISTRICTS.find(d=>d.id===b.district).name)}</option>`).join('')}</select></label><label><span>${esc(t.family)}</span><select id="swapTheir">${t.businesses.map(b=>`<option value="${b.id}">${esc(BUSINESSES[b.type].name)} · ${esc(DISTRICTS.find(d=>d.id===b.district).name)}</option>`).join('')}</select></label></div><div class="dialog-footer"><button class="btn btn-primary" data-confirm-swap>Tausch anbieten</button></div></div>`);$('[data-confirm-swap]').onclick=()=>{const a=p.businesses.find(b=>b.id===$('#swapOwn').value),b=t.businesses.find(b=>b.id===$('#swapTheir').value),va=BUSINESSES[a.type].cost*a.health/100,vb=BUSINESSES[b.type].cost*b.health/100,acceptBase=.58-Math.max(0,(vb-va)/Math.max(vb,1))*.5+relation(p,t)/300;if(!targetAccepts(p,t,acceptBase))return toast('Tausch abgelehnt.');p.businesses=p.businesses.filter(x=>x.id!==a.id);t.businesses=t.businesses.filter(x=>x.id!==b.id);a.routeId=null;b.routeId=null;p.businesses.push(b);t.businesses.push(a);adjustRelation(p,t,6);p.stats.trades++;closeDialog();saveGame();renderAll();toast('Gebietstausch abgeschlossen.');};}

  function openBuyDialog(districtId=selectedDistrict,focusType=null){const p=currentPlayer(),d=DISTRICTS.find(x=>x.id===districtId);if(p.jailed)return toast('Im Gefängnis kannst du keine neuen Geschäfte kaufen.');const entries=Object.entries(BUSINESSES).sort((a,b)=>focusType===a[0]?-1:focusType===b[0]?1:a[1].cost-b[1].cost);openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Investition · ${esc(d.name)}</p><h2>Geschäft kaufen</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${entries.map(([k,b])=>`<div class="dialog-option ${focusType===k?'highlight':''}"><div><strong>${b.icon} ${esc(b.name)}</strong><p>${esc(b.desc)}<br>Ertrag ca. ${fmt(Math.round(b.baseIncome*d.demand))}/R · Einfluss ${b.influence}</p></div><button class="btn btn-primary" data-buy="${k}" ${totalLiquid(p)<b.cost?'disabled':''}>${fmt(b.cost)}</button></div>`).join('')}</div></div>`);$$('[data-buy]').forEach(btn=>btn.onclick=()=>buyBusiness(btn.dataset.buy,districtId));}
  function buyBusiness(type,districtId){const p=currentPlayer(),def=BUSINESSES[type];if(totalLiquid(p)<def.cost)return toast('Nicht genug Kapital.');spend(p,def.cost);const d=DISTRICTS.find(x=>x.id===districtId),b={id:uid(),type,district:districtId,health:100,level:1,name:def.name,acquiredRound:state.round,routeId:null};if(type==='machines')b.machines=createMachineUnits();p.businesses.push(b);p.reputation+=def.rep;ledger(p,`${def.name} gekauft`,-def.cost,'asset');p.lastAction=`${def.name} gekauft`;closeDialog();saveGame();renderAll();toast(`${def.name} in ${d.name} gekauft.`);}
  function openBusinessDialog(id){const p=currentPlayer(),b=p.businesses.find(x=>x.id===id);if(!b)return;const def=BUSINESSES[b.type],repair=Math.round(def.cost*(100-b.health)/100*.18),upgrade=Math.round(def.cost*.35*(b.level||1));openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">${esc(DISTRICTS.find(d=>d.id===b.district).name)}</p><h2>${def.icon} ${esc(b.name)}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="finance-grid">${metricCards([['Zustand',pct(b.health),''],['Stufe',b.level||1,''],['Ertrag',fmt(estimateIncome(p,b)),'positive'],['Sicherheit',pct(businessSecurity(p,b)),''],['Einfluss',Math.round(businessInfluence(b)),'']])}</div>${b.type==='machines'?`<div class="dialog-footer"><button class="btn btn-primary" data-machines>Automaten verwalten</button></div>`:''}<div class="dialog-footer"><button class="btn btn-secondary" data-upgrade ${(b.level||1)>=3||totalLiquid(p)<upgrade?'disabled':''}>Ausbauen ${fmt(upgrade)}</button><button class="btn btn-secondary" data-repair ${b.health>=100||totalLiquid(p)<repair?'disabled':''}>Reparieren ${fmt(repair)}</button><button class="btn btn-danger" data-sell>Verkaufen ${fmt(def.cost*.55*(b.health/100))}</button></div></div>`);$('[data-machines]')?.addEventListener('click',()=>openMachineManager(id));$('[data-upgrade]')?.addEventListener('click',()=>{spend(p,upgrade);b.level++;ledger(p,`${def.name} ausgebaut`,-upgrade,'asset');closeDialog();saveGame();renderAll();toast(`Betrieb auf Stufe ${b.level}.`);});$('[data-repair]')?.addEventListener('click',()=>{spend(p,repair);b.health=100;ledger(p,`${def.name} repariert`,-repair,'expense');closeDialog();saveGame();renderAll();toast('Betrieb repariert.');});$('[data-sell]').onclick=()=>{const val=Math.round(def.cost*.55*(b.health/100));p.clean+=val;p.businesses=p.businesses.filter(x=>x.id!==id);ledger(p,`${def.name} verkauft`,val,'clean');closeDialog();saveGame();renderAll();toast(`Verkauft: ${fmt(val)}.`);};}
  function openMachineManager(bid){const p=currentPlayer(),b=p.businesses.find(x=>x.id===bid);if(!b)return;b.machines=b.machines||createMachineUnits();openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Automatenstandorte</p><h2>${esc(DISTRICTS.find(d=>d.id===b.district).name)}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${b.machines.map(m=>`<div class="dialog-option"><div><strong>${esc(m.name)}</strong><p>Zustand ${m.condition}% · aktueller Ort: ${esc(MACHINE_LOCATIONS.find(x=>x.id===m.location)?.name||'Unbekannt')}</p></div><select data-machine-loc="${m.id}">${MACHINE_LOCATIONS.map(l=>`<option value="${l.id}" ${m.location===l.id?'selected':''}>${esc(l.name)} · x${l.mult.toFixed(2)}</option>`).join('')}</select></div>`).join('')}</div><div class="dialog-footer"><button class="btn btn-secondary" data-route-manager>Automatenroute zuweisen</button></div></div>`);$$('[data-machine-loc]').forEach(sel=>sel.onchange=()=>{const m=b.machines.find(x=>x.id===sel.dataset.machineLoc);if(totalLiquid(p)<300){sel.value=m.location;return toast('Du brauchst 300 $ für den Standortwechsel.');}m.location=sel.value;spend(p,300,false);ledger(p,'Automat umgesetzt',-300,'expense');saveGame();renderAll();toast('Standort geändert.');});$('[data-route-manager]').onclick=()=>openRoutesDialog(bid);}
  function openRoutesDialog(focusBiz=null){const p=currentPlayer(),bundles=p.businesses.filter(b=>b.type==='machines');openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Logistik</p><h2>Automatenrouten</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-footer"><button class="btn btn-primary" data-new-route>Neue Route ${fmt(2500)}</button></div>${p.routes.length?p.routes.map(r=>`<div class="route-card"><div><strong>${esc(r.name)}</strong><p>Stufe ${r.level} · ${bundles.filter(b=>b.routeId===r.id).length} Pakete · Bonus +${r.level*7}%</p></div><button class="btn btn-secondary" data-up-route="${r.id}" ${r.level>=3?'disabled':''}>Verbessern ${fmt(5000*r.level)}</button></div>`).join(''):'<div class="empty-state">Noch keine Route angelegt.</div>'}<h3>Pakete zuweisen</h3><div class="dialog-list">${bundles.map(b=>`<div class="dialog-option"><div><strong>${esc(DISTRICTS.find(d=>d.id===b.district).name)} · ${esc(b.name)}</strong></div><select data-route-biz="${b.id}"><option value="">Keine Route</option>${p.routes.map(r=>`<option value="${r.id}" ${b.routeId===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>`).join('')}</div></div>`);$('[data-new-route]')?.addEventListener('click',()=>{if(totalLiquid(p)<2500)return toast('Nicht genug Kapital.');spend(p,2500);p.routes.push({id:uid(),name:`Route ${p.routes.length+1}`,level:1});saveGame();openRoutesDialog(focusBiz);});$$('[data-up-route]').forEach(btn=>btn.onclick=()=>{const r=p.routes.find(x=>x.id===btn.dataset.upRoute),cost=5000*r.level;if(totalLiquid(p)<cost)return toast('Nicht genug Kapital.');spend(p,cost);r.level++;saveGame();openRoutesDialog(focusBiz);});$$('[data-route-biz]').forEach(sel=>sel.onchange=()=>{const b=p.businesses.find(x=>x.id===sel.dataset.routeBiz);b.routeId=sel.value||null;saveGame();renderAll();});}

  function openAttackDialog(){const p=currentPlayer();if(p.jailed)return toast('Aus der Haft kannst du keinen Angriff führen.');if(p.actionPoints<2)return toast('Du brauchst 2 AP.');if(p.staff.gunman<1)return toast('Du brauchst mindestens einen Revolverhelden.');const targets=state.players.filter(x=>x.id!==p.id&&!x.eliminated&&x.businesses.length&&!pactActive(p,x)&&!allianceActive(p,x));if(!targets.length)return toast('Kein angreifbarer Besitz vorhanden.');openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Sabotage</p><h2>Rivalenbetrieb angreifen</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${targets.flatMap(t=>t.businesses.map(b=>`<div class="dialog-option"><div><strong>${esc(t.family)} · ${esc(BUSINESSES[b.type].name)}</strong><p>${esc(DISTRICTS.find(x=>x.id===b.district).name)} · Zustand ${Math.round(b.health)}% · Sicherheit ~${Math.round(businessSecurity(t,b))}%</p></div><button class="btn btn-danger" data-target-player="${t.id}" data-target-biz="${b.id}">Sabotieren</button></div>`)).join('')}</div></div>`);$$('[data-target-biz]').forEach(btn=>btn.onclick=()=>attackBusiness(btn.dataset.targetPlayer,btn.dataset.targetBiz));}
  function attackBusiness(targetPid,bizId){const p=currentPlayer(),t=state.players.find(x=>x.id===targetPid),b=t?.businesses.find(x=>x.id===bizId);if(!t||!b)return;if(pactActive(p,t)||allianceActive(p,t))return toast('Ein Abkommen verhindert den Angriff.');p.actionPoints-=2;const atk=roleSkill(p,'gunman')*.45+roleSkill(p,'informant')*.12+rand(0,22),def=businessSecurity(t,b)+roleSkill(t,'gunman')*.08,success=chance(clamp(.42+(atk-def)/120,.08,.9));p.heat=clamp(p.heat+18*(1-shield(p)/100),0,100);adjustRelation(p,t,-22);if(success){const dmg=rand(35,65)+p.staff.gunman*2;b.health=clamp(b.health-dmg,0,100);p.reputation+=5;p.stats.attacksSuccess++;p.lastAction=`${t.family} sabotiert`;if(b.health<=0){t.businesses=t.businesses.filter(x=>x.id!==b.id);toast(`${BUSINESSES[b.type].name} von ${t.family} wurde zerstört.`);}else toast(`Sabotage erfolgreich. Zustand ${Math.round(b.health)}%.`);}else{loseRandomGunman(p,.35);p.lastAction='Sabotage gescheitert';toast('Sabotage gescheitert.');}closeDialog();saveGame();renderAll();}
  function loseRandomGunman(p,prob){if(!chance(prob))return;const g=activeStaff(p).filter(s=>s.role==='gunman');if(!g.length)return;const x=g[rand(0,g.length-1)];p.staffRoster=p.staffRoster.filter(s=>s.id!==x.id);syncStaffCounts(p);}
  function openKidnapDialog(){const p=currentPlayer();if(p.jailed||p.actionPoints<2)return toast('Du brauchst 2 AP und Freiheit.');if(p.staff.gunman<1)return toast('Mindestens ein Revolverheld ist nötig.');const targets=state.players.filter(t=>t.id!==p.id&&!t.eliminated&&!pactActive(p,t)&&!allianceActive(p,t)).flatMap(t=>activeStaff(t).map(s=>({t,s})));if(!targets.length)return toast('Kein geeignetes Ziel.');openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Entführung</p><h2>Personal eines Rivalen treffen</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${targets.map(({t,s})=>`<div class="dialog-option"><div><strong>${esc(t.family)} · ${esc(s.name)}</strong><p>${esc(STAFF[s.role].name)} · Fähigkeit ${s.skill} · Loyalität ${s.loyalty}</p></div><button class="btn btn-danger" data-kidnap="${s.id}" data-target="${t.id}">Entführen</button></div>`).join('')}</div></div>`);$$('[data-kidnap]').forEach(b=>b.onclick=()=>kidnapPerson(b.dataset.target,b.dataset.kidnap));}
  function kidnapPerson(tid,sid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),s=t?.staffRoster.find(x=>x.id===sid);if(!s)return;p.actionPoints-=2;const cost=3000;spend(p,cost);const success=chance(clamp(.45+roleSkill(p,'gunman')/450+roleSkill(p,'informant')/700-roleSkill(t,'guard')/700,.12,.88));p.heat=clamp(p.heat+20,0,100);adjustRelation(p,t,-30);if(success){s.heldUntil=state.round+3;syncStaffCounts(t);const ransom=Math.min(totalLiquid(t),Math.round(STAFF[s.role].cost*(2+s.skill/45)));spend(t,ransom,false);p.dirty+=ransom;p.reputation+=3;ledger(p,'Lösegeld',ransom,'dirty');toast(`${s.name} entführt. Lösegeld ${fmt(ransom)}.`);}else{loseRandomGunman(p,.4);toast('Entführung gescheitert.');}closeDialog();saveGame();renderAll();}
  function openAssassinationDialog(){const p=currentPlayer();if(p.jailed||p.actionPoints<2)return toast('Du brauchst 2 AP.');if(p.staff.gunman<2)return toast('Für einen Mordanschlag brauchst du mindestens zwei Revolverhelden.');const targets=state.players.filter(t=>t.id!==p.id&&!t.eliminated&&!pactActive(p,t)&&!allianceActive(p,t)).flatMap(t=>activeStaff(t).map(s=>({t,s})));if(!targets.length)return toast('Kein geeignetes Ziel.');openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Extrem riskant</p><h2>Mordanschlag</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${targets.map(({t,s})=>`<div class="dialog-option"><div><strong>${esc(t.family)} · ${esc(s.name)}</strong><p>${esc(STAFF[s.role].name)} · Fähigkeit ${s.skill}</p></div><button class="btn btn-danger" data-hit="${s.id}" data-target="${t.id}">Ziel wählen</button></div>`).join('')}</div></div>`);$$('[data-hit]').forEach(b=>b.onclick=()=>assassinatePerson(b.dataset.target,b.dataset.hit));}
  function assassinatePerson(tid,sid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),s=t?.staffRoster.find(x=>x.id===sid);if(!s)return;p.actionPoints-=2;spend(p,5000);const success=chance(clamp(.28+roleSkill(p,'gunman')/520+roleSkill(p,'informant')/900-roleSkill(t,'guard')/600-roleSkill(t,'bodyguard')/700,.07,.78));p.heat=clamp(p.heat+35,0,100);adjustRelation(p,t,-55);if(success){t.staffRoster=t.staffRoster.filter(x=>x.id!==s.id);syncStaffCounts(t);p.reputation+=6;p.stats.attacksSuccess++;toast(`Anschlag erfolgreich: ${s.name} fällt aus der Organisation von ${t.family}.`);}else{loseRandomGunman(p,.55);if(chance(.35))p.jailed=Math.max(p.jailed,rand(2,5));toast('Anschlag gescheitert. Die Fahndung läuft heiß.');}closeDialog();saveGame();renderAll();}

  function doPrisonAction(kind){const p=currentPlayer();if(p.jailed<=0)return;const need=kind==='escape'?2:1;if(p.actionPoints<need)return toast('Nicht genug AP.');p.actionPoints-=need;if(kind==='appeal'){const cost=3000+Math.max(0,p.jailed-1)*1000;if(totalLiquid(p)<cost){p.actionPoints+=need;return toast('Nicht genug Kapital.');}spend(p,cost);const cut=chance(.45+roleSkill(p,'lawyer')/180+(p.bribes.judge ? .15 : 0))?rand(1,2):0;p.jailed=Math.max(0,p.jailed-cut);ledger(p,'Berufung',-cost,'expense');toast(cut?`Haft um ${cut} Runde(n) reduziert.`:'Berufung ohne Erfolg.');}
    if(kind==='guardbribe'){const cost=7500;if(totalLiquid(p)<cost){p.actionPoints+=need;return toast('Nicht genug Kapital.');}spend(p,cost);if(chance(.55+shield(p)/250)){p.jailed=Math.max(0,p.jailed-1);toast('Die Wache hilft dir – 1 Runde weniger.');}else{p.heat=clamp(p.heat+8,0,100);toast('Bestechung scheitert.');}}
    if(kind==='network'){p.reputation+=3;if(chance(.35)){const person=createStaffPerson('informant');person.loyalty=clamp(person.loyalty+8,0,100);p.staffRoster.push(person);syncStaffCounts(p);toast(`Kontakt gewonnen: ${person.name} wird Informant.`);}else toast('Du stärkst dein Netzwerk und deinen Ruf.');}
    if(kind==='escape'){const success=chance(.14+roleSkill(p,'informant')/500+roleSkill(p,'gunman')/600+shield(p)/500);if(success){p.jailed=0;p.heat=clamp(p.heat+20,0,100);toast('Flucht gelungen. Die Polizei sucht dich jedoch intensiv.');}else{p.jailed+=2;p.heat=clamp(p.heat+12,0,100);toast('Flucht gescheitert: +2 Runden Haft.');}}
    p.lastAction='Gefängnisaktion';saveGame();renderAll();}

  function openLoanDialog(){const p=currentPlayer(),max=Math.max(50000,Math.round(netWorth(p)*.65+p.reputation*4000)),out=outstandingLoans(p),opts=[25000,100000,500000,1000000].filter(x=>x+out<=max);if(!opts.length)return toast(`Deine Kreditlinie ist ausgeschöpft (${fmt(max)}).`);openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Bank</p><h2>Kredit aufnehmen</h2></div><button class="icon-btn" data-close>✕</button></div><p class="muted">Kreditlinie: ${fmt(max)} · bereits offen ${fmt(out)}. Zinsen werden jede Runde berechnet.</p><div class="dialog-list">${opts.map(a=>`<div class="dialog-option"><div><strong>${fmt(a)}</strong><p>3% Zins pro Runde · Mindesttilgung ${fmt(Math.max(1500,Math.round(a/10)))}/R</p></div><button class="btn btn-primary" data-loan-amt="${a}">Aufnehmen</button></div>`).join('')}</div></div>`);$$('[data-loan-amt]').forEach(b=>b.onclick=()=>takeLoan(+b.dataset.loanAmt));}
  function takeLoan(amount){const p=currentPlayer();p.clean+=amount;p.loans.push({id:uid(),original:amount,remaining:amount,rate:.03,payment:Math.max(1500,Math.round(amount/10)),started:state.round});ledger(p,'Bankkredit',amount,'loan');closeDialog();saveGame();renderAll();toast(`${fmt(amount)} Kredit ausgezahlt.`);}
  function repayDebt(){const p=currentPlayer();if(!p||p.debt<=0)return;const amount=Math.min(p.debt,totalLiquid(p));if(amount<=0)return toast('Kein Kapital zur Tilgung.');spend(p,amount,false);p.debt-=amount;if(p.debt<=0){p.debt=0;p.turnsInDebt=0;}ledger(p,'Schulden getilgt',-amount,'debt');saveGame();renderAll();toast(`${fmt(amount)} getilgt.`);}
  function processLoans(p){for(const l of [...p.loans]){const interest=Math.max(100,Math.round(l.remaining*l.rate));l.remaining+=interest;ledger(p,'Kreditzinsen',-interest,'loan');const pay=Math.min(l.remaining,l.payment);if(totalLiquid(p)>=pay){spend(p,pay,false);l.remaining-=pay;ledger(p,'Kreditrate',-pay,'loan');}else{l.remaining+=Math.round(pay*.08);}}
    p.loans=p.loans.filter(l=>l.remaining>50);
  }

  function makeMission(p){const options=['business','cash','heat','staff','control','crime','protection'],used=new Set(p.missions.map(m=>m.type));let type=options.filter(x=>!used.has(x));type=type.length?type[rand(0,type.length-1)]:options[rand(0,options.length-1)];const rewardBase=Math.max(6000,Math.round(8000+netWorth(p)*.018));if(type==='business'){const target=Math.max(2,p.businesses.length+1);return{id:uid(),type,title:'Expansion',desc:`Besitze mindestens ${target} Betriebe.`,target,reward:rewardBase,rep:2};}if(type==='cash'){const target=Math.round(totalLiquid(p)+25000+state.round*500);return{id:uid(),type,title:'Liquiditätsreserve',desc:`Erreiche ${fmt(target)} verfügbares Kapital.`,target,reward:rewardBase,rep:2};}if(type==='heat'){return{id:uid(),type,title:'Leise arbeiten',desc:'Senke deinen Heat auf höchstens 20.',target:20,reward:rewardBase,rep:3};}if(type==='staff'){const target=Math.max(2,activeStaff(p).length+1);return{id:uid(),type,title:'Die Familie wächst',desc:`Beschäftige ${target} aktive Leute.`,target,reward:rewardBase,rep:2};}if(type==='control'){const d=DISTRICTS[rand(0,DISTRICTS.length-1)],target=20;return{id:uid(),type,district:d.id,title:`Fuß in ${d.name}`,desc:`Erreiche mindestens ${target}% Einfluss in ${d.name}.`,target,reward:rewardBase+3000,rep:4};}if(type==='crime'){const target=(p.stats.crimesSuccess||0)+2;return{id:uid(),type,title:'Erfolgsserie',desc:'Schließe zwei weitere Verbrechen erfolgreich ab.',target,reward:rewardBase,rep:3,start:p.stats.crimesSuccess||0};}return{id:uid(),type:'protection',title:'Straßeneinnahmen',desc:'Errichte oder erweitere ein Schutzgeldnetz.',target:(p.stats.protection||0)+1,reward:rewardBase,rep:3,start:p.stats.protection||0};}
  function ensureMissions(p){p.missions=p.missions||[];while(p.missions.length<3)p.missions.push(makeMission(p));}
  function missionProgress(p,m){let cur=0,done=false,label='';if(m.type==='business'){cur=p.businesses.length;done=cur>=m.target;label=`${cur}/${m.target} Betriebe`;}if(m.type==='cash'){cur=totalLiquid(p);done=cur>=m.target;label=`${fmt(cur)} / ${fmt(m.target)}`;}if(m.type==='heat'){cur=p.heat;done=cur<=m.target;label=`Heat ${Math.round(cur)} / max. ${m.target}`;}if(m.type==='staff'){cur=activeStaff(p).length;done=cur>=m.target;label=`${cur}/${m.target} Personen`;}if(m.type==='control'){cur=districtShare(p,m.district);done=cur>=m.target;label=`${Math.round(cur)}% / ${m.target}%`;}if(m.type==='crime'){cur=(p.stats.crimesSuccess||0)-(m.start||0);done=cur>=2;label=`${Math.min(2,cur)}/2 Erfolge`;}if(m.type==='protection'){cur=(p.stats.protection||0)-(m.start||0);done=cur>=1;label=`${Math.min(1,cur)}/1 Netz-Ausbau`;}return{done,label,percent:m.type==='heat'?clamp((100-cur)/(100-m.target)*100,0,100):clamp((m.type==='cash'?cur/m.target:m.type==='control'?cur/m.target:m.type==='crime'?cur/2:m.type==='protection'?cur:cur/m.target)*100,0,100)};}
  function claimMission(id){const p=currentPlayer(),m=p.missions.find(x=>x.id===id);if(!m||!missionProgress(p,m).done)return;p.clean+=m.reward;p.reputation+=m.rep;ledger(p,`Auftrag: ${m.title}`,m.reward,'income');p.missions=p.missions.filter(x=>x.id!==id);ensureMissions(p);saveGame();renderAll();toast(`Auftrag erfüllt: +${fmt(m.reward)}.`);}

  function endHumanTurn(){if(!state||state.gameOver)return;const p=currentPlayer();if(p.type!=='human')return;processEndOfTurn(p);advanceIndex();let guard=0;while(!state.gameOver&&currentPlayer()?.type==='ai'&&guard++<state.players.length*2){aiTurn(currentPlayer());processEndOfTurn(currentPlayer());advanceIndex();}saveGame();renderAll();if(!state.gameOver&&currentPlayer()?.type==='human'&&state.players.filter(x=>x.type==='human'&&!x.eliminated).length>1)showHandoff();}
  function processEndOfTurn(p){
    syncStaffCounts(p);let gross=0,expenses=0,launderCap=0;p.businesses.forEach(b=>{gross+=randomizedIncome(p,b);expenses+=BUSINESSES[b.type].upkeep*(1+.08*((b.level||1)-1));launderCap+=BUSINESSES[b.type].launder*(1+.12*((b.level||1)-1));if(b.type==='machines'&&b.machines)for(const m of b.machines)m.condition=clamp(m.condition-rand(0,2),55,100);});
    const protection=totalProtectionIncome(p);gross+=protection;expenses+=Math.round(protection*.15);expenses+=staffPayroll(p);
    const legalShare=Math.round((gross-protection)*.62),dirtyShare=gross-legalShare;p.clean+=legalShare;p.dirty+=dirtyShare;const launder=Math.min(p.dirty,Math.round(launderCap*(.82+Math.random()*.32)));p.dirty-=launder;p.clean+=launder;spend(p,expenses);p.lastIncome=gross;p.lastExpenses=expenses;p.lastLaundered=launder;if(gross)ledger(p,'Betrieb & Schutzgeld',gross,'income');if(expenses)ledger(p,'Betrieb & Personal',-expenses,'expense');if(launder)ledger(p,'Geld gewaschen',launder,'clean');
    processLoans(p);
    if(p.debt>0){p.turnsInDebt++;const interest=Math.max(250,Math.round(p.debt*.025));p.debt+=interest;ledger(p,'Schuldzinsen',-interest,'debt');if(p.turnsInDebt>=6)foreclose(p);}else p.turnsInDebt=0;
    p.heat=clamp(p.heat-(5+shield(p)/10+roleSkill(p,'lawyer')/55),0,100);if(p.heat>=72&&chance((p.heat-60)/110*(1-shield(p)/100)))policeRaid(p);
    if(p.jailed>0){let reduce=1;if(p.staff.lawyer>=2&&chance(.25))reduce++;p.jailed=Math.max(0,p.jailed-reduce);}
    manageStaffLoyalty(p);if(chance(.24))triggerEvent(p);else p.eventText='Ruhige Lage';p.history.push(netWorth(p));if(p.history.length>24)p.history.shift();p.actionPoints=3;p.intel=0;p.temporaryIncomeMultiplier=1;ensureMissions(p);checkVictory();saveGame();
  }
  function randomizedIncome(p,b){return Math.max(0,Math.round(estimateIncome(p,b)*(.78+Math.random()*.5)));}
  function incomeBoost(p,types,mult){const eligible=p.businesses.filter(b=>types.includes(b.type)),bonus=Math.round(eligible.reduce((s,b)=>s+estimateIncome(p,b),0)*(mult-1));if(bonus>0){p.clean+=bonus;ledger(p,'Ereignisbonus',bonus,'income');}p.eventText=bonus>0?`Sonderumsatz +${fmt(bonus)}`:'Ereignis ohne passende Betriebe';}
  function triggerEvent(p){const ev=EVENTS[rand(0,EVENTS.length-1)];ev.apply(p);p.eventText=ev.name;log(`${p.family}: ${ev.name} – ${ev.text}`);}
  function manageStaffLoyalty(p){for(const s of p.staffRoster){if(s.heldUntil>state.round)continue;if(s.trait==='greedy'&&chance(.08))s.loyalty-=3;if(p.debt>0)s.loyalty-=1;if(s.loyalty<18&&chance(.12)){p.staffRoster=p.staffRoster.filter(x=>x.id!==s.id);log(`${s.name} verlässt ${p.family} wegen mangelnder Loyalität.`);break;}}syncStaffCounts(p);}
  function policeRaid(p){if(p.bribes.inspector&&chance(.45)){p.eventText='Razzia durch Kontakt verhindert';return;}const targets=p.businesses.filter(b=>BUSINESSES[b.type].risk>=13);if(targets.length){const b=targets[rand(0,targets.length-1)];b.health=clamp(b.health-rand(8,22),0,100);p.eventText=`Razzia bei ${BUSINESSES[b.type].name}`;}const fine=Math.min(totalLiquid(p),rand(3000,18000));spend(p,fine);if(fine)ledger(p,'Razzia / Beschlagnahme',-fine,'expense');}
  function foreclose(p){if(p.businesses.length){p.businesses.sort((a,b)=>BUSINESSES[b.type].cost-BUSINESSES[a.type].cost);const b=p.businesses.shift(),value=Math.round(BUSINESSES[b.type].cost*.45*(b.health/100));p.debt=Math.max(0,p.debt-value);p.turnsInDebt=0;p.eventText=`Pfändung: ${BUSINESSES[b.type].name}`;log(`${p.family}: ${BUSINESSES[b.type].name} wurde gepfändet.`);}else if(totalLiquid(p)<=0&&p.debt>50000){p.eliminated=true;log(`${p.family} ist zahlungsunfähig und scheidet aus.`);}}

  function advanceIndex(){let tries=0;do{state.currentIndex=(state.currentIndex+1)%state.players.length;if(state.currentIndex===0)state.round++;tries++;}while(state.players[state.currentIndex].eliminated&&tries<state.players.length+1);}
  function aiHire(p,role){const s=STAFF[role];if(totalLiquid(p)<s.cost)return false;spend(p,s.cost);p.staffRoster.push(createStaffPerson(role));syncStaffCounts(p);return true;}
  function aiTurn(p){if(p.eliminated)return;initPlayer(p);if(p.jailed>0){if(p.actionPoints>0&&chance(.35))doAiPrison(p);p.lastAction='Organisation aus der Haft geführt';return;}const diff={easy:.82,normal:1,hard:1.12,boss:1.28}[state.settings.difficulty]||1;if(p.debt>0&&p.clean>p.debt*.35){const pay=Math.min(p.debt,Math.round(p.clean*.5));p.clean-=pay;p.debt-=pay;ledger(p,'Schulden getilgt',-pay,'debt');}
    if((p.profile==='corrupt'||p.heat>55)&&p.actionPoints>0){const next=Object.entries(CORRUPTION).find(([k,c])=>!p.bribes[k]&&totalLiquid(p)>=c.cost*1.25);if(next){spend(p,next[1].cost);p.bribes[next[0]]=true;p.actionPoints--;}}
    if(totalLiquid(p)>35000&&activeStaff(p).length<9&&chance(.55)){const role=p.profile==='aggressive'?'gunman':p.profile==='defensive'?'guard':p.profile==='economic'?'manager':weighted([{v:'informant',w:2},{v:'guard',w:2},{v:'gunman',w:2},{v:'manager',w:3}]);aiHire(p,role);}
    if(p.staff.gunman>0&&p.actionPoints>0&&chance(.16)&&Object.keys(p.protection).length<3){const d=DISTRICTS[rand(0,DISTRICTS.length-1)],lv=p.protection[d.id]?.level||0,cost=2500*(lv+1);if(lv<3&&totalLiquid(p)>cost*1.4){spend(p,cost);p.protection[d.id]={level:lv+1,started:state.round};p.actionPoints--;p.stats.protection++;}}
    const affordable=Object.entries(BUSINESSES).filter(([k,b])=>totalLiquid(p)>b.cost*(1.12/diff));if(affordable.length){const sorted=affordable.sort((a,b)=>(b[1].baseIncome/b[1].cost)-(a[1].baseIncome/a[1].cost));let pick=p.profile==='economic'?sorted[0]:sorted[Math.min(sorted.length-1,rand(0,Math.min(2,sorted.length-1)))],d=DISTRICTS[rand(0,DISTRICTS.length-1)];spend(p,pick[1].cost);const b={id:uid(),type:pick[0],district:d.id,health:100,level:1,name:pick[1].name,acquiredRound:state.round,routeId:null};if(b.type==='machines')b.machines=createMachineUnits();p.businesses.push(b);p.reputation+=pick[1].rep;p.lastAction=`${pick[1].name} gekauft`;}else{const pool=CRIMES.filter(c=>p.actionPoints>=c.ap),c=p.heat>60?pool[0]:pool[Math.min(pool.length-1,Math.floor(netWorth(p)/120000)%pool.length)];if(c){p.actionPoints-=c.ap;if(chance(clamp(crimeSuccess(p,c)*diff,.05,.96))){const take=Math.round(rand(c.min,c.max)*diff);p.dirty+=take;p.reputation++;p.stats.crimesSuccess++;}else if(chance(.25))p.jailed=Math.max(1,c.jail-(p.bribes.judge?1:0));p.heat=clamp(p.heat+c.heat*(1-shield(p)/100),0,100);p.lastAction=c.name;}}
    if(p.profile==='aggressive'&&p.staff.gunman>0&&p.actionPoints>=2&&chance(.18*diff)){const targets=state.players.filter(x=>x.id!==p.id&&!x.eliminated&&x.businesses.length&&!pactActive(p,x)&&!allianceActive(p,x));if(targets.length){const t=targets[rand(0,targets.length-1)],b=t.businesses[rand(0,t.businesses.length-1)],atk=roleSkill(p,'gunman')*.45+rand(0,20),def=businessSecurity(t,b);if(chance(clamp(.4+(atk-def)/120,.08,.85))){b.health=clamp(b.health-rand(25,55),0,100);if(!b.health)t.businesses=t.businesses.filter(x=>x.id!==b.id);p.stats.attacksSuccess++;}p.actionPoints-=2;p.heat=clamp(p.heat+15,0,100);adjustRelation(p,t,-20);}}
  }
  function doAiPrison(p){p.actionPoints--;if(p.staff.lawyer&&chance(.45)){p.jailed=Math.max(0,p.jailed-1);}else p.reputation++;}

  function checkVictory(){if(state.settings.length==='endless')return;const cfg={short:{min:12,target:62},normal:{min:22,target:74},long:{min:35,target:82}}[state.settings.length]||{min:22,target:74};if(state.round<cfg.min)return;const active=state.players.filter(p=>!p.eliminated);if(active.length===1){state.gameOver=true;state.winnerId=active[0].id;return;}const leader=[...active].sort((a,b)=>powerIndex(b)-powerIndex(a))[0];if(powerIndex(leader)>=cfg.target&&controlledDistricts(leader)>=2){state.gameOver=true;state.winnerId=leader.id;}}
  function showGameOver(){const w=state.players.find(p=>p.id===state.winnerId);if(!w)return;if($('#gameDialog').open&&$('#dialogContent').dataset.gameover)return;$('#dialogContent').dataset.gameover='1';openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Partie beendet</p><h2>${esc(w.family)} dominiert die Stadt</h2></div></div><p>${esc(w.name)} erreicht ${pct(powerIndex(w))} Macht und kontrolliert ${controlledDistricts(w)} Viertel.</p><div class="finance-grid">${metricCards([['Nettovermögen',fmt(netWorth(w)),'positive'],['Betriebe',w.businesses.length,''],['Reputation',w.reputation,'']])}</div><div class="dialog-footer"><button class="btn btn-secondary" data-menu>Hauptmenü</button><button class="btn btn-primary" data-new>Neue Partie</button></div></div>`);$('[data-menu]').onclick=()=>{closeDialog();showScreen('menuScreen');};$('[data-new]').onclick=()=>{closeDialog();showScreen('setupScreen');};}

  function showHandoff(){const p=currentPlayer();document.body.classList.add('handoff-mode');openDialog(`<div class="dialog-wrap handoff-card"><p class="eyebrow">Lokaler Mehrspieler</p><h2>Gerät an ${esc(p.name)} geben</h2><p>Die Daten des vorherigen Spielers werden im Hintergrund verdeckt. ${esc(p.name)} von ${esc(p.family)} übernimmt jetzt.</p><button class="btn btn-primary btn-xl full" data-take-turn>Zug übernehmen</button></div>`);$('[data-take-turn]').onclick=()=>{document.body.classList.remove('handoff-mode');closeDialog();renderAll();};}

  function startTutorial(step=0){const p=currentPlayer();if(!p||p.tutorialDone&&step===0)return;const [title,text]=TUTORIAL[step];openDialog(`<div class="dialog-wrap tutorial-card"><p class="eyebrow">Tutorial ${step+1}/${TUTORIAL.length}</p><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="tutorial-dots">${TUTORIAL.map((_,i)=>`<i class="${i===step?'active':''}"></i>`).join('')}</div><div class="dialog-footer"><button class="btn btn-ghost" data-skip-tutorial>Überspringen</button>${step>0?'<button class="btn btn-secondary" data-tutorial-prev>Zurück</button>':''}<button class="btn btn-primary" data-tutorial-next>${step===TUTORIAL.length-1?'Fertig':'Weiter'}</button></div></div>`);$('[data-skip-tutorial]').onclick=()=>{p.tutorialDone=true;saveGame();closeDialog();};$('[data-tutorial-prev]')?.addEventListener('click',()=>startTutorial(step-1));$('[data-tutorial-next]').onclick=()=>{if(step===TUTORIAL.length-1){p.tutorialDone=true;saveGame();closeDialog();}else startTutorial(step+1);};}

  function openMoreMenu(){openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Navigation</p><h2>Mehr</h2></div><button class="icon-btn" data-close>✕</button></div><div class="more-grid"><button class="btn btn-secondary" data-go="staff">♟ Personal</button><button class="btn btn-secondary" data-go="corruption">⚖ Einfluss</button><button class="btn btn-secondary" data-go="finance">▥ Finanzen</button><button class="btn btn-secondary" data-go="missions">◎ Aufträge</button><button class="btn btn-secondary" data-go="ranking">♛ Rangliste</button><button class="btn btn-secondary" data-more-diplomacy>🤝 Diplomatie</button><button class="btn btn-secondary" data-more-routes>♣ Automatenrouten</button></div></div>`);$$('[data-go]').forEach(b=>b.onclick=()=>{closeDialog();setView(b.dataset.go);});$('[data-more-diplomacy]').onclick=()=>{closeDialog();openDiplomacyDialog();};$('[data-more-routes]').onclick=()=>{closeDialog();openRoutesDialog();};}
  function openGameMenu(){openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Spielmenü</p><h2>Syndikat</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list"><div class="dialog-option"><div><strong>Spiel speichern</strong><p>Lokaler Autosave plus manueller Speicherpunkt.</p></div><button class="btn btn-secondary" data-save>Speichern</button></div><div class="dialog-option"><div><strong>Tutorial / Hilfe</strong><p>Die wichtigsten Systeme noch einmal anzeigen.</p></div><button class="btn btn-secondary" data-tutorial>Tutorial</button></div><div class="dialog-option"><div><strong>Soundeffekte</strong><p>Kurze UI-Sounds.</p></div><button class="btn btn-secondary" data-sfx>${audioPrefs.sfx?'An':'Aus'}</button></div><div class="dialog-option"><div><strong>Noir-Musik</strong><p>Sehr leise, synthetische Hintergrundatmosphäre.</p></div><button class="btn btn-secondary" data-music>${audioPrefs.music?'An':'Aus'}</button></div><div class="dialog-option"><div><strong>Spielstand übertragen</strong><p>Export/Import für ein anderes Gerät – ohne Server.</p></div><button class="btn btn-secondary" data-transfer>Öffnen</button></div><div class="dialog-option"><div><strong>Hauptmenü</strong><p>Spielstand bleibt erhalten.</p></div><button class="btn btn-secondary" data-home>Verlassen</button></div></div><div class="danger-zone"><div class="dialog-option"><div><strong>Partie abbrechen</strong><p>Der aktuelle Spielstand wird gelöscht.</p></div><button class="btn btn-danger" data-abort>Abbrechen</button></div></div></div>`);$('[data-save]').onclick=()=>{saveGame();toast('Spiel gespeichert.');closeDialog();};$('[data-tutorial]').onclick=()=>startTutorial(0);$('[data-sfx]').onclick=()=>{audioPrefs.sfx=!audioPrefs.sfx;saveAudioPrefs();openGameMenu();};$('[data-music]').onclick=()=>{audioPrefs.music=!audioPrefs.music;saveAudioPrefs();audioPrefs.music?startMusic():stopMusic();openGameMenu();};$('[data-transfer]').onclick=openTransferDialog;$('[data-home]').onclick=()=>{saveGame();closeDialog();showScreen('menuScreen');updateContinueButton();};$('[data-abort]').onclick=()=>{if(confirm('Partie wirklich endgültig abbrechen?')){localStorage.removeItem(SAVE_KEY);state=null;closeDialog();showScreen('menuScreen');updateContinueButton();}};}
  function openTransferDialog(){openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Gerätewechsel</p><h2>Spielstand übertragen</h2></div><button class="icon-btn" data-close>✕</button></div><p class="muted">Das ist kein Cloud-Multiplayer, aber du kannst einen Spielstand vollständig exportieren und auf einem anderen Gerät importieren.</p><div class="dialog-footer"><button class="btn btn-primary" data-export-now>Export-Datei</button><label class="btn btn-secondary file-btn">Import-Datei<input type="file" id="saveImport" accept="application/json,.json" hidden></label></div></div>`);$('[data-export-now]').onclick=exportSave;$('#saveImport').onchange=e=>importSaveFile(e.target.files?.[0]);}
  function exportSave(){if(!state)return;const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`syndikat-spielstand-r${state.round}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Spielstand exportiert.');}
  function importSaveFile(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);state=migrateState(data);saveGame();closeDialog();showScreen('gameScreen');renderAll();toast('Spielstand importiert.');}catch(e){toast('Ungültige Spielstand-Datei.');}};r.readAsText(file);}

  function openDialog(html){const d=$('#gameDialog');$('#dialogContent').dataset.gameover='';$('#dialogContent').innerHTML=html;if(!d.open)d.showModal();$$('[data-close]',$('#dialogContent')).forEach(b=>b.onclick=closeDialog);}
  function closeDialog(){const d=$('#gameDialog');if(d.open)d.close();}
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2600);}
  function drawChart(){const c=$('#financeChart');if(!c)return;const rect=c.getBoundingClientRect(),dpr=Math.max(1,Math.min(2,devicePixelRatio||1));c.width=Math.max(300,rect.width*dpr);c.height=260*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);const w=rect.width,h=260;ctx.clearRect(0,0,w,h);const p=currentPlayer(),data=p.history.length?p.history:[netWorth(p)],max=Math.max(...data,1),min=Math.min(...data,0),pad=28;ctx.strokeStyle='#26303b';ctx.lineWidth=1;for(let i=0;i<5;i++){const y=pad+(h-pad*2)*i/4;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke();}ctx.beginPath();data.forEach((v,i)=>{const x=pad+(w-pad*2)*(data.length===1?0:i/(data.length-1)),y=h-pad-(v-min)/(max-min||1)*(h-pad*2);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle='#d9ad54';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#8f9aa6';ctx.font='12px system-ui';ctx.fillText(fmt(max),8,18);ctx.fillText(fmt(min),8,h-8);}

  function loadAudioPrefs(){try{return Object.assign({sfx:true,music:false},JSON.parse(localStorage.getItem(AUDIO_KEY)||'{}'));}catch{return{sfx:true,music:false};}}
  function saveAudioPrefs(){localStorage.setItem(AUDIO_KEY,JSON.stringify(audioPrefs));}
  function ensureAudio(){if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx;}
  function sfx(){if(!audioPrefs.sfx)return;try{const c=ensureAudio(),o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=420;g.gain.setValueAtTime(.025,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.055);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.06);}catch{}}
  function startMusic(){if(!audioPrefs.music||musicNodes.length)return;try{const c=ensureAudio();[73.42,110].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type=i?'sine':'triangle';o.frequency.value=f;g.gain.value=i?.006:.008;o.connect(g).connect(c.destination);o.start();musicNodes.push(o,g);});}catch{}}
  function stopMusic(){for(const n of musicNodes){try{if(n.stop)n.stop();else n.disconnect();}catch{}}musicNodes=[];}

  function migrateState(data){if(!data||!Array.isArray(data.players))throw new Error('bad save');data.version=VERSION;data.players.forEach(initPlayer);data.settings=data.settings||{difficulty:'normal',length:'normal'};data.log=data.log||[];data.round=data.round||1;data.currentIndex=clamp(data.currentIndex||0,0,data.players.length-1);return data;}
  function saveGame(){if(state)localStorage.setItem(SAVE_KEY,JSON.stringify(state));updateContinueButton();}
  function loadGame(){try{let raw=localStorage.getItem(SAVE_KEY),legacy=false;if(!raw){raw=localStorage.getItem(LEGACY_SAVE_KEY);legacy=!!raw;}if(!raw)return false;state=migrateState(JSON.parse(raw));selectedDistrict='oldtown';showScreen('gameScreen');saveGame();if(legacy)toast('Alter Spielstand auf Version 2 aktualisiert.');renderAll();return true;}catch(e){console.error(e);return false;}}
  function updateContinueButton(){const has=!!(localStorage.getItem(SAVE_KEY)||localStorage.getItem(LEGACY_SAVE_KEY));$('#continueBtn').disabled=!has;$('#continueBtn').textContent=has?'Spiel fortsetzen':'Kein Spielstand';}

  function registerEvents(){
    $('#newGameBtn').onclick=()=>showScreen('setupScreen');$('#continueBtn').onclick=()=>{if(!loadGame())toast('Kein gültiger Spielstand gefunden.');};$('[data-action="back-menu"]').onclick=()=>showScreen('menuScreen');$('#startGameBtn').onclick=createGame;$('#menuBtn').onclick=openGameMenu;$('#endTurnBtn').onclick=endHumanTurn;$('#endTurnDesktop').onclick=endHumanTurn;
    $$('.nav-btn[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('[data-action="open-buy"]')?.addEventListener('click',()=>openBuyDialog(selectedDistrict));$('[data-action="routes"]')?.addEventListener('click',()=>openRoutesDialog());$('[data-action="bank"]')?.addEventListener('click',openLoanDialog);$('[data-action="more"]')?.addEventListener('click',openMoreMenu);
    $('#gameDialog').addEventListener('click',e=>{if(e.target===$('#gameDialog'))closeDialog();});document.addEventListener('click',e=>{if(e.target.closest('button,.btn'))sfx();},{capture:true});window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('#installBtn').classList.remove('hidden');});$('#installBtn').onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('#installBtn').classList.add('hidden');};window.addEventListener('resize',()=>{if(currentView==='finance')drawChart();});
  }
  function init(){registerEvents();updateContinueButton();if(audioPrefs.music)setTimeout(startMusic,500);}
/* SYNDIKAT_REVISION_3_BEGIN */
(function REVISION3_PATCH(){
  // ---------- Revision 3: economy, progression, risk, AI and end-game ----------
  const byDistrict=id=>DISTRICTS.find(d=>d.id===id);
  const byBiz=type=>BUSINESSES[type];

  const districtCfg={
    oldtown:{slots:15,risk:1.02},center:{slots:18,risk:1.12},station:{slots:11,risk:1.28},redlight:{slots:14,risk:1.24},
    harbor:{slots:13,risk:1.32},industrial:{slots:16,risk:1.08},west:{slots:12,risk:.92},south:{slots:16,risk:1.03}
  };
  DISTRICTS.forEach(d=>Object.assign(d,districtCfg[d.id]||{slots:14,risk:1}));

  const bizCfg={
    machines:{cost:15000,baseIncome:1250,upkeep:180,risk:8,launder:650,security:18,rep:1,tier:1,influence:14,slotUse:1,legalShare:.28},
    escort:{cost:22000,baseIncome:2050,upkeep:420,risk:15,launder:1200,security:14,rep:2,tier:1,influence:18,slotUse:1,legalShare:.22},
    bar:{cost:90000,baseIncome:12200,upkeep:3000,risk:11,launder:6800,security:28,rep:5,tier:2,influence:48,slotUse:2,legalShare:.62},
    betting:{cost:180000,baseIncome:20500,upkeep:4700,risk:15,launder:11000,security:31,rep:7,tier:3,influence:67,slotUse:2,legalShare:.48},
    arcade:{cost:350000,baseIncome:38500,upkeep:8500,risk:16,launder:20000,security:38,rep:9,tier:3,influence:82,slotUse:2,legalShare:.54},
    club:{cost:600000,baseIncome:65000,upkeep:14500,risk:18,launder:34000,security:45,rep:12,tier:4,influence:108,slotUse:3,legalShare:.48},
    luxury:{cost:1200000,baseIncome:121000,upkeep:30000,risk:17,launder:52000,security:52,rep:17,tier:4,influence:138,slotUse:3,legalShare:.66},
    casino:{cost:3000000,baseIncome:290000,upkeep:76000,risk:22,launder:120000,security:62,rep:26,tier:5,influence:190,slotUse:4,legalShare:.56},
    hotel:{cost:10000000,baseIncome:790000,upkeep:160000,risk:9,launder:250000,security:74,rep:44,tier:6,influence:260,slotUse:5,legalShare:.88},
    holding:{cost:18000000,baseIncome:1500000,upkeep:270000,risk:5,launder:650000,security:82,rep:62,tier:6,influence:315,slotUse:6,legalShare:.94}
  };
  Object.entries(bizCfg).forEach(([k,v])=>Object.assign(BUSINESSES[k],v));

  function ensureV3Player(p){
    p.idleStreak=Number(p.idleStreak)||0;
    p.roundActivity=Number(p.roundActivity)||0;
    p.businessPurchasesThisTurn=Number(p.businessPurchasesThisTurn)||0;
    p.creditDefaults=Number(p.creditDefaults)||0;
    p.totalRoundsIdle=Number(p.totalRoundsIdle)||0;
    p.stats=p.stats||{};
    for(const k of ['crimesSuccess','attacksSuccess','scouts','protection','trades','upgrades','maintenance','loansRepaid','defaults'])p.stats[k]=Number(p.stats[k])||0;
    p.loans=(p.loans||[]).map(l=>Object.assign({missed:0,status:'active'},l));
    for(const b of p.businesses||[]){
      b.level=Math.max(1,Number(b.level)||1);
      b.health=clamp(Number.isFinite(b.health)?b.health:100,0,100);
      if(b.type==='machines'){
        b.machines=b.machines||createMachineUnits();
        b.machines.forEach(m=>{m.condition=clamp(Number.isFinite(m.condition)?m.condition:100,20,100);});
      }
    }
  }
  function markActivity(p,amount=1){p.roundActivity=(p.roundActivity||0)+amount;}
  function spendClean(p,amount){amount=Math.max(0,Math.round(amount));if(p.clean<amount)return false;p.clean-=amount;return true;}
  function spendDirtyOnly(p,amount){amount=Math.max(0,Math.round(amount));if(p.dirty<amount)return false;p.dirty-=amount;return true;}
  function spendDirtyFirst(p,amount){let a=Math.max(0,Math.round(amount));const d=Math.min(p.dirty,a);p.dirty-=d;a-=d;if(a){const c=Math.min(p.clean,a);p.clean-=c;a-=c;}return a===0;}
  function businessSlotUse(bOrType){const type=typeof bOrType==='string'?bOrType:bOrType.type;return byBiz(type)?.slotUse||1;}
  function districtSlotsUsed(did){return state.players.filter(x=>!x.eliminated).reduce((s,p)=>s+p.businesses.filter(b=>b.district===did).reduce((a,b)=>a+businessSlotUse(b),0),0);}
  function districtSlotsFree(did){const d=byDistrict(did);return Math.max(0,(d.slots||14)-districtSlotsUsed(did));}
  function inflation(){return 1+Math.min(.25,Math.max(0,(state?.round||1)-1)*.0015);}
  function purchaseCost(type){return Math.round(byBiz(type).cost*inflation());}
  function upgradeCost(b){return Math.round(byBiz(b.type).cost*.20*(b.level||1)*inflation());}
  function repairCost(b){return Math.max(250,Math.round(byBiz(b.type).cost*((100-b.health)/100)*.12));}
  function machineRepairCost(m){return Math.max(100,Math.round((100-m.condition)*18));}
  function unlockedTier(p){
    const n=netWorth(p),r=p.reputation||0,c=controlledDistricts(p);
    if(n>=7500000&&r>=55&&c>=2)return 6;
    if(n>=2500000&&r>=35&&c>=1)return 5;
    if(n>=750000&&r>=20)return 4;
    if(n>=200000&&r>=10)return 3;
    if(n>=60000||r>=6)return 2;
    return 1;
  }
  function marketSaturation(type,did){
    const total=state.players.filter(x=>!x.eliminated).reduce((s,p)=>s+p.businesses.filter(b=>b.type===type&&b.district===did).length,0);
    return clamp(1-Math.max(0,total-1)*.07,.46,1);
  }
  function idleEfficiency(p){return clamp(1-(p.idleStreak||0)*.10,.42,1);}
  function holdingBonus(p){return Math.min(.18,p.businesses.filter(b=>b.type==='holding'&&b.health>45).length*.08);}
  function machineLocationRisk(b){
    if(b.type!=='machines'||!b.machines?.length)return 0;
    return b.machines.reduce((s,m)=>s+Math.max(0,(MACHINE_LOCATIONS.find(x=>x.id===m.location)?.risk||1)-.75),0);
  }
  function operatingRisk(p){
    const raw=p.businesses.reduce((s,b)=>{
      const def=byBiz(b.type),d=byDistrict(b.district);
      return s+def.risk*(d.risk||1)*(b.health<50?1.3:1)+machineLocationRisk(b)*5;
    },0);
    return clamp(raw/55,0,16);
  }
  function loanRate(p){return clamp(.035-(p.reputation||0)/8000-p.businesses.filter(b=>b.type==='holding').length*.004,.018,.035);}
  function recordChronicle(msg){log(msg);}
  function businessPerk(type){
    return type==='holding'?'Portfolio-Bonus: +8% Ertrag auf alle Betriebe je aktive Holding (max. +18%).':
      type==='hotel'?'Prestigeobjekt: hoher legaler Anteil und geringes Betriebsrisiko.':
      type==='casino'?'Sehr hoher Cashflow und Geldwäschekapazität, dafür hohe Ermittlungsgefahr.':
      type==='machines'?'Einzelne Automaten können Standort, Zustand und Route besitzen.':'';
  }

  const baseInitPlayer=initPlayer;
  initPlayer=function(p){baseInitPlayer(p);ensureV3Player(p);};

  const baseCreateGame=createGame;
  createGame=function(){
    baseCreateGame();
    if(!state)return;
    state.initialPlayerCount=state.players.length;
    state.initialHumanCount=state.players.filter(p=>p.type==='human').length;
    state.rulesRevision=3;
    state.log=state.log||[];
    state.players.forEach(ensureV3Player);
    recordChronicle(`Partie gestartet: ${state.players.length} Familie${state.players.length===1?'':'n'} kämpfen um die Stadt.`);
    saveGame();renderAll();
  };

  const baseMigrateState=migrateState;
  migrateState=function(data){
    data=baseMigrateState(data);
    data.version=3;data.rulesRevision=3;
    data.initialPlayerCount=Number(data.initialPlayerCount)||data.players.length;
    data.initialHumanCount=Number(data.initialHumanCount)||data.players.filter(p=>p.type==='human').length;
    data.players.forEach(ensureV3Player);
    return data;
  };

  powerIndex=function(p){
    const nw=Math.max(0,netWorth(p));
    const wealth=32*Math.pow(Math.min(1,nw/25000000),.55);
    const shareSum=DISTRICTS.reduce((s,d)=>s+districtShare(p,d.id),0);
    const territory=Math.min(30,controlledDistricts(p)*3.2+(shareSum/(DISTRICTS.length*100))*15);
    const influence=corruptionCount(p)/5*11;
    const org=Math.min(1,activeStaff(p).length/18)*14;
    const rep=Math.min(1,(p.reputation||0)/100)*13;
    return clamp(wealth+territory+influence+org+rep,0,100);
  };
  rankName=function(p){
    const n=netWorth(p),r=p.reputation||0,c=controlledDistricts(p),staff=activeStaff(p).length;
    if(n>=25000000&&c>=4&&r>=60)return'Syndikatschef';
    if(n>=10000000&&c>=3&&r>=45)return'Pate';
    if(n>=3000000&&c>=2&&r>=28)return'Unterweltboss';
    if(n>=1000000&&(c>=1||staff>=7)&&r>=15)return'Bandenchef';
    if(n>=250000&&p.businesses.length>=2)return'Geschäftsmann';
    if(n>=60000||r>=5)return'Kleinganove';
    return'Niemand';
  };
  districtOwner=function(did){
    const neutral=neutralShare(did);let best=null,bestShare=0;
    for(const p of state.players.filter(x=>!x.eliminated)){const s=districtShare(p,did);if(s>bestShare){best=p;bestShare=s;}}
    return best&&bestShare>=50&&bestShare>=neutral?{player:best,share:bestShare}:{player:null,share:Math.max(neutral,bestShare)};
  };

  estimateIncome=function(p,b){
    const def=byBiz(b.type),d=byDistrict(b.district);
    const manager=1+Math.min(.32,(roleSkill(p,'manager')/100)*.16+p.staff.manager*.012);
    const control=districtShare(p,b.district)>=50?1.08:1;
    const level=1+.28*((b.level||1)-1);
    const idle=p._turnIncomeFactor??idleEfficiency(p);
    return def.baseIncome*d.demand*(b.health/100)*manager*control*level*machineBundleMultiplier(p,b)*(1+allianceBonus(p)+holdingBonus(p))*marketSaturation(b.type,b.district)*idle;
  };
  businessSecurity=function(p,b){const def=byBiz(b.type);return clamp(def.security+roleSkill(p,'guard')*.16+roleSkill(p,'bodyguard')*.06+(b.level-1)*8,0,97);};

  const baseRenderCity=renderCity;
  renderCity=function(){
    baseRenderCity();
    const d=byDistrict(selectedDistrict),p=currentPlayer(),stats=$('#districtDetail .district-stats');
    if(stats&&!stats.querySelector('[data-v3-slots]')){
      stats.insertAdjacentHTML('beforeend',`<div class="mini-metric" data-v3-slots><small>Freie Standorte</small><strong>${districtSlotsFree(d.id)} / ${d.slots}</strong></div><div class="mini-metric"><small>Gebietsrisiko</small><strong>${pct((d.risk||1)*100)}</strong></div>`);
    }
    const b=$('#statusBanner');
    if(p.idleStreak>=2&&!p.jailed&&!p.debt){b.className='status-banner';b.textContent=`Leerlauf: ${p.idleStreak} Runden kaum geführt. Betriebseffizienz aktuell ${Math.round(idleEfficiency(p)*100)}%. Aktive Entscheidungen, Wartung und Expansion stellen sie wieder her.`;}
  };

  openBuyDialog=function(districtId=selectedDistrict,focusType=null){
    const p=currentPlayer(),d=byDistrict(districtId);if(p.jailed)return toast('Im Gefängnis kannst du keine neuen Geschäfte kaufen.');
    const tier=unlockedTier(p),entries=Object.entries(BUSINESSES).sort((a,b)=>focusType===a[0]?-1:focusType===b[0]?1:a[1].cost-b[1].cost);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Investition · ${esc(d.name)}</p><h2>Geschäft kaufen</h2></div><button class="icon-btn" data-close>✕</button></div>
      <p class="muted">Freie Standorte: ${districtSlotsFree(d.id)} / ${d.slots} · Freigeschaltete Geschäftsstufe: ${tier}/6 · Kauf benötigt 1 AP. Ab Stufe 2 wird sauberes Kapital benötigt.</p>
      <div class="dialog-list">${entries.map(([k,b])=>{const cost=purchaseCost(k),locked=b.tier>tier,space=districtSlotsFree(d.id)<b.slotUse,clean=b.tier>=2?p.clean:totalLiquid(p),disabled=locked||space||clean<cost||p.actionPoints<1||p.businessPurchasesThisTurn>=2;
      return `<div class="dialog-option ${focusType===k?'highlight':''}"><div><strong>${b.icon} ${esc(b.name)}</strong><p>${esc(b.desc)}<br>ca. ${fmt(Math.round(b.baseIncome*d.demand))}/R · ${b.slotUse} Standort${b.slotUse===1?'':'e'} · Tier ${b.tier}${locked?' · GESPERRT':''}${b.tier>=2?' · sauberes Geld':''}${businessPerk(k)?`<br>${esc(businessPerk(k))}`:''}</p></div><button class="btn btn-primary" data-buy="${k}" ${disabled?'disabled':''}>${fmt(cost)}</button></div>`;}).join('')}</div></div>`);
    $('[data-buy]').forEach(btn=>btn.onclick=()=>buyBusiness(btn.dataset.buy,districtId));
  };

  buyBusiness=function(type,districtId){
    const p=currentPlayer(),def=byBiz(type),d=byDistrict(districtId),cost=purchaseCost(type);
    if(p.jailed)return toast('Aus der Haft kannst du nicht investieren.');
    if(p.actionPoints<1)return toast('Du brauchst 1 Aktionspunkt für einen Unternehmenskauf.');
    if((p.businessPurchasesThisTurn||0)>=2)return toast('Maximal zwei Unternehmenskäufe pro Runde.');
    if(def.tier>unlockedTier(p))return toast(`Dieses Geschäft ist erst ab Geschäftsstufe ${def.tier} verfügbar.`);
    if(districtSlotsFree(districtId)<def.slotUse)return toast('In diesem Viertel sind nicht genug freie Standorte.');
    const paid=def.tier>=2?spendClean(p,cost):(totalLiquid(p)>=cost&&spendDirtyFirst(p,cost));
    if(!paid)return toast(def.tier>=2?`Du brauchst ${fmt(cost)} sauberes Kapital.`:'Nicht genug Kapital.');
    p.actionPoints--;p.businessPurchasesThisTurn=(p.businessPurchasesThisTurn||0)+1;markActivity(p,2);
    const b={id:uid(),type,district:districtId,health:100,level:1,name:def.name,acquiredRound:state.round,routeId:null};
    if(type==='machines')b.machines=createMachineUnits();
    p.businesses.push(b);p.reputation+=def.rep;ledger(p,`${def.name} gekauft`,-cost,'asset');p.lastAction=`${def.name} gekauft`;
    recordChronicle(`${p.family} eröffnet ${def.name} in ${d.name}.`);
    closeDialog();saveGame();renderAll();toast(`${def.name} in ${d.name} gekauft.`);
  };

  openBusinessDialog=function(id){
    const p=currentPlayer(),b=p.businesses.find(x=>x.id===id);if(!b)return;const def=byBiz(b.type),repair=repairCost(b),upgrade=upgradeCost(b),perk=businessPerk(b.type);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">${esc(byDistrict(b.district).name)} · Tier ${def.tier}</p><h2>${def.icon} ${esc(b.name)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="finance-grid">${metricCards([['Zustand',pct(b.health),''],['Stufe',b.level||1,''],['Ertrag',fmt(estimateIncome(p,b)),'positive'],['Sicherheit',pct(businessSecurity(p,b)),''],['Einfluss',Math.round(businessInfluence(b)),''],['Markt',pct(marketSaturation(b.type,b.district)*100),'']])}</div>
      ${perk?`<p class="muted">${esc(perk)}</p>`:''}
      ${b.type==='machines'?`<div class="dialog-footer"><button class="btn btn-primary" data-machines>Automaten verwalten</button></div>`:''}
      <div class="dialog-footer"><button class="btn btn-secondary" data-upgrade ${(b.level||1)>=3||p.clean<upgrade?'disabled':''}>Ausbauen ${fmt(upgrade)} sauber</button><button class="btn btn-secondary" data-repair ${b.health>=100||p.clean<repair?'disabled':''}>Reparieren ${fmt(repair)} sauber</button><button class="btn btn-danger" data-sell>Verkaufen ${fmt(def.cost*.58*(b.health/100))}</button></div></div>`);
    $('[data-machines]')?.addEventListener('click',()=>openMachineManager(id));
    $('[data-upgrade]')?.addEventListener('click',()=>{if(!spendClean(p,upgrade))return toast('Nicht genug sauberes Kapital.');b.level++;p.stats.upgrades++;markActivity(p,2);ledger(p,`${def.name} ausgebaut`,-upgrade,'asset');closeDialog();saveGame();renderAll();toast(`Betrieb auf Stufe ${b.level}.`);});
    $('[data-repair]')?.addEventListener('click',()=>{if(!spendClean(p,repair))return toast('Nicht genug sauberes Kapital.');b.health=100;p.stats.maintenance++;markActivity(p);ledger(p,`${def.name} repariert`,-repair,'expense');closeDialog();saveGame();renderAll();toast('Betrieb vollständig instandgesetzt.');});
    $('[data-sell]').onclick=()=>{const val=Math.round(def.cost*.58*(b.health/100));p.clean+=val;p.businesses=p.businesses.filter(x=>x.id!==id);p.routes.forEach(r=>{});ledger(p,`${def.name} verkauft`,val,'clean');markActivity(p);recordChronicle(`${p.family} verkauft ${def.name}.`);closeDialog();saveGame();renderAll();toast(`Verkauft: ${fmt(val)}.`);};
  };

  openMachineManager=function(bid){
    const p=currentPlayer(),b=p.businesses.find(x=>x.id===bid);if(!b)return;b.machines=b.machines||createMachineUnits();
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Automatenstandorte</p><h2>${esc(byDistrict(b.district).name)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <p class="muted">Ertrag und Risiko unterscheiden sich je Standort. Schlechter Zustand senkt den Umsatz und erhöht Störungsrisiken.</p>
      <div class="dialog-list">${b.machines.map(m=>{const loc=MACHINE_LOCATIONS.find(x=>x.id===m.location),repair=machineRepairCost(m);return `<div class="dialog-option"><div><strong>${esc(m.name)}</strong><p>Zustand ${m.condition}% · Risiko x${(loc?.risk||1).toFixed(2)}${m.condition<75?' · Wartung empfohlen':''}</p></div><div class="mini-actions"><select data-machine-loc="${m.id}">${MACHINE_LOCATIONS.map(l=>`<option value="${l.id}" ${m.location===l.id?'selected':''}>${esc(l.name)} · Ertrag x${l.mult.toFixed(2)} · Risiko x${l.risk.toFixed(2)}</option>`).join('')}</select><button class="btn btn-secondary" data-machine-repair="${m.id}" ${m.condition>=100||p.clean<repair?'disabled':''}>Warten ${fmt(repair)}</button></div></div>`;}).join('')}</div>
      <div class="dialog-footer"><button class="btn btn-secondary" data-route-manager>Automatenroute zuweisen</button></div></div>`);
    $('[data-machine-loc]').forEach(sel=>sel.onchange=()=>{const m=b.machines.find(x=>x.id===sel.dataset.machineLoc);if(p.clean<300){sel.value=m.location;return toast('Du brauchst 300 $ sauberes Geld für den Standortwechsel.');}spendClean(p,300);m.location=sel.value;markActivity(p);ledger(p,'Automat umgesetzt',-300,'expense');saveGame();renderAll();toast('Standort geändert.');});
    $('[data-machine-repair]').forEach(btn=>btn.onclick=()=>{const m=b.machines.find(x=>x.id===btn.dataset.machineRepair),cost=machineRepairCost(m);if(!spendClean(p,cost))return toast('Nicht genug sauberes Geld.');m.condition=100;p.stats.maintenance++;markActivity(p);ledger(p,'Automat gewartet',-cost,'expense');openMachineManager(bid);});
    $('[data-route-manager]').onclick=()=>openRoutesDialog(bid);
  };

  openRoutesDialog=function(focusBiz=null){
    const p=currentPlayer(),bundles=p.businesses.filter(b=>b.type==='machines');
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Logistik</p><h2>Automatenrouten</h2></div><button class="icon-btn" data-close>✕</button></div>
      <p class="muted">Routen erhöhen den Ertrag bestehender Automatenpakete. Kosten werden aus sauberem Kapital bezahlt.</p>
      <div class="dialog-footer"><button class="btn btn-primary" data-new-route ${p.clean<2500?'disabled':''}>Neue Route ${fmt(2500)}</button></div>
      ${p.routes.length?p.routes.map(r=>`<div class="route-card"><div><strong>${esc(r.name)}</strong><p>Stufe ${r.level} · ${bundles.filter(b=>b.routeId===r.id).length} Pakete · Bonus +${r.level*7}%</p></div><button class="btn btn-secondary" data-up-route="${r.id}" ${r.level>=3||p.clean<5000*r.level?'disabled':''}>Verbessern ${fmt(5000*r.level)}</button></div>`).join(''):'<div class="empty-state">Noch keine Route angelegt.</div>'}
      <h3>Pakete zuweisen</h3><div class="dialog-list">${bundles.map(b=>`<div class="dialog-option"><div><strong>${esc(byDistrict(b.district).name)} · ${esc(b.name)}</strong></div><select data-route-biz="${b.id}"><option value="">Keine Route</option>${p.routes.map(r=>`<option value="${r.id}" ${b.routeId===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>`).join('')}</div></div>`);
    $('[data-new-route]')?.addEventListener('click',()=>{if(!spendClean(p,2500))return;p.routes.push({id:uid(),name:`Route ${p.routes.length+1}`,level:1});markActivity(p);ledger(p,'Automatenroute eingerichtet',-2500,'asset');saveGame();openRoutesDialog(focusBiz);});
    $('[data-up-route]').forEach(btn=>btn.onclick=()=>{const r=p.routes.find(x=>x.id===btn.dataset.upRoute),cost=5000*r.level;if(!spendClean(p,cost))return toast('Nicht genug sauberes Kapital.');r.level++;markActivity(p);ledger(p,'Automatenroute verbessert',-cost,'asset');saveGame();openRoutesDialog(focusBiz);});
    $('[data-route-biz]').forEach(sel=>sel.onchange=()=>{const b=p.businesses.find(x=>x.id===sel.dataset.routeBiz);b.routeId=sel.value||null;markActivity(p);saveGame();renderAll();});
  };

  doCrime=function(id){
    const p=currentPlayer(),c=CRIMES.find(x=>x.id===id);if(!p||p.type!=='human'||p.jailed||p.actionPoints<c.ap)return;
    p.actionPoints-=c.ap;markActivity(p,2);
    const success=chance(crimeSuccess(p,c)),shieldFactor=1-shield(p)/100;p.heat=clamp(p.heat+c.heat*shieldFactor,0,100);
    if(success){let take=rand(c.min,c.max);if(c.id==='bank')take=Math.round(take*(1+p.staff.gunman*.04));p.dirty+=take;p.reputation+=Math.max(1,Math.round(c.heat/5));p.stats.crimesSuccess++;p.lastAction=`${c.name}: erfolgreich`;ledger(p,c.name,take,'dirty');toast(`${c.name} erfolgreich: +${fmt(take)} schmutziges Geld.`);}
    else{const jailChance=clamp(.24+c.heat/100+p.heat/180-shield(p)/160-roleSkill(p,'lawyer')/900,.08,.82);if(chance(jailChance)){let rounds=Math.max(1,c.jail-Math.floor(p.staff.lawyer/2)-(p.bribes.judge?1:0));p.jailed=Math.max(p.jailed,rounds);p.lastAction=`${c.name}: festgenommen`;recordChronicle(`${p.family}: Festnahme nach ${c.name}.`);toast(`Festgenommen: ${rounds} Runde${rounds===1?'':'n'} Haft.`);}else{p.lastAction=`${c.name}: gescheitert`;toast('Gescheitert, aber entkommen.');}}
    saveGame();renderAll();
  };
  cooldown=function(){const p=currentPlayer();if(p.jailed||p.actionPoints<1)return toast('Keine Aktionspunkte verfügbar.');p.actionPoints--;markActivity(p);const reduction=rand(10,18)+Math.round(shield(p)/8)+Math.round(roleSkill(p,'lawyer')/25);p.heat=clamp(p.heat-reduction,0,100);p.lastAction='Untergetaucht';saveGame();renderAll();toast(`Heat um ${reduction} gesenkt.`);};

  doScoutDistrict=function(did){
    const p=currentPlayer(),old=p.scouting?.[did];if(old&&state.round-old.round<=1)return openDistrictIntel(did);
    if(p.jailed||p.actionPoints<1)return toast('Keine Aktionspunkte verfügbar.');const cost=1200;if(totalLiquid(p)<cost)return toast(`Du brauchst ${fmt(cost)} für Informanten und Auslagen.`);
    spendDirtyFirst(p,cost);p.actionPoints--;markActivity(p,2);const lvl=clamp(1+Math.floor(roleSkill(p,'informant')/35),1,3);p.scouting[did]={round:state.round,level:lvl};p.intel=Math.min(5,p.intel+1);p.stats.scouts++;p.lastAction=`${byDistrict(did).name} ausgekundschaftet`;ledger(p,'Viertel ausgekundschaftet',-cost,'expense');saveGame();renderAll();openDistrictIntel(did);
  };
  openDistrictIntel=function(did){
    const p=currentPlayer(),d=byDistrict(did),intel=p.scouting?.[did];if(!intel)return toast('Dieses Viertel wurde noch nicht ausgekundschaftet.');
    const age=state.round-intel.round,level=intel.level,rows=state.players.filter(x=>!x.eliminated).map(r=>{const sh=districtShare(r,did),biz=r.businesses.filter(b=>b.district===did);let detail=`Einfluss ${Math.round(sh)}%`;if(level>=2)detail+=` · ${biz.length} Betriebe${biz.length?`: ${biz.slice(0,4).map(b=>byBiz(b.type).name).join(', ')}`:''}`;if(level>=3&&biz.length)detail+=` · Ø Sicherheit ${Math.round(biz.reduce((s,b)=>s+businessSecurity(r,b),0)/biz.length)}%`;return `<div class="intel-row"><strong>${esc(r.family)}${r.id===p.id?' (du)':''}</strong><span>${esc(detail)}</span></div>`;}).join('');
    const roi=Object.entries(BUSINESSES).filter(([k,b])=>b.tier<=unlockedTier(p)).map(([k,b])=>({k,b,roi:(b.baseIncome-b.upkeep)/purchaseCost(k)*marketSaturation(k,did)})).sort((a,b)=>b.roi-a.roi).slice(0,3);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Aufklärung Stufe ${level}</p><h2>${esc(d.name)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="intel-summary"><span>Intel: Runde ${intel.round}${age>2?' · veraltet':''}</span><span>Neutral: ${Math.round(neutralShare(did))}%</span><span>Polizei: ${pct(d.police*100)}</span><span>Risiko: ${pct((d.risk||1)*100)}</span><span>Standorte frei: ${districtSlotsFree(did)}/${d.slots}</span></div>
      <div class="intel-list">${rows}</div><h3>Lukrative Möglichkeiten</h3><div class="dialog-list">${roi.map(x=>`<div class="dialog-option"><div><strong>${x.b.icon} ${esc(x.b.name)}</strong><p>Marktsättigung ${Math.round(marketSaturation(x.k,did)*100)}% · erwarteter Basisertrag ${fmt(x.b.baseIncome*d.demand)}/R · ${x.b.slotUse} Standorte</p></div><button class="btn btn-primary" data-intel-buy="${x.k}">${fmt(purchaseCost(x.k))}</button></div>`).join('')}</div></div>`);
    $('[data-intel-buy]').forEach(b=>b.onclick=()=>{closeDialog();openBuyDialog(did,b.dataset.intelBuy);});
  };

  hireStaff=function(key){
    const p=currentPlayer(),s=STAFF[key];if(!s||p.jailed)return;const legal=key==='lawyer'||key==='manager';
    if(legal?p.clean<s.cost:totalLiquid(p)<s.cost)return toast(legal?'Nicht genug sauberes Kapital.':'Nicht genug Kapital.');
    legal?spendClean(p,s.cost):spendDirtyFirst(p,s.cost);const person=createStaffPerson(key);p.staffRoster.push(person);syncStaffCounts(p);markActivity(p);p.lastAction=`${person.name} angeworben`;ledger(p,`${s.name} angeworben`,-s.cost,'expense');closeDialog();saveGame();renderAll();toast(`${person.name} (${s.name}) ist jetzt Teil deiner Organisation.`);
  };
  buyBribe=function(key){const p=currentPlayer(),c=CORRUPTION[key];if(!c||p.bribes[key]||p.jailed)return;if(!spendDirtyOnly(p,c.cost))return toast(`Du brauchst ${fmt(c.cost)} schmutziges Geld.`);p.bribes[key]=true;p.reputation+=2;markActivity(p);ledger(p,`${c.name} bestochen`,-c.cost,'expense');p.lastAction='Einfluss ausgebaut';saveGame();renderAll();toast(`Kontakt zu ${c.name} aufgebaut.`);};

  buildProtection=function(did){
    const p=currentPlayer();if(p.jailed||p.actionPoints<1)return toast('Dafür brauchst du 1 Aktionspunkt.');if(p.staff.gunman<1&&p.reputation<6)return toast('Du brauchst mindestens einen Revolverhelden oder mehr Reputation.');
    const level=p.protection?.[did]?.level||0;if(level>=3)return toast('Das Netz ist bereits maximal ausgebaut.');const cost=2500*(level+1);if(p.dirty<cost)return toast(`Du brauchst ${fmt(cost)} schmutziges Geld.`);
    spendDirtyOnly(p,cost);p.actionPoints--;markActivity(p,2);const d=byDistrict(did),success=.62+p.staff.gunman*.045+roleSkill(p,'bodyguard')/850-d.police*.08;
    if(chance(success)){p.protection[did]={level:level+1,started:state.round};p.stats.protection++;p.reputation+=2;p.lastAction=`Schutzgeld in ${d.name}`;recordChronicle(`${p.family} baut ein Schutzgeldnetz in ${d.name} auf.`);toast(`Schutzgeldnetz in ${d.name} auf Stufe ${level+1}.`);}else{p.heat=clamp(p.heat+10,0,100);toast('Die Aktion scheitert und zieht Polizeiaufmerksamkeit auf sich.');}
    ledger(p,'Schutzgeldnetz',-cost,'expense');closeDialog();saveGame();renderAll();
  };

  const baseOpenStaffPerson=openStaffPerson;
  openStaffPerson=function(id){baseOpenStaffPerson(id);};

  diplomaticGift=function(tid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),cost=10000;if(!spendClean(p,cost))return toast('Du brauchst 10.000 $ sauberes Geld.');t.clean+=Math.round(cost*.7);adjustRelation(p,t,18);p.reputation++;markActivity(p);ledger(p,`Geschenk an ${t.family}`,-cost,'expense');closeDialog();saveGame();renderAll();toast(`Beziehung zu ${t.family} verbessert.`);};
  offerPact=function(tid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),cost=5000;if(!spendClean(p,cost))return toast('Du brauchst 5.000 $ sauberes Geld.');markActivity(p);ledger(p,'Diplomatische Vermittlung',-cost,'expense');if(targetAccepts(p,t,.58)){p.pacts[t.id]=state.round+6;t.pacts[p.id]=state.round+6;adjustRelation(p,t,8);recordChronicle(`${p.family} und ${t.family} schließen einen Nichtangriffspakt.`);toast(`Nichtangriffspakt mit ${t.family} bis Runde ${state.round+6}.`);}else toast(`${t.family} lehnt ab.`);closeDialog();saveGame();renderAll();};
  offerAlliance=function(tid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),cost=15000;if(relation(p,t)<15)return toast('Die Beziehung ist zu schlecht. Erst Vertrauen aufbauen.');if(!spendClean(p,cost))return toast('Du brauchst 15.000 $ sauberes Geld.');markActivity(p);if(targetAccepts(p,t,.40+relation(p,t)/250)){p.alliances[t.id]=state.round+8;t.alliances[p.id]=state.round+8;p.pacts[t.id]=state.round+8;t.pacts[p.id]=state.round+8;adjustRelation(p,t,12);recordChronicle(`${p.family} und ${t.family} bilden ein Bündnis.`);toast(`Bündnis mit ${t.family} geschlossen.`);}else toast('Bündnis abgelehnt.');closeDialog();saveGame();renderAll();};

  tradeBuyBusiness=function(tid,bid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),b=t.businesses.find(x=>x.id===bid);if(!b)return;const price=Math.round(byBiz(b.type).cost*1.25*(b.health/100)*inflation());if(p.clean<price)return toast('Nicht genug sauberes Kapital.');if(!targetAccepts(p,t,.42+relation(p,t)/260))return toast(`${t.family} lehnt dein Kaufangebot ab.`);spendClean(p,price);t.clean+=price;t.businesses=t.businesses.filter(x=>x.id!==bid);b.routeId=null;p.businesses.push(b);adjustRelation(p,t,4);p.stats.trades++;markActivity(p);ledger(p,`Betrieb von ${t.family} gekauft`,-price,'asset');closeDialog();saveGame();renderAll();toast('Kauf abgeschlossen.');};

  attackBusiness=function(targetPid,bizId){
    const p=currentPlayer(),t=state.players.find(x=>x.id===targetPid),b=t?.businesses.find(x=>x.id===bizId);if(!t||!b)return;if(pactActive(p,t)||allianceActive(p,t))return toast('Ein Abkommen verhindert den Angriff.');
    const cost=2500;if(p.dirty<cost)return toast(`Du brauchst ${fmt(cost)} schmutziges Geld.`);if(p.actionPoints<2)return toast('Du brauchst 2 AP.');
    spendDirtyOnly(p,cost);p.actionPoints-=2;markActivity(p,3);const atk=roleSkill(p,'gunman')*.45+roleSkill(p,'informant')*.12+rand(0,22),def=businessSecurity(t,b)+roleSkill(t,'gunman')*.08,success=chance(clamp(.42+(atk-def)/120,.08,.9));p.heat=clamp(p.heat+18*(1-shield(p)/100),0,100);adjustRelation(p,t,-22);
    if(success){const dmg=rand(35,65)+p.staff.gunman*2;b.health=clamp(b.health-dmg,0,100);p.reputation+=5;p.stats.attacksSuccess++;p.lastAction=`${t.family} sabotiert`;if(b.health<=0){t.businesses=t.businesses.filter(x=>x.id!==b.id);recordChronicle(`${p.family} zerstört ${byBiz(b.type).name} von ${t.family}.`);toast(`${byBiz(b.type).name} von ${t.family} wurde zerstört.`);}else toast(`Sabotage erfolgreich. Zustand ${Math.round(b.health)}%.`);}else{loseRandomGunman(p,.35);p.lastAction='Sabotage gescheitert';toast('Sabotage gescheitert.');}
    ledger(p,'Sabotagevorbereitung',-cost,'expense');closeDialog();saveGame();renderAll();
  };
  kidnapPerson=function(tid,sid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),s=t?.staffRoster.find(x=>x.id===sid);if(!s)return;const cost=3000;if(p.dirty<cost)return toast(`Du brauchst ${fmt(cost)} schmutziges Geld.`);if(p.actionPoints<2)return toast('Du brauchst 2 AP.');spendDirtyOnly(p,cost);p.actionPoints-=2;markActivity(p,3);const success=chance(clamp(.45+roleSkill(p,'gunman')/450+roleSkill(p,'informant')/700-roleSkill(t,'guard')/700,.12,.88));p.heat=clamp(p.heat+20,0,100);adjustRelation(p,t,-30);if(success){s.heldUntil=state.round+3;syncStaffCounts(t);const ransom=Math.min(totalLiquid(t),Math.round(STAFF[s.role].cost*(2+s.skill/45)));spend(t,ransom,false);p.dirty+=ransom;p.reputation+=3;ledger(p,'Lösegeld',ransom,'dirty');recordChronicle(`${p.family} entführt eine Schlüsselfigur von ${t.family}.`);toast(`${s.name} entführt. Lösegeld ${fmt(ransom)}.`);}else{loseRandomGunman(p,.4);toast('Entführung gescheitert.');}closeDialog();saveGame();renderAll();};
  assassinatePerson=function(tid,sid){const p=currentPlayer(),t=state.players.find(x=>x.id===tid),s=t?.staffRoster.find(x=>x.id===sid);if(!s)return;const cost=5000;if(p.dirty<cost)return toast(`Du brauchst ${fmt(cost)} schmutziges Geld.`);if(p.actionPoints<2)return toast('Du brauchst 2 AP.');spendDirtyOnly(p,cost);p.actionPoints-=2;markActivity(p,4);const success=chance(clamp(.28+roleSkill(p,'gunman')/520+roleSkill(p,'informant')/900-roleSkill(t,'guard')/600-roleSkill(t,'bodyguard')/700,.07,.78));p.heat=clamp(p.heat+35,0,100);adjustRelation(p,t,-55);if(success){t.staffRoster=t.staffRoster.filter(x=>x.id!==s.id);syncStaffCounts(t);p.reputation+=6;p.stats.attacksSuccess++;recordChronicle(`${p.family} verübt einen erfolgreichen Anschlag auf ${t.family}.`);toast(`Anschlag erfolgreich: ${s.name} fällt aus der Organisation von ${t.family}.`);}else{loseRandomGunman(p,.55);if(chance(.35))p.jailed=Math.max(p.jailed,rand(2,5));toast('Anschlag gescheitert. Die Fahndung läuft heiß.');}closeDialog();saveGame();renderAll();};

  openLoanDialog=function(){
    const p=currentPlayer();if(p.creditDefaults>=2)return toast('Die Bank verweigert weitere Kredite nach wiederholten Ausfällen.');
    const max=Math.max(30000,Math.round(netWorth(p)*.55+p.reputation*3000)),out=outstandingLoans(p),rate=loanRate(p),opts=[25000,100000,500000,1000000,2500000].filter(x=>x+out<=max);
    if(!opts.length)return toast(`Deine Kreditlinie ist ausgeschöpft (${fmt(max)}).`);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Bank</p><h2>Kredit aufnehmen</h2></div><button class="icon-btn" data-close>✕</button></div><p class="muted">Kreditlinie: ${fmt(max)} · offen ${fmt(out)} · Zinssatz ${Math.round(rate*1000)/10}%/R · Ausfälle: ${p.creditDefaults}.</p><div class="dialog-list">${opts.map(a=>`<div class="dialog-option"><div><strong>${fmt(a)}</strong><p>Mindesttilgung ${fmt(Math.max(1500,Math.round(a/10)))}/R · Auszahlung ist sauberes Kapital.</p></div><button class="btn btn-primary" data-loan-amt="${a}">Aufnehmen</button></div>`).join('')}</div></div>`);
    $('[data-loan-amt]').forEach(b=>b.onclick=()=>takeLoan(+b.dataset.loanAmt));
  };
  takeLoan=function(amount){const p=currentPlayer(),rate=loanRate(p);p.clean+=amount;p.loans.push({id:uid(),original:amount,remaining:amount,rate,payment:Math.max(1500,Math.round(amount/10)),started:state.round,missed:0,status:'active'});markActivity(p);ledger(p,'Bankkredit',amount,'loan');recordChronicle(`${p.family} finanziert Expansion über einen Bankkredit.`);closeDialog();saveGame();renderAll();toast(`${fmt(amount)} sauberes Kapital ausgezahlt.`);};
  function repayLoan(id,amount=null){const p=currentPlayer(),l=p.loans.find(x=>x.id===id);if(!l)return;const pay=Math.min(l.remaining,amount||Math.max(5000,Math.round(l.remaining*.25)),p.clean);if(pay<=0)return toast('Kein sauberes Kapital zur Tilgung.');spendClean(p,pay);l.remaining-=pay;l.missed=0;markActivity(p);p.stats.loansRepaid++;ledger(p,'Sondertilgung Bankkredit',-pay,'loan');if(l.remaining<=50)p.loans=p.loans.filter(x=>x.id!==id);saveGame();renderAll();toast(`${fmt(pay)} Kredit getilgt.`);}
  repayDebt=function(){const p=currentPlayer();if(!p||p.debt<=0)return;const amount=Math.min(p.debt,p.clean);if(amount<=0)return toast('Für diese Schulden brauchst du sauberes Kapital.');spendClean(p,amount);p.debt-=amount;if(p.debt<=0){p.debt=0;p.turnsInDebt=0;}markActivity(p);ledger(p,'Schulden getilgt',-amount,'debt');saveGame();renderAll();toast(`${fmt(amount)} getilgt.`);};
  processLoans=function(p){
    for(const l of [...p.loans]){
      const interest=Math.max(100,Math.round(l.remaining*l.rate));l.remaining+=interest;ledger(p,'Kreditzinsen',-interest,'loan');
      const pay=Math.min(l.remaining,l.payment);
      if(p.clean>=pay){spendClean(p,pay);l.remaining-=pay;l.missed=0;ledger(p,'Kreditrate',-pay,'loan');}
      else{
        l.missed=(l.missed||0)+1;l.remaining+=Math.round(pay*.10);ledger(p,'Kreditrate ausgefallen',-Math.round(pay*.10),'loan');
        if(l.missed===3&&p.businesses.length){
          const target=[...p.businesses].sort((a,b)=>byBiz(b.type).cost*(b.health/100)-byBiz(a.type).cost*(a.health/100))[0],value=Math.round(byBiz(target.type).cost*.52*(target.health/100));
          p.businesses=p.businesses.filter(b=>b.id!==target.id);l.remaining=Math.max(0,l.remaining-value);recordChronicle(`${p.family}: Bank verwertet ${byBiz(target.type).name} nach drei ausgefallenen Raten.`);p.eventText=`Banksicherheit verwertet: ${byBiz(target.type).name}`;
        }
        if(l.missed>=5){p.debt+=l.remaining;p.loans=p.loans.filter(x=>x.id!==l.id);p.creditDefaults++;p.stats.defaults++;recordChronicle(`${p.family}: Bank kündigt einen Kredit nach wiederholtem Zahlungsausfall.`);}
      }
    }
    p.loans=p.loans.filter(l=>l.remaining>50);
  };

  renderFinance=function(){
    const p=currentPlayer(),loanTotal=outstandingLoans(p);$('#financeMetrics').innerHTML=metricCards([['Sauberes Geld',fmt(p.clean),'positive'],['Schmutziges Geld',fmt(p.dirty),''],['Besitzwert',fmt(assetValue(p)),''],['Bankkredite',fmt(loanTotal),'negative'],['Sonstige Schulden',fmt(p.debt),'negative'],['Nettovermögen',fmt(netWorth(p)),'positive']]);
    const loanRows=(p.loans||[]).map(l=>`<div class="ledger-row"><span class="muted">Bankkredit</span><span>${fmt(l.remaining)} offen · ${Math.round(l.rate*1000)/10}% Zins · Ausfälle ${l.missed||0}/5</span><span><strong class="minus">Rate ${fmt(l.payment)}</strong> <button class="btn btn-secondary" data-repay-loan="${l.id}" ${p.clean<=0?'disabled':''}>Sondertilgen</button></span></div>`).join('');
    $('#ledgerList').innerHTML=`<div class="finance-actions"><button class="btn btn-primary" data-loan>Kredit aufnehmen</button><button class="btn btn-secondary" data-export>Spielstand exportieren</button></div>
      <div class="panel" style="padding:1rem;margin:.8rem 0"><strong>Geldkreislauf</strong><p class="muted">Betriebe ab Tier 2, Ausbauten, Reparaturen und Bankraten benötigen sauberes Geld. Illegale Aktionen und Bestechung nutzen vor allem schmutziges Geld. Deine Betriebe waschen pro Runde nur eine begrenzte Summe.</p></div>
      ${p.debt>0?`<div class="debt-repay"><div><strong>Sonstige Schulden: ${fmt(p.debt)}</strong><div class="muted">Sauber verfügbar: ${fmt(p.clean)}</div></div><button class="btn btn-primary" data-repay ${p.clean<=0?'disabled':''}>Tilgen</button></div>`:''}${loanRows}${p.ledger.length?p.ledger.slice(0,20).map(x=>`<div class="ledger-row"><span class="muted">Runde ${x.round}</span><span>${esc(x.label)}</span><strong class="${x.amount>=0?'plus':'minus'}">${x.amount>=0?'+':''}${fmt(x.amount)}</strong></div>`).join(''):'<div class="empty-state">Noch keine Buchungen.</div>'}`;
    $('[data-repay]')?.addEventListener('click',repayDebt);$('[data-loan]')?.addEventListener('click',openLoanDialog);$('[data-export]')?.addEventListener('click',exportSave);$('[data-repay-loan]').forEach(b=>b.onclick=()=>repayLoan(b.dataset.repayLoan));if(currentView==='finance')requestAnimationFrame(drawChart);
  };

  makeMission=function(p){
    let options=['business','cash','staff','control','crime','protection','scout','upgrade','trade'];
    if(p.heat>25)options.push('heat');
    const used=new Set(p.missions.map(m=>m.type)),available=options.filter(x=>!used.has(x));const type=(available.length?available:options)[rand(0,(available.length?available:options).length-1)],rewardBase=Math.max(6500,Math.round(9000+netWorth(p)*.012));
    if(type==='business'){const target=p.businesses.length+1;return{id:uid(),type,title:'Expansion',desc:`Erwirb einen weiteren Betrieb (${target} gesamt).`,target,reward:rewardBase,rep:2,start:p.businesses.length};}
    if(type==='cash'){const target=Math.round(totalLiquid(p)+Math.max(25000,totalLiquid(p)*.25)+state.round*350);return{id:uid(),type,title:'Liquiditätsreserve',desc:`Steigere dein verfügbares Kapital auf ${fmt(target)}.`,target,reward:rewardBase,rep:2};}
    if(type==='heat'){const target=Math.max(10,Math.floor(p.heat-15));return{id:uid(),type,title:'Leise arbeiten',desc:`Senke deinen Heat auf höchstens ${target}.`,target,reward:rewardBase,rep:3};}
    if(type==='staff'){const target=activeStaff(p).length+1;return{id:uid(),type,title:'Die Familie wächst',desc:`Beschäftige ${target} aktive Leute.`,target,reward:rewardBase,rep:2};}
    if(type==='control'){const choices=DISTRICTS.map(d=>({d,sh:districtShare(p,d.id)})).filter(x=>x.sh<50),x=(choices.length?choices:DISTRICTS.map(d=>({d,sh:districtShare(p,d.id)})))[rand(0,(choices.length||DISTRICTS.length)-1)],target=Math.min(50,Math.max(15,Math.ceil((x.sh+12)/5)*5));return{id:uid(),type,district:x.d.id,title:`Einfluss in ${x.d.name}`,desc:`Steigere deinen Einfluss in ${x.d.name} auf mindestens ${target}%.`,target,reward:rewardBase+3000,rep:4};}
    if(type==='crime'){return{id:uid(),type,title:'Erfolgsserie',desc:'Schließe zwei weitere Verbrechen erfolgreich ab.',target:2,reward:rewardBase,rep:3,start:p.stats.crimesSuccess||0};}
    if(type==='protection'){return{id:uid(),type,title:'Straßeneinnahmen',desc:'Errichte oder erweitere ein Schutzgeldnetz.',target:1,reward:rewardBase,rep:3,start:p.stats.protection||0};}
    if(type==='scout'){return{id:uid(),type,title:'Augen in der Stadt',desc:'Kundschafte zwei weitere Viertel aus.',target:2,reward:rewardBase,rep:3,start:p.stats.scouts||0};}
    if(type==='upgrade'){return{id:uid(),type,title:'Professionalisierung',desc:'Baue einen bestehenden Betrieb aus.',target:1,reward:rewardBase+2000,rep:3,start:p.stats.upgrades||0};}
    return{id:uid(),type:'trade',title:'Geschäft ist Geschäft',desc:'Schließe einen Handel oder Gebietstausch ab.',target:1,reward:rewardBase+2500,rep:3,start:p.stats.trades||0};
  };
  missionProgress=function(p,m){
    let cur=0,done=false,label='';
    if(m.type==='business'){cur=p.businesses.length;done=cur>=m.target;label=`${cur}/${m.target} Betriebe`;}
    if(m.type==='cash'){cur=totalLiquid(p);done=cur>=m.target;label=`${fmt(cur)} / ${fmt(m.target)}`;}
    if(m.type==='heat'){cur=p.heat;done=cur<=m.target;label=`Heat ${Math.round(cur)} / max. ${m.target}`;}
    if(m.type==='staff'){cur=activeStaff(p).length;done=cur>=m.target;label=`${cur}/${m.target} Personen`;}
    if(m.type==='control'){cur=districtShare(p,m.district);done=cur>=m.target;label=`${Math.round(cur)}% / ${m.target}%`;}
    if(m.type==='crime'){cur=(p.stats.crimesSuccess||0)-(m.start||0);done=cur>=m.target;label=`${Math.min(m.target,cur)}/${m.target} Erfolge`;}
    if(m.type==='protection'){cur=(p.stats.protection||0)-(m.start||0);done=cur>=m.target;label=`${Math.min(m.target,cur)}/${m.target} Ausbau`;}
    if(m.type==='scout'){cur=(p.stats.scouts||0)-(m.start||0);done=cur>=m.target;label=`${Math.min(m.target,cur)}/${m.target} Viertel`;}
    if(m.type==='upgrade'){cur=(p.stats.upgrades||0)-(m.start||0);done=cur>=m.target;label=`${Math.min(m.target,cur)}/${m.target} Ausbau`;}
    if(m.type==='trade'){cur=(p.stats.trades||0)-(m.start||0);done=cur>=m.target;label=`${Math.min(m.target,cur)}/${m.target} Handel`;}
    const pctVal=m.type==='heat'?clamp((100-cur)/(100-m.target)*100,0,100):m.type==='cash'||m.type==='control'?clamp(cur/m.target*100,0,100):clamp(cur/Math.max(1,m.target)*100,0,100);
    return{done,label,percent:pctVal};
  };

  // Correct the broken "Defekte Automaten" event and add richer events.
  const brokenMachines=EVENTS.find(e=>e.name==='Defekte Automaten');
  if(brokenMachines)brokenMachines.apply=p=>{const bundles=p.businesses.filter(b=>b.type==='machines');if(!bundles.length){p.eventText='Keine Automaten betroffen';return;}const cost=rand(500,2500)*Math.min(3,bundles.length);const v=Math.min(totalLiquid(p),cost);spend(p,v,false);bundles.forEach(b=>b.machines?.forEach(m=>m.condition=clamp(m.condition-rand(3,8),20,100)));if(v)ledger(p,'Automatenreparaturen',-v,'expense');};
  if(!EVENTS.some(e=>e.name==='Gewerbeprüfung'))EVENTS.push(
    {name:'Gewerbeprüfung',text:'Behörden prüfen mehrere Betriebe.',apply:p=>{const risky=p.businesses.filter(b=>byBiz(b.type).risk>=15);if(risky.length){const b=risky[rand(0,risky.length-1)];b.health=clamp(b.health-rand(2,8),20,100);p.heat=clamp(p.heat+rand(2,6),0,100);}}},
    {name:'Starker Monat',text:'Die Nachfrage zieht kurzfristig an.',apply:p=>incomeBoost(p,p.businesses.map(b=>b.type),1.08)}
  );

  triggerEvent=function(p){const ev=EVENTS[rand(0,EVENTS.length-1)],before=p.eventText;ev.apply(p);const detail=p.eventText&&p.eventText!==before?p.eventText:'';p.eventText=detail?`${ev.name}: ${detail}`:ev.name;recordChronicle(`${p.family}: ${ev.name} – ${ev.text}`);};

  processEndOfTurn=function(p){
    ensureV3Player(p);syncStaffCounts(p);
    const wasIdle=(p.roundActivity||0)<=0;p.idleStreak=wasIdle?Math.min(8,p.idleStreak+1):Math.max(0,p.idleStreak-2);if(wasIdle)p.totalRoundsIdle++;
    p._turnIncomeFactor=idleEfficiency(p);
    let cleanGross=0,dirtyGross=0,expenses=0,launderCap=0;
    for(const b of p.businesses){
      const def=byBiz(b.type),inc=randomizedIncome(p,b),legal=def.legalShare??.6;
      cleanGross+=Math.round(inc*legal);dirtyGross+=inc-Math.round(inc*legal);
      expenses+=Math.round(def.upkeep*(1+.10*((b.level||1)-1)));
      launderCap+=def.launder*(1+.15*((b.level||1)-1));
      const wear=wasIdle?rand(2,4):rand(0,1);b.health=clamp(b.health-wear,20,100);
      if(b.type==='machines'&&b.machines)for(const m of b.machines)m.condition=clamp(m.condition-(wasIdle?rand(2,4):rand(0,1)),20,100);
    }
    const protection=totalProtectionIncome(p);dirtyGross+=protection;expenses+=Math.round(protection*.18)+staffPayroll(p);
    const idleOverhead=wasIdle&&p.businesses.length?Math.round(assetValue(p)*.0015*p.idleStreak):0;expenses+=idleOverhead;
    p.clean+=cleanGross;p.dirty+=dirtyGross;
    const launder=Math.min(p.dirty,Math.round(launderCap*(.78+Math.random()*.24)));p.dirty-=launder;p.clean+=launder;
    spend(p,expenses,true);
    const gross=cleanGross+dirtyGross;p.lastIncome=gross;p.lastExpenses=expenses;p.lastLaundered=launder;
    if(gross)ledger(p,'Betrieb & Schutzgeld',gross,'income');if(expenses)ledger(p,'Betrieb, Personal & Verwaltung',-expenses,'expense');if(idleOverhead)ledger(p,'Leerlauf / Verwaltungsverlust',-idleOverhead,'expense');if(launder)ledger(p,'Geld gewaschen',launder,'clean');
    processLoans(p);
    if(p.debt>0){p.turnsInDebt++;const interest=Math.max(250,Math.round(p.debt*.025));p.debt+=interest;ledger(p,'Schuldzinsen',-interest,'debt');if(p.turnsInDebt>=6)foreclose(p);}else p.turnsInDebt=0;
    const opRisk=operatingRisk(p)*(1-shield(p)/100),hotelCool=Math.min(2,p.businesses.filter(b=>b.type==='hotel'&&b.health>50).length*.5);
    p.heat=clamp(p.heat+opRisk-(5+shield(p)/10+roleSkill(p,'lawyer')/55+hotelCool),0,100);
    if(p.heat>=68&&chance((p.heat-55)/105*(1-shield(p)/100)))policeRaid(p);
    if(p.jailed>0){let reduce=1;if(p.staff.lawyer>=2&&chance(.25))reduce++;p.jailed=Math.max(0,p.jailed-reduce);}
    manageStaffLoyalty(p);if(chance(.26))triggerEvent(p);else p.eventText=wasIdle?'Geschäfte laufen, Führung fehlt':'Ruhige Lage';
    p.history.push(netWorth(p));if(p.history.length>24)p.history.shift();
    p.actionPoints=3;p.intel=0;p.temporaryIncomeMultiplier=1;p.businessPurchasesThisTurn=0;p.roundActivity=0;delete p._turnIncomeFactor;
    ensureMissions(p);checkVictory();saveGame();
  };

  foreclose=function(p){
    if(p.businesses.length){const b=[...p.businesses].sort((a,b)=>byBiz(b.type).cost-byBiz(a.type).cost).pop(),value=Math.round(byBiz(b.type).cost*.48*(b.health/100));p.businesses=p.businesses.filter(x=>x.id!==b.id);p.debt=Math.max(0,p.debt-value);p.turnsInDebt=0;p.eventText=`Pfändung: ${byBiz(b.type).name}`;recordChronicle(`${p.family}: ${byBiz(b.type).name} wird gepfändet.`);}
    else if(totalLiquid(p)<=0&&p.debt>50000){p.eliminated=true;recordChronicle(`${p.family} ist zahlungsunfähig und scheidet aus.`);}
  };

  checkVictory=function(){
    if(!state||state.gameOver)return;
    const active=state.players.filter(p=>!p.eliminated),activeHumans=active.filter(p=>p.type==='human');
    if(active.length===0){state.gameOver=true;state.winnerId=null;state.endReason='Alle Familien sind ausgeschieden.';return;}
    if((state.initialHumanCount||state.players.filter(p=>p.type==='human').length)>0&&activeHumans.length===0){const w=[...active].sort((a,b)=>powerIndex(b)-powerIndex(a))[0];state.gameOver=true;state.winnerId=w?.id||null;state.endReason='Die letzte menschliche Familie ist ausgeschieden.';return;}
    if(state.settings.length==='endless')return;
    const cfg={short:{min:12,target:52,districts:2},normal:{min:22,target:62,districts:3},long:{min:35,target:72,districts:4}}[state.settings.length]||{min:22,target:72,districts:3};
    if(state.round<cfg.min)return;
    if(active.length===1&&(state.initialPlayerCount||state.players.length)>1){state.gameOver=true;state.winnerId=active[0].id;state.endReason='Alle Rivalen sind ausgeschieden.';return;}
    const leader=[...active].sort((a,b)=>powerIndex(b)-powerIndex(a))[0];
    if(leader&&powerIndex(leader)>=cfg.target&&controlledDistricts(leader)>=cfg.districts){state.gameOver=true;state.winnerId=leader.id;state.endReason=`Dominanzziel erreicht: ${cfg.target}% Macht und ${cfg.districts} Viertel.`;}
  };
  showGameOver=function(){
    if(!state?.gameOver)return;const w=state.players.find(p=>p.id===state.winnerId),human=w?.type==='human';
    if($('#gameDialog').open&&$('#dialogContent').dataset.gameover)return;$('#dialogContent').dataset.gameover='1';
    if(!w){openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Partie beendet</p><h2>Kein Syndikat überlebt</h2></div></div><p>${esc(state.endReason||'Die Stadt bleibt ohne Sieger.')}</p><div class="dialog-footer"><button class="btn btn-secondary" data-menu>Hauptmenü</button><button class="btn btn-primary" data-new>Neue Partie</button></div></div>`);}
    else{openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">${human?'Sieg':'Partie beendet'}</p><h2>${esc(w.family)} ${human?'dominiert die Stadt':'setzt sich durch'}</h2></div></div><p>${esc(state.endReason||'Dominanzziel erreicht.')}</p><div class="finance-grid">${metricCards([['Macht',pct(powerIndex(w)),'positive'],['Nettovermögen',fmt(netWorth(w)),'positive'],['Betriebe',w.businesses.length,''],['Viertel',controlledDistricts(w),''],['Reputation',w.reputation,'']])}</div><div class="dialog-footer"><button class="btn btn-secondary" data-menu>Hauptmenü</button><button class="btn btn-primary" data-new>Neue Partie</button></div></div>`);}
    $('[data-menu]').onclick=()=>{closeDialog();showScreen('menuScreen');};$('[data-new]').onclick=()=>{closeDialog();showScreen('setupScreen');};
  };

  advanceIndex=function(){
    if(!state||state.gameOver)return;const n=state.players.length,start=state.currentIndex;
    for(let step=1;step<=n;step++){const idx=(start+step)%n;if(!state.players[idx].eliminated){if(idx<=start)state.round++;state.currentIndex=idx;return;}}
    checkVictory();
  };
  endHumanTurn=function(){
    if(!state||state.gameOver)return;const p=currentPlayer();if(!p||p.type!=='human'||p.eliminated)return;
    processEndOfTurn(p);if(state.gameOver){saveGame();renderAll();return;}advanceIndex();
    let guard=0;while(!state.gameOver&&currentPlayer()?.type==='ai'&&guard++<state.players.length*3){const ai=currentPlayer();if(ai.eliminated){advanceIndex();continue;}aiTurn(ai);processEndOfTurn(ai);if(state.gameOver)break;advanceIndex();}
    checkVictory();saveGame();renderAll();if(!state.gameOver&&currentPlayer()?.type==='human'&&state.players.filter(x=>x.type==='human'&&!x.eliminated).length>1)showHandoff();
  };

  function aiClaimMissions(p){for(const m of [...p.missions]){if(missionProgress(p,m).done){p.clean+=m.reward;p.reputation+=m.rep;p.missions=p.missions.filter(x=>x.id!==m.id);ledger(p,`Auftrag: ${m.title}`,m.reward,'income');}}ensureMissions(p);}
  function aiCanBuy(p,type,did){const def=byBiz(type),cost=purchaseCost(type);return def.tier<=unlockedTier(p)&&districtSlotsFree(did)>=def.slotUse&&p.actionPoints>0&&(def.tier>=2?p.clean>=cost:totalLiquid(p)>=cost);}
  function aiBuy(p,type,did){const def=byBiz(type),cost=purchaseCost(type);if(!aiCanBuy(p,type,did))return false;def.tier>=2?spendClean(p,cost):spendDirtyFirst(p,cost);p.actionPoints--;p.businessPurchasesThisTurn++;markActivity(p,2);const b={id:uid(),type,district:did,health:100,level:1,name:def.name,acquiredRound:state.round,routeId:null};if(type==='machines')b.machines=createMachineUnits();p.businesses.push(b);p.reputation+=def.rep;return true;}
  function aiMaintainAndUpgrade(p){
    const damaged=p.businesses.filter(b=>b.health<70&&p.clean>=repairCost(b)).sort((a,b)=>a.health-b.health)[0];
    if(damaged&&chance(.55)){const c=repairCost(damaged);spendClean(p,c);damaged.health=100;p.stats.maintenance++;markActivity(p);return true;}
    const up=p.businesses.filter(b=>b.level<3&&p.clean>=upgradeCost(b)&&marketSaturation(b.type,b.district)<.92).sort((a,b)=>estimateIncome(p,b)-estimateIncome(p,a))[0];
    if(up&&chance(.45)){const c=upgradeCost(up);spendClean(p,c);up.level++;p.stats.upgrades++;markActivity(p);return true;}return false;
  }
  function aiDiplomacy(p){
    const candidates=state.players.filter(t=>t.id!==p.id&&!t.eliminated&&!pactActive(p,t));
    if(!candidates.length||p.clean<5000)return;
    const t=candidates[rand(0,candidates.length-1)];
    if(p.profile!=='aggressive'&&relation(p,t)>8&&chance(.10)){p.clean-=5000;p.pacts[t.id]=state.round+5;t.pacts[p.id]=state.round+5;adjustRelation(p,t,6);}
    if(relation(p,t)>28&&p.clean>=15000&&chance(.05)){p.clean-=15000;p.alliances[t.id]=state.round+7;t.alliances[p.id]=state.round+7;p.pacts[t.id]=state.round+7;t.pacts[p.id]=state.round+7;adjustRelation(p,t,9);}
  }
  function aiCreateRoutes(p){const bundles=p.businesses.filter(b=>b.type==='machines');if(bundles.length>=2&&!p.routes.length&&p.clean>=2500){p.clean-=2500;p.routes.push({id:uid(),name:'Automatenroute',level:1});bundles.forEach(b=>b.routeId=p.routes[0].id);}else if(p.routes.length&&p.routes[0].level<3&&p.clean>=5000*p.routes[0].level&&chance(.18)){p.clean-=5000*p.routes[0].level;p.routes[0].level++;}}
  aiTurn=function(p){
    if(p.eliminated)return;initPlayer(p);aiClaimMissions(p);const diff={easy:.82,normal:1,hard:1.12,boss:1.28}[state.settings.difficulty]||1;
    if(p.jailed>0){if(p.actionPoints>0&&chance(.45))doAiPrison(p);p.lastAction='Organisation aus der Haft geführt';markActivity(p);return;}
    if(p.debt>0&&p.clean>Math.max(5000,p.debt*.25)){const pay=Math.min(p.debt,Math.round(p.clean*.45));p.clean-=pay;p.debt-=pay;ledger(p,'Schulden getilgt',-pay,'debt');}
    if(p.heat>58&&p.actionPoints>0){p.actionPoints--;p.heat=clamp(p.heat-rand(10,18),0,100);markActivity(p);}
    const desired=p.profile==='aggressive'?[['gunman',4],['guard',2],['informant',2],['lawyer',1],['bodyguard',1],['manager',2]]:
      p.profile==='economic'?[['manager',4],['guard',2],['lawyer',2],['informant',1],['gunman',1],['bodyguard',1]]:
      p.profile==='defensive'?[['guard',4],['bodyguard',2],['lawyer',2],['manager',2],['informant',1],['gunman',1]]:
      [['manager',3],['guard',2],['gunman',2],['informant',2],['lawyer',1],['bodyguard',1]];
    for(const [role,target] of desired){if(p.staff[role]<target&&totalLiquid(p)>STAFF[role].cost*2){const legal=role==='manager'||role==='lawyer';if((legal?p.clean:totalLiquid(p))>=STAFF[role].cost){legal?spendClean(p,STAFF[role].cost):spendDirtyFirst(p,STAFF[role].cost);p.staffRoster.push(createStaffPerson(role));syncStaffCounts(p);markActivity(p);break;}}}
    if((p.profile==='corrupt'||p.heat>45)&&p.dirty>4000){const next=Object.entries(CORRUPTION).find(([k,c])=>!p.bribes[k]&&p.dirty>=c.cost*1.15);if(next&&chance(.5)){spendDirtyOnly(p,next[1].cost);p.bribes[next[0]]=true;p.reputation+=2;markActivity(p);}}
    if(p.businesses.length&&p.clean>30000)aiMaintainAndUpgrade(p);
    if(p.staff.informant&&chance(.25)){const d=DISTRICTS[rand(0,DISTRICTS.length-1)];p.scouting[d.id]={round:state.round,level:clamp(1+Math.floor(roleSkill(p,'informant')/35),1,3)};p.stats.scouts++;markActivity(p);}
    if(p.staff.gunman>0&&p.actionPoints>0&&chance(.18)&&Object.keys(p.protection).length<4){const d=DISTRICTS[rand(0,DISTRICTS.length-1)],lv=p.protection[d.id]?.level||0,cost=2500*(lv+1);if(lv<3&&p.dirty>=cost){spendDirtyOnly(p,cost);p.protection[d.id]={level:lv+1,started:state.round};p.actionPoints--;p.stats.protection++;markActivity(p,2);}}
    let buys=0;
    while(p.actionPoints>0&&buys<2){
      const candidates=Object.entries(BUSINESSES).filter(([type,b])=>b.tier<=unlockedTier(p)).map(([type,b])=>({type,b,score:(b.baseIncome-b.upkeep)/Math.max(1,purchaseCost(type))*(p.profile==='economic'?1.25:1)})).sort((a,b)=>b.score-a.score);
      const districts=[...DISTRICTS].sort((a,b)=>districtShare(p,a.id)-districtShare(p,b.id));let done=false;
      for(const d of districts){const pick=candidates.find(x=>aiCanBuy(p,x.type,d.id));if(pick){done=aiBuy(p,pick.type,d.id);if(done){buys++;break;}}}
      if(!done)break;
    }
    aiCreateRoutes(p);aiDiplomacy(p);
    if(p.profile==='aggressive'&&p.staff.gunman>0&&p.actionPoints>=2&&p.dirty>=2500&&chance(.22*diff)){const targets=state.players.filter(x=>x.id!==p.id&&!x.eliminated&&x.businesses.length&&!pactActive(p,x)&&!allianceActive(p,x));if(targets.length){const t=targets[rand(0,targets.length-1)],b=t.businesses[rand(0,t.businesses.length-1)];spendDirtyOnly(p,2500);const atk=roleSkill(p,'gunman')*.45+rand(0,20),def=businessSecurity(t,b);if(chance(clamp(.4+(atk-def)/120,.08,.88))){b.health=clamp(b.health-rand(25,55),0,100);if(!b.health)t.businesses=t.businesses.filter(x=>x.id!==b.id);p.stats.attacksSuccess++;}p.actionPoints-=2;p.heat=clamp(p.heat+15,0,100);adjustRelation(p,t,-20);markActivity(p,3);}}
    while(p.actionPoints>0){const pool=CRIMES.filter(c=>p.actionPoints>=c.ap),c=p.heat>55?pool[0]:pool[Math.min(pool.length-1,Math.floor(netWorth(p)/180000)%pool.length)];if(!c)break;p.actionPoints-=c.ap;markActivity(p,2);if(chance(clamp(crimeSuccess(p,c)*diff,.05,.96))){const take=Math.round(rand(c.min,c.max)*diff);p.dirty+=take;p.reputation++;p.stats.crimesSuccess++;}else if(chance(.25))p.jailed=Math.max(1,c.jail-(p.bribes.judge?1:0));p.heat=clamp(p.heat+c.heat*(1-shield(p)/100),0,100);}
    if(p.clean<15000&&netWorth(p)>120000&&!p.creditDefaults&&outstandingLoans(p)<netWorth(p)*.3&&chance(.12)){const amount=Math.min(100000,Math.round(netWorth(p)*.18));p.clean+=amount;p.loans.push({id:uid(),original:amount,remaining:amount,rate:loanRate(p),payment:Math.max(1500,Math.round(amount/10)),started:state.round,missed:0,status:'active'});}
    aiClaimMissions(p);p.lastAction=p.lastAction||'Syndikat verwaltet';
  };

  function openChronicleDialog(){
    const rows=(state.log||[]).slice(0,40);openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Stadtchronik</p><h2>Was in der Stadt passiert</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${rows.length?rows.map(x=>`<div class="dialog-option"><div><strong>Runde ${x.round}</strong><p>${esc(x.msg)}</p></div></div>`).join(''):'<div class="empty-state">Noch keine wichtigen Ereignisse.</div>'}</div></div>`);
  }
  openMoreMenu=function(){
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Navigation</p><h2>Mehr</h2></div><button class="icon-btn" data-close>✕</button></div><div class="more-grid"><button class="btn btn-secondary" data-go="staff">♟ Personal</button><button class="btn btn-secondary" data-go="corruption">⚖ Einfluss</button><button class="btn btn-secondary" data-go="finance">▥ Finanzen</button><button class="btn btn-secondary" data-go="missions">◎ Aufträge</button><button class="btn btn-secondary" data-go="ranking">♛ Rangliste</button><button class="btn btn-secondary" data-more-diplomacy>🤝 Diplomatie</button><button class="btn btn-secondary" data-more-routes>♣ Automatenrouten</button><button class="btn btn-secondary" data-chronicle>▤ Stadtchronik</button></div></div>`);
    $('[data-go]').forEach(b=>b.onclick=()=>{closeDialog();setView(b.dataset.go);});$('[data-more-diplomacy]').onclick=()=>{closeDialog();openDiplomacyDialog();};$('[data-more-routes]').onclick=()=>{closeDialog();openRoutesDialog();};$('[data-chronicle]').onclick=openChronicleDialog;
  };

  const baseOpenGameMenu=openGameMenu;
  openGameMenu=function(){baseOpenGameMenu();const h=$('#dialogContent h2');if(h&&h.textContent==='Unterwelt')h.textContent='Syndikat';};

  exportSave=function(){if(!state)return;const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`syndikat-spielstand-r${state.round}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Syndikat-Spielstand exportiert.');};
})();
/* SYNDIKAT_REVISION_3_END */

/* SYNDIKAT_REVISION_3_1_BEGIN */
(function REVISION31_PATCH(){
  function s31(type){return BUSINESSES[type]?.slotUse||1;}
  function used31(did){return state.players.filter(x=>!x.eliminated).reduce((sum,p)=>sum+p.businesses.filter(b=>b.district===did).reduce((a,b)=>a+s31(b.type),0),0);}
  function free31(did){const d=DISTRICTS.find(x=>x.id===did);return Math.max(0,(d.slots||14)-used31(did));}
  function inf31(){return 1+Math.min(.25,Math.max(0,(state?.round||1)-1)*.0015);}
  function cost31(type){return Math.round(BUSINESSES[type].cost*inf31());}
  function tier31(p){const n=netWorth(p),r=p.reputation||0,c=controlledDistricts(p);if(n>=7500000&&r>=55&&c>=2)return 6;if(n>=2500000&&r>=35&&c>=1)return 5;if(n>=750000&&r>=20)return 4;if(n>=200000&&r>=10)return 3;if(n>=60000||r>=6)return 2;return 1;}
  function clean31(p,a){a=Math.round(a);if(p.clean<a)return false;p.clean-=a;return true;}
  function dirty31(p,a){a=Math.round(a);if(p.dirty<a)return false;p.dirty-=a;return true;}
  function dirtyFirst31(p,a){a=Math.round(a);const d=Math.min(p.dirty,a);p.dirty-=d;a-=d;const c=Math.min(p.clean,a);p.clean-=c;a-=c;return a===0;}
  function activity31(p,n=1){p.roundActivity=(p.roundActivity||0)+n;}
  function focus31(p){
    if(Array.isArray(p.aiFocus)&&p.aiFocus.length)return p.aiFocus;
    const profiles={
      aggressive:['redlight','station','oldtown','harbor'],
      economic:['center','west','oldtown','south'],
      corrupt:['center','oldtown','west','redlight'],
      smuggler:['harbor','station','industrial','south'],
      defensive:['west','south','industrial','oldtown'],
      balanced:['oldtown','south','center','station']
    };
    p.aiFocus=[...(profiles[p.profile]||profiles.balanced)];return p.aiFocus;
  }
  function aiMission31(p){
    let claimed=0;
    for(const m of [...p.missions])if(missionProgress(p,m).done){p.clean+=m.reward;p.reputation+=m.rep;p.missions=p.missions.filter(x=>x.id!==m.id);ledger(p,`Auftrag: ${m.title}`,m.reward,'income');claimed++;}
    ensureMissions(p);return claimed;
  }
  function buy31(p,type,did){
    const def=BUSINESSES[type],price=cost31(type);if(!def||p.actionPoints<1||p.businessPurchasesThisTurn>=2||def.tier>tier31(p)||free31(did)<s31(type))return false;
    if(def.tier>=2){if(!clean31(p,price))return false;}else{if(totalLiquid(p)<price||!dirtyFirst31(p,price))return false;}
    p.actionPoints--;p.businessPurchasesThisTurn++;activity31(p,2);
    const b={id:uid(),type,district:did,health:100,level:1,name:def.name,acquiredRound:state.round,routeId:null};if(type==='machines')b.machines=createMachineUnits();
    p.businesses.push(b);p.reputation+=def.rep;return true;
  }
  function redevelop31(p,did,minSlots){
    if(free31(did)>=minSlots)return true;
    const own=p.businesses.filter(b=>b.district===did).sort((a,b)=>(BUSINESSES[a.type].influence/s31(a.type))-(BUSINESSES[b.type].influence/s31(b.type)));
    while(free31(did)<minSlots&&own.length){
      const b=own.shift(),value=Math.round(BUSINESSES[b.type].cost*.50*(b.health/100));p.businesses=p.businesses.filter(x=>x.id!==b.id);p.clean+=value;ledger(p,`KI-Neuentwicklung: ${BUSINESSES[b.type].name}`,value,'clean');
    }
    return free31(did)>=minSlots;
  }
  function aiUpgrade31(p){
    const candidates=p.businesses.filter(b=>b.level<3).sort((a,b)=>(BUSINESSES[b.type].influence/s31(b.type))-(BUSINESSES[a.type].influence/s31(a.type)));
    const b=candidates[0];if(!b)return false;const c=Math.round(BUSINESSES[b.type].cost*.20*b.level*inf31());if(p.clean<c*1.4)return false;p.clean-=c;b.level++;p.stats.upgrades=(p.stats.upgrades||0)+1;activity31(p);return true;
  }
  function aiRoute31(p){
    const packs=p.businesses.filter(b=>b.type==='machines');
    if(packs.length>=2&&!p.routes.length&&p.clean>=2500){p.clean-=2500;p.routes.push({id:uid(),name:'Automatenroute',level:1});packs.forEach(b=>b.routeId=p.routes[0].id);activity31(p);}
    if(p.routes.length&&p.routes[0].level<3&&p.clean>=5000*p.routes[0].level&&chance(.16)){p.clean-=5000*p.routes[0].level;p.routes[0].level++;activity31(p);}
  }
  function aiPolitics31(p){
    const others=state.players.filter(t=>t.id!==p.id&&!t.eliminated);
    if(!others.length)return;
    const t=others[rand(0,others.length-1)];
    if(p.profile!=='aggressive'&&!pactActive(p,t)&&relation(p,t)>5&&p.clean>=5000&&chance(.10)){p.clean-=5000;p.pacts[t.id]=state.round+5;t.pacts[p.id]=state.round+5;adjustRelation(p,t,6);activity31(p);}
    if(!allianceActive(p,t)&&relation(p,t)>25&&p.clean>=15000&&chance(.05)){p.clean-=15000;p.alliances[t.id]=state.round+7;t.alliances[p.id]=state.round+7;p.pacts[t.id]=state.round+7;t.pacts[p.id]=state.round+7;adjustRelation(p,t,9);activity31(p);}
    if(relation(p,t)>20&&t.businesses.length&&p.clean>150000&&chance(.045)){
      const wanted=t.businesses.filter(b=>focus31(p).includes(b.district)).sort((a,b)=>BUSINESSES[b.type].influence-BUSINESSES[a.type].influence)[0];
      if(wanted){const price=Math.round(BUSINESSES[wanted.type].cost*1.30*(wanted.health/100)*inf31());if(p.clean>=price&&free31(wanted.district)>=0){p.clean-=price;t.clean+=price;t.businesses=t.businesses.filter(b=>b.id!==wanted.id);wanted.routeId=null;p.businesses.push(wanted);adjustRelation(p,t,3);p.stats.trades=(p.stats.trades||0)+1;activity31(p);}}
    }
  }
  function aiViolence31(p,diff){
    if(p.actionPoints<2||p.staff.gunman<1||p.dirty<2500)return;
    const targets=state.players.filter(t=>t.id!==p.id&&!t.eliminated&&!pactActive(p,t)&&!allianceActive(p,t));
    if(!targets.length)return;
    const t=[...targets].sort((a,b)=>powerIndex(b)-powerIndex(a))[0];
    if(p.staff.gunman>=2&&t.staffRoster.length&&p.dirty>=5000&&chance(.055*diff)){
      const s=activeStaff(t).sort((a,b)=>b.skill-a.skill)[0];if(s){dirty31(p,5000);p.actionPoints-=2;activity31(p,4);const ok=chance(clamp(.25+roleSkill(p,'gunman')/550+roleSkill(p,'informant')/950-roleSkill(t,'guard')/650,.06,.72));p.heat=clamp(p.heat+32,0,100);adjustRelation(p,t,-50);if(ok){t.staffRoster=t.staffRoster.filter(x=>x.id!==s.id);syncStaffCounts(t);p.reputation+=5;p.stats.attacksSuccess++;}return;}
    }
    if(t.staffRoster.length&&p.dirty>=3000&&chance(.08*diff)){
      const s=activeStaff(t)[rand(0,Math.max(0,activeStaff(t).length-1))];if(s){dirty31(p,3000);p.actionPoints-=2;activity31(p,3);const ok=chance(clamp(.42+roleSkill(p,'gunman')/480+roleSkill(p,'informant')/750-roleSkill(t,'guard')/700,.1,.82));p.heat=clamp(p.heat+18,0,100);adjustRelation(p,t,-28);if(ok){s.heldUntil=state.round+3;syncStaffCounts(t);const ransom=Math.min(totalLiquid(t),Math.round(STAFF[s.role].cost*1.8));spend(t,ransom,false);p.dirty+=ransom;}return;}
    }
    if(t.businesses.length&&chance(.20*diff)){
      const b=t.businesses.sort((a,b)=>BUSINESSES[b.type].influence-BUSINESSES[a.type].influence)[0];dirty31(p,2500);p.actionPoints-=2;activity31(p,3);const ok=chance(clamp(.40+(roleSkill(p,'gunman')*.42-businessSecurity(t,b))/120,.08,.85));p.heat=clamp(p.heat+15,0,100);adjustRelation(p,t,-20);if(ok){b.health=clamp(b.health-rand(28,58),0,100);if(!b.health)t.businesses=t.businesses.filter(x=>x.id!==b.id);p.stats.attacksSuccess++;}}
  }

  aiTurn=function(p){
    if(p.eliminated)return;initPlayer(p);aiMission31(p);const diff={easy:.82,normal:1,hard:1.12,boss:1.28}[state.settings.difficulty]||1;
    if(p.jailed>0){if(p.actionPoints>0&&chance(.45))doAiPrison(p);activity31(p);p.lastAction='Organisation aus der Haft geführt';return;}
    if(p.debt>0&&p.clean>Math.max(5000,p.debt*.25)){const pay=Math.min(p.debt,Math.round(p.clean*.45));p.clean-=pay;p.debt-=pay;ledger(p,'Schulden getilgt',-pay,'debt');}
    if(p.heat>55&&p.actionPoints>0){p.actionPoints--;p.heat=clamp(p.heat-rand(11,19),0,100);activity31(p);}
    const roster=p.profile==='aggressive'?[['gunman',4],['guard',2],['informant',2],['bodyguard',2],['lawyer',1],['manager',2]]:
      p.profile==='economic'?[['manager',4],['guard',2],['lawyer',2],['informant',1],['bodyguard',1],['gunman',1]]:
      p.profile==='defensive'?[['guard',4],['bodyguard',3],['lawyer',2],['manager',2],['informant',1],['gunman',1]]:
      [['manager',3],['guard',2],['gunman',2],['informant',2],['lawyer',1],['bodyguard',1]];
    for(const [role,target] of roster){if(p.staff[role]>=target)continue;const c=STAFF[role].cost,legal=role==='manager'||role==='lawyer';if((legal?p.clean:totalLiquid(p))<c*1.4)continue;legal?clean31(p,c):dirtyFirst31(p,c);p.staffRoster.push(createStaffPerson(role));syncStaffCounts(p);activity31(p);break;}
    if((p.profile==='corrupt'||p.heat>42)&&p.dirty>4000){const next=Object.entries(CORRUPTION).find(([k,c])=>!p.bribes[k]&&p.dirty>=c.cost*1.1);if(next&&chance(.48)){dirty31(p,next[1].cost);p.bribes[next[0]]=true;p.reputation+=2;activity31(p);}}
    if(p.staff.informant&&chance(.25)){const did=focus31(p)[rand(0,focus31(p).length-1)];p.scouting[did]={round:state.round,level:clamp(1+Math.floor(roleSkill(p,'informant')/35),1,3)};p.stats.scouts++;activity31(p);}
    if(p.clean>50000&&chance(.35))aiUpgrade31(p);

    // Focus expansion: finish one district before spreading out.
    let buys=0;
    while(p.actionPoints>0&&p.businessPurchasesThisTurn<2&&buys<2){
      const focus=focus31(p).map((did,i)=>({did,i,share:districtShare(p,did),controlled:districtShare(p,did)>=50})).sort((a,b)=>(a.controlled-b.controlled)||(b.share-a.share)||a.i-b.i);
      let did=focus[0]?.did||DISTRICTS[0].id;
      const available=Object.entries(BUSINESSES).filter(([type,b])=>b.tier<=tier31(p)&&(b.tier>=2?p.clean>=cost31(type):totalLiquid(p)>=cost31(type)));
      available.sort((a,b)=>{
        const score=x=>{const [type,d]=x,roi=(d.baseIncome-d.upkeep)/Math.max(1,cost31(type)),influence=d.influence/s31(type);return influence*2.2+roi*420+(d.tier===tier31(p)?8:0);};
        return score(b)-score(a);
      });
      let pick=available.find(([type,b])=>free31(did)>=s31(type));
      if(!pick&&available.length&&tier31(p)>=3){const need=Math.min(...available.map(x=>s31(x[0])));redevelop31(p,did,need);pick=available.find(([type,b])=>free31(did)>=s31(type));}
      if(!pick)break;
      if(buy31(p,pick[0],did))buys++;else break;
    }

    // Protection reinforces the current territorial focus.
    if(p.staff.gunman>0&&p.actionPoints>0&&p.dirty>=2500&&chance(.25)){
      const did=focus31(p).filter(x=>districtShare(p,x)<50).sort((a,b)=>districtShare(p,b)-districtShare(p,a))[0]||focus31(p)[0],lv=p.protection[did]?.level||0,c=2500*(lv+1);
      if(lv<3&&p.dirty>=c){dirty31(p,c);p.protection[did]={level:lv+1,started:state.round};p.actionPoints--;p.stats.protection++;activity31(p,2);}
    }
    aiRoute31(p);aiPolitics31(p);if(p.profile==='aggressive')aiViolence31(p,diff);

    while(p.actionPoints>0&&!p.jailed){
      const pool=CRIMES.filter(c=>p.actionPoints>=c.ap),c=p.heat>55?pool[0]:pool[Math.min(pool.length-1,Math.floor(netWorth(p)/180000)%pool.length)];if(!c)break;
      p.actionPoints-=c.ap;activity31(p,2);if(chance(clamp(crimeSuccess(p,c)*diff,.05,.96))){const take=Math.round(rand(c.min,c.max)*diff);p.dirty+=take;p.reputation++;p.stats.crimesSuccess++;}else if(chance(.25))p.jailed=Math.max(1,c.jail-(p.bribes.judge?1:0));p.heat=clamp(p.heat+c.heat*(1-shield(p)/100),0,100);
    }
    if(p.clean<20000&&netWorth(p)>120000&&p.creditDefaults<1&&outstandingLoans(p)<netWorth(p)*.28&&chance(.13)){const amount=Math.min(100000,Math.max(25000,Math.round(netWorth(p)*.16)));p.clean+=amount;p.loans.push({id:uid(),original:amount,remaining:amount,rate:.03,payment:Math.max(1500,Math.round(amount/10)),started:state.round,missed:0,status:'active'});}
    aiMission31(p);p.lastAction='Syndikat strategisch geführt';
  };

  tradeSellBusiness=function(tid,bid){
    const p=currentPlayer(),t=state.players.find(x=>x.id===tid),b=p.businesses.find(x=>x.id===bid);if(!t||!b)return;const price=Math.round(BUSINESSES[b.type].cost*.80*(b.health/100)*inf31());
    if(t.clean<price||!targetAccepts(p,t,.55+relation(p,t)/250))return toast(`${t.family} kann oder will dieses Geschäft nicht mit sauberem Kapital kaufen.`);
    t.clean-=price;p.clean+=price;p.businesses=p.businesses.filter(x=>x.id!==bid);b.routeId=null;t.businesses.push(b);adjustRelation(p,t,5);p.stats.trades++;activity31(p);ledger(p,`Betrieb an ${t.family} verkauft`,price,'clean');closeDialog();saveGame();renderAll();toast('Handel abgeschlossen.');
  };

  doPrisonAction=function(kind){
    const p=currentPlayer();if(p.jailed<=0)return;const need=kind==='escape'?2:1;if(p.actionPoints<need)return toast('Nicht genug AP.');
    if(kind==='appeal'){const cost=3000+Math.max(0,p.jailed-1)*1000;if(p.clean<cost)return toast(`Für die Berufung brauchst du ${fmt(cost)} sauberes Geld.`);p.clean-=cost;p.actionPoints-=need;activity31(p);const cut=chance(.45+roleSkill(p,'lawyer')/180+(p.bribes.judge?.15:0))?rand(1,2):0;p.jailed=Math.max(0,p.jailed-cut);ledger(p,'Berufung',-cost,'expense');toast(cut?`Haft um ${cut} Runde(n) reduziert.`:'Berufung ohne Erfolg.');}
    if(kind==='guardbribe'){const cost=7500;if(p.dirty<cost)return toast(`Für die Wache brauchst du ${fmt(cost)} schmutziges Geld.`);p.dirty-=cost;p.actionPoints-=need;activity31(p);if(chance(.55+shield(p)/250)){p.jailed=Math.max(0,p.jailed-1);toast('Die Wache hilft dir – 1 Runde weniger.');}else{p.heat=clamp(p.heat+8,0,100);toast('Bestechung scheitert.');}}
    if(kind==='network'){p.actionPoints-=need;activity31(p);p.reputation+=3;if(chance(.35)){const person=createStaffPerson('informant');person.loyalty=clamp(person.loyalty+8,0,100);p.staffRoster.push(person);syncStaffCounts(p);toast(`Kontakt gewonnen: ${person.name} wird Informant.`);}else toast('Du stärkst dein Netzwerk und deinen Ruf.');}
    if(kind==='escape'){p.actionPoints-=need;activity31(p,3);const ok=chance(.14+roleSkill(p,'informant')/500+roleSkill(p,'gunman')/600+shield(p)/500);if(ok){p.jailed=0;p.heat=clamp(p.heat+20,0,100);toast('Flucht gelungen. Die Polizei sucht dich jedoch intensiv.');}else{p.jailed+=2;p.heat=clamp(p.heat+12,0,100);toast('Flucht gescheitert: +2 Runden Haft.');}}
    p.lastAction='Gefängnisaktion';saveGame();renderAll();
  };

  renderCorruption=function(){
    const p=currentPlayer();$('#corruptionGrid').innerHTML=Object.entries(CORRUPTION).map(([k,c])=>`<article class="shop-card"><div class="shop-top"><div><small class="eyebrow">Einfluss</small><h3>${esc(c.name)}</h3></div><span class="owned">${p.bribes[k]?'✓':'–'}</span></div><p>${esc(c.desc)}</p><footer><span class="price">${fmt(c.cost)} schmutzig</span><button class="btn ${p.bribes[k]?'btn-ghost':'btn-secondary'}" data-bribe="${k}" ${p.bribes[k]||p.jailed||p.dirty<c.cost?'disabled':''}>${p.bribes[k]?'Aktiv':'Bestechen'}</button></footer></article>`).join('');$('#corruptionGrid [data-bribe]').forEach(b=>b.onclick=()=>buyBribe(b.dataset.bribe));
  };
})();
/* SYNDIKAT_REVISION_3_1_END */

/* SYNDIKAT_REVISION_3_2_BEGIN */
(function REVISION32_PATCH(){
  function slotsUsed32(did){return state.players.filter(x=>!x.eliminated).reduce((s,p)=>s+p.businesses.filter(b=>b.district===did).reduce((a,b)=>a+(BUSINESSES[b.type].slotUse||1),0),0);}
  function slotsFree32(did){const d=DISTRICTS.find(x=>x.id===did);return Math.max(0,(d.slots||14)-slotsUsed32(did));}
  function inf32(){return 1+Math.min(.25,Math.max(0,(state?.round||1)-1)*.0015);}
  function tier32(p){const n=netWorth(p),r=p.reputation||0,c=controlledDistricts(p);if(n>=7500000&&r>=55&&c>=2)return 6;if(n>=2500000&&r>=35&&c>=1)return 5;if(n>=750000&&r>=20)return 4;if(n>=200000&&r>=10)return 3;if(n>=60000||r>=6)return 2;return 1;}
  function reserve32(p){
    const upkeep=p.businesses.reduce((s,b)=>s+BUSINESSES[b.type].upkeep*(1+.10*((b.level||1)-1)),0),pay=staffPayroll(p),loans=(p.loans||[]).reduce((s,l)=>s+(l.payment||0),0);
    return Math.round(Math.max(12000,upkeep*1.8+pay*2.2+loans*1.3));
  }
  function cost32(type){return Math.round(BUSINESSES[type].cost*inf32());}
  function clean32(p,a){a=Math.round(a);if(p.clean<a)return false;p.clean-=a;return true;}
  function dirty32(p,a){a=Math.round(a);if(p.dirty<a)return false;p.dirty-=a;return true;}
  function dirtyFirst32(p,a){a=Math.round(a);const d=Math.min(p.dirty,a);p.dirty-=d;a-=d;const c=Math.min(p.clean,a);p.clean-=c;a-=c;return a===0;}
  function act32(p,n=1){p.roundActivity=(p.roundActivity||0)+n;}
  function focus32(p){
    if(Array.isArray(p.aiFocus)&&p.aiFocus.length)return p.aiFocus;
    const m={aggressive:['redlight','station','oldtown','harbor'],economic:['center','west','oldtown','south'],corrupt:['center','oldtown','west','redlight'],smuggler:['harbor','station','industrial','south'],defensive:['west','south','industrial','oldtown'],balanced:['oldtown','south','center','station']};p.aiFocus=[...(m[p.profile]||m.balanced)];return p.aiFocus;
  }
  function claim32(p){for(const m of [...p.missions])if(missionProgress(p,m).done){p.clean+=m.reward;p.reputation+=m.rep;p.missions=p.missions.filter(x=>x.id!==m.id);ledger(p,`Auftrag: ${m.title}`,m.reward,'income');}ensureMissions(p);}
  function canBuy32(p,type,did){
    const d=BUSINESSES[type],price=cost32(type),reserve=reserve32(p);
    if(!d||d.tier>tier32(p)||p.actionPoints<1||p.businessPurchasesThisTurn>=2||slotsFree32(did)<d.slotUse)return false;
    return d.tier>=2?p.clean>=price+reserve:totalLiquid(p)>=price+reserve;
  }
  function buy32(p,type,did){
    if(!canBuy32(p,type,did))return false;const d=BUSINESSES[type],price=cost32(type);
    d.tier>=2?clean32(p,price):dirtyFirst32(p,price);p.actionPoints--;p.businessPurchasesThisTurn++;act32(p,2);
    const b={id:uid(),type,district:did,health:100,level:1,name:d.name,acquiredRound:state.round,routeId:null};if(type==='machines')b.machines=createMachineUnits();p.businesses.push(b);p.reputation+=d.rep;return true;
  }
  function redevelop32(p,did,need){
    if(slotsFree32(did)>=need)return true;const own=p.businesses.filter(b=>b.district===did).sort((a,b)=>(BUSINESSES[a.type].influence/(BUSINESSES[a.type].slotUse||1))-(BUSINESSES[b.type].influence/(BUSINESSES[b.type].slotUse||1)));
    while(slotsFree32(did)<need&&own.length){const b=own.shift(),v=Math.round(BUSINESSES[b.type].cost*.52*(b.health/100));p.businesses=p.businesses.filter(x=>x.id!==b.id);p.clean+=v;ledger(p,`Standort neu entwickelt: ${BUSINESSES[b.type].name}`,v,'clean');}
    return slotsFree32(did)>=need;
  }
  function upgrade32(p){
    const reserve=reserve32(p),cand=p.businesses.filter(b=>b.level<3).sort((a,b)=>(BUSINESSES[b.type].influence/(BUSINESSES[b.type].slotUse||1))-(BUSINESSES[a.type].influence/(BUSINESSES[a.type].slotUse||1)))[0];if(!cand)return false;
    const c=Math.round(BUSINESSES[cand.type].cost*.20*cand.level*inf32());if(p.clean<c+reserve)return false;p.clean-=c;cand.level++;p.stats.upgrades++;act32(p);return true;
  }
  function route32(p){
    const reserve=reserve32(p),packs=p.businesses.filter(b=>b.type==='machines');
    if(packs.length>=2&&!p.routes.length&&p.clean>=2500+reserve){p.clean-=2500;p.routes.push({id:uid(),name:'Automatenroute',level:1});packs.forEach(b=>b.routeId=p.routes[0].id);act32(p);}
    else if(p.routes.length&&p.routes[0].level<3&&p.clean>=5000*p.routes[0].level+reserve&&chance(.14)){p.clean-=5000*p.routes[0].level;p.routes[0].level++;act32(p);}
  }
  function politics32(p){
    const reserve=reserve32(p),others=state.players.filter(t=>t.id!==p.id&&!t.eliminated);if(!others.length)return;const t=others[rand(0,others.length-1)];
    if(p.profile!=='aggressive'&&!pactActive(p,t)&&relation(p,t)>5&&p.clean>=5000+reserve&&chance(.08)){p.clean-=5000;p.pacts[t.id]=state.round+5;t.pacts[p.id]=state.round+5;adjustRelation(p,t,6);act32(p);}
    if(!allianceActive(p,t)&&relation(p,t)>25&&p.clean>=15000+reserve&&chance(.04)){p.clean-=15000;p.alliances[t.id]=state.round+7;t.alliances[p.id]=state.round+7;p.pacts[t.id]=state.round+7;t.pacts[p.id]=state.round+7;adjustRelation(p,t,9);act32(p);}
  }
  function violence32(p,diff){
    const reserve=reserve32(p);if(p.actionPoints<2||p.staff.gunman<1||p.dirty<2500||totalLiquid(p)<reserve)return;
    const targets=state.players.filter(t=>t.id!==p.id&&!t.eliminated&&!pactActive(p,t)&&!allianceActive(p,t));if(!targets.length)return;const t=[...targets].sort((a,b)=>powerIndex(b)-powerIndex(a))[0];
    if(p.staff.gunman>=2&&activeStaff(t).length&&p.dirty>=5000&&chance(.035*diff)){const s=[...activeStaff(t)].sort((a,b)=>b.skill-a.skill)[0];dirty32(p,5000);p.actionPoints-=2;act32(p,4);const ok=chance(clamp(.25+roleSkill(p,'gunman')/550+roleSkill(p,'informant')/950-roleSkill(t,'guard')/650,.06,.72));p.heat=clamp(p.heat+32,0,100);adjustRelation(p,t,-50);if(ok){t.staffRoster=t.staffRoster.filter(x=>x.id!==s.id);syncStaffCounts(t);p.reputation+=5;p.stats.attacksSuccess++;}return;}
    if(t.businesses.length&&chance(.12*diff)){const b=[...t.businesses].sort((a,b)=>BUSINESSES[b.type].influence-BUSINESSES[a.type].influence)[0];dirty32(p,2500);p.actionPoints-=2;act32(p,3);const ok=chance(clamp(.40+(roleSkill(p,'gunman')*.42-businessSecurity(t,b))/120,.08,.85));p.heat=clamp(p.heat+15,0,100);adjustRelation(p,t,-20);if(ok){b.health=clamp(b.health-rand(25,50),0,100);if(!b.health)t.businesses=t.businesses.filter(x=>x.id!==b.id);p.stats.attacksSuccess++;}}
  }

  aiTurn=function(p){
    if(p.eliminated)return;initPlayer(p);claim32(p);const diff={easy:.82,normal:1,hard:1.12,boss:1.28}[state.settings.difficulty]||1;
    if(p.jailed>0){if(p.actionPoints>0&&chance(.45))doAiPrison(p);act32(p);p.lastAction='Organisation aus der Haft geführt';return;}
    const reserve=reserve32(p);
    if(p.debt>0&&p.clean>reserve+5000){const pay=Math.min(p.debt,Math.round((p.clean-reserve)*.55));p.clean-=pay;p.debt-=pay;ledger(p,'Schulden getilgt',-pay,'debt');}
    if(p.heat>55&&p.actionPoints>0){p.actionPoints--;p.heat=clamp(p.heat-rand(11,19),0,100);act32(p);}
    const roster=p.profile==='aggressive'?[['gunman',3],['guard',2],['informant',2],['bodyguard',1],['lawyer',1],['manager',2]]:
      p.profile==='economic'?[['manager',3],['guard',2],['lawyer',1],['informant',1],['bodyguard',1],['gunman',1]]:
      p.profile==='defensive'?[['guard',3],['bodyguard',2],['lawyer',1],['manager',2],['informant',1],['gunman',1]]:
      [['manager',2],['guard',2],['gunman',2],['informant',1],['lawyer',1],['bodyguard',1]];
    for(const [role,target] of roster){if(p.staff[role]>=target)continue;if(!p.businesses.length||p.lastIncome<staffPayroll(p)*2.2+2500)break;const c=STAFF[role].cost,legal=role==='manager'||role==='lawyer',avail=legal?p.clean:totalLiquid(p);if(avail<c+reserve*1.05)continue;legal?clean32(p,c):dirtyFirst32(p,c);p.staffRoster.push(createStaffPerson(role));syncStaffCounts(p);act32(p);break;}
    if(p.businesses.length>=2&&(p.profile==='corrupt'||p.heat>48)&&p.dirty>reserve*.25){const next=Object.entries(CORRUPTION).find(([k,c])=>!p.bribes[k]&&p.dirty>=c.cost+5000);if(next&&chance(.35)){dirty32(p,next[1].cost);p.bribes[next[0]]=true;p.reputation+=2;act32(p);}}
    if(p.staff.informant&&chance(.22)){const did=focus32(p)[rand(0,focus32(p).length-1)];p.scouting[did]={round:state.round,level:clamp(1+Math.floor(roleSkill(p,'informant')/35),1,3)};p.stats.scouts++;act32(p);}
    if(p.clean>reserve*2&&chance(.28))upgrade32(p);

    let buys=0;
    while(p.actionPoints>0&&p.businessPurchasesThisTurn<2&&buys<2){
      const f=focus32(p).map((did,i)=>({did,i,share:districtShare(p,did),controlled:districtShare(p,did)>=50})).sort((a,b)=>(a.controlled-b.controlled)||(b.share-a.share)||a.i-b.i),did=f[0]?.did||DISTRICTS[0].id;
      const options=Object.entries(BUSINESSES).filter(([type,b])=>b.tier<=tier32(p)).sort((a,b)=>{
        const score=x=>{const [type,d]=x,roi=(d.baseIncome-d.upkeep)/Math.max(1,cost32(type)),inf=d.influence/(d.slotUse||1);return inf*2.4+roi*360+(d.tier===tier32(p)?10:0);};return score(b)-score(a);
      });
      let pick=options.find(([type])=>canBuy32(p,type,did));
      if(!pick&&tier32(p)>=3&&options.length){const affordable=options.filter(([type,d])=>d.tier>=2?p.clean>=cost32(type)+reserve:totalLiquid(p)>=cost32(type)+reserve);if(affordable.length){const high=affordable.filter(([type,d])=>d.tier>=Math.max(3,tier32(p)-1));const target=(high.length?high:affordable)[0];const need=BUSINESSES[target[0]].slotUse||1;redevelop32(p,did,need);if(canBuy32(p,target[0],did))pick=target;}}
      if(!pick||!buy32(p,pick[0],did))break;buys++;
    }

    // If the AI cannot invest safely, use AP to build cash rather than burning its reserve.
    if(p.staff.gunman>0&&p.actionPoints>0&&p.dirty>=5000&&totalLiquid(p)>reserve*1.3&&chance(.18)){const did=focus32(p).filter(x=>districtShare(p,x)<50).sort((a,b)=>districtShare(p,b)-districtShare(p,a))[0]||focus32(p)[0],lv=p.protection[did]?.level||0,c=2500*(lv+1);if(lv<3&&p.dirty>=c+2500){dirty32(p,c);p.protection[did]={level:lv+1,started:state.round};p.actionPoints--;p.stats.protection++;act32(p,2);}}
    route32(p);politics32(p);if(p.profile==='aggressive')violence32(p,diff);

    while(p.actionPoints>0&&!p.jailed){
      let c;
      if(p.heat>48)c=CRIMES.find(x=>x.id==='machine');
      else if(p.profile==='aggressive'&&p.staff.gunman>=2&&p.staff.informant>=1&&p.heat<25&&netWorth(p)>900000&&p.actionPoints>=2&&chance(.12))c=CRIMES.find(x=>x.id==='bank');
      else if(netWorth(p)>250000&&p.heat<35&&chance(.35))c=CRIMES.find(x=>x.id==='car');
      else c=CRIMES.find(x=>x.id===(p.heat<32?'mug':'machine'));
      if(!c||p.actionPoints<c.ap)break;p.actionPoints-=c.ap;act32(p,2);
      if(chance(clamp(crimeSuccess(p,c)*diff,.05,.96))){const take=Math.round(rand(c.min,c.max)*diff);p.dirty+=take;p.reputation++;p.stats.crimesSuccess++;}else if(chance(.16))p.jailed=Math.max(1,c.jail-(p.bribes.judge?1:0));p.heat=clamp(p.heat+c.heat*(1-shield(p)/100),0,100);
    }
    if(p.clean<reserve*.8&&netWorth(p)>150000&&p.creditDefaults<1&&outstandingLoans(p)<netWorth(p)*.22&&chance(.08)){const amount=Math.min(100000,Math.max(25000,Math.round(netWorth(p)*.12)));p.clean+=amount;p.loans.push({id:uid(),original:amount,remaining:amount,rate:.03,payment:Math.max(1500,Math.round(amount/10)),started:state.round,missed:0,status:'active'});}
    claim32(p);p.lastAction='Syndikat strategisch geführt';
  };

  const victoryV3=checkVictory;
  checkVictory=function(){
    if(!state||state.gameOver)return;
    const active=state.players.filter(p=>!p.eliminated),activeHumans=active.filter(p=>p.type==='human');
    if(active.length===0){state.gameOver=true;state.winnerId=null;state.endReason='Alle Familien sind ausgeschieden.';return;}
    if((state.initialHumanCount||state.players.filter(p=>p.type==='human').length)>0&&activeHumans.length===0){const w=[...active].sort((a,b)=>powerIndex(b)-powerIndex(a))[0];state.gameOver=true;state.winnerId=w?.id||null;state.endReason='Die letzte menschliche Familie ist ausgeschieden.';return;}
    if(state.settings.length==='endless')return;
    const cfg={short:{min:12,target:52,districts:2},normal:{min:22,target:62,districts:3},long:{min:35,target:72,districts:4}}[state.settings.length]||{min:22,target:72,districts:3};
    if(state.round<cfg.min)return;
    if(active.length===1&&(state.initialPlayerCount||state.players.length)>1){
      const survivor=active[0];
      if(powerIndex(survivor)>=38&&controlledDistricts(survivor)>=1){state.gameOver=true;state.winnerId=survivor.id;state.endReason='Alle Rivalen sind ausgeschieden und das verbleibende Syndikat besitzt eine gefestigte Stadtbasis.';}
      return;
    }
    const leader=[...active].sort((a,b)=>powerIndex(b)-powerIndex(a))[0];
    if(leader&&powerIndex(leader)>=cfg.target&&controlledDistricts(leader)>=cfg.districts){state.gameOver=true;state.winnerId=leader.id;state.endReason=`Dominanzziel erreicht: ${cfg.target}% Macht und ${cfg.districts} Viertel.`;}
  };
})();
/* SYNDIKAT_REVISION_3_2_END */

/* SYNDIKAT_REVISION_3_5_BEGIN */
(function REVISION35_PATCH(){
  const neutralV35={oldtown:340,center:470,station:275,redlight:365,harbor:310,industrial:305,west:420,south:350};
  DISTRICTS.forEach(d=>{if(neutralV35[d.id])d.neutral=neutralV35[d.id];});
  const processV34=processEndOfTurn;
  processEndOfTurn=function(p){processV34(p);p.reputation=clamp(p.reputation,0,100);if(!state.gameOver)saveGame();};
})();
/* SYNDIKAT_REVISION_3_5_END */

/* SYNDIKAT_REVISION_3_6_BEGIN */
(function REVISION36_PATCH(){
  const neutralV36={oldtown:300,center:360,station:220,redlight:280,harbor:250,industrial:300,west:280,south:320};
  DISTRICTS.forEach(d=>{if(neutralV36[d.id])d.neutral=neutralV36[d.id];});
})();
/* SYNDIKAT_REVISION_3_6_END */

/* SYNDIKAT_REVISION_3_10_BEGIN */
(function REVISION310_PATCH(){
  const investor=EVENTS.find(e=>e.name==='Diskreter Investor');
  if(investor)investor.apply=p=>{
    if((p.roundActivity||0)<=0||p.reputation<10||p.businesses.length<2){p.eventText='Kein Investor ohne sichtbare Aktivität';return;}
    const v=rand(3000,12000);p.clean+=v;ledger(p,'Investor',v,'clean');p.eventText=`Investor +${fmt(v)}`;
  };
  if(!TUTORIAL.some(x=>x[0]==='Sauberes und schmutziges Geld'))TUTORIAL.splice(2,0,
    ['Sauberes und schmutziges Geld','Kleine Unterweltgeschäfte können mit Bargeld finanziert werden. Ab Tier 2, für Ausbauten und Bankgeschäfte brauchst du sauberes Kapital. Betriebe waschen pro Runde nur eine begrenzte Summe.'],
    ['Nicht einfach Zeit vorspulen','Betriebe verdienen passiv, aber Führung zählt: Leere Runden senken die Betriebseffizienz, erhöhen Verschleiß und verursachen zusätzliche Verwaltungskosten. Zwei Käufe pro Runde sind das Maximum.'],
    ['Standorte und Marktsättigung','Jedes Viertel besitzt nur begrenzte Standorte. Viele gleiche Betriebe im selben Viertel drücken ihren Ertrag. Ausbauen oder höherwertig neu entwickeln ist deshalb oft besser als Masse.']
  );
})();
/* SYNDIKAT_REVISION_3_10_END */

/* SYNDIKAT_REVISION_3_11_BEGIN */
(function REVISION311_PATCH(){
  function victoryCfg311(){
    return {short:{min:12,target:52,districts:2,econ:5000000,econDistricts:1},normal:{min:22,target:62,districts:3,econ:20000000,econDistricts:2},long:{min:35,target:72,districts:4,econ:50000000,econDistricts:3}}[state.settings.length]||{min:22,target:62,districts:3,econ:20000000,econDistricts:2};
  }
  checkVictory=function(){
    if(!state||state.gameOver)return;
    const active=state.players.filter(p=>!p.eliminated),activeHumans=active.filter(p=>p.type==='human');
    if(active.length===0){state.gameOver=true;state.winnerId=null;state.endReason='Alle Familien sind ausgeschieden.';return;}
    if((state.initialHumanCount||state.players.filter(p=>p.type==='human').length)>0&&activeHumans.length===0){const w=[...active].sort((a,b)=>powerIndex(b)-powerIndex(a))[0];state.gameOver=true;state.winnerId=w?.id||null;state.endReason='Die letzte menschliche Familie ist ausgeschieden.';return;}
    if(state.settings.length==='endless')return;
    const cfg=victoryCfg311();if(state.round<cfg.min)return;
    if(active.length===1&&(state.initialPlayerCount||state.players.length)>1){const s=active[0];if(powerIndex(s)>=38&&controlledDistricts(s)>=1){state.gameOver=true;state.winnerId=s.id;state.endReason='Alle Rivalen sind ausgeschieden und das verbleibende Syndikat besitzt eine gefestigte Stadtbasis.';}return;}
    const ranked=[...active].sort((a,b)=>powerIndex(b)-powerIndex(a));
    for(const p of ranked){
      if(powerIndex(p)>=cfg.target&&controlledDistricts(p)>=cfg.districts){state.gameOver=true;state.winnerId=p.id;state.endReason=`Dominanzsieg: mindestens ${cfg.target}% Macht und ${cfg.districts} kontrollierte Viertel.`;return;}
      if(netWorth(p)>=cfg.econ&&controlledDistricts(p)>=cfg.econDistricts){state.gameOver=true;state.winnerId=p.id;state.endReason=`Wirtschaftssieg: ${fmt(cfg.econ)} Nettovermögen und ${cfg.econDistricts} kontrollierte Viertel.`;return;}
    }
  };
  const renderCity311=renderCity;
  renderCity=function(){
    renderCity311();if(!state||state.settings.length==='endless')return;const stats=$('#districtDetail .district-stats'),cfg=victoryCfg311(),p=currentPlayer();if(stats&&!stats.querySelector('[data-victory-progress]'))stats.insertAdjacentHTML('beforeend',`<div class="mini-metric" data-victory-progress><small>Dominanzziel</small><strong>${Math.round(powerIndex(p))}/${cfg.target} Macht · ${controlledDistricts(p)}/${cfg.districts} Viertel</strong></div><div class="mini-metric"><small>Wirtschaftssieg</small><strong>${fmt(netWorth(p))} / ${fmt(cfg.econ)} · ${controlledDistricts(p)}/${cfg.econDistricts} Viertel</strong></div>`);
  };
})();
/* SYNDIKAT_REVISION_3_11_END */

/* SYNDIKAT_REVISION_3_12_BEGIN */
(function REVISION312_PATCH(){
  const incomeV311=estimateIncome;
  estimateIncome=function(p,b){
    const base=incomeV311(p,b);
    if(p?.type!=='ai'||!state?.settings)return base;
    const mult={easy:.88,normal:1,hard:1.08,boss:1.16}[state.settings.difficulty]||1;
    return base*mult;
  };
})();
/* SYNDIKAT_REVISION_3_12_END */

/* SYNDIKAT_REVISION_3_13_BEGIN */
(function REVISION313_PATCH(){
  function deadlineCfg313(){return {short:90,normal:220,long:340}[state.settings.length]||220;}
  function resolveDeadline313(){
    if(!state||state.gameOver||state.settings.length==='endless')return;
    const max=deadlineCfg313();if(state.round<=max)return;
    const active=state.players.filter(p=>!p.eliminated);
    if((state.initialPlayerCount||state.players.length)<=1){
      state.gameOver=true;state.winnerId=null;state.endReason=`Stichtag nach ${max} Runden erreicht, ohne das erforderliche Dominanz- oder Wirtschaftsziel zu erfüllen.`;saveGame();return;
    }
    if(!active.length){state.gameOver=true;state.winnerId=null;state.endReason='Am Stichtag ist kein Syndikat mehr handlungsfähig.';saveGame();return;}
    const ranked=[...active].sort((a,b)=>powerIndex(b)-powerIndex(a)||controlledDistricts(b)-controlledDistricts(a)||netWorth(b)-netWorth(a));
    state.gameOver=true;state.winnerId=ranked[0].id;state.endReason=`Stichtag nach ${max} Runden: höchste Gesamtmacht entscheidet die Partie.`;saveGame();
  }
  const advance313=advanceIndex;
  advanceIndex=function(){const before=state?.round||0;advance313();if(state&&!state.gameOver&&state.round>before)resolveDeadline313();};
  const renderCity313=renderCity;
  renderCity=function(){renderCity313();if(!state||state.settings.length==='endless')return;const stats=$('#districtDetail .district-stats'),max=deadlineCfg313();if(stats&&!stats.querySelector('[data-deadline]'))stats.insertAdjacentHTML('beforeend',`<div class="mini-metric" data-deadline><small>Stichtag</small><strong>Runde ${state.round} / ${max}</strong></div>`);};
})();
/* SYNDIKAT_REVISION_3_13_END */

/* SYNDIKAT_V4_SYSTEMS_BEGIN */
(function SYNDIKAT_V4_SYSTEMS(){
  const V4_ITEMS={
    weapons:{
      pistol:{name:'Pistole',cost:4500,power:8,heat:2,evidence:1,desc:'Zuverlässig, unauffällig und für kleine Teams geeignet.'},
      shotgun:{name:'Schrotflinte',cost:9000,power:15,heat:5,evidence:3,desc:'Hohe Durchschlagskraft, aber auffällig.'},
      tommy:{name:'Maschinenpistole',cost:18000,power:23,heat:9,evidence:6,desc:'Für schwere Einsätze. Effektiv, laut und riskant.'}
    },
    vehicles:{
      sedan:{name:'Unauffällige Limousine',cost:18000,power:4,heat:-2,evidence:-1,desc:'Unauffällige Anfahrt und Flucht.'},
      coupe:{name:'Schnelles Coupé',cost:32000,power:7,heat:1,evidence:0,desc:'Schnelle Flucht, wenig Platz.'},
      van:{name:'Lieferwagen',cost:42000,power:8,heat:0,evidence:-2,desc:'Ideal für größere Crews und Entführungen.'},
      armored:{name:'Gepanzerte Limousine',cost:120000,power:14,heat:3,evidence:-1,desc:'Teuer, aber sehr sicher.'}
    },
    gear:{
      masks:{name:'Masken & Handschuhe',cost:2500,power:0,heat:-1,evidence:-6,desc:'Reduziert Spuren und Zeugenaussagen.'},
      radios:{name:'Funkgeräte',cost:6000,power:6,heat:0,evidence:-1,desc:'Verbessert Koordination und Timing.'},
      armor:{name:'Schutzwesten',cost:12000,power:8,heat:1,evidence:0,desc:'Erhöht Überlebenschance bei Gegenwehr.'},
      tools:{name:'Spezialwerkzeug',cost:8000,power:7,heat:-1,evidence:-2,desc:'Hilft bei Sabotage und Einbruch.'}
    }
  };
  const V4_SPECIALTIES={
    informant:['Observierung','Quellenführung','Gegenaufklärung'],
    guard:['Objektschutz','Kontrolle','Abschreckung'],
    bodyguard:['Personenschutz','Fahrer','Krisenreaktion'],
    gunman:['Nahkampf','Präzision','Einsatzführung'],
    lawyer:['Strafrecht','Verhandlung','Beweisabwehr'],
    manager:['Finanzen','Logistik','Personalführung']
  };
  const V4_OPS={
    sabotage:{name:'Sabotage',baseCost:3500,baseHeat:14,baseEvidence:14,baseChance:.48,ap:2,target:'business'},
    kidnap:{name:'Entführung',baseCost:6000,baseHeat:22,baseEvidence:20,baseChance:.40,ap:2,target:'staff'},
    hit:{name:'Mordanschlag',baseCost:12000,baseHeat:36,baseEvidence:32,baseChance:.24,ap:2,target:'staff'},
    bank:{name:'Banküberfall',baseCost:9000,baseHeat:30,baseEvidence:28,baseChance:.30,ap:2,target:'bank'}
  };

  function v4EnsurePerson(s){
    s.xp=Number(s.xp)||0;
    s.level=Math.max(1,Number(s.level)||1);
    s.specialty=s.specialty||'';
    s.assignedBusinessId=s.assignedBusinessId||null;
    s.crewId=s.crewId||null;
    s.operations=Number(s.operations)||0;
    s.successes=Number(s.successes)||0;
  }
  function v4EnsurePlayer(p){
    p.inventory=p.inventory||{weapons:[],vehicles:[],gear:[]};
    for(const k of ['weapons','vehicles','gear'])p.inventory[k]=Array.isArray(p.inventory[k])?p.inventory[k]:[];
    p.crews=Array.isArray(p.crews)?p.crews:[];
    p.underbossId=p.underbossId||null;
    p.investigation=p.investigation||{evidence:0,stage:'Keine Akte',warrant:false,lastCase:'',corruptionExposure:0,raids:0};
    p.story=p.story||{chapter:1,claimed:[]};
    p.stats=p.stats||{};
    for(const k of ['operationsSuccess','operationsFailed','training','betrayals','evidenceDestroyed','crewMissions','launderedTotal'])p.stats[k]=Number(p.stats[k])||0;
    p.staffRoster=(p.staffRoster||[]).map(s=>{v4EnsurePerson(s);return s;});
    p.crews=p.crews.map(c=>({id:c.id||uid(),name:c.name||'Crew',memberIds:Array.isArray(c.memberIds)?c.memberIds:[],underbossId:c.underbossId||null,wins:Number(c.wins)||0,losses:Number(c.losses)||0}));
  }
  function v4Item(type,id){return V4_ITEMS[type]?.[id]||null;}
  function v4Owns(p,type,id){return (p.inventory?.[type]||[]).some(x=>x.id===id);}
  function v4AddItem(p,type,id){const def=v4Item(type,id);if(!def)return false;if(v4Owns(p,type,id))return false;p.inventory[type].push({id,condition:100,acquiredRound:state.round});return true;}
  function v4CrewMembers(p,crewId){
    const c=p.crews.find(x=>x.id===crewId);
    if(!c)return activeStaff(p).filter(s=>s.role==='gunman'||s.role==='informant'||s.role==='bodyguard').slice(0,4);
    return c.memberIds.map(id=>p.staffRoster.find(s=>s.id===id)).filter(s=>s&&s.heldUntil<=state.round);
  }
  function v4XpNeed(level){return 50+level*35;}
  function v4GainXp(person,amount){
    if(!person)return;
    person.xp+=Math.max(0,Math.round(amount));
    while(person.level<10&&person.xp>=v4XpNeed(person.level)){person.xp-=v4XpNeed(person.level);person.level++;person.skill=clamp(person.skill+rand(2,5),1,100);person.loyalty=clamp(person.loyalty+2,0,100);}
  }
  function v4CrewPower(p,crewId){
    const members=v4CrewMembers(p,crewId);
    if(!members.length)return 0;
    return members.reduce((sum,s)=>sum+s.skill*.55+s.level*4+(s.specialty==='Einsatzführung'?7:0),0)/Math.max(1,members.length);
  }
  function v4CounterIntel(p){return roleSkill(p,'informant')*.22+activeStaff(p).filter(s=>s.specialty==='Gegenaufklärung').reduce((a,s)=>a+s.skill*.08,0);}
  function v4BusinessAssignmentBonus(p,b){
    const assigned=activeStaff(p).filter(s=>s.assignedBusinessId===b.id);
    return assigned.reduce((sum,s)=>sum+(s.role==='manager'?s.skill*.0015:s.role==='guard'?s.skill*.0007:0),0);
  }
  function v4InvestigationStage(p){
    const e=p.investigation.evidence;
    if(e>=85)return'Anklage droht';
    if(e>=70)return'Haftbefehl';
    if(e>=50)return'Aktive Ermittlungen';
    if(e>=28)return'Observation';
    return'Keine Akte';
  }
  function v4AddEvidence(p,amount,reason='Spuren aus einer Aktion'){
    v4EnsurePlayer(p);
    const mitigation=1-Math.min(.52,(roleSkill(p,'lawyer')+v4CounterIntel(p))/360);
    const add=Math.max(0,Math.round(amount*mitigation));
    p.investigation.evidence=clamp(p.investigation.evidence+add,0,100);
    p.investigation.lastCase=reason;
    p.investigation.stage=v4InvestigationStage(p);
    p.investigation.warrant=p.investigation.evidence>=70;
    return add;
  }
  function v4ProcessInvestigation(p){
    v4EnsurePlayer(p);
    let decay=2+Math.round(roleSkill(p,'lawyer')/45)+Math.round(v4CounterIntel(p)/55);
    if(p.bribes.inspector)decay+=2;if(p.bribes.prosecutor)decay+=2;
    p.investigation.evidence=clamp(p.investigation.evidence-decay,0,100);
    p.investigation.stage=v4InvestigationStage(p);
    p.investigation.warrant=p.investigation.evidence>=70;
    if(p.investigation.evidence>=55&&Object.values(p.bribes).some(Boolean)){
      p.investigation.corruptionExposure=clamp(p.investigation.corruptionExposure+rand(1,4),0,100);
      if(p.investigation.corruptionExposure>=65&&chance(.10)){
        const active=Object.keys(p.bribes).filter(k=>p.bribes[k]);
        if(active.length){const k=active[rand(0,active.length-1)];p.bribes[k]=false;p.reputation=Math.max(0,p.reputation-4);p.investigation.corruptionExposure=Math.max(20,p.investigation.corruptionExposure-35);log(`${p.family}: Ein korrupter Kontakt (${CORRUPTION[k].name}) fliegt auf.`);}
      }
    }else p.investigation.corruptionExposure=Math.max(0,p.investigation.corruptionExposure-2);
    if(p.investigation.evidence>=88&&!p.jailed&&chance(.12*(1-shield(p)/100))){
      p.jailed=Math.max(p.jailed,rand(2,4));p.investigation.evidence=Math.max(45,p.investigation.evidence-28);log(`${p.family}: Ermittler schlagen zu – Haftbefehl vollstreckt.`);
    }
  }
  function v4ProcessStaffProgress(p){
    v4EnsurePlayer(p);
    for(const s of activeStaff(p)){
      let xp=1;
      if(s.assignedBusinessId&&p.businesses.some(b=>b.id===s.assignedBusinessId))xp+=2;
      if(s.crewId)xp+=1;
      v4GainXp(s,xp);
    }
    const deserters=[];
    for(const s of activeStaff(p)){
      if(s.loyalty<24&&chance(.035+(24-s.loyalty)/500))deserters.push(s);
    }
    for(const s of deserters){
      p.staffRoster=p.staffRoster.filter(x=>x.id!==s.id);
      p.crews.forEach(c=>c.memberIds=c.memberIds.filter(id=>id!==s.id));
      if(p.underbossId===s.id)p.underbossId=null;
      syncStaffCounts(p);log(`${p.family}: ${s.name} verlässt die Organisation wegen mangelnder Loyalität.`);
    }
  }
  function v4EquipmentMods(p,vehicleId,weaponId,gearId){
    const calc=(type,id)=>{
      const def=v4Item(type,id)||{power:0,heat:0,evidence:0};
      const inv=(p.inventory?.[type]||[]).find(x=>x.id===id);
      const condition=inv?clamp(Number(inv.condition)||100,15,100):100;
      const wear=condition/100;
      return{
        power:def.power*wear,
        heat:def.heat+(condition<55?2:0)+(condition<30?3:0),
        evidence:def.evidence+(condition<50?2:0),
        condition
      };
    };
    const vehicle=calc('vehicles',vehicleId),weapon=calc('weapons',weaponId),gear=calc('gear',gearId);
    return{power:vehicle.power+weapon.power+gear.power,heat:vehicle.heat+weapon.heat+gear.heat,evidence:vehicle.evidence+weapon.evidence+gear.evidence};
  }
  function v4OpPreview(kind,p,targetPlayer,target,crewId,vehicleId,weaponId,gearId,timing){
    const spec=V4_OPS[kind],crew=v4CrewPower(p,crewId),mods=v4EquipmentMods(p,vehicleId,weaponId,gearId),intel=roleSkill(p,'informant')*.13;
    let defense=20;
    if(kind==='sabotage'&&targetPlayer&&target)defense=businessSecurity(targetPlayer,target);
    if((kind==='kidnap'||kind==='hit')&&targetPlayer)defense=roleSkill(targetPlayer,'guard')*.25+roleSkill(targetPlayer,'bodyguard')*.22+(target?.skill||40)*.18;
    if(kind==='bank')defense=58;
    const timingBonus=timing==='night'?8:timing==='evening'?3:-3;
    const chanceVal=clamp(spec.baseChance+(crew+mods.power+intel+timingBonus-defense)/150,.08,.92);
    const heat=Math.max(4,Math.round(spec.baseHeat+mods.heat-(timing==='night'?3:0)));
    const evidence=Math.max(2,Math.round(spec.baseEvidence+mods.evidence-(roleSkill(p,'informant')/30)));
    return{chance:chanceVal,heat,evidence,cost:spec.baseCost,crew,defense};
  }
  function v4TargetOptions(kind,tid){
    if(kind==='bank')return[{id:'bank',label:'Zentralbank'}];
    const t=state.players.find(x=>x.id===tid);if(!t)return[];
    if(kind==='sabotage')return t.businesses.map(b=>({id:b.id,label:`${BUSINESSES[b.type].name} · ${DISTRICTS.find(d=>d.id===b.district).name}`}));
    return activeStaff(t).map(s=>({id:s.id,label:`${s.name} · ${STAFF[s.role].name} · L${s.level}`}));
  }
  function v4OperationTargets(p,kind){
    if(kind==='bank')return[{id:'bank',family:'Stadtbank'}];
    return state.players.filter(t=>t.id!==p.id&&!t.eliminated&&!pactActive(p,t)&&!allianceActive(p,t));
  }
  function v4OpenOperationPlanner(kind,tid=null,targetId=null){
    const p=currentPlayer(),spec=V4_OPS[kind];v4EnsurePlayer(p);
    if(!spec||p.jailed)return toast('Diese Operation ist momentan nicht möglich.');
    if(p.actionPoints<spec.ap)return toast(`Du brauchst ${spec.ap} AP.`);
    const targets=v4OperationTargets(p,kind);if(!targets.length)return toast('Kein geeignetes Ziel vorhanden.');
    const targetPlayer=kind==='bank'?null:(state.players.find(x=>x.id===tid)||targets[0]);
    const selectedTid=kind==='bank'?'bank':targetPlayer.id;
    const targetOpts=v4TargetOptions(kind,selectedTid);if(!targetOpts.length&&kind!=='bank')return toast('Beim Ziel gibt es momentan nichts anzugreifen.');
    const selectedTarget=targetOpts.find(x=>x.id===targetId)?.id||targetOpts[0]?.id||'bank';
    const crews=p.crews.length?p.crews:[{id:'auto',name:'Automatische Einsatzgruppe'}];
    const veh=[{id:'',name:'Kein Fahrzeug'},...p.inventory.vehicles.map(x=>({id:x.id,name:v4Item('vehicles',x.id).name}))];
    const wea=[{id:'',name:'Keine Spezialwaffe'},...p.inventory.weapons.map(x=>({id:x.id,name:v4Item('weapons',x.id).name}))];
    const gea=[{id:'',name:'Keine Spezialausrüstung'},...p.inventory.gear.map(x=>({id:x.id,name:v4Item('gear',x.id).name}))];
    openDialog(`<div class="dialog-wrap v4-operation"><div class="dialog-head"><div><p class="eyebrow">Operationsplanung</p><h2>${esc(spec.name)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="form-grid">
        <label><span>Ziel-Familie</span><select id="opTargetFamily">${targets.map(t=>`<option value="${t.id}" ${t.id===selectedTid?'selected':''}>${esc(t.family)}</option>`).join('')}</select></label>
        <label><span>Konkretes Ziel</span><select id="opTarget">${targetOpts.map(x=>`<option value="${x.id}" ${x.id===selectedTarget?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label>
        <label><span>Crew</span><select id="opCrew">${crews.map(c=>`<option value="${c.id}">${esc(c.name)} · ${v4CrewMembers(p,c.id==='auto'?null:c.id).length} Leute</option>`).join('')}</select></label>
        <label><span>Fahrzeug</span><select id="opVehicle">${veh.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
        <label><span>Waffe</span><select id="opWeapon">${wea.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
        <label><span>Ausrüstung</span><select id="opGear">${gea.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
        <label><span>Zeitpunkt</span><select id="opTiming"><option value="day">Tag</option><option value="evening">Abend</option><option value="night" selected>Nacht</option></select></label>
      </div>
      <div id="opPreview" class="operation-preview"></div>
      <div class="dialog-footer"><button class="btn btn-primary" id="executeOperation">Operation starten</button></div></div>`);
    const recalc=()=>{
      const tid2=$('#opTargetFamily').value;
      if(kind!=='bank'&&tid2!==selectedTid){closeDialog();return v4OpenOperationPlanner(kind,tid2,null);}
      const tp=kind==='bank'?null:state.players.find(x=>x.id===tid2);
      const target=kind==='bank'?null:(kind==='sabotage'?tp?.businesses.find(b=>b.id===$('#opTarget').value):tp?.staffRoster.find(s=>s.id===$('#opTarget').value));
      const prev=v4OpPreview(kind,p,tp,target,$('#opCrew').value==='auto'?null:$('#opCrew').value,$('#opVehicle').value,$('#opWeapon').value,$('#opGear').value,$('#opTiming').value);
      $('#opPreview').innerHTML=metricCards([['Erfolg',pct(prev.chance*100),prev.chance>.6?'positive':''],['Heat',`+${prev.heat}`,prev.heat>25?'negative':''],['Spuren',`+${prev.evidence}`,prev.evidence>20?'negative':''],['Vorbereitung',fmt(prev.cost),'negative']])+`<p class="muted">Crew-Stärke ${Math.round(prev.crew)} · Zielabwehr ${Math.round(prev.defense)}. Vorbereitung, Informanten, Fahrzeug und Ausrüstung beeinflussen den Einsatz.</p>`;
    };
    ['opTargetFamily','opTarget','opCrew','opVehicle','opWeapon','opGear','opTiming'].forEach(id=>$('#'+id)?.addEventListener('change',recalc));
    $('#executeOperation').onclick=()=>v4ExecuteOperation(kind,$('#opTargetFamily').value,$('#opTarget').value,$('#opCrew').value==='auto'?null:$('#opCrew').value,$('#opVehicle').value,$('#opWeapon').value,$('#opGear').value,$('#opTiming').value);
    recalc();
  }
  function v4ExecuteOperation(kind,tid,targetId,crewId,vehicleId,weaponId,gearId,timing){
    const p=currentPlayer(),spec=V4_OPS[kind];if(p.actionPoints<spec.ap)return toast('Nicht genug AP.');
    if(p.dirty<spec.baseCost)return toast(`Du brauchst ${fmt(spec.baseCost)} schmutziges Geld für Vorbereitung und Helfer.`);
    const tp=kind==='bank'?null:state.players.find(x=>x.id===tid);
    const target=kind==='bank'?null:(kind==='sabotage'?tp?.businesses.find(b=>b.id===targetId):tp?.staffRoster.find(s=>s.id===targetId));
    if(kind!=='bank'&&(!tp||!target))return toast('Ziel nicht mehr verfügbar.');
    const prev=v4OpPreview(kind,p,tp,target,crewId,vehicleId,weaponId,gearId,timing);
    p.dirty-=spec.baseCost;p.actionPoints-=spec.ap;p.roundActivity=(p.roundActivity||0)+4;
    const wearItem=(type,id,min,max)=>{
      if(!id)return;
      const item=(p.inventory?.[type]||[]).find(x=>x.id===id);
      if(item)item.condition=clamp((Number(item.condition)||100)-rand(min,max),15,100);
    };
    wearItem('vehicles',vehicleId,2,6);wearItem('weapons',weaponId,2,5);wearItem('gear',gearId,3,8);
    const members=v4CrewMembers(p,crewId);members.forEach(s=>{s.operations++;v4GainXp(s,8);});
    p.heat=clamp(p.heat+prev.heat*(1-shield(p)/100),0,100);
    v4AddEvidence(p,prev.evidence,`${spec.name} in Runde ${state.round}`);
    let success=chance(prev.chance);
    if(success){
      p.stats.operationsSuccess++;members.forEach(s=>{s.successes++;v4GainXp(s,12);});
      if(kind==='sabotage'){const dmg=rand(35,68)+Math.round(prev.crew/12);target.health=clamp(target.health-dmg,0,100);if(target.health<=0)tp.businesses=tp.businesses.filter(x=>x.id!==target.id);adjustRelation(p,tp,-22);p.reputation+=4;toast(target.health<=0?'Betrieb ausgeschaltet.':'Sabotage erfolgreich.');}
      if(kind==='kidnap'){target.heldUntil=state.round+rand(2,4);syncStaffCounts(tp);const ransom=Math.min(totalLiquid(tp),Math.round(STAFF[target.role].cost*(2+target.level*.35)));spend(tp,ransom,false);p.dirty+=ransom;adjustRelation(p,tp,-32);p.reputation+=4;toast(`Entführung gelungen. Lösegeld ${fmt(ransom)}.`);}
      if(kind==='hit'){tp.staffRoster=tp.staffRoster.filter(x=>x.id!==target.id);tp.crews?.forEach(c=>c.memberIds=c.memberIds.filter(id=>id!==target.id));syncStaffCounts(tp);adjustRelation(p,tp,-60);p.reputation+=7;toast('Anschlag erfolgreich.');}
      if(kind==='bank'){const take=rand(55000,145000)+Math.round(prev.crew*650);p.dirty+=take;p.reputation+=6;toast(`Banküberfall gelungen: ${fmt(take)} Beute.`);}
      if(crewId){const c=p.crews.find(x=>x.id===crewId);if(c)c.wins++;}
      log(`${p.family}: ${spec.name} erfolgreich.`);
    }else{
      p.stats.operationsFailed++;members.forEach(s=>v4GainXp(s,4));
      if(chance(.25)){const casualty=members.filter(s=>s.role==='gunman'||s.role==='bodyguard')[rand(0,Math.max(0,members.filter(s=>s.role==='gunman'||s.role==='bodyguard').length-1))];if(casualty){casualty.loyalty=clamp(casualty.loyalty-8,0,100);}}
      if(chance(.22+prev.evidence/150))p.jailed=Math.max(p.jailed,rand(1,3));
      if(crewId){const c=p.crews.find(x=>x.id===crewId);if(c)c.losses++;}
      if(tp)adjustRelation(p,tp,-18);
      toast('Operation gescheitert. Polizei und Rivalen reagieren.');
      log(`${p.family}: ${spec.name} scheitert.`);
    }
    closeDialog();syncStaffCounts(p);saveGame();renderAll();
  }

  const v4BaseInit=initPlayer;
  initPlayer=function(p){v4BaseInit(p);v4EnsurePlayer(p);};

  const v4BaseCreate=createGame;
  createGame=function(){v4BaseCreate();if(state){state.version=4;state.rulesRevision=4;state.players.forEach(v4EnsurePlayer);saveGame();renderAll();}};

  const v4BaseMigrate=migrateState;
  migrateState=function(data){data=v4BaseMigrate(data);data.version=4;data.rulesRevision=4;(data.players||[]).forEach(v4EnsurePlayer);return data;};

  const v4BaseEstimate=estimateIncome;
  estimateIncome=function(p,b){const base=v4BaseEstimate(p,b);return base*(1+Math.min(.22,v4BusinessAssignmentBonus(p,b)));};

  const v4BaseCrime=doCrime;
  doCrime=function(id){
    const p=currentPlayer(),c=CRIMES.find(x=>x.id===id),apBefore=p?.actionPoints,statsBefore=p?.stats?.crimesSuccess||0;
    if(id==='bank')return v4OpenOperationPlanner('bank');
    v4BaseCrime(id);
    if(p&&c&&p.actionPoints<apBefore){
      const success=(p.stats.crimesSuccess||0)>statsBefore;
      v4AddEvidence(p,Math.max(2,c.heat*(success?.45:.7)),`${c.name} in Runde ${state.round}`);
      saveGame();renderAll();
    }
  };

  const v4End=processEndOfTurn;
  processEndOfTurn=function(p){
    v4EnsurePlayer(p);
    p.stats.launderedTotal+=(p.lastLaundered||0);
    v4End(p);
    v4ProcessStaffProgress(p);
    v4ProcessInvestigation(p);
    saveGame();
  };

  openAttackDialog=function(){v4OpenOperationPlanner('sabotage');};
  openKidnapDialog=function(){v4OpenOperationPlanner('kidnap');};
  openAssassinationDialog=function(){v4OpenOperationPlanner('hit');};

  function v4OpenArsenal(){
    const p=currentPlayer();v4EnsurePlayer(p);
    const sections=Object.entries(V4_ITEMS).map(([type,items])=>`<h3>${type==='weapons'?'Waffen':type==='vehicles'?'Fahrzeuge':'Ausrüstung'}</h3><div class="dialog-list">${Object.entries(items).map(([id,d])=>{const own=v4Owns(p,type,id),currency=type==='weapons'?'schmutzig':'sauber';return `<div class="dialog-option"><div><strong>${esc(d.name)}</strong><p>${esc(d.desc)} · Stärke ${d.power>=0?'+':''}${d.power} · Heat ${d.heat>=0?'+':''}${d.heat} · Spuren ${d.evidence>=0?'+':''}${d.evidence}</p></div><button class="btn ${own?'btn-ghost':'btn-primary'}" data-buy-item="${type}:${id}" ${own?'disabled':''}>${own?'Besitzt':fmt(d.cost)+' '+currency}</button></div>`;}).join('')}</div>`).join('');
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Logistik & Einsatzmittel</p><h2>Arsenal & Fuhrpark</h2></div><button class="icon-btn" data-close>✕</button></div>${sections}</div>`);
    $('[data-buy-item]').forEach(btn=>btn.onclick=()=>{const [type,id]=btn.dataset.buyItem.split(':'),d=v4Item(type,id);const clean=type!=='weapons';if((clean?p.clean:p.dirty)<d.cost)return toast(`Nicht genug ${clean?'sauberes':'schmutziges'} Geld.`);if(clean)p.clean-=d.cost;else p.dirty-=d.cost;v4AddItem(p,type,id);ledger(p,`${d.name} gekauft`,-d.cost,'asset');saveGame();v4OpenArsenal();});
  }
  function v4OpenCrewManager(){
    const p=currentPlayer();v4EnsurePlayer(p);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Organisation</p><h2>Crews & Unterboss</h2></div><button class="icon-btn" data-close>✕</button></div>
      <p class="muted">Crews bündeln Personal für geplante Operationen. Ein Unterboss erhöht Loyalität und Crew-Erfahrung.</p>
      <div class="dialog-footer"><button class="btn btn-primary" data-new-crew ${p.crews.length>=4?'disabled':''}>Neue Crew gründen</button></div>
      <div class="dialog-list">${p.crews.length?p.crews.map(c=>`<div class="dialog-option"><div><strong>${esc(c.name)}</strong><p>${c.memberIds.length} Mitglieder · Bilanz ${c.wins}/${c.losses} · ${c.underbossId?'geführt':'ohne Capo'}</p></div><button class="btn btn-secondary" data-edit-crew="${c.id}">Bearbeiten</button></div>`).join(''):'<div class="empty-state">Noch keine feste Crew.</div>'}</div></div>`);
    $('[data-new-crew]')?.addEventListener('click',()=>{const c={id:uid(),name:`Crew ${p.crews.length+1}`,memberIds:[],underbossId:null,wins:0,losses:0};p.crews.push(c);saveGame();v4EditCrew(c.id);});
    $('[data-edit-crew]').forEach(b=>b.onclick=()=>v4EditCrew(b.dataset.editCrew));
  }
  function v4EditCrew(id){
    const p=currentPlayer(),c=p.crews.find(x=>x.id===id);if(!c)return;
    const candidates=activeStaff(p);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Crew-Verwaltung</p><h2>${esc(c.name)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <label class="field"><span>Name</span><input id="crewName" value="${esc(c.name)}" maxlength="22"></label>
      <h3>Mitglieder</h3><div class="check-grid">${candidates.map(s=>`<label class="check-card"><input type="checkbox" data-crew-member="${s.id}" ${c.memberIds.includes(s.id)?'checked':''}><span><strong>${esc(s.name)}</strong><small>${esc(STAFF[s.role].name)} · L${s.level} · ${s.skill}</small></span></label>`).join('')}</div>
      <label class="field"><span>Capo / Crew-Leitung</span><select id="crewBoss"><option value="">Keiner</option>${candidates.filter(s=>s.level>=2&&s.loyalty>=55).map(s=>`<option value="${s.id}" ${c.underbossId===s.id?'selected':''}>${esc(s.name)} · L${s.level}</option>`).join('')}</select></label>
      <div class="dialog-footer"><button class="btn btn-danger" data-delete-crew>Auflösen</button><button class="btn btn-primary" data-save-crew>Speichern</button></div></div>`);
    $('[data-save-crew]').onclick=()=>{c.name=$('#crewName').value.trim()||c.name;c.memberIds=$('[data-crew-member]').filter(x=>x.checked).map(x=>x.dataset.crewMember).slice(0,5);c.underbossId=$('#crewBoss').value||null;p.staffRoster.forEach(s=>{if(c.memberIds.includes(s.id))s.crewId=c.id;else if(s.crewId===c.id)s.crewId=null;});saveGame();closeDialog();renderAll();toast('Crew gespeichert.');};
    $('[data-delete-crew]').onclick=()=>{p.staffRoster.forEach(s=>{if(s.crewId===c.id)s.crewId=null;});p.crews=p.crews.filter(x=>x.id!==c.id);saveGame();v4OpenCrewManager();};
  }

  const v4BaseStaff=renderStaff;
  renderStaff=function(){
    const p=currentPlayer();v4EnsurePlayer(p);
    $('#staffGrid').innerHTML=`<article class="shop-card staff-recruit"><div class="shop-top"><div><small class="eyebrow">Organisation</small><h3>Personal & Crews</h3></div><span class="owned">${activeStaff(p).length}</span></div><p>Rekrutiere, trainiere, spezialisiere und organisiere deine Leute in festen Crews.</p><footer><div class="mini-actions"><button class="btn btn-primary" data-recruit>Rekrutieren</button><button class="btn btn-secondary" data-crews>Crews</button><button class="btn btn-secondary" data-arsenal>Arsenal</button></div></footer></article>`+
      (p.staffRoster.length?p.staffRoster.map(s=>{v4EnsurePerson(s);const held=s.heldUntil>state.round,crew=p.crews.find(c=>c.id===s.crewId),assigned=p.businesses.find(b=>b.id===s.assignedBusinessId),need=v4XpNeed(s.level);return `<article class="shop-card person-card ${held?'held':''}"><div class="shop-top"><div><small class="eyebrow">${STAFF[s.role].icon} ${esc(STAFF[s.role].name)} · Level ${s.level}</small><h3>${esc(s.name)}</h3></div><span class="owned">${held?'ENTFÜHRT':s.skill}</span></div><p>${esc(s.specialty||traitName(s.trait))} · Loyalität ${s.loyalty}/100${crew?` · ${esc(crew.name)}`:''}${assigned?` · ${esc(BUSINESSES[assigned.type].name)}`:''}</p><div class="loyalty"><i style="width:${s.loyalty}%"></i></div><div class="xpbar"><i style="width:${Math.min(100,s.xp/need*100)}%"></i></div><footer><span class="price">${fmt(s.salary)}/R · XP ${s.xp}/${need}</span><button class="btn btn-secondary" data-staff-person="${s.id}">Details</button></footer></article>`;}).join(''):'');
    $('[data-recruit]')?.addEventListener('click',openRecruitDialog);$('[data-crews]')?.addEventListener('click',v4OpenCrewManager);$('[data-arsenal]')?.addEventListener('click',v4OpenArsenal);$('[data-staff-person]').forEach(b=>b.onclick=()=>openStaffPerson(b.dataset.staffPerson));
  };

  openStaffPerson=function(id){
    const p=currentPlayer(),s=p.staffRoster.find(x=>x.id===id);if(!s)return;v4EnsurePerson(s);
    const bonusCost=5000,trainCost=Math.round(2500+s.level*1250);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">${esc(STAFF[s.role].name)} · Level ${s.level}</p><h2>${esc(s.name)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="finance-grid">${metricCards([['Fähigkeit',`${s.skill}/100`,''],['Loyalität',`${s.loyalty}/100`,s.loyalty>60?'positive':''],['Erfahrung',`${s.xp}/${v4XpNeed(s.level)}`,''],['Einsätze',s.operations,''],['Erfolge',s.successes,'']])}</div>
      <div class="form-grid"><label><span>Spezialisierung</span><select id="staffSpec"><option value="">Keine</option>${V4_SPECIALTIES[s.role].map(x=>`<option value="${x}" ${s.specialty===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
      <label><span>Betrieb zuweisen</span><select id="staffBusiness"><option value="">Keine feste Zuweisung</option>${p.businesses.map(b=>`<option value="${b.id}" ${s.assignedBusinessId===b.id?'selected':''}>${esc(BUSINESSES[b.type].name)} · ${esc(DISTRICTS.find(d=>d.id===b.district).name)}</option>`).join('')}</select></label></div>
      <div class="dialog-footer"><button class="btn btn-secondary" data-train ${p.actionPoints<1||p.clean<trainCost?'disabled':''}>Training ${fmt(trainCost)}</button><button class="btn btn-secondary" data-bonus ${totalLiquid(p)<bonusCost?'disabled':''}>Bonus ${fmt(bonusCost)}</button><button class="btn btn-primary" data-underboss ${s.level<3||s.loyalty<70?'disabled':''}>${p.underbossId===s.id?'Unterboss':'Zum Unterboss'}</button><button class="btn btn-danger" data-fire>Entlassen</button></div></div>`);
    $('#staffSpec').onchange=()=>{s.specialty=$('#staffSpec').value;saveGame();};
    $('#staffBusiness').onchange=()=>{s.assignedBusinessId=$('#staffBusiness').value||null;saveGame();};
    $('[data-train]').onclick=()=>{if(p.actionPoints<1||p.clean<trainCost)return;p.clean-=trainCost;p.actionPoints--;p.stats.training++;v4GainXp(s,35+rand(0,15));s.skill=clamp(s.skill+rand(1,3),1,100);s.loyalty=clamp(s.loyalty+3,0,100);ledger(p,`Training ${s.name}`,-trainCost,'expense');closeDialog();saveGame();renderAll();toast('Training abgeschlossen.');};
    $('[data-bonus]').onclick=()=>{spend(p,bonusCost);s.loyalty=clamp(s.loyalty+rand(10,18),0,100);ledger(p,`Bonus für ${s.name}`,-bonusCost,'expense');closeDialog();saveGame();renderAll();toast('Loyalität gestiegen.');};
    $('[data-underboss]').onclick=()=>{p.underbossId=p.underbossId===s.id?null:s.id;s.loyalty=clamp(s.loyalty+5,0,100);saveGame();closeDialog();renderAll();toast(p.underbossId?'Unterboss ernannt.':'Unterboss abgesetzt.');};
    $('[data-fire]').onclick=()=>{p.staffRoster=p.staffRoster.filter(x=>x.id!==id);p.crews.forEach(c=>c.memberIds=c.memberIds.filter(x=>x!==id));if(p.underbossId===id)p.underbossId=null;syncStaffCounts(p);closeDialog();saveGame();renderAll();toast('Mitarbeiter entlassen.');};
  };

  const v4BaseActions=renderActions;
  renderActions=function(){
    v4BaseActions();
    const p=currentPlayer();if(!p||p.jailed)return;
    const bank=$('[data-crime="bank"]');if(bank){bank.textContent='Planen';bank.onclick=()=>v4OpenOperationPlanner('bank');}
    const panel=$('#actionsView .action-panel .button-grid');
    if(panel&&!panel.querySelector('[data-v4-arsenal]')){
      panel.insertAdjacentHTML('beforeend','<button class="btn btn-secondary" data-v4-arsenal>Arsenal & Fuhrpark</button><button class="btn btn-secondary" data-v4-crews>Crews</button><button class="btn btn-secondary" data-v4-case>Ermittlungsakte</button>');
      $('[data-v4-arsenal]',panel).onclick=v4OpenArsenal;$('[data-v4-crews]',panel).onclick=v4OpenCrewManager;$('[data-v4-case]',panel).onclick=v4OpenInvestigation;
    }
  };

  function v4OpenInvestigation(){
    const p=currentPlayer();v4EnsurePlayer(p);const i=p.investigation;
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Polizei & Staatsanwaltschaft</p><h2>Ermittlungsakte</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="finance-grid">${metricCards([['Beweise',`${Math.round(i.evidence)}/100`,i.evidence>=70?'negative':''],['Status',i.stage,''],['Haftbefehl',i.warrant?'JA':'Nein',i.warrant?'negative':'positive'],['Korruptionsrisiko',`${Math.round(i.corruptionExposure)}%`,i.corruptionExposure>50?'negative':'']])}</div>
      <div class="panel" style="padding:1rem"><strong>Letzter Ermittlungsansatz</strong><p class="muted">${esc(i.lastCase||'Keine belastbaren Spuren.')}</p></div>
      <p class="muted">Informanten mit Gegenaufklärung, Anwälte und korrupte Kontakte bauen Beweise langsam ab. Lautstarke Operationen, schlechte Ausrüstung und hohe Heat erzeugen neue Spuren.</p>
      <div class="dialog-footer"><button class="btn btn-secondary" data-clean-evidence ${p.actionPoints<1||p.dirty<8000?'disabled':''}>Spuren beseitigen ${fmt(8000)}</button></div></div>`);
    $('[data-clean-evidence]')?.addEventListener('click',()=>{p.dirty-=8000;p.actionPoints--;p.stats.evidenceDestroyed++;const cut=rand(8,18)+Math.round(roleSkill(p,'informant')/20);p.investigation.evidence=clamp(p.investigation.evidence-cut,0,100);p.investigation.stage=v4InvestigationStage(p);p.investigation.warrant=p.investigation.evidence>=70;ledger(p,'Spuren beseitigt',-8000,'expense');closeDialog();saveGame();renderAll();toast(`Beweislage um ${cut} reduziert.`);});
  }

  const v4BaseMore=openMoreMenu;
  openMoreMenu=function(){
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Navigation</p><h2>Mehr</h2></div><button class="icon-btn" data-close>✕</button></div><div class="more-grid">
      <button class="btn btn-secondary" data-go="staff">♟ Personal</button><button class="btn btn-secondary" data-go="corruption">⚖ Einfluss</button><button class="btn btn-secondary" data-go="finance">▥ Finanzen</button><button class="btn btn-secondary" data-go="missions">◎ Aufträge</button><button class="btn btn-secondary" data-go="ranking">♛ Rangliste</button>
      <button class="btn btn-secondary" data-more-diplomacy>🤝 Diplomatie</button><button class="btn btn-secondary" data-more-routes>♣ Automatenrouten</button><button class="btn btn-secondary" data-v4-crew>♟ Crews</button><button class="btn btn-secondary" data-v4-arsenal>▣ Arsenal</button><button class="btn btn-secondary" data-v4-case>⌕ Ermittlungen</button><button class="btn btn-secondary" data-chronicle>▤ Stadtchronik</button>
      </div></div>`);
    $('[data-go]').forEach(b=>b.onclick=()=>{closeDialog();setView(b.dataset.go);});$('[data-more-diplomacy]').onclick=()=>{closeDialog();openDiplomacyDialog();};$('[data-more-routes]').onclick=()=>{closeDialog();openRoutesDialog();};$('[data-v4-crew]').onclick=v4OpenCrewManager;$('[data-v4-arsenal]').onclick=v4OpenArsenal;$('[data-v4-case]').onclick=v4OpenInvestigation;$('[data-chronicle]').onclick=()=>{closeDialog();if(typeof openChronicleDialog==='function')openChronicleDialog();};
  };

  const v4BaseRenderAll=renderAll;
  renderAll=function(){
    if(state)state.players.forEach(v4EnsurePlayer);
    v4BaseRenderAll();
    const p=currentPlayer();if(!p)return;
    const banner=$('#statusBanner');
    if(p.investigation.warrant&&!p.jailed){banner.className='status-banner danger';banner.textContent=`HAFTBEFEHL: Beweislage ${Math.round(p.investigation.evidence)}/100. Anwälte, Gegenaufklärung oder Spurenbeseitigung sind dringend nötig.`;}
  };

  window.SyndikatV4={openArsenal:v4OpenArsenal,openCrews:v4OpenCrewManager,openInvestigation:v4OpenInvestigation,openOperation:v4OpenOperationPlanner,items:V4_ITEMS};
})();
/* SYNDIKAT_V4_SYSTEMS_END */

/* SYNDIKAT_V42_META_BEGIN */
(function SYNDIKAT_V42_META(){
  const SLOT_KEY='syndikat_save_slots_v4';
  const BACKUP_KEY='syndikat_backups_v4';
  const HALL_KEY='syndikat_hall_v4';
  const ACH_KEY='syndikat_achievements_v4';
  const UI_KEY='syndikat_ui_v4';

  const ACHIEVEMENTS=[
    {id:'first_biz',name:'Erstes Standbein',desc:'Besitze deinen ersten Betrieb.',test:p=>p.businesses.length>=1},
    {id:'crew',name:'Die Familie',desc:'Gründe eine Crew mit mindestens drei Mitgliedern.',test:p=>(p.crews||[]).some(c=>c.memberIds.length>=3)},
    {id:'million',name:'Millionär',desc:'Erreiche 1.000.000 $ Nettovermögen.',test:p=>netWorth(p)>=1000000},
    {id:'ten_million',name:'Großkapital',desc:'Erreiche 10.000.000 $ Nettovermögen.',test:p=>netWorth(p)>=10000000},
    {id:'district',name:'Unser Viertel',desc:'Kontrolliere dein erstes Stadtviertel.',test:p=>controlledDistricts(p)>=1},
    {id:'three_districts',name:'Stadtmacht',desc:'Kontrolliere drei Viertel.',test:p=>controlledDistricts(p)>=3},
    {id:'operations',name:'Saubere Arbeit',desc:'Schließe fünf geplante Operationen erfolgreich ab.',test:p=>(p.stats?.operationsSuccess||0)>=5},
    {id:'untouchable',name:'Unantastbar',desc:'Besitze 1 Mio. Vermögen bei weniger als 20 Beweispunkten.',test:p=>netWorth(p)>=1000000&&(p.investigation?.evidence||0)<20},
    {id:'underboss',name:'Rechte Hand',desc:'Ernenne einen Unterboss.',test:p=>!!p.underbossId},
    {id:'syndicate',name:'Das Syndikat',desc:'Erreiche mindestens 62 Machtpunkte.',test:p=>powerIndex(p)>=62}
  ];
  const STORY=[
    {chapter:1,title:'Kapitel I · Ein Fuß in der Tür',desc:'Besitze 2 Betriebe und schließe 2 Verbrechen erfolgreich ab.',done:p=>p.businesses.length>=2&&(p.stats?.crimesSuccess||0)>=2,reward:18000,rep:3},
    {chapter:2,title:'Kapitel II · Die Familie',desc:'Beschäftige 4 Leute und gründe eine feste Crew.',done:p=>activeStaff(p).length>=4&&(p.crews||[]).length>=1,reward:30000,rep:5},
    {chapter:3,title:'Kapitel III · Saubere Fassade',desc:'Wasche insgesamt 50.000 $, besitze einen Tier-2-Betrieb und halte 100.000 $ sauberes Kapital.',done:p=>(p.stats?.launderedTotal||0)>=50000&&p.businesses.some(b=>(BUSINESSES[b.type].tier||1)>=2)&&p.clean>=100000,reward:55000,rep:6},
    {chapter:4,title:'Kapitel IV · Krieg um die Stadt',desc:'Kontrolliere ein Viertel und gewinne eine geplante Operation.',done:p=>controlledDistricts(p)>=1&&(p.stats?.operationsSuccess||0)>=1,reward:90000,rep:8},
    {chapter:5,title:'Kapitel V · Syndikat',desc:'Erreiche 5 Mio. Nettovermögen, 2 Viertel und 50 Macht.',done:p=>netWorth(p)>=5000000&&controlledDistricts(p)>=2&&powerIndex(p)>=50,reward:200000,rep:12}
  ];

  function v42GetJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
  function v42SetJSON(key,val){localStorage.setItem(key,JSON.stringify(val))}
  function v42Ensure(p){
    p.story=p.story||{chapter:1,claimed:[]};
    p.story.chapter=Math.max(1,Number(p.story.chapter)||1);
    p.story.claimed=Array.isArray(p.story.claimed)?p.story.claimed:[];
    p.pendingOffers=Array.isArray(p.pendingOffers)?p.pendingOffers:[];
    p.casusbelli=p.casusbelli||{};
    p.guide=p.guide||{enabled:false,step:0,done:false};
    p.stats=p.stats||{};
    p.stats.launderedTotal=Number(p.stats.launderedTotal)||0;
  }
  function v42Ui(){return Object.assign({font:'normal',contrast:false,motion:false,compact:false},v42GetJSON(UI_KEY,{}))}
  function v42ApplyUi(){
    const u=v42Ui(),b=document.body;
    b.classList.toggle('high-contrast',!!u.contrast);
    b.classList.toggle('reduce-motion',!!u.motion);
    b.classList.toggle('compact-ui',!!u.compact);
    b.dataset.fontScale=u.font;
  }
  function v42OpenSettings(){
    const u=v42Ui();
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Darstellung</p><h2>Anzeige & Barrierefreiheit</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="form-grid">
        <label><span>Schriftgröße</span><select id="uiFont"><option value="normal" ${u.font==='normal'?'selected':''}>Normal</option><option value="large" ${u.font==='large'?'selected':''}>Groß</option><option value="xlarge" ${u.font==='xlarge'?'selected':''}>Sehr groß</option></select></label>
        <label><span>Kontrast</span><select id="uiContrast"><option value="off" ${!u.contrast?'selected':''}>Normal</option><option value="on" ${u.contrast?'selected':''}>Hoch</option></select></label>
        <label><span>Bewegungen</span><select id="uiMotion"><option value="on" ${!u.motion?'selected':''}>Normal</option><option value="off" ${u.motion?'selected':''}>Reduziert</option></select></label>
        <label><span>Dichte</span><select id="uiCompact"><option value="off" ${!u.compact?'selected':''}>Komfortabel</option><option value="on" ${u.compact?'selected':''}>Kompakt</option></select></label>
      </div>
      <div class="dialog-footer"><button class="btn btn-primary" data-save-ui>Übernehmen</button></div></div>`);
    $('[data-save-ui]').onclick=()=>{v42SetJSON(UI_KEY,{font:$('#uiFont').value,contrast:$('#uiContrast').value==='on',motion:$('#uiMotion').value==='off',compact:$('#uiCompact').value==='on'});v42ApplyUi();closeDialog();toast('Anzeige aktualisiert.');};
  }

  function v42Slots(){return v42GetJSON(SLOT_KEY,[null,null,null])}
  function v42SaveSlot(idx){
    if(!state)return toast('Keine laufende Partie.');
    const slots=v42Slots();slots[idx]={savedAt:Date.now(),round:state.round,family:currentPlayer()?.family||state.players[0]?.family||'Syndikat',difficulty:state.settings?.difficulty,length:state.settings?.length,state:JSON.parse(JSON.stringify(state))};v42SetJSON(SLOT_KEY,slots);toast(`Spielstand ${idx+1} gespeichert.`);v42OpenSlots();
  }
  function v42LoadSlot(idx){
    const s=v42Slots()[idx];if(!s)return;
    state=migrateState(JSON.parse(JSON.stringify(s.state)));selectedDistrict='oldtown';showScreen('gameScreen');saveGame();renderAll();closeDialog();toast(`Spielstand ${idx+1} geladen.`);
  }
  function v42DeleteSlot(idx){const slots=v42Slots();slots[idx]=null;v42SetJSON(SLOT_KEY,slots);v42OpenSlots();}
  function v42MaybeBackup(){
    if(!state||state.gameOver||state.round<2||state.round%10!==0||state._lastBackupRound===state.round)return;
    state._lastBackupRound=state.round;
    const arr=v42GetJSON(BACKUP_KEY,[]);arr.unshift({savedAt:Date.now(),round:state.round,family:state.players[state.currentIndex]?.family||state.players[0]?.family,state:JSON.parse(JSON.stringify(state))});v42SetJSON(BACKUP_KEY,arr.slice(0,5));
  }
  function v42OpenSlots(){
    const slots=v42Slots(),backs=v42GetJSON(BACKUP_KEY,[]);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Spielstände</p><h2>Speichern & Wiederherstellen</h2></div><button class="icon-btn" data-close>✕</button></div>
      <h3>Manuelle Slots</h3><div class="dialog-list">${slots.map((s,i)=>`<div class="dialog-option"><div><strong>Slot ${i+1}</strong><p>${s?`${esc(s.family)} · Runde ${s.round} · ${new Date(s.savedAt).toLocaleString('de-DE')}`:'Leer'}</p></div><div class="mini-actions">${state?`<button class="btn btn-secondary" data-slot-save="${i}">Speichern</button>`:''}${s?`<button class="btn btn-primary" data-slot-load="${i}">Laden</button><button class="btn btn-danger" data-slot-delete="${i}">Löschen</button>`:''}</div></div>`).join('')}</div>
      <h3>Automatische Backups</h3><div class="dialog-list">${backs.length?backs.map((b,i)=>`<div class="dialog-option"><div><strong>${esc(b.family)} · Runde ${b.round}</strong><p>${new Date(b.savedAt).toLocaleString('de-DE')}</p></div><button class="btn btn-secondary" data-backup-load="${i}">Wiederherstellen</button></div>`).join(''):'<div class="empty-state">Noch keine 10-Runden-Backups.</div>'}</div></div>`);
    $('[data-slot-save]').forEach(b=>b.onclick=()=>v42SaveSlot(+b.dataset.slotSave));$('[data-slot-load]').forEach(b=>b.onclick=()=>v42LoadSlot(+b.dataset.slotLoad));$('[data-slot-delete]').forEach(b=>b.onclick=()=>v42DeleteSlot(+b.dataset.slotDelete));
    $('[data-backup-load]').forEach(b=>b.onclick=()=>{const x=backs[+b.dataset.backupLoad];if(!x)return;state=migrateState(JSON.parse(JSON.stringify(x.state)));showScreen('gameScreen');saveGame();renderAll();closeDialog();toast('Backup wiederhergestellt.');});
  }

  function v42Unlocked(){return v42GetJSON(ACH_KEY,{})}
  function v42CheckAchievements(p){
    const all=v42Unlocked();let changed=false;
    for(const a of ACHIEVEMENTS){if(!all[a.id]&&a.test(p)){all[a.id]={date:Date.now(),family:p.family};changed=true;toast(`Erfolg freigeschaltet: ${a.name}`);}}
    if(changed)v42SetJSON(ACH_KEY,all);
  }
  function v42OpenAchievements(){
    const all=v42Unlocked();
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Karriere</p><h2>Erfolge</h2></div><button class="icon-btn" data-close>✕</button></div><div class="achievement-grid">${ACHIEVEMENTS.map(a=>`<div class="achievement ${all[a.id]?'unlocked':'locked'}"><strong>${all[a.id]?'◆':'◇'} ${esc(a.name)}</strong><p>${esc(a.desc)}</p><small>${all[a.id]?new Date(all[a.id].date).toLocaleDateString('de-DE'):'Noch nicht erreicht'}</small></div>`).join('')}</div></div>`);
  }

  function v42Hall(){return v42GetJSON(HALL_KEY,[])}
  function v42ArchiveResult(){
    if(!state||!state.gameOver||state._hallArchived)return;
    state._hallArchived=true;const w=state.players.find(p=>p.id===state.winnerId);
    const list=v42Hall();list.unshift({date:Date.now(),round:state.round,winner:w?.family||'Kein Sieger',reason:state.endReason||'',power:w?Math.round(powerIndex(w)):0,netWorth:w?Math.round(netWorth(w)):0,districts:w?controlledDistricts(w):0,difficulty:state.settings?.difficulty,length:state.settings?.length});v42SetJSON(HALL_KEY,list.slice(0,30));saveGame();
  }
  function v42OpenHall(){
    const h=v42Hall();
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Chronik der Sieger</p><h2>Hall of Fame</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${h.length?h.map((x,i)=>`<div class="dialog-option"><div><strong>#${i+1} ${esc(x.winner)}</strong><p>Runde ${x.round} · Macht ${x.power}% · ${fmt(x.netWorth)} · ${x.districts} Viertel<br>${esc(x.reason||'')}</p></div><span class="pill">${new Date(x.date).toLocaleDateString('de-DE')}</span></div>`).join(''):'<div class="empty-state">Noch keine abgeschlossene Partie.</div>'}</div></div>`);
  }
  function v42OpenChronicle(){
    const rows=(state?.log||[]).slice(0,50);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Stadtchronik</p><h2>Nachrichten & Ereignisse</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${rows.length?rows.map(x=>`<div class="dialog-option"><div><strong>Runde ${x.round}</strong><p>${esc(x.msg)}</p></div></div>`).join(''):'<div class="empty-state">Noch keine wichtigen Meldungen.</div>'}</div></div>`);
  }

  function v42StoryCurrent(p){v42Ensure(p);return STORY.find(x=>x.chapter===p.story.chapter)||null}
  function v42ClaimStory(p){
    const ch=v42StoryCurrent(p);if(!ch||!ch.done(p))return toast('Kapitelziel noch nicht erfüllt.');
    if(p.story.claimed.includes(ch.chapter))return;
    p.story.claimed.push(ch.chapter);p.clean+=ch.reward;p.reputation=clamp(p.reputation+ch.rep,0,100);ledger(p,`Story: ${ch.title}`,ch.reward,'income');log(`${p.family}: ${ch.title} abgeschlossen.`);
    p.story.chapter=Math.min(STORY.length+1,p.story.chapter+1);saveGame();renderAll();toast(`Kapitel abgeschlossen: +${fmt(ch.reward)}.`);
  }
  const v42Missions=renderMissions;
  renderMissions=function(){
    v42Missions();const p=currentPlayer();v42Ensure(p);const el=$('#missionList');if(!el)return;
    const ch=v42StoryCurrent(p);
    const story=ch?`<article class="mission-card panel story-card"><div><p class="eyebrow">Storykampagne</p><h3>${esc(ch.title)}</h3><p>${esc(ch.desc)}</p></div><footer><span>Belohnung ${fmt(ch.reward)} + ${ch.rep} Ruf</span><button class="btn ${ch.done(p)?'btn-primary':'btn-secondary'}" data-story-claim ${ch.done(p)?'':'disabled'}>${ch.done(p)?'Kapitel abschließen':'Ziel offen'}</button></footer></article>`:
      `<article class="mission-card panel story-card completed"><div><p class="eyebrow">Storykampagne</p><h3>Die Stadt kennt deinen Namen</h3><p>Alle fünf Kapitel der Syndikatskampagne sind abgeschlossen.</p></div></article>`;
    el.insertAdjacentHTML('afterbegin',story);$('[data-story-claim]')?.addEventListener('click',()=>v42ClaimStory(p));
  };

  function v42GuideText(p){
    v42Ensure(p);if(!p.guide.enabled||p.guide.done)return null;
    const steps=[
      {done:()=>p.businesses.length>=1,text:'1/5: Kaufe im ausgewählten Viertel deinen ersten Betrieb.'},
      {done:()=>p.stats.crimesSuccess>=1,text:'2/5: Führe unter „Aktionen“ ein erfolgreiches Verbrechen aus.'},
      {done:()=>Object.keys(p.scouting||{}).length>=1,text:'3/5: Kundschafte ein Viertel aus.'},
      {done:()=>activeStaff(p).length>=1,text:'4/5: Rekrutiere deine erste Person.'},
      {done:()=>state.round>=2,text:'5/5: Beende die Runde und prüfe Einnahmen, Heat und Ermittlungsakte.'}
    ];
    while(p.guide.step<steps.length&&steps[p.guide.step].done())p.guide.step++;
    if(p.guide.step>=steps.length){p.guide.done=true;p.tutorialDone=true;saveGame();toast('Geführter Einstieg abgeschlossen.');return null;}
    return steps[p.guide.step].text;
  }
  function v42RenderGuide(){
    let box=$('#guideCoach');
    if(!box){box=document.createElement('div');box.id='guideCoach';box.className='guide-coach hidden';document.body.appendChild(box);}
    const p=currentPlayer?.();if(!p||!state){box.classList.add('hidden');return;}
    const txt=v42GuideText(p);if(!txt){box.classList.add('hidden');return;}
    box.innerHTML=`<strong>Geführter Einstieg</strong><span>${esc(txt)}</span><button aria-label="Tutorial schließen">×</button>`;box.classList.remove('hidden');box.querySelector('button').onclick=()=>{p.guide.done=true;saveGame();box.classList.add('hidden');};
  }

  function v42ApplyDeal(a,b,type,duration,cash){
    if(cash>0){if(a.clean<cash)return false;a.clean-=cash;b.clean+=cash;}
    if(type==='nap'){a.pacts[b.id]=state.round+duration;b.pacts[a.id]=state.round+duration;}
    if(type==='alliance'){a.pacts[b.id]=state.round+duration;b.pacts[a.id]=state.round+duration;a.alliances[b.id]=state.round+duration;b.alliances[a.id]=state.round+duration;}
    adjustRelation(a,b,type==='alliance'?14:8);log(`${a.family} und ${b.family}: ${type==='alliance'?'Bündnis':'Nichtangriffspakt'} bis Runde ${state.round+duration}.`);return true;
  }
  function v42OfferScore(a,b,type,cash){
    const rel=relation(a,b),powerGap=powerIndex(a)-powerIndex(b),base=type==='alliance'?48:25;
    return rel+cash/1400+Math.max(-10,Math.min(14,powerGap*.35))-base;
  }
  function v42SubmitNegotiation(tid){
    const p=currentPlayer(),t=state.players.find(x=>x.id===tid);if(!t)return;
    const type=$('#dealType').value,duration=+$('#dealDuration').value,cash=+$('#dealCash').value;
    if(p.clean<cash)return toast('Nicht genug sauberes Geld für das Angebot.');
    if(t.type==='human'){t.pendingOffers=t.pendingOffers||[];t.pendingOffers.push({id:uid(),from:p.id,type,duration,cash,round:state.round});closeDialog();toast('Angebot hinterlegt. Der andere Spieler entscheidet in seinem Zug.');saveGame();return;}
    const score=v42OfferScore(p,t,type,cash);
    if(score>=0){v42ApplyDeal(p,t,type,duration,cash);closeDialog();saveGame();renderAll();toast(`${t.family} akzeptiert.`);return;}
    if(score>-18){const extra=Math.ceil(Math.abs(score)*1400/5000)*5000;openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Gegenangebot</p><h2>${esc(t.family)} fordert mehr</h2></div><button class="icon-btn" data-close>✕</button></div><p>${esc(t.family)} wäre bereit, wenn du zusätzlich ${fmt(extra)} zahlst.</p><div class="dialog-footer"><button class="btn btn-secondary" data-counter-no>Ablehnen</button><button class="btn btn-primary" data-counter-yes ${p.clean<cash+extra?'disabled':''}>Akzeptieren · ${fmt(cash+extra)}</button></div></div>`);$('[data-counter-no]').onclick=closeDialog;$('[data-counter-yes]').onclick=()=>{if(v42ApplyDeal(p,t,type,duration,cash+extra)){closeDialog();saveGame();renderAll();toast('Gegenangebot akzeptiert.');}};return;}
    closeDialog();toast(`${t.family} lehnt Verhandlungen ab.`);
  }
  function v42OpenNegotiation(tid){
    const p=currentPlayer(),t=state.players.find(x=>x.id===tid);if(!t)return;
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Verhandlung mit ${esc(t.family)}</p><h2>Abkommen aushandeln</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="form-grid"><label><span>Abkommen</span><select id="dealType"><option value="nap">Nichtangriffspakt</option><option value="alliance">Bündnis</option></select></label><label><span>Dauer</span><select id="dealDuration"><option value="4">4 Runden</option><option value="6" selected>6 Runden</option><option value="8">8 Runden</option></select></label><label><span>Zusätzliche Zahlung</span><select id="dealCash"><option value="0">Keine</option><option value="5000">${fmt(5000)}</option><option value="10000">${fmt(10000)}</option><option value="25000">${fmt(25000)}</option><option value="50000">${fmt(50000)}</option></select></label></div>
      <p class="muted">Beziehung ${relation(p,t)} · Deine Macht ${Math.round(powerIndex(p))}% · ${esc(t.family)} ${Math.round(powerIndex(t))}%.</p>
      <div class="dialog-footer"><button class="btn btn-primary" data-send-deal>Angebot senden</button></div></div>`);
    $('[data-send-deal]').onclick=()=>v42SubmitNegotiation(tid);
  }
  function v42BreakAgreement(tid){
    const p=currentPlayer(),t=state.players.find(x=>x.id===tid);if(!t)return;
    delete p.pacts[t.id];delete t.pacts[p.id];delete p.alliances[t.id];delete t.alliances[p.id];adjustRelation(p,t,-42);p.reputation=Math.max(0,p.reputation-7);p.stats.betrayals=(p.stats.betrayals||0)+1;t.casusbelli=t.casusbelli||{};t.casusbelli[p.id]=state.round+6;log(`${p.family} bricht ein Abkommen mit ${t.family}.`);saveGame();renderAll();toast('Abkommen gebrochen. Dein Ruf leidet.');
  }
  function v42OpenPendingOffers(){
    const p=currentPlayer();v42Ensure(p);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Diplomatie</p><h2>Offene Angebote</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${p.pendingOffers.length?p.pendingOffers.map(o=>{const from=state.players.find(x=>x.id===o.from);return `<div class="dialog-option"><div><strong>${esc(from?.family||'Unbekannt')}</strong><p>${o.type==='alliance'?'Bündnis':'Nichtangriff'} · ${o.duration} Runden · Zahlung ${fmt(o.cash)}</p></div><div class="mini-actions"><button class="btn btn-primary" data-offer-yes="${o.id}">Annehmen</button><button class="btn btn-danger" data-offer-no="${o.id}">Ablehnen</button></div></div>`;}).join(''):'<div class="empty-state">Keine offenen Angebote.</div>'}</div></div>`);
    $('[data-offer-yes]').forEach(b=>b.onclick=()=>{const o=p.pendingOffers.find(x=>x.id===b.dataset.offerYes),from=state.players.find(x=>x.id===o?.from);if(o&&from&&v42ApplyDeal(from,p,o.type,o.duration,o.cash)){p.pendingOffers=p.pendingOffers.filter(x=>x.id!==o.id);saveGame();v42OpenPendingOffers();}});
    $('[data-offer-no]').forEach(b=>b.onclick=()=>{p.pendingOffers=p.pendingOffers.filter(x=>x.id!==b.dataset.offerNo);saveGame();v42OpenPendingOffers();});
  }

  openDiplomacyDialog=function(){
    const p=currentPlayer();v42Ensure(p);if(p.jailed)return toast('Aus der Haft sind neue Abkommen kaum verhandelbar.');
    const rivals=state.players.filter(x=>x.id!==p.id&&!x.eliminated);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Beziehungen</p><h2>Diplomatie & Handel</h2></div><button class="icon-btn" data-close>✕</button></div>
      ${p.pendingOffers.length?`<div class="dialog-footer"><button class="btn btn-primary" data-pending>${p.pendingOffers.length} offene${p.pendingOffers.length===1?'s':''} Angebot${p.pendingOffers.length===1?'':'e'}</button></div>`:''}
      <div class="dialog-list">${rivals.map(r=>{const active=pactActive(p,r)||allianceActive(p,r);return `<div class="diplomacy-card"><div><strong>${esc(r.family)}</strong><p>Beziehung ${relation(p,r)} · Macht ${pct(powerIndex(r))}${pactActive(p,r)?` · NAP bis R${p.pacts[r.id]}`:''}${allianceActive(p,r)?` · Bündnis bis R${p.alliances[r.id]}`:''}${r.casusbelli?.[p.id]>=state.round?' · FEHDE':''}</p></div><div class="mini-actions"><button class="btn btn-secondary" data-gift="${r.id}">Geschenk</button><button class="btn btn-primary" data-negotiate="${r.id}">Verhandeln</button><button class="btn btn-secondary" data-trade="${r.id}">Handel</button>${active?`<button class="btn btn-danger" data-break="${r.id}">Abkommen brechen</button>`:''}</div></div>`;}).join('')}</div></div>`);
    $('[data-gift]').forEach(b=>b.onclick=()=>diplomaticGift(b.dataset.gift));$('[data-negotiate]').forEach(b=>b.onclick=()=>v42OpenNegotiation(b.dataset.negotiate));$('[data-trade]').forEach(b=>b.onclick=()=>openTradeDialog(b.dataset.trade));$('[data-break]').forEach(b=>b.onclick=()=>v42BreakAgreement(b.dataset.break));$('[data-pending]')?.addEventListener('click',v42OpenPendingOffers);
  };

  const v42BaseCreate=createGame;
  createGame=function(){
    v42BaseCreate();
    if(state){state.players.forEach(v42Ensure);const first=state.players.find(p=>p.type==='human');if(first){first.guide.enabled=$('#guidedTutorial')?.value!=='off';first.guide.step=0;first.guide.done=!first.guide.enabled;}saveGame();renderAll();}
  };

  const v42BaseMigrate=migrateState;
  migrateState=function(data){data=v42BaseMigrate(data);(data.players||[]).forEach(v42Ensure);return data;};

  const v42BaseSave=saveGame;
  saveGame=function(){v42BaseSave();v42MaybeBackup();};

  const v42BaseEnd=processEndOfTurn;
  processEndOfTurn=function(p){
    const beforeL=p.lastLaundered||0;
    v42BaseEnd(p);
    v42Ensure(p);
    p.stats.launderedTotal+=Math.max(0,p.lastLaundered||beforeL||0);
    v42CheckAchievements(p);v42MaybeBackup();saveGame();
  };

  const v42BaseRender=renderAll;
  renderAll=function(){v42BaseRender();if(state){state.players.forEach(v42Ensure);const p=currentPlayer();v42CheckAchievements(p);v42RenderGuide();}};

  const v42BaseGameOver=showGameOver;
  showGameOver=function(){v42ArchiveResult();v42BaseGameOver();};

  openGameMenu=function(){
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Spielmenü</p><h2>Syndikat</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">
      <div class="dialog-option"><div><strong>Spiel speichern</strong><p>Autosave plus drei manuelle Slots und automatische Backups.</p></div><button class="btn btn-secondary" data-save>Speichern</button></div>
      <div class="dialog-option"><div><strong>Spielstände</strong><p>Slots laden, sichern oder Backup wiederherstellen.</p></div><button class="btn btn-secondary" data-slots>Öffnen</button></div>
      <div class="dialog-option"><div><strong>Tutorial / Hilfe</strong><p>Grundlagen erneut anzeigen oder geführten Einstieg aktivieren.</p></div><button class="btn btn-secondary" data-tutorial>Tutorial</button></div>
      <div class="dialog-option"><div><strong>Anzeige & Barrierefreiheit</strong><p>Schriftgröße, Kontrast, Bewegungen und kompakte Ansicht.</p></div><button class="btn btn-secondary" data-display>Öffnen</button></div>
      <div class="dialog-option"><div><strong>Erfolge & Hall of Fame</strong><p>Karriereziele und abgeschlossene Partien.</p></div><div class="mini-actions"><button class="btn btn-secondary" data-ach>Erfolge</button><button class="btn btn-secondary" data-hall>Hall of Fame</button></div></div>
      <div class="dialog-option"><div><strong>Stadtchronik</strong><p>Wichtige Ereignisse, Angriffe, Pfändungen und politische Entwicklungen.</p></div><button class="btn btn-secondary" data-news>Chronik</button></div>
      <div class="dialog-option"><div><strong>Spielstand übertragen</strong><p>Export/Import für ein anderes Gerät.</p></div><button class="btn btn-secondary" data-transfer>Öffnen</button></div>
      <div class="dialog-option"><div><strong>Hauptmenü</strong><p>Spielstand bleibt erhalten.</p></div><button class="btn btn-secondary" data-home>Verlassen</button></div></div>
      <div class="danger-zone"><div class="dialog-option"><div><strong>Partie abbrechen</strong><p>Der aktuelle Autosave wird gelöscht; manuelle Slots bleiben erhalten.</p></div><button class="btn btn-danger" data-abort>Abbrechen</button></div></div></div>`);
    $('[data-save]').onclick=()=>{saveGame();toast('Spiel gespeichert.');closeDialog();};$('[data-slots]').onclick=v42OpenSlots;$('[data-tutorial]').onclick=()=>startTutorial(0);$('[data-display]').onclick=v42OpenSettings;$('[data-ach]').onclick=v42OpenAchievements;$('[data-hall]').onclick=v42OpenHall;$('[data-news]').onclick=v42OpenChronicle;$('[data-transfer]').onclick=openTransferDialog;$('[data-home]').onclick=()=>{saveGame();closeDialog();showScreen('menuScreen');updateContinueButton();};$('[data-abort]').onclick=()=>{if(confirm('Partie wirklich endgültig abbrechen?')){localStorage.removeItem(SAVE_KEY);state=null;closeDialog();showScreen('menuScreen');updateContinueButton();}};
  };

  const v42BaseInit=init;
  init=function(){
    audioPrefs.music=false;audioPrefs.sfx=false;try{stopMusic()}catch{}
    v42BaseInit();v42ApplyUi();
    $('#saveSlotsBtn')?.addEventListener('click',v42OpenSlots);$('#hallBtn')?.addEventListener('click',v42OpenHall);$('#settingsBtn')?.addEventListener('click',v42OpenSettings);
  };

  window.SyndikatMeta={openSlots:v42OpenSlots,openHall:v42OpenHall,openAchievements:v42OpenAchievements,openSettings:v42OpenSettings,openChronicle:v42OpenChronicle};
})();
/* SYNDIKAT_V42_META_END */

/* SYNDIKAT_V43_DEPTH_BEGIN */
(function SYNDIKAT_V43_DEPTH(){
  const STREET_NAMES={
    oldtown:['Kronengasse','Marktstraße','Rathausbogen','Mühlengasse'],
    center:['Broadway','Königsallee','Central Avenue','Park Row'],
    station:['Bahnhofstraße','Gleisweg','Union Street','Depot Lane'],
    redlight:['Ruby Lane','Velvet Street','Scarlet Alley','Neon Row'],
    harbor:['Dockstraße','Pier 9','Werftweg','Harbor Lane'],
    industrial:['Fabrikstraße','Stahlweg','Werkhof','Foundry Road'],
    west:['Park Avenue','Westendstraße','Magnolia Drive','Grand Avenue'],
    south:['Südallee','Canal Street','Bridge Road','Ash Street']
  };
  const CITY_EVENTS=[
    {id:'crackdown',name:'Großrazzia-Welle',desc:'Polizei und Staatsanwaltschaft erhöhen fünf Runden lang den Druck.',duration:5,income:.94,risk:1.35,legal:1},
    {id:'boom',name:'Wirtschaftsboom',desc:'Legale Geschäfte profitieren von hoher Nachfrage.',duration:6,income:1.13,risk:.95,legal:1.12},
    {id:'gangwar',name:'Bandenkrieg',desc:'Gewalt und Unsicherheit treffen die ganze Stadt.',duration:5,income:.97,risk:1.22,legal:.96},
    {id:'fair',name:'Weltausstellung',desc:'Hotels, Bars und Unterhaltung erleben einen Besucheransturm.',duration:6,income:1.10,risk:.9,legal:1.08},
    {id:'recession',name:'Rezession',desc:'Umsätze sinken, kleine Betriebe geraten unter Druck.',duration:5,income:.88,risk:1.05,legal:.92}
  ];
  function v43Ensure(p){
    p.stats=p.stats||{};for(const k of ['defections','molesPlaced','molesExposed','cityEventsSurvived'])p.stats[k]=Number(p.stats[k])||0;
    p.moles=p.moles||{};
    p.crews=Array.isArray(p.crews)?p.crews:[];
    p.inventory=p.inventory||{weapons:[],vehicles:[],gear:[]};
    ['weapons','vehicles','gear'].forEach(k=>p.inventory[k]=Array.isArray(p.inventory[k])?p.inventory[k]:[]);
    for(const s of p.staffRoster||[]){s.moleFor=s.moleFor||null;s.exposed=!!s.exposed;}
    for(const b of p.businesses||[]){
      if(!b.siteName){const names=STREET_NAMES[b.district]||['Hauptstraße'];b.siteName=`${names[Math.abs((b.id||'x').split('').reduce((a,c)=>a+c.charCodeAt(0),0))%names.length]} ${rand(3,98)}`;}
    }
  }
  function v43ItemDefs(){return window.SyndikatV4?.items||{weapons:{},vehicles:{},gear:{}}}
  function v43Owns(p,type,id){return (p.inventory?.[type]||[]).some(x=>x.id===id)}
  function v43BuyAiGear(p){
    const defs=v43ItemDefs(),worth=netWorth(p);
    const wishes=[];
    if(worth>90000)wishes.push(['gear','masks']);
    if(worth>140000)wishes.push(['weapons','pistol']);
    if(worth>250000)wishes.push(['vehicles','sedan'],['gear','radios']);
    if(worth>650000)wishes.push(['weapons','shotgun'],['gear','armor']);
    if(worth>1500000)wishes.push(['vehicles','van'],['weapons','tommy']);
    for(const [type,id] of wishes){
      const d=defs[type]?.[id];if(!d||v43Owns(p,type,id))continue;
      const clean=type!=='weapons',cash=clean?p.clean:p.dirty,reserve=Math.max(12000,staffPayroll(p)*2);
      if(cash>=d.cost+reserve){if(clean)p.clean-=d.cost;else p.dirty-=d.cost;p.inventory[type].push({id,condition:100,acquiredRound:state.round});break;}
    }
  }
  function v43BuildAiCrew(p){
    if(p.crews.length||activeStaff(p).length<3)return;
    const members=activeStaff(p).filter(s=>['gunman','bodyguard','informant'].includes(s.role)).sort((a,b)=>b.skill-a.skill).slice(0,5);
    if(members.length<2)return;
    const boss=members.filter(s=>s.level>=2&&s.loyalty>=55).sort((a,b)=>b.skill-a.skill)[0]||null;
    const c={id:uid(),name:`${p.family} Crew`,memberIds:members.map(s=>s.id),underbossId:boss?.id||null,wins:0,losses:0};p.crews.push(c);members.forEach(s=>s.crewId=c.id);if(boss&&!p.underbossId)p.underbossId=boss.id;
  }
  function v43CrewScore(p){
    const crew=p.crews[0],members=crew?crew.memberIds.map(id=>p.staffRoster.find(s=>s.id===id)).filter(Boolean):activeStaff(p).filter(s=>['gunman','bodyguard','informant'].includes(s.role)).slice(0,4);
    const staffScore=members.length?members.reduce((a,s)=>a+s.skill+s.level*4,0)/members.length:0;
    const defs=v43ItemDefs();
    let gearBonus=0;
    for(const type of ['weapons','vehicles','gear']){
      const best=(p.inventory?.[type]||[]).map(item=>{
        const def=defs[type]?.[item.id],condition=clamp(Number(item.condition)||100,15,100);
        return def?def.power*(condition/100):0;
      }).sort((a,b)=>b-a)[0]||0;
      gearBonus+=best;
    }
    return staffScore+gearBonus*.7;
  }
  function v43WearAiEquipment(p){
    for(const type of ['weapons','vehicles','gear']){
      const item=(p.inventory?.[type]||[]).sort((a,b)=>(b.condition||100)-(a.condition||100))[0];
      if(item)item.condition=clamp((Number(item.condition)||100)-rand(2,type==='gear'?7:5),15,100);
    }
  }
  function v43AiSpecialOp(p){
    if(p.actionPoints<2||p.staff.gunman<1||p.dirty<5000)return false;
    const enemies=state.players.filter(t=>t.id!==p.id&&!t.eliminated&&!pactActive(p,t)&&!allianceActive(p,t));
    if(!enemies.length)return false;
    const feud=enemies.find(t=>p.casusbelli?.[t.id]>=state.round||t.casusbelli?.[p.id]>=state.round);
    const t=feud||[...enemies].sort((a,b)=>powerIndex(b)-powerIndex(a))[0];
    const score=v43CrewScore(p)+roleSkill(p,'informant')*.18;
    if(t.businesses.length&&chance(feud?.45:.18)){
      const b=[...t.businesses].sort((a,b)=>BUSINESSES[b.type].influence-BUSINESSES[a.type].influence)[0],def=businessSecurity(t,b);
      p.dirty-=3500;p.actionPoints-=2;p.roundActivity=(p.roundActivity||0)+4;p.heat=clamp(p.heat+13,0,100);
      if(chance(clamp(.38+(score-def)/160,.12,.83))){b.health=clamp(b.health-rand(30,58),0,100);if(!b.health)t.businesses=t.businesses.filter(x=>x.id!==b.id);p.stats.operationsSuccess=(p.stats.operationsSuccess||0)+1;if(p.crews[0])p.crews[0].wins++;}else{p.stats.operationsFailed=(p.stats.operationsFailed||0)+1;if(p.crews[0])p.crews[0].losses++;}
      adjustRelation(p,t,-20);v43WearAiEquipment(p);return true;
    }
    if(activeStaff(t).length&&p.staff.informant>=1&&chance(feud?.28:.08)){
      const target=[...activeStaff(t)].sort((a,b)=>a.loyalty-b.loyalty)[0];
      p.dirty-=5000;p.actionPoints-=2;p.roundActivity=(p.roundActivity||0)+4;p.heat=clamp(p.heat+18,0,100);
      if(chance(clamp(.25+score/300+(55-target.loyalty)/180,.08,.72))){target.heldUntil=state.round+2;p.stats.operationsSuccess=(p.stats.operationsSuccess||0)+1;}else p.stats.operationsFailed=(p.stats.operationsFailed||0)+1;
      adjustRelation(p,t,-28);v43WearAiEquipment(p);return true;
    }
    return false;
  }

  function v43OpenEspionage(){
    const p=currentPlayer();v43Ensure(p);
    if(p.staff.informant<1)return toast('Du brauchst mindestens einen Informanten.');
    const people=state.players.filter(t=>t.id!==p.id&&!t.eliminated).flatMap(t=>activeStaff(t).filter(s=>!s.moleFor).map(s=>({t,s}))).sort((a,b)=>a.s.loyalty-b.s.loyalty);
    if(!people.length)return toast('Kein geeignetes Ziel.');
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Spionage & Abwerbung</p><h2>Menschen sind die Schwachstelle</h2></div><button class="icon-btn" data-close>✕</button></div>
      <p class="muted">Niedrige Loyalität, starke Informanten und schlechte Beziehungen zum eigenen Boss erhöhen deine Chance.</p><div class="dialog-list">${people.slice(0,18).map(({t,s})=>`<div class="dialog-option"><div><strong>${esc(t.family)} · ${esc(s.name)}</strong><p>${esc(STAFF[s.role].name)} · Loyalität ${s.loyalty} · Fähigkeit ${s.skill}</p></div><div class="mini-actions"><button class="btn btn-secondary" data-mole="${t.id}:${s.id}">Doppelagent · ${fmt(8000)}</button><button class="btn btn-primary" data-defect="${t.id}:${s.id}">Abwerben · ${fmt(12000)}</button></div></div>`).join('')}</div></div>`);
    $('[data-mole]').forEach(b=>b.onclick=()=>v43TurnPerson(b.dataset.mole,'mole'));
    $('[data-defect]').forEach(b=>b.onclick=()=>v43TurnPerson(b.dataset.defect,'defect'));
  }
  function v43TurnPerson(data,mode){
    const p=currentPlayer(),[tid,sid]=data.split(':'),t=state.players.find(x=>x.id===tid),s=t?.staffRoster.find(x=>x.id===sid),cost=mode==='mole'?8000:12000;
    if(!t||!s)return;if(p.dirty<cost)return toast('Nicht genug schmutziges Geld.');if(p.actionPoints<1)return toast('Du brauchst 1 AP.');
    p.dirty-=cost;p.actionPoints--;p.roundActivity=(p.roundActivity||0)+3;
    const chanceVal=clamp(.22+roleSkill(p,'informant')/300+(55-s.loyalty)/130+Math.max(0,-relation(p,t))/250,.06,.82);
    if(chance(chanceVal)){
      if(mode==='mole'){s.moleFor=p.id;s.loyalty=clamp(s.loyalty-8,0,100);p.stats.molesPlaced++;p.scouting=Object.assign(p.scouting,Object.fromEntries(DISTRICTS.filter(d=>t.businesses.some(b=>b.district===d.id)).map(d=>[d.id,{round:state.round,level:3}])));toast(`${s.name} arbeitet nun verdeckt für dich.`);}
      else{t.staffRoster=t.staffRoster.filter(x=>x.id!==s.id);t.crews?.forEach(c=>c.memberIds=c.memberIds.filter(id=>id!==s.id));s.loyalty=clamp(55+rand(0,20),0,100);s.moleFor=null;s.crewId=null;p.staffRoster.push(s);p.stats.defections++;syncStaffCounts(t);syncStaffCounts(p);toast(`${s.name} wechselt zu deiner Familie.`);}
      adjustRelation(p,t,-18);log(`${p.family}: erfolgreiche Personaloperation gegen ${t.family}.`);
    }else{adjustRelation(p,t,-8);p.heat=clamp(p.heat+4,0,100);toast('Kontaktversuch scheitert. Der Rivale wird misstrauisch.');}
    closeDialog();saveGame();renderAll();
  }
  function v43ProcessMoles(p){
    for(const enemy of state.players.filter(x=>x.id!==p.id&&!x.eliminated)){
      const moles=enemy.staffRoster.filter(s=>s.moleFor===p.id&&!s.exposed);
      for(const m of moles){
        if(chance(.18)){const d=enemy.businesses.length?enemy.businesses[rand(0,enemy.businesses.length-1)].district:DISTRICTS[rand(0,DISTRICTS.length-1)].id;p.scouting[d]={round:state.round,level:3};}
        if(chance(.035+roleSkill(enemy,'informant')/1800)){m.exposed=true;m.moleFor=null;enemy.reputation+=2;p.stats.molesExposed++;log(`${enemy.family}: Doppelagent ${m.name} wird enttarnt.`);}
      }
    }
  }

  function v43StartCityEvent(){
    if(!state||state.gameOver)return;
    const ev=CITY_EVENTS[rand(0,CITY_EVENTS.length-1)];state.cityEvent={...ev,started:state.round,until:state.round+ev.duration};log(`STADT: ${ev.name} – ${ev.desc}`);
  }
  function v43UpdateCityEvent(){
    if(state.cityEvent&&state.round>state.cityEvent.until){log(`STADT: ${state.cityEvent.name} endet.`);state.cityEvent=null;state.players.forEach(p=>p.stats.cityEventsSurvived=(p.stats.cityEventsSurvived||0)+1);}
    if(!state.cityEvent&&state.round>=20&&state.round%20===0)v43StartCityEvent();
  }
  const v43Income=estimateIncome;
  estimateIncome=function(p,b){
    let v=v43Income(p,b),ev=state?.cityEvent;if(!ev)return v;
    v*=ev.income||1;
    if((BUSINESSES[b.type].legalShare||.5)>.65)v*=ev.legal||1;
    return v;
  };
  const v43Crime=crimeSuccess;
  crimeSuccess=function(p,c){let v=v43Crime(p,c);if(state?.cityEvent?.id==='crackdown')v-=.08;if(state?.cityEvent?.id==='gangwar')v+=.03;return clamp(v,.04,.97);};

  const v43BaseInitPlayer=initPlayer;
  initPlayer=function(p){v43BaseInitPlayer(p);v43Ensure(p);};

  const v43BaseMigrate=migrateState;
  migrateState=function(data){data=v43BaseMigrate(data);(data.players||[]).forEach(v43Ensure);data.cityEvent=data.cityEvent||null;return data;};

  const v43BaseEnd=processEndOfTurn;
  processEndOfTurn=function(p){v43Ensure(p);v43ProcessMoles(p);v43BaseEnd(p);};

  const v43Advance=advanceIndex;
  advanceIndex=function(){const before=state?.round||0;v43Advance();if(state&&!state.gameOver&&state.round>before){v43UpdateCityEvent();saveGame();}};

  const v43Ai=aiTurn;
  aiTurn=function(p){
    v43Ensure(p);v43BuyAiGear(p);v43BuildAiCrew(p);
    if(p.profile==='aggressive'||(p.casusbelli&&Object.values(p.casusbelli).some(r=>r>=state.round))){if(v43AiSpecialOp(p)){p.lastAction='Geplante Operation';return;}}
    v43Ai(p);
  };

  const v43Actions=renderActions;
  renderActions=function(){
    v43Actions();const p=currentPlayer();if(!p||p.jailed)return;
    const panel=$('#actionsView .action-panel .button-grid');
    if(panel&&!panel.querySelector('[data-v43-spy]')){panel.insertAdjacentHTML('beforeend','<button class="btn btn-secondary" data-v43-spy>Spionage & Abwerbung</button>');$('[data-v43-spy]',panel).onclick=v43OpenEspionage;}
  };

  const v43Business=renderBusinesses;
  renderBusinesses=function(){
    v43Business();const p=currentPlayer();
    $('#businessList .business-card').forEach((el,i)=>{const b=p.businesses[i];if(!b)return;let site=el.querySelector('.v43-site');if(!site){site=document.createElement('small');site.className='v43-site';site.textContent=b.siteName||'';el.querySelector('.title')?.appendChild(site);}});
  };

  const v43City=renderCity;
  renderCity=function(){
    v43City();if(!state?.cityEvent)return;
    const area=$('#situationList');if(area&&!area.querySelector('[data-city-event]'))area.insertAdjacentHTML('afterbegin',`<div class="situation-item city-event-row" data-city-event><span>Stadtweite Lage</span><strong>${esc(state.cityEvent.name)} · bis R${state.cityEvent.until}</strong></div>`);
  };

  const v43GameOver=showGameOver;
  showGameOver=function(){
    v43GameOver();
    if(!state?.gameOver)return;
    const w=state.players.find(p=>p.id===state.winnerId),root=$('#dialogContent');if(!w||!root||root.querySelector('[data-v43-summary]'))return;
    root.insertAdjacentHTML('beforeend',`<div class="panel final-summary" data-v43-summary><div class="panel-head"><h3>Partieanalyse</h3></div><div class="finance-grid" style="padding:1rem">${metricCards([
      ['Runde',state.round,''],['Macht',pct(powerIndex(w)),'positive'],['Vermögen',fmt(netWorth(w)),'positive'],['Viertel',controlledDistricts(w),''],['Operationen',`${w.stats.operationsSuccess||0}/${(w.stats.operationsSuccess||0)+(w.stats.operationsFailed||0)}`,''],['Crews',(w.crews||[]).length,''],['Personal',activeStaff(w).length,''],['Beweislage',`${Math.round(w.investigation?.evidence||0)}/100`,'']
    ])}</div><p class="muted" style="padding:0 1rem 1rem">Grund: ${esc(state.endReason||'Dominanz erreicht.')}</p></div>`);
  };

  window.SyndikatDepth={openEspionage:v43OpenEspionage,cityEvents:CITY_EVENTS};
})();
/* SYNDIKAT_V43_DEPTH_END */

/* SYNDIKAT_V44_ECONOMY_DEPTH_BEGIN */
(function SYNDIKAT_V44_ECONOMY_DEPTH(){
  const PATHS={
    machines:[
      {id:'lowprofile',name:'Unauffällige Route',desc:'Weniger Ertrag, deutlich weniger Aufmerksamkeit und Spuren.',income:.90,launder:1.05,risk:.65,security:4,influence:.95},
      {id:'highroller',name:'High-Roller-Automaten',desc:'Höhere Einsätze und Erträge, dafür mehr Heat.',income:1.22,launder:1.15,risk:1.28,security:0,influence:1.08}
    ],
    escort:[
      {id:'discreet',name:'Diskreter Begleitservice',desc:'Sauberere Fassade und weniger Polizeidruck.',income:.96,launder:1.18,risk:.70,security:3,influence:1.0},
      {id:'premium',name:'Premium-Agentur',desc:'Mehr Umsatz und Einfluss im gehobenen Segment.',income:1.20,launder:1.08,risk:1.12,security:2,influence:1.10}
    ],
    bar:[
      {id:'lounge',name:'Seriöse Lounge',desc:'Mehr legales Geschäft, geringere Risiken.',income:1.08,launder:.88,risk:.72,security:5,influence:1.05},
      {id:'speakeasy',name:'Hinterzimmer',desc:'Hohe Waschkapazität und Ertrag, aber auffälliger.',income:1.16,launder:1.35,risk:1.30,security:1,influence:1.08}
    ],
    betting:[
      {id:'sportsbook',name:'Sportwetten-Netz',desc:'Konstante Nachfrage und höhere Einnahmen.',income:1.18,launder:1.08,risk:1.10,security:2,influence:1.06},
      {id:'bookmaking',name:'Hinterhof-Buchmacher',desc:'Mehr Geldwäsche, aber Ermittlungsrisiko.',income:1.08,launder:1.42,risk:1.38,security:0,influence:1.05}
    ],
    arcade:[
      {id:'family',name:'Familien-Spielhalle',desc:'Legaler, stabiler und weniger riskant.',income:1.08,launder:.88,risk:.72,security:4,influence:1.03},
      {id:'night',name:'Nachtbetrieb',desc:'Mehr Umsatz und Waschkapazität.',income:1.20,launder:1.25,risk:1.22,security:1,influence:1.09}
    ],
    club:[
      {id:'vip',name:'VIP-Club',desc:'Maximaler Umsatz und Einfluss bei hoher Sichtbarkeit.',income:1.24,launder:1.12,risk:1.20,security:6,influence:1.13},
      {id:'backroom',name:'Geschlossene Gesellschaft',desc:'Diskrete Geldwäsche hinter verschlossenen Türen.',income:1.08,launder:1.48,risk:1.28,security:5,influence:1.07}
    ],
    luxury:[
      {id:'elite',name:'Elite-Bordell',desc:'Hohes Prestige und bessere zahlungskräftige Kundschaft.',income:1.22,launder:1.15,risk:1.16,security:6,influence:1.12},
      {id:'discretion',name:'Diskretionshaus',desc:'Weniger Heat und starke Abschirmung.',income:1.02,launder:1.22,risk:.62,security:10,influence:1.05}
    ],
    casino:[
      {id:'resort',name:'Resort-Casino',desc:'Mehr legales Kapital und Tourismusgeschäft.',income:1.16,launder:.92,risk:.74,security:8,influence:1.12},
      {id:'highstakes',name:'High-Stakes-Floor',desc:'Sehr hoher Umsatz und Waschkapazität, aber riskant.',income:1.28,launder:1.30,risk:1.24,security:5,influence:1.15}
    ],
    hotel:[
      {id:'luxuryhotel',name:'Luxushotel',desc:'Maximiert legales Einkommen und Prestige.',income:1.20,launder:.90,risk:.70,security:8,influence:1.13},
      {id:'conference',name:'Kongresshotel',desc:'Stabiler Umsatz und politische Kontakte.',income:1.13,launder:1.05,risk:.82,security:6,influence:1.10}
    ],
    holding:[
      {id:'legit',name:'Legale Beteiligungsholding',desc:'Hoher legaler Anteil und geringe Aufmerksamkeit.',income:1.15,launder:.85,risk:.60,security:8,influence:1.10},
      {id:'shells',name:'Firmengeflecht',desc:'Extreme Waschkapazität mit erhöhtem Ermittlungsrisiko.',income:1.10,launder:1.55,risk:1.35,security:4,influence:1.12}
    ]
  };
  const PROPERTY_KINDS=[
    {id:'shop',name:'Ladenlokal',capacity:1,base:55000,influence:10,rentRate:.0070},
    {id:'block',name:'Wohn- & Geschäftshaus',capacity:2,base:130000,influence:18,rentRate:.0065},
    {id:'warehouse',name:'Lagerhalle',capacity:3,base:210000,influence:24,rentRate:.0060},
    {id:'prime',name:'Premium-Grundstück',capacity:4,base:390000,influence:34,rentRate:.0055}
  ];
  const PROTECTION_TARGETS=['Kiosk','Friseursalon','Späti','Taxi-Zentrale','Werkstatt','Pfandleihe','Gemüsehändler','Nachtcafé','Lagerbetrieb','Billardsalon','Schneiderei','Tabakladen'];

  function v44Path(b){return (PATHS[b.type]||[]).find(x=>x.id===b.specialization)||null}
  function v44EnsurePlayer(p){
    p.propertyIds=Array.isArray(p.propertyIds)?p.propertyIds:[];
    p.protectionContracts=Array.isArray(p.protectionContracts)?p.protectionContracts:[];
    p.stats=p.stats||{};for(const k of ['propertiesBought','propertiesSold','contracts','misinformationSeen'])p.stats[k]=Number(p.stats[k])||0;
    for(const b of p.businesses||[]){b.specialization=b.specialization||null;b.propertyId=b.propertyId||null;b.leaseCost=Number(b.leaseCost)||0;}
  }
  function v44InitMarket(){
    if(!state)return;
    state.propertyMarket=Array.isArray(state.propertyMarket)?state.propertyMarket:[];
    if(state.propertyMarket.length)return;
    for(const d of DISTRICTS){
      const names=(window.SyndikatDepth&&d.id)||d.id;
      for(let i=0;i<4;i++){
        const k=PROPERTY_KINDS[i],mult=.72+d.demand*.32+d.police*.08;
        const value=Math.round(k.base*mult/500)*500;
        state.propertyMarket.push({id:uid(),district:d.id,kind:k.id,name:`${d.name} · Objekt ${i+1}`,value,condition:rand(82,100),ownerId:null,capacity:k.capacity,tenantDemand:clamp(.68+d.demand*.22+Math.random()*.12,0.55,1.08),listed:true,acquiredRound:null});
      }
    }
  }
  function v44EnsureState(){
    if(!state)return;state.players.forEach(v44EnsurePlayer);v44InitMarket();
  }
  function v44Kind(lot){return PROPERTY_KINDS.find(x=>x.id===lot.kind)||PROPERTY_KINDS[0]}
  function v44Owned(p){return (state.propertyMarket||[]).filter(x=>x.ownerId===p.id)}
  function v44UsedCapacity(lot){
    return state.players.reduce((sum,p)=>sum+p.businesses.filter(b=>b.propertyId===lot.id).reduce((a,b)=>a+(BUSINESSES[b.type].slotUse||1),0),0);
  }
  function v44FreeCapacity(lot){return Math.max(0,(lot.capacity||1)-v44UsedCapacity(lot))}
  function v44LeaseFor(b){const d=DISTRICTS.find(x=>x.id===b.district),def=BUSINESSES[b.type];return Math.max(120,Math.round((def.cost*.0022+140)*d.demand/10)*10)}
  function v44AssignProperty(p,b){
    if(b.propertyId)return;
    const need=Math.min(4,BUSINESSES[b.type].slotUse||1),lot=v44Owned(p).filter(x=>x.district===b.district&&v44FreeCapacity(x)>=need).sort((a,b)=>v44FreeCapacity(a)-v44FreeCapacity(b))[0];
    if(lot){b.propertyId=lot.id;b.leaseCost=0;b.siteName=lot.name;}
    else b.leaseCost=v44LeaseFor(b);
  }
  function v44PropertyValue(lot){return Math.round(lot.value*(lot.condition/100))}
  function v44PropertyIncome(p,lot){
    const kind=v44Kind(lot),used=v44UsedCapacity(lot),free=Math.max(0,lot.capacity-used);
    return Math.round(v44PropertyValue(lot)*kind.rentRate*lot.tenantDemand*(free/Math.max(1,lot.capacity)));
  }
  function v44PropertyTax(lot){return Math.round(v44PropertyValue(lot)*.0016)}
  function v44GroundInfluence(p,did){return v44Owned(p).filter(x=>x.district===did).reduce((s,l)=>s+v44Kind(l).influence*(l.condition/100),0)}

  const v44Net=netWorth;
  netWorth=function(p){return v44Net(p)+v44Owned(p).reduce((s,l)=>s+v44PropertyValue(l)*.86,0)};

  const v44Influence=playerInfluence;
  playerInfluence=function(p,did){return v44Influence(p,did)+v44GroundInfluence(p,did)};

  const v44Income=estimateIncome;
  estimateIncome=function(p,b){const path=v44Path(b);return v44Income(p,b)*(path?.income||1)};

  const v44BizInf=businessInfluence;
  businessInfluence=function(b){return v44BizInf(b)*(v44Path(b)?.influence||1)};

  const v44Security=businessSecurity;
  businessSecurity=function(p,b){return clamp(v44Security(p,b)+(v44Path(b)?.security||0),0,98)};

  function v44ChoosePath(p,b,id){
    const path=(PATHS[b.type]||[]).find(x=>x.id===id);if(!path||b.specialization)return;
    if((b.level||1)<2)return toast('Spezialisierungen werden ab Stufe 2 verfügbar.');
    const cost=Math.round(BUSINESSES[b.type].cost*.12);if(p.clean<cost)return toast(`Du brauchst ${fmt(cost)} sauberes Kapital.`);
    p.clean-=cost;b.specialization=id;p.reputation+=2;ledger(p,`${BUSINESSES[b.type].name}: ${path.name}`,-cost,'asset');saveGame();closeDialog();renderAll();toast(`${path.name} eingerichtet.`);
  }

  const v44BusinessDialog=openBusinessDialog;
  openBusinessDialog=function(id){
    v44BusinessDialog(id);const p=currentPlayer(),b=p.businesses.find(x=>x.id===id),root=$('#dialogContent .dialog-wrap');if(!b||!root)return;
    const path=v44Path(b),lot=(state.propertyMarket||[]).find(x=>x.id===b.propertyId);
    const box=document.createElement('div');box.className='v44-business-depth';
    box.innerHTML=`<div class="panel v44-site-panel"><div class="panel-head"><h3>Standort & Ausrichtung</h3></div><div class="intel-list">
      <div class="intel-row"><strong>Standort</strong><span>${esc(lot?.name||b.siteName||'Gemieteter Standort')} · ${b.propertyId?'Eigentum':`Miete ${fmt(b.leaseCost||v44LeaseFor(b))}/R`}</span></div>
      <div class="intel-row"><strong>Spezialisierung</strong><span>${path?esc(path.name):((b.level||1)>=2?'Noch nicht gewählt':'ab Stufe 2')}</span></div>
      ${path?`<div class="intel-row"><strong>Profil</strong><span>Ertrag ×${path.income.toFixed(2)} · Geldwäsche ×${path.launder.toFixed(2)} · Risiko ×${path.risk.toFixed(2)}</span></div>`:''}
    </div>
    ${!path&&(b.level||1)>=2?`<div class="dialog-list">${(PATHS[b.type]||[]).map(x=>`<div class="dialog-option"><div><strong>${esc(x.name)}</strong><p>${esc(x.desc)}<br>Ertrag ×${x.income.toFixed(2)} · Wäsche ×${x.launder.toFixed(2)} · Risiko ×${x.risk.toFixed(2)}</p></div><button class="btn btn-secondary" data-path="${x.id}">${fmt(Math.round(BUSINESSES[b.type].cost*.12))}</button></div>`).join('')}</div>`:''}</div>`;
    const footer=root.querySelector('.dialog-footer');if(footer)root.insertBefore(box,footer);else root.appendChild(box);
    $('[data-path]',box).forEach(btn=>btn.onclick=()=>v44ChoosePath(p,b,btn.dataset.path));
  };

  const v44Buy=buyBusiness;
  buyBusiness=function(type,did){
    const p=currentPlayer(),ids=new Set(p.businesses.map(b=>b.id));v44Buy(type,did);
    const b=p.businesses.find(x=>!ids.has(x.id));if(b){v44EnsurePlayer(p);v44AssignProperty(p,b);saveGame();}
  };

  function v44OpenPropertyMarket(did=selectedDistrict){
    const p=currentPlayer();v44EnsureState();
    const d=DISTRICTS.find(x=>x.id===did),lots=state.propertyMarket.filter(x=>x.district===did);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Grundbesitz · ${esc(d.name)}</p><h2>Immobilien & Grundstücke</h2></div><button class="icon-btn" data-close>✕</button></div>
      <p class="muted">Eigene Immobilien ersetzen Mietkosten, bringen legalen Mietertrag und zusätzlichen Viertel-Einfluss. Freie Kapazität kann für deine Betriebe genutzt werden.</p>
      <div class="dialog-list">${lots.map(l=>{const k=v44Kind(l),mine=l.ownerId===p.id,owner=state.players.find(x=>x.id===l.ownerId);return `<div class="dialog-option"><div><strong>${esc(l.name)} · ${esc(k.name)}</strong><p>Wert ${fmt(v44PropertyValue(l))} · Zustand ${Math.round(l.condition)}% · Kapazität ${v44UsedCapacity(l)}/${l.capacity} · Einfluss ${k.influence}<br>${mine?`Dein Eigentum · externer Mietertrag ca. ${fmt(v44PropertyIncome(p,l))}/R`:owner?`Eigentümer: ${esc(owner.family)}`:'Zum Verkauf'}</p></div><div class="mini-actions">${!l.ownerId?`<button class="btn btn-primary" data-buy-land="${l.id}" ${p.clean<l.value||p.actionPoints<1?'disabled':''}>Kaufen ${fmt(l.value)}</button>`:''}${mine?`<button class="btn btn-secondary" data-assign-land="${l.id}">Betriebe zuweisen</button><button class="btn btn-danger" data-sell-land="${l.id}" ${v44UsedCapacity(l)>0?'disabled':''}>Verkaufen</button>`:''}</div></div>`}).join('')}</div></div>`);
    $('[data-buy-land]').forEach(b=>b.onclick=()=>v44BuyLand(b.dataset.buyLand));
    $('[data-assign-land]').forEach(b=>b.onclick=()=>v44AssignLandDialog(b.dataset.assignLand));
    $('[data-sell-land]').forEach(b=>b.onclick=()=>v44SellLand(b.dataset.sellLand));
  }
  function v44BuyLand(id){
    const p=currentPlayer(),lot=state.propertyMarket.find(x=>x.id===id);if(!lot||lot.ownerId)return;if(p.actionPoints<1)return toast('Du brauchst 1 AP.');if(p.clean<lot.value)return toast('Nicht genug sauberes Kapital.');
    p.clean-=lot.value;p.actionPoints--;lot.ownerId=p.id;lot.acquiredRound=state.round;p.propertyIds.push(lot.id);p.stats.propertiesBought++;ledger(p,`Immobilie ${lot.name}`,-lot.value,'asset');
    for(const b of p.businesses.filter(b=>b.district===lot.district&&!b.propertyId)){const need=Math.min(4,BUSINESSES[b.type].slotUse||1);if(v44FreeCapacity(lot)>=need){b.propertyId=lot.id;b.leaseCost=0;b.siteName=lot.name;}}
    saveGame();v44OpenPropertyMarket(lot.district);toast('Grundbesitz erworben.');
  }
  function v44SellLand(id){
    const p=currentPlayer(),lot=state.propertyMarket.find(x=>x.id===id);if(!lot||lot.ownerId!==p.id||v44UsedCapacity(lot)>0)return;
    const val=Math.round(v44PropertyValue(lot)*.84);p.clean+=val;lot.ownerId=null;lot.acquiredRound=null;p.propertyIds=p.propertyIds.filter(x=>x!==id);p.stats.propertiesSold++;ledger(p,`Immobilie ${lot.name} verkauft`,val,'clean');saveGame();v44OpenPropertyMarket(lot.district);toast(`Verkauft für ${fmt(val)}.`);
  }
  function v44AssignLandDialog(id){
    const p=currentPlayer(),lot=state.propertyMarket.find(x=>x.id===id);if(!lot||lot.ownerId!==p.id)return;
    const biz=p.businesses.filter(b=>b.district===lot.district);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">${esc(lot.name)}</p><h2>Betriebe zuweisen</h2></div><button class="icon-btn" data-close>✕</button></div><p class="muted">Kapazität ${v44UsedCapacity(lot)}/${lot.capacity}. Ein Betrieb im eigenen Objekt zahlt keine Standortmiete.</p><div class="dialog-list">${biz.map(b=>{const here=b.propertyId===lot.id,need=Math.min(4,BUSINESSES[b.type].slotUse||1);return `<div class="dialog-option"><div><strong>${esc(BUSINESSES[b.type].name)}</strong><p>Benötigt ${need} Kapazität · ${b.propertyId?'bereits im Eigentum':'aktuell gemietet'}</p></div><button class="btn btn-secondary" data-move-biz="${b.id}" ${!here&&v44FreeCapacity(lot)<need?'disabled':''}>${here?'Aus Objekt lösen':'Hier einziehen'}</button></div>`}).join('')}</div></div>`);
    $('[data-move-biz]').forEach(btn=>btn.onclick=()=>{const b=p.businesses.find(x=>x.id===btn.dataset.moveBiz);if(!b)return;if(b.propertyId===lot.id){b.propertyId=null;b.leaseCost=v44LeaseFor(b);}else{b.propertyId=lot.id;b.leaseCost=0;b.siteName=lot.name;}saveGame();v44AssignLandDialog(id);});
  }

  function v44AddProtectionContract(p,did,level){
    const same=p.protectionContracts.filter(x=>x.district===did).length;if(same>=6)return;
    const target=PROTECTION_TARGETS[(same+rand(0,PROTECTION_TARGETS.length-1))%PROTECTION_TARGETS.length];
    p.protectionContracts.push({id:uid(),district:did,name:`${target} ${same+1}`,tier:level,income:Math.round((400+level*260)*(DISTRICTS.find(x=>x.id===did).demand)),risk:5+level*3,loyalty:rand(55,86),started:state.round});
    p.stats.contracts++;
  }
  const v44ProtectionIncome=protectionIncome;
  protectionIncome=function(p,did){return v44ProtectionIncome(p,did)+(p.protectionContracts||[]).filter(x=>x.district===did).reduce((s,c)=>s+c.income*(c.loyalty/100),0)};

  const v44BuildProtection=buildProtection;
  buildProtection=function(did){
    const p=currentPlayer(),before=p.protection?.[did]?.level||0;v44BuildProtection(did);const after=p.protection?.[did]?.level||0;
    if(after>before){v44EnsurePlayer(p);v44AddProtectionContract(p,did,after);if(chance(.45))v44AddProtectionContract(p,did,after);saveGame();}
  };
  const v44ProtectionDialog=openProtectionDialog;
  openProtectionDialog=function(){
    v44ProtectionDialog();const p=currentPlayer(),root=$('#dialogContent .dialog-wrap');if(!root)return;
    const contracts=p.protectionContracts||[];
    if(contracts.length){const box=document.createElement('div');box.innerHTML=`<h3>Einzelne Schutzverträge</h3><div class="dialog-list">${contracts.map(c=>`<div class="dialog-option"><div><strong>${esc(c.name)} · ${esc(DISTRICTS.find(d=>d.id===c.district).name)}</strong><p>Ertrag ${fmt(Math.round(c.income*c.loyalty/100))}/R · Loyalität ${c.loyalty}% · Risiko ${c.risk}</p></div><button class="btn btn-secondary" data-pressure="${c.id}">Druck erhöhen</button></div>`).join('')}</div>`;root.appendChild(box);$('[data-pressure]',box).forEach(btn=>btn.onclick=()=>{const c=contracts.find(x=>x.id===btn.dataset.pressure);if(!c||p.actionPoints<1)return toast('Du brauchst 1 AP.');p.actionPoints--;c.income=Math.round(c.income*1.15);c.loyalty=clamp(c.loyalty-rand(7,14),20,100);p.heat=clamp(p.heat+rand(2,6),0,100);if(c.loyalty<35&&chance(.25)){p.protectionContracts=p.protectionContracts.filter(x=>x.id!==c.id);toast('Der Betrieb verweigert weitere Zahlungen.');}else toast('Zahlung erhöht – Widerstand wächst.');saveGame();closeDialog();renderAll();});}
  };

  function v44IntelAccuracy(p,did){
    const enemy=state.players.filter(x=>x.id!==p.id&&!x.eliminated).reduce((m,x)=>Math.max(m,roleSkill(x,'informant')*.55+(x.staffRoster||[]).filter(s=>s.specialty==='Gegenaufklärung').reduce((a,s)=>a+s.skill*.18,0)),0);
    const own=roleSkill(p,'informant')*.7+(p.scouting?.[did]?.level||1)*16;
    return clamp(.62+(own-enemy)/180,.45,.98);
  }
  const v44Scout=doScoutDistrict;
  doScoutDistrict=function(did){const p=currentPlayer(),before=p.scouting?.[did]?.round;v44Scout(did);const intel=p.scouting?.[did];if(intel&&intel.round!==before){intel.accuracy=v44IntelAccuracy(p,did);intel.falseSeed=rand(1,9999);saveGame();}};
  openDistrictIntel=function(did){
    const p=currentPlayer(),d=DISTRICTS.find(x=>x.id===did),intel=p.scouting?.[did];if(!intel)return toast('Dieses Viertel wurde noch nicht ausgekundschaftet.');
    const age=state.round-intel.round,level=intel.level,acc=Number(intel.accuracy)||v44IntelAccuracy(p,did),noisy=acc<.72;
    let seed=intel.falseSeed||13;const noise=(v)=>{seed=(seed*9301+49297)%233280;const r=seed/233280;return noisy?Math.max(0,Math.round(v*(.82+r*.36))):Math.round(v)};
    if(noisy)p.stats.misinformationSeen++;
    const rows=state.players.filter(x=>!x.eliminated).map(r=>{const sh=districtShare(r,did),biz=r.businesses.filter(b=>b.district===did);let detail=`Einfluss ${noise(sh)}%`;if(level>=2)detail+=` · ${noise(biz.length)} Betriebe${biz.length&&!noisy?`: ${biz.slice(0,4).map(b=>BUSINESSES[b.type].name).join(', ')}`:''}`;if(level>=3&&biz.length)detail+=` · Sicherheit ca. ${noise(biz.reduce((s,b)=>s+businessSecurity(r,b),0)/biz.length)}%`;return `<div class="intel-row"><strong>${esc(r.family)}${r.id===p.id?' (du)':''}</strong><span>${esc(detail)}</span></div>`;}).join('');
    const roi=Object.entries(BUSINESSES).map(([k,b])=>({k,b,roi:b.baseIncome*d.demand/b.cost})).sort((a,b)=>b.roi-a.roi).slice(0,3);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Aufklärung Stufe ${level}</p><h2>${esc(d.name)}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="intel-summary"><span>Intel Runde ${intel.round}${age>2?' · veraltet':''}</span><span>Zuverlässigkeit ${Math.round(acc*100)}%</span><span>${noisy?'⚠ Gegenaufklärung möglich':'✓ Daten konsistent'}</span><span>Neutral ca. ${noise(neutralShare(did))}%</span></div><div class="intel-list">${rows}</div><h3>Lukrative Möglichkeiten</h3><div class="dialog-list">${roi.map(x=>`<div class="dialog-option"><div><strong>${x.b.icon} ${esc(x.b.name)}</strong><p>Erwarteter Basisertrag ${fmt(x.b.baseIncome*d.demand)}/R · Einfluss ${x.b.influence}</p></div><button class="btn btn-primary" data-intel-buy="${x.k}">${fmt(x.b.cost)}</button></div>`).join('')}</div></div>`);
    $('[data-intel-buy]').forEach(b=>b.onclick=()=>{closeDialog();openBuyDialog(did,b.dataset.intelBuy);});
  };

  const v44End=processEndOfTurn;
  processEndOfTurn=function(p){
    v44EnsureState();v44EnsurePlayer(p);
    const owned=v44Owned(p),lease=p.businesses.filter(b=>!b.propertyId).reduce((s,b)=>s+(b.leaseCost||v44LeaseFor(b)),0);
    v44End(p);
    let rentIncome=0,tax=0;
    for(const lot of owned){
      rentIncome+=v44PropertyIncome(p,lot);tax+=v44PropertyTax(lot);
      lot.condition=clamp(lot.condition-rand(0,1),65,100);
      if(state.cityEvent?.id==='boom')lot.value=Math.round(lot.value*1.003);
      if(state.cityEvent?.id==='recession')lot.value=Math.round(lot.value*.997);
    }
    if(rentIncome){p.clean+=rentIncome;p.lastIncome+=rentIncome;ledger(p,'Immobilienerträge',rentIncome,'income');}
    const siteCosts=lease+tax;if(siteCosts){spend(p,siteCosts,true);p.lastExpenses+=siteCosts;ledger(p,'Mieten & Grundbesitz',-siteCosts,'expense');}
    let extraWash=0;
    for(const b of p.businesses){const path=v44Path(b);if(path&&path.launder>1){extraWash+=Math.round(BUSINESSES[b.type].launder*(path.launder-1)*(1+.12*((b.level||1)-1)));}if(path&&path.risk>1.1&&chance(.06*(path.risk-1))){p.heat=clamp(p.heat+2,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+1,0,100);}}
    const washed=Math.min(p.dirty,extraWash);if(washed){p.dirty-=washed;p.clean+=washed;p.lastLaundered+=washed;p.stats.launderedTotal=(p.stats.launderedTotal||0)+washed;ledger(p,'Spezialisierte Geldwäsche',washed,'clean');}
    const ub=p.staffRoster.find(s=>s.id===p.underbossId&&s.heldUntil<=state.round);
    if(ub){for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty+1,0,100);if(p.jailed>0&&chance(.12+ub.skill/600))p.jailed=Math.max(0,p.jailed-1);}
    if(!state.gameOver)checkVictory();saveGame();
  };

  function v44AiManage(p){
    v44EnsureState();v44EnsurePlayer(p);
    for(const b of p.businesses){
      if((b.level||1)>=2&&!b.specialization){const opts=PATHS[b.type]||[];if(opts.length){b.specialization=(p.profile==='economic'?opts.sort((a,b)=>b.income-a.income)[0]:p.profile==='defensive'?opts.sort((a,b)=>a.risk-b.risk)[0]:opts[rand(0,opts.length-1)]).id;}}
      if(b.type==='machines'&&b.machines&&p.clean>15000){for(const m of b.machines.filter(x=>x.condition<70).slice(0,1)){p.clean-=500;m.condition=clamp(m.condition+20,0,100);}}
    }
    if(netWorth(p)>350000&&p.clean>180000&&v44Owned(p).length<3&&chance(.14)){
      const focus=p.businesses.length?p.businesses[rand(0,p.businesses.length-1)].district:DISTRICTS[rand(0,DISTRICTS.length-1)].id;
      const lot=state.propertyMarket.filter(x=>!x.ownerId&&x.district===focus&&x.value<p.clean*.45).sort((a,b)=>a.value-b.value)[0];
      if(lot){p.clean-=lot.value;lot.ownerId=p.id;lot.acquiredRound=state.round;p.propertyIds.push(lot.id);p.stats.propertiesBought++;for(const b of p.businesses.filter(b=>b.district===lot.district&&!b.propertyId)){const need=Math.min(4,BUSINESSES[b.type].slotUse||1);if(v44FreeCapacity(lot)>=need){b.propertyId=lot.id;b.leaseCost=0;b.siteName=lot.name;}}}
    }
  }
  const v44Ai=aiTurn;
  aiTurn=function(p){v44AiManage(p);v44Ai(p);};

  const v44Create=createGame;
  createGame=function(){v44Create();if(state){v44EnsureState();saveGame();renderAll();}};

  const v44Migrate=migrateState;
  migrateState=function(data){data=v44Migrate(data);state=data;v44EnsureState();return data;};

  const v44City=renderCity;
  renderCity=function(){
    v44EnsureState();v44City();const p=currentPlayer(),detail=$('#districtDetail'),d=selectedDistrict;
    if(detail&&!detail.querySelector('[data-land]')){
      const owned=v44Owned(p).filter(x=>x.district===d),total=(state.propertyMarket||[]).filter(x=>x.district===d);
      detail.querySelector('.district-actions')?.insertAdjacentHTML('beforeend',`<button class="btn btn-secondary" data-land>Grundbesitz ${owned.length}/${total.length}</button>`);
      $('[data-land]',detail)?.addEventListener('click',()=>v44OpenPropertyMarket(d));
    }
  };

  const v44RenderBiz=renderBusinesses;
  renderBusinesses=function(){
    v44EnsureState();v44RenderBiz();const p=currentPlayer();
    const sum=$('#businessSummary');if(sum&&!sum.querySelector('[data-property-summary]'))sum.insertAdjacentHTML('beforeend',`<div class="metric-card" data-property-summary><small>Grundbesitz</small><strong>${v44Owned(p).length}</strong></div>`);
  };

  window.SyndikatEconomyDepth={openPropertyMarket:v44OpenPropertyMarket,paths:PATHS};
})();
/* SYNDIKAT_V44_ECONOMY_DEPTH_END */

/* SYNDIKAT_V51_VISUAL_STORY_BEGIN */
(function SYNDIKAT_V51_VISUAL_STORY(){
  const ASSETS={
    city:'./assets/city-map.webp',
    vittorio:'./assets/portrait-vittorio.webp',
    marco:'./assets/portrait-marco.webp',
    sofia:'./assets/portrait-sofia.webp',
    keller:'./assets/portrait-keller.webp',
    raid:'./assets/event-raid.webp',
    court:'./assets/event-court.webp',
    prison:'./assets/event-prison-break.webp',
    fallback:'./assets/start-user.webp'
  };

  const DISTRICT_VISUALS={
    harbor:{name:'Hafen',desc:'Docks, Lagerhallen und Schmuggelrouten. Viel Ware, wenig Fragen.',tag:[18,28],shape:'0,110 405,95 520,280 455,435 0,475'},
    industrial:{name:'Industrie',desc:'Fabriken, Werkhöfe und billige Flächen – ideal für Lager und diskrete Logistik.',tag:[45,19],shape:'395,35 915,30 1055,285 855,360 505,300'},
    redlight:{name:'Rotlicht',desc:'Neon, Clubs und diskrete Hinterzimmer. Hoher Umsatz, hohe Aufmerksamkeit.',tag:[67,24],shape:'915,70 1285,65 1405,305 1185,420 1000,325'},
    west:{name:'Nobelviertel',desc:'Villen, teure Hotels und vermögende Kundschaft. Prestige hat seinen Preis.',tag:[86,35],shape:'1305,90 1672,90 1672,515 1330,505 1160,390'},
    oldtown:{name:'Altstadt',desc:'Alte Bars, enge Gassen und loyale Stammkundschaft. Der klassische Einstieg.',tag:[15,67],shape:'0,455 500,390 665,645 465,815 0,805'},
    center:{name:'Zentrum',desc:'Banken, Hotels und Verwaltung. Wer hier Einfluss hat, wird in der ganzen Stadt gesehen.',tag:[54,54],shape:'510,310 1070,275 1245,560 1015,660 655,635'},
    station:{name:'Marktviertel',desc:'Bahnhof, Märkte und ständige Bewegung. Schnelles Geld wechselt hier schnell den Besitzer.',tag:[43,79],shape:'420,630 965,595 1115,900 520,941 345,790'},
    south:{name:'Vorstadt',desc:'Dichte Wohnstraßen, kleine Läden und viele mögliche Standorte für ein wachsendes Netz.',tag:[81,80],shape:'1060,535 1672,470 1672,941 1100,941 1015,675'}
  };

  for(const d of DISTRICTS){
    const v=DISTRICT_VISUALS[d.id];
    if(v){d.name=v.name;d.desc=v.desc;}
  }

  const STORY_V51=[
    {
      chapter:1,kicker:'Prolog',title:'Die erste Nacht',speaker:'Don Vittorio Leone',portrait:ASSETS.vittorio,image:ASSETS.city,
      desc:'Setze deinen ersten Fuß in die Stadt und eröffne einen Betrieb.',
      narrative:[
        'Regen liegt wie Öl auf dem Asphalt. In einem Hinterzimmer über einer geschlossenen Bar wartet Don Vittorio. Vor ihm: ein Stadtplan, ein Glas Whiskey und genau eine freie Ecke für deinen Namen.',
        '„Eine Stadt wird nicht mit Kugeln genommen“, sagt er. „Sie wird mit Rechnungen, Gefälligkeiten und Geduld gekauft. Fang klein an – aber fang an.“'
      ],
      done:p=>p.businesses.length>=1,reward:12000,rep:2
    },
    {
      chapter:2,kicker:'Kapitel II',title:'Geld auf der Straße',speaker:'Don Vittorio Leone',portrait:ASSETS.vittorio,image:ASSETS.fallback,
      desc:'Besitze zwei Betriebe und schließe zwei Straßenverbrechen erfolgreich ab.',
      narrative:[
        'Dein erster Laden bezahlt die Rechnungen, aber noch kennt niemand deinen Namen. Vittorio schickt dich dorthin, wo Ruf nicht gedruckt, sondern geflüstert wird: auf die Straße.',
        'Zwei erfolgreiche Coups reichen, damit Wirte die Tür offenhalten und kleine Händler anfangen, deinen Blick zu erwidern statt wegzusehen.'
      ],
      done:p=>p.businesses.length>=2&&(p.stats?.crimesSuccess||0)>=2,reward:18000,rep:3
    },
    {
      chapter:3,kicker:'Kapitel III',title:'Marco Bellini',speaker:'Marco Bellini',portrait:ASSETS.marco,image:ASSETS.marco,
      desc:'Baue ein Team aus mindestens drei Personen auf.',
      narrative:[
        'Marco Bellini wartet unter dem Vordach eines geschlossenen Kinos. Mantelkragen hoch, Blick ruhig. Er redet wenig – und genau deshalb hört man ihm zu.',
        '„Geschäfte brennen. Geld verschwindet. Menschen bleiben.“ Marco bietet an, deine Leute zu ordnen, solange du beweist, dass aus deiner Bande eine Familie werden kann.'
      ],
      done:p=>activeStaff(p).length>=3,reward:24000,rep:4,
      onClaim:p=>{
        if(!(p.staffRoster||[]).some(s=>s.name==='Marco Bellini')){
          const m=createStaffPerson('bodyguard');
          m.name='Marco Bellini';m.skill=Math.max(78,m.skill);m.loyalty=Math.max(88,m.loyalty);m.level=2;m.xp=35;
          p.staffRoster.push(m);syncStaffCounts(p);
          log(`${p.family}: Marco Bellini schließt sich der Organisation an.`);
        }
      }
    },
    {
      chapter:4,kicker:'Kapitel IV',title:'Morettis Angebot',speaker:'Sofia Moretti',portrait:ASSETS.sofia,image:ASSETS.sofia,
      desc:'Kundschafte zwei Viertel aus und erreiche mindestens 8 Ruf.',
      narrative:[
        'Sofia Moretti bestellt dich in einen Club, der offiziell geschlossen hat. Kein Leibwächter sitzt mit am Tisch. Das ist entweder Respekt – oder eine Drohung.',
        '„Wir müssen keine Freunde sein“, sagt sie. „Aber zwei Familien, die wissen, wo die Grenzen liegen, leben länger als zwei Familien, die jede Nacht neue ziehen.“'
      ],
      done:p=>Object.keys(p.scouting||{}).length>=2&&(p.reputation||0)>=8,reward:28000,rep:4,
      choices:[
        {id:'hand',label:'Die Hand reichen',text:'Beziehung zu Moretti deutlich verbessern und vier Runden Nichtangriff anstreben.',apply:p=>{
          const m=state.players.find(x=>x.id!==p.id&&String(x.family).toLowerCase().includes('moretti'));
          if(m){adjustRelation(p,m,22);p.pacts[m.id]=Math.max(p.pacts[m.id]||0,state.round+4);m.pacts[p.id]=Math.max(m.pacts[p.id]||0,state.round+4);}
          p.story.flags.moretti='pact';
        }},
        {id:'cold',label:'Distanz halten',text:'Kein Pakt. Dafür 10.000 $ zusätzliches schmutziges Kapital und etwas mehr Ruf.',apply:p=>{
          const m=state.players.find(x=>x.id!==p.id&&String(x.family).toLowerCase().includes('moretti'));
          if(m)adjustRelation(p,m,-10);
          p.dirty+=10000;p.reputation=clamp(p.reputation+2,0,100);p.story.flags.moretti='cold';
        }}
      ]
    },
    {
      chapter:5,kicker:'Kapitel V',title:'Kellers Akte',speaker:'Kommissar Ernst Keller',portrait:ASSETS.keller,image:ASSETS.raid,
      desc:'Halte Heat bei höchstens 45 und die Beweislage bei höchstens 40. Ein Anwalt oder Polizeikontakt hilft.',
      narrative:[
        'Kommissar Ernst Keller klebt Fotos an eine Wand, zieht rote Linien zwischen Namen und Konten und lässt deinen Familiennamen genau in der Mitte stehen.',
        'Du kannst die Akte nicht verschwinden lassen. Aber du kannst dafür sorgen, dass aus Vermutungen keine Anklage wird. Dafür brauchst du Disziplin – oder Kontakte.'
      ],
      done:p=>(p.heat||0)<=45&&(p.investigation?.evidence||0)<=40&&(p.staff?.lawyer>=1||p.bribes?.inspector||p.bribes?.officer),
      reward:32000,rep:5,
      choices:[
        {id:'legal',label:'Anwälte arbeiten lassen',text:'Beweislage um weitere 8 Punkte senken.',apply:p=>{if(p.investigation)p.investigation.evidence=clamp((p.investigation.evidence||0)-8,0,100);p.story.flags.keller='legal';}},
        {id:'quiet',label:'Kontakte warnen lassen',text:'Heat um weitere 8 senken, aber die Korruptionsakte wächst leicht.',apply:p=>{p.heat=clamp(p.heat-8,0,100);if(p.investigation)p.investigation.corruptionExposure=clamp((p.investigation.corruptionExposure||0)+4,0,100);p.story.flags.keller='contacts';}}
      ]
    },
    {
      chapter:6,kicker:'Kapitel VI',title:'Saubere Fassade',speaker:'Don Vittorio Leone',portrait:ASSETS.vittorio,image:ASSETS.fallback,
      desc:'Wasche insgesamt 50.000 $, besitze einen Betrieb ab Tier 2 und halte 100.000 $ sauberes Kapital.',
      narrative:[
        'Schmutziges Geld macht Eindruck auf der Straße. Sauberes Geld kauft Gebäude, Anwälte und Zeit. Vittorio verlangt eine Fassade, die selbst unter Tageslicht bestehen kann.',
        'Ein Betrieb mit echten Rechnungen, echtes Kapital auf dem Konto und genügend gewaschenes Geld: Erst dann beginnt dein Imperium, wie ein Unternehmen auszusehen.'
      ],
      done:p=>(p.stats?.launderedTotal||0)>=50000&&p.businesses.some(b=>(BUSINESSES[b.type].tier||1)>=2)&&p.clean>=100000,reward:55000,rep:6
    },
    {
      chapter:7,kicker:'Kapitel VII',title:'Eigener Boden',speaker:'Marco Bellini',portrait:ASSETS.marco,image:ASSETS.city,
      desc:'Kaufe mindestens eine Immobilie und betreibe darin einen eigenen Betrieb.',
      narrative:[
        'Miete ist eine Abhängigkeit. Marco legt dir drei Grundbücher auf den Tisch und tippt auf die Eigentümerzeile.',
        '„Wenn der Boden dir gehört, entscheidet kein Vermieter, wann du gehst.“ Dein nächster Schritt ist nicht größerer Umsatz – sondern Besitz, der bleibt.'
      ],
      done:p=>(p.propertyIds||[]).length>=1&&p.businesses.some(b=>!!b.propertyId),reward:70000,rep:6
    },
    {
      chapter:8,kicker:'Kapitel VIII',title:'Krieg um die Stadt',speaker:'Marco Bellini',portrait:ASSETS.marco,image:ASSETS.raid,
      desc:'Kontrolliere ein Viertel und gewinne mindestens eine geplante Operation.',
      narrative:[
        'Ein Viertel kippt nicht in einer Nacht. Erst wechseln Lieferanten die Seite, dann Türsteher, dann Wirte. Am Ende hängt dein Name an Entscheidungen, die niemand öffentlich getroffen hat.',
        'Der letzte Widerstand kommt von einer rivalisierenden Crew. Marco markiert drei Ziele. Diesmal reicht Geld nicht – du musst zeigen, dass deine Organisation handeln kann.'
      ],
      done:p=>controlledDistricts(p)>=1&&(p.stats?.operationsSuccess||0)>=1,reward:90000,rep:8
    },
    {
      chapter:9,kicker:'Kapitel IX',title:'Vor Gericht',speaker:'Kommissar Ernst Keller',portrait:ASSETS.keller,image:ASSETS.court,
      desc:'Überstehe ein Gerichtsverfahren – oder halte die Beweise bis Runde 25 so niedrig, dass Keller keine belastbare Anklage bekommt.',
      narrative:[
        'Marmor, Aktenordner, Blitzlicht. Zum ersten Mal wird nicht im Hinterzimmer über deinen Namen gesprochen, sondern vor einem Richter.',
        'Keller sitzt zwei Reihen hinter dem Staatsanwalt. Er lächelt nicht. Egal wie das Verfahren endet: Von heute an weiß die ganze Stadt, dass du groß genug bist, um angeklagt zu werden.'
      ],
      done:p=>(p.courtHistory?.length||0)>=1||(state.round>=25&&(p.investigation?.evidence||0)<20),reward:110000,rep:8,
      choices:[
        {id:'defiant',label:'Stärke demonstrieren',text:'Mehr Ruf, aber leicht mehr Heat.',apply:p=>{p.reputation=clamp(p.reputation+4,0,100);p.heat=clamp(p.heat+3,0,100);p.story.flags.court='defiant';}},
        {id:'silent',label:'Schweigen und weiterarbeiten',text:'Die Beweislage sinkt leicht, dafür kein zusätzlicher Ruf.',apply:p=>{if(p.investigation)p.investigation.evidence=clamp((p.investigation.evidence||0)-5,0,100);p.story.flags.court='silent';}}
      ]
    },
    {
      chapter:10,kicker:'Kapitel X',title:'Drei Familien am Tisch',speaker:'Sofia Moretti',portrait:ASSETS.sofia,image:ASSETS.sofia,
      desc:'Erreiche mindestens 20 Ruf und halte einen aktiven Pakt oder ein Bündnis mit einer anderen Familie.',
      narrative:[
        'Im Obergeschoss eines Restaurants stehen drei Teller auf dem Tisch und vier bewaffnete Männer vor der Tür. Sofia hat die Sitzordnung festgelegt. Niemand sitzt mit dem Rücken zum Fenster.',
        'Jetzt geht es nicht mehr darum, ob du zur Stadt gehörst. Es geht darum, ob die anderen Familien akzeptieren, dass wichtige Entscheidungen ohne dich nicht mehr möglich sind.'
      ],
      done:p=>(p.reputation||0)>=20&&state.players.some(x=>x.id!==p.id&&!x.eliminated&&(pactActive(p,x)||allianceActive(p,x))),reward:140000,rep:9
    },
    {
      chapter:11,kicker:'Kapitel XI',title:'Die Stadt gehört uns',speaker:'Don Vittorio Leone',portrait:ASSETS.vittorio,image:ASSETS.city,
      desc:'Kontrolliere zwei Viertel und erreiche mindestens 45 Macht.',
      narrative:[
        'Auf der Karte sind neutrale Flächen selten geworden. Lieferwege, Immobilien, Schutzgeld, Politik – alles greift ineinander.',
        'Vittorio schiebt dir den Stadtplan hin. „Früher hast du gefragt, wo du Geschäfte machen darfst. Jetzt fragen andere dich.“'
      ],
      done:p=>controlledDistricts(p)>=2&&powerIndex(p)>=45,reward:175000,rep:10
    },
    {
      chapter:12,kicker:'Finale',title:'Das Syndikat',speaker:'Don Vittorio Leone',portrait:ASSETS.vittorio,image:ASSETS.fallback,
      desc:'Erreiche 5 Mio. Nettovermögen, kontrolliere drei Viertel, mindestens 62 Macht und überstehe die Endgame-Krise.',
      narrative:[
        'Die Stadt ist dieselbe geblieben: dieselben Straßen, derselbe Regen, dieselben Sirenen. Nur die Gespräche haben sich verändert. Dein Name fällt jetzt, bevor Entscheidungen getroffen werden.',
        'Vittorio hebt sein Glas. „Ein Boss besitzt Geschäfte. Ein Syndikat besitzt Möglichkeiten.“ Draußen geht das Licht in der Stadt an – Viertel für Viertel.'
      ],
      done:p=>netWorth(p)>=5000000&&controlledDistricts(p)>=3&&powerIndex(p)>=62&&p.finalCrisis?.resolved,reward:300000,rep:15
    }
  ];

  function ensureStoryV51(p){
    p.story=p.story||{chapter:1,claimed:[]};
    p.story.claimed=Array.isArray(p.story.claimed)?p.story.claimed:[];
    p.story.flags=p.story.flags||{};
    p.story.archive=Array.isArray(p.story.archive)?p.story.archive:[];
    if(p.story.version!==51){
      const old=Math.max(1,Number(p.story.chapter)||1);
      p.story.chapter=old>=6?6:Math.min(old,5);
      p.story.version=51;
    }
  }
  function currentStory(p){ensureStoryV51(p);return STORY_V51.find(x=>x.chapter===p.story.chapter)||null;}
  function storyDone(ch,p){try{return !!ch.done(p)}catch{return false}}
  function storyChoiceApply(p,ch,choiceId){
    const c=(ch.choices||[]).find(x=>x.id===choiceId);
    if(c?.apply)c.apply(p);
    return c;
  }
  function finalizeStory(p,ch,choiceId=null){
    if(!storyDone(ch,p))return toast('Kapitelziel noch nicht erfüllt.');
    if(p.story.claimed.includes(ch.chapter))return;
    if(ch.choices?.length&&!choiceId)return;
    const choice=choiceId?storyChoiceApply(p,ch,choiceId):null;
    if(ch.onClaim)ch.onClaim(p);
    p.story.claimed.push(ch.chapter);
    p.story.archive.unshift({chapter:ch.chapter,title:ch.title,speaker:ch.speaker,choice:choice?.label||null,round:state.round});
    p.clean+=ch.reward;p.reputation=clamp((p.reputation||0)+ch.rep,0,100);
    ledger(p,`Story: ${ch.title}`,ch.reward,'income');
    log(`${p.family}: Storykapitel „${ch.title}“ abgeschlossen.`);
    p.story.chapter=Math.min(STORY_V51.length+1,ch.chapter+1);
    closeDialog();saveGame();renderAll();toast(`${ch.title}: +${fmt(ch.reward)} · +${ch.rep} Ruf`);
  }
  function openStoryScene(ch){
    const p=currentPlayer();ensureStoryV51(p);
    const narrative=ch.narrative.map(t=>`<p>${esc(t)}</p>`).join('');
    const choices=ch.choices?.length
      ? `<div class="story-choice-list">${ch.choices.map(c=>`<button class="story-choice" data-story-choice="${c.id}"><strong>${esc(c.label)}</strong><span>${esc(c.text)}</span></button>`).join('')}</div>`
      : `<div class="dialog-footer"><button class="btn btn-primary" data-story-finish>Kapitel abschließen · ${fmt(ch.reward)}</button></div>`;
    openDialog(`<div class="dialog-wrap story-scene"><div class="dialog-head"><div><p class="eyebrow">${esc(ch.kicker)}</p><h2>${esc(ch.title)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="story-scene-hero"><img src="${ch.image}" alt="" loading="eager"><div class="story-scene-shade"></div><div class="story-speaker"><img src="${ch.portrait}" alt=""><div><small>${esc(ch.speaker)}</small><strong>${esc(ch.title)}</strong></div></div></div>
      <div class="story-prose">${narrative}</div>
      ${ch.choices?.length?'<p class="muted">Diese Entscheidung wird in deiner Storychronik gespeichert.</p>':''}${choices}</div>`);
    $('[data-story-finish]')?.addEventListener('click',()=>finalizeStory(p,ch));
    $('[data-story-choice]').forEach(b=>b.onclick=()=>finalizeStory(p,ch,b.dataset.storyChoice));
  }
  function openStoryArchive(){
    const p=currentPlayer();ensureStoryV51(p);
    const rows=p.story.archive.length?p.story.archive.map(a=>{
      const ch=STORY_V51.find(x=>x.chapter===a.chapter);
      return `<div class="dialog-option story-archive-row"><img src="${ch?.portrait||ASSETS.vittorio}" alt=""><div><strong>${esc(ch?.kicker||'Kapitel')} · ${esc(a.title)}</strong><p>Runde ${a.round}${a.choice?` · Entscheidung: ${esc(a.choice)}`:''}</p></div></div>`;
    }).join(''):'<div class="empty-state">Noch kein Storykapitel abgeschlossen.</div>';
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Chronik</p><h2>Deine Geschichte</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${rows}</div></div>`);
  }

  const previousRenderMissions=renderMissions;
  renderMissions=function(){
    previousRenderMissions();
    const p=currentPlayer();ensureStoryV51(p);const el=$('#missionList');if(!el)return;
    el.querySelectorAll('.story-card').forEach(x=>x.remove());
    const ch=currentStory(p);
    if(!ch){
      el.insertAdjacentHTML('afterbegin',`<article class="mission-card panel story-v51-card story-complete"><img class="story-card-image" src="${ASSETS.city}" alt=""><div class="story-card-copy"><p class="eyebrow">Storykampagne · 12/12</p><h3>Die Stadt kennt deinen Namen</h3><p>Alle zwölf Kapitel sind abgeschlossen. Deine Entscheidungen bleiben in der Chronik erhalten.</p><footer><button class="btn btn-secondary" data-story-archive>Kapitelarchiv</button></footer></div></article>`);
      $('[data-story-archive]',el)?.addEventListener('click',openStoryArchive);return;
    }
    const done=storyDone(ch,p);
    el.insertAdjacentHTML('afterbegin',`<article class="mission-card panel story-v51-card"><img class="story-card-image" src="${ch.image}" alt=""><div class="story-card-copy"><div class="story-character-mini"><img src="${ch.portrait}" alt=""><span><small>${esc(ch.speaker)}</small><strong>${esc(ch.kicker)} · ${ch.chapter}/${STORY_V51.length}</strong></span></div><h3>${esc(ch.title)}</h3><p>${esc(ch.desc)}</p><div class="mission-progress"><div class="progress"><i style="width:${done?100:12}%"></i></div><small>${done?'Kapitelziel erfüllt – Szene verfügbar':'Kapitelziel noch offen'}</small></div><footer><span>${fmt(ch.reward)} + ${ch.rep} Ruf</span><div class="mini-actions"><button class="btn btn-secondary" data-story-archive>Chronik</button><button class="btn ${done?'btn-primary':'btn-secondary'}" data-story-scene ${done?'':'disabled'}>${done?'Szene spielen':'Ziel offen'}</button></div></footer></div></article>`);
    $('[data-story-scene]',el)?.addEventListener('click',()=>openStoryScene(ch));
    $('[data-story-archive]',el)?.addEventListener('click',openStoryArchive);
  };

  function staffPortrait(s){
    const n=String(s?.name||'').toLowerCase();
    if(n.includes('marco bellini'))return ASSETS.marco;
    if(n.includes('sofia')||n.includes('moretti'))return ASSETS.sofia;
    return null;
  }
  function initials(name){return String(name||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
  const previousRenderStaff=renderStaff;
  renderStaff=function(){
    previousRenderStaff();const p=currentPlayer();
    $('#staffGrid [data-staff-person]').forEach(btn=>{
      const s=p.staffRoster.find(x=>x.id===btn.dataset.staffPerson),card=btn.closest('.person-card');if(!s||!card)return;
      const top=card.querySelector('.shop-top');if(!top||top.querySelector('.person-portrait,.person-initial-avatar'))return;
      const img=staffPortrait(s);
      top.insertAdjacentHTML('afterbegin',img?`<img class="person-portrait" src="${img}" alt="">`:`<div class="person-initial-avatar">${esc(initials(s.name))}</div>`);
      card.classList.add('visual-person-card');
    });
  };
  const previousOpenStaffPerson=openStaffPerson;
  openStaffPerson=function(id){
    const p=currentPlayer(),s=p.staffRoster.find(x=>x.id===id);previousOpenStaffPerson(id);if(!s)return;
    const root=$('#dialogContent .dialog-wrap'),img=staffPortrait(s);if(!root)return;
    const head=root.querySelector('.dialog-head');
    if(head)head.insertAdjacentHTML('afterend',img?`<img class="dialog-person-hero" src="${img}" alt="">`:`<div class="dialog-person-initial">${esc(initials(s.name))}</div>`);
  };

  const previousRenderCorruption=renderCorruption;
  renderCorruption=function(){
    previousRenderCorruption();
    const btn=$('#corruptionGrid [data-bribe="inspector"]'),card=btn?.closest('.shop-card');
    if(card&&!card.querySelector('.contact-portrait')){
      card.insertAdjacentHTML('afterbegin',`<img class="contact-portrait" src="${ASSETS.keller}" alt="">`);
    }
  };

  const HOTSPOTS=Object.fromEntries(Object.entries(DISTRICT_VISUALS).map(([id,v])=>[id,v.shape]));
  function eventVisual(){
    const p=currentPlayer(),ev=state?.cityEvent;
    let img=null,title=null,text=null;
    if(ev){
      img=ev.id==='crackdown'||ev.id==='gangwar'?ASSETS.raid:ev.id==='fair'?ASSETS.city:ASSETS.fallback;
      title=ev.name;text=ev.desc;
    }else if(String(p?.eventText||'').toLowerCase().includes('razzia')){
      img=ASSETS.raid;title='Polizeieinsatz';text=p.eventText;
    }
    if(!img)return '';
    return `<div class="event-feature"><img src="${img}" alt=""><div><small>Aktuelle Lage</small><strong>${esc(title)}</strong><span>${esc(text||'')}</span></div></div>`;
  }

  const previousRenderCity=renderCity;
  renderCity=function(){
    previousRenderCity();
    const p=currentPlayer(),grid=$('#districtGrid');if(!grid)return;
    grid.classList.add('city-art-stage');
    grid.innerHTML=`<div class="city-map-scroll"><div class="city-art-map"><img src="${ASSETS.city}" alt="Nächtliche Stadtkarte von Syndikat">
      <svg class="city-hotspots" viewBox="0 0 1672 941" aria-label="Anklickbare Stadtviertel">${DISTRICTS.map(d=>`<polygon tabindex="0" role="button" aria-label="${esc(d.name)}" class="city-hotspot ${selectedDistrict===d.id?'selected':''}" data-map-district="${d.id}" points="${HOTSPOTS[d.id]}" style="--district-accent:${d.accent}"></polygon>`).join('')}</svg>
      ${DISTRICTS.map(d=>{const v=DISTRICT_VISUALS[d.id],share=Math.round(districtShare(p,d.id)),owner=districtOwner(d.id);return `<button class="city-map-tag ${selectedDistrict===d.id?'selected':''}" data-map-district="${d.id}" style="left:${v.tag[0]}%;top:${v.tag[1]}%;--district-accent:${d.accent}"><strong>${esc(d.name)}</strong><span>${share}% · ${esc(owner.player?owner.player.family:'Neutral')}</span></button>`;}).join('')}
    </div></div>`;
    $('[data-map-district]',grid).forEach(el=>{
      const open=()=>{selectedDistrict=el.dataset.mapDistrict;renderCity();};
      el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
    });
    const list=$('#situationList'),visual=eventVisual();if(list&&visual)list.insertAdjacentHTML('afterbegin',visual);
  };

  const previousCreate=createGame;
  createGame=function(){previousCreate();if(state){state.players.forEach(ensureStoryV51);saveGame();renderAll();}};
  const previousMigrate=migrateState;
  migrateState=function(data){data=previousMigrate(data);(data.players||[]).forEach(ensureStoryV51);return data;};

  window.SyndikatVisualStory={assets:ASSETS,story:STORY_V51,openArchive:openStoryArchive};
})();
/* SYNDIKAT_V51_VISUAL_STORY_END */

/* SYNDIKAT_V52_WORLD_DEPTH_BEGIN */
(function SYNDIKAT_V52_WORLD_DEPTH(){
  const A='./assets/';
  const BUSINESS_ART=Object.fromEntries(Object.keys(BUSINESSES).map(k=>[k,A+'business-'+k+'.svg']));
  const DISTRICT_ART=Object.fromEntries(DISTRICTS.map(d=>[d.id,A+'district-'+d.id+'.svg']));
  const STAFF_ART={informant:A+'staff-informant.svg',guard:A+'staff-guard.svg',bodyguard:A+'staff-bodyguard.svg',gunman:A+'staff-gunman.svg',lawyer:A+'staff-lawyer.svg',manager:A+'staff-manager.svg'};
  const PERSON_ART={
    'Marco Bellini':A+'portrait-marco.webp',
    'Julia Costa':A+'person-julia-costa.svg','Vito Serra':A+'person-vito-serra.svg','Mara Conti':A+'person-mara-conti.svg',
    'Enzo Vitale':A+'person-enzo-vitale.svg','Giulia Rizzo':A+'person-giulia-rizzo.svg','Luca Ferraro':A+'person-luca-ferraro.svg',
    'Sofia Greco':A+'person-sofia-greco.svg','Carlo De Luca':A+'person-carlo-de-luca.svg','Elena Marino':A+'person-elena-marino.svg',
    'Nico Romano':A+'person-nico-romano.svg','Tessa Bianchi':A+'person-tessa-bianchi.svg','Rico Falcone':A+'person-rico-falcone.svg',
    'Valentina Moretti':A+'person-valentina-moretti.svg','Dario Russo':A+'person-dario-russo.svg','Mina Leone':A+'person-mina-leone.svg'
  };
  const CONTACT_ART={officer:A+'contact-officer.svg',inspector:A+'contact-inspector.svg',judge:A+'contact-judge.svg',prosecutor:A+'contact-prosecutor.svg',mayor:A+'contact-mayor.svg'};
  const PROPERTY_ART={shop:A+'property-shop.svg',block:A+'property-block.svg',warehouse:A+'property-warehouse.svg',prime:A+'property-prime.svg'};
  const RIVAL_INFO={
    Romano:{boss:'Don Enzo Romano',art:A+'rival-romano.svg',motto:'Respekt wird genommen.',style:'Druck & Tempo',desc:'Romano wächst schnell und setzt Rivalen früh unter Druck.'},
    Moretti:{boss:'Sofia Moretti',art:A+'rival-moretti.svg',motto:'Jeder Konflikt hat einen Preis.',style:'Ökonomie & Diplomatie',desc:'Moretti bevorzugt profitable Geschäfte, Verträge und kontrollierte Expansion.'},
    Costa:{boss:'Alessandro Costa',art:A+'rival-costa.svg',motto:'Der richtige Anruf ist mehr wert als zehn Männer.',style:'Einfluss',desc:'Costa baut politische Kontakte auf und reduziert Ermittlungsdruck über Beziehungen.'},
    Bianchi:{boss:'Lucia Bianchi',art:A+'rival-bianchi.svg',motto:'Ware bewegt Macht.',style:'Logistik',desc:'Bianchi liebt Hafen, Routen und hohe Bargeldströme.'},
    Russo:{boss:'Salvatore Russo',art:A+'rival-russo.svg',motto:'Die Stadt spielt. Ich halte die Bank.',style:'Glücksspiel',desc:'Russo konzentriert sich auf Automaten, Wettbüros, Spielhallen und Casinos.'},
    Conti:{boss:'Vincenzo Conti',art:A+'rival-conti.svg',motto:'Wer lange genug steht, gewinnt.',style:'Sicherheit',desc:'Conti investiert in Personal und widerstandsfähige Betriebe.'},
    Falcone:{boss:'Isabella Falcone',art:A+'rival-falcone.svg',motto:'Boden vergisst keine Namen.',style:'Expansion',desc:'Falcone kauft Immobilien und baut Viertel systematisch zu Einflusszonen aus.'}
  };
  const OP_ART={sabotage:A+'op-sabotage.svg',kidnap:A+'op-kidnap.svg',hit:A+'op-hit.svg',bank:A+'op-bank.svg'};
  const ITEM_ART={pistol:A+'item-pistol.svg',shotgun:A+'item-shotgun.svg',tommy:A+'item-tommy.svg',sedan:A+'item-sedan.svg',coupe:A+'item-coupe.svg',van:A+'item-van.svg',armored:A+'item-armored.svg',masks:A+'item-masks.svg',radios:A+'item-radios.svg',armor:A+'item-armor.svg',tools:A+'item-tools.svg'};
  const EVENT_ART={crackdown:A+'event-raid.webp',boom:A+'event-boom.svg',gangwar:A+'event-gangwar.svg',fair:A+'event-fair.svg',recession:A+'event-recession.svg',betrayal:A+'event-betrayal.svg',press:A+'event-press.svg',informant:A+'event-informant.svg',corruption:A+'event-corruption.svg',fire:A+'event-fire.svg',union:A+'event-union.svg'};
  const POS={harbor:[18,28],industrial:[45,19],redlight:[67,24],west:[86,35],oldtown:[15,67],center:[54,54],station:[43,79],south:[81,80]};
  let mapMode='normal';

  function ensureDepth(p){
    p.rivalMemory=p.rivalMemory||{grudges:{},favors:{},encounters:{}};
    p.jointVentures=p.jointVentures||{};
    p.story=p.story||{chapter:1,claimed:[],flags:{},archive:[]};p.story.flags=p.story.flags||{};
    p.stats=p.stats||{};for(const k of ['secretDeals','territorySwaps','deepEvents'])p.stats[k]=Number(p.stats[k])||0;
  }
  function rivalInfo(p){return RIVAL_INFO[p?.family]||null}
  function rivalPortrait(p){return rivalInfo(p)?.art||A+'portrait-vittorio.webp'}
  function districtBusinessCount(p,did){return p.businesses.filter(b=>b.district===did).length}
  function districtIncome(p,did){return Math.round(p.businesses.filter(b=>b.district===did).reduce((s,b)=>s+estimateIncome(p,b),0))}
  function districtTopRival(p,did){return state.players.filter(x=>x.id!==p.id&&!x.eliminated).map(x=>({p:x,s:districtShare(x,did)})).sort((a,b)=>b.s-a.s)[0]||null}

  const oldRel=adjustRelation;
  adjustRelation=function(a,b,d){ensureDepth(a);ensureDepth(b);oldRel(a,b,d);if(d<0){a.rivalMemory.grudges[b.id]=(a.rivalMemory.grudges[b.id]||0)+Math.abs(d);b.rivalMemory.grudges[a.id]=(b.rivalMemory.grudges[a.id]||0)+Math.abs(d);}if(d>0){a.rivalMemory.favors[b.id]=(a.rivalMemory.favors[b.id]||0)+d;b.rivalMemory.favors[a.id]=(b.rivalMemory.favors[a.id]||0)+d;}a.rivalMemory.encounters[b.id]=state?.round||0;b.rivalMemory.encounters[a.id]=state?.round||0;};

  const oldIncome=estimateIncome;
  estimateIncome=function(p,b){let v=oldIncome(p,b);if(p.family==='Moretti')v*=1.06;if(p.family==='Russo'&&['machines','betting','arcade','casino'].includes(b.type))v*=1.10;if(p.family==='Bianchi'&&['machines','bar','club'].includes(b.type))v*=1.05;if(p.family==='Falcone'&&b.propertyId)v*=1.07;const ventures=Object.values(p.jointVentures||{}).filter(until=>until>=state.round).length;if(ventures)v*=1+Math.min(.08,ventures*.025);return v*(1+(p.permanentIncomeBonus||0));};
  const oldSecurity=businessSecurity;
  businessSecurity=function(p,b){let v=oldSecurity(p,b);if(p.family==='Conti')v+=8;return clamp(v,0,98);};
  const oldShield=shield;
  shield=function(p){let v=oldShield(p);if(p.family==='Costa')v+=8;return Math.min(72,v);};

  function overlayText(p,d){
    if(mapMode==='ownership')return `${districtBusinessCount(p,d.id)} Betriebe · ${(state.propertyMarket||[]).filter(x=>x.ownerId===p.id&&x.district===d.id).length} Grundstücke`;
    if(mapMode==='police')return `Polizeidruck ${Math.round(d.police*100)}%`;
    if(mapMode==='income')return `${fmt(districtIncome(p,d.id))}/R`;
    if(mapMode==='rivals'){const r=districtTopRival(p,d.id);return r&&r.s>1?`${r.p.family} ${Math.round(r.s)}%`:'Keine starke Rivalen';}
    const own=districtOwner(d.id);return `${Math.round(districtShare(p,d.id))}% · ${own.player?own.player.family:'Neutral'}`;
  }
  function mapMarkers(p){return DISTRICTS.map(d=>{const [x,y]=POS[d.id],biz=districtBusinessCount(p,d.id),props=(state.propertyMarket||[]).filter(l=>l.ownerId===p.id&&l.district===d.id).length,r=districtTopRival(p,d.id);const rival=mapMode==='rivals'&&r&&r.s>5?`<span class="map-marker rival" style="left:${x+4}%;top:${y+7}%">♛ ${esc(r.p.family)}</span>`:'';const mine=biz||props?`<span class="map-marker mine" style="left:${x-4}%;top:${y+7}%">▣ ${biz}${props?' · ⌂ '+props:''}</span>`:'';return mine+rival;}).join('')}
  function decorateMap(){
    const p=currentPlayer(),grid=$('#districtGrid'),map=grid?.querySelector('.city-art-map');if(!grid||!map)return;
    let bar=$('#cityOverlayBar');if(!bar){grid.insertAdjacentHTML('beforebegin',`<div id="cityOverlayBar" class="map-mode-bar">${[['normal','Übersicht'],['ownership','Besitz'],['police','Polizei'],['income','Einkommen'],['rivals','Rivalen']].map(([id,n])=>`<button class="map-mode ${mapMode===id?'active':''}" data-map-mode="${id}">${n}</button>`).join('')}</div>`);bar=$('#cityOverlayBar');$('[data-map-mode]',bar).forEach(b=>b.onclick=()=>{mapMode=b.dataset.mapMode;renderCity();});}else $('[data-map-mode]',bar).forEach(b=>b.classList.toggle('active',b.dataset.mapMode===mapMode));
    $('.city-map-tag',map).forEach(tag=>{const d=DISTRICTS.find(x=>x.id===tag.dataset.mapDistrict),span=tag.querySelector('span');if(d&&span)span.textContent=overlayText(p,d);});
    map.querySelectorAll('.map-marker').forEach(x=>x.remove());map.insertAdjacentHTML('beforeend',mapMarkers(p));
    const d=DISTRICTS.find(x=>x.id===selectedDistrict),detail=$('#districtDetail');if(d&&detail&&!detail.querySelector('.district-visual'))detail.insertAdjacentHTML('afterbegin',`<div class="district-visual"><img src="${DISTRICT_ART[d.id]}" alt=""><div><strong>${esc(d.name)}</strong><span>${esc(d.desc)}</span></div></div>`);
  }
  const oldCity=renderCity;renderCity=function(){oldCity();decorateMap();decorateEvent();};

  function decorateEvent(){const p=currentPlayer(),list=$('#situationList');if(!list||list.querySelector('.deep-event-card'))return;const ev=p.deepEvent||state?.cityEvent;if(!ev)return;const art=EVENT_ART[ev.id]||A+'event-press.svg';list.insertAdjacentHTML('afterbegin',`<div class="deep-event-card"><img src="${art}" alt=""><div><small>Stadtgeschehen</small><strong>${esc(ev.name||p.eventText||'Ereignis')}</strong><span>${esc(ev.desc||ev.text||'Die Lage verändert sich.')}</span></div></div>`);}

  const oldBiz=renderBusinesses;
  renderBusinesses=function(){oldBiz();const p=currentPlayer();$('#businessList .business-card').forEach((card,i)=>{const b=p.businesses[i];if(b&&!card.querySelector('.business-thumb'))card.insertAdjacentHTML('afterbegin',`<img class="business-thumb" src="${BUSINESS_ART[b.type]}" alt="">`);});};
  const oldBuy=openBuyDialog;
  openBuyDialog=function(did=selectedDistrict,focus=null){oldBuy(did,focus);$('#dialogContent .dialog-option [data-buy]').forEach(btn=>{const row=btn.closest('.dialog-option'),type=btn.dataset.buy;if(row&&!row.querySelector('.business-buy-thumb'))row.insertAdjacentHTML('afterbegin',`<img class="business-buy-thumb" src="${BUSINESS_ART[type]}" alt="">`);});};
  const oldBizDialog=openBusinessDialog;
  openBusinessDialog=function(id){const p=currentPlayer(),b=p.businesses.find(x=>x.id===id);oldBizDialog(id);const root=$('#dialogContent .dialog-wrap');if(b&&root&&!root.querySelector('.business-detail-art'))root.querySelector('.dialog-head')?.insertAdjacentHTML('afterend',`<img class="business-detail-art" src="${BUSINESS_ART[b.type]}" alt="">`);};

  function staffVisual(s){return PERSON_ART[s?.name]||STAFF_ART[s?.role]||A+'staff-manager.svg'}
  const oldStaff=renderStaff;
  renderStaff=function(){
    oldStaff();const p=currentPlayer();
    $('#staffGrid [data-staff-person]').forEach(btn=>{
      const person=p.staffRoster.find(x=>x.id===btn.dataset.staffPerson),card=btn.closest('.person-card');if(!person||!card)return;
      const img=card.querySelector('.person-portrait'),initial=card.querySelector('.person-initial-avatar'),src=staffVisual(person);
      if(img)img.src=src;else if(initial)initial.outerHTML=`<img class="person-portrait role-portrait" src="${src}" alt="">`;
    });
  };
  const oldPerson=openStaffPerson;
  openStaffPerson=function(id){
    const p=currentPlayer(),person=p.staffRoster.find(x=>x.id===id);oldPerson(id);if(!person)return;
    const root=$('#dialogContent .dialog-wrap'),src=staffVisual(person),img=root?.querySelector('.dialog-person-hero'),initial=root?.querySelector('.dialog-person-initial');
    if(img)img.src=src;else if(initial)initial.outerHTML=`<img class="dialog-person-hero" src="${src}" alt="">`;
  };

  const oldCorruption=renderCorruption;
  renderCorruption=function(){
    oldCorruption();
    for(const [key,src] of Object.entries(CONTACT_ART)){
      const card=$('#corruptionGrid [data-bribe="'+key+'"]')?.closest('.shop-card');if(!card)continue;
      let img=card.querySelector('.contact-portrait');if(img)img.src=src;else card.insertAdjacentHTML('afterbegin',`<img class="contact-portrait" src="${src}" alt="">`);
    }
  };

  function decoratePropertyMarket(){
    const root=$('#dialogContent');if(!root)return;
    const kinds={Ladenlokal:'shop','Wohn- & Geschäftshaus':'block','Lagerhalle':'warehouse','Premium-Grundstück':'prime'};
    $('.dialog-option',root).forEach(row=>{
      if(row.querySelector('.property-thumb'))return;
      const txt=row.textContent||'';for(const [label,id] of Object.entries(kinds))if(txt.includes(label)){row.insertAdjacentHTML('afterbegin',`<img class="property-thumb" src="${PROPERTY_ART[id]}" alt="">`);break;}
    });
  }
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-land],[data-buy-land],[data-assign-land],[data-sell-land]'))setTimeout(decoratePropertyMarket,35);});

  function openRivalProfile(pid){
    const p=currentPlayer(),r=state.players.find(x=>x.id===pid);if(!r)return;ensureDepth(p);ensureDepth(r);const info=rivalInfo(r),gr=p.rivalMemory.grudges[r.id]||0,fav=p.rivalMemory.favors[r.id]||0;
    openDialog(`<div class="dialog-wrap rival-profile"><div class="dialog-head"><div><p class="eyebrow">Rivalenakte</p><h2>${esc(r.family)}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="rival-hero"><img src="${rivalPortrait(r)}" alt=""><div><small>${esc(info?.style||r.profile)}</small><h3>${esc(info?.boss||r.family)}</h3><p>${esc(info?.desc||'Rivalisierende Familie')}</p><blockquote>${esc(info?.motto||'')}</blockquote></div></div><div class="finance-grid">${metricCards([['Beziehung',relation(p,r),relation(p,r)>=20?'positive':relation(p,r)<0?'negative':''],['Macht',pct(powerIndex(r)),''],['Vermögen',fmt(netWorth(r)),''],['Groll',Math.round(gr),'negative'],['Gefallen',Math.round(fav),'positive'],['Viertel',controlledDistricts(r),'']])}</div><div class="dialog-footer"><button class="btn btn-primary" data-deep-diplomacy="${r.id}">Verhandeln</button></div></div>`);
    $('[data-deep-diplomacy]')?.addEventListener('click',()=>openDeepDiplomacy(r.id));
  }
  const oldRanking=renderRanking;
  renderRanking=function(){oldRanking();const sorted=[...state.players].sort((a,b)=>powerIndex(b)-powerIndex(a));$('#rankingList .rank-row').forEach((row,i)=>{const r=sorted[i];if(!r||row.querySelector('.rival-rank-portrait'))return;row.insertAdjacentHTML('afterbegin',`<img class="rival-rank-portrait" src="${rivalPortrait(r)}" alt="">`);if(r.id!==currentPlayer().id){row.classList.add('clickable-rival');row.onclick=()=>openRivalProfile(r.id);}});};

  function deepAccept(p,t,base){if(t.type==='human')return confirm(`${t.family}: Angebot annehmen?`);let v=base+relation(p,t)/220-(t.rivalMemory?.grudges?.[p.id]||0)/600;if(t.family==='Moretti')v+=.08;return chance(clamp(v,.08,.9))}
  function openDeepDiplomacy(tid){
    const p=currentPlayer(),t=state.players.find(x=>x.id===tid);if(!t)return;ensureDepth(p);ensureDepth(t);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Geheime Diplomatie</p><h2>${esc(t.family)}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="rival-mini"><img src="${rivalPortrait(t)}" alt=""><div><strong>${esc(rivalInfo(t)?.boss||t.family)}</strong><span>Beziehung ${relation(p,t)} · Groll ${Math.round(t.rivalMemory.grudges[p.id]||0)}</span></div></div><div class="dialog-list">
      <div class="dialog-option"><div><strong>Tribut für Ruhe</strong><p>20.000 $ zahlen und einen vier Runden langen Nichtangriffspakt anbieten.</p></div><button class="btn btn-secondary" data-dd="tribute">Anbieten</button></div>
      <div class="dialog-option"><div><strong>Geheimes Gemeinschaftsgeschäft</strong><p>15.000 $ investieren. Bei Annahme erhalten beide Familien sechs Runden lang einen Einkommensbonus.</p></div><button class="btn btn-secondary" data-dd="venture">Vorschlagen</button></div>
      <div class="dialog-option"><div><strong>Gebietstausch</strong><p>Einen Betrieb gegen einen Rivalenbetrieb tauschen.</p></div><button class="btn btn-secondary" data-dd="swap">Tausch öffnen</button></div>
      <div class="dialog-option"><div><strong>Abkommen brechen</strong><p>Pakte und Bündnisse sofort beenden. Ruf und Beziehung leiden dauerhaft.</p></div><button class="btn btn-danger" data-dd="betray">Verraten</button></div>
    </div></div>`);
    $('[data-dd]').forEach(b=>b.onclick=()=>doDeepDiplomacy(t,b.dataset.dd));
  }
  function doDeepDiplomacy(t,kind){
    const p=currentPlayer();ensureDepth(p);ensureDepth(t);
    if(kind==='swap'){closeDialog();return openSwapDialog(t.id);}
    if(kind==='tribute'){if(totalLiquid(p)<20000)return toast('Du brauchst 20.000 $.');spend(p,20000);t.clean+=14000;if(deepAccept(p,t,.68)){p.pacts[t.id]=state.round+4;t.pacts[p.id]=state.round+4;adjustRelation(p,t,15);toast('Tribut angenommen. Vier Runden Ruhe.');}else{adjustRelation(p,t,-4);toast('Tribut abgelehnt.');}}
    if(kind==='venture'){if(p.clean<15000)return toast('Du brauchst 15.000 $ sauberes Kapital.');p.clean-=15000;if(deepAccept(p,t,.52)){p.jointVentures[t.id]=state.round+6;t.jointVentures[p.id]=state.round+6;p.stats.secretDeals++;adjustRelation(p,t,10);toast('Geheimes Gemeinschaftsgeschäft gestartet.');}else toast('Das Angebot wird abgelehnt.');}
    if(kind==='betray'){const had=pactActive(p,t)||allianceActive(p,t);delete p.pacts[t.id];delete p.alliances[t.id];delete t.pacts[p.id];delete t.alliances[p.id];if(had){p.reputation=Math.max(0,p.reputation-6);p.stats.betrayals=(p.stats.betrayals||0)+1;adjustRelation(p,t,-45);p.story.flags.betrayal=true;toast('Das Abkommen ist gebrochen. Die Stadt merkt sich Verrat.');}else toast('Es gibt kein aktives Abkommen.');}
    closeDialog();saveGame();renderAll();
  }

  const oldActions=renderActions;
  renderActions=function(){oldActions();const panel=$('#actionsView .action-panel .button-grid');if(panel&&!panel.querySelector('[data-deep-dip]')){panel.insertAdjacentHTML('beforeend','<button class="btn btn-secondary" data-deep-dip>Geheime Diplomatie</button>');$('[data-deep-dip]',panel).onclick=()=>{const r=state.players.find(x=>x.id!==currentPlayer().id&&!x.eliminated);if(r)openRivalProfile(r.id);};}const crimeArt={machine:BUSINESS_ART.machines,mug:A+'event-betrayal.svg',car:A+'item-coupe.svg',bar:BUSINESS_ART.bar,bank:OP_ART.bank};$('#crimeGrid .crime-card').forEach((card,i)=>{const c=CRIMES[i];if(c&&!card.querySelector('.crime-thumb'))card.insertAdjacentHTML('afterbegin',`<img class="crime-thumb" src="${crimeArt[c.id]||OP_ART.sabotage}" alt="">`);});};

  const oldPlanner=v4OpenOperationPlanner;
  v4OpenOperationPlanner=function(kind,...args){
    oldPlanner(kind,...args);
    setTimeout(()=>{const root=$('#dialogContent .v4-operation');if(root&&!root.querySelector('.operation-hero'))root.querySelector('.dialog-head')?.insertAdjacentHTML('afterend',`<img class="operation-hero" src="${OP_ART[kind]||OP_ART.sabotage}" alt="">`);},10);
  };
  if(window.SyndikatV4)window.SyndikatV4.openOperation=v4OpenOperationPlanner;
  function decorateArsenal(){const root=$('#dialogContent');if(!root)return;$('.dialog-option',root).forEach(row=>{if(row.querySelector('.item-thumb'))return;const txt=row.textContent||'';for(const group of Object.values(window.SyndikatV4?.items||{}))for(const [id,def] of Object.entries(group))if(txt.includes(def.name)&&ITEM_ART[id]){row.insertAdjacentHTML('afterbegin',`<img class="item-thumb" src="${ITEM_ART[id]}" alt="">`);return;}});}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-v4-arsenal],[data-arsenal]');if(b)setTimeout(decorateArsenal,30);});

  const EVENTS2=[
    {id:'betrayal',name:'Gerücht über Verrat',text:'Ein enger Kontakt soll Informationen an eine rivalisierende Familie weitergeben.',apply:p=>{const s=[...activeStaff(p)].sort((a,b)=>a.loyalty-b.loyalty)[0];if(s)s.loyalty=clamp(s.loyalty-7,0,100);}},
    {id:'press',name:'Pressekampagne',text:'Eine Zeitung veröffentlicht eine Serie über organisierte Kriminalität.',apply:p=>{p.reputation=Math.max(0,p.reputation-2);p.heat=clamp(p.heat+4,0,100);}},
    {id:'informant',name:'Informant enttarnt',text:'Eine Quelle wird erkannt. Teile deiner Aufklärung veralten.',apply:p=>{const keys=Object.keys(p.scouting||{});if(keys.length)delete p.scouting[keys[rand(0,keys.length-1)]];}},
    {id:'corruption',name:'Kontakt unter Druck',text:'Interne Ermittler prüfen ungewöhnliche Zahlungen.',apply:p=>{if(p.investigation)p.investigation.corruptionExposure=clamp((p.investigation.corruptionExposure||0)+10,0,100);}},
    {id:'fire',name:'Betriebsausfall',text:'Ein Betrieb wird nach einem Zwischenfall vorübergehend beschädigt.',apply:p=>{if(p.businesses.length){const b=p.businesses[rand(0,p.businesses.length-1)];b.health=clamp(b.health-rand(5,16),0,100);}}},
    {id:'union',name:'Arbeitskampf',text:'Beschäftigte und Lieferanten fordern bessere Bedingungen.',apply:p=>{const cost=Math.min(p.clean,rand(2500,9000));p.clean-=cost;ledger(p,'Arbeitskampf',-cost,'expense');}}
  ];
  const oldTrigger=triggerEvent;
  triggerEvent=function(p){ensureDepth(p);if(chance(.45)){const ev=EVENTS2[rand(0,EVENTS2.length-1)];ev.apply(p);p.eventText=ev.name;p.deepEvent={id:ev.id,name:ev.name,desc:ev.text,round:state.round};p.stats.deepEvents++;log(`${p.family}: ${ev.name} – ${ev.text}`);}else oldTrigger(p);};
  const ce=window.SyndikatDepth?.cityEvents;if(ce&&!ce.some(e=>e.id==='blackout'))ce.push({id:'blackout',name:'Stromausfälle',desc:'Nachtbetriebe schwanken stark, Behörden sind überlastet.',duration:4,income:.96,risk:1.18,legal:.98},{id:'tourism',name:'Tourismuswelle',desc:'Hotels, Clubs und Casinos profitieren von zahlungskräftigen Gästen.',duration:6,income:1.12,risk:.95,legal:1.06},{id:'scandal',name:'Politikskandal',desc:'Behörden stehen unter Beobachtung. Einflussnetzwerke werden riskanter.',duration:5,income:.98,risk:1.15,legal:1},{id:'dockstrike',name:'Hafenstreik',desc:'Logistik stockt, lokale Dienstleistungen werden wichtiger.',duration:5,income:.93,risk:1.04,legal:.97});

  const oldAi=aiTurn;
  aiTurn=function(p){ensureDepth(p);if(p.family==='Costa'&&p.clean>25000){for(const k of ['officer','inspector','prosecutor'])if(!p.bribes[k]&&p.clean>CORRUPTION[k].cost*2){p.clean-=CORRUPTION[k].cost;p.bribes[k]=true;break;}}if(p.family==='Conti')for(const b of p.businesses)if(b.health<80&&p.clean>10000){const c=Math.min(p.clean,Math.round(BUSINESSES[b.type].cost*.025));p.clean-=c;b.health=clamp(b.health+10,0,100);break;}oldAi(p);};

  function addStory(){
    const story=window.SyndikatVisualStory?.story;if(!story||story.some(x=>x.chapter===13))return;const V=window.SyndikatVisualStory.assets;
    story.push(
      {chapter:13,kicker:'Kapitel XIII',title:'Alte Schulden',speaker:'Sofia Moretti',portrait:V.sofia,image:RIVAL_INFO.Moretti.art,desc:'Beweise, dass frühere Entscheidungen Konsequenzen haben.',narrative:['Sofia erinnert sich genau daran, wie du ihr erstes Angebot behandelt hast. Ein alter Handschlag kann heute eine Tür öffnen – eine kalte Schulter kann dieselbe Tür verriegeln.','In der Unterwelt ist Erinnerung eine zweite Währung. Heute wird abgerechnet.'],done:p=>p.reputation>=28,reward:190000,rep:8,choices:[{id:'honor',label:'Alte Zusagen ehren',text:'Frühere Kooperation kann jetzt zu einem langfristigen Vorteil werden.',apply:p=>{const m=state.players.find(x=>x.family==='Moretti');if(p.story.flags.moretti==='pact'&&m){adjustRelation(p,m,18);p.jointVentures[m.id]=state.round+8;m.jointVentures[p.id]=state.round+8;}else{spend(p,30000);p.reputation+=3;}p.story.flags.oldDebt='honor';}},{id:'exploit',label:'Den eigenen Vorteil wählen',text:'Mehr kurzfristiges Kapital, aber Moretti wird sich daran erinnern.',apply:p=>{p.dirty+=45000;const m=state.players.find(x=>x.family==='Moretti');if(m)adjustRelation(p,m,-28);p.story.flags.oldDebt='exploit';}}]},
      {chapter:14,kicker:'Kapitel XIV',title:'Kellers letzter Zug',speaker:'Kommissar Ernst Keller',portrait:V.keller,image:V.court,desc:'Überstehe Kellers persönlichste Ermittlung.',narrative:['Keller legt eine neue Akte an. Diesmal geht es um Muster, alte Zeugen und Entscheidungen, die du längst vergessen glaubtest.','Ob du früher Anwälte oder Kontakte genutzt hast, beeinflusst jetzt, welche Türen Keller noch offenstehen.'],done:p=>(p.investigation?.evidence||0)<=38&&p.heat<=48,reward:210000,rep:9,choices:[{id:'legalfinal',label:'Den Rechtsweg erzwingen',text:'Besonders wirksam, wenn du Keller früher juristisch bekämpft hast.',apply:p=>{const bonus=p.story.flags.keller==='legal'?10:5;if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence-bonus,0,100);p.story.flags.kellerFinal='legal';}},{id:'expose',label:'Öffentlichen Druck erzeugen',text:'Senkt Heat und stärkt deinen Ruf als schwer angreifbarer Gegner.',apply:p=>{p.heat=clamp(p.heat-12,0,100);p.reputation=clamp(p.reputation+4,0,100);p.story.flags.kellerFinal='expose';}}]},
      {chapter:15,kicker:'Kapitel XV',title:'Macht oder Bilanz',speaker:'Marco Bellini',portrait:V.marco,image:BUSINESS_ART.holding,desc:'Entscheide, welche Art von Syndikat du führst.',narrative:['Marco legt zwei Mappen auf den Tisch. In der einen: Einfluss und Präsenz. In der anderen: Beteiligungen, Grundstücke und Verträge.','Beides führt zu Macht. Aber nicht zur gleichen Art von Macht.'],done:p=>netWorth(p)>=6500000||(p.stats?.operationsSuccess||0)>=6,reward:240000,rep:10,choices:[{id:'business',label:'Die Bilanz gewinnt',text:'Wirtschaftliche Erträge steigen dauerhaft leicht.',apply:p=>{p.story.flags.route='business';p.permanentIncomeBonus=(p.permanentIncomeBonus||0)+.04;}},{id:'influence',label:'Der Einfluss gewinnt',text:'Ruf und Beziehungen werden wichtiger.',apply:p=>{p.story.flags.route='influence';p.reputation+=5;}}]},
      {chapter:16,kicker:'Kapitel XVI',title:'Riss in der Familie',speaker:'Marco Bellini',portrait:V.marco,image:A+'event-betrayal.svg',desc:'Halte deine Organisation zusammen.',narrative:['Je größer die Familie, desto mehr Menschen glauben, sie hätten Anspruch auf den Tisch am Fenster. Ein Gerücht über deinen Unterboss reicht, um alte Loyalitäten zu prüfen.','Du musst entscheiden, ob Vertrauen verdient oder erkauft wird.'],done:p=>activeStaff(p).length>=7&&(!p.underbossId||p.staffRoster.find(s=>s.id===p.underbossId)?.loyalty>=55),reward:260000,rep:10,choices:[{id:'trust',label:'Vertrauen zeigen',text:'Der Unterboss gewinnt Loyalität.',apply:p=>{const u=p.staffRoster.find(s=>s.id===p.underbossId);if(u)u.loyalty=clamp(u.loyalty+14,0,100);p.story.flags.family='trust';}},{id:'restructure',label:'Organisation neu ordnen',text:'Die schwächste Loyalität wird entfernt, die verbleibende Struktur stabiler.',apply:p=>{const s=[...activeStaff(p)].sort((a,b)=>a.loyalty-b.loyalty)[0];if(s){p.staffRoster=p.staffRoster.filter(x=>x.id!==s.id);syncStaffCounts(p);}p.story.flags.family='restructure';}}]},
      {chapter:17,kicker:'Kapitel XVII',title:'Die Stadtverwaltung',speaker:'Alessandro Costa',portrait:RIVAL_INFO.Costa.art,image:A+'event-corruption.svg',desc:'Erreiche politischen Einfluss oder beweise, dass du ohne ihn auskommst.',narrative:['Costa lädt dich in ein Büro mit Tageslicht. Das ist seine Art von Machtdemonstration.','Er behauptet, eine Stadt werde nicht auf der Straße regiert, sondern in Sitzungszimmern, in denen niemand seinen echten Preis nennt.'],done:p=>corruptionCount(p)>=3||p.clean>=2500000,reward:290000,rep:11,choices:[{id:'network',label:'Einflussnetzwerk ausbauen',text:'Kontakte werden stärker, aber öffentliche Kontrolle nimmt zu.',apply:p=>{p.story.flags.politics='network';if(p.investigation)p.investigation.corruptionExposure=clamp(p.investigation.corruptionExposure+8,0,100);p.politicalShield=6;}},{id:'independent',label:'Unabhängig bleiben',text:'Kostet Kapital, bringt aber Reputation.',apply:p=>{spend(p,80000);p.reputation+=7;p.story.flags.politics='independent';}}]},
      {chapter:18,kicker:'Kapitel XVIII',title:'Die Stadt steht still',speaker:'Sofia Moretti',portrait:V.sofia,image:A+'event-gangwar.svg',desc:'Beende eine schwere Rivalitätsphase durch Stärke oder Verhandlung.',narrative:['Mehrere Familien ziehen gleichzeitig Grenzen neu. Lieferanten warten ab, Geschäftsleute schließen früher, alte Verträge werden plötzlich wichtig.','Du kannst die Lage weiter eskalieren oder zeigen, dass die Stadt auch durch Absprachen kontrolliert werden kann.'],done:p=>(p.stats?.operationsSuccess||0)>=7||state.players.some(x=>x.id!==p.id&&relation(p,x)>=35),reward:330000,rep:12,choices:[{id:'pressure',label:'Härte zeigen',text:'Mehr Ruf, schlechtere Rivalenbeziehungen.',apply:p=>{state.players.filter(x=>x.id!==p.id).forEach(x=>adjustRelation(p,x,-8));p.reputation+=6;p.story.flags.cityCrisis='pressure';}},{id:'settle',label:'Einigung suchen',text:'40.000 $ für eine stadtweite Deeskalation.',apply:p=>{spend(p,40000);state.players.filter(x=>x.id!==p.id).forEach(x=>adjustRelation(p,x,8));p.heat=clamp(p.heat-10,0,100);p.story.flags.cityCrisis='settle';}}]},
      {chapter:19,kicker:'Kapitel XIX',title:'Das Erbe',speaker:'Don Vittorio Leone',portrait:V.vittorio,image:V.city,desc:'Bereite deine Organisation auf eine Zukunft ohne dich vor.',narrative:['Vittorio spricht zum ersten Mal nicht über den nächsten Monat, sondern über die nächsten zehn Jahre. Ein Imperium, das an einer Person hängt, ist kein Imperium.','Crews, Unterboss und Betriebe müssen auch dann funktionieren, wenn du nicht mehr jede Entscheidung selbst triffst.'],done:p=>!!p.underbossId&&(p.crews||[]).length>=2&&activeStaff(p).length>=8,reward:380000,rep:13,choices:[{id:'family',label:'Familienmodell',text:'Loyalität aller Mitarbeiter steigt.',apply:p=>{activeStaff(p).forEach(s=>s.loyalty=clamp(s.loyalty+7,0,100));p.story.flags.legacy='family';}},{id:'corporate',label:'Konzernmodell',text:'Betriebe werden effizienter.',apply:p=>{p.permanentIncomeBonus=(p.permanentIncomeBonus||0)+.035;p.story.flags.legacy='corporate';}}]},
      {chapter:20,kicker:'Epilog',title:'Welche Stadt bleibt?',speaker:'Don Vittorio Leone',portrait:V.vittorio,image:V.city,desc:'Erreiche endgültige Dominanz und bestimme, welches Syndikat du hinterlässt.',narrative:['Die Stadt ist ruhig – nicht friedlich. Das ist ein Unterschied, den du besser kennst als jeder andere.','Alles, was du früher entschieden hast, liegt jetzt unter diesem Moment: Moretti, Keller, Marco, Politik und Geld.'],done:p=>powerIndex(p)>=72&&controlledDistricts(p)>=3&&p.finalCrisis?.resolved,reward:500000,rep:18,choices:[{id:'empire',label:'Das legale Imperium',text:'Dein Syndikat tritt als Konzern in die Zukunft.',apply:p=>{p.story.flags.ending='empire';p.clean+=150000;}},{id:'shadow',label:'Der unsichtbare Staat',text:'Kontakte und Abhängigkeiten bleiben deine wichtigste Währung.',apply:p=>{p.story.flags.ending='shadow';p.politicalShield=(p.politicalShield||0)+10;}},{id:'crown',label:'Krone aus Neon',text:'Die Stadt soll deinen Namen nie vergessen.',apply:p=>{p.story.flags.ending='crown';p.reputation=clamp(p.reputation+10,0,100);}}]}
    );
  }
  addStory();

  const oldGameOver=showGameOver;
  showGameOver=function(){oldGameOver();const p=state?.players.find(x=>x.id===state.winnerId),root=$('#dialogContent');if(!p||!root||root.querySelector('.ending-card'))return;const e=p.story?.flags?.ending||(p.finalCrisis?.choice==='legit'?'empire':p.finalCrisis?.choice==='politics'?'shadow':p.finalCrisis?.choice==='war'?'crown':'family');const endings={empire:['Das legale Imperium',BUSINESS_ART.holding,'Deine Macht trägt Anzüge, besitzt Gebäude und unterschreibt Verträge.'],shadow:['Der unsichtbare Staat',A+'event-corruption.svg','Niemand kann genau sagen, wo dein Einfluss beginnt. Genau deshalb reicht er so weit.'],crown:['Krone aus Neon',A+'start-user.webp','Die Stadt erinnert sich an deinen Namen und deine Macht.'],family:['Die Familie bleibt',A+'staff-bodyguard.svg','Deine Organisation hat gelernt, ohne einzelne Helden zu bestehen.']};const x=endings[e]||endings.family;root.insertAdjacentHTML('beforeend',`<div class="ending-card"><img src="${x[1]}" alt=""><div><small>Dein Ende</small><h3>${x[0]}</h3><p>${x[2]}</p></div></div>`);};

  const oldInit=initPlayer;initPlayer=function(p){oldInit(p);ensureDepth(p);};
  const oldMigrate=migrateState;migrateState=function(data){data=oldMigrate(data);(data.players||[]).forEach(ensureDepth);return data;};

  window.SyndikatWorldDepth={businessArt:BUSINESS_ART,districtArt:DISTRICT_ART,rivals:RIVAL_INFO,operationArt:OP_ART,itemArt:ITEM_ART,setMapMode:m=>{mapMode=m;renderCity();}};
})();
/* SYNDIKAT_V52_WORLD_DEPTH_END */

/* SYNDIKAT_V54_VISUAL_EXPANSION_BEGIN */
(function SYNDIKAT_V54_VISUAL_EXPANSION(){
  const STORY={"1":"./assets/story-01.svg","2":"./assets/story-02.svg","3":"./assets/story-03.svg","4":"./assets/story-04.svg","5":"./assets/story-05.svg","6":"./assets/story-06.svg","7":"./assets/story-07.svg","8":"./assets/story-08.svg","9":"./assets/story-09.svg","10":"./assets/story-10.svg","11":"./assets/story-11.svg","12":"./assets/story-12.svg","13":"./assets/story-13.svg","14":"./assets/story-14.svg","15":"./assets/story-15.svg","16":"./assets/story-16.svg","17":"./assets/story-17.svg","18":"./assets/story-18.svg","19":"./assets/story-19.svg","20":"./assets/story-20.svg"};
  const EVENTS={"blackout":"./assets/event-blackout.svg","tourism":"./assets/event-tourism.svg","scandal":"./assets/event-scandal.svg","dockstrike":"./assets/event-dockstrike.svg"};
  const CRIME_ART={"machine":"./assets/crime-machine.svg","mug":"./assets/crime-mug.svg","car":"./assets/crime-car.svg","bar":"./assets/crime-bar.svg","bank":"./assets/crime-bank.svg"};
  const DIPLOMACY={"tribute":"./assets/diplomacy-tribute.svg","venture":"./assets/diplomacy-venture.svg","swap":"./assets/diplomacy-swap.svg","betray":"./assets/diplomacy-betray.svg"};
  const ENDGAME={"legit":"./assets/endgame-legit.svg","politics":"./assets/endgame-politics.svg","war":"./assets/endgame-war.svg"};
  const PRISON={"appeal":"./assets/prison-appeal.svg","guardbribe":"./assets/prison-bribe.svg","network":"./assets/prison-network.svg","contraband":"./assets/prison-contraband.svg","tunnel":"./assets/prison-tunnel.svg","delegate":"./assets/prison-delegate.svg","escape":"./assets/prison-escape.svg"};
  const COURT={"fight":"./assets/court-fight.svg","deal":"./assets/court-deal.svg","corrupt":"./assets/court-corrupt.svg"};
  const SPECIALIZATION={"lowprofile":"./assets/spec-lowprofile.svg","highroller":"./assets/spec-highroller.svg","discreet":"./assets/spec-discreet.svg","premium":"./assets/spec-premium.svg","lounge":"./assets/spec-lounge.svg","speakeasy":"./assets/spec-speakeasy.svg","sportsbook":"./assets/spec-sportsbook.svg","bookmaking":"./assets/spec-bookmaking.svg","family":"./assets/spec-family.svg","night":"./assets/spec-night.svg","vip":"./assets/spec-vip.svg","backroom":"./assets/spec-backroom.svg","elite":"./assets/spec-elite.svg","discretion":"./assets/spec-discretion.svg","resort":"./assets/spec-resort.svg","highstakes":"./assets/spec-highstakes.svg","luxuryhotel":"./assets/spec-luxuryhotel.svg","conference":"./assets/spec-conference.svg","legit":"./assets/spec-legit.svg","shells":"./assets/spec-shells.svg"};
  const PROTECTION={"Kiosk":"./assets/protection-kiosk.svg","Friseursalon":"./assets/protection-friseursalon.svg","Späti":"./assets/protection-spati.svg","Taxi-Zentrale":"./assets/protection-taxi-zentrale.svg","Werkstatt":"./assets/protection-werkstatt.svg","Pfandleihe":"./assets/protection-pfandleihe.svg","Gemüsehändler":"./assets/protection-gemusehandler.svg","Nachtcafé":"./assets/protection-nachtcafe.svg","Lagerbetrieb":"./assets/protection-lagerbetrieb.svg","Billardsalon":"./assets/protection-billardsalon.svg","Schneiderei":"./assets/protection-schneiderei.svg","Tabakladen":"./assets/protection-tabakladen.svg"};
  const ACHIEVEMENT={"Erstes Standbein":"./assets/achievement-first_biz.svg","Die Familie":"./assets/achievement-crew.svg","Millionär":"./assets/achievement-million.svg","Großkapital":"./assets/achievement-ten_million.svg","Unser Viertel":"./assets/achievement-district.svg","Stadtmacht":"./assets/achievement-three_districts.svg","Saubere Arbeit":"./assets/achievement-operations.svg","Unantastbar":"./assets/achievement-untouchable.svg","Rechte Hand":"./assets/achievement-underboss.svg","Das Syndikat":"./assets/achievement-syndicate.svg"};
  const PERSON={"Alessio Marchetti":"./assets/person-alessio-marchetti.svg","Bianca Serra":"./assets/person-bianca-serra.svg","Matteo Ricci":"./assets/person-matteo-ricci.svg","Clara Venturi":"./assets/person-clara-venturi.svg","Paolo Gallo":"./assets/person-paolo-gallo.svg","Francesca Neri":"./assets/person-francesca-neri.svg","Stefano Riva":"./assets/person-stefano-riva.svg","Lucia Ferraro":"./assets/person-lucia-ferraro.svg","Bruno Amato":"./assets/person-bruno-amato.svg","Rosa Mancini":"./assets/person-rosa-mancini.svg","Gabriel Esposito":"./assets/person-gabriel-esposito.svg","Nina Lombardi":"./assets/person-nina-lombardi.svg","Tomaso Greco":"./assets/person-tomaso-greco.svg","Adriana Vitale":"./assets/person-adriana-vitale.svg","Renato Leone":"./assets/person-renato-leone.svg","Camilla De Santis":"./assets/person-camilla-de-santis.svg","Emilio Caruso":"./assets/person-emilio-caruso.svg","Vera Romano":"./assets/person-vera-romano.svg","Silvio Morelli":"./assets/person-silvio-morelli.svg","Anita Bianchi":"./assets/person-anita-bianchi.svg","Massimo Fontana":"./assets/person-massimo-fontana.svg","Greta Costa":"./assets/person-greta-costa.svg","Dante Rizzo":"./assets/person-dante-rizzo.svg","Lea Conti":"./assets/person-lea-conti.svg"};
  const ENDINGS={"empire":"./assets/ending-empire.svg","shadow":"./assets/ending-shadow.svg","crown":"./assets/ending-crown.svg","family":"./assets/ending-family.svg"};
  const EXTRA_NAMES=["Alessio Marchetti","Bianca Serra","Matteo Ricci","Clara Venturi","Paolo Gallo","Francesca Neri","Stefano Riva","Lucia Ferraro","Bruno Amato","Rosa Mancini","Gabriel Esposito","Nina Lombardi","Tomaso Greco","Adriana Vitale","Renato Leone","Camilla De Santis","Emilio Caruso","Vera Romano","Silvio Morelli","Anita Bianchi","Massimo Fontana","Greta Costa","Dante Rizzo","Lea Conti"];
  if(typeof STAFF_NAMES!=='undefined'){for(const n of EXTRA_NAMES)if(!STAFF_NAMES.includes(n))STAFF_NAMES.push(n);}
  const story=window.SyndikatVisualStory&&window.SyndikatVisualStory.story;
  if(story)for(const ch of story){const src=STORY[String(ch.chapter)];if(src)ch.image=src;}
  const style=document.createElement('style');
  style.textContent='.vx-thumb{width:112px;height:78px;object-fit:cover;border-radius:10px;border:1px solid rgba(213,179,107,.35);flex:0 0 auto;margin-right:.8rem}.crime-card>.vx-thumb{width:100%;height:118px;margin:0 0 .75rem 0}.achievement>.vx-ach{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;margin-bottom:.6rem;filter:saturate(.9)}.achievement.locked>.vx-ach{filter:grayscale(1) brightness(.55)}.vx-wide{width:100%;max-height:210px;object-fit:cover;border-radius:12px;margin-bottom:.85rem;border:1px solid rgba(213,179,107,.28)}.dialog-option{align-items:center}.v44-site-panel>.vx-wide{border-radius:0;margin:0 0 .75rem 0}';
  document.head.appendChild(style);
  function putImg(host,src,cls){if(!host||!src)return null;cls=cls||'vx-thumb';let img=host.querySelector('img.'+cls);if(!img){img=document.createElement('img');img.className=cls;img.alt='';host.insertBefore(img,host.firstChild);}if(img.getAttribute('src')!==src)img.src=src;return img;}
  function current(){try{return typeof currentPlayer==='function'?currentPlayer():null}catch(_){return null}}
  function decorate(){
    const p=current();
    if(p){const ev=p.deepEvent||(typeof state!=='undefined'&&state&&state.cityEvent);const eventImg=document.querySelector('.deep-event-card img');if(ev&&eventImg&&EVENTS[ev.id])eventImg.src=EVENTS[ev.id];}
    document.querySelectorAll('#crimeGrid .crime-card').forEach(function(card,i){const prisonBtn=card.querySelector('[data-prison-final]');if(prisonBtn){putImg(card,PRISON[prisonBtn.dataset.prisonFinal],'vx-thumb');return;}const c=(typeof CRIMES!=='undefined'&&CRIMES[i])?CRIMES[i]:null;if(c&&CRIME_ART[c.id])putImg(card,CRIME_ART[c.id],'vx-thumb');});
    document.querySelectorAll('[data-dd]').forEach(function(btn){putImg(btn.closest('.dialog-option'),DIPLOMACY[btn.dataset.dd]);});
    document.querySelectorAll('[data-final-choice]').forEach(function(btn){putImg(btn.closest('.dialog-option'),ENDGAME[btn.dataset.finalChoice]);});
    document.querySelectorAll('[data-court]').forEach(function(btn){putImg(btn.closest('.dialog-option'),COURT[btn.dataset.court]);});
    document.querySelectorAll('[data-path]').forEach(function(btn){putImg(btn.closest('.dialog-option'),SPECIALIZATION[btn.dataset.path]);});
    document.querySelectorAll('[data-pressure]').forEach(function(btn){if(!p)return;const c=(p.protectionContracts||[]).find(function(x){return x.id===btn.dataset.pressure});if(!c)return;const key=Object.keys(PROTECTION).find(function(k){return String(c.name||'').startsWith(k)});if(key)putImg(btn.closest('.dialog-option'),PROTECTION[key]);});
    document.querySelectorAll('.achievement-grid .achievement').forEach(function(card){const txt=(card.querySelector('strong')&&card.querySelector('strong').textContent)||'';const key=Object.keys(ACHIEVEMENT).find(function(k){return txt.includes(k)});if(key)putImg(card,ACHIEVEMENT[key],'vx-ach');});
    const prisonHero=document.querySelector('.prison-visual img');if(prisonHero)prisonHero.src='./assets/prison-cell.svg';
    const root=document.querySelector('#dialogContent .dialog-wrap');
    if(root){const heading=(root.querySelector('h2')&&root.querySelector('h2').textContent)||'';const banner=root.querySelector('.dialog-visual-banner img');if(banner&&heading.includes('Gerichtsakte'))banner.src='./assets/court-hearing.svg';if(banner&&p&&p.finalCrisis&&(heading.includes('Endgame')||heading.includes('Stadt schlägt zurück')||heading.includes('Stadt reagiert'))){const src=ENDGAME[p.finalCrisis.choice];if(src)banner.src=src;}if(heading.includes('Gerichtsakte')){root.querySelectorAll('.dialog-list .dialog-option').forEach(function(row){if(!row.querySelector('[data-court]'))putImg(row,'./assets/court-archive.svg');});}}
  }
  const previousRenderStaff=renderStaff;
  renderStaff=function(){previousRenderStaff();const p=current();if(p){document.querySelectorAll('#staffGrid [data-staff-person]').forEach(function(btn){const person=(p.staffRoster||[]).find(function(x){return x.id===btn.dataset.staffPerson});if(!person||!PERSON[person.name])return;const card=btn.closest('.person-card');if(!card)return;const img=card.querySelector('.person-portrait');if(img)img.src=PERSON[person.name];});}decorate();};
  const previousOpenStaffPerson=openStaffPerson;
  openStaffPerson=function(id){previousOpenStaffPerson(id);const p=current();const person=p&&(p.staffRoster||[]).find(function(x){return x.id===id});if(person&&PERSON[person.name]){const root=document.querySelector('#dialogContent .dialog-wrap');const img=root&&root.querySelector('.dialog-person-hero');if(img)img.src=PERSON[person.name];}decorate();};
  const previousBusinessDialog=openBusinessDialog;
  openBusinessDialog=function(id){previousBusinessDialog(id);const p=current();const b=p&&(p.businesses||[]).find(function(x){return x.id===id});if(b&&b.specialization&&SPECIALIZATION[b.specialization]){const panel=document.querySelector('#dialogContent .v44-site-panel');if(panel)putImg(panel,SPECIALIZATION[b.specialization],'vx-wide');}decorate();};
  const previousGameOver=showGameOver;
  showGameOver=function(){previousGameOver();const p=(typeof state!=='undefined'&&state&&state.players)?state.players.find(function(x){return x.id===state.winnerId}):null;if(!p)return;const key=(p.story&&p.story.flags&&p.story.flags.ending)||(p.finalCrisis&&p.finalCrisis.choice==='legit'?'empire':p.finalCrisis&&p.finalCrisis.choice==='politics'?'shadow':p.finalCrisis&&p.finalCrisis.choice==='war'?'crown':'family');const img=document.querySelector('#dialogContent .ending-card img');if(img&&ENDINGS[key])img.src=ENDINGS[key];decorate();};
  let scheduled=false;const observer=new MutationObserver(function(){if(scheduled)return;scheduled=true;queueMicrotask(function(){scheduled=false;decorate();});});
  if(document.body)observer.observe(document.body,{childList:true,subtree:true});else document.addEventListener('DOMContentLoaded',function(){observer.observe(document.body,{childList:true,subtree:true});decorate();},{once:true});
  setTimeout(decorate,0);
  window.SyndikatVisualExpansion={story:STORY,events:EVENTS,crimes:CRIME_ART,diplomacy:DIPLOMACY,endgame:ENDGAME,prison:PRISON,court:COURT,specializations:SPECIALIZATION,protection:PROTECTION,achievements:ACHIEVEMENT,people:PERSON,endings:ENDINGS};
})();
/* SYNDIKAT_V54_VISUAL_EXPANSION_END */

/* SYNDIKAT_V45_CLOUD_UI_BEGIN */
(function SYNDIKAT_V45_CLOUD_UI(){
  const ONLINE_KEY='syndikat_online_session_v1';
  const CLOUD_SAVE_KEY='syndikat_cloud_save_session_v1';
  let onlineSession=null,onlineRevision=0,onlinePoll=null,onlineRoster=[],onlineStopWatch=null,onlineTransport='Fallback';

  function v45LoadSession(){try{onlineSession=JSON.parse(localStorage.getItem(ONLINE_KEY)||'null')}catch{onlineSession=null}return onlineSession}
  function v45StoreSession(v){onlineSession=v;if(v)localStorage.setItem(ONLINE_KEY,JSON.stringify(v));else localStorage.removeItem(ONLINE_KEY)}
  function v45Cloud(){return window.SyndikatCloud}
  function v45CanonicalState(){
    if(!state)return null;
    const copy=JSON.parse(JSON.stringify(state));
    copy.players.forEach(p=>{if(p.type==='remote')p.type='human'});
    return copy;
  }
  function v45ApplyCloudState(raw){
    if(!raw)return;
    state=migrateState(JSON.parse(JSON.stringify(raw)));
    state.players.forEach(p=>{
      if(p.onlineParticipantId){
        p.type=p.onlineParticipantId===onlineSession?.participantId?'human':'remote';
      }
    });
    showScreen('gameScreen');currentView='city';saveGame();renderAll();
  }
  async function v45RefreshOnline(silent=false){
    const c=v45Cloud();if(!c?.enabled||!onlineSession)return;
    try{
      const game=await c.getGame(onlineSession.code,onlineSession.token);
      if(!game)return;
      onlineRevision=Number(game.revision)||1;
      onlineRoster=await c.getPlayers(onlineSession.code,onlineSession.token);
      if(game.game_state&&game.status!=='lobby')v45ApplyCloudState(game.game_state);
      if(!silent)toast(`Online-Partie aktualisiert · Revision ${onlineRevision}.`);
    }catch(e){if(!silent)toast('Cloud: '+e.message);}
  }
  function v45StartPolling(){
    if(onlinePoll)clearInterval(onlinePoll);
    if(onlineStopWatch){try{onlineStopWatch()}catch{}onlineStopWatch=null;}
    if(!onlineSession||!v45Cloud()?.enabled)return;
    onlineTransport='Fallback';
    onlineStopWatch=v45Cloud().watchGame?.(onlineSession,async signal=>{
      onlineTransport='Realtime';
      const rev=Number(signal?.revision)||0;
      if(signal?.kind==='lobby'||rev>onlineRevision)await v45RefreshOnline(true);
    })||null;
    onlinePoll=setInterval(async()=>{
      try{
        const game=await v45Cloud().getGame(onlineSession.code,onlineSession.token);
        if(game&&Number(game.revision)>onlineRevision){onlineRevision=Number(game.revision);if(game.game_state)v45ApplyCloudState(game.game_state);}
      }catch{}
    },30000);
  }
    function v45BuildState(roster,settings){
    const players=roster.map(r=>{const p=blankPlayer(r.display_name,r.family,'human');p.onlineParticipantId=r.participant_id;return p;});
    const aiCount=Math.max(0,Math.min(Number(settings.aiCount)||0,8-players.length));
    for(let i=0;i<aiCount;i++){const prof=AI_PROFILES[i%AI_PROFILES.length],p=blankPlayer(prof.family,prof.family,'ai',prof.style),mult={easy:.85,normal:1,hard:1.2,boss:1.45}[settings.difficulty]||1;p.clean=Math.round(p.clean*mult);p.dirty=Math.round(p.dirty*mult);players.push(p);}
    const st={version:4,rulesRevision:4,round:1,currentIndex:0,players,settings:{difficulty:settings.difficulty||'normal',length:settings.length||'normal'},log:[],winnerId:null,gameOver:false,startedAt:Date.now(),initialPlayerCount:players.length,initialHumanCount:roster.length,online:true};
    const prev=state;state=st;players.forEach(p=>{initPlayer(p);ensureMissions(p)});state=prev;
    return st;
  }
  async function v45CreateLobby(){
    const c=v45Cloud();if(!c?.enabled)return toast('Cloud-Backend ist nicht aktiviert.');
    const name=$('#cloudName').value.trim()||'Spieler',family=$('#cloudFamily').value.trim()||'Leone';
    try{
      const s=await c.createLobby({displayName:name,family,settings:{difficulty:$('#cloudDifficulty').value,length:$('#cloudLength').value,aiCount:+$('#cloudAi').value}});
      v45StoreSession(s);onlineRevision=1;v45StartPolling();await v45OpenCloudHub();toast('Online-Lobby erstellt.');
    }catch(e){toast('Cloud: '+e.message);}
  }
  async function v45JoinLobby(){
    const c=v45Cloud();if(!c?.enabled)return toast('Cloud-Backend ist nicht aktiviert.');
    const code=$('#joinCode').value.trim().toUpperCase(),name=$('#joinName').value.trim()||'Spieler',family=$('#joinFamily').value.trim()||'Familie';
    if(!code)return toast('Bitte Spielcode eingeben.');
    try{
      const s=await c.joinLobby(code,{displayName:name,family});v45StoreSession(s);v45StartPolling();setTimeout(()=>c.signalGame?.(s,0,'lobby'),700);await v45OpenCloudHub();toast('Lobby beigetreten.');
    }catch(e){toast('Cloud: '+e.message);}
  }
  async function v45StartLobbyGame(){
    const c=v45Cloud();if(!onlineSession?.host)return toast('Nur der Host kann starten.');
    try{
      const game=await c.getGame(onlineSession.code,onlineSession.token),roster=await c.getPlayers(onlineSession.code,onlineSession.token);
      if(roster.length<2)return toast('Für Online-Multiplayer werden mindestens 2 menschliche Spieler benötigt.');
      if(roster.some(r=>!r.ready))return toast('Alle Mitspieler müssen zuerst auf „Bereit“ stehen.');
      onlineRoster=roster;const st=v45BuildState(roster,game.settings||{}),first=roster[0];
      const row=await c.startGame(onlineSession,game.revision,st,first.participant_id);
      onlineRevision=Number(row.revision);v45ApplyCloudState(row.game_state);closeDialog();v45StartPolling();await c.signalGame?.(onlineSession,onlineRevision,'state');toast('Online-Partie gestartet.');
    }catch(e){toast('Cloud: '+e.message);}
  }
  async function v45LeaveOnline(){
    if(onlineStopWatch){try{onlineStopWatch()}catch{}onlineStopWatch=null;}v45Cloud()?.stopRealtime?.();v45StoreSession(null);onlineRoster=[];onlineRevision=0;if(onlinePoll){clearInterval(onlinePoll);onlinePoll=null;}toast('Online-Verbindung getrennt.');closeDialog();
  }
  async function v45CloudSaveNew(){
    const c=v45Cloud();if(!c?.enabled||!state)return toast('Keine Partie für Cloud-Speicherung.');
    try{
      const x=await c.createCloudSave(v45CanonicalState());localStorage.setItem(CLOUD_SAVE_KEY,JSON.stringify({code:x.code,token:x.token,revision:x.row?.revision||1}));
      openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Cloud-Spielstand erstellt</p><h2>Zugangsdaten sichern</h2></div><button class="icon-btn" data-close>✕</button></div><p class="muted">Code und Schlüssel werden lokal gespeichert. Für ein anderes Gerät brauchst du beides.</p><div class="intel-list"><div class="intel-row"><strong>Cloud-Code</strong><span>${esc(x.code)}</span></div><div class="intel-row"><strong>Schlüssel</strong><span class="token-wrap">${esc(x.token)}</span></div></div></div>`);
    }catch(e){toast('Cloud: '+e.message);}
  }
  async function v45CloudSaveUpdate(){
    const c=v45Cloud();let meta=null;try{meta=JSON.parse(localStorage.getItem(CLOUD_SAVE_KEY)||'null')}catch{}
    if(!c?.enabled||!meta||!state)return toast('Noch kein verknüpfter Cloud-Spielstand.');
    try{const row=await c.updateCloudSave(meta.code,meta.token,v45CanonicalState(),meta.revision);meta.revision=row.revision;localStorage.setItem(CLOUD_SAVE_KEY,JSON.stringify(meta));toast('Cloud-Spielstand aktualisiert.');}catch(e){toast('Cloud: '+e.message);}
  }
  async function v45CloudLoad(){
    const c=v45Cloud(),code=$('#cloudLoadCode').value.trim().toUpperCase(),token=$('#cloudLoadToken').value.trim();if(!code||!token)return toast('Code und Schlüssel erforderlich.');
    try{const row=await c.loadCloudSave(code,token);if(!row)return toast('Cloud-Spielstand nicht gefunden.');localStorage.setItem(CLOUD_SAVE_KEY,JSON.stringify({code,token,revision:row.revision}));state=migrateState(row.game_state);showScreen('gameScreen');renderAll();closeDialog();toast('Cloud-Spielstand geladen.');}catch(e){toast('Cloud: '+e.message);}
  }
  async function v45AccountSignIn(register=false){
    const c=v45Cloud(),email=$('#accountEmail')?.value.trim(),password=$('#accountPassword')?.value||'';
    if(!email||password.length<6)return toast('Bitte E-Mail und ein Passwort mit mindestens 6 Zeichen eingeben.');
    try{
      const data=register?await c.signUpAccount(email,password):await c.signInAccount(email,password);
      if(register&&!data?.session){toast('Konto angelegt. Bitte bestätige gegebenenfalls die E-Mail und melde dich danach an.');return;}
      toast(register?'Cloud-Konto angelegt.':'Cloud-Konto angemeldet.');await v45OpenCloudHub();
    }catch(e){toast('Konto: '+(e.message||e));}
  }
  async function v45AccountSignOut(){
    try{await v45Cloud().signOutAccount();toast('Cloud-Konto abgemeldet.');await v45OpenCloudHub();}catch(e){toast('Konto: '+(e.message||e));}
  }
  async function v45AccountSave(slot){
    const c=v45Cloud();if(!state)return toast('Keine Partie zum Speichern.');
    try{
      const list=await c.accountListSaves(),old=list.find(x=>Number(x.slot)===Number(slot));
      await c.accountSaveSlot(slot,v45CanonicalState(),old?.revision??null);
      toast(`Cloud-Slot ${slot} gespeichert.`);await v45OpenCloudHub();
    }catch(e){toast('Cloud-Konto: '+(e.message||e));}
  }
  async function v45AccountLoad(slot){
    try{
      const row=await v45Cloud().accountLoadSave(slot);if(!row?.game_state)return toast('Dieser Cloud-Slot ist leer.');
      state=migrateState(row.game_state);showScreen('gameScreen');currentView='city';saveGame();renderAll();closeDialog();toast(`Cloud-Slot ${slot} geladen.`);
    }catch(e){toast('Cloud-Konto: '+(e.message||e));}
  }
  async function v45AccountDelete(slot){
    try{await v45Cloud().accountDeleteSave(slot);toast(`Cloud-Slot ${slot} gelöscht.`);await v45OpenCloudHub();}catch(e){toast('Cloud-Konto: '+(e.message||e));}
  }
  function v45AccountSlotsHtml(saves){
    return [1,2,3,4,5].map(slot=>{
      const x=saves.find(s=>Number(s.slot)===slot);
      return `<div class="dialog-option account-slot"><div><strong>Cloud-Slot ${slot}</strong><p>${x?`${esc(x.family||'Syndikat')} · Runde ${x.round} · Revision ${x.revision}`:'Leer'}</p></div><div class="mini-actions">${state?`<button class="btn btn-secondary" data-account-save="${slot}">${x?'Überschreiben':'Speichern'}</button>`:''}${x?`<button class="btn btn-primary" data-account-load="${slot}">Laden</button><button class="btn btn-danger" data-account-delete="${slot}">Löschen</button>`:''}</div></div>`;
    }).join('');
  }

  async function v45OpenCloudHub(){
    const c=v45Cloud();if(!c?.enabled)return toast('Cloud/Online ist vorbereitet, aber noch nicht mit einem kostenlosen separaten Backend verbunden.');
    v45LoadSession();
    if(onlineSession){
      try{const game=await c.getGame(onlineSession.code,onlineSession.token);onlineRevision=Number(game?.revision)||onlineRevision;onlineRoster=await c.getPlayers(onlineSession.code,onlineSession.token);
        openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Online-Multiplayer</p><h2>Lobby ${esc(onlineSession.code)}</h2></div><button class="icon-btn" data-close>✕</button></div>
          <p class="muted">Status: ${esc(game?.status||'unbekannt')} · Revision ${onlineRevision}. Teile den Spielcode nur mit Mitspielern.</p>
          <div class="dialog-list">${onlineRoster.map((r,i)=>`<div class="dialog-option"><div><strong>${i+1}. ${esc(r.display_name)} · ${esc(r.family)}</strong><p>${r.participant_id===onlineSession.participantId?'Dieses Gerät':''}${r.ready?' · bereit':''}</p></div><span class="pill">${r.ready?'Bereit':'Wartet'}</span></div>`).join('')}</div>
          <div class="dialog-footer">${game?.status==='lobby'?`<button class="btn btn-secondary" data-ready>Bereit umschalten</button>${onlineSession.host?'<button class="btn btn-primary" data-online-start>Partie starten</button>':''}`:'<button class="btn btn-primary" data-online-open>Spiel aktualisieren</button>'}<button class="btn btn-danger" data-online-leave>Verbindung trennen</button></div></div>`);
        $('[data-ready]')?.addEventListener('click',async()=>{const me=onlineRoster.find(x=>x.participant_id===onlineSession.participantId);await c.setReady(onlineSession,!me?.ready);await c.signalGame?.(onlineSession,onlineRevision,'lobby');v45OpenCloudHub();});
        $('[data-online-start]')?.addEventListener('click',v45StartLobbyGame);$('[data-online-open]')?.addEventListener('click',()=>v45RefreshOnline(false));$('[data-online-leave]')?.addEventListener('click',v45LeaveOnline);return;
      }catch(e){toast('Cloud: '+e.message);}
    }
    let account=null,accountSaves=[];
    try{account=await c.getAccount?.();if(account)accountSaves=await c.accountListSaves();}catch{}
    const accountHtml=account
      ?`<h3>Cloud-Konto</h3><div class="account-status"><div><strong>${esc(account.email||'Angemeldet')}</strong><small>Spielstände können auf anderen Geräten nach Anmeldung wiederhergestellt werden.</small></div><button class="btn btn-secondary" data-account-signout>Abmelden</button></div><div class="dialog-list account-slots">${v45AccountSlotsHtml(accountSaves)}</div>`
      :`<h3>Cloud-Konto</h3><p class="muted">Optional: Mit E-Mail und Passwort kannst du bis zu fünf Spielstände geräteübergreifend wiederherstellen.</p><div class="form-grid"><label><span>E-Mail</span><input id="accountEmail" type="email" autocomplete="email"></label><label><span>Passwort</span><input id="accountPassword" type="password" minlength="6" autocomplete="current-password"></label></div><div class="dialog-footer"><button class="btn btn-primary" data-account-login>Anmelden</button><button class="btn btn-secondary" data-account-register>Konto anlegen</button></div>`;
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Cloud & Online</p><h2>Syndikat über mehrere Geräte</h2></div><button class="icon-btn" data-close>✕</button></div>${accountHtml}
      <h3>Online-Partie erstellen</h3><div class="form-grid"><label><span>Name</span><input id="cloudName" maxlength="24" value="Spieler"></label><label><span>Familie</span><input id="cloudFamily" maxlength="24" value="Leone"></label><label><span>Schwierigkeit</span><select id="cloudDifficulty"><option value="easy">Leicht</option><option value="normal" selected>Normal</option><option value="hard">Schwer</option><option value="boss">Boss</option></select></label><label><span>Partielänge</span><select id="cloudLength"><option value="short">Kurz</option><option value="normal" selected>Normal</option><option value="long">Lang</option><option value="endless">Endlos</option></select></label><label><span>Zusätzliche KI</span><select id="cloudAi"><option>0</option><option selected>2</option><option>4</option><option>6</option></select></label></div><div class="dialog-footer"><button class="btn btn-primary" data-cloud-create>Lobby erstellen</button></div>
      <h3>Lobby beitreten</h3><div class="form-grid"><label><span>Spielcode</span><input id="joinCode"></label><label><span>Name</span><input id="joinName" value="Spieler"></label><label><span>Familie</span><input id="joinFamily" value="Familie"></label></div><div class="dialog-footer"><button class="btn btn-secondary" data-cloud-join>Beitreten</button></div>
      <h3>Cloud-Spielstand</h3><div class="dialog-footer">${state?'<button class="btn btn-secondary" data-cloud-save-new>Neuen Cloud-Save anlegen</button><button class="btn btn-secondary" data-cloud-save-update>Verknüpften Save aktualisieren</button>':''}</div>
      <div class="form-grid"><label><span>Cloud-Code</span><input id="cloudLoadCode"></label><label><span>Schlüssel</span><input id="cloudLoadToken"></label></div><div class="dialog-footer"><button class="btn btn-secondary" data-cloud-load>Laden</button></div></div>`);
    $('[data-cloud-create]').onclick=v45CreateLobby;$('[data-cloud-join]').onclick=v45JoinLobby;$('[data-cloud-save-new]')?.addEventListener('click',v45CloudSaveNew);$('[data-cloud-save-update]')?.addEventListener('click',v45CloudSaveUpdate);$('[data-cloud-load]').onclick=v45CloudLoad;
    $('[data-account-login]')?.addEventListener('click',()=>v45AccountSignIn(false));$('[data-account-register]')?.addEventListener('click',()=>v45AccountSignIn(true));$('[data-account-signout]')?.addEventListener('click',v45AccountSignOut);
    $('[data-account-save]').forEach(b=>b.onclick=()=>v45AccountSave(+b.dataset.accountSave));$('[data-account-load]').forEach(b=>b.onclick=()=>v45AccountLoad(+b.dataset.accountLoad));$('[data-account-delete]').forEach(b=>b.onclick=()=>v45AccountDelete(+b.dataset.accountDelete));
  }

  const v45EndTurn=endHumanTurn;
  endHumanTurn=function(){
    if(!onlineSession||!v45Cloud()?.enabled)return v45EndTurn();
    const p=currentPlayer();if(!p||p.onlineParticipantId!==onlineSession.participantId)return toast('Du bist in dieser Online-Partie gerade nicht am Zug.');
    v45EndTurn();
    (async()=>{
      try{
        if(!onlineRoster.length)onlineRoster=await v45Cloud().getPlayers(onlineSession.code,onlineSession.token);
        const next=currentPlayer(),nextPid=next?.onlineParticipantId||null;
        const patch={game_state:v45CanonicalState(),status:state.gameOver?'finished':'playing',active_participant_id:nextPid,winner_participant_id:state.gameOver?(state.players.find(x=>x.id===state.winnerId)?.onlineParticipantId||null):null};
        const row=await v45Cloud().submitTurn(onlineSession,onlineRevision,patch.game_state,nextPid,patch.status,patch.winner_participant_id);onlineRevision=Number(row.revision);await v45Cloud().signalGame?.(onlineSession,onlineRevision,'state');
      }catch(e){toast('Online-Synchronisation fehlgeschlagen: '+e.message);}
    })();
  };

  const v45Render=renderAll;
  renderAll=function(){
    v45Render();
    if(onlineSession&&v45Cloud()?.enabled){
      const p=currentPlayer(),mine=p?.onlineParticipantId===onlineSession.participantId||p?.type==='ai';
      if(p?.type==='remote'||!mine){
        const b=$('#statusBanner');b.className='status-banner';b.textContent=`Online: ${p?.name||p?.family||'Mitspieler'} ist am Zug. Die Ansicht aktualisiert sich automatisch.`;
        $('#gameScreen .content-area button').forEach(x=>x.disabled=true);
      }
    }
  };

  function v45InstallCloudButton(){
    const c=v45Cloud();if(!c?.enabled)return;
    const actions=$('#menuScreen .menu-actions');if(actions&&!actions.querySelector('[data-cloud-hub]')){actions.insertAdjacentHTML('beforeend','<button class="btn btn-secondary btn-xl" data-cloud-hub>Cloud & Online</button>');$('[data-cloud-hub]').onclick=v45OpenCloudHub;}
    v45LoadSession();v45StartPolling();
  }
  window.addEventListener('syndikat-cloud-ready',v45InstallCloudButton);
  if(window.SyndikatCloud)v45InstallCloudButton();
  window.SyndikatOnline={open:v45OpenCloudHub,refresh:v45RefreshOnline};
})();
/* SYNDIKAT_V45_CLOUD_UI_END */

/* SYNDIKAT_V541_UI_ART_BEGIN */
(function SYNDIKAT_V541_UI_ART(){
  const A='./assets/';
  const ART={
    main:A+'ui-mainmenu.webp',
    saves:A+'ui-saves-cloud.webp',
    online:A+'ui-online-lobby.webp',
    settings:A+'ui-settings-help.webp',
    finance:A+'ui-finance.webp',
    hall:A+'ui-hall-fame.webp',
    tutorial:A+'ui-tutorial.webp',
    stats:A+'ui-stats-admin.webp'
  };

  const style=document.createElement('style');
  style.textContent=`
    .hero-panel.ui-art-main{
      position:relative;overflow:hidden;
      background:
        linear-gradient(135deg,rgba(5,7,10,.70),rgba(5,7,10,.93)),
        url("./assets/ui-mainmenu.webp") center/cover no-repeat;
      border-color:rgba(213,179,107,.32)
    }
    .hero-panel.ui-art-main>*{position:relative;z-index:1}
    .ui-art-banner{
      width:100%;aspect-ratio:3.55/1;max-height:180px;object-fit:cover;
      border:1px solid rgba(213,179,107,.30);border-radius:12px;
      margin:.2rem 0 1rem;display:block;box-shadow:0 10px 28px rgba(0,0,0,.26)
    }
    .section-head+.ui-art-banner{margin-top:-.1rem}
    .setup-card>.ui-art-banner{margin-top:.6rem}
    #financeView>.ui-art-banner,#rankingView>.ui-art-banner,#missionsView>.ui-art-banner{margin-bottom:1rem}
    @media(max-width:720px){
      .ui-art-banner{max-height:116px;border-radius:9px;margin-bottom:.75rem}
      .hero-panel.ui-art-main{background-position:42% center}
    }
  `;
  document.head.appendChild(style);

  function banner(host,src,key){
    if(!host||!src)return;
    const existing=host.querySelector(':scope > [data-ui-art="'+key+'"]');
    if(existing){if(existing.getAttribute('src')!==src)existing.src=src;return;}
    const img=document.createElement('img');
    img.className='ui-art-banner';
    img.src=src;
    img.alt='';
    img.loading='lazy';
    img.dataset.uiArt=key;
    const head=host.querySelector(':scope > .dialog-head, :scope > .panel-head, :scope > .section-head');
    if(head)head.insertAdjacentElement('afterend',img);else host.prepend(img);
  }

  function decorateStatic(){
    document.querySelector('#menuScreen .hero-panel')?.classList.add('ui-art-main');
    banner(document.querySelector('#setupScreen .setup-card'),ART.stats,'setup');
    banner(document.querySelector('#financeView'),ART.finance,'finance');
    banner(document.querySelector('#rankingView'),ART.stats,'ranking');
    banner(document.querySelector('#missionsView'),ART.tutorial,'missions');
  }

  function decorateDialog(){
    const root=document.querySelector('#dialogContent .dialog-wrap');
    if(!root)return;
    const h=(root.querySelector('h2')?.textContent||'').trim();
    const eyebrow=(root.querySelector('.eyebrow')?.textContent||'').trim();
    let src=null,key='';

    if(/^Lobby\b/i.test(h)||/Online-Multiplayer/i.test(eyebrow)){
      src=ART.online;key='online';
    }else if(/Syndikat über mehrere Geräte|Cloud-Spielstand erstellt|Zugangsdaten sichern|Cloud & Online/i.test(h+' '+eyebrow)){
      src=ART.saves;key='cloud';
    }else if(/Speichern & Wiederherstellen/i.test(h)){
      src=ART.saves;key='saves';
    }else if(/Anzeige & Barrierefreiheit|Einstellungen|Hilfe/i.test(h)||h==='Mehr'||/Spielmenü/i.test(eyebrow)){
      src=ART.settings;key='settings';
    }else if(/Hall of Fame|Erfolge/i.test(h)){
      src=ART.hall;key='hall';
    }else if(/^Tutorial/i.test(eyebrow)||/Tutorial/i.test(h)){
      src=ART.tutorial;key='tutorial';
    }else if(/Nachrichten & Ereignisse|Chronik|Statistik|Rangliste|Verwaltung/i.test(h)){
      src=ART.stats;key='stats';
    }

    if(src)banner(root,src,key);
  }

  let queued=false;
  function decorate(){
    queued=false;
    decorateStatic();
    decorateDialog();
  }

  const schedule=()=>{
    if(queued)return;
    queued=true;
    if(typeof queueMicrotask==='function')queueMicrotask(decorate);
    else setTimeout(decorate,0);
  };

  if(typeof MutationObserver!=='undefined'){
    const observer=new MutationObserver(schedule);
    if(document.body){
      observer.observe(document.body,{childList:true,subtree:true});
      decorate();
    }else{
      document.addEventListener('DOMContentLoaded',()=>{
        observer.observe(document.body,{childList:true,subtree:true});
        decorate();
      },{once:true});
    }
  }else if(document.body){
    decorate();
  }else{
    document.addEventListener('DOMContentLoaded',decorate,{once:true});
  }

  window.SyndikatUiArt=ART;
})();
/* SYNDIKAT_V541_UI_ART_END */

/* SYNDIKAT_V46_DECISIONS_BEGIN */
(function SYNDIKAT_V46_DECISIONS(){
  const DECISIONS={
    takeover:{
      title:'Ein Viertel liegt dir zu Füßen',
      intro:d=>`Du kontrollierst nun ${d.name}. Wie soll deine Familie die neue Macht nutzen?`,
      options:[
        {id:'soft',name:'Ruhe & gute Geschäfte',desc:'Investiere in Stabilität. Weniger Heat, mehr Reputation.',cost:12000,apply:(p,d)=>{p.clean=Math.max(0,p.clean-12000);p.heat=clamp(p.heat-12,0,100);p.reputation=clamp(p.reputation+5,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence-5,0,100);d.demand=clamp(d.demand+.03,.65,1.35);}},
        {id:'hard',name:'Die Straße gehört uns',desc:'Schutzgeld und Einschüchterung ausbauen. Mehr Geld, aber mehr Druck.',cost:0,apply:(p,d)=>{p.heat=clamp(p.heat+14,0,100);p.reputation=clamp(p.reputation+3,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+7,0,100);p.protection=p.protection||{};const lv=p.protection[d.id]?.level||0;p.protection[d.id]={level:Math.min(3,lv+1),started:state.round};}},
        {id:'develop',name:'Investieren & aufwerten',desc:'20.000 $ in Infrastruktur und Immobilienwerte investieren.',cost:20000,apply:(p,d)=>{p.clean=Math.max(0,p.clean-20000);d.demand=clamp(d.demand+.06,.65,1.40);for(const lot of state.propertyMarket||[])if(lot.district===d.id)lot.value=Math.round(lot.value*1.04);p.reputation=clamp(p.reputation+4,0,100);}}
      ]
    },
    press:{
      title:'Die Zeitung stellt Fragen',
      intro:()=>`Ein Reporter verbindet mehrere Vorfälle mit deiner Familie. Eine falsche Reaktion kann Ermittlungen beschleunigen.`,
      options:[
        {id:'lawyer',name:'Anwälte vorschicken',desc:'Sauber, teuer und kontrolliert.',cost:9000,apply:p=>{p.clean=Math.max(0,p.clean-9000);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence-9,0,100);p.reputation=clamp(p.reputation+2,0,100);}},
        {id:'bribe',name:'Redaktion schmieren',desc:'Billiger, aber ein weiteres Korruptionsrisiko.',cost:6000,apply:p=>{p.dirty=Math.max(0,p.dirty-6000);if(p.investigation){p.investigation.evidence=clamp(p.investigation.evidence-6,0,100);p.investigation.corruptionExposure=clamp(p.investigation.corruptionExposure+12,0,100);}p.heat=clamp(p.heat+2,0,100);}},
        {id:'ignore',name:'Ignorieren',desc:'Kein Geld ausgeben, dafür steigt die öffentliche Aufmerksamkeit.',cost:0,apply:p=>{p.heat=clamp(p.heat+8,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+5,0,100);}}
      ]
    },
    labor:{
      title:'Arbeitskampf in deinen Betrieben',
      intro:()=>`Beschäftigte verlangen bessere Bedingungen. Deine Entscheidung beeinflusst Kosten, Ruf und Loyalität.`,
      options:[
        {id:'pay',name:'Löhne erhöhen',desc:'15.000 $ zahlen, Loyalität und Ruf steigen.',cost:15000,apply:p=>{p.clean=Math.max(0,p.clean-15000);for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty+7,0,100);p.reputation=clamp(p.reputation+4,0,100);}},
        {id:'manager',name:'Manager verhandeln lassen',desc:'Erfolg hängt von deinem Management ab.',cost:4000,apply:p=>{p.clean=Math.max(0,p.clean-4000);const ok=chance(.35+roleSkill(p,'manager')/160);if(ok){for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty+3,0,100);p.reputation+=2;}else{for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty-6,0,100);p.lastExpenses+=5000;spend(p,5000,true);}}},
        {id:'force',name:'Einschüchtern',desc:'Kurzfristig billig, langfristig riskant.',cost:0,apply:p=>{p.heat=clamp(p.heat+10,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+6,0,100);for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty-rand(2,6),0,100);}}
      ]
    }
  };
  function v46Ensure(p){p.pendingDecisions=Array.isArray(p.pendingDecisions)?p.pendingDecisions:[];p.controlMilestones=p.controlMilestones||{};p.stats=p.stats||{};p.stats.decisions=Number(p.stats.decisions)||0;p.stats.aiTrades=Number(p.stats.aiTrades)||0;}
  function v46Queue(p,type,data={}){
    v46Ensure(p);
    if(p.pendingDecisions.some(x=>x.type===type&&JSON.stringify(x.data||{})===JSON.stringify(data||{})))return;
    p.pendingDecisions.push({id:uid(),type,data,round:state.round});
  }
  function v46CheckTerritory(p){
    v46Ensure(p);
    for(const d of DISTRICTS){
      const control=districtShare(p,d.id)>=50;
      if(control&&!p.controlMilestones[d.id]){
        p.controlMilestones[d.id]=state.round;
        if(p.type==='human'||p.type==='remote')v46Queue(p,'takeover',{district:d.id});
        else v46ResolveAiDecision(p,{type:'takeover',data:{district:d.id}});
        log(`${p.family} übernimmt die Kontrolle in ${d.name}.`);
      }
    }
  }
  function v46MaybeCityDecision(p){
    if(p.type!=='human'&&p.type!=='remote')return;
    if(p.pendingDecisions.length)return;
    if(state.round>=12&&state.round%17===0&&chance(.55))v46Queue(p,roleSkill(p,'lawyer')>roleSkill(p,'manager')?'press':'labor',{});
  }
  function v46ResolveAiDecision(p,d){
    const spec=DECISIONS[d.type];if(!spec)return;let option=spec.options[0];
    if(d.type==='takeover'){option=p.profile==='aggressive'?spec.options[1]:p.profile==='economic'?spec.options[2]:spec.options[0];}
    if(d.type==='press'){option=p.profile==='corrupt'?spec.options[1]:p.profile==='economic'?spec.options[0]:spec.options[2];}
    if(d.type==='labor'){option=p.profile==='aggressive'?spec.options[2]:p.profile==='economic'?spec.options[1]:spec.options[0];}
    const district=d.data?.district?DISTRICTS.find(x=>x.id===d.data.district):null;
    const pool=option.cost?Math.max(p.clean,p.dirty):Infinity;if(pool<option.cost)option=spec.options.find(x=>x.cost===0)||spec.options[0];
    option.apply(p,district);p.stats.decisions++;log(`${p.family}: Entscheidung „${option.name}“.`);
  }
  function v46OpenDecision(id=null){
    const p=currentPlayer();v46Ensure(p);const dec=id?p.pendingDecisions.find(x=>x.id===id):p.pendingDecisions[0];if(!dec)return toast('Keine Entscheidung offen.');
    const spec=DECISIONS[dec.type];if(!spec)return;
    const d=dec.data?.district?DISTRICTS.find(x=>x.id===dec.data.district):null;
    openDialog(`<div class="dialog-wrap decision-dialog"><div class="dialog-head"><div><p class="eyebrow">Entscheidung · Runde ${dec.round}</p><h2>${esc(spec.title)}</h2></div><button class="icon-btn" data-close>✕</button></div><p>${esc(spec.intro(d))}</p><div class="dialog-list">${spec.options.map(o=>{const enough=o.cost===0||p.clean>=o.cost||p.dirty>=o.cost;return `<div class="dialog-option"><div><strong>${esc(o.name)}</strong><p>${esc(o.desc)}${o.cost?` · Kosten ${fmt(o.cost)}`:''}</p></div><button class="btn btn-primary" data-decision="${o.id}" ${enough?'':'disabled'}>Wählen</button></div>`}).join('')}</div></div>`);
    $('[data-decision]').forEach(btn=>btn.onclick=()=>{const o=spec.options.find(x=>x.id===btn.dataset.decision);if(!o)return;o.apply(p,d);p.pendingDecisions=p.pendingDecisions.filter(x=>x.id!==dec.id);p.stats.decisions++;log(`${p.family}: Entscheidung „${o.name}“.`);closeDialog();saveGame();renderAll();toast('Entscheidung umgesetzt.');});
  }

  function v46AiTrade(p){
    if(p.clean<180000||p.businesses.length<2||chance(.90))return false;
    const candidates=state.players.filter(t=>t.id!==p.id&&!t.eliminated&&t.type==='ai'&&relation(p,t)>8&&t.businesses.length&&!allianceActive(p,t));
    if(!candidates.length)return false;
    const t=candidates[rand(0,candidates.length-1)];
    const b=[...t.businesses].filter(b=>(BUSINESSES[b.type].tier||1)<=Math.max(4,Math.floor((p.reputation||0)/18)+1)).sort((a,b)=>BUSINESSES[b.type].influence-BUSINESSES[a.type].influence)[0];
    if(!b)return false;
    const price=Math.round(BUSINESSES[b.type].cost*(.92+b.level*.10)*(b.health/100));
    if(p.clean<price*1.35)return false;
    const accept=relation(t,p)>18||t.clean<25000||chance(.18);
    if(!accept)return false;
    p.clean-=price;t.clean+=price;t.businesses=t.businesses.filter(x=>x.id!==b.id);b.propertyId=null;b.leaseCost=0;p.businesses.push(b);p.stats.aiTrades++;t.stats.aiTrades=(t.stats.aiTrades||0)+1;adjustRelation(p,t,5);log(`${p.family} kauft ${BUSINESSES[b.type].name} von ${t.family} für ${fmt(price)}.`);return true;
  }

  const v46Init=initPlayer;
  initPlayer=function(p){v46Init(p);v46Ensure(p);};
  const v46Migrate=migrateState;
  migrateState=function(data){data=v46Migrate(data);(data.players||[]).forEach(v46Ensure);return data;};

  const v46End=processEndOfTurn;
  processEndOfTurn=function(p){
    v46End(p);v46CheckTerritory(p);v46MaybeCityDecision(p);saveGame();
  };

  const v46Ai=aiTurn;
  aiTurn=function(p){if(!v46AiTrade(p))v46Ai(p);};

  const v46City=renderCity;
  renderCity=function(){
    v46City();const p=currentPlayer();v46Ensure(p);const list=$('#situationList');
    if(p.pendingDecisions.length&&list&&!list.querySelector('[data-open-decision]')){
      list.insertAdjacentHTML('afterbegin',`<div class="situation-item decision-row"><span>Entscheidung offen</span><button class="btn btn-primary" data-open-decision>${p.pendingDecisions.length} Entscheidung${p.pendingDecisions.length===1?'':'en'}</button></div>`);
      $('[data-open-decision]',list).onclick=()=>v46OpenDecision();
    }
  };

  const v46More=openMoreMenu;
  openMoreMenu=function(){
    v46More();const p=currentPlayer(),root=$('#dialogContent .more-grid');if(root&&p?.pendingDecisions?.length&&!root.querySelector('[data-v46-decisions]')){root.insertAdjacentHTML('beforeend',`<button class="btn btn-primary" data-v46-decisions>◆ Entscheidungen (${p.pendingDecisions.length})</button>`);$('[data-v46-decisions]',root).onclick=()=>v46OpenDecision();}
  };

  window.SyndikatDecisions={open:v46OpenDecision};
})();
/* SYNDIKAT_V46_DECISIONS_END */

/* SYNDIKAT_V47_JUSTICE_BEGIN */
(function SYNDIKAT_V47_JUSTICE(){
  function ensureJustice(p){
    p.courtCases=Array.isArray(p.courtCases)?p.courtCases:[];
    p.courtHistory=Array.isArray(p.courtHistory)?p.courtHistory:[];
    p.stats=p.stats||{};
    for(const k of ['casesOpened','acquittals','pleaDeals','convictions','courtCorruption']){
      p.stats[k]=Number(p.stats[k])||0;
    }
  }

  function activeCase(p){
    ensureJustice(p);
    return p.courtCases.find(c=>c.status==='pending')||null;
  }

  function caseCharge(p){
    const src=String(p.investigation?.lastCase||'Organisierte Kriminalität').toLowerCase();
    if(src.includes('bank'))return 'Bewaffneter Raub';
    if(src.includes('mord')||src.includes('anschlag'))return 'Gewaltdelikt';
    if(src.includes('entführung'))return 'Entführung';
    if(src.includes('sabotage'))return 'Sachbeschädigung & Erpressung';
    if(src.includes('spielautomat')||src.includes('passant')||src.includes('auto'))return 'Raub & Diebstahl';
    return 'Organisierte Kriminalität';
  }

  function maybeOpenCase(p){
    ensureJustice(p);
    if(activeCase(p)||p.eliminated||state.round<5)return;
    const evidence=Number(p.investigation?.evidence)||0;
    if(evidence<62)return;
    const openChance=.08+(evidence-60)/240+(Number(p.heat)||0)/700;
    if(!chance(openChance))return;
    const severity=evidence>=86?3:(evidence>=74?2:1);
    const c={
      id:uid(),
      charge:caseCharge(p),
      severity,
      evidenceAtOpen:Math.round(evidence),
      openedRound:state.round,
      hearingRound:state.round+rand(2,4),
      status:'pending',
      result:null,
      fine:0,
      jail:0
    };
    p.courtCases.push(c);
    p.stats.casesOpened++;
    if(p.investigation)p.investigation.stage='Anklage vorbereitet';
    log(`${p.family}: Staatsanwaltschaft erhebt Anklage wegen ${c.charge}. Termin in Runde ${c.hearingRound}.`);
  }

  function payLegal(p,amount,useDirty=false){
    amount=Math.max(0,Math.round(amount));
    if(useDirty){
      if(p.dirty<amount)return false;
      p.dirty-=amount;
      return true;
    }
    if(p.clean>=amount){
      p.clean-=amount;
      return true;
    }
    const missing=amount-p.clean;
    p.clean=0;
    p.debt+=missing;
    return true;
  }

  function refreshInvestigationStage(p){
    if(!p.investigation)return;
    const e=p.investigation.evidence||0;
    p.investigation.warrant=e>=70;
    p.investigation.stage=e>=85?'Anklage droht':e>=70?'Haftbefehl':e>=50?'Aktive Ermittlungen':e>=28?'Observation':'Keine Akte';
  }

  function closeCase(p,c,result,opts={}){
    const fine=Number(opts.fine)||0;
    const jail=Number(opts.jail)||0;
    const evidenceDelta=Number(opts.evidenceDelta)||0;
    const rep=Number(opts.rep)||0;
    c.status='closed';
    c.result=result;
    c.fine=fine;
    c.jail=jail;
    c.closedRound=state.round;
    if(fine>0)payLegal(p,fine,false);
    if(jail>0)p.jailed=Math.max(p.jailed,jail);
    if(p.investigation){
      p.investigation.evidence=clamp((p.investigation.evidence||0)+evidenceDelta,0,100);
      refreshInvestigationStage(p);
    }
    p.reputation=clamp((p.reputation||0)+rep,0,100);
    p.courtHistory.unshift(JSON.parse(JSON.stringify(c)));
    if(p.courtHistory.length>12)p.courtHistory.length=12;
    p.courtCases=p.courtCases.filter(x=>x.id!==c.id);
  }

  function resolveCase(p,c,mode,auto=false){
    if(!c||c.status!=='pending')return;
    const lawyer=roleSkill(p,'lawyer');
    const judge=p.bribes?.judge?1:0;
    const prosecutor=p.bribes?.prosecutor?1:0;
    const evidence=Number(p.investigation?.evidence)||c.evidenceAtOpen;
    const severity=c.severity;

    if(mode==='fight'){
      const cost=7000+severity*6500;
      payLegal(p,cost,false);
      const winChance=clamp(.22+lawyer/145+judge*.08+prosecutor*.06-evidence/240,.08,.82);
      if(chance(winChance)){
        p.stats.acquittals++;
        closeCase(p,c,'Freispruch',{evidenceDelta:-rand(22,38),rep:3});
        log(`${p.family}: Freispruch im Verfahren ${c.charge}.`);
        if(!auto)toast('Freispruch. Die Beweislage bricht deutlich ein.');
      }else{
        const fine=12000+severity*18000;
        const jail=Math.max(0,severity+(evidence>=88?1:0));
        p.stats.convictions++;
        closeCase(p,c,'Verurteilt',{fine,jail,evidenceDelta:-10,rep:-3});
        log(`${p.family}: Verurteilung wegen ${c.charge}.`);
        if(!auto)toast(`Verurteilt: ${fmt(fine)} Geldstrafe, ${jail} Runde(n) Haft.`);
      }
    }

    if(mode==='deal'){
      const fine=8000+severity*12000;
      const jail=severity>=3?2:(severity>=2?1:0);
      p.stats.pleaDeals++;
      closeCase(p,c,'Deal mit Staatsanwaltschaft',{fine,jail,evidenceDelta:-18,rep:-2});
      log(`${p.family}: Deal mit Staatsanwaltschaft im Verfahren ${c.charge}.`);
      if(!auto)toast(`Deal akzeptiert: ${fmt(fine)} und ${jail} Runde(n) Haft.`);
    }

    if(mode==='corrupt'){
      const cost=10000+severity*14000;
      if(p.dirty<cost&&!auto){
        toast('Nicht genug schmutziges Geld für diesen Versuch.');
        return;
      }
      if(p.dirty>=cost){
        p.dirty-=cost;
      }else{
        const missing=cost-p.dirty;
        p.dirty=0;
        p.debt+=missing;
      }
      const winChance=clamp(.14+judge*.24+prosecutor*.26+shield(p)/260+lawyer/500-evidence/360,.05,.72);
      p.stats.courtCorruption++;
      if(chance(winChance)){
        if(p.investigation)p.investigation.corruptionExposure=clamp((p.investigation.corruptionExposure||0)+15,0,100);
        closeCase(p,c,'Verfahren eingestellt',{evidenceDelta:-rand(28,42),rep:-1});
        log(`${p.family}: Verfahren ${c.charge} überraschend eingestellt.`);
        if(!auto)toast('Das Verfahren wird eingestellt. Die Gegenleistung bleibt nicht unsichtbar.');
      }else{
        if(p.investigation)p.investigation.corruptionExposure=clamp((p.investigation.corruptionExposure||0)+30,0,100);
        p.stats.convictions++;
        closeCase(p,c,'Korruptionsversuch aufgeflogen',{fine:18000+severity*16000,jail:severity+1,evidenceDelta:10,rep:-7});
        log(`${p.family}: Korruptionsversuch vor Gericht fliegt auf.`);
        if(!auto)toast('Der Bestechungsversuch fliegt auf. Die Lage verschärft sich massiv.');
      }
    }

    if(mode==='default'){
      const fine=15000+severity*18000;
      const jail=severity+1;
      p.stats.convictions++;
      closeCase(p,c,'Säumnisurteil',{fine,jail,evidenceDelta:-5,rep:-5});
      log(`${p.family}: Säumnisurteil im Verfahren ${c.charge}.`);
    }

    saveGame();
    renderAll();
  }

  function openCourt(){
    const p=currentPlayer();
    ensureJustice(p);
    const c=activeCase(p);
    const activeHtml=c?`
      <article class="panel court-case">
        <div class="panel-head"><h3>${esc(c.charge)}</h3><span class="pill ${state.round>=c.hearingRound?'bad':''}">${state.round>=c.hearingRound?'Termin jetzt':`Runde ${c.hearingRound}`}</span></div>
        <div style="padding:1rem">
          <div class="finance-grid">${metricCards([
            ['Beweise bei Anklage',`${c.evidenceAtOpen}/100`,c.evidenceAtOpen>=80?'negative':''],
            ['Schweregrad',c.severity,''],
            ['Anwalt',`${Math.round(roleSkill(p,'lawyer'))}/100`,''],
            ['Aktuelle Beweise',`${Math.round(p.investigation?.evidence||0)}/100`,'']
          ])}</div>
          <p class="muted">Lege vor dem Rundenende deine Strategie fest. Überspringst du einen fälligen Termin, droht ein Säumnisurteil.</p>
          <div class="dialog-list">
            <div class="dialog-option"><div><strong>Vor Gericht kämpfen</strong><p>Teure Verteidigung. Erfolg hängt stark von Anwälten und Beweislage ab.</p></div><button class="btn btn-primary" data-court="fight">Verteidigen · ${fmt(7000+c.severity*6500)}</button></div>
            <div class="dialog-option"><div><strong>Deal akzeptieren</strong><p>Planbare Strafe bei geringerem Prozessrisiko.</p></div><button class="btn btn-secondary" data-court="deal">Deal</button></div>
            <div class="dialog-option"><div><strong>Verfahren beeinflussen</strong><p>Richter/Staatsanwalt können helfen. Ein Auffliegen wäre verheerend.</p></div><button class="btn btn-danger" data-court="corrupt">Riskieren · ${fmt(10000+c.severity*14000)}</button></div>
          </div>
        </div>
      </article>`:'<div class="empty-state">Derzeit kein aktives Gerichtsverfahren.</div>';

    const history=p.courtHistory.length
      ?p.courtHistory.map(x=>`<div class="dialog-option"><div><strong>${esc(x.charge)} · ${esc(x.result||'Abgeschlossen')}</strong><p>Runde ${x.openedRound}–${x.closedRound||'?'} · Geldstrafe ${fmt(x.fine||0)} · Haft ${x.jail||0}</p></div></div>`).join('')
      :'<div class="empty-state">Noch keine abgeschlossenen Verfahren.</div>';

    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Justiz & Verteidigung</p><h2>Gerichtsakte</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-visual-banner"><img src="./assets/event-court.webp" alt="Gerichtssaal im Noir-Stil"><div><small>STAATSANWALTSCHAFT</small><strong>Jede Akte erzählt eine Geschichte. Sorge dafür, dass sie nicht mit deiner Verurteilung endet.</strong></div></div>${activeHtml}<h3>Fallarchiv</h3><div class="dialog-list">${history}</div></div>`);
    $('[data-court]').forEach(btn=>btn.onclick=()=>resolveCase(p,c,btn.dataset.court,false));
  }

  function resolveAiCase(p,c){
    if(!c)return;
    const lawyer=roleSkill(p,'lawyer');
    const evidence=Number(p.investigation?.evidence)||0;
    if((p.bribes?.judge||p.bribes?.prosecutor)&&p.dirty>30000&&p.profile==='corrupt'){
      resolveCase(p,c,'corrupt',true);
      return;
    }
    if(lawyer>55||evidence<72){
      resolveCase(p,c,'fight',true);
      return;
    }
    resolveCase(p,c,'deal',true);
  }

  const baseInit=initPlayer;
  initPlayer=function(p){
    baseInit(p);
    ensureJustice(p);
  };

  const baseMigrate=migrateState;
  migrateState=function(data){
    data=baseMigrate(data);
    for(const p of data.players||[])ensureJustice(p);
    return data;
  };

  const baseEnd=processEndOfTurn;
  processEndOfTurn=function(p){
    ensureJustice(p);
    const c=activeCase(p);
    if(c&&c.hearingRound<=state.round){
      if(p.type==='ai'){
        resolveAiCase(p,c);
      }else if(p.type==='human'||p.type==='remote'){
        resolveCase(p,c,'default',true);
      }
    }
    baseEnd(p);
    maybeOpenCase(p);
    saveGame();
  };

  const baseActions=renderActions;
  renderActions=function(){
    baseActions();
    const p=currentPlayer();
    const c=p?activeCase(p):null;
    if(!p||!c)return;
    const panel=$('#actionsView .action-panel .button-grid');
    if(panel&&!panel.querySelector('[data-v47-court]')){
      panel.insertAdjacentHTML('beforeend',`<button class="btn ${state.round>=c.hearingRound?'btn-danger':'btn-secondary'}" data-v47-court>⚖ Gerichtsverfahren · R${c.hearingRound}</button>`);
      $('[data-v47-court]',panel).onclick=openCourt;
    }
  };

  const baseCity=renderCity;
  renderCity=function(){
    baseCity();
    const p=currentPlayer();
    const c=p?activeCase(p):null;
    const list=$('#situationList');
    if(c&&list&&!list.querySelector('[data-v47-case]')){
      list.insertAdjacentHTML('afterbegin',`<div class="situation-item" data-v47-case><span>Gerichtsverfahren</span><button class="btn ${state.round>=c.hearingRound?'btn-danger':'btn-secondary'}" data-open-court>${esc(c.charge)} · R${c.hearingRound}</button></div>`);
      $('[data-open-court]',list)?.addEventListener('click',openCourt);
    }
  };

  const baseRender=renderAll;
  renderAll=function(){
    baseRender();
    if(!state)return;
    const p=currentPlayer();
    const c=p?activeCase(p):null;
    if(c&&state.round>=c.hearingRound){
      const b=$('#statusBanner');
      b.className='status-banner danger';
      b.textContent=`GERICHTSTERMIN: ${c.charge}. Entscheide vor dem Rundenende über deine Verteidigungsstrategie.`;
    }
  };

  window.SyndikatJustice={open:openCourt};
})();
/* SYNDIKAT_V47_JUSTICE_END */

/* SYNDIKAT_V49_FINAL_GAMEPLAY_BEGIN */
(function SYNDIKAT_V49_FINAL_GAMEPLAY(){
  function ensureFinalSystems(p){
    p.prisonState=p.prisonState||{influence:0,tunnel:0,contraband:0,contacts:0};
    p.leadership=p.leadership||{actingBossId:null,crises:0,lastCrisisRound:0};
    p.finalCrisis=p.finalCrisis||{triggered:false,active:false,choice:null,startedRound:0,resolveRound:0,resolved:false,outcome:null};
    p.stats=p.stats||{};
    for(const k of ['prisonAppeals','prisonBribes','prisonNetworks','prisonEscapes','prisonFailedEscapes','delegations','equipmentRepairs','machineRepairs','leadershipCrises','finalCrisesWon']){
      p.stats[k]=Number(p.stats[k])||0;
    }
  }

  function activeLeader(p){
    ensureFinalSystems(p);
    const active=activeStaff(p);
    let leader=active.find(s=>s.id===p.underbossId);
    if(!leader&&p.leadership.actingBossId)leader=active.find(s=>s.id===p.leadership.actingBossId);
    if(!leader&&p.jailed>0){
      leader=[...active].filter(s=>s.level>=2&&s.loyalty>=50).sort((a,b)=>(b.level*12+b.skill+b.loyalty)-(a.level*12+a.skill+a.loyalty))[0]||null;
      p.leadership.actingBossId=leader?.id||null;
    }
    if(p.jailed<=0)p.leadership.actingBossId=null;
    return leader||null;
  }

  function leadershipEfficiency(p){
    if(p.jailed<=0)return 1;
    const leader=activeLeader(p);
    if(!leader)return .70;
    return clamp(.82+leader.level*.018+leader.skill*.0010+leader.loyalty*.0006,.82,.98);
  }

  const baseEstimate=estimateIncome;
  estimateIncome=function(p,b){
    return baseEstimate(p,b)*leadershipEfficiency(p);
  };

  function equipmentDef(type,id){
    return window.SyndikatV4?.items?.[type]?.[id]||null;
  }
  function repairCost(type,item){
    const def=equipmentDef(type,item.id);
    if(!def)return 0;
    return Math.max(300,Math.round(def.cost*((100-(Number(item.condition)||100))/100)*.16));
  }
  function repairEquipment(type,id){
    const p=currentPlayer(),item=(p.inventory?.[type]||[]).find(x=>x.id===id);
    if(!item)return;
    const cost=repairCost(type,item);
    if(item.condition>=100)return toast('Bereits vollständig gewartet.');
    if(p.clean<cost)return toast(`Du brauchst ${fmt(cost)} sauberes Kapital.`);
    p.clean-=cost;item.condition=100;p.stats.equipmentRepairs++;
    ledger(p,`Wartung ${equipmentDef(type,id)?.name||id}`,-cost,'expense');
    saveGame();openArsenalFinal();
  }

  function buyEquipment(type,id){
    const p=currentPlayer(),def=equipmentDef(type,id);if(!def)return;
    const own=(p.inventory?.[type]||[]).some(x=>x.id===id);if(own)return;
    const clean=type!=='weapons',wallet=clean?p.clean:p.dirty;
    if(wallet<def.cost)return toast(`Nicht genug ${clean?'sauberes':'schmutziges'} Geld.`);
    if(clean)p.clean-=def.cost;else p.dirty-=def.cost;
    p.inventory[type].push({id,condition:100,acquiredRound:state.round});
    ledger(p,`${def.name} gekauft`,-def.cost,'asset');saveGame();openArsenalFinal();
  }

  function openArsenalFinal(){
    const p=currentPlayer();ensureFinalSystems(p);
    const defs=window.SyndikatV4?.items||{};
    const sections=Object.entries(defs).map(([type,items])=>{
      const title=type==='weapons'?'Waffen':type==='vehicles'?'Fahrzeuge':'Ausrüstung';
      return `<h3>${title}</h3><div class="dialog-list">${Object.entries(items).map(([id,d])=>{
        const item=(p.inventory?.[type]||[]).find(x=>x.id===id),currency=type==='weapons'?'schmutzig':'sauber';
        if(!item)return `<div class="dialog-option"><div><strong>${esc(d.name)}</strong><p>${esc(d.desc)} · Stärke ${d.power>=0?'+':''}${d.power} · Heat ${d.heat>=0?'+':''}${d.heat} · Spuren ${d.evidence>=0?'+':''}${d.evidence}</p></div><button class="btn btn-primary" data-final-buy="${type}:${id}">${fmt(d.cost)} ${currency}</button></div>`;
        const cond=Math.round(Number(item.condition)||100),cost=repairCost(type,item);
        return `<div class="dialog-option"><div><strong>${esc(d.name)}</strong><p>Zustand ${cond}% · Einsatzleistung ${Math.max(15,cond)}%<br>${esc(d.desc)}</p><div class="healthbar"><i style="width:${cond}%"></i></div></div><button class="btn btn-secondary" data-final-repair="${type}:${id}" ${cond>=100?'disabled':''}>${cond>=100?'Gewartet':`Warten ${fmt(cost)}`}</button></div>`;
      }).join('')}</div>`;
    }).join('');
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Logistik & Wartung</p><h2>Arsenal & Fuhrpark</h2></div><button class="icon-btn" data-close>✕</button></div><p class="muted">Einsatzmittel verschleißen bei Operationen. Schlechter Zustand reduziert ihre Wirkung und kann zusätzliche Spuren erzeugen.</p>${sections}</div>`);
    $('[data-final-buy]').forEach(btn=>btn.onclick=()=>{const [type,id]=btn.dataset.finalBuy.split(':');buyEquipment(type,id);});
    $('[data-final-repair]').forEach(btn=>btn.onclick=()=>{const [type,id]=btn.dataset.finalRepair.split(':');repairEquipment(type,id);});
  }

  openMachineManager=function(bid){
    const p=currentPlayer(),b=p.businesses.find(x=>x.id===bid);if(!b)return;
    b.machines=b.machines||createMachineUnits();
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Automatenstandorte & Wartung</p><h2>${esc(DISTRICTS.find(d=>d.id===b.district).name)}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${b.machines.map(m=>{
      const cond=Math.round(m.condition),cost=Math.max(180,Math.round((100-cond)*18));
      return `<div class="dialog-option"><div><strong>${esc(m.name)}</strong><p>Zustand ${cond}% · aktueller Ort: ${esc(MACHINE_LOCATIONS.find(x=>x.id===m.location)?.name||'Unbekannt')}</p><div class="healthbar"><i style="width:${cond}%"></i></div></div><div class="mini-actions"><select data-machine-loc="${m.id}">${MACHINE_LOCATIONS.map(l=>`<option value="${l.id}" ${m.location===l.id?'selected':''}>${esc(l.name)} · x${l.mult.toFixed(2)}</option>`).join('')}</select><button class="btn btn-secondary" data-machine-maintain="${m.id}" ${cond>=100?'disabled':''}>Warten ${fmt(cost)}</button></div></div>`;
    }).join('')}</div><div class="dialog-footer"><button class="btn btn-secondary" data-route-manager>Automatenroute zuweisen</button></div></div>`);
    $('[data-machine-loc]').forEach(sel=>sel.onchange=()=>{
      const m=b.machines.find(x=>x.id===sel.dataset.machineLoc);
      if(totalLiquid(p)<300){sel.value=m.location;return toast('Du brauchst 300 $ für den Standortwechsel.');}
      m.location=sel.value;spend(p,300,false);ledger(p,'Automat umgesetzt',-300,'expense');saveGame();openMachineManager(bid);
    });
    $('[data-machine-maintain]').forEach(btn=>btn.onclick=()=>{
      const m=b.machines.find(x=>x.id===btn.dataset.machineMaintain);if(!m)return;
      const cost=Math.max(180,Math.round((100-m.condition)*18));
      if(p.clean<cost)return toast('Nicht genug sauberes Geld.');
      p.clean-=cost;m.condition=100;p.stats.machineRepairs++;ledger(p,'Automatenwartung',-cost,'expense');saveGame();openMachineManager(bid);
    });
    $('[data-route-manager]').onclick=()=>openRoutesDialog(bid);
  };

  function prisonAction(kind){
    const p=currentPlayer();ensureFinalSystems(p);if(p.jailed<=0)return;
    const ps=p.prisonState,leader=activeLeader(p);
    const need=kind==='escape'?2:1;
    if(p.actionPoints<need)return toast('Nicht genug AP.');
    const spendDirty=(amount)=>{if(p.dirty<amount)return false;p.dirty-=amount;return true;};
    p.actionPoints-=need;

    if(kind==='appeal'){
      const cost=4000+Math.max(0,p.jailed-1)*1200;
      if(p.clean<cost){p.actionPoints+=need;return toast(`Du brauchst ${fmt(cost)} sauberes Kapital.`);}
      p.clean-=cost;p.stats.prisonAppeals++;
      const cut=chance(.38+roleSkill(p,'lawyer')/150+(p.bribes.judge?.12:0)+ps.influence/500)?rand(1,2):0;
      p.jailed=Math.max(0,p.jailed-cut);ledger(p,'Haft-Berufung',-cost,'expense');
      toast(cut?`Berufung erfolgreich: ${cut} Runde(n) weniger.`:'Die Berufung scheitert.');
    }
    if(kind==='guardbribe'){
      const cost=7500;
      if(!spendDirty(cost)){p.actionPoints+=need;return toast(`Du brauchst ${fmt(cost)} schmutziges Geld.`);}
      p.stats.prisonBribes++;ps.contraband=clamp(ps.contraband+12,0,100);
      if(chance(.42+ps.influence/240+shield(p)/300)){p.jailed=Math.max(0,p.jailed-1);ps.influence=clamp(ps.influence+5,0,100);toast('Die Wache spielt mit: 1 Runde weniger.');}
      else{p.heat=clamp(p.heat+8,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+4,0,100);toast('Bestechung scheitert und hinterlässt Spuren.');}
      ledger(p,'Gefängnisbestechung',-cost,'dirty');
    }
    if(kind==='network'){
      p.stats.prisonNetworks++;ps.influence=clamp(ps.influence+rand(12,22),0,100);ps.contacts++;
      if(chance(.28+ps.influence/450)){
        const person=createStaffPerson('informant');person.loyalty=clamp(person.loyalty+10,0,100);p.staffRoster.push(person);syncStaffCounts(p);toast(`Neuer Kontakt: ${person.name} arbeitet nach deiner Entlassung für dich.`);
      }else toast('Dein Einfluss hinter Gittern wächst.');
    }
    if(kind==='contraband'){
      const cost=4000;
      if(!spendDirty(cost)){p.actionPoints+=need;return toast(`Du brauchst ${fmt(cost)} schmutziges Geld.`);}
      ps.contraband=clamp(ps.contraband+rand(20,32),0,100);ps.influence=clamp(ps.influence+4,0,100);
      ledger(p,'Schmuggel in die Haft',-cost,'dirty');toast('Telefon, Geld und Werkzeug erreichen dich.');
    }
    if(kind==='tunnel'){
      const cost=3000;
      if(!spendDirty(cost)){p.actionPoints+=need;return toast(`Du brauchst ${fmt(cost)} schmutziges Geld.`);}
      const gain=rand(14,26)+Math.round(ps.contraband/18);ps.tunnel=clamp(ps.tunnel+gain,0,100);
      ledger(p,'Fluchtvorbereitung',-cost,'dirty');toast(`Fluchtplan +${gain}% vorbereitet.`);
    }
    if(kind==='delegate'){
      if(!leader){p.actionPoints+=need;return toast('Ohne Unterboss oder geeigneten Stellvertreter kann niemand zuverlässig übernehmen.');}
      p.stats.delegations++;
      const worst=[...p.businesses].sort((a,b)=>a.health-b.health)[0];
      if(worst&&worst.health<96){worst.health=clamp(worst.health+rand(8,16)+Math.round(leader.skill/20),0,100);toast(`${leader.name} stabilisiert ${BUSINESSES[worst.type].name}.`);}
      else{
        const staff=[...activeStaff(p)].sort((a,b)=>a.loyalty-b.loyalty)[0];if(staff)staff.loyalty=clamp(staff.loyalty+6,0,100);
        toast(`${leader.name} hält die Organisation zusammen.`);
      }
      leader.xp=(leader.xp||0)+12;
    }
    if(kind==='escape'){
      const prepared=ps.tunnel/220+ps.contraband/400+ps.influence/500;
      const success=chance(clamp(.08+prepared+roleSkill(p,'informant')/600+roleSkill(p,'gunman')/800,.08,.82));
      if(success){
        p.jailed=0;p.stats.prisonEscapes++;p.heat=clamp(p.heat+24,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+10,0,100);ps.tunnel=0;ps.contraband=Math.max(0,ps.contraband-45);toast('Flucht gelungen – aber die Fahndung läuft auf Hochtouren.');
      }else{
        p.jailed+=2;p.stats.prisonFailedEscapes++;p.heat=clamp(p.heat+14,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+7,0,100);ps.tunnel=Math.max(0,ps.tunnel-rand(25,45));toast('Flucht gescheitert: +2 Runden Haft und zusätzliche Beweise.');
      }
    }
    p.lastAction='Gefängnis: '+kind;saveGame();renderAll();
  }
  doPrisonAction=prisonAction;

  function renderPrison(){
    const p=currentPlayer();ensureFinalSystems(p);if(p.jailed<=0)return false;
    const ps=p.prisonState,leader=activeLeader(p),eff=Math.round(leadershipEfficiency(p)*100);
    $('#actionPoints').textContent=`${p.actionPoints} AP`;
    $('#crimeGrid').innerHTML=[
      ['appeal','Berufung','Anwälte greifen Urteil oder Haftdauer an.','1 AP · sauberes Geld'],
      ['guardbribe','Wache bestechen','Schmutziges Geld kann Haft verkürzen, aber neue Beweise erzeugen.','1 AP · $ 7.500'],
      ['network','Gefängnisnetzwerk','Baue Einfluss und Kontakte innerhalb der Haft auf.','1 AP'],
      ['contraband','Schmuggel organisieren','Telefon, Bargeld und Werkzeug verbessern weitere Haftaktionen.','1 AP · $ 4.000'],
      ['tunnel','Flucht vorbereiten','Baue schrittweise einen echten Fluchtplan auf.','1 AP · $ 3.000'],
      ['delegate','Organisation delegieren','Der Stellvertreter kümmert sich draußen um Betriebe und Loyalität.','1 AP'],
      ['escape','Fluchtversuch','Erfolg hängt jetzt von Vorbereitung, Schmuggel und Kontakten ab.','2 AP']
    ].map(x=>`<article class="crime-card"><h3>${x[1]}</h3><p>${x[2]}</p><div class="crime-meta"><span>${x[3]}</span></div><button class="btn btn-secondary" data-prison-final="${x[0]}" ${p.actionPoints<(x[0]==='escape'?2:1)?'disabled':''}>Ausführen</button></article>`).join('');
    const panel=$('#actionsView .action-panel');
    panel.innerHTML=`<div class="panel-head"><h3>Organisation aus der Haft</h3><small>${p.jailed} Runde(n) Resthaft</small></div><div class="prison-visual"><img src="./assets/event-prison-break.webp" alt="Gefängnis bei Nacht"><div><small>HINTER GITTERN</small><strong>Deine Geschäfte laufen weiter. Deine Freiheit nicht.</strong></div></div>
      <div class="finance-grid prison-metrics" style="padding:1rem">${metricCards([
        ['Gefängniseinfluss',`${Math.round(ps.influence)}%`,''],
        ['Fluchtplan',`${Math.round(ps.tunnel)}%`,ps.tunnel>=80?'positive':''],
        ['Schmuggelzugang',`${Math.round(ps.contraband)}%`,''],
        ['Stellvertreter',leader?esc(leader.name):'Keiner',leader?'positive':'negative'],
        ['Organisationseffizienz',`${eff}%`,eff>=90?'positive':eff<80?'negative':'']
      ])}</div>`;
    $('[data-prison-final]').forEach(b=>b.onclick=()=>prisonAction(b.dataset.prisonFinal));
    return true;
  }

  function leadershipTick(p){
    ensureFinalSystems(p);
    if(p.jailed<=0){p.leadership.actingBossId=null;return;}
    const leader=activeLeader(p);
    if(leader){
      leader.xp=(leader.xp||0)+3;
      for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty+1,0,100);
      if(leader.loyalty<42&&p.jailed>=3&&state.round-p.leadership.lastCrisisRound>=4&&chance(.10+(42-leader.loyalty)/220)){
        p.leadership.lastCrisisRound=state.round;p.leadership.crises++;p.stats.leadershipCrises++;
        const loss=Math.round(totalLiquid(p)*.10);spend(p,loss,false);p.reputation=Math.max(0,p.reputation-5);leader.loyalty=Math.max(5,leader.loyalty-10);
        log(`${p.family}: Führungskrise – ${leader.name} nutzt die Abwesenheit des Bosses aus.`);
      }
    }else{
      for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty-2,0,100);
      if(p.businesses.length&&chance(.14)){const b=p.businesses[rand(0,p.businesses.length-1)];b.health=clamp(b.health-rand(3,8),0,100);}
    }
  }

  function maybeTriggerFinalCrisis(p){
    ensureFinalSystems(p);
    if(p.finalCrisis.triggered||p.eliminated||state.round<30)return;
    if(powerIndex(p)<44&&netWorth(p)<3000000&&controlledDistricts(p)<2)return;
    p.finalCrisis={triggered:true,active:true,choice:null,startedRound:state.round,resolveRound:0,resolved:false,outcome:null};
    log(`${p.family}: Eine überregionale Taskforce und rivalisierende Familien reagieren auf den Machtzuwachs.`);
    if(p.type==='ai')chooseFinalCrisisAi(p);else toast('ENDGAME: Die Stadt schlägt zurück. Eine strategische Entscheidung ist nötig.');
  }

  function chooseFinalCrisisAi(p){
    let choice=p.profile==='aggressive'?'war':p.profile==='corrupt'?'politics':'legit';
    applyFinalChoice(p,choice,true);
  }

  function applyFinalChoice(p,choice,auto=false){
    ensureFinalSystems(p);if(!p.finalCrisis.active||p.finalCrisis.choice)return;
    if(choice==='legit'){
      const cost=250000;if(p.clean<cost&&!auto)return toast(`Du brauchst ${fmt(cost)} sauberes Kapital.`);
      if(p.clean>=cost)p.clean-=cost;else p.debt+=cost-p.clean,p.clean=0;
      p.heat=clamp(p.heat-12,0,100);p.finalCrisis.choice=choice;p.finalCrisis.resolveRound=state.round+4;ledger(p,'Endgame: Legalisierung',-cost,'asset');
    }
    if(choice==='politics'){
      const cost=180000;if(p.dirty<cost&&!auto)return toast(`Du brauchst ${fmt(cost)} schmutziges Geld.`);
      if(p.dirty>=cost)p.dirty-=cost;else p.debt+=cost-p.dirty,p.dirty=0;
      if(p.investigation)p.investigation.corruptionExposure=clamp((p.investigation.corruptionExposure||0)+18,0,100);
      p.finalCrisis.choice=choice;p.finalCrisis.resolveRound=state.round+3;ledger(p,'Endgame: politisches Netzwerk',-cost,'dirty');
    }
    if(choice==='war'){
      if(p.staff.gunman<2&&!auto)return toast('Du brauchst mindestens zwei Revolverhelden für einen offenen Machtkampf.');
      p.heat=clamp(p.heat+18,0,100);p.finalCrisis.choice=choice;p.finalCrisis.resolveRound=state.round+3;
    }
    log(`${p.family}: Endgame-Strategie „${choice}“ gewählt.`);
    saveGame();if(!auto)openFinalCrisis();
  }

  function resolveFinalCrisis(p){
    ensureFinalSystems(p);const f=p.finalCrisis;if(!f.active||!f.choice||state.round<f.resolveRound)return;
    let score=0;
    if(f.choice==='legit')score=roleSkill(p,'manager')*.35+roleSkill(p,'lawyer')*.30+Math.min(35,p.clean/70000);
    if(f.choice==='politics')score=shield(p)*.75+roleSkill(p,'informant')*.20-Math.max(0,(p.investigation?.corruptionExposure||0)-40)*.25;
    if(f.choice==='war')score=roleSkill(p,'gunman')*.55+roleSkill(p,'bodyguard')*.20+(p.crews||[]).length*6;
    const success=chance(clamp(.28+score/180,.20,.88));
    f.active=false;f.resolved=true;
    if(success){
      f.outcome='Syndikat behauptet sich';p.stats.finalCrisesWon++;p.reputation=clamp(p.reputation+10,0,100);p.endgameBonus=8;
      p.heat=clamp(p.heat-10,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence-12,0,100);
      if(f.choice==='war'){
        for(const t of state.players.filter(x=>x.id!==p.id&&!x.eliminated)){
          const b=[...t.businesses].sort((a,b)=>BUSINESSES[b.type].cost-BUSINESSES[a.type].cost)[0];if(b)b.health=clamp(b.health-rand(8,20),0,100);
        }
      }
      log(`${p.family}: Die Endgame-Krise wird erfolgreich überstanden.`);
      if(p.type!=='ai')toast('Die Krise ist überstanden. Dein Syndikat geht gestärkt daraus hervor.');
    }else{
      f.outcome='Schwerer Rückschlag';p.reputation=Math.max(0,p.reputation-8);p.heat=clamp(p.heat+12,0,100);
      const fine=Math.min(Math.max(50000,Math.round(netWorth(p)*.05)),450000);spend(p,fine,true);
      if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+10,0,100);
      log(`${p.family}: Die Endgame-Krise endet mit einem schweren Rückschlag.`);
      if(p.type!=='ai')toast(`Schwerer Rückschlag: ${fmt(fine)} Kosten und zusätzlicher Ermittlungsdruck.`);
    }
  }

  function openFinalCrisis(){
    const p=currentPlayer();ensureFinalSystems(p);const f=p.finalCrisis;
    if(!f.triggered)return toast('Noch keine Endgame-Krise.');
    if(f.resolved){
      return openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Endgame</p><h2>${esc(f.outcome||'Krise beendet')}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-visual-banner"><img src="./assets/city-map.webp" alt="Stadt bei Nacht"><div><small>MACHTBILANZ</small><strong>Die Stadt erinnert sich an jede Entscheidung.</strong></div></div><p>Deine Entscheidung: ${esc(f.choice||'—')}. Das Ergebnis wirkt dauerhaft auf Ruf, Ermittlungsdruck und Machtstellung.</p></div>`);
    }
    if(f.choice){
      return openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Endgame läuft</p><h2>Die Stadt reagiert</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-visual-banner"><img src="./assets/event-raid.webp" alt="Nächtlicher Einsatz"><div><small>DRUCK AUF DER STRASSE</small><strong>Polizei, Politik und Rivalen warten auf deinen Fehler.</strong></div></div><p>Strategie: <strong>${esc(f.choice)}</strong>. Entscheidung in Runde ${f.resolveRound}. Bis dahin beeinflussen Personal, Korruption, Kapital und Organisation deine Erfolgschance.</p></div>`);
    }
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Endgame-Krise</p><h2>Die Stadt schlägt zurück</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-visual-banner"><img src="./assets/start-user.webp" alt="Syndikat bei Nacht"><div><small>FINALE PHASE</small><strong>Jetzt entscheidet sich, ob aus deiner Familie ein Syndikat wird.</strong></div></div><p class="muted">Dein Syndikat ist groß genug, dass Polizei, Politik und Rivalen nicht länger zuschauen. Wähle eine langfristige Strategie.</p><div class="dialog-list">
      <div class="dialog-option"><div><strong>Legalisieren & konsolidieren</strong><p>250.000 $ sauberes Kapital. Manager und Anwälte entscheiden über den Erfolg.</p></div><button class="btn btn-primary" data-final-choice="legit">Legalisieren</button></div>
      <div class="dialog-option"><div><strong>Politisches Schutzschild</strong><p>180.000 $ schmutziges Geld. Korruption und Informanten helfen, können aber auffliegen.</p></div><button class="btn btn-secondary" data-final-choice="politics">Netzwerk nutzen</button></div>
      <div class="dialog-option"><div><strong>Offener Machtkampf</strong><p>Mindestens 2 Revolverhelden. Brutal, schnell und sehr auffällig.</p></div><button class="btn btn-danger" data-final-choice="war">Krieg</button></div>
    </div></div>`);
    $('[data-final-choice]').forEach(b=>b.onclick=()=>{closeDialog();applyFinalChoice(p,b.dataset.finalChoice,false);});
  }

  const basePower=powerIndex;
  powerIndex=function(p){return clamp(basePower(p)+(p.endgameBonus||0),0,100);};

  function maintainAiEquipment(p){
    ensureFinalSystems(p);
    if(!p.inventory)return;
    const reserve=Math.max(25000,staffPayroll(p)*3);
    for(const type of ['vehicles','gear','weapons']){
      const item=(p.inventory[type]||[]).filter(x=>(Number(x.condition)||100)<58).sort((a,b)=>(a.condition||100)-(b.condition||100))[0];
      if(!item)continue;
      const cost=repairCost(type,item);
      if(p.clean>=cost+reserve){
        p.clean-=cost;item.condition=100;p.stats.equipmentRepairs++;
        ledger(p,`KI-Wartung ${equipmentDef(type,item.id)?.name||item.id}`,-cost,'expense');
        break;
      }
    }
  }

  doAiPrison=function(p){
    ensureFinalSystems(p);
    const ps=p.prisonState,leader=activeLeader(p);
    if(p.actionPoints>0)p.actionPoints--;
    if(roleSkill(p,'lawyer')>45&&p.clean>=5000&&chance(.48)){
      const cost=5000;p.clean-=cost;p.jailed=Math.max(0,p.jailed-rand(1,2));p.stats.prisonAppeals++;ledger(p,'KI-Berufung',-cost,'expense');return;
    }
    if(p.dirty>=7500&&chance(.30+ps.influence/300)){
      p.dirty-=7500;p.jailed=Math.max(0,p.jailed-1);ps.contraband=clamp(ps.contraband+10,0,100);p.stats.prisonBribes++;return;
    }
    if(leader&&chance(.55)){
      const worst=[...p.businesses].sort((a,b)=>a.health-b.health)[0];
      if(worst)worst.health=clamp(worst.health+rand(5,11),0,100);
      leader.xp=(leader.xp||0)+8;p.stats.delegations++;return;
    }
    ps.influence=clamp(ps.influence+rand(8,16),0,100);ps.contacts++;p.reputation=clamp(p.reputation+1,0,100);
  };

  const baseAi=aiTurn;
  aiTurn=function(p){
    ensureFinalSystems(p);
    if(p.jailed<=0)maintainAiEquipment(p);
    baseAi(p);
  };

  const baseInit=initPlayer;
  initPlayer=function(p){baseInit(p);ensureFinalSystems(p);};

  const baseMigrate=migrateState;
  migrateState=function(data){data=baseMigrate(data);for(const p of data.players||[])ensureFinalSystems(p);return data;};

  const baseEnd=processEndOfTurn;
  processEndOfTurn=function(p){
    ensureFinalSystems(p);leadershipTick(p);baseEnd(p);maybeTriggerFinalCrisis(p);resolveFinalCrisis(p);saveGame();
  };

  const baseActions=renderActions;
  renderActions=function(){
    baseActions();
    const p=currentPlayer();if(!p)return;
    if(p.jailed>0){renderPrison();return;}
    const panel=$('#actionsView .action-panel .button-grid');
    if(panel){
      $('[data-v4-arsenal]',panel)?.addEventListener('click',openArsenalFinal);
      if(p.finalCrisis?.triggered&&!panel.querySelector('[data-final-crisis]')){
        panel.insertAdjacentHTML('beforeend',`<button class="btn ${p.finalCrisis.active?'btn-danger':'btn-secondary'}" data-final-crisis>Endgame-Krise</button>`);
        $('[data-final-crisis]',panel).onclick=openFinalCrisis;
      }
    }
  };

  const baseStaff=renderStaff;
  renderStaff=function(){
    baseStaff();
    $('[data-arsenal]')?.addEventListener('click',openArsenalFinal);
    const p=currentPlayer(),leader=activeLeader(p),grid=$('#staffGrid');
    if(grid&&p&&p.jailed>0&&!grid.querySelector('[data-leadership-card]')){
      grid.insertAdjacentHTML('afterbegin',`<article class="shop-card" data-leadership-card><div class="shop-top"><div><small class="eyebrow">Führung in Abwesenheit</small><h3>${leader?esc(leader.name):'Kein Stellvertreter'}</h3></div><span class="owned">${Math.round(leadershipEfficiency(p)*100)}%</span></div><p>${leader?'Der Stellvertreter hält Betriebe und Personal während deiner Haft zusammen.':'Ohne verlässliche Führung sinken Einnahmen und Loyalität deutlich.'}</p></article>`);
    }
  };

  const baseMore=openMoreMenu;
  openMoreMenu=function(){
    baseMore();
    const root=$('#dialogContent .more-grid'),p=currentPlayer();
    if(root){
      $('[data-v4-arsenal]',root)?.addEventListener('click',openArsenalFinal);
      if(p?.finalCrisis?.triggered&&!root.querySelector('[data-final-crisis-more]')){
        root.insertAdjacentHTML('beforeend',`<button class="btn ${p.finalCrisis.active?'btn-danger':'btn-secondary'}" data-final-crisis-more>◆ Endgame-Krise</button>`);
        $('[data-final-crisis-more]',root).onclick=openFinalCrisis;
      }
    }
  };

  const baseCity=renderCity;
  renderCity=function(){
    baseCity();const p=currentPlayer(),list=$('#situationList');if(!p||!list)return;
    if(p.finalCrisis?.triggered&&!list.querySelector('[data-final-city]')){
      list.insertAdjacentHTML('afterbegin',`<div class="situation-item" data-final-city><span>Endgame</span><button class="btn ${p.finalCrisis.active?'btn-danger':'btn-secondary'}" data-open-final>${esc(p.finalCrisis.resolved?p.finalCrisis.outcome:'Krise aktiv')}</button></div>`);
      $('[data-open-final]',list).onclick=openFinalCrisis;
    }
  };

  window.SyndikatFinalSystems={openArsenal:openArsenalFinal,openFinalCrisis};
})();
/* SYNDIKAT_V49_FINAL_GAMEPLAY_END */

  init();
})();

