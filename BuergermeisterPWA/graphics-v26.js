(() => {
  'use strict';

  const CITY_SHEET = 'assets/v23-city-stages.webp?v=26';
  const MARKET_SHEET = 'assets/v23-market-icons.webp?v=26';
  const UI_SHEET = 'assets/v23-ui-icons.webp?v=26';

  const stageIndex = {
    kuhdorf:0, dorf:1, 'grosses-dorf':2, kleinstadt:3,
    stadt:4, grossstadt:5, 'moderne-stadt':6, metropole:7
  };

  const marketPos = {
    land:[0,0], houses:[-100,0], towers:[-200,0],
    schools:[0,-100], universities:[-100,-100], shops:[-200,-100],
    supermarkets:[-50,-200], food:[-150,-200]
  };

  const addSheetCrop = (host, cls, src, x, y, scale=4) => {
    if (!host || host.querySelector(`:scope > .${cls}`)) return;
    const wrap = document.createElement('span');
    wrap.className = cls;
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.setAttribute('aria-hidden','true');
    img.style.width = `${scale * 100}%`;
    img.style.height = `${scale * 100}%`;
    img.style.left = `${x}%`;
    img.style.top = `${y}%`;
    wrap.appendChild(img);
    host.prepend(wrap);
  };

  function upgradeCity() {
    document.querySelectorAll('.city-scene').forEach(scene => {
      if (scene.querySelector(':scope > .v26-city-sheet')) return;
      const cls = [...scene.classList].find(c => c.startsWith('city-stage-'));
      const stage = cls ? cls.replace('city-stage-','') : 'kuhdorf';
      const idx = stageIndex[stage] ?? 0;
      const img = document.createElement('img');
      img.className = 'v26-city-sheet';
      img.src = CITY_SHEET;
      img.alt = '';
      img.setAttribute('aria-hidden','true');
      img.style.top = `${-idx * 100}%`;
      scene.prepend(img);
    });
  }

  function upgradeMarket() {
    document.querySelectorAll('.market-icon-frame').forEach(frame => {
      if (frame.querySelector(':scope > .v26-market-sheet')) return;
      const icon = frame.closest('.market-icon');
      if (!icon) return;
      const cls = [...icon.classList].find(c => c.startsWith('market-icon-') && c !== 'market-icon');
      const key = cls ? cls.replace('market-icon-','') : '';
      const pos = marketPos[key];
      if (!pos) return;
      const img = document.createElement('img');
      img.className = 'v26-market-sheet';
      img.src = MARKET_SHEET;
      img.alt = '';
      img.setAttribute('aria-hidden','true');
      img.style.left = `${pos[0]}%`;
      img.style.top = `${pos[1]}%`;
      frame.appendChild(img);
    });
  }

  function upgradeHud() {
    const metricPos = [[0,0],[-100,0],[-200,0],[-300,0]];
    document.querySelectorAll('.compact-metric').forEach((el,i)=> addSheetCrop(el,'v26-ui-icon',UI_SHEET,...(metricPos[i]||[0,0]),4));

    const quickPos = [[0,-100],[-100,-100],[-200,-100],[-300,-100]];
    document.querySelectorAll('.city-quick-strip > div').forEach((el,i)=> addSheetCrop(el,'v26-ui-icon',UI_SHEET,...(quickPos[i]||[0,-100]),4));

    const tabPos = [[0,-200],[-100,-200],[-200,-200],[-300,-200]];
    document.querySelectorAll('.game-tab').forEach((el,i)=> addSheetCrop(el,'v26-tab-icon',UI_SHEET,...(tabPos[i]||[0,-200]),4));

    const identity = document.querySelector('.compact-city-identity');
    if (identity && !identity.querySelector(':scope > .v26-crest')) {
      const crest = document.createElement('span'); crest.className='v26-crest';
      const img=document.createElement('img'); img.src=UI_SHEET; img.alt=''; img.setAttribute('aria-hidden','true');
      img.style.width='400%'; img.style.height='400%'; img.style.left='-100%'; img.style.top='-200%'; crest.appendChild(img); identity.prepend(crest);
    }

    const title = document.querySelector('.city-panel-title');
    if (title && !title.querySelector(':scope > .v26-title-icon')) {
      const ic=document.createElement('span'); ic.className='v26-title-icon';
      const img=document.createElement('img'); img.src=UI_SHEET; img.alt=''; img.setAttribute('aria-hidden','true');
      img.style.width='400%'; img.style.height='400%'; img.style.left='-100%'; img.style.top='-200%'; ic.appendChild(img); title.prepend(ic);
    }
  }

  function upgrade() {
    upgradeCity();
    upgradeMarket();
    upgradeHud();
  }

  let queued=false;
  const schedule=()=>{ if(queued)return; queued=true; requestAnimationFrame(()=>{queued=false;upgrade();}); };
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();
})();
