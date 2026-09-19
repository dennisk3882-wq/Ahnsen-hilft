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
    panel.innerHTML=`<div class="panel-head"><h3>Organisation aus der Haft</h3><small>${p.jailed} Runde(n) Resthaft</small></div>
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
      return openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Endgame</p><h2>${esc(f.outcome||'Krise beendet')}</h2></div><button class="icon-btn" data-close>✕</button></div><p>Deine Entscheidung: ${esc(f.choice||'—')}. Das Ergebnis wirkt dauerhaft auf Ruf, Ermittlungsdruck und Machtstellung.</p></div>`);
    }
    if(f.choice){
      return openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Endgame läuft</p><h2>Die Stadt reagiert</h2></div><button class="icon-btn" data-close>✕</button></div><p>Strategie: <strong>${esc(f.choice)}</strong>. Entscheidung in Runde ${f.resolveRound}. Bis dahin beeinflussen Personal, Korruption, Kapital und Organisation deine Erfolgschance.</p></div>`);
    }
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Endgame-Krise</p><h2>Die Stadt schlägt zurück</h2></div><button class="icon-btn" data-close>✕</button></div><p class="muted">Dein Syndikat ist groß genug, dass Polizei, Politik und Rivalen nicht länger zuschauen. Wähle eine langfristige Strategie.</p><div class="dialog-list">
      <div class="dialog-option"><div><strong>Legalisieren & konsolidieren</strong><p>250.000 $ sauberes Kapital. Manager und Anwälte entscheiden über den Erfolg.</p></div><button class="btn btn-primary" data-final-choice="legit">Legalisieren</button></div>
      <div class="dialog-option"><div><strong>Politisches Schutzschild</strong><p>180.000 $ schmutziges Geld. Korruption und Informanten helfen, können aber auffliegen.</p></div><button class="btn btn-secondary" data-final-choice="politics">Netzwerk nutzen</button></div>
      <div class="dialog-option"><div><strong>Offener Machtkampf</strong><p>Mindestens 2 Revolverhelden. Brutal, schnell und sehr auffällig.</p></div><button class="btn btn-danger" data-final-choice="war">Krieg</button></div>
    </div></div>`);
    $('[data-final-choice]').forEach(b=>b.onclick=()=>{closeDialog();applyFinalChoice(p,b.dataset.finalChoice,false);});
  }

  const basePower=powerIndex;
  powerIndex=function(p){return clamp(basePower(p)+(p.endgameBonus||0),0,100);};

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
