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