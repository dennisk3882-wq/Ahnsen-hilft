(() => {
  'use strict';

  const CITY_SHEET = 'assets/v23-city-stages.webp?v=27';
  const MARKET_SHEET = 'assets/v23-market-icons.webp?v=27';
  const UI_SHEET = 'assets/v23-ui-icons.webp?v=27';

  const stageIndex = {kuhdorf:0,dorf:1,'grosses-dorf':2,kleinstadt:3,stadt:4,grossstadt:5,'moderne-stadt':6,metropole:7};
  const marketPos = {land:[0,0],houses:[-100,0],towers:[-200,0],schools:[0,-100],universities:[-100,-100],shops:[-200,-100],supermarkets:[-50,-200],food:[-150,-200]};

  function city(){
    document.querySelectorAll('.city-scene').forEach(scene=>{
      let img=scene.querySelector(':scope > .v27-city-sheet');
      const cls=[...scene.classList].find(c=>c.startsWith('city-stage-'));
      const stage=cls?cls.replace('city-stage-',''):'kuhdorf';
      const idx=stageIndex[stage]??0;
      if(!img){img=document.createElement('img');img.className='v27-city-sheet';img.src=CITY_SHEET;img.alt='';img.setAttribute('aria-hidden','true');scene.prepend(img);}
      img.style.setProperty('top',`${-idx*100}%`,'important');
    });
  }

  function market(){
    document.querySelectorAll('.market-icon-frame').forEach(frame=>{
      const icon=frame.closest('.market-icon'); if(!icon)return;
      const cls=[...icon.classList].find(c=>c.startsWith('market-icon-')&&c!=='market-icon');
      const pos=cls?marketPos[cls.replace('market-icon-','')]:null; if(!pos)return;
      let img=frame.querySelector(':scope > .v27-market-sheet');
      if(!img){img=document.createElement('img');img.className='v27-market-sheet';img.src=MARKET_SHEET;img.alt='';img.setAttribute('aria-hidden','true');frame.appendChild(img);}
      img.style.setProperty('left',`${pos[0]}%`,'important');img.style.setProperty('top',`${pos[1]}%`,'important');
    });
  }

  function crop(host,cls,x,y){
    if(!host||host.querySelector(`:scope > .${cls}`))return;
    const wrap=document.createElement('span');wrap.className=cls;
    const img=document.createElement('img');img.src=UI_SHEET;img.alt='';img.setAttribute('aria-hidden','true');img.style.width='400%';img.style.height='400%';img.style.left=`${x}%`;img.style.top=`${y}%`;wrap.appendChild(img);host.prepend(wrap);
  }

  function ui(){
    [[0,0],[-100,0],[-200,0],[-300,0]].forEach((p,i)=>crop(document.querySelectorAll('.compact-metric')[i],'v27-ui-icon',...p));
    [[0,-100],[-100,-100],[-200,-100],[-300,-100]].forEach((p,i)=>crop(document.querySelectorAll('.city-quick-strip>div')[i],'v27-ui-icon',...p));
    [[0,-200],[-100,-200],[-200,-200],[-300,-200]].forEach((p,i)=>crop(document.querySelectorAll('.game-tab')[i],'v27-tab-icon',...p));
    crop(document.querySelector('.compact-city-identity'),'v27-crest',-100,-200);
    crop(document.querySelector('.city-panel-title'),'v27-title-icon',-100,-200);
  }

  function apply(){city();market();ui();document.documentElement.dataset.bgmArt='v27';}
  let q=false;const schedule=()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;apply();});};
  new MutationObserver(schedule).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  window.addEventListener('resize',schedule,{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
