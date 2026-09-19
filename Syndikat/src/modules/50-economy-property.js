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
