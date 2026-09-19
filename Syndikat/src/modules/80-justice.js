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

    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Justiz & Verteidigung</p><h2>Gerichtsakte</h2></div><button class="icon-btn" data-close>✕</button></div>${activeHtml}<h3>Fallarchiv</h3><div class="dialog-list">${history}</div></div>`);
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
