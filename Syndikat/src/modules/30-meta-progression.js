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
