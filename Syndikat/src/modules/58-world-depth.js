/* SYNDIKAT_V52_WORLD_DEPTH_BEGIN */
(function SYNDIKAT_V52_WORLD_DEPTH(){
  const A='./assets/';
  const BUSINESS_ART=Object.fromEntries(Object.keys(BUSINESSES).map(k=>[k,A+'business-'+k+'.svg']));
  const DISTRICT_ART=Object.fromEntries(DISTRICTS.map(d=>[d.id,A+'district-'+d.id+'.svg']));
  const STAFF_ART={informant:A+'staff-informant.svg',guard:A+'staff-guard.svg',bodyguard:A+'staff-bodyguard.svg',gunman:A+'staff-gunman.svg',lawyer:A+'staff-lawyer.svg',manager:A+'staff-manager.svg'};
  const PERSON_ART={
    'Marco Bellini':A+'portrait-marco.webp',
    'Julia Costa':A+'person-julia-costa.svg','Vito Serra':A+'person-vito-serra.svg','Mara Conti':A+'person-mara-conti.svg',
    'Enzo Vitale':A+'person-enzo-vitale.svg','Giulia Rizzo':A+'person-giulia-rizzo.svg','Luca Ferraro':A+'person-luca-ferraro.svg',
    'Sofia Greco':A+'person-sofia-greco.svg','Carlo De Luca':A+'person-carlo-de-luca.svg','Elena Marino':A+'person-elena-marino.svg',
    'Nico Romano':A+'person-nico-romano.svg','Tessa Bianchi':A+'person-tessa-bianchi.svg','Rico Falcone':A+'person-rico-falcone.svg',
    'Valentina Moretti':A+'person-valentina-moretti.svg','Dario Russo':A+'person-dario-russo.svg','Mina Leone':A+'person-mina-leone.svg'
  };
  const CONTACT_ART={officer:A+'contact-officer.svg',inspector:A+'contact-inspector.svg',judge:A+'contact-judge.svg',prosecutor:A+'contact-prosecutor.svg',mayor:A+'contact-mayor.svg'};
  const PROPERTY_ART={shop:A+'property-shop.svg',block:A+'property-block.svg',warehouse:A+'property-warehouse.svg',prime:A+'property-prime.svg'};
  const RIVAL_INFO={
    Romano:{boss:'Don Enzo Romano',art:A+'rival-romano.svg',motto:'Respekt wird genommen.',style:'Druck & Tempo',desc:'Romano wächst schnell und setzt Rivalen früh unter Druck.'},
    Moretti:{boss:'Sofia Moretti',art:A+'rival-moretti.svg',motto:'Jeder Konflikt hat einen Preis.',style:'Ökonomie & Diplomatie',desc:'Moretti bevorzugt profitable Geschäfte, Verträge und kontrollierte Expansion.'},
    Costa:{boss:'Alessandro Costa',art:A+'rival-costa.svg',motto:'Der richtige Anruf ist mehr wert als zehn Männer.',style:'Einfluss',desc:'Costa baut politische Kontakte auf und reduziert Ermittlungsdruck über Beziehungen.'},
    Bianchi:{boss:'Lucia Bianchi',art:A+'rival-bianchi.svg',motto:'Ware bewegt Macht.',style:'Logistik',desc:'Bianchi liebt Hafen, Routen und hohe Bargeldströme.'},
    Russo:{boss:'Salvatore Russo',art:A+'rival-russo.svg',motto:'Die Stadt spielt. Ich halte die Bank.',style:'Glücksspiel',desc:'Russo konzentriert sich auf Automaten, Wettbüros, Spielhallen und Casinos.'},
    Conti:{boss:'Vincenzo Conti',art:A+'rival-conti.svg',motto:'Wer lange genug steht, gewinnt.',style:'Sicherheit',desc:'Conti investiert in Personal und widerstandsfähige Betriebe.'},
    Falcone:{boss:'Isabella Falcone',art:A+'rival-falcone.svg',motto:'Boden vergisst keine Namen.',style:'Expansion',desc:'Falcone kauft Immobilien und baut Viertel systematisch zu Einflusszonen aus.'}
  };
  const OP_ART={sabotage:A+'op-sabotage.svg',kidnap:A+'op-kidnap.svg',hit:A+'op-hit.svg',bank:A+'op-bank.svg'};
  const ITEM_ART={pistol:A+'item-pistol.svg',shotgun:A+'item-shotgun.svg',tommy:A+'item-tommy.svg',sedan:A+'item-sedan.svg',coupe:A+'item-coupe.svg',van:A+'item-van.svg',armored:A+'item-armored.svg',masks:A+'item-masks.svg',radios:A+'item-radios.svg',armor:A+'item-armor.svg',tools:A+'item-tools.svg'};
  const EVENT_ART={crackdown:A+'event-raid.webp',boom:A+'event-boom.svg',gangwar:A+'event-gangwar.svg',fair:A+'event-fair.svg',recession:A+'event-recession.svg',betrayal:A+'event-betrayal.svg',press:A+'event-press.svg',informant:A+'event-informant.svg',corruption:A+'event-corruption.svg',fire:A+'event-fire.svg',union:A+'event-union.svg'};
  const POS={harbor:[18,28],industrial:[45,19],redlight:[67,24],west:[86,35],oldtown:[15,67],center:[54,54],station:[43,79],south:[81,80]};
  let mapMode='normal';

  function ensureDepth(p){
    p.rivalMemory=p.rivalMemory||{grudges:{},favors:{},encounters:{}};
    p.jointVentures=p.jointVentures||{};
    p.story=p.story||{chapter:1,claimed:[],flags:{},archive:[]};p.story.flags=p.story.flags||{};
    p.stats=p.stats||{};for(const k of ['secretDeals','territorySwaps','deepEvents'])p.stats[k]=Number(p.stats[k])||0;
  }
  function rivalInfo(p){return RIVAL_INFO[p?.family]||null}
  function rivalPortrait(p){return rivalInfo(p)?.art||A+'portrait-vittorio.webp'}
  function districtBusinessCount(p,did){return p.businesses.filter(b=>b.district===did).length}
  function districtIncome(p,did){return Math.round(p.businesses.filter(b=>b.district===did).reduce((s,b)=>s+estimateIncome(p,b),0))}
  function districtTopRival(p,did){return state.players.filter(x=>x.id!==p.id&&!x.eliminated).map(x=>({p:x,s:districtShare(x,did)})).sort((a,b)=>b.s-a.s)[0]||null}

  const oldRel=adjustRelation;
  adjustRelation=function(a,b,d){ensureDepth(a);ensureDepth(b);oldRel(a,b,d);if(d<0){a.rivalMemory.grudges[b.id]=(a.rivalMemory.grudges[b.id]||0)+Math.abs(d);b.rivalMemory.grudges[a.id]=(b.rivalMemory.grudges[a.id]||0)+Math.abs(d);}if(d>0){a.rivalMemory.favors[b.id]=(a.rivalMemory.favors[b.id]||0)+d;b.rivalMemory.favors[a.id]=(b.rivalMemory.favors[a.id]||0)+d;}a.rivalMemory.encounters[b.id]=state?.round||0;b.rivalMemory.encounters[a.id]=state?.round||0;};

  const oldIncome=estimateIncome;
  estimateIncome=function(p,b){let v=oldIncome(p,b);if(p.family==='Moretti')v*=1.06;if(p.family==='Russo'&&['machines','betting','arcade','casino'].includes(b.type))v*=1.10;if(p.family==='Bianchi'&&['machines','bar','club'].includes(b.type))v*=1.05;if(p.family==='Falcone'&&b.propertyId)v*=1.07;const ventures=Object.values(p.jointVentures||{}).filter(until=>until>=state.round).length;if(ventures)v*=1+Math.min(.08,ventures*.025);return v*(1+(p.permanentIncomeBonus||0));};
  const oldSecurity=businessSecurity;
  businessSecurity=function(p,b){let v=oldSecurity(p,b);if(p.family==='Conti')v+=8;return clamp(v,0,98);};
  const oldShield=shield;
  shield=function(p){let v=oldShield(p);if(p.family==='Costa')v+=8;return Math.min(72,v);};

  function overlayText(p,d){
    if(mapMode==='ownership')return `${districtBusinessCount(p,d.id)} Betriebe · ${(state.propertyMarket||[]).filter(x=>x.ownerId===p.id&&x.district===d.id).length} Grundstücke`;
    if(mapMode==='police')return `Polizeidruck ${Math.round(d.police*100)}%`;
    if(mapMode==='income')return `${fmt(districtIncome(p,d.id))}/R`;
    if(mapMode==='rivals'){const r=districtTopRival(p,d.id);return r&&r.s>1?`${r.p.family} ${Math.round(r.s)}%`:'Keine starke Rivalen';}
    const own=districtOwner(d.id);return `${Math.round(districtShare(p,d.id))}% · ${own.player?own.player.family:'Neutral'}`;
  }
  function mapMarkers(p){return DISTRICTS.map(d=>{const [x,y]=POS[d.id],biz=districtBusinessCount(p,d.id),props=(state.propertyMarket||[]).filter(l=>l.ownerId===p.id&&l.district===d.id).length,r=districtTopRival(p,d.id);const rival=mapMode==='rivals'&&r&&r.s>5?`<span class="map-marker rival" style="left:${x+4}%;top:${y+7}%">♛ ${esc(r.p.family)}</span>`:'';const mine=biz||props?`<span class="map-marker mine" style="left:${x-4}%;top:${y+7}%">▣ ${biz}${props?' · ⌂ '+props:''}</span>`:'';return mine+rival;}).join('')}
  function decorateMap(){
    const p=currentPlayer(),grid=$('#districtGrid'),map=grid?.querySelector('.city-art-map');if(!grid||!map)return;
    let bar=$('#cityOverlayBar');if(!bar){grid.insertAdjacentHTML('beforebegin',`<div id="cityOverlayBar" class="map-mode-bar">${[['normal','Übersicht'],['ownership','Besitz'],['police','Polizei'],['income','Einkommen'],['rivals','Rivalen']].map(([id,n])=>`<button class="map-mode ${mapMode===id?'active':''}" data-map-mode="${id}">${n}</button>`).join('')}</div>`);bar=$('#cityOverlayBar');$$('[data-map-mode]',bar).forEach(b=>b.onclick=()=>{mapMode=b.dataset.mapMode;renderCity();});}else $$('[data-map-mode]',bar).forEach(b=>b.classList.toggle('active',b.dataset.mapMode===mapMode));
    $$('.city-map-tag',map).forEach(tag=>{const d=DISTRICTS.find(x=>x.id===tag.dataset.mapDistrict),span=tag.querySelector('span');if(d&&span)span.textContent=overlayText(p,d);});
    map.querySelectorAll('.map-marker').forEach(x=>x.remove());map.insertAdjacentHTML('beforeend',mapMarkers(p));
    const d=DISTRICTS.find(x=>x.id===selectedDistrict),detail=$('#districtDetail');if(d&&detail&&!detail.querySelector('.district-visual'))detail.insertAdjacentHTML('afterbegin',`<div class="district-visual"><img src="${DISTRICT_ART[d.id]}" alt=""><div><strong>${esc(d.name)}</strong><span>${esc(d.desc)}</span></div></div>`);
  }
  const oldCity=renderCity;renderCity=function(){oldCity();decorateMap();decorateEvent();};

  function decorateEvent(){const p=currentPlayer(),list=$('#situationList');if(!list||list.querySelector('.deep-event-card'))return;const ev=p.deepEvent||state?.cityEvent;if(!ev)return;const art=EVENT_ART[ev.id]||A+'event-press.svg';list.insertAdjacentHTML('afterbegin',`<div class="deep-event-card"><img src="${art}" alt=""><div><small>Stadtgeschehen</small><strong>${esc(ev.name||p.eventText||'Ereignis')}</strong><span>${esc(ev.desc||ev.text||'Die Lage verändert sich.')}</span></div></div>`);}

  const oldBiz=renderBusinesses;
  renderBusinesses=function(){oldBiz();const p=currentPlayer();$$('#businessList .business-card').forEach((card,i)=>{const b=p.businesses[i];if(b&&!card.querySelector('.business-thumb'))card.insertAdjacentHTML('afterbegin',`<img class="business-thumb" src="${BUSINESS_ART[b.type]}" alt="">`);});};
  const oldBuy=openBuyDialog;
  openBuyDialog=function(did=selectedDistrict,focus=null){oldBuy(did,focus);$$('#dialogContent .dialog-option [data-buy]').forEach(btn=>{const row=btn.closest('.dialog-option'),type=btn.dataset.buy;if(row&&!row.querySelector('.business-buy-thumb'))row.insertAdjacentHTML('afterbegin',`<img class="business-buy-thumb" src="${BUSINESS_ART[type]}" alt="">`);});};
  const oldBizDialog=openBusinessDialog;
  openBusinessDialog=function(id){const p=currentPlayer(),b=p.businesses.find(x=>x.id===id);oldBizDialog(id);const root=$('#dialogContent .dialog-wrap');if(b&&root&&!root.querySelector('.business-detail-art'))root.querySelector('.dialog-head')?.insertAdjacentHTML('afterend',`<img class="business-detail-art" src="${BUSINESS_ART[b.type]}" alt="">`);};

  function staffVisual(s){return PERSON_ART[s?.name]||STAFF_ART[s?.role]||A+'staff-manager.svg'}
  const oldStaff=renderStaff;
  renderStaff=function(){
    oldStaff();const p=currentPlayer();
    $('#staffGrid [data-staff-person]').forEach(btn=>{
      const person=p.staffRoster.find(x=>x.id===btn.dataset.staffPerson),card=btn.closest('.person-card');if(!person||!card)return;
      const img=card.querySelector('.person-portrait'),initial=card.querySelector('.person-initial-avatar'),src=staffVisual(person);
      if(img)img.src=src;else if(initial)initial.outerHTML=`<img class="person-portrait role-portrait" src="${src}" alt="">`;
    });
  };
  const oldPerson=openStaffPerson;
  openStaffPerson=function(id){
    const p=currentPlayer(),person=p.staffRoster.find(x=>x.id===id);oldPerson(id);if(!person)return;
    const root=$('#dialogContent .dialog-wrap'),src=staffVisual(person),img=root?.querySelector('.dialog-person-hero'),initial=root?.querySelector('.dialog-person-initial');
    if(img)img.src=src;else if(initial)initial.outerHTML=`<img class="dialog-person-hero" src="${src}" alt="">`;
  };

  const oldCorruption=renderCorruption;
  renderCorruption=function(){
    oldCorruption();
    for(const [key,src] of Object.entries(CONTACT_ART)){
      const card=$('#corruptionGrid [data-bribe="'+key+'"]')?.closest('.shop-card');if(!card)continue;
      let img=card.querySelector('.contact-portrait');if(img)img.src=src;else card.insertAdjacentHTML('afterbegin',`<img class="contact-portrait" src="${src}" alt="">`);
    }
  };

  function decoratePropertyMarket(){
    const root=$('#dialogContent');if(!root)return;
    const kinds={Ladenlokal:'shop','Wohn- & Geschäftshaus':'block','Lagerhalle':'warehouse','Premium-Grundstück':'prime'};
    $('.dialog-option',root).forEach(row=>{
      if(row.querySelector('.property-thumb'))return;
      const txt=row.textContent||'';for(const [label,id] of Object.entries(kinds))if(txt.includes(label)){row.insertAdjacentHTML('afterbegin',`<img class="property-thumb" src="${PROPERTY_ART[id]}" alt="">`);break;}
    });
  }
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-land],[data-buy-land],[data-assign-land],[data-sell-land]'))setTimeout(decoratePropertyMarket,35);});

  function openRivalProfile(pid){
    const p=currentPlayer(),r=state.players.find(x=>x.id===pid);if(!r)return;ensureDepth(p);ensureDepth(r);const info=rivalInfo(r),gr=p.rivalMemory.grudges[r.id]||0,fav=p.rivalMemory.favors[r.id]||0;
    openDialog(`<div class="dialog-wrap rival-profile"><div class="dialog-head"><div><p class="eyebrow">Rivalenakte</p><h2>${esc(r.family)}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="rival-hero"><img src="${rivalPortrait(r)}" alt=""><div><small>${esc(info?.style||r.profile)}</small><h3>${esc(info?.boss||r.family)}</h3><p>${esc(info?.desc||'Rivalisierende Familie')}</p><blockquote>${esc(info?.motto||'')}</blockquote></div></div><div class="finance-grid">${metricCards([['Beziehung',relation(p,r),relation(p,r)>=20?'positive':relation(p,r)<0?'negative':''],['Macht',pct(powerIndex(r)),''],['Vermögen',fmt(netWorth(r)),''],['Groll',Math.round(gr),'negative'],['Gefallen',Math.round(fav),'positive'],['Viertel',controlledDistricts(r),'']])}</div><div class="dialog-footer"><button class="btn btn-primary" data-deep-diplomacy="${r.id}">Verhandeln</button></div></div>`);
    $('[data-deep-diplomacy]')?.addEventListener('click',()=>openDeepDiplomacy(r.id));
  }
  const oldRanking=renderRanking;
  renderRanking=function(){oldRanking();const sorted=[...state.players].sort((a,b)=>powerIndex(b)-powerIndex(a));$$('#rankingList .rank-row').forEach((row,i)=>{const r=sorted[i];if(!r||row.querySelector('.rival-rank-portrait'))return;row.insertAdjacentHTML('afterbegin',`<img class="rival-rank-portrait" src="${rivalPortrait(r)}" alt="">`);if(r.id!==currentPlayer().id){row.classList.add('clickable-rival');row.onclick=()=>openRivalProfile(r.id);}});};

  function deepAccept(p,t,base){if(t.type==='human')return confirm(`${t.family}: Angebot annehmen?`);let v=base+relation(p,t)/220-(t.rivalMemory?.grudges?.[p.id]||0)/600;if(t.family==='Moretti')v+=.08;return chance(clamp(v,.08,.9))}
  function openDeepDiplomacy(tid){
    const p=currentPlayer(),t=state.players.find(x=>x.id===tid);if(!t)return;ensureDepth(p);ensureDepth(t);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Geheime Diplomatie</p><h2>${esc(t.family)}</h2></div><button class="icon-btn" data-close>✕</button></div><div class="rival-mini"><img src="${rivalPortrait(t)}" alt=""><div><strong>${esc(rivalInfo(t)?.boss||t.family)}</strong><span>Beziehung ${relation(p,t)} · Groll ${Math.round(t.rivalMemory.grudges[p.id]||0)}</span></div></div><div class="dialog-list">
      <div class="dialog-option"><div><strong>Tribut für Ruhe</strong><p>20.000 $ zahlen und einen vier Runden langen Nichtangriffspakt anbieten.</p></div><button class="btn btn-secondary" data-dd="tribute">Anbieten</button></div>
      <div class="dialog-option"><div><strong>Geheimes Gemeinschaftsgeschäft</strong><p>15.000 $ investieren. Bei Annahme erhalten beide Familien sechs Runden lang einen Einkommensbonus.</p></div><button class="btn btn-secondary" data-dd="venture">Vorschlagen</button></div>
      <div class="dialog-option"><div><strong>Gebietstausch</strong><p>Einen Betrieb gegen einen Rivalenbetrieb tauschen.</p></div><button class="btn btn-secondary" data-dd="swap">Tausch öffnen</button></div>
      <div class="dialog-option"><div><strong>Abkommen brechen</strong><p>Pakte und Bündnisse sofort beenden. Ruf und Beziehung leiden dauerhaft.</p></div><button class="btn btn-danger" data-dd="betray">Verraten</button></div>
    </div></div>`);
    $$('[data-dd]').forEach(b=>b.onclick=()=>doDeepDiplomacy(t,b.dataset.dd));
  }
  function doDeepDiplomacy(t,kind){
    const p=currentPlayer();ensureDepth(p);ensureDepth(t);
    if(kind==='swap'){closeDialog();return openSwapDialog(t.id);}
    if(kind==='tribute'){if(totalLiquid(p)<20000)return toast('Du brauchst 20.000 $.');spend(p,20000);t.clean+=14000;if(deepAccept(p,t,.68)){p.pacts[t.id]=state.round+4;t.pacts[p.id]=state.round+4;adjustRelation(p,t,15);toast('Tribut angenommen. Vier Runden Ruhe.');}else{adjustRelation(p,t,-4);toast('Tribut abgelehnt.');}}
    if(kind==='venture'){if(p.clean<15000)return toast('Du brauchst 15.000 $ sauberes Kapital.');p.clean-=15000;if(deepAccept(p,t,.52)){p.jointVentures[t.id]=state.round+6;t.jointVentures[p.id]=state.round+6;p.stats.secretDeals++;adjustRelation(p,t,10);toast('Geheimes Gemeinschaftsgeschäft gestartet.');}else toast('Das Angebot wird abgelehnt.');}
    if(kind==='betray'){const had=pactActive(p,t)||allianceActive(p,t);delete p.pacts[t.id];delete p.alliances[t.id];delete t.pacts[p.id];delete t.alliances[p.id];if(had){p.reputation=Math.max(0,p.reputation-6);p.stats.betrayals=(p.stats.betrayals||0)+1;adjustRelation(p,t,-45);p.story.flags.betrayal=true;toast('Das Abkommen ist gebrochen. Die Stadt merkt sich Verrat.');}else toast('Es gibt kein aktives Abkommen.');}
    closeDialog();saveGame();renderAll();
  }

  const oldActions=renderActions;
  renderActions=function(){oldActions();const panel=$('#actionsView .action-panel .button-grid');if(panel&&!panel.querySelector('[data-deep-dip]')){panel.insertAdjacentHTML('beforeend','<button class="btn btn-secondary" data-deep-dip>Geheime Diplomatie</button>');$('[data-deep-dip]',panel).onclick=()=>{const r=state.players.find(x=>x.id!==currentPlayer().id&&!x.eliminated);if(r)openRivalProfile(r.id);};}const crimeArt={machine:BUSINESS_ART.machines,mug:A+'event-betrayal.svg',car:A+'item-coupe.svg',bar:BUSINESS_ART.bar,bank:OP_ART.bank};$$('#crimeGrid .crime-card').forEach((card,i)=>{const c=CRIMES[i];if(c&&!card.querySelector('.crime-thumb'))card.insertAdjacentHTML('afterbegin',`<img class="crime-thumb" src="${crimeArt[c.id]||OP_ART.sabotage}" alt="">`);});};

  const oldOp=window.SyndikatV4?.openOperation;
  if(oldOp)window.SyndikatV4.openOperation=function(kind,...args){oldOp(kind,...args);setTimeout(()=>{const root=$('#dialogContent .v4-operation');if(root&&!root.querySelector('.operation-hero'))root.querySelector('.dialog-head')?.insertAdjacentHTML('afterend',`<img class="operation-hero" src="${OP_ART[kind]||OP_ART.sabotage}" alt="">`);},10);};
  function decorateArsenal(){const root=$('#dialogContent');if(!root)return;$$('.dialog-option',root).forEach(row=>{if(row.querySelector('.item-thumb'))return;const txt=row.textContent||'';for(const group of Object.values(window.SyndikatV4?.items||{}))for(const [id,def] of Object.entries(group))if(txt.includes(def.name)&&ITEM_ART[id]){row.insertAdjacentHTML('afterbegin',`<img class="item-thumb" src="${ITEM_ART[id]}" alt="">`);return;}});}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-v4-arsenal],[data-arsenal]');if(b)setTimeout(decorateArsenal,30);});

  const EVENTS2=[
    {id:'betrayal',name:'Gerücht über Verrat',text:'Ein enger Kontakt soll Informationen an eine rivalisierende Familie weitergeben.',apply:p=>{const s=[...activeStaff(p)].sort((a,b)=>a.loyalty-b.loyalty)[0];if(s)s.loyalty=clamp(s.loyalty-7,0,100);}},
    {id:'press',name:'Pressekampagne',text:'Eine Zeitung veröffentlicht eine Serie über organisierte Kriminalität.',apply:p=>{p.reputation=Math.max(0,p.reputation-2);p.heat=clamp(p.heat+4,0,100);}},
    {id:'informant',name:'Informant enttarnt',text:'Eine Quelle wird erkannt. Teile deiner Aufklärung veralten.',apply:p=>{const keys=Object.keys(p.scouting||{});if(keys.length)delete p.scouting[keys[rand(0,keys.length-1)]];}},
    {id:'corruption',name:'Kontakt unter Druck',text:'Interne Ermittler prüfen ungewöhnliche Zahlungen.',apply:p=>{if(p.investigation)p.investigation.corruptionExposure=clamp((p.investigation.corruptionExposure||0)+10,0,100);}},
    {id:'fire',name:'Betriebsausfall',text:'Ein Betrieb wird nach einem Zwischenfall vorübergehend beschädigt.',apply:p=>{if(p.businesses.length){const b=p.businesses[rand(0,p.businesses.length-1)];b.health=clamp(b.health-rand(5,16),0,100);}}},
    {id:'union',name:'Arbeitskampf',text:'Beschäftigte und Lieferanten fordern bessere Bedingungen.',apply:p=>{const cost=Math.min(p.clean,rand(2500,9000));p.clean-=cost;ledger(p,'Arbeitskampf',-cost,'expense');}}
  ];
  const oldTrigger=triggerEvent;
  triggerEvent=function(p){ensureDepth(p);if(chance(.45)){const ev=EVENTS2[rand(0,EVENTS2.length-1)];ev.apply(p);p.eventText=ev.name;p.deepEvent={id:ev.id,name:ev.name,desc:ev.text,round:state.round};p.stats.deepEvents++;log(`${p.family}: ${ev.name} – ${ev.text}`);}else oldTrigger(p);};
  const ce=window.SyndikatDepth?.cityEvents;if(ce&&!ce.some(e=>e.id==='blackout'))ce.push({id:'blackout',name:'Stromausfälle',desc:'Nachtbetriebe schwanken stark, Behörden sind überlastet.',duration:4,income:.96,risk:1.18,legal:.98},{id:'tourism',name:'Tourismuswelle',desc:'Hotels, Clubs und Casinos profitieren von zahlungskräftigen Gästen.',duration:6,income:1.12,risk:.95,legal:1.06},{id:'scandal',name:'Politikskandal',desc:'Behörden stehen unter Beobachtung. Einflussnetzwerke werden riskanter.',duration:5,income:.98,risk:1.15,legal:1},{id:'dockstrike',name:'Hafenstreik',desc:'Logistik stockt, lokale Dienstleistungen werden wichtiger.',duration:5,income:.93,risk:1.04,legal:.97});

  const oldAi=aiTurn;
  aiTurn=function(p){ensureDepth(p);if(p.family==='Costa'&&p.clean>25000){for(const k of ['officer','inspector','prosecutor'])if(!p.bribes[k]&&p.clean>CORRUPTION[k].cost*2){p.clean-=CORRUPTION[k].cost;p.bribes[k]=true;break;}}if(p.family==='Conti')for(const b of p.businesses)if(b.health<80&&p.clean>10000){const c=Math.min(p.clean,Math.round(BUSINESSES[b.type].cost*.025));p.clean-=c;b.health=clamp(b.health+10,0,100);break;}oldAi(p);};

  function addStory(){
    const story=window.SyndikatVisualStory?.story;if(!story||story.some(x=>x.chapter===13))return;const V=window.SyndikatVisualStory.assets;
    story.push(
      {chapter:13,kicker:'Kapitel XIII',title:'Alte Schulden',speaker:'Sofia Moretti',portrait:V.sofia,image:RIVAL_INFO.Moretti.art,desc:'Beweise, dass frühere Entscheidungen Konsequenzen haben.',narrative:['Sofia erinnert sich genau daran, wie du ihr erstes Angebot behandelt hast. Ein alter Handschlag kann heute eine Tür öffnen – eine kalte Schulter kann dieselbe Tür verriegeln.','In der Unterwelt ist Erinnerung eine zweite Währung. Heute wird abgerechnet.'],done:p=>p.reputation>=28,reward:190000,rep:8,choices:[{id:'honor',label:'Alte Zusagen ehren',text:'Frühere Kooperation kann jetzt zu einem langfristigen Vorteil werden.',apply:p=>{const m=state.players.find(x=>x.family==='Moretti');if(p.story.flags.moretti==='pact'&&m){adjustRelation(p,m,18);p.jointVentures[m.id]=state.round+8;m.jointVentures[p.id]=state.round+8;}else{spend(p,30000);p.reputation+=3;}p.story.flags.oldDebt='honor';}},{id:'exploit',label:'Den eigenen Vorteil wählen',text:'Mehr kurzfristiges Kapital, aber Moretti wird sich daran erinnern.',apply:p=>{p.dirty+=45000;const m=state.players.find(x=>x.family==='Moretti');if(m)adjustRelation(p,m,-28);p.story.flags.oldDebt='exploit';}}]},
      {chapter:14,kicker:'Kapitel XIV',title:'Kellers letzter Zug',speaker:'Kommissar Ernst Keller',portrait:V.keller,image:V.court,desc:'Überstehe Kellers persönlichste Ermittlung.',narrative:['Keller legt eine neue Akte an. Diesmal geht es um Muster, alte Zeugen und Entscheidungen, die du längst vergessen glaubtest.','Ob du früher Anwälte oder Kontakte genutzt hast, beeinflusst jetzt, welche Türen Keller noch offenstehen.'],done:p=>(p.investigation?.evidence||0)<=38&&p.heat<=48,reward:210000,rep:9,choices:[{id:'legalfinal',label:'Den Rechtsweg erzwingen',text:'Besonders wirksam, wenn du Keller früher juristisch bekämpft hast.',apply:p=>{const bonus=p.story.flags.keller==='legal'?10:5;if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence-bonus,0,100);p.story.flags.kellerFinal='legal';}},{id:'expose',label:'Öffentlichen Druck erzeugen',text:'Senkt Heat und stärkt deinen Ruf als schwer angreifbarer Gegner.',apply:p=>{p.heat=clamp(p.heat-12,0,100);p.reputation=clamp(p.reputation+4,0,100);p.story.flags.kellerFinal='expose';}}]},
      {chapter:15,kicker:'Kapitel XV',title:'Macht oder Bilanz',speaker:'Marco Bellini',portrait:V.marco,image:BUSINESS_ART.holding,desc:'Entscheide, welche Art von Syndikat du führst.',narrative:['Marco legt zwei Mappen auf den Tisch. In der einen: Einfluss und Präsenz. In der anderen: Beteiligungen, Grundstücke und Verträge.','Beides führt zu Macht. Aber nicht zur gleichen Art von Macht.'],done:p=>netWorth(p)>=6500000||(p.stats?.operationsSuccess||0)>=6,reward:240000,rep:10,choices:[{id:'business',label:'Die Bilanz gewinnt',text:'Wirtschaftliche Erträge steigen dauerhaft leicht.',apply:p=>{p.story.flags.route='business';p.permanentIncomeBonus=(p.permanentIncomeBonus||0)+.04;}},{id:'influence',label:'Der Einfluss gewinnt',text:'Ruf und Beziehungen werden wichtiger.',apply:p=>{p.story.flags.route='influence';p.reputation+=5;}}]},
      {chapter:16,kicker:'Kapitel XVI',title:'Riss in der Familie',speaker:'Marco Bellini',portrait:V.marco,image:A+'event-betrayal.svg',desc:'Halte deine Organisation zusammen.',narrative:['Je größer die Familie, desto mehr Menschen glauben, sie hätten Anspruch auf den Tisch am Fenster. Ein Gerücht über deinen Unterboss reicht, um alte Loyalitäten zu prüfen.','Du musst entscheiden, ob Vertrauen verdient oder erkauft wird.'],done:p=>activeStaff(p).length>=7&&(!p.underbossId||p.staffRoster.find(s=>s.id===p.underbossId)?.loyalty>=55),reward:260000,rep:10,choices:[{id:'trust',label:'Vertrauen zeigen',text:'Der Unterboss gewinnt Loyalität.',apply:p=>{const u=p.staffRoster.find(s=>s.id===p.underbossId);if(u)u.loyalty=clamp(u.loyalty+14,0,100);p.story.flags.family='trust';}},{id:'restructure',label:'Organisation neu ordnen',text:'Die schwächste Loyalität wird entfernt, die verbleibende Struktur stabiler.',apply:p=>{const s=[...activeStaff(p)].sort((a,b)=>a.loyalty-b.loyalty)[0];if(s){p.staffRoster=p.staffRoster.filter(x=>x.id!==s.id);syncStaffCounts(p);}p.story.flags.family='restructure';}}]},
      {chapter:17,kicker:'Kapitel XVII',title:'Die Stadtverwaltung',speaker:'Alessandro Costa',portrait:RIVAL_INFO.Costa.art,image:A+'event-corruption.svg',desc:'Erreiche politischen Einfluss oder beweise, dass du ohne ihn auskommst.',narrative:['Costa lädt dich in ein Büro mit Tageslicht. Das ist seine Art von Machtdemonstration.','Er behauptet, eine Stadt werde nicht auf der Straße regiert, sondern in Sitzungszimmern, in denen niemand seinen echten Preis nennt.'],done:p=>corruptionCount(p)>=3||p.clean>=2500000,reward:290000,rep:11,choices:[{id:'network',label:'Einflussnetzwerk ausbauen',text:'Kontakte werden stärker, aber öffentliche Kontrolle nimmt zu.',apply:p=>{p.story.flags.politics='network';if(p.investigation)p.investigation.corruptionExposure=clamp(p.investigation.corruptionExposure+8,0,100);p.politicalShield=6;}},{id:'independent',label:'Unabhängig bleiben',text:'Kostet Kapital, bringt aber Reputation.',apply:p=>{spend(p,80000);p.reputation+=7;p.story.flags.politics='independent';}}]},
      {chapter:18,kicker:'Kapitel XVIII',title:'Die Stadt steht still',speaker:'Sofia Moretti',portrait:V.sofia,image:A+'event-gangwar.svg',desc:'Beende eine schwere Rivalitätsphase durch Stärke oder Verhandlung.',narrative:['Mehrere Familien ziehen gleichzeitig Grenzen neu. Lieferanten warten ab, Geschäftsleute schließen früher, alte Verträge werden plötzlich wichtig.','Du kannst die Lage weiter eskalieren oder zeigen, dass die Stadt auch durch Absprachen kontrolliert werden kann.'],done:p=>(p.stats?.operationsSuccess||0)>=7||state.players.some(x=>x.id!==p.id&&relation(p,x)>=35),reward:330000,rep:12,choices:[{id:'pressure',label:'Härte zeigen',text:'Mehr Ruf, schlechtere Rivalenbeziehungen.',apply:p=>{state.players.filter(x=>x.id!==p.id).forEach(x=>adjustRelation(p,x,-8));p.reputation+=6;p.story.flags.cityCrisis='pressure';}},{id:'settle',label:'Einigung suchen',text:'40.000 $ für eine stadtweite Deeskalation.',apply:p=>{spend(p,40000);state.players.filter(x=>x.id!==p.id).forEach(x=>adjustRelation(p,x,8));p.heat=clamp(p.heat-10,0,100);p.story.flags.cityCrisis='settle';}}]},
      {chapter:19,kicker:'Kapitel XIX',title:'Das Erbe',speaker:'Don Vittorio Leone',portrait:V.vittorio,image:V.city,desc:'Bereite deine Organisation auf eine Zukunft ohne dich vor.',narrative:['Vittorio spricht zum ersten Mal nicht über den nächsten Monat, sondern über die nächsten zehn Jahre. Ein Imperium, das an einer Person hängt, ist kein Imperium.','Crews, Unterboss und Betriebe müssen auch dann funktionieren, wenn du nicht mehr jede Entscheidung selbst triffst.'],done:p=>!!p.underbossId&&(p.crews||[]).length>=2&&activeStaff(p).length>=8,reward:380000,rep:13,choices:[{id:'family',label:'Familienmodell',text:'Loyalität aller Mitarbeiter steigt.',apply:p=>{activeStaff(p).forEach(s=>s.loyalty=clamp(s.loyalty+7,0,100));p.story.flags.legacy='family';}},{id:'corporate',label:'Konzernmodell',text:'Betriebe werden effizienter.',apply:p=>{p.permanentIncomeBonus=(p.permanentIncomeBonus||0)+.035;p.story.flags.legacy='corporate';}}]},
      {chapter:20,kicker:'Epilog',title:'Welche Stadt bleibt?',speaker:'Don Vittorio Leone',portrait:V.vittorio,image:V.city,desc:'Erreiche endgültige Dominanz und bestimme, welches Syndikat du hinterlässt.',narrative:['Die Stadt ist ruhig – nicht friedlich. Das ist ein Unterschied, den du besser kennst als jeder andere.','Alles, was du früher entschieden hast, liegt jetzt unter diesem Moment: Moretti, Keller, Marco, Politik und Geld.'],done:p=>powerIndex(p)>=72&&controlledDistricts(p)>=3&&p.finalCrisis?.resolved,reward:500000,rep:18,choices:[{id:'empire',label:'Das legale Imperium',text:'Dein Syndikat tritt als Konzern in die Zukunft.',apply:p=>{p.story.flags.ending='empire';p.clean+=150000;}},{id:'shadow',label:'Der unsichtbare Staat',text:'Kontakte und Abhängigkeiten bleiben deine wichtigste Währung.',apply:p=>{p.story.flags.ending='shadow';p.politicalShield=(p.politicalShield||0)+10;}},{id:'crown',label:'Krone aus Neon',text:'Die Stadt soll deinen Namen nie vergessen.',apply:p=>{p.story.flags.ending='crown';p.reputation=clamp(p.reputation+10,0,100);}}]}
    );
  }
  addStory();

  const oldGameOver=showGameOver;
  showGameOver=function(){oldGameOver();const p=state?.players.find(x=>x.id===state.winnerId),root=$('#dialogContent');if(!p||!root||root.querySelector('.ending-card'))return;const e=p.story?.flags?.ending||(p.finalCrisis?.choice==='legit'?'empire':p.finalCrisis?.choice==='politics'?'shadow':p.finalCrisis?.choice==='war'?'crown':'family');const endings={empire:['Das legale Imperium',BUSINESS_ART.holding,'Deine Macht trägt Anzüge, besitzt Gebäude und unterschreibt Verträge.'],shadow:['Der unsichtbare Staat',A+'event-corruption.svg','Niemand kann genau sagen, wo dein Einfluss beginnt. Genau deshalb reicht er so weit.'],crown:['Krone aus Neon',V=>V,'Die Stadt erinnert sich an deinen Namen und deine Macht.'],family:['Die Familie bleibt',A+'staff-bodyguard.svg','Deine Organisation hat gelernt, ohne einzelne Helden zu bestehen.']};let x=endings[e]||endings.family;if(typeof x[1]==='function')x=[x[0],A+'start-user.webp',x[2]];root.insertAdjacentHTML('beforeend',`<div class="ending-card"><img src="${x[1]}" alt=""><div><small>Dein Ende</small><h3>${x[0]}</h3><p>${x[2]}</p></div></div>`);};

  const oldInit=initPlayer;initPlayer=function(p){oldInit(p);ensureDepth(p);};
  const oldMigrate=migrateState;migrateState=function(data){data=oldMigrate(data);(data.players||[]).forEach(ensureDepth);return data;};

  window.SyndikatWorldDepth={businessArt:BUSINESS_ART,districtArt:DISTRICT_ART,rivals:RIVAL_INFO,operationArt:OP_ART,itemArt:ITEM_ART,setMapMode:m=>{mapMode=m;renderCity();}};
})();
/* SYNDIKAT_V52_WORLD_DEPTH_END */
