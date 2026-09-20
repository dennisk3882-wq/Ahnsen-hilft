/* SYNDIKAT_V51_VISUAL_STORY_BEGIN */
(function SYNDIKAT_V51_VISUAL_STORY(){
  const ASSETS={
    city:'./assets/city-map.webp',
    vittorio:'./assets/portrait-vittorio.webp',
    marco:'./assets/portrait-marco.webp',
    sofia:'./assets/portrait-sofia.webp',
    keller:'./assets/portrait-keller.webp',
    raid:'./assets/event-raid.webp',
    court:'./assets/event-court.webp',
    prison:'./assets/event-prison-break.webp',
    fallback:'./assets/start-user.webp'
  };

  const DISTRICT_VISUALS={
    harbor:{name:'Hafen',desc:'Docks, Lagerhallen und Schmuggelrouten. Viel Ware, wenig Fragen.',tag:[18,28],shape:'0,110 405,95 520,280 455,435 0,475'},
    industrial:{name:'Industrie',desc:'Fabriken, Werkhöfe und billige Flächen – ideal für Lager und diskrete Logistik.',tag:[45,19],shape:'395,35 915,30 1055,285 855,360 505,300'},
    redlight:{name:'Rotlicht',desc:'Neon, Clubs und diskrete Hinterzimmer. Hoher Umsatz, hohe Aufmerksamkeit.',tag:[67,24],shape:'915,70 1285,65 1405,305 1185,420 1000,325'},
    west:{name:'Nobelviertel',desc:'Villen, teure Hotels und vermögende Kundschaft. Prestige hat seinen Preis.',tag:[86,35],shape:'1305,90 1672,90 1672,515 1330,505 1160,390'},
    oldtown:{name:'Altstadt',desc:'Alte Bars, enge Gassen und loyale Stammkundschaft. Der klassische Einstieg.',tag:[15,67],shape:'0,455 500,390 665,645 465,815 0,805'},
    center:{name:'Zentrum',desc:'Banken, Hotels und Verwaltung. Wer hier Einfluss hat, wird in der ganzen Stadt gesehen.',tag:[54,54],shape:'510,310 1070,275 1245,560 1015,660 655,635'},
    station:{name:'Marktviertel',desc:'Bahnhof, Märkte und ständige Bewegung. Schnelles Geld wechselt hier schnell den Besitzer.',tag:[43,79],shape:'420,630 965,595 1115,900 520,941 345,790'},
    south:{name:'Vorstadt',desc:'Dichte Wohnstraßen, kleine Läden und viele mögliche Standorte für ein wachsendes Netz.',tag:[81,80],shape:'1060,535 1672,470 1672,941 1100,941 1015,675'}
  };

  for(const d of DISTRICTS){
    const v=DISTRICT_VISUALS[d.id];
    if(v){d.name=v.name;d.desc=v.desc;}
  }

  const STORY_V51=[
    {
      chapter:1,kicker:'Prolog',title:'Die erste Nacht',speaker:'Don Vittorio Leone',portrait:ASSETS.vittorio,image:ASSETS.city,
      desc:'Setze deinen ersten Fuß in die Stadt und eröffne einen Betrieb.',
      narrative:[
        'Regen liegt wie Öl auf dem Asphalt. In einem Hinterzimmer über einer geschlossenen Bar wartet Don Vittorio. Vor ihm: ein Stadtplan, ein Glas Whiskey und genau eine freie Ecke für deinen Namen.',
        '„Eine Stadt wird nicht mit Kugeln genommen“, sagt er. „Sie wird mit Rechnungen, Gefälligkeiten und Geduld gekauft. Fang klein an – aber fang an.“'
      ],
      done:p=>p.businesses.length>=1,reward:12000,rep:2
    },
    {
      chapter:2,kicker:'Kapitel II',title:'Geld auf der Straße',speaker:'Don Vittorio Leone',portrait:ASSETS.vittorio,image:ASSETS.fallback,
      desc:'Besitze zwei Betriebe und schließe zwei Straßenverbrechen erfolgreich ab.',
      narrative:[
        'Dein erster Laden bezahlt die Rechnungen, aber noch kennt niemand deinen Namen. Vittorio schickt dich dorthin, wo Ruf nicht gedruckt, sondern geflüstert wird: auf die Straße.',
        'Zwei erfolgreiche Coups reichen, damit Wirte die Tür offenhalten und kleine Händler anfangen, deinen Blick zu erwidern statt wegzusehen.'
      ],
      done:p=>p.businesses.length>=2&&(p.stats?.crimesSuccess||0)>=2,reward:18000,rep:3
    },
    {
      chapter:3,kicker:'Kapitel III',title:'Marco Bellini',speaker:'Marco Bellini',portrait:ASSETS.marco,image:ASSETS.marco,
      desc:'Baue ein Team aus mindestens drei Personen auf.',
      narrative:[
        'Marco Bellini wartet unter dem Vordach eines geschlossenen Kinos. Mantelkragen hoch, Blick ruhig. Er redet wenig – und genau deshalb hört man ihm zu.',
        '„Geschäfte brennen. Geld verschwindet. Menschen bleiben.“ Marco bietet an, deine Leute zu ordnen, solange du beweist, dass aus deiner Bande eine Familie werden kann.'
      ],
      done:p=>activeStaff(p).length>=3,reward:24000,rep:4,
      onClaim:p=>{
        if(!(p.staffRoster||[]).some(s=>s.name==='Marco Bellini')){
          const m=createStaffPerson('bodyguard');
          m.name='Marco Bellini';m.skill=Math.max(78,m.skill);m.loyalty=Math.max(88,m.loyalty);m.level=2;m.xp=35;
          p.staffRoster.push(m);syncStaffCounts(p);
          log(`${p.family}: Marco Bellini schließt sich der Organisation an.`);
        }
      }
    },
    {
      chapter:4,kicker:'Kapitel IV',title:'Morettis Angebot',speaker:'Sofia Moretti',portrait:ASSETS.sofia,image:ASSETS.sofia,
      desc:'Kundschafte zwei Viertel aus und erreiche mindestens 8 Ruf.',
      narrative:[
        'Sofia Moretti bestellt dich in einen Club, der offiziell geschlossen hat. Kein Leibwächter sitzt mit am Tisch. Das ist entweder Respekt – oder eine Drohung.',
        '„Wir müssen keine Freunde sein“, sagt sie. „Aber zwei Familien, die wissen, wo die Grenzen liegen, leben länger als zwei Familien, die jede Nacht neue ziehen.“'
      ],
      done:p=>Object.keys(p.scouting||{}).length>=2&&(p.reputation||0)>=8,reward:28000,rep:4,
      choices:[
        {id:'hand',label:'Die Hand reichen',text:'Beziehung zu Moretti deutlich verbessern und vier Runden Nichtangriff anstreben.',apply:p=>{
          const m=state.players.find(x=>x.id!==p.id&&String(x.family).toLowerCase().includes('moretti'));
          if(m){adjustRelation(p,m,22);p.pacts[m.id]=Math.max(p.pacts[m.id]||0,state.round+4);m.pacts[p.id]=Math.max(m.pacts[p.id]||0,state.round+4);}
          p.story.flags.moretti='pact';
        }},
        {id:'cold',label:'Distanz halten',text:'Kein Pakt. Dafür 10.000 $ zusätzliches schmutziges Kapital und etwas mehr Ruf.',apply:p=>{
          const m=state.players.find(x=>x.id!==p.id&&String(x.family).toLowerCase().includes('moretti'));
          if(m)adjustRelation(p,m,-10);
          p.dirty+=10000;p.reputation=clamp(p.reputation+2,0,100);p.story.flags.moretti='cold';
        }}
      ]
    },
    {
      chapter:5,kicker:'Kapitel V',title:'Kellers Akte',speaker:'Kommissar Ernst Keller',portrait:ASSETS.keller,image:ASSETS.raid,
      desc:'Halte Heat bei höchstens 45 und die Beweislage bei höchstens 40. Beschäftige außerdem einen Anwalt oder unterhalte einen Kontakt zu einem Polizisten oder Inspektor.',
      narrative:[
        'Kommissar Ernst Keller klebt Fotos an eine Wand, zieht rote Linien zwischen Namen und Konten und lässt deinen Familiennamen genau in der Mitte stehen.',
        'Du kannst die Akte nicht verschwinden lassen. Aber du kannst dafür sorgen, dass aus Vermutungen keine Anklage wird. Dafür brauchst du Disziplin – oder Kontakte.'
      ],
      done:p=>(p.heat||0)<=45&&(p.investigation?.evidence||0)<=40&&(p.staff?.lawyer>=1||p.bribes?.inspector||p.bribes?.officer),
      reward:32000,rep:5,
      choices:[
        {id:'legal',label:'Anwälte arbeiten lassen',text:'Beweislage um weitere 8 Punkte senken.',apply:p=>{if(p.investigation)p.investigation.evidence=clamp((p.investigation.evidence||0)-8,0,100);p.story.flags.keller='legal';}},
        {id:'quiet',label:'Kontakte warnen lassen',text:'Heat um weitere 8 senken, aber die Korruptionsakte wächst leicht.',apply:p=>{p.heat=clamp(p.heat-8,0,100);if(p.investigation)p.investigation.corruptionExposure=clamp((p.investigation.corruptionExposure||0)+4,0,100);p.story.flags.keller='contacts';}}
      ]
    },
    {
      chapter:6,kicker:'Kapitel VI',title:'Saubere Fassade',speaker:'Don Vittorio Leone',portrait:ASSETS.vittorio,image:ASSETS.fallback,
      desc:'Wasche insgesamt 50.000 $, besitze einen Betrieb ab Tier 2 und halte 100.000 $ sauberes Kapital.',
      narrative:[
        'Schmutziges Geld macht Eindruck auf der Straße. Sauberes Geld kauft Gebäude, Anwälte und Zeit. Vittorio verlangt eine Fassade, die selbst unter Tageslicht bestehen kann.',
        'Ein Betrieb mit echten Rechnungen, echtes Kapital auf dem Konto und genügend gewaschenes Geld: Erst dann beginnt dein Imperium, wie ein Unternehmen auszusehen.'
      ],
      done:p=>(p.stats?.launderedTotal||0)>=50000&&p.businesses.some(b=>(BUSINESSES[b.type].tier||1)>=2)&&p.clean>=100000,reward:55000,rep:6
    },
    {
      chapter:7,kicker:'Kapitel VII',title:'Eigener Boden',speaker:'Marco Bellini',portrait:ASSETS.marco,image:ASSETS.city,
      desc:'Kaufe mindestens eine Immobilie und betreibe darin einen eigenen Betrieb.',
      narrative:[
        'Miete ist eine Abhängigkeit. Marco legt dir drei Grundbücher auf den Tisch und tippt auf die Eigentümerzeile.',
        '„Wenn der Boden dir gehört, entscheidet kein Vermieter, wann du gehst.“ Dein nächster Schritt ist nicht größerer Umsatz – sondern Besitz, der bleibt.'
      ],
      done:p=>(p.propertyIds||[]).length>=1&&p.businesses.some(b=>!!b.propertyId),reward:70000,rep:6
    },
    {
      chapter:8,kicker:'Kapitel VIII',title:'Krieg um die Stadt',speaker:'Marco Bellini',portrait:ASSETS.marco,image:ASSETS.raid,
      desc:'Kontrolliere ein Viertel und gewinne mindestens eine geplante Operation.',
      narrative:[
        'Ein Viertel kippt nicht in einer Nacht. Erst wechseln Lieferanten die Seite, dann Türsteher, dann Wirte. Am Ende hängt dein Name an Entscheidungen, die niemand öffentlich getroffen hat.',
        'Der letzte Widerstand kommt von einer rivalisierenden Crew. Marco markiert drei Ziele. Diesmal reicht Geld nicht – du musst zeigen, dass deine Organisation handeln kann.'
      ],
      done:p=>controlledDistricts(p)>=1&&(p.stats?.operationsSuccess||0)>=1,reward:90000,rep:8
    },
    {
      chapter:9,kicker:'Kapitel IX',title:'Vor Gericht',speaker:'Kommissar Ernst Keller',portrait:ASSETS.keller,image:ASSETS.court,
      desc:'Überstehe ein Gerichtsverfahren – oder halte die Beweise bis Runde 25 so niedrig, dass Keller keine belastbare Anklage bekommt.',
      narrative:[
        'Marmor, Aktenordner, Blitzlicht. Zum ersten Mal wird nicht im Hinterzimmer über deinen Namen gesprochen, sondern vor einem Richter.',
        'Keller sitzt zwei Reihen hinter dem Staatsanwalt. Er lächelt nicht. Egal wie das Verfahren endet: Von heute an weiß die ganze Stadt, dass du groß genug bist, um angeklagt zu werden.'
      ],
      done:p=>(p.courtHistory?.length||0)>=1||(state.round>=25&&(p.investigation?.evidence||0)<20),reward:110000,rep:8,
      choices:[
        {id:'defiant',label:'Stärke demonstrieren',text:'Mehr Ruf, aber leicht mehr Heat.',apply:p=>{p.reputation=clamp(p.reputation+4,0,100);p.heat=clamp(p.heat+3,0,100);p.story.flags.court='defiant';}},
        {id:'silent',label:'Schweigen und weiterarbeiten',text:'Die Beweislage sinkt leicht, dafür kein zusätzlicher Ruf.',apply:p=>{if(p.investigation)p.investigation.evidence=clamp((p.investigation.evidence||0)-5,0,100);p.story.flags.court='silent';}}
      ]
    },
    {
      chapter:10,kicker:'Kapitel X',title:'Drei Familien am Tisch',speaker:'Sofia Moretti',portrait:ASSETS.sofia,image:ASSETS.sofia,
      desc:'Erreiche mindestens 20 Ruf und halte einen aktiven Pakt oder ein Bündnis mit einer anderen Familie. Gibt es keine andere aktive Familie mehr, genügt die Kontrolle über zwei Viertel.',
      narrative:[
        'Im Obergeschoss eines Restaurants stehen drei Teller auf dem Tisch und vier bewaffnete Männer vor der Tür. Sofia hat die Sitzordnung festgelegt. Niemand sitzt mit dem Rücken zum Fenster.',
        'Jetzt geht es nicht mehr darum, ob du zur Stadt gehörst. Es geht darum, ob die anderen Familien akzeptieren, dass wichtige Entscheidungen ohne dich nicht mehr möglich sind.'
      ],
      done:p=>{const rivals=state.players.filter(x=>x.id!==p.id&&!x.eliminated);return (p.reputation||0)>=20&&(rivals.length?rivals.some(x=>pactActive(p,x)||allianceActive(p,x)):controlledDistricts(p)>=2);},reward:140000,rep:9
    },
    {
      chapter:11,kicker:'Kapitel XI',title:'Die Stadt gehört uns',speaker:'Don Vittorio Leone',portrait:ASSETS.vittorio,image:ASSETS.city,
      desc:'Kontrolliere zwei Viertel und erreiche mindestens 45 Macht.',
      narrative:[
        'Auf der Karte sind neutrale Flächen selten geworden. Lieferwege, Immobilien, Schutzgeld, Politik – alles greift ineinander.',
        'Vittorio schiebt dir den Stadtplan hin. „Früher hast du gefragt, wo du Geschäfte machen darfst. Jetzt fragen andere dich.“'
      ],
      done:p=>controlledDistricts(p)>=2&&powerIndex(p)>=45,reward:175000,rep:10
    },
    {
      chapter:12,kicker:'Finale',title:'Das Syndikat',speaker:'Don Vittorio Leone',portrait:ASSETS.vittorio,image:ASSETS.fallback,
      desc:'Erreiche 5 Mio. Nettovermögen, kontrolliere drei Viertel, mindestens 62 Macht und überstehe die Endgame-Krise.',
      narrative:[
        'Die Stadt ist dieselbe geblieben: dieselben Straßen, derselbe Regen, dieselben Sirenen. Nur die Gespräche haben sich verändert. Dein Name fällt jetzt, bevor Entscheidungen getroffen werden.',
        'Vittorio hebt sein Glas. „Ein Boss besitzt Geschäfte. Ein Syndikat besitzt Möglichkeiten.“ Draußen geht das Licht in der Stadt an – Viertel für Viertel.'
      ],
      done:p=>netWorth(p)>=5000000&&controlledDistricts(p)>=3&&powerIndex(p)>=62&&p.finalCrisis?.resolved,reward:300000,rep:15
    }
  ];

  function ensureStoryV51(p){
    p.story=p.story||{chapter:1,claimed:[]};
    p.story.claimed=Array.isArray(p.story.claimed)?p.story.claimed:[];
    p.story.flags=p.story.flags||{};
    p.story.archive=Array.isArray(p.story.archive)?p.story.archive:[];
    if(p.story.version!==51){
      const old=Math.max(1,Number(p.story.chapter)||1);
      p.story.chapter=old>=6?6:Math.min(old,5);
      p.story.version=51;
    }
  }
  function currentStory(p){ensureStoryV51(p);return STORY_V51.find(x=>x.chapter===p.story.chapter)||null;}
  function storyDone(ch,p){try{return !!ch.done(p)}catch{return false}}
  function storyChoiceApply(p,ch,choiceId){
    const c=(ch.choices||[]).find(x=>x.id===choiceId);
    if(c?.apply)c.apply(p);
    return c;
  }
  function finalizeStory(p,ch,choiceId=null){
    if(!storyDone(ch,p))return toast('Kapitelziel noch nicht erfüllt.');
    if(p.story.claimed.includes(ch.chapter))return;
    if(ch.choices?.length&&!choiceId)return;
    const selected=choiceId?(ch.choices||[]).find(c=>c.id===choiceId):null;
    if(choiceId&&!selected)return;
    const cost=typeof selected?.cost==='function'?selected.cost(p):(selected?.cost||0);
    if(cost>p.clean+p.dirty)return toast(`Diese Entscheidung kostet ${fmt(cost)} verfügbares Kapital.`);
    if(cost>0)spend(p,cost,false);
    const choice=choiceId?storyChoiceApply(p,ch,choiceId):null;
    if(ch.onClaim)ch.onClaim(p);
    p.story.claimed.push(ch.chapter);
    p.story.archive.unshift({chapter:ch.chapter,title:ch.title,speaker:ch.speaker,choice:choice?.label||null,round:state.round});
    p.clean+=ch.reward;p.reputation=clamp((p.reputation||0)+ch.rep,0,100);
    ledger(p,`Story: ${ch.title}`,ch.reward,'income');
    log(`${p.family}: Storykapitel „${ch.title}“ abgeschlossen.`);
    p.story.chapter=Math.min(STORY_V51.length+1,ch.chapter+1);
    closeDialog();saveGame();renderAll();toast(`${ch.title}: +${fmt(ch.reward)} · +${ch.rep} Ruf`);
  }
  function openStoryScene(ch){
    const p=currentPlayer();ensureStoryV51(p);
    const narrative=ch.narrative.map(t=>`<p>${esc(t)}</p>`).join('');
    const choices=ch.choices?.length
      ? `<div class="story-choice-list">${ch.choices.map(c=>`<button class="story-choice" data-story-choice="${c.id}"><strong>${esc(c.label)}</strong><span>${esc(c.text)}</span></button>`).join('')}</div>`
      : `<div class="dialog-footer"><button class="btn btn-primary" data-story-finish>Kapitel abschließen · ${fmt(ch.reward)}</button></div>`;
    openDialog(`<div class="dialog-wrap story-scene"><div class="dialog-head"><div><p class="eyebrow">${esc(ch.kicker)}</p><h2>${esc(ch.title)}</h2></div><button class="icon-btn" data-close>✕</button></div>
      <div class="story-scene-hero"><img src="${ch.image}" alt="" loading="eager"><div class="story-scene-shade"></div><div class="story-speaker"><img src="${ch.portrait}" alt=""><div><small>${esc(ch.speaker)}</small><strong>${esc(ch.title)}</strong></div></div></div>
      <div class="story-prose">${narrative}</div>
      ${ch.choices?.length?'<p class="muted">Diese Entscheidung wird in deiner Storychronik gespeichert.</p>':''}${choices}</div>`);
    $('[data-story-finish]')?.addEventListener('click',()=>finalizeStory(p,ch));
    $$('[data-story-choice]').forEach(b=>b.onclick=()=>finalizeStory(p,ch,b.dataset.storyChoice));
  }
  function openStoryArchive(){
    const p=currentPlayer();ensureStoryV51(p);
    const rows=p.story.archive.length?p.story.archive.map(a=>{
      const ch=STORY_V51.find(x=>x.chapter===a.chapter);
      return `<div class="dialog-option story-archive-row"><img src="${ch?.portrait||ASSETS.vittorio}" alt=""><div><strong>${esc(ch?.kicker||'Kapitel')} · ${esc(a.title)}</strong><p>Runde ${a.round}${a.choice?` · Entscheidung: ${esc(a.choice)}`:''}</p></div></div>`;
    }).join(''):'<div class="empty-state">Noch kein Storykapitel abgeschlossen.</div>';
    openDialog(`<div class="dialog-wrap"><div class="dialog-head"><div><p class="eyebrow">Chronik</p><h2>Deine Geschichte</h2></div><button class="icon-btn" data-close>✕</button></div><div class="dialog-list">${rows}</div></div>`);
  }

  const previousRenderMissions=renderMissions;
  renderMissions=function(){
    previousRenderMissions();
    const p=currentPlayer();ensureStoryV51(p);const el=$('#missionList');if(!el)return;
    el.querySelectorAll('.story-card').forEach(x=>x.remove());
    const ch=currentStory(p);
    if(!ch){
      el.insertAdjacentHTML('afterbegin',`<article class="mission-card panel story-v51-card story-complete"><img class="story-card-image" src="${ASSETS.city}" alt=""><div class="story-card-copy"><p class="eyebrow">Storykampagne · ${STORY_V51.length}/${STORY_V51.length}</p><h3>Die Stadt kennt deinen Namen</h3><p>Alle ${STORY_V51.length} Kapitel sind abgeschlossen. Deine Entscheidungen bleiben in der Chronik erhalten.</p><footer><button class="btn btn-secondary" data-story-archive>Kapitelarchiv</button></footer></div></article>`);
      $('[data-story-archive]',el)?.addEventListener('click',openStoryArchive);return;
    }
    const done=storyDone(ch,p);
    el.insertAdjacentHTML('afterbegin',`<article class="mission-card panel story-v51-card"><img class="story-card-image" src="${ch.image}" alt=""><div class="story-card-copy"><div class="story-character-mini"><img src="${ch.portrait}" alt=""><span><small>${esc(ch.speaker)}</small><strong>${esc(ch.kicker)} · ${ch.chapter}/${STORY_V51.length}</strong></span></div><h3>${esc(ch.title)}</h3><p>${esc(ch.desc)}</p><div class="mission-progress"><div class="progress"><i style="width:${done?100:12}%"></i></div><small>${done?'Kapitelziel erfüllt – Szene verfügbar':'Kapitelziel noch offen'}</small></div><footer><span>${fmt(ch.reward)} + ${ch.rep} Ruf</span><div class="mini-actions"><button class="btn btn-secondary" data-story-archive>Chronik</button><button class="btn ${done?'btn-primary':'btn-secondary'}" data-story-scene ${done?'':'disabled'}>${done?'Szene spielen':'Ziel offen'}</button></div></footer></div></article>`);
    $('[data-story-scene]',el)?.addEventListener('click',()=>openStoryScene(ch));
    $('[data-story-archive]',el)?.addEventListener('click',openStoryArchive);
  };

  function staffPortrait(s){
    const n=String(s?.name||'').toLowerCase();
    if(n.includes('marco bellini'))return ASSETS.marco;
    if(n.includes('sofia')||n.includes('moretti'))return ASSETS.sofia;
    return null;
  }
  function initials(name){return String(name||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
  const previousRenderStaff=renderStaff;
  renderStaff=function(){
    previousRenderStaff();const p=currentPlayer();
    $$('#staffGrid [data-staff-person]').forEach(btn=>{
      const s=p.staffRoster.find(x=>x.id===btn.dataset.staffPerson),card=btn.closest('.person-card');if(!s||!card)return;
      const top=card.querySelector('.shop-top');if(!top||top.querySelector('.person-portrait,.person-initial-avatar'))return;
      const img=staffPortrait(s);
      top.insertAdjacentHTML('afterbegin',img?`<img class="person-portrait" src="${img}" alt="">`:`<div class="person-initial-avatar">${esc(initials(s.name))}</div>`);
      card.classList.add('visual-person-card');
    });
  };
  const previousOpenStaffPerson=openStaffPerson;
  openStaffPerson=function(id){
    const p=currentPlayer(),s=p.staffRoster.find(x=>x.id===id);previousOpenStaffPerson(id);if(!s)return;
    const root=$('#dialogContent .dialog-wrap'),img=staffPortrait(s);if(!root)return;
    const head=root.querySelector('.dialog-head');
    if(head)head.insertAdjacentHTML('afterend',img?`<img class="dialog-person-hero" src="${img}" alt="">`:`<div class="dialog-person-initial">${esc(initials(s.name))}</div>`);
  };

  const previousRenderCorruption=renderCorruption;
  renderCorruption=function(){
    previousRenderCorruption();
    const btn=$('#corruptionGrid [data-bribe="inspector"]'),card=btn?.closest('.shop-card');
    if(card&&!card.querySelector('.contact-portrait')){
      card.insertAdjacentHTML('afterbegin',`<img class="contact-portrait" src="${ASSETS.keller}" alt="">`);
    }
  };

  const HOTSPOTS=Object.fromEntries(Object.entries(DISTRICT_VISUALS).map(([id,v])=>[id,v.shape]));
  function eventVisual(){
    const p=currentPlayer(),ev=state?.cityEvent;
    let img=null,title=null,text=null;
    if(ev){
      img=ev.id==='crackdown'||ev.id==='gangwar'?ASSETS.raid:ev.id==='fair'?ASSETS.city:ASSETS.fallback;
      title=ev.name;text=ev.desc;
    }else if(String(p?.eventText||'').toLowerCase().includes('razzia')){
      img=ASSETS.raid;title='Polizeieinsatz';text=p.eventText;
    }
    if(!img)return '';
    return `<div class="event-feature"><img src="${img}" alt=""><div><small>Aktuelle Lage</small><strong>${esc(title)}</strong><span>${esc(text||'')}</span></div></div>`;
  }

  const previousRenderCity=renderCity;
  renderCity=function(){
    previousRenderCity();
    const p=currentPlayer(),grid=$('#districtGrid');if(!grid)return;
    grid.classList.add('city-art-stage');
    grid.innerHTML=`<div class="city-map-scroll"><div class="city-art-map"><img src="${ASSETS.city}" alt="Nächtliche Stadtkarte von Syndikat">
      <svg class="city-hotspots" viewBox="0 0 1672 941" aria-label="Anklickbare Stadtviertel">${DISTRICTS.map(d=>`<polygon tabindex="0" role="button" aria-label="${esc(d.name)}" class="city-hotspot ${selectedDistrict===d.id?'selected':''}" data-map-district="${d.id}" points="${HOTSPOTS[d.id]}" style="--district-accent:${d.accent}"></polygon>`).join('')}</svg>
      ${DISTRICTS.map(d=>{const v=DISTRICT_VISUALS[d.id],share=Math.round(districtShare(p,d.id)),owner=districtOwner(d.id);return `<button class="city-map-tag ${selectedDistrict===d.id?'selected':''}" data-map-district="${d.id}" style="left:${v.tag[0]}%;top:${v.tag[1]}%;--district-accent:${d.accent}"><strong>${esc(d.name)}</strong><span>${share}% · ${esc(owner.player?owner.player.family:'Neutral')}</span></button>`;}).join('')}
    </div></div><p class="city-map-hint">Karte seitlich verschieben · Viertel antippen</p>`;
    $$('[data-map-district]',grid).forEach(el=>{
      const open=()=>{selectedDistrict=el.dataset.mapDistrict;renderCity();};
      el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
    });
    const list=$('#situationList'),visual=eventVisual();if(list&&visual)list.insertAdjacentHTML('afterbegin',visual);
  };

  const previousCreate=createGame;
  createGame=function(){previousCreate();if(state){state.players.forEach(ensureStoryV51);saveGame();renderAll();}};
  const previousMigrate=migrateState;
  migrateState=function(data){data=previousMigrate(data);(data.players||[]).forEach(ensureStoryV51);return data;};

  window.SyndikatVisualStory={assets:ASSETS,story:STORY_V51,openArchive:openStoryArchive};
})();
/* SYNDIKAT_V51_VISUAL_STORY_END */
