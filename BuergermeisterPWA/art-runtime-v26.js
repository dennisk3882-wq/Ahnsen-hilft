(() => {
  'use strict';

  const VERSION = '28';
  const CITY_SHEET = `assets/v23-city-stages.webp?v=${VERSION}`;
  const MARKET_SHEET = `assets/v23-market-icons.webp?v=${VERSION}`;
  const UI_SHEET = `assets/v23-ui-icons.webp?v=${VERSION}`;

  const STAGES = ['kuhdorf','dorf','grosses-dorf','kleinstadt','stadt','grossstadt','moderne-stadt','metropole'];
  const MARKET_BOXES = {
    land:[0,0,300,300], houses:[300,0,300,300], towers:[600,0,300,300],
    schools:[0,300,300,300], universities:[300,300,300,300], shops:[600,300,300,300],
    supermarkets:[150,600,300,300], food:[450,600,300,300]
  };
  const UI_BOXES = {
    date:[0,0,225,225], cash:[225,0,225,225], population:[450,0,225,225], approval:[675,0,225,225],
    housing:[0,225,225,225], food:[225,225,225,225], jobs:[450,225,225,225], plan:[675,225,225,225],
    actions:[0,450,225,225], city:[225,450,225,225], finance:[450,450,225,225], reports:[675,450,225,225],
    menu:[113,675,225,225], confirm:[338,675,225,225], document:[563,675,225,225]
  };

  const art = { city:{}, market:{}, ui:{}, ready:false };
  let scheduled = false;

  function loadImage(src) {
    return new Promise((resolve,reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function crop(img, sx, sy, sw, sh, quality=.92) {
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', {alpha:false});
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    try { return canvas.toDataURL('image/webp', quality); }
    catch (_) { return canvas.toDataURL('image/png'); }
  }

  async function prepareArt() {
    try {
      const [city,market,ui] = await Promise.all([loadImage(CITY_SHEET),loadImage(MARKET_SHEET),loadImage(UI_SHEET)]);
      STAGES.forEach((stage,i) => { art.city[stage] = crop(city,0,i*500,1025,500,.92); });
      Object.entries(MARKET_BOXES).forEach(([key,b]) => { art.market[key] = crop(market,...b,.94); });
      Object.entries(UI_BOXES).forEach(([key,b]) => { art.ui[key] = crop(ui,...b,.94); });
      art.ready = true;
      document.documentElement.dataset.bgmArt = 'v28-direct';
      schedule();
    } catch (err) {
      console.error('Bürgermeister artwork v28 konnte nicht vorbereitet werden', err);
    }
  }

  function removeLegacy(host) {
    if (!host) return;
    host.querySelectorAll(':scope > .v26-city-sheet,:scope > .v27-city-sheet,:scope > .v26-market-sheet,:scope > .v27-market-sheet,:scope > .v26-ui-icon,:scope > .v27-ui-icon,:scope > .v26-tab-icon,:scope > .v27-tab-icon,:scope > .v26-crest,:scope > .v27-crest,:scope > .v26-title-icon,:scope > .v27-title-icon').forEach(n=>n.remove());
  }

  function stageFor(scene) {
    const cls = [...scene.classList].find(c => c.startsWith('city-stage-'));
    return cls ? cls.replace('city-stage-','') : 'kuhdorf';
  }

  function upgradeCity() {
    document.querySelectorAll('.city-scene').forEach(scene => {
      removeLegacy(scene);
      const stage = stageFor(scene);
      const img = scene.querySelector(':scope > .city-scene-image');
      if (!img || !art.city[stage]) return;
      if (img.dataset.v28Stage !== stage) {
        img.src = art.city[stage];
        img.dataset.v28Stage = stage;
      }
      img.style.setProperty('display','block','important');
      img.style.setProperty('visibility','visible','important');
      img.style.setProperty('opacity','1','important');
      img.style.setProperty('width','100%','important');
      img.style.setProperty('height','100%','important');
      img.style.setProperty('object-fit','cover','important');
      img.style.setProperty('object-position','center','important');
      scene.style.setProperty('background-image','none','important');
      scene.style.setProperty('background','#07131d','important');
    });
  }

  function directImg(host, cls, src, alt='') {
    if (!host || !src) return null;
    let img = host.querySelector(`:scope > img.${cls}`);
    if (!img) {
      img = document.createElement('img');
      img.className = cls;
      img.alt = alt;
      if (!alt) img.setAttribute('aria-hidden','true');
      host.prepend(img);
    }
    if (img.src !== src) img.src = src;
    return img;
  }

  function marketKey(frame) {
    const icon = frame.closest('.market-icon');
    if (!icon) return '';
    const cls = [...icon.classList].find(c => c.startsWith('market-icon-') && c !== 'market-icon');
    return cls ? cls.replace('market-icon-','') : '';
  }

  function upgradeMarket() {
    document.querySelectorAll('.market-icon-frame').forEach(frame => {
      removeLegacy(frame);
      const key = marketKey(frame);
      if (!art.market[key]) return;
      frame.querySelectorAll(':scope > svg').forEach(svg => svg.style.setProperty('display','none','important'));
      frame.style.setProperty('background-image','none','important');
      frame.style.setProperty('overflow','hidden','important');
      directImg(frame,'v28-market-img',art.market[key]);
    });
  }

  function clearLegacyUi(host) {
    if (!host) return;
    host.querySelectorAll(':scope > .v26-ui-icon,:scope > .v27-ui-icon,:scope > .v26-tab-icon,:scope > .v27-tab-icon,:scope > .v26-crest,:scope > .v27-crest,:scope > .v26-title-icon,:scope > .v27-title-icon').forEach(n=>n.remove());
  }

  function upgradeUi() {
    const metrics = ['date','cash','population','approval'];
    document.querySelectorAll('.compact-metric').forEach((host,i) => {
      clearLegacyUi(host);
      const key = metrics[i]; if (key) directImg(host,'v28-hud-icon',art.ui[key]);
    });

    const quick = ['housing','food','jobs','plan'];
    document.querySelectorAll('.city-quick-strip > div').forEach((host,i) => {
      clearLegacyUi(host);
      const key = quick[i]; if (key) directImg(host,'v28-quick-icon',art.ui[key]);
    });

    const tabs = ['actions','city','finance','reports'];
    document.querySelectorAll('.game-tab').forEach((host,i) => {
      clearLegacyUi(host);
      const key = tabs[i]; if (key) directImg(host,'v28-tab-icon',art.ui[key]);
    });

    const identity = document.querySelector('.compact-city-identity');
    if (identity) { clearLegacyUi(identity); directImg(identity,'v28-crest',art.ui.city); }

    const title = document.querySelector('.city-panel-title');
    if (title) { clearLegacyUi(title); directImg(title,'v28-title-icon',art.ui.city); }

    const menu = document.querySelector('.sticky-menu-btn');
    if (menu) directImg(menu,'v28-sticky-icon',art.ui.menu);
    const month = document.querySelector('.sticky-month-btn');
    if (month) directImg(month,'v28-sticky-icon',art.ui.confirm);
    const plan = document.querySelector('.sticky-plan');
    if (plan) directImg(plan,'v28-plan-icon',art.ui.plan);
  }

  function apply() {
    scheduled = false;
    if (!art.ready) return;
    upgradeCity();
    upgradeMarket();
    upgradeUi();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(apply));
  }

  const root = document.getElementById('app');
  if (root) new MutationObserver(schedule).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',schedule,{passive:true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',schedule,{once:true});
  prepareArt();
})();
