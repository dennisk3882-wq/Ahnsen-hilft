'use strict';
(function(){
  const norm=s=>FinanceLib.normalizeText(String(s||'')).replace(/[^a-z0-9äöüß&. -]+/gi,' ').replace(/\s+/g,' ').trim();
  const registry=[
    ['EDEKA','edeka.de',['edeka']],['PENNY','penny.de',['penny']],['REWE','rewe.de',['rewe']],['ALDI','aldi-nord.de',['aldi']],['Lidl','lidl.de',['lidl']],['Netto','netto-online.de',['netto']],['Kaufland','kaufland.de',['kaufland']],['Marktkauf','marktkauf.de',['marktkauf']],['NORMA','norma-online.de',['norma']],
    ['Netflix','netflix.com',['netflix']],['Spotify','spotify.com',['spotify']],['Disney+','disneyplus.com',['disney']],['Sky','sky.de',['sky']],['DAZN','dazn.com',['dazn']],['YouTube','youtube.com',['youtube']],
    ['Vodafone','vodafone.de',['vodafone']],['Telekom','telekom.de',['telekom','deutsche telekom']],['O2','o2online.de',['telefonica','o2']],['1&1','1und1.de',['1&1','1und1']],['congstar','congstar.de',['congstar']],['freenet','freenet.de',['freenet']],
    ['Amazon','amazon.de',['amazon']],['Zalando','zalando.de',['zalando']],['ABOUT YOU','aboutyou.de',['about you']],['H&M','hm.com',['h&m']],['C&A','c-and-a.com',['c&a']],['Deichmann','deichmann.com',['deichmann']],
    ['Shell','shell.de',['shell']],['Aral','aral.de',['aral']],['Esso','esso.de',['esso']],['TotalEnergies','totalenergies.de',['totalenergies']],['JET','jet.de',['jet']],
    ['McDonald’s','mcdonalds.com',['mcdonald']],['Burger King','burgerking.de',['burger king']],['KFC','kfc.de',['kfc']],['Lieferando','lieferando.de',['lieferando']],['Wolt','wolt.com',['wolt']],['Starbucks','starbucks.de',['starbucks']],
    ['Deutsche Bahn','bahn.de',['deutsche bahn','db vertrieb']],['Uber','uber.com',['uber']],['Bolt','bolt.eu',['bolt']],
    ['PayPal','paypal.com',['paypal']],['Klarna','klarna.com',['klarna']],['Apple','apple.com',['apple com bill','apple']],['Google','google.com',['google']],
    ['dm','dm.de',['dm drogerie']],['Rossmann','rossmann.de',['rossmann']],['IKEA','ikea.com',['ikea']],['OBI','obi.de',['obi']],['Hornbach','hornbach.de',['hornbach']],['BAUHAUS','bauhaus.info',['bauhaus']]
  ].map(([name,domain,aliases])=>({name,domain,aliases}));
  const cashWords=['bargeldabhebung','bargeld abhebung','bargeldauszahlung','geldautomat','cash withdrawal','cashback','cash out','atm withdrawal','atm cash'];
  const cfg=()=>{data.integrations=data.integrations||{};return data.integrations.brandfetch=data.integrations.brandfetch||{clientId:'',enabled:true}};
  const map=()=>data.merchantBrands=data.merchantBrands||{};
  const key=s=>norm(s).toLowerCase();
  function merchantName(input={}){
    if(typeof input==='string')input={title:input};
    const raw=input.sourceMerchant||input.merchant||input.provider||input.title||input.name||'';
    return globalThis.FinanzCategoryIntelligence?.merchantAlias?.(raw)||globalThis.FinanzIntelligence?.canonicalMerchant?.(raw)||String(raw).trim()||'Unbekannt';
  }
  function isCash(input={}){const text=norm([input.title,input.merchant,input.sourceMerchant,input.note,input.remittance,input.bankTransactionDescription].filter(Boolean).join(' ')).toLowerCase();return input.categoryId==='c_cash'||cashWords.some(w=>text.includes(w))}
  function known(name){const n=key(name);return registry.find(r=>r.aliases.some(a=>n===key(a)||n.includes(key(a))))||null}
  function saved(name){const v=map()[key(name)];return v?.domain?v:null}
  function domainFromText(text){const m=String(text||'').match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);return m?.[1]?.toLowerCase()||''}
  function brandFor(input={}){
    const name=merchantName(input);
    if(isCash(input))return {name:'Bargeldabhebung',domain:'',kind:'cash',source:'system'};
    const local=saved(name),preset=known(name),domain=local?.domain||preset?.domain||domainFromText(name);
    return {name:local?.name||preset?.name||name,domain,kind:domain?'brand':'fallback',source:local?'learned':preset?'registry':domain?'domain':'fallback'};
  }
  function initials(name){const p=String(name||'?').trim().split(/\s+/).filter(Boolean);return (p.length>1?p[0][0]+p[1][0]:p[0]?.slice(0,2)||'?').toUpperCase()}
  function logoUrl(domain,size=64){const id=String(cfg().clientId||'').trim();return domain&&id?`https://cdn.brandfetch.io/domain/${encodeURIComponent(domain)}?c=${encodeURIComponent(id)}&w=${Math.max(32,Math.min(256,size))}&h=${Math.max(32,Math.min(256,size))}`:''}
  function logoHTML(input={},opts={}){
    const b=brandFor(input),size=Number(opts.size||38),cls=opts.className||'';
    if(b.kind==='cash')return `<span class="merchant-logo merchant-logo-system ${cls}" style="--merchant-logo-size:${size}px" aria-label="Bargeldabhebung">€</span>`;
    const url=logoUrl(b.domain,size*2),label=escapeHTML(b.name);
    if(url)return `<span class="merchant-logo ${cls}" style="--merchant-logo-size:${size}px" data-brand-merchant="${escapeHTML(merchantName(input))}" data-brand-domain="${escapeHTML(b.domain)}"><img src="${escapeHTML(url)}" alt="${label} Logo" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.classList.add('merchant-logo-fallback');this.parentElement.textContent='${escapeHTML(initials(b.name))}'"></span>`;
    return `<span class="merchant-logo merchant-logo-fallback ${cls}" style="--merchant-logo-size:${size}px" data-brand-merchant="${escapeHTML(merchantName(input))}">${escapeHTML(initials(b.name))}</span>`;
  }
  async function searchBrand(name){
    const id=String(cfg().clientId||'').trim();if(!id||!cfg().enabled||!name||saved(name)||known(name))return saved(name)||known(name);
    try{
      const r=await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(name)}?c=${encodeURIComponent(id)}`,{headers:{Accept:'application/json'}});if(!r.ok)return null;
      const rows=await r.json();const hit=(Array.isArray(rows)?rows:[]).find(x=>x?.domain);if(!hit?.domain)return null;
      map()[key(name)]={name:hit.name||name,domain:hit.domain,updatedAt:new Date().toISOString()};
      if(typeof saveData==='function')saveData('');return map()[key(name)];
    }catch{return null}
  }
  async function hydrate(root=document){
    const nodes=[...root.querySelectorAll?.('[data-brand-merchant]')||[]],todo=[...new Set(nodes.map(n=>n.dataset.brandMerchant).filter(Boolean))];
    await Promise.all(todo.map(searchBrand));
    for(const node of nodes){const b=brandFor(node.dataset.brandMerchant),url=logoUrl(b.domain,80);if(!url||node.querySelector('img'))continue;node.classList.remove('merchant-logo-fallback');node.textContent='';const img=document.createElement('img');img.src=url;img.alt=`${b.name} Logo`;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.onerror=()=>{img.remove();node.classList.add('merchant-logo-fallback');node.textContent=initials(b.name)};node.appendChild(img)}
  }
  function topMerchants(month=selectedMonth,limit=8){
    const grouped=new Map();for(const t of txForMonth(month)){if(t.type!=='expense')continue;const b=brandFor(t),k=key(b.name);const row=grouped.get(k)||{name:b.name,value:0,count:0,sample:t};row.value+=num(t.amount);row.count++;grouped.set(k,row)}return [...grouped.values()].sort((a,b)=>b.value-a.value).slice(0,limit)
  }
  function openSettings(){
    const c=cfg();openModal('Händlerlogos','Brandfetch liefert die offiziellen Markenlogos. Die kostenlose Client-ID darf öffentlich im Browser verwendet werden.',`<form id="brandfetchForm"><div class="field"><label>Brandfetch Client-ID</label><input class="input" name="clientId" value="${escapeHTML(c.clientId||'')}" placeholder="Client-ID einfügen" autocomplete="off"><small>Ohne Client-ID bleiben sichere Initialen-/System-Fallbacks aktiv. Bekannte Händlerdomains sind bereits hinterlegt.</small></div><label class="check-row"><input type="checkbox" name="enabled" ${c.enabled!==false?'checked':''}> Automatische Markensuche aktivieren</label><div class="modal-actions"><button type="button" class="secondary-button" data-cancel>Abbrechen</button><button class="primary-button">Speichern</button></div></form>`,()=>{const f=$('#brandfetchForm');$('[data-cancel]').onclick=closeModal;f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f);c.clientId=String(fd.get('clientId')||'').trim();c.enabled=fd.get('enabled')==='on';closeModal();saveData('Händlerlogo-Einstellungen gespeichert');setTimeout(()=>hydrate(document),0)}})
  }
  const baseSettings=window.renderSettings;
  if(typeof baseSettings==='function')window.renderSettings=function(){baseSettings();const root=$('#view-settings');if(!root||$('#merchantBrandSettings',root))return;const c=cfg();root.insertAdjacentHTML('beforeend',`<article id="merchantBrandSettings" class="card" style="margin-top:16px"><div class="card-title-row"><div><h2>Händlerlogos</h2><p>Marken automatisch erkennen und in Buchungen, Dashboard, Verträgen und Analysen anzeigen</p></div><span class="tag ${c.clientId?'green':'amber'}">${c.clientId?'Aktiv':'Fallback'}</span></div><div class="setting-row"><div><b>Brandfetch Logo Engine</b><small style="display:block;color:var(--muted)">${c.clientId?'Offizielle Logos + automatische Markensuche':'Noch keine Client-ID · Initialen und System-Symbole aktiv'}</small></div><button id="merchantBrandSetup" class="secondary-button">Einrichten</button></div></article>`);$('#merchantBrandSetup',root).onclick=openSettings};
  window.FinanzBrand={cfg,brandFor,merchantName,logoHTML,logoUrl,hydrate,searchBrand,topMerchants,openSettings,registry};
})();
