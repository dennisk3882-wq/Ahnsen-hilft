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
    $$('[data-buy]').forEach(btn=>btn.onclick=()=>buyBusiness(btn.dataset.buy,districtId));
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
    $$('[data-machine-loc]').forEach(sel=>sel.onchange=()=>{const m=b.machines.find(x=>x.id===sel.dataset.machineLoc);if(p.clean<300){sel.value=m.location;return toast('Du brauchst 300 $ sauberes Geld für den Standortwechsel.');}spendClean(p,300);m.location=sel.value;markActivity(p);ledger(p,'Automat umgesetzt',-300,'expense');saveGame();renderAll();toast('Standort geändert.');});
    $$('[data-machine-repair]').forEach(btn=>btn.onclick=()=>{const m=b.machines.find(x=>x.id===btn.dataset.machineRepair),cost=machineRepairCost(m);if(!spendClean(p,cost))return toast('Nicht genug sauberes Geld.');m.condition=100;p.stats.maintenance++;markActivity(p);ledger(p,'Automat gewartet',-cost,'expense');openMachineManager(bid);});
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
    $$('[data-up-route]').forEach(btn=>btn.onclick=()=>{const r=p.routes.find(x=>x.id===btn.dataset.upRoute),cost=5000*r.level;if(!spendClean(p,cost))return toast('Nicht genug sauberes Kapital.');r.level++;markActivity(p);ledger(p,'Automatenroute verbessert',-cost,'asset');saveGame();openRoutesDialog(focusBiz);});
    $$('[data-route-biz]').forEach(sel=>sel.onchange=()=>{const b=p.businesses.find(x=>x.id===sel.dataset.routeBiz);b.routeId=sel.value||null;markActivity(p);saveGame();renderAll();});
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
    $$('[data-intel-buy]').forEach(b=>b.onclick=()=>{closeDialog();openBuyDialog(did,b.dataset.intelBuy);});
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
    $$('[data-loan-amt]').forEach(b=>b.onclick=()=>takeLoan(+b.dataset.loanAmt));
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
    $('[data-repay]')?.addEventListener('click',repayDebt);$('[data-loan]')?.addEventListener('click',openLoanDialog);$('[data-export]')?.addEventListener('click',exportSave);$$('[data-repay-loan]').forEach(b=>b.onclick=()=>repayLoan(b.dataset.repayLoan));if(currentView==='finance')requestAnimationFrame(drawChart);
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
    $$('[data-go]').forEach(b=>b.onclick=()=>{closeDialog();setView(b.dataset.go);});$('[data-more-diplomacy]').onclick=()=>{closeDialog();openDiplomacyDialog();};$('[data-more-routes]').onclick=()=>{closeDialog();openRoutesDialog();};$('[data-chronicle]').onclick=openChronicleDialog;
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
    const p=currentPlayer();$('#corruptionGrid').innerHTML=Object.entries(CORRUPTION).map(([k,c])=>`<article class="shop-card"><div class="shop-top"><div><small class="eyebrow">Einfluss</small><h3>${esc(c.name)}</h3></div><span class="owned">${p.bribes[k]?'✓':'–'}</span></div><p>${esc(c.desc)}</p><footer><span class="price">${fmt(c.cost)} schmutzig</span><button class="btn ${p.bribes[k]?'btn-ghost':'btn-secondary'}" data-bribe="${k}" ${p.bribes[k]||p.jailed||p.dirty<c.cost?'disabled':''}>${p.bribes[k]?'Aktiv':'Bestechen'}</button></footer></article>`).join('');$$('#corruptionGrid [data-bribe]').forEach(b=>b.onclick=()=>buyBribe(b.dataset.bribe));
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
