(() => {
  'use strict';

  const VERSION = '26';
  const CITY_URL = `assets/v23-city-stages.webp?v=${VERSION}`;
  const MARKET_URL = `assets/v23-market-icons.webp?v=${VERSION}`;
  const STAGES = ['kuhdorf','dorf','grosses-dorf','kleinstadt','stadt','grossstadt','moderne-stadt','metropole'];
  const MARKET = {
    land:[0,0], houses:[1,0], towers:[2,0], schools:[0,1], universities:[1,1], shops:[2,1], supermarkets:[0.5,2], food:[1.5,2]
  };

  let scheduled = false;

  function important(el, prop, value) {
    if (el) el.style.setProperty(prop, value, 'important');
  }

  function applyCity() {
    const el = document.querySelector('.city-scene');
    if (!el) return;
    const stage = STAGES.find(name => el.classList.contains(`city-stage-${name}`)) || 'kuhdorf';
    const index = Math.max(0, STAGES.indexOf(stage));
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));

    important(el, 'background-image', `url("${CITY_URL}")`);
    important(el, 'background-repeat', 'no-repeat');
    important(el, 'background-size', `${w}px ${h * 8}px`);
    important(el, 'background-position', `0px -${index * h}px`);
    important(el, 'background-color', '#071724');
    important(el, 'overflow', 'hidden');

    const oldImage = el.querySelector('.city-scene-image');
    if (oldImage) important(oldImage, 'opacity', '0');
  }

  function applyMarketIcons() {
    Object.entries(MARKET).forEach(([key,[col,row]]) => {
      document.querySelectorAll(`.market-icon-${key} .market-icon-frame`).forEach(frame => {
        const rect = frame.getBoundingClientRect();
        const size = Math.max(1, rect.width || 72);
        important(frame, 'background-image', `url("${MARKET_URL}")`);
        important(frame, 'background-repeat', 'no-repeat');
        important(frame, 'background-size', `${size * 3}px ${size * 3}px`);
        important(frame, 'background-position', `${-col * size}px ${-row * size}px`);
        important(frame, 'background-color', '#06131e');
        important(frame, 'border-radius', '50%');
        important(frame, 'overflow', 'hidden');
        frame.querySelectorAll('svg').forEach(svg => important(svg, 'display', 'none'));
      });
    });
  }

  function apply() {
    scheduled = false;
    document.documentElement.dataset.bgmArt = `v${VERSION}`;
    applyCity();
    applyMarketIcons();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(apply));
  }

  const preloadCity = new Image();
  preloadCity.onload = schedule;
  preloadCity.src = CITY_URL;
  const preloadMarket = new Image();
  preloadMarket.onload = schedule;
  preloadMarket.src = MARKET_URL;

  window.addEventListener('resize', schedule, { passive:true });
  window.addEventListener('load', schedule, { once:true });
  const root = document.getElementById('app');
  if (root) new MutationObserver(schedule).observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  schedule();
})();
