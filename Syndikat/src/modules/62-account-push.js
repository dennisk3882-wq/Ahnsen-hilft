/* SYNDIKAT_V56_ACCOUNT_PUSH_BEGIN */
(function SYNDIKAT_V56_ACCOUNT_PUSH(){
  const ONLINE_KEY='syndikat_online_session_v1';
  const getSession=()=>{try{return JSON.parse(localStorage.getItem(ONLINE_KEY)||'null')}catch{return null}};
  const cloud=()=>window.SyndikatCloud;

  async function resetPassword(){
    const email=$('#accountEmail')?.value.trim();
    if(!email)return toast('Bitte zuerst die E-Mail-Adresse eingeben.');
    try{await cloud().resetPasswordAccount(email);toast('E-Mail zum Zurücksetzen des Passworts wurde versendet.');}
    catch(e){toast('Konto: '+(e.message||e));}
  }
  async function updatePassword(){
    const password=$('#accountNewPassword')?.value||'';
    if(password.length<8)return toast('Das neue Passwort muss mindestens 8 Zeichen haben.');
    try{await cloud().updatePasswordAccount(password);toast('Passwort wurde geändert.');window.SyndikatOnline?.open?.();}
    catch(e){toast('Konto: '+(e.message||e));}
  }
  async function deleteAccount(){
    if(!confirm('Cloud-Konto und alle zugehörigen Cloud-Slots endgültig löschen?'))return;
    try{await cloud().deleteAccount();toast('Cloud-Konto wurde gelöscht.');window.SyndikatOnline?.open?.();}
    catch(e){toast('Konto: '+(e.message||e));}
  }
  async function togglePush(){
    const s=getSession();if(!s)return toast('Keine Online-Partie aktiv.');
    try{
      const on=await cloud().getTurnPushStatus(s);
      if(on){await cloud().disableTurnPush(s);toast('Zug-Benachrichtigungen deaktiviert.');}
      else{await cloud().enableTurnPush(s);toast('Zug-Benachrichtigungen aktiviert.');}
      window.SyndikatOnline?.open?.();
    }catch(e){toast('Push: '+(e.message||e));}
  }

  async function decorateCloudDialog(){
    const root=$('#dialogContent .dialog-wrap');if(!root)return;
    const h=(root.querySelector('h2')?.textContent||'').trim();
    if(/^Lobby\b/.test(h)){
      const s=getSession();if(!s||root.querySelector('[data-turn-push]'))return;
      const on=await cloud()?.getTurnPushStatus?.(s).catch(()=>false);
      const footer=root.querySelector('.dialog-footer');if(!footer)return;
      const b=document.createElement('button');b.className='btn btn-secondary';b.dataset.turnPush='1';b.textContent=on?'Zug-Push: An':'Zug-Push aktivieren';b.onclick=togglePush;
      const leave=footer.querySelector('[data-online-leave]');footer.insertBefore(b,leave||null);
      return;
    }
    if(h==='Syndikat über mehrere Geräte'){
      const account=await cloud()?.getAccount?.().catch(()=>null);
      if(account){
        if(!root.querySelector('[data-account-password-v56]')){
          const slots=root.querySelector('.account-slots');
          const box=document.createElement('div');
          box.innerHTML='<div class="form-grid"><label><span>Neues Passwort</span><input id="accountNewPassword" type="password" minlength="8" autocomplete="new-password"></label></div><div class="dialog-footer"><button class="btn btn-secondary" data-account-password-v56>Passwort ändern</button><button class="btn btn-danger" data-account-delete-profile-v56>Konto löschen</button></div>';
          (slots||root.querySelector('.account-status'))?.insertAdjacentElement('afterend',box);
          box.querySelector('[data-account-password-v56]')?.addEventListener('click',updatePassword);
          box.querySelector('[data-account-delete-profile-v56]')?.addEventListener('click',deleteAccount);
        }
      }else if(!root.querySelector('[data-account-reset-v56]')){
        const register=root.querySelector('[data-account-register]');
        if(register){
          const b=document.createElement('button');b.className='btn btn-secondary';b.dataset.accountResetV56='1';b.textContent='Passwort vergessen';b.onclick=resetPassword;
          register.insertAdjacentElement('afterend',b);
        }
      }
    }
  }

  let q=false;
  const schedule=()=>{if(q)return;q=true;queueMicrotask(async()=>{q=false;await decorateCloudDialog()})};
  if(typeof MutationObserver!=='undefined'&&document.body)new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});

  const baseEnd=endHumanTurn;
  endHumanTurn=function(...args){
    const s=getSession();
    const r=baseEnd.apply(this,args);
    if(s&&cloud()?.enabled)setTimeout(async()=>{
      try{
        const game=await cloud().getGame(s.code,s.token);
        if(game?.status==='playing'&&game.active_participant_id&&game.active_participant_id!==s.participantId)await cloud().notifyActiveTurn(s);
      }catch{}
    },1400);
    return r;
  };

  window.SyndikatAccountPush={decorate:decorateCloudDialog,togglePush};
})();
/* SYNDIKAT_V56_ACCOUNT_PUSH_END */