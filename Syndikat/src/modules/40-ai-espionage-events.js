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
    $$('[data-mole]').forEach(b=>b.onclick=()=>v43TurnPerson(b.dataset.mole,'mole'));
    $$('[data-defect]').forEach(b=>b.onclick=()=>v43TurnPerson(b.dataset.defect,'defect'));
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
    const hasCause=!!(p.casusbelli&&Object.values(p.casusbelli).some(r=>r>=state.round));
    const triesSpecial=hasCause||(p.profile==='aggressive'&&chance(.32));
    if(triesSpecial&&v43AiSpecialOp(p)){p.lastAction='Geplante Operation';return;}
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
    $$('#businessList .business-card').forEach((el,i)=>{const b=p.businesses[i];if(!b)return;let site=el.querySelector('.v43-site');if(!site){site=document.createElement('small');site.className='v43-site';site.textContent=b.siteName||'';el.querySelector('.title')?.appendChild(site);}});
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
