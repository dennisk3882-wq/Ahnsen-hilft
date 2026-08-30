'use strict';
(function(){
  const SIMPLE_ICONS_VERSION='16.29.0';
  const norm=s=>FinanceLib.normalizeText(String(s||'')).replace(/[^a-z0-9äöüß&. -]+/gi,' ').replace(/\s+/g,' ').trim();
  const registry=[
    ['EDEKA','edeka',['edeka']],['PENNY','penny',['penny']],['REWE','rewe',['rewe']],['ALDI','aldi',['aldi']],['Lidl','lidl',['lidl']],['Kaufland','kaufland',['kaufland']],
    ['Netflix','netflix',['netflix']],['Spotify','spotify',['spotify']],['Disney+','disneyplus',['disney']],['DAZN','dazn',['dazn']],['YouTube','youtube',['youtube']],
    ['Vodafone','vodafone',['vodafone']],['Telekom','deutschetelekom',['telekom','deutsche telekom']],['O2','o2',['telefonica','o2']],['1&1','1and1',['1&1','1und1']],
    ['Amazon','amazon',['amazon']],['Zalando','zalando',['zalando']],['ABOUT YOU','aboutdotyou',['about you']],['H&M','hm',['h&m']],['Deichmann','deichmann',['deichmann']],
    ['Shell','shell',['shell']],['Aral','aral',['aral']],['Esso','esso',['esso']],['TotalEnergies','totalenergies',['totalenergies']],
    ['McDonald’s','mcdonalds',['mcdonald']],['Burger King','burgerking',['burger king']],['KFC','kfc',['kfc']],['Lieferando','lieferando',['lieferando']],['Wolt','wolt',['wolt']],['Starbucks','starbucks',['starbucks']],
    ['Deutsche Bahn','deutschebahn',['deutsche bahn','db vertrieb']],['Uber','uber',['uber']],['Bolt','bolt',['bolt']],
    ['PayPal','paypal',['paypal']],['Klarna','klarna',['klarna']],['Apple','apple',['apple com bill','apple']],['Google','google',['google']],
    ['dm','dm',['dm drogerie']],['Rossmann','rossmann',['rossmann']],['IKEA','ikea',['ikea']],['OBI','obi',['obi']],['Hornbach','hornbach',['hornbach']],['BAUHAUS','bauhaus',['bauhaus']],
    ['Allianz','allianz',['allianz']],['AXA','axa',['axa']],['ERGO','ergo',['ergo']],['ARAG','arag',['arag']],
    ['E.ON','eon',['e.on','eon energie','eon']],['Vattenfall','vattenfall',['vattenfall']],['AOK','aok',['aok']],['ADAC','adac',['adac']]
  ].map(([name,slug,aliases])=>({name,slug,aliases}));
  const cashWords=['bargeldabhebung','bargeld abhebung','bargeldauszahlung','geldautomat','cash withdrawal','cashback','cash out','atm withdrawal','atm cash'];
  const iconCache=new Map();
  const key=s=>norm(s).toLowerCase();
  function contains(text,needle){const t=` ${key(text)} `,p=key(needle);return !!p&&t.includes(` ${p} `)}
  function merchantName(input={}){
    if(typeof input==='string')input={title:input};
    const raw=input.sourceMerchant||input.merchant||input.provider||input.title||input.name||'';
    return globalThis.FinanzCategoryIntelligence?.merchantAlias?.(raw)||globalThis.FinanzIntelligence?.canonicalMerchant?.(raw)||String(raw).trim()||'Unbekannt';
  }
  function isCash(input={}){const text=norm([input.title,input.merchant,input.sourceMerchant,input.note,input.remittance,input.bankTransactionDescription].filter(Boolean).join(' ')).toLowerCase();return input.categoryId==='c_cash'||cashWords.some(w=>text.includes(w))}
  function known(name){return registry.find(r=>r.aliases.some(a=>contains(name,a)||key(name)===key(a)))||null}
  function brandFor(input={}){
    const merchant=merchantName(input);
    if(isCash(input))return {name:'Bargeldabhebung',slug:'',kind:'cash',source:'system'};
    const preset=known(merchant);
    return preset?{name:preset.name,slug:preset.slug,kind:'brand',source:'registry'}:{name:merchant,slug:'',kind:'fallback',source:'fallback'};
  }
  function initials(name){const p=String(name||'?').trim().split(/\s+/).filter(Boolean);return (p.length>1?p[0][0]+p[1][0]:p[0]?.slice(0,2)||'?').toUpperCase()}
  function iconUrl(slug){return slug?`https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}/icons/${encodeURIComponent(slug)}.svg`:''}
  function logoHTML(input={},opts={}){
    const b=brandFor(input),size=Number(opts.size||38),cls=opts.className||'';
    if(b.kind==='cash')return `<span class="merchant-logo merchant-logo-system ${cls}" style="--merchant-logo-size:${size}px" aria-label="Bargeldabhebung">€</span>`;
    return `<span class="merchant-logo merchant-logo-fallback ${cls}" style="--merchant-logo-size:${size}px" data-brand-merchant="${escapeHTML(merchantName(input))}"${b.slug?` data-brand-slug="${escapeHTML(b.slug)}"`:''} aria-label="${escapeHTML(b.name)}">${escapeHTML(initials(b.name))}</span>`;
  }
  async function fetchIcon(slug){
    if(!slug)return null;
    if(iconCache.has(slug))return iconCache.get(slug);
    const task=(async()=>{try{
      const r=await fetch(iconUrl(slug),{cache:'force-cache',headers:{Accept:'image/svg+xml,text/plain;q=0.9,*/*;q=0.1'}});if(!r.ok)return null;
      const text=await r.text(),doc=new DOMParser().parseFromString(text,'image/svg+xml'),svg=doc.querySelector('svg'),path=svg?.querySelector('path'),d=path?.getAttribute('d')||'',viewBox=svg?.getAttribute('viewBox')||'0 0 24 24',title=svg?.querySelector('title')?.textContent||slug;
      if(!d||!/^[0-9.\sMmLlHhVvCcSsQqTtAaZzEe,+-]+$/.test(d)||!/^[0-9.\s-]+$/.test(viewBox))return null;
      return {d,viewBox,title};
    }catch{return null}})();
    iconCache.set(slug,task);return task;
  }
  async function setLogo(node,brand){
    const slug=brand?.slug||node.dataset.brandSlug||'';if(!slug||node.dataset.brandLoading==='1'||node.dataset.brandReady==='1')return false;
    node.dataset.brandLoading='1';
    try{
      const icon=await fetchIcon(slug);if(!icon)return false;
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
      svg.setAttribute('viewBox',icon.viewBox);svg.setAttribute('role','img');svg.setAttribute('aria-label',`${brand?.name||icon.title} Logo`);svg.setAttribute('focusable','false');path.setAttribute('d',icon.d);path.setAttribute('fill','currentColor');svg.appendChild(path);
      node.textContent='';node.classList.remove('merchant-logo-fallback');node.classList.add('merchant-logo-ready');node.appendChild(svg);node.dataset.brandReady='1';return true;
    }catch{return false}finally{delete node.dataset.brandLoading}
  }
  async function hydrate(root=document){
    const nodes=[...(root.querySelectorAll?.('[data-brand-slug]')||[])];
    await Promise.all(nodes.map(node=>setLogo(node,brandFor(node.dataset.brandMerchant||''))));
  }
  function topMerchants(month=selectedMonth,limit=8){
    const grouped=new Map();for(const t of txForMonth(month)){if(t.type!=='expense')continue;const b=brandFor(t),k=key(b.name);const row=grouped.get(k)||{name:b.name,value:0,count:0,sample:t};row.value+=num(t.amount);row.count++;grouped.set(k,row)}return [...grouped.values()].sort((a,b)=>b.value-a.value).slice(0,limit)
  }
  function dashboardMerchantCard(){
    const rows=topMerchants(selectedMonth,5);if(!rows.length)return '';
    return `<article id="dashboardTopMerchants" class="card"><div class="card-title-row"><div><h2>Top-Händler</h2><p>Deine größten Händlerausgaben im laufenden Monat</p></div><button class="mini-btn" data-go="stats">Details</button></div><div class="merchant-ranking">${rows.map((x,i)=>`<div class="merchant-rank-row"><span class="merchant-rank-no">${i+1}</span>${logoHTML(x.sample,{size:34})}<div class="merchant-rank-name"><b>${escapeHTML(x.name)}</b><small>${x.count} Buchung${x.count===1?'':'en'}</small></div><div class="merchant-rank-value"><b class="money">${money(x.value)}</b><small>Ausgaben</small></div></div>`).join('')}</div></article>`;
  }
  const baseDashboard=window.renderDashboard;
  if(typeof baseDashboard==='function')window.renderDashboard=function(){
    baseDashboard();
    const root=$('#view-dashboard');if(!root)return;
    const existing=$('#dashboardTopMerchants',root);if(existing)existing.remove();
    const card=dashboardMerchantCard();if(card){const lower=$('.dashboard-lower',root);if(lower)lower.insertAdjacentHTML('beforeend',card);else root.insertAdjacentHTML('beforeend',card)}
    $$('[data-go="stats"]',root).forEach(b=>b.onclick=()=>navigate('stats'));
    hydrate(root).catch(()=>{});
  };
  const baseSettings=window.renderSettings;
  if(typeof baseSettings==='function')window.renderSettings=function(){baseSettings();const root=$('#view-settings');if(!root||$('#merchantBrandSettings',root))return;root.insertAdjacentHTML('beforeend',`<article id="merchantBrandSettings" class="card" style="margin-top:16px"><div class="card-title-row"><div><h2>Händlerlogos</h2><p>Erkannte Marken werden automatisch in Buchungen, Dashboard, Verträgen und Analysen dargestellt.</p></div><span class="tag green">Aktiv</span></div><div class="setting-row"><div><b>Merchant Brand Engine</b><small style="display:block;color:var(--muted)">Keine Einrichtung nötig · SVG-Markenbibliothek mit sicherem Initialen-Fallback</small></div><span class="tag green">Zero-Config</span></div></article>`)};
  window.FinanzBrand={brandFor,merchantName,logoHTML,iconUrl,fetchIcon,setLogo,hydrate,topMerchants,dashboardMerchantCard,registry,version:SIMPLE_ICONS_VERSION};
})();
