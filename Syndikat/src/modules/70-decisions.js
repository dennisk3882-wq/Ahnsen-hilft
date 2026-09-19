/* SYNDIKAT_V46_DECISIONS_BEGIN */
(function SYNDIKAT_V46_DECISIONS(){
  const DECISIONS={
    takeover:{
      title:'Ein Viertel liegt dir zu Füßen',
      intro:d=>`Du kontrollierst nun ${d.name}. Wie soll deine Familie die neue Macht nutzen?`,
      options:[
        {id:'soft',name:'Ruhe & gute Geschäfte',desc:'Investiere in Stabilität. Weniger Heat, mehr Reputation.',cost:12000,apply:(p,d)=>{p.clean=Math.max(0,p.clean-12000);p.heat=clamp(p.heat-12,0,100);p.reputation=clamp(p.reputation+5,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence-5,0,100);d.demand=clamp(d.demand+.03,.65,1.35);}},
        {id:'hard',name:'Die Straße gehört uns',desc:'Schutzgeld und Einschüchterung ausbauen. Mehr Geld, aber mehr Druck.',cost:0,apply:(p,d)=>{p.heat=clamp(p.heat+14,0,100);p.reputation=clamp(p.reputation+3,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+7,0,100);p.protection=p.protection||{};const lv=p.protection[d.id]?.level||0;p.protection[d.id]={level:Math.min(3,lv+1),started:state.round};}},
        {id:'develop',name:'Investieren & aufwerten',desc:'20.000 $ in Infrastruktur und Immobilienwerte investieren.',cost:20000,apply:(p,d)=>{p.clean=Math.max(0,p.clean-20000);d.demand=clamp(d.demand+.06,.65,1.40);for(const lot of state.propertyMarket||[])if(lot.district===d.id)lot.value=Math.round(lot.value*1.04);p.reputation=clamp(p.reputation+4,0,100);}}
      ]
    },
    press:{
      title:'Die Zeitung stellt Fragen',
      intro:()=>`Ein Reporter verbindet mehrere Vorfälle mit deiner Familie. Eine falsche Reaktion kann Ermittlungen beschleunigen.`,
      options:[
        {id:'lawyer',name:'Anwälte vorschicken',desc:'Sauber, teuer und kontrolliert.',cost:9000,apply:p=>{p.clean=Math.max(0,p.clean-9000);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence-9,0,100);p.reputation=clamp(p.reputation+2,0,100);}},
        {id:'bribe',name:'Redaktion schmieren',desc:'Billiger, aber ein weiteres Korruptionsrisiko.',cost:6000,apply:p=>{p.dirty=Math.max(0,p.dirty-6000);if(p.investigation){p.investigation.evidence=clamp(p.investigation.evidence-6,0,100);p.investigation.corruptionExposure=clamp(p.investigation.corruptionExposure+12,0,100);}p.heat=clamp(p.heat+2,0,100);}},
        {id:'ignore',name:'Ignorieren',desc:'Kein Geld ausgeben, dafür steigt die öffentliche Aufmerksamkeit.',cost:0,apply:p=>{p.heat=clamp(p.heat+8,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+5,0,100);}}
      ]
    },
    labor:{
      title:'Arbeitskampf in deinen Betrieben',
      intro:()=>`Beschäftigte verlangen bessere Bedingungen. Deine Entscheidung beeinflusst Kosten, Ruf und Loyalität.`,
      options:[
        {id:'pay',name:'Löhne erhöhen',desc:'15.000 $ zahlen, Loyalität und Ruf steigen.',cost:15000,apply:p=>{p.clean=Math.max(0,p.clean-15000);for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty+7,0,100);p.reputation=clamp(p.reputation+4,0,100);}},
        {id:'manager',name:'Manager verhandeln lassen',desc:'Erfolg hängt von deinem Management ab.',cost:4000,apply:p=>{p.clean=Math.max(0,p.clean-4000);const ok=chance(.35+roleSkill(p,'manager')/160);if(ok){for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty+3,0,100);p.reputation+=2;}else{for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty-6,0,100);p.lastExpenses+=5000;spend(p,5000,true);}}},
        {id:'force',name:'Einschüchtern',desc:'Kurzfristig billig, langfristig riskant.',cost:0,apply:p=>{p.heat=clamp(p.heat+10,0,100);if(p.investigation)p.investigation.evidence=clamp(p.investigation.evidence+6,0,100);for(const s of activeStaff(p))s.loyalty=clamp(s.loyalty-rand(2,6),0,100);}}
      ]
    }
  };
  function v46Ensure(p){p.pendingDecisions=Array.isArray(p.pendingDecisions)?p.pendingDecisions:[];p.controlMilestones=p.controlMilestones||{};p.stats=p.stats||{};p.stats.decisions=Number(p.stats.decisions)||0;p.stats.aiTrades=Number(p.stats.aiTrades)||0;}
  function v46Queue(p,type,data={}){
    v46Ensure(p);
    if(p.pendingDecisions.some(x=>x.type===type&&JSON.stringify(x.data||{})===JSON.stringify(data||{})))return;
    p.pendingDecisions.push({id:uid(),type,data,round:state.round});
  }
  function v46CheckTerritory(p){
    v46Ensure(p);
    for(const d of DISTRICTS){
      const control=districtShare(p,d.id)>=50;
      if(control&&!p.controlMilestones[d.id]){
        p.controlMilestones[d.id]=state.round;
        if(p.type==='human'||p.type==='remote')v46Queue(p,'takeover',{district:d.id});
        else v46ResolveAiDecision(p,{type:'takeover',data:{district:d.id}});
        log(`${p.family} übernimmt die Kontrolle in ${d.name}.`);
      }
    }
  }
  function v46MaybeCityDecision(p){
    if(p.type!=='human'&&p.type!=='remote')return;
    if(p.pendingDecisions.length)return;
    if(state.round>=12&&state.round%17===0&&chance(.55))v46Queue(p,roleSkill(p,'lawyer')>roleSkill(p,'manager')?'press':'labor',{});
  }
  function v46ResolveAiDecision(p,d){
    const spec=DECISIONS[d.type];if(!spec)return;let option=spec.options[0];
    if(d.type==='takeover'){option=p.profile==='aggressive'?spec.options[1]:p.profile==='economic'?spec.options[2]:spec.options[0];}
    if(d.type==='press'){option=p.profile==='corrupt'?spec.options[1]:p.profile==='economic'?spec.options[0]:spec.options[2];}
    if(d.type==='labor'){option=p.profile==='aggressive'?spec.options[2]:p.profile==='economic'?spec.options[1]:spec.options[0];}
    const district=d.data?.district?DISTRICTS.find(x=>x.id===d.data.district):null;
    const pool=option.cost?Math.max(p.clean,p.dirty):Infinity;if(pool<option.cost)option=spec.options.find(x=>x.cost===0)||spec.options[0];
    option.apply(p,district);p.stats.decisions++;log(`${p.family}: Entscheidung „${option.name}“.`);
  }
  function v46OpenDecision(id=null){
    const p=currentPlayer();v46Ensure(p);const dec=id?p.pendingDecisions.find(x=>x.id===id):p.pendingDecisions[0];if(!dec)return toast('Keine Entscheidung offen.');
    const spec=DECISIONS[dec.type];if(!spec)return;
    const d=dec.data?.district?DISTRICTS.find(x=>x.id===dec.data.district):null;
    openDialog(`<div class="dialog-wrap decision-dialog"><div class="dialog-head"><div><p class="eyebrow">Entscheidung · Runde ${dec.round}</p><h2>${esc(spec.title)}</h2></div><button class="icon-btn" data-close>✕</button></div><p>${esc(spec.intro(d))}</p><div class="dialog-list">${spec.options.map(o=>{const enough=o.cost===0||p.clean>=o.cost||p.dirty>=o.cost;return `<div class="dialog-option"><div><strong>${esc(o.name)}</strong><p>${esc(o.desc)}${o.cost?` · Kosten ${fmt(o.cost)}`:''}</p></div><button class="btn btn-primary" data-decision="${o.id}" ${enough?'':'disabled'}>Wählen</button></div>`}).join('')}</div></div>`);
    $('[data-decision]').forEach(btn=>btn.onclick=()=>{const o=spec.options.find(x=>x.id===btn.dataset.decision);if(!o)return;o.apply(p,d);p.pendingDecisions=p.pendingDecisions.filter(x=>x.id!==dec.id);p.stats.decisions++;log(`${p.family}: Entscheidung „${o.name}“.`);closeDialog();saveGame();renderAll();toast('Entscheidung umgesetzt.');});
  }

  function v46AiTrade(p){
    if(p.clean<180000||p.businesses.length<2||chance(.90))return false;
    const candidates=state.players.filter(t=>t.id!==p.id&&!t.eliminated&&t.type==='ai'&&relation(p,t)>8&&t.businesses.length&&!allianceActive(p,t));
    if(!candidates.length)return false;
    const t=candidates[rand(0,candidates.length-1)];
    const b=[...t.businesses].filter(b=>(BUSINESSES[b.type].tier||1)<=Math.max(4,Math.floor((p.reputation||0)/18)+1)).sort((a,b)=>BUSINESSES[b.type].influence-BUSINESSES[a.type].influence)[0];
    if(!b)return false;
    const price=Math.round(BUSINESSES[b.type].cost*(.92+b.level*.10)*(b.health/100));
    if(p.clean<price*1.35)return false;
    const accept=relation(t,p)>18||t.clean<25000||chance(.18);
    if(!accept)return false;
    p.clean-=price;t.clean+=price;t.businesses=t.businesses.filter(x=>x.id!==b.id);b.propertyId=null;b.leaseCost=0;p.businesses.push(b);p.stats.aiTrades++;t.stats.aiTrades=(t.stats.aiTrades||0)+1;adjustRelation(p,t,5);log(`${p.family} kauft ${BUSINESSES[b.type].name} von ${t.family} für ${fmt(price)}.`);return true;
  }

  const v46Init=initPlayer;
  initPlayer=function(p){v46Init(p);v46Ensure(p);};
  const v46Migrate=migrateState;
  migrateState=function(data){data=v46Migrate(data);(data.players||[]).forEach(v46Ensure);return data;};

  const v46End=processEndOfTurn;
  processEndOfTurn=function(p){
    v46End(p);v46CheckTerritory(p);v46MaybeCityDecision(p);saveGame();
  };

  const v46Ai=aiTurn;
  aiTurn=function(p){if(!v46AiTrade(p))v46Ai(p);};

  const v46City=renderCity;
  renderCity=function(){
    v46City();const p=currentPlayer();v46Ensure(p);const list=$('#situationList');
    if(p.pendingDecisions.length&&list&&!list.querySelector('[data-open-decision]')){
      list.insertAdjacentHTML('afterbegin',`<div class="situation-item decision-row"><span>Entscheidung offen</span><button class="btn btn-primary" data-open-decision>${p.pendingDecisions.length} Entscheidung${p.pendingDecisions.length===1?'':'en'}</button></div>`);
      $('[data-open-decision]',list).onclick=()=>v46OpenDecision();
    }
  };

  const v46More=openMoreMenu;
  openMoreMenu=function(){
    v46More();const p=currentPlayer(),root=$('#dialogContent .more-grid');if(root&&p?.pendingDecisions?.length&&!root.querySelector('[data-v46-decisions]')){root.insertAdjacentHTML('beforeend',`<button class="btn btn-primary" data-v46-decisions>◆ Entscheidungen (${p.pendingDecisions.length})</button>`);$('[data-v46-decisions]',root).onclick=()=>v46OpenDecision();}
  };

  window.SyndikatDecisions={open:v46OpenDecision};
})();
/* SYNDIKAT_V46_DECISIONS_END */
