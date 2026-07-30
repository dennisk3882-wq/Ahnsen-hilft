'use strict';
(() => {
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const app={profile:null,tab:'friends',matchTimer:null,questionCount:0};
  app.esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  app.initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
  app.date=v=>v?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';
  app.api=async(url,options={})=>{const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Anfrage fehlgeschlagen.');return d;};
  app.msg=(target,text,bad=false)=>{const n=typeof target==='string'?$(target):target;if(n){n.textContent=text||'';n.className=`message ${bad?'bad-text':''}`;}};
  app.row=(profile,actions,subtitle='QuizTime-Profil')=>`<article class="community-row"><span class="community-avatar">${app.esc(app.initials(profile.name))}</span><div class="community-row-copy"><strong>${app.esc(profile.name)}</strong><span>${app.esc(subtitle)}</span></div><div class="community-actions">${actions||''}</div></article>`;
  app.setTab=tab=>{
    app.tab=tab;$$('[data-community-tab]').forEach(b=>b.classList.toggle('active',b.dataset.communityTab===tab));$$('[data-community-view]').forEach(v=>v.classList.toggle('hidden',v.dataset.communityView!==tab));
    const u=new URL(location.href);u.searchParams.set('tab',tab);history.replaceState(null,'',u);
    app.social?.load?.(tab);app.games?.load?.(tab);
  };
  app.reportError=error=>fetch('/api/platform/client-error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:String(error?.message||error),stack:error?.stack,url:location.href})}).catch(()=>{});
  window.addEventListener('error',e=>app.reportError(e.error||e.message));window.addEventListener('unhandledrejection',e=>app.reportError(e.reason));
  async function loadMe(){try{const d=await app.api('/api/platform/me');app.profile=d.profile;$('#communityProfile').textContent=d.profile.name;$('#communityLoginRequired').classList.add('hidden');$('#communityApp').classList.remove('hidden');return true;}catch{$('#communityProfile').textContent='Kein Profil';$('#communityLoginRequired').classList.remove('hidden');return false;}}
  async function init(){
    $$('[data-community-tab]').forEach(b=>b.onclick=()=>app.setTab(b.dataset.communityTab));
    if(!await loadMe())return;
    const requested=new URLSearchParams(location.search).get('tab');app.setTab(['friends','matchmaking','tournaments','packs','season','notifications'].includes(requested)?requested:'friends');
    app.social?.notifications?.(false);
  }
  app.init=init;window.QTCommunity=app;
})();
