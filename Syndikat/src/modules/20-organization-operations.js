/* SYNDIKAT_V4_SYSTEMS_BEGIN */
(function SYNDIKAT_V4_SYSTEMS(){
  const V4_ITEMS={
    weapons:{
      pistol:{name:'Pistole',cost:4500,power:8,heat:2,evidence:1,desc:'Zuverlässig, unauffällig und für kleine Teams geeignet.'},
      shotgun:{name:'Schrotflinte',cost:9000,power:15,heat:5,evidence:3,desc:'Hohe Durchschlagskraft, aber auffällig.'},
      tommy:{name:'Maschinenpistole',cost:18000,power:23,heat:9,evidence:6,desc:'Für schwere Einsätze. Effektiv, laut und riskant.'}
    },
    vehicles:{
      sedan:{name:'Unauffällige Limousine',cost:18000,power:4,heat:-2,evidence:-1,desc:'Unauffällige Anfahrt und Flucht.'},
      coupe:{name:'Schnelles Coupé',cost:32000,power:7,heat:1,evidence:0,desc:'Schnelle Flucht, wenig Platz.'},
      van:{name:'Lieferwagen',cost:42000,power:8,heat:0,evidence:-2,desc:'Ideal für größere Crews und Entführungen.'},
      armored:{name:'Gepanzerte Limousine',cost:120000,power:14,heat:3,evidence:-1,desc:'Teuer, aber sehr sicher.'}
    },
    gear:{
      masks:{name:'Masken & Handschuhe',cost:2500,power:0,heat:-1,evidence:-6,desc:'Reduziert Spuren und Zeugenaussagen.'},
      radios:{name:'Funkgeräte',cost:6000,power:6,heat:0,evidence:-1,desc:'Verbessert Koordination und Timing.'},
      armor:{name:'Schutzwesten',cost:12000,power:8,heat:1,evidence:0,desc:'Erhöht Überlebenschance bei Gegenwehr.'},
      tools:{name:'Spezialwerkzeug',cost:8000,power:7,heat:-1,evidence:-2,desc:'Hilft bei Sabotage und Einbruch.'}
    }
  };
  const V4_SPECIALTIES={
    informant:['Observierung','Quellenführung','Gegenaufklärung'],
    guard:['Objektschutz','Kontrolle','Abschreckung'],
    bodyguard:['Personenschutz','Fahrer','Krisenreaktion'],
    gunman:['Nahkampf','Präzision','Einsatzführung'],
    lawyer:['Strafrecht','Verhandlung','Beweisabwehr'],
    manager:['Finanzen','Logistik','Personalführung']
  };
  const V4_OPS={
    sabotage:{name:'Sabotage',baseCost:3500,baseHeat:14,baseEvidence:14,baseChance:.48,ap:2,target:'business'},
    kidnap:{name:'Entführung',baseCost:6000,baseHeat:22,baseEvidence:20,baseChance:.40,ap:2,target:'staff'},
    hit:{name:'Mordanschlag',baseCost:12000,baseHeat:36,baseEvidence:32,baseChance:.24,ap:2,target:'staff'},
    bank:{name:'Banküberfall',baseCost:9000,baseHeat:30,baseEvidence:28,baseChance:.30,ap:2,target:'bank'}
  };

  function v4EnsurePerson(s){
    s.xp=Number(s.xp)||0;
    s.level=Math.max(1,Number(s.level)||1);
    s.specialty=s.specialty||'';
    s.assignedBusinessId=s.assignedBusinessId||null;
    s.crewId=s.crewId||null;
    s.operations=Number(s.operations)||0;
    s.successes=Number(s.successes)||0;
  }
  function v4EnsurePlayer(p){
    p.inventory=p.inventory||{weapons:[],vehicles:[],gear:[]};
    for(const k of ['weapons','vehicles','gear'])p.inventory[k]=Array.isArray(p.inventory[k])?p.inventory[k]:[];
    p.crews=Array.isArray(p.crews)?p.crews:[];
    p.underbossId=p.underbossId||null;
    p.investigation=p.investigation||{evidence:0,stage:'Keine Akte',warrant:false,lastCase:'',corruptionExposure:0,raids:0};
    p.story=p.story||{chapter:1,claimed:[]};
    p.stats=p.stats||{};
    for(const k of ['operationsSuccess','operationsFailed','training','betrayals','evidenceDestroyed','crewMissions','launderedTotal'])p.stats[k]=Number(p.stats[k])||0;
    p.staffRoster=(p.staffRoster||[]).map(s=>{v4EnsurePerson(s);return s;});
    p.crews=p.crews.map(c=>({id:c.id||uid(),name:c.name||'Crew',memberIds:Array.isArray(c.memberIds)?c.memberIds:[],underbossId:c.underbossId||null,wins:Number(c.wins)||0,losses:Number(c.losses)||0}));
  }
  function v4Item(type,id){return V4_ITEMS[type]?.[id]||null;}
  function v4Owns(p,type,id){return (p.inventory?.[type]||[]).some(x=>x.id===id);}
  function v4AddItem(p,type,id){const def=v4Item(type,id);if(!def)return false;if(v4Owns(p,type,id))return false;p.inventory[type].push({id,condition:100,acquiredRound:state.round});return true;}
  function v4CrewMembers(p,crewId){
    const c=p.crews.find(x=>x.id===crewId);
    if(!c)return activeStaff(p).filter(s=>s.role==='gunman'||s.role==='informant'||s.role==='bodyguard').slice(0,4);
    return c.memberIds.map(id=>p.staffRoster.find(s=>s.id===id)).filter(s=>s&&s.heldUntil<=state.round);
  }
  function v4XpNeed(level){return 50+level*35;}
  function v4GainXp(person,amount){
    if(!person)return;
    person.xp+=Math.max(0,Math.round(amount));
    while(person.level<10&&person.xp>=v4XpNeed(person.level)){person.xp-=v4XpNeed(person.level);person.level++;person.skill=clamp(person.skill+rand(2,5),1,100);person.loyalty=clamp(person.loyalty+2,0,100);}
  }
  function v4CrewPower(p,crewId){
    const members=v4CrewMembers(p,crewId);
    if(!members.length)return 0;
    return members.reduce((sum,s)=>sum+s.skill*.55+s.level*4+(s.specialty==='Einsatzführung'?7:0),0)/Math.max(1,members.length);
  }
  function v4CounterIntel(p){return roleSkill(p,'informant')*.22+activeStaff(p).filter(s=>s.specialty==='Gegenaufklärung').reduce((a,s)=>a+s.skill*.08,0);}
  function v4BusinessAssignmentBonus(p,b){
    const assigned=activeStaff(p).filter(s=>s.assignedBusinessId===b.id);
    return assigned.reduce((sum,s)=>sum+(s.role==='manager'?s.skill*.0015:s.role==='guard'?s.skill*.0007:0),0);
  }
  function v4InvestigationStage(p){
    const e=p.investigation.evidence;
    if(e>=85)return'Anklage droht';
    if(e>=70)return'Haftbefehl';
    if(e>=50)return'Aktive Ermittlungen';
    if(e>=28)return'Observation';
    return'Keine Akte';
  }
  function v4AddEvidence(p,amount,reason='Spuren aus einer Aktion'){
    v4EnsurePlayer(p);
    const mitigation=1-Math.min(.52,(roleSkill(p,'lawyer')+v4CounterIntel(p))/360);
    const add=Math.max(0,Math.round(amount*mitigation));
    p.investigation.evidence=clamp(p.investigation.evidence+add,0,100);
    p.investigation.lastCase=reason;
    p.investigation.stage=v4InvestigationStage(p);
    p.investigation.warrant=p.investigation.evidence>=70;
    return add;
  }
  function v4ProcessInvestigation(p){
    v4EnsurePlayer(p);
    let decay=2+Math.round(roleSkill(p,'lawyer')/45)+Math.round(v4CounterIntel(p)/55);
    if(p.bribes.inspector)decay+=2;if(p.bribes.prosecutor)decay+=2;
    p.investigation.evidence=clamp(p.investigation.evidence-decay,0,100);
    p.investigation.stage=v4InvestigationStage(p);
    p.investigation.warrant=p.investigation.evidence>=70;
    if(p.investigation.evidence>=55&&Object.values(p.bribes).some(Boolean)){
      p.investigation.corruptionExposure=clamp(p.investigation.corruptionExposure+rand(1,4),0,100);
      if(p.investigation.corruptionExposure>=65&&chance(.10)){
        const active=Object.keys(p.bribes).filter(k=>p.bribes[k]);
        if(active.length){const k=active[rand(0,active.length-1)];p.bribes[k]=false;p.reputation=Math.max(0,p.reputation-4);p.investigation.corruptionExposure=Math.max(20,p.investigation.corruptionExposure-35);log(`${p.family}: Ein korrupter Kontakt (${CORRUPTION[k].name}) fliegt auf.`);}
      }
    }else p.investigation.corruptionExposure=Math.max(0,p.investigation.corruptionExposure-2);
    if(p.investigation.evidence>=88&&!p.jailed&&chance(.12*(1-shield(p)/100))){
      p.jailed=Math.max(p.jailed,rand(2,4));p.investigation.evidence=Math.max(45,p.investigation.evidence-28);log(`${p.family}: Ermittler schlagen zu – Haftbefehl vollstreckt.`);
    }
  }
  function v4ProcessStaffProgress(p){
    v4EnsurePlayer(p);
    for(const s of activeStaff(p)){
      let xp=1;
      if(s.assignedBusinessId&&p.businesses.some(b=>b.id===s.assignedBusinessId))xp+=2;
      if(s.crewId)xp+=1;
      v4GainXp(s,xp);
    }
    const deserters=[];
    for(const s of activeStaff(p)){
      if(s.loyalty<24&&chance(.035+(24-s.loyalty)/500))deserters.push(s);
    }
    for(const s of deserters){
      p.staffRoster=p.staffRoster.filter(x=>x.id!==s.id);
      p.crews.forEach(c=>c.memberIds=c.memberIds.filter(id=>id!==s.id));
      if(p.underbossId===s.id)p.underbossId=null;
      syncStaffCounts(p);log(`${p.family}: ${s.name} verlässt die Organisation wegen mangelnder Loyalität.`);
    }
  }
  function v4EquipmentMods(p,vehicleId,weaponId,gearId){
    const calc=(type,id)=>{
      const def=v4Item(type,id)||{power:0,heat:0,evidence:0};
      const inv=(p.inventory?.[type]||[]).find(x=>x.id===id);
      const condition=inv?clamp(Number(inv.condition)||100,15,100):100;
      const wear=condition/100;
      return{
        power:def.power*wear,
        heat:def.heat+(condition<55?2:0)+(condition<30?3:0),
        evidence:def.evidence+(condition<50?2:0),
        condition
      };
    };
    const vehicle=calc('vehicles',vehicleId),weapon=calc('weapons',weaponId),gear=calc('gear',gearId);
    return{power:vehicle.power+weapon.power+gear.power,heat:vehicle.heat+weapon.heat+gear.heat,evidence:vehicle.evidence+weapon.evidence+gear.evidence};
  }
  function v4OpPreview(kind,p,targetPlayer,target,crewId,vehicleId,weaponId,gearId,timing){
    const spec=V4_OPS[kind],crew=v4CrewPower(p,crewId),mods=v4EquipmentMods(p,vehicleId,weaponId,gearId),intel=roleSkill(p,'informant')*.13;
    let defense=20;
    if(kind==='sabotage'&&targetPlayer&&target)defense=businessSecurity(targetPlayer,target);
    if((kind==='kidnap'||kind==='hit')&&targetPlayer)defense=roleSkill(targetPlayer,'guard')*.25+roleSkill(targetPlayer,'bodyguard')*.22+(target?.skill||40)*.18;
    if(kind==='bank')defense=58;
    const timingBonus=timing==='night'?8:timing==='evening'?3:-3;
    const chanceVal=clamp(spec.baseChance+(crew+mods.power+intel+timingBonus-defense)/150,.08,.92);
    const heat=Math.max(4,Math.round(spec.baseHeat+mods.heat-(timing==='night'?3:0)));
    const evidence=Math.max(2,Math.round(spec.baseEvidence+mods.evidence-(roleSkill(p,'informant')/30)));
    return{chance:chanceVal,heat,evidence,cost:spec.baseCost,crew,defense};
  }
  function v4TargetOptions(kind,tid){
    if(kind==='bank')return[{id:'bank',label:'Zentralbank'}];
    const t=state.players.find(x=>x.id===tid);if(!t)return[];
    if(kind==='sabotage')return t.businesses.map(b=>({id:b.id,label:`${BUSINESSES[b.type].name} · ${DISTRICTS.find(d=>d.id===b.district).name}`}));
    return activeStaff(t).map(s=>({id:s.id,label:`${s.name} · ${STAFF[s.role].name} · L${s.level}`}));
  }
  function v4OperationTargets(p,kind){
    if(kind==='bank')return[{id:'bank',family:'Stadtbank'}];
    return state.players.filter(t=>t.id!==p.id&&!t.eliminated&&!pactActive(p,t)&&!allianceActive(p,t));
  }
  function v4OpenOperationPlanner(kind,tid=null,targetId=null){
    const p=currentPlayer(),spec=V4_OPS[kind];v4EnsurePlayer(p);
    if(!spec||p.jailed)return toast('Diese Operation ist momentan nicht möglich.');
    if(p.actionPoints<spec.ap)return toast(`Du brauchst ${spec.ap} AP.`);
    const targets=v4OperationTargets(p,kind);if(!targets.length)return toast('Kein geeignetes Ziel vorhanden.');
    const targetPlayer=kind==='bank'?null:(state.players.find(x=>x.id===tid)||targets[0]);
    const selectedTid=kind==='bank'?'bank':targetPlayer.id;
    const targetOpts=v4TargetOptions(kind,selectedTid);if(!targetOpts.length&&kind!=='bank')return toast('Beim Ziel gibt es momentan nichts anzugreifen.');
    const selectedTarget=targetOpts.find(x=>x.id===targetId)?.id||targetOpts[0]?.id||'bank';
    const crews=p.crews.length?p.crews:[{id:'auto',name:'Automatische Einsatzgruppe'}];
    const veh=[{id:'',name:'Kein Fahrzeug'},...p.inventory.vehicles.map(x=>({id:x.id,name:v4Item('vehicles',x.id).name}))];
    const wea=[{id:'',name:'Keine Spezialwaffe'},...p.inventory.weapons.map(x=>({id:x.id,name:v4Item('weapons',x.id).name}))];
    const gea=[{id:'',name:'Keine Spezialausrüstung'},...p.inventory.gear.map(x=>({id:x.id,name:v4Item('gear',x.id).name}))];
    openDialog(`<div class="dialog-wrap v4-operation"><div class="dialog-head"><div><p class="eyebrow">Operationsplanung</p><h2>${esc(spec.name)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="form-grid">
        <label><span>Ziel-Familie</span><select id="opTargetFamily">${targets.map(t=>`<option value="${t.id}" ${t.id===selectedTid?'selected':''}>${esc(t.family)}</option>`).join('')}</select></label>
        <label><span>Konkretes Ziel</span><select id="opTarget">${targetOpts.map(x=>`<option value="${x.id}" ${x.id===selectedTarget?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label>
        <label><span>Crew</span><select id="opCrew">${crews.map(c=>`<option value="${c.id}">${esc(c.name)} · ${v4CrewMembers(p,c.id==='auto'?null:c.id).length} Leute</option>`).join('')}</select></label>
        <label><span>Fahrzeug</span><select id="opVehicle">${veh.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
        <label><span>Waffe</span><select id="opWeapon">${wea.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
        <label><span>Ausrüstung</span><select id="opGear">${gea.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
        <label><span>Zeitpunkt</span><select id="opTiming"><option value="day">Tag</option><option value="evening">Abend</option><option value="night" selected>Nacht</option></select></label>
      </div>
      <div id="opPreview" class="operation-preview"></div>
      <div class="dialog-footer"><button class="btn btn-primary" id="executeOperation">Operation starten</button></div></div>`);
    const recalc=()=>{
      const tid2=$('#opTargetFamily').value;
      if(kind!=='bank'&&tid2!==selectedTid){closeDialog();return v4OpenOperationPlanner(kind,tid2,null);}
      const tp=kind==='bank'?null:state.players.find(x=>x.id===tid2);
      const target=kind==='bank'?null:(kind==='sabotage'?tp?.businesses.find(b=>b.id===$('#opTarget').value):tp?.staffRoster.find(s=>s.id===$('#opTarget').value));
      const prev=v4OpPreview(kind,p,tp,target,$('#opCrew').value==='auto'?null:$('#opCrew').value,$('#opVehicle').value,$('#opWeapon').value,$('#opGear').value,$('#opTiming').value);
      $('#opPreview').innerHTML=metricCards([['Erfolg',pct(prev.chance*100),prev.chance>.6?'positive':''],['Heat',`+${prev.heat}`,prev.heat>25?'negative':''],['Spuren',`+${prev.evidence}`,prev.evidence>20?'negative':''],['Vorbereitung',fmt(prev.cost),'negative']])+`<p class="muted">Crew-Stärke ${Math.round(prev.crew)} · Zielabwehr ${Math.round(prev.defense)}. Vorbereitung, Informanten, Fahrzeug und Ausrüstung beeinflussen den Einsatz.</p>`;
    };
    ['opTargetFamily','opTarget','opCrew','opVehicle','opWeapon','opGear','opTiming'].forEach(id=>$('#'+id)?.addEventListener('change',recalc));
    $('#executeOperation').onclick=()=>v4ExecuteOperation(kind,$('#opTargetFamily').value,$('#opTarget').value,$('#opCrew').value==='auto'?null:$('#opCrew').value,$('#opVehicle').value,$('#opWeapon').value,$('#opGear').value,$('#opTiming').value);
    recalc();
  }
  function v4ExecuteOperation(kind,tid,targetId,crewId,vehicleId,weaponId,gearId,timing){
    const p=currentPlayer(),spec=V4_OPS[kind];if(p.actionPoints<spec.ap)return toast('Nicht genug AP.');
    if(p.dirty<spec.baseCost)return toast(`Du brauchst ${fmt(spec.baseCost)} schmutziges Geld für Vorbereitung und Helfer.`);
    const tp=kind==='bank'?null:state.players.find(x=>x.id===tid);
    const target=kind==='bank'?null:(kind==='sabotage'?tp?.businesses.find(b=>b.id===targetId):tp?.staffRoster.find(s=>s.id===targetId));
    if(kind!=='bank'&&(!tp||!target))return toast('Ziel nicht mehr verfügbar.');
    const prev=v4OpPreview(kind,p,tp,target,crewId,vehicleId,weaponId,gearId,timing);
    p.dirty-=spec.baseCost;p.actionPoints-=spec.ap;p.roundActivity=(p.roundActivity||0)+4;
    const wearItem=(type,id,min,max)=>{
      if(!id)return;
      const item=(p.inventory?.[type]||[]).find(x=>x.id===id);
      if(item)item.condition=clamp((Number(item.condition)||100)-rand(min,max),15,100);
    };
    wearItem('vehicles',vehicleId,2,6);wearItem('weapons',weaponId,2,5);wearItem('gear',gearId,3,8);
    const members=v4CrewMembers(p,crewId);members.forEach(s=>{s.operations++;v4GainXp(s,8);});
    p.heat=clamp(p.heat+prev.heat*(1-shield(p)/100),0,100);
    v4AddEvidence(p,prev.evidence,`${spec.name} in Runde ${state.round}`);
    let success=chance(prev.chance);
    if(success){
      p.stats.operationsSuccess++;members.forEach(s=>{s.successes++;v4GainXp(s,12);});
      if(kind==='sabotage'){const dmg=rand(35,68)+Math.round(prev.crew/12);target.health=clamp(target.health-dmg,0,100);if(target.health<=0)tp.businesses=tp.businesses.filter(x=>x.id!==target.id);adjustRelation(p,tp,-22);p.reputation+=4;toast(target.health<=0?'Betrieb ausgeschaltet.':'Sabotage erfolgreich.');}
      if(kind==='kidnap'){target.heldUntil=state.round+rand(2,4);syncStaffCounts(tp);const ransom=Math.min(totalLiquid(tp),Math.round(STAFF[target.role].cost*(2+target.level*.35)));spend(tp,ransom,false);p.dirty+=ransom;adjustRelation(p,tp,-32);p.reputation+=4;toast(`Entführung gelungen. Lösegeld ${fmt(ransom)}.`);}
      if(kind==='hit'){tp.staffRoster=tp.staffRoster.filter(x=>x.id!==target.id);tp.crews?.forEach(c=>c.memberIds=c.memberIds.filter(id=>id!==target.id));syncStaffCounts(tp);adjustRelation(p,tp,-60);p.reputation+=7;toast('Anschlag erfolgreich.');}
      if(kind==='bank'){const take=rand(55000,145000)+Math.round(prev.crew*650);p.dirty+=take;p.reputation+=6;toast(`Banküberfall gelungen: ${fmt(take)} Beute.`);}
      if(crewId){const c=p.crews.find(x=>x.id===crewId);if(c)c.wins++;}
      log(`${p.family}: ${spec.name} erfolgreich.`);
    }else{
      p.stats.operationsFailed++;members.forEach(s=>v4GainXp(s,4));
      if(chance(.25)){const casualty=members.filter(s=>s.role==='gunman'||s.role==='bodyguard')[rand(0,Math.max(0,members.filter(s=>s.role==='gunman'||s.role==='bodyguard').length-1))];if(casualty){casualty.loyalty=clamp(casualty.loyalty-8,0,100);}}
      if(chance(.22+prev.evidence/150))p.jailed=Math.max(p.jailed,rand(1,3));
      if(crewId){const c=p.crews.find(x=>x.id===crewId);if(c)c.losses++;}
      if(tp)adjustRelation(p,tp,-18);
      toast('Operation gescheitert. Polizei und Rivalen reagieren.');
      log(`${p.family}: ${spec.name} scheitert.`);
    }
    closeDialog();syncStaffCounts(p);saveGame();renderAll();
  }

  const v4BaseInit=initPlayer;
  initPlayer=function(p){v4BaseInit(p);v4EnsurePlayer(p);};

  const v4BaseCreate=createGame;
  createGame=function(){v4BaseCreate();if(state){state.version=4;state.rulesRevision=4;state.players.forEach(v4EnsurePlayer);saveGame();renderAll();}};

  const v4BaseMigrate=migrateState;
  migrateState=function(data){data=v4BaseMigrate(data);data.version=4;data.rulesRevision=4;(data.players||[]).forEach(v4EnsurePlayer);return data;};

  const v4BaseEstimate=estimateIncome;
  estimateIncome=function(p,b){const base=v4BaseEstimate(p,b);return base*(1+Math.min(.22,v4BusinessAssignmentBonus(p,b)));};

  const v4BaseCrime=doCrime;
  doCrime=function(id){
    const p=currentPlayer(),c=CRIMES.find(x=>x.id===id),apBefore=p?.actionPoints,statsBefore=p?.stats?.crimesSuccess||0;
    if(id==='bank')return v4OpenOperationPlanner('bank');
    v4BaseCrime(id);
    if(p&&c&&p.actionPoints<apBefore){
      const success=(p.stats.crimesSuccess||0)>statsBefore;
      v4AddEvidence(p,Math.max(2,c.heat*(success?.45:.7)),`${c.name} in Runde ${state.round}`);
      saveGame();renderAll();
    }
  };

  const v4End=processEndOfTurn;
  processEndOfTurn=function(p){
    v4EnsurePlayer(p);
    p.stats.launderedTotal+=(p.lastLaundered||0);
    v4End(p);
    v4ProcessStaffProgress(p);
    v4ProcessInvestigation(p);
    saveGame();
  };

  openAttackDialog=function(){v4OpenOperationPlanner('sabotage');};
  openKidnapDialog=function(){v4OpenOperationPlanner('kidnap');};
  openAssassinationDialog=function(){v4OpenOperationPlanner('hit');};

  function v4OpenArsenal(){
    const p=currentPlayer();v4EnsurePlayer(p);
    const sections=Object.entries(V4_ITEMS).map(([type,items])=>`<h3>${type==='weapons'?'Waffen':type==='vehicles'?'Fahrzeuge':'Ausrüstung'}</h3><div class="dialog-list">${Object.entries(items).map(([id,d])=>{const own=v4Owns(p,type,id),currency=type==='weapons'?'schmutzig':'sauber';return `<div class="dialog-option"><div><strong>${esc(d.name)}</strong><p>${esc(d.desc)} · Stärke ${d.power>=0?'+':''}${d.power} · Heat ${d.heat>=0?'+':''}${d.heat} · Spuren ${d.evidence>=0?'+':''}${d.evidence}</p></div><button class="btn ${own?'btn-ghost':'btn-primary'}" data-buy-item="${type}:${id}" ${own?'disabled':''}>${own?'Besitzt':fmt(d.cost)+' '+currency}</button></div>`;}).join('')}</div>`).join('');
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Logistik & Einsatzmittel</p><h2>Arsenal & Fuhrpark</h2></div><button class="icon-btn" data-close>✕</button></div>${sections}</div>`);
    $('[data-buy-item]').forEach(btn=>btn.onclick=()=>{const [type,id]=btn.dataset.buyItem.split(':'),d=v4Item(type,id);const clean=type!=='weapons';if((clean?p.clean:p.dirty)<d.cost)return toast(`Nicht genug ${clean?'sauberes':'schmutziges'} Geld.`);if(clean)p.clean-=d.cost;else p.dirty-=d.cost;v4AddItem(p,type,id);ledger(p,`${d.name} gekauft`,-d.cost,'asset');saveGame();v4OpenArsenal();});
  }
  function v4OpenCrewManager(){
    const p=currentPlayer();v4EnsurePlayer(p);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Organisation</p><h2>Crews & Unterboss</h2></div><button class="icon-btn" data-close>✕</button></div>
      <p class="muted">Crews bündeln Personal für geplante Operationen. Ein Unterboss erhöht Loyalität und Crew-Erfahrung.</p>
      <div class="dialog-footer"><button class="btn btn-primary" data-new-crew ${p.crews.length>=4?'disabled':''}>Neue Crew gründen</button></div>
      <div class="dialog-list">${p.crews.length?p.crews.map(c=>`<div class="dialog-option"><div><strong>${esc(c.name)}</strong><p>${c.memberIds.length} Mitglieder · Bilanz ${c.wins}/${c.losses} · ${c.underbossId?'geführt':'ohne Capo'}</p></div><button class="btn btn-secondary" data-edit-crew="${c.id}">Bearbeiten</button></div>`).join(''):'<div class="empty-state">Noch keine feste Crew.</div>'}</div></div>`);
    $('[data-new-crew]')?.addEventListener('click',()=>{const c={id:uid(),name:`Crew ${p.crews.length+1}`,memberIds:[],underbossId:null,wins:0,losses:0};p.crews.push(c);saveGame();v4EditCrew(c.id);});
    $('[data-edit-crew]').forEach(b=>b.onclick=()=>v4EditCrew(b.dataset.editCrew));
  }
  function v4EditCrew(id){
    const p=currentPlayer(),c=p.crews.find(x=>x.id===id);if(!c)return;
    const candidates=activeStaff(p);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Crew-Verwaltung</p><h2>${esc(c.name)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <label class="field"><span>Name</span><input id="crewName" value="${esc(c.name)}" maxlength="22"></label>
      <h3>Mitglieder</h3><div class="check-grid">${candidates.map(s=>`<label class="check-card"><input type="checkbox" data-crew-member="${s.id}" ${c.memberIds.includes(s.id)?'checked':''}><span><strong>${esc(s.name)}</strong><small>${esc(STAFF[s.role].name)} · L${s.level} · ${s.skill}</small></span></label>`).join('')}</div>
      <label class="field"><span>Capo / Crew-Leitung</span><select id="crewBoss"><option value="">Keiner</option>${candidates.filter(s=>s.level>=2&&s.loyalty>=55).map(s=>`<option value="${s.id}" ${c.underbossId===s.id?'selected':''}>${esc(s.name)} · L${s.level}</option>`).join('')}</select></label>
      <div class="dialog-footer"><button class="btn btn-danger" data-delete-crew>Auflösen</button><button class="btn btn-primary" data-save-crew>Speichern</button></div></div>`);
    $('[data-save-crew]').onclick=()=>{c.name=$('#crewName').value.trim()||c.name;c.memberIds=$('[data-crew-member]').filter(x=>x.checked).map(x=>x.dataset.crewMember).slice(0,5);c.underbossId=$('#crewBoss').value||null;p.staffRoster.forEach(s=>{if(c.memberIds.includes(s.id))s.crewId=c.id;else if(s.crewId===c.id)s.crewId=null;});saveGame();closeDialog();renderAll();toast('Crew gespeichert.');};
    $('[data-delete-crew]').onclick=()=>{p.staffRoster.forEach(s=>{if(s.crewId===c.id)s.crewId=null;});p.crews=p.crews.filter(x=>x.id!==c.id);saveGame();v4OpenCrewManager();};
  }

  const v4BaseStaff=renderStaff;
  renderStaff=function(){
    const p=currentPlayer();v4EnsurePlayer(p);
    $('#staffGrid').innerHTML=`<article class="shop-card staff-recruit"><div class="shop-top"><div><small class="eyebrow">Organisation</small><h3>Personal & Crews</h3></div><span class="owned">${activeStaff(p).length}</span></div><p>Rekrutiere, trainiere, spezialisiere und organisiere deine Leute in festen Crews.</p><footer><div class="mini-actions"><button class="btn btn-primary" data-recruit>Rekrutieren</button><button class="btn btn-secondary" data-crews>Crews</button><button class="btn btn-secondary" data-arsenal>Arsenal</button></div></footer></article>`+
      (p.staffRoster.length?p.staffRoster.map(s=>{v4EnsurePerson(s);const held=s.heldUntil>state.round,crew=p.crews.find(c=>c.id===s.crewId),assigned=p.businesses.find(b=>b.id===s.assignedBusinessId),need=v4XpNeed(s.level);return `<article class="shop-card person-card ${held?'held':''}"><div class="shop-top"><div><small class="eyebrow">${STAFF[s.role].icon} ${esc(STAFF[s.role].name)} · Level ${s.level}</small><h3>${esc(s.name)}</h3></div><span class="owned">${held?'ENTFÜHRT':s.skill}</span></div><p>${esc(s.specialty||traitName(s.trait))} · Loyalität ${s.loyalty}/100${crew?` · ${esc(crew.name)}`:''}${assigned?` · ${esc(BUSINESSES[assigned.type].name)}`:''}</p><div class="loyalty"><i style="width:${s.loyalty}%"></i></div><div class="xpbar"><i style="width:${Math.min(100,s.xp/need*100)}%"></i></div><footer><span class="price">${fmt(s.salary)}/R · XP ${s.xp}/${need}</span><button class="btn btn-secondary" data-staff-person="${s.id}">Details</button></footer></article>`;}).join(''):'');
    $('[data-recruit]')?.addEventListener('click',openRecruitDialog);$('[data-crews]')?.addEventListener('click',v4OpenCrewManager);$('[data-arsenal]')?.addEventListener('click',v4OpenArsenal);$('[data-staff-person]').forEach(b=>b.onclick=()=>openStaffPerson(b.dataset.staffPerson));
  };

  openStaffPerson=function(id){
    const p=currentPlayer(),s=p.staffRoster.find(x=>x.id===id);if(!s)return;v4EnsurePerson(s);
    const bonusCost=5000,trainCost=Math.round(2500+s.level*1250);
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">${esc(STAFF[s.role].name)} · Level ${s.level}</p><h2>${esc(s.name)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="finance-grid">${metricCards([['Fähigkeit',`${s.skill}/100`,''],['Loyalität',`${s.loyalty}/100`,s.loyalty>60?'positive':''],['Erfahrung',`${s.xp}/${v4XpNeed(s.level)}`,''],['Einsätze',s.operations,''],['Erfolge',s.successes,'']])}</div>
      <div class="form-grid"><label><span>Spezialisierung</span><select id="staffSpec"><option value="">Keine</option>${V4_SPECIALTIES[s.role].map(x=>`<option value="${x}" ${s.specialty===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
      <label><span>Betrieb zuweisen</span><select id="staffBusiness"><option value="">Keine feste Zuweisung</option>${p.businesses.map(b=>`<option value="${b.id}" ${s.assignedBusinessId===b.id?'selected':''}>${esc(BUSINESSES[b.type].name)} · ${esc(DISTRICTS.find(d=>d.id===b.district).name)}</option>`).join('')}</select></label></div>
      <div class="dialog-footer"><button class="btn btn-secondary" data-train ${p.actionPoints<1||p.clean<trainCost?'disabled':''}>Training ${fmt(trainCost)}</button><button class="btn btn-secondary" data-bonus ${totalLiquid(p)<bonusCost?'disabled':''}>Bonus ${fmt(bonusCost)}</button><button class="btn btn-primary" data-underboss ${s.level<3||s.loyalty<70?'disabled':''}>${p.underbossId===s.id?'Unterboss':'Zum Unterboss'}</button><button class="btn btn-danger" data-fire>Entlassen</button></div></div>`);
    $('#staffSpec').onchange=()=>{s.specialty=$('#staffSpec').value;saveGame();};
    $('#staffBusiness').onchange=()=>{s.assignedBusinessId=$('#staffBusiness').value||null;saveGame();};
    $('[data-train]').onclick=()=>{if(p.actionPoints<1||p.clean<trainCost)return;p.clean-=trainCost;p.actionPoints--;p.stats.training++;v4GainXp(s,35+rand(0,15));s.skill=clamp(s.skill+rand(1,3),1,100);s.loyalty=clamp(s.loyalty+3,0,100);ledger(p,`Training ${s.name}`,-trainCost,'expense');closeDialog();saveGame();renderAll();toast('Training abgeschlossen.');};
    $('[data-bonus]').onclick=()=>{spend(p,bonusCost);s.loyalty=clamp(s.loyalty+rand(10,18),0,100);ledger(p,`Bonus für ${s.name}`,-bonusCost,'expense');closeDialog();saveGame();renderAll();toast('Loyalität gestiegen.');};
    $('[data-underboss]').onclick=()=>{p.underbossId=p.underbossId===s.id?null:s.id;s.loyalty=clamp(s.loyalty+5,0,100);saveGame();closeDialog();renderAll();toast(p.underbossId?'Unterboss ernannt.':'Unterboss abgesetzt.');};
    $('[data-fire]').onclick=()=>{p.staffRoster=p.staffRoster.filter(x=>x.id!==id);p.crews.forEach(c=>c.memberIds=c.memberIds.filter(x=>x!==id));if(p.underbossId===id)p.underbossId=null;syncStaffCounts(p);closeDialog();saveGame();renderAll();toast('Mitarbeiter entlassen.');};
  };

  const v4BaseActions=renderActions;
  renderActions=function(){
    v4BaseActions();
    const p=currentPlayer();if(!p||p.jailed)return;
    const bank=$('[data-crime="bank"]');if(bank){bank.textContent='Planen';bank.onclick=()=>v4OpenOperationPlanner('bank');}
    const panel=$('#actionsView .action-panel .button-grid');
    if(panel&&!panel.querySelector('[data-v4-arsenal]')){
      panel.insertAdjacentHTML('beforeend','<button class="btn btn-secondary" data-v4-arsenal>Arsenal & Fuhrpark</button><button class="btn btn-secondary" data-v4-crews>Crews</button><button class="btn btn-secondary" data-v4-case>Ermittlungsakte</button>');
      $('[data-v4-arsenal]',panel).onclick=v4OpenArsenal;$('[data-v4-crews]',panel).onclick=v4OpenCrewManager;$('[data-v4-case]',panel).onclick=v4OpenInvestigation;
    }
  };

  function v4OpenInvestigation(){
    const p=currentPlayer();v4EnsurePlayer(p);const i=p.investigation;
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Polizei & Staatsanwaltschaft</p><h2>Ermittlungsakte</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="finance-grid">${metricCards([['Beweise',`${Math.round(i.evidence)}/100`,i.evidence>=70?'negative':''],['Status',i.stage,''],['Haftbefehl',i.warrant?'JA':'Nein',i.warrant?'negative':'positive'],['Korruptionsrisiko',`${Math.round(i.corruptionExposure)}%`,i.corruptionExposure>50?'negative':'']])}</div>
      <div class="panel" style="padding:1rem"><strong>Letzter Ermittlungsansatz</strong><p class="muted">${esc(i.lastCase||'Keine belastbaren Spuren.')}</p></div>
      <p class="muted">Informanten mit Gegenaufklärung, Anwälte und korrupte Kontakte bauen Beweise langsam ab. Lautstarke Operationen, schlechte Ausrüstung und hohe Heat erzeugen neue Spuren.</p>
      <div class="dialog-footer"><button class="btn btn-secondary" data-clean-evidence ${p.actionPoints<1||p.dirty<8000?'disabled':''}>Spuren beseitigen ${fmt(8000)}</button></div></div>`);
    $('[data-clean-evidence]')?.addEventListener('click',()=>{p.dirty-=8000;p.actionPoints--;p.stats.evidenceDestroyed++;const cut=rand(8,18)+Math.round(roleSkill(p,'informant')/20);p.investigation.evidence=clamp(p.investigation.evidence-cut,0,100);p.investigation.stage=v4InvestigationStage(p);p.investigation.warrant=p.investigation.evidence>=70;ledger(p,'Spuren beseitigt',-8000,'expense');closeDialog();saveGame();renderAll();toast(`Beweislage um ${cut} reduziert.`);});
  }

  const v4BaseMore=openMoreMenu;
  openMoreMenu=function(){
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Navigation</p><h2>Mehr</h2></div><button class="icon-btn" data-close>✕</button></div><div class="more-grid">
      <button class="btn btn-secondary" data-go="staff">♟ Personal</button><button class="btn btn-secondary" data-go="corruption">⚖ Einfluss</button><button class="btn btn-secondary" data-go="finance">▥ Finanzen</button><button class="btn btn-secondary" data-go="missions">◎ Aufträge</button><button class="btn btn-secondary" data-go="ranking">♛ Rangliste</button>
      <button class="btn btn-secondary" data-more-diplomacy>🤝 Diplomatie</button><button class="btn btn-secondary" data-more-routes>♣ Automatenrouten</button><button class="btn btn-secondary" data-v4-crew>♟ Crews</button><button class="btn btn-secondary" data-v4-arsenal>▣ Arsenal</button><button class="btn btn-secondary" data-v4-case>⌕ Ermittlungen</button><button class="btn btn-secondary" data-chronicle>▤ Stadtchronik</button>
      </div></div>`);
    $('[data-go]').forEach(b=>b.onclick=()=>{closeDialog();setView(b.dataset.go);});$('[data-more-diplomacy]').onclick=()=>{closeDialog();openDiplomacyDialog();};$('[data-more-routes]').onclick=()=>{closeDialog();openRoutesDialog();};$('[data-v4-crew]').onclick=v4OpenCrewManager;$('[data-v4-arsenal]').onclick=v4OpenArsenal;$('[data-v4-case]').onclick=v4OpenInvestigation;$('[data-chronicle]').onclick=()=>{closeDialog();if(typeof openChronicleDialog==='function')openChronicleDialog();};
  };

  const v4BaseRenderAll=renderAll;
  renderAll=function(){
    if(state)state.players.forEach(v4EnsurePlayer);
    v4BaseRenderAll();
    const p=currentPlayer();if(!p)return;
    const banner=$('#statusBanner');
    if(p.investigation.warrant&&!p.jailed){banner.className='status-banner danger';banner.textContent=`HAFTBEFEHL: Beweislage ${Math.round(p.investigation.evidence)}/100. Anwälte, Gegenaufklärung oder Spurenbeseitigung sind dringend nötig.`;}
  };

  window.SyndikatV4={openArsenal:v4OpenArsenal,openCrews:v4OpenCrewManager,openInvestigation:v4OpenInvestigation,openOperation:v4OpenOperationPlanner,items:V4_ITEMS};
})();
/* SYNDIKAT_V4_SYSTEMS_END */
