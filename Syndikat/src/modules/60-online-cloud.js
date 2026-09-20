/* SYNDIKAT_V45_CLOUD_UI_BEGIN */
(function SYNDIKAT_V45_CLOUD_UI(){
  const ONLINE_KEY='syndikat_online_session_v1';
  const CLOUD_SAVE_KEY='syndikat_cloud_save_session_v1';
  let onlineSubmitting=false;
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
    const c=v45Cloud();if(!c?.enabled||!onlineSession||onlineSubmitting)return;
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
        if(!onlineSubmitting&&game&&Number(game.revision)>onlineRevision){onlineRevision=Number(game.revision);if(game.game_state)v45ApplyCloudState(game.game_state);}
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
    $$('[data-account-save]').forEach(b=>b.onclick=()=>v45AccountSave(+b.dataset.accountSave));$$('[data-account-load]').forEach(b=>b.onclick=()=>v45AccountLoad(+b.dataset.accountLoad));$$('[data-account-delete]').forEach(b=>b.onclick=()=>v45AccountDelete(+b.dataset.accountDelete));
  }

  const v45EndTurn=endHumanTurn;
  endHumanTurn=async function(){
    if(!onlineSession||!v45Cloud()?.enabled)return v45EndTurn();
    if(onlineSubmitting)return;
    const p=currentPlayer();if(!p||p.onlineParticipantId!==onlineSession.participantId)return toast('Du bist in dieser Online-Partie gerade nicht am Zug.');
    const before=JSON.parse(JSON.stringify(state));
    onlineSubmitting=true;
    try{
      v45EndTurn();renderAll();
      const next=currentPlayer(),nextPid=next?.onlineParticipantId||null;
      const row=await v45Cloud().submitTurn(onlineSession,onlineRevision,v45CanonicalState(),nextPid,state.gameOver?'finished':'playing',state.gameOver?(state.players.find(x=>x.id===state.winnerId)?.onlineParticipantId||null):null);
      onlineRevision=Number(row.revision);
      onlineSubmitting=false;v45ApplyCloudState(row.game_state);
      if(state.gameOver)showGameOver();
      // Realtime is advisory. A failed broadcast must not roll back an accepted turn.
      try{await v45Cloud().signalGame?.(onlineSession,onlineRevision,'state')}catch{}
    }catch(e){
      onlineSubmitting=false;state=before;saveGame();closeDialog();renderAll();
      await v45RefreshOnline(true);
      toast('Zug nicht übertragen. Bestätigter Spielstand wiederhergestellt: '+e.message);
    }finally{onlineSubmitting=false;renderAll();}
  };

  const v45Render=renderAll;
  renderAll=function(){
    v45Render();
    if(onlineSession&&v45Cloud()?.enabled){
      const p=currentPlayer(),mine=p?.onlineParticipantId===onlineSession.participantId||p?.type==='ai';
      if(onlineSubmitting||p?.type==='remote'||!mine){
        const b=$('#statusBanner');b.className='status-banner';b.textContent=onlineSubmitting?'Zug wird übertragen …':`Online: ${p?.name||p?.family||'Mitspieler'} ist am Zug. Die Ansicht aktualisiert sich automatisch.`;
        $$('#gameScreen .content-area button, #endTurnBtn, #endTurnDesktop').forEach(x=>x.disabled=true);
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
