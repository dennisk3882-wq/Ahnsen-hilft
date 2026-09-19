/* SYNDIKAT_V51_VISUAL_STORY_BEGIN */
(function SYNDIKAT_V51_VISUAL_STORY(){
  const ART={
    city:'./assets/city-map.webp',
    vittorio:'./assets/portrait-vittorio.webp',
    marco:'./assets/portrait-marco.webp',
    sofia:'./assets/portrait-sofia.webp',
    keller:'./assets/portrait-keller.webp',
    raid:'./assets/event-raid.webp',
    court:'./assets/event-court.webp',
    prison:'./assets/event-prison-break.webp',
    start:'./assets/start-user.webp'
  };

  const STORY_V2=[
    {chapter:1,title:'Kapitel I · Der Regen gehört niemandem',speaker:'Don Vittorio Leone',portrait:ART.vittorio,art:ART.city,
      intro:'Die Stadt glänzt im Regen, aber unter den Lichtern gehört jede Straße irgendjemandem. Vittorio legt dir einen Schlüsselbund auf den Tisch. Kein Palast, kein Casino – nur eine kleine Tür, hinter der dein erstes Geschäft beginnen kann.',
      quote:'„Ein Imperium beginnt nicht mit einer Krone. Es beginnt mit einer Rechnung, die jemand anderes bezahlt.“',
      objective:'Errichte deinen ersten Betrieb und bringe eine kriminelle Aktion erfolgreich zu Ende.',
      done:p=>p.businesses.length>=1&&(p.stats?.crimesSuccess||0)>=1,reward:12000,rep:2,
      outro:'Der erste Umschlag liegt auf dem Tisch. Noch kennt kaum jemand deinen Namen – aber zwei Straßen weiter fragt bereits jemand, wem der neue Laden gehört.'},
    {chapter:2,title:'Kapitel II · Der Mann im Hinterzimmer',speaker:'Marco Bellini',portrait:ART.marco,art:ART.start,
      intro:'Marco wartet im Hinterzimmer einer Bar. Er redet wenig, hört dafür umso genauer zu. Allein kannst du Geld verdienen. Eine Familie baust du nur mit Menschen auf, die bleiben, wenn es unbequem wird.',
      quote:'„Geld kauft Hände. Loyalität entscheidet, ob sie dich festhalten oder fallen lassen.“',
      objective:'Beschäftige mindestens 3 Personen und gründe deine erste Crew.',
      done:p=>activeStaff(p).length>=3&&(p.crews||[]).length>=1,reward:24000,rep:4,
      outro:'Zum ersten Mal sitzt eine feste Mannschaft an deinem Tisch. Nicht alle vertrauen einander. Aber alle wissen, wer am Kopfende sitzt.'},
    {chapter:3,title:'Kapitel III · Eine Nachricht von Moretti',speaker:'Sofia Moretti',portrait:ART.sofia,art:ART.city,
      intro:'Eine schwarze Limousine hält vor deinem Laden. Sofia Moretti steigt nicht aus. Stattdessen bringt ein Fahrer einen Umschlag: zwei Adressen, ein Stadtplan und die höfliche Warnung, nicht auf der falschen Straße zu expandieren.',
      quote:'„In dieser Stadt sind Grenzen unsichtbar. Bis jemand sie überschreitet.“',
      objective:'Kundschafte mindestens 2 verschiedene Viertel aus.',
      done:p=>Object.keys(p.scouting||{}).length>=2,reward:30000,rep:4,
      outro:'Deine Informanten markieren Namen, Hintereingänge und Wachwechsel. Die Stadt wirkt plötzlich kleiner – und sehr viel gefährlicher.'},
    {chapter:4,title:'Kapitel IV · Blaues Licht im Regen',speaker:'Kommissar Ernst Keller',portrait:ART.keller,art:ART.raid,
      intro:'Keller steht unter einer Straßenlaterne, als hätte er dort auf dich gewartet. Er nennt keine Anklage. Nur Zahlen, Uhrzeiten und Namen. Zu viele davon kommen dir bekannt vor.',
      quote:'„Ich muss nicht wissen, was Sie getan haben. Ich muss nur lange genug zusehen.“',
      objective:'Erreiche insgesamt 4 erfolgreiche Verbrechen und senke anschließend deinen Heat auf höchstens 35.',
      done:p=>(p.stats?.crimesSuccess||0)>=4&&p.heat<=35,reward:38000,rep:5,
      outro:'Die Streifenwagen verschwinden aus deinem Rückspiegel. Keller ist nicht weg. Aber fürs Erste hat er keine Handhabe.'},
    {chapter:5,title:'Kapitel V · Saubere Hände',speaker:'Carlo Esposito',portrait:ART.vittorio,art:ART.court,
      intro:'Carlo schiebt dir zwei Bücher über den Tisch. Eines ist für die Steuer. Das andere ist für dich. Wenn dein Geld nur aus Hinterzimmern kommt, wird irgendwann jedes Licht im Gebäude gleichzeitig angehen.',
      quote:'„Schmutziges Geld ist kein Vermögen. Es ist ein Beweisstück, das noch keinen Aufkleber trägt.“',
      objective:'Wasche insgesamt 50.000 $ und halte mindestens 100.000 $ sauberes Kapital.',
      done:p=>(p.stats?.launderedTotal||0)>=50000&&p.clean>=100000,reward:55000,rep:6,
      outro:'Auf dem Papier wächst ein vollkommen legales Unternehmen. Hinter dem Papier wächst etwas anderes.'},
    {chapter:6,title:'Kapitel VI · Der Preis der Loyalität',speaker:'Marco Bellini',portrait:ART.marco,art:ART.start,
      intro:'Mit jedem neuen Geschäft kommen neue Gesichter. Marco warnt dich: Eine Organisation ohne klare zweite Reihe zerfällt genau dann, wenn der Boss nicht am Tisch sitzt.',
      quote:'„Wenn du morgen verschwindest – wer sorgt dafür, dass übermorgen noch jemand deinen Namen fürchtet?“',
      objective:'Beschäftige mindestens 5 Personen und ernenne einen Unterboss.',
      done:p=>activeStaff(p).length>=5&&!!p.underbossId,reward:75000,rep:7,
      outro:'Zum ersten Mal kann die Organisation ohne dich einen Abend überstehen. Das ist beruhigend. Und beunruhigend.'},
    {chapter:7,title:'Kapitel VII · Unser Viertel',speaker:'Don Vittorio Leone',portrait:ART.vittorio,art:ART.city,
      intro:'Vittorio zeichnet mit dem Finger einen Kreis auf die Karte. Keine Geschäftsadresse, keine einzelne Bar – ein ganzes Viertel. Kontrolle bedeutet, dass andere zuerst an dich denken, bevor sie eine Tür öffnen.',
      quote:'„Besitz ist, was im Grundbuch steht. Macht ist, wen die Straße vorher fragt.“',
      objective:'Kontrolliere dein erstes Stadtviertel.',
      done:p=>controlledDistricts(p)>=1,reward:100000,rep:8,
      outro:'An den Ecken wechseln die Gespräche, wenn deine Wagen vorbeifahren. Das Viertel gehört dir nicht offiziell. Das muss es auch nicht.'},
    {chapter:8,title:'Kapitel VIII · Nacht der offenen Rechnungen',speaker:'Sofia Moretti',portrait:ART.sofia,art:ART.raid,
      intro:'Sofia lässt ausrichten, dass Diplomatie Grenzen hat. In derselben Nacht wird ein Lagerhaus deiner Konkurrenz dunkel. Jetzt geht es nicht mehr darum, ob du kämpfen willst – sondern ob du vorbereitet bist.',
      quote:'„Frieden ist nur die Zeit, in der beide Seiten nachladen.“',
      objective:'Schließe mindestens 2 geplante Operationen erfolgreich ab.',
      done:p=>(p.stats?.operationsSuccess||0)>=2,reward:135000,rep:9,
      outro:'Die Stadt hat verstanden, dass deine Drohungen keine Metaphern sind. Deine Rivalen auch.'},
    {chapter:9,title:'Kapitel IX · Keller zieht die Schlinge zu',speaker:'Kommissar Ernst Keller',portrait:ART.keller,art:ART.court,
      intro:'Vor dem Gerichtsgebäude liegt eine Akte auf einer Fensterbank. Absicht oder Zufall? Darin stehen Dinge, die nur wenige Menschen wissen können. Keller baut keinen Fall mehr – er baut eine Geschichte.',
      quote:'„Jeder macht Fehler. Große Männer machen nur größere Akten daraus.“',
      objective:'Halte die Beweislage unter 45 und baue entweder einen Kommissar-Kontakt auf oder beschäftige einen starken Anwalt.',
      done:p=>(p.investigation?.evidence||0)<45&&(!!p.bribes?.inspector||roleSkill(p,'lawyer')>=45),reward:165000,rep:9,
      outro:'Ein Zeuge erinnert sich plötzlich schlechter. Ein Termin verschiebt sich. Die Akte wird dünner – aber Keller wird persönlicher.'},
    {chapter:10,title:'Kapitel X · Die Stadt spricht deinen Namen',speaker:'Carlo Esposito',portrait:ART.vittorio,art:ART.city,
      intro:'Banker, Wirte, Immobilienmakler und Politiker benutzen deinen Familiennamen inzwischen in Sätzen, in denen du gar nicht anwesend bist. Carlo nennt das den Punkt, an dem Geld zu Struktur wird.',
      quote:'„Wenn dein Name eine Tür öffnet, bevor du klopfst, besitzt du mehr als ein Gebäude.“',
      objective:'Erreiche 2 Mio. $ Nettovermögen und kontrolliere mindestens 2 Viertel.',
      done:p=>netWorth(p)>=2000000&&controlledDistricts(p)>=2,reward:225000,rep:10,
      outro:'Du blickst von einem Büro über Dächer, die früher unerreichbar wirkten. Jetzt fragst du dich, was hinter ihnen liegt.'},
    {chapter:11,title:'Kapitel XI · Krone aus Neon',speaker:'Sofia Moretti',portrait:ART.sofia,art:ART.start,
      intro:'Sofia bietet keinen Frieden an. Sie bietet Anerkennung an – die gefährlichste Währung der Unterwelt. Deine Familie ist nicht mehr Teil des Problems. Sie ist eine der Mächte, die das Problem definieren.',
      quote:'„Du wolltest einen Platz am Tisch. Jetzt entscheiden alle anderen, ob sie noch sitzen bleiben.“',
      objective:'Erreiche 5 Mio. $ Nettovermögen, mindestens 4 erfolgreiche Operationen und eine aktive Crew.',
      done:p=>netWorth(p)>=5000000&&(p.stats?.operationsSuccess||0)>=4&&(p.crews||[]).length>=1,reward:350000,rep:12,
      outro:'Die alten Familien hören auf, dich als Aufsteiger zu behandeln. Von nun an zählt jeder Fehler doppelt.'},
    {chapter:12,title:'Kapitel XII · Das Syndikat',speaker:'Don Vittorio Leone',portrait:ART.vittorio,art:ART.city,
      intro:'Vittorio legt keinen Schlüssel auf den Tisch. Diesmal legt er gar nichts hin. Die Stadt unter dir ist voller Lichter, Schulden, Loyalitäten, Angst und Verträge. Alles ist miteinander verbunden – und ein großer Teil davon führt inzwischen zu dir.',
      quote:'„Am Ende besitzt niemand die Stadt. Die Stadt entscheidet nur, wessen Anruf sie zuerst beantwortet.“',
      objective:'Überstehe die Endgame-Krise, kontrolliere mindestens 3 Viertel und erreiche 62 Machtpunkte.',
      done:p=>!!p.finalCrisis?.resolved&&controlledDistricts(p)>=3&&powerIndex(p)>=62,reward:600000,rep:15,
      outro:'Es gibt keinen Applaus. Nur Telefone, die klingeln, Türen, die aufgehen, und Menschen, die deine Entscheidung abwarten. Du bist nicht mehr auf dem Weg zum Syndikat. Du bist es.'}
  ];

  const EVENT_ART={
    'Polizeikontrollen':ART.raid,'Schlechte Presse':ART.keller,'Diskreter Investor':ART.vittorio,
    'Defekte Automaten':ART.city,'Loyalitätskrise':ART.marco,'Straßenfest':ART.city,
    'Großveranstaltung':ART.city,'Glücksspielboom':ART.city
  };

  function ensureVisualStory(p){
    p.storyCampaign=p.storyCampaign||{chapter:1,claimed:[],seen:[]};
    p.storyCampaign.chapter=Math.max(1,Number(p.storyCampaign.chapter)||1);
    p.storyCampaign.claimed=Array.isArray(p.storyCampaign.claimed)?p.storyCampaign.claimed:[];
    p.storyCampaign.seen=Array.isArray(p.storyCampaign.seen)?p.storyCampaign.seen:[];
    p.eventArt=p.eventArt||null;
  }
  function storyCurrent(p){ensureVisualStory(p);return STORY_V2.find(x=>x.chapter===p.storyCampaign.chapter)||null;}
  function storyProgressText(p,ch){
    if(!ch)return '';
    const c=ch.chapter;
    if(c===1)return `${p.businesses.length}/1 Betrieb · ${Math.min(1,p.stats?.crimesSuccess||0)}/1 Aktion`;
    if(c===2)return `${activeStaff(p).length}/3 Personal · ${(p.crews||[]).length}/1 Crew`;
    if(c===3)return `${Object.keys(p.scouting||{}).length}/2 Viertel`;
    if(c===4)return `${Math.min(4,p.stats?.crimesSuccess||0)}/4 Erfolge · Heat ${Math.round(p.heat)}/35`;
    if(c===5)return `${fmt(p.stats?.launderedTotal||0)} gewaschen · ${fmt(p.clean)} sauber`;
    if(c===6)return `${activeStaff(p).length}/5 Personal · Unterboss ${p.underbossId?'ernannt':'offen'}`;
    if(c===7)return `${controlledDistricts(p)}/1 Viertel`;
    if(c===8)return `${Math.min(2,p.stats?.operationsSuccess||0)}/2 Operationen`;
    if(c===9)return `Beweise ${Math.round(p.investigation?.evidence||0)}/45 · Schutz ${p.bribes?.inspector||roleSkill(p,'lawyer')>=45?'bereit':'offen'}`;
    if(c===10)return `${fmt(netWorth(p))}/${fmt(2000000)} · ${controlledDistricts(p)}/2 Viertel`;
    if(c===11)return `${fmt(netWorth(p))}/${fmt(5000000)} · ${p.stats?.operationsSuccess||0}/4 Operationen`;
    return `Macht ${Math.round(powerIndex(p))}/62 · ${controlledDistricts(p)}/3 Viertel · Krise ${p.finalCrisis?.resolved?'überstanden':'offen'}`;
  }
  function storyPct(p,ch){
    if(!ch||ch.done(p))return 100;
    const c=ch.chapter;let n=0;
    if(c===1)n=(Math.min(1,p.businesses.length)+Math.min(1,p.stats?.crimesSuccess||0))/2;
    else if(c===2)n=(Math.min(1,activeStaff(p).length/3)+Math.min(1,(p.crews||[]).length))/2;
    else if(c===3)n=Math.min(1,Object.keys(p.scouting||{}).length/2);
    else if(c===4)n=(Math.min(1,(p.stats?.crimesSuccess||0)/4)+(p.heat<=35?1:Math.max(0,(100-p.heat)/65)))/2;
    else if(c===5)n=(Math.min(1,(p.stats?.launderedTotal||0)/50000)+Math.min(1,p.clean/100000))/2;
    else if(c===6)n=(Math.min(1,activeStaff(p).length/5)+(p.underbossId?1:0))/2;
    else if(c===7)n=Math.min(1,controlledDistricts(p));
    else if(c===8)n=Math.min(1,(p.stats?.operationsSuccess||0)/2);
    else if(c===9){const ev=(p.investigation?.evidence||0);n=(ev<45?0.6:Math.max(0,(100-ev)/55)*.6)+((p.bribes?.inspector||roleSkill(p,'lawyer')>=45)?0.4:0);}
    else if(c===10)n=(Math.min(1,netWorth(p)/2000000)+Math.min(1,controlledDistricts(p)/2))/2;
    else if(c===11)n=(Math.min(1,netWorth(p)/5000000)+Math.min(1,(p.stats?.operationsSuccess||0)/4)+((p.crews||[]).length?1:0))/3;
    else n=(Math.min(1,powerIndex(p)/62)+Math.min(1,controlledDistricts(p)/3)+(p.finalCrisis?.resolved?1:0))/3;
    return Math.round(Math.min(1,n)*100);
  }

  function openStoryScene(ch,mode='briefing'){
    const p=currentPlayer();if(!ch)return;ensureVisualStory(p);
    if(!p.storyCampaign.seen.includes(ch.chapter)){p.storyCampaign.seen.push(ch.chapter);saveGame();}
    const completed=mode==='complete';
    openDialog(`<div class="dialog-wrap story-scene">
      <div class="story-cinematic" style="background-image:linear-gradient(180deg,rgba(6,8,12,.08),rgba(6,8,12,.96)),url('${ch.art}')">
        <button class="icon-btn story-close" data-close>✕</button>
        <div class="story-scene-copy"><p class="eyebrow">${completed?'Kapitel abgeschlossen':'Storykampagne · Kapitel '+ch.chapter}</p><h2>${esc(ch.title.replace(/^Kapitel [IVXLCDM]+ · /,''))}</h2></div>
      </div>
      <div class="story-dialogue"><img src="${ch.portrait}" alt="" loading="lazy"><div><small>${esc(ch.speaker)}</small><p>${esc(completed?ch.outro:ch.intro)}</p><blockquote>${esc(ch.quote)}</blockquote></div></div>
      ${completed?'':`<div class="story-objective"><strong>Ziel</strong><span>${esc(ch.objective)}</span><small>${esc(storyProgressText(p,ch))}</small><div class="progress"><i style="width:${storyPct(p,ch)}%"></i></div></div>`}
      <div class="dialog-footer">${completed&&storyCurrent(p)?'<button class="btn btn-primary" data-next-story>Nächstes Kapitel</button>':'<button class="btn btn-secondary" data-close>Schließen</button>'}</div>
    </div>`);
    $('[data-next-story]')?.addEventListener('click',()=>{const next=storyCurrent(p);closeDialog();if(next)openStoryScene(next,'briefing');});
  }
  function claimStory(){
    const p=currentPlayer(),ch=storyCurrent(p);if(!ch||!ch.done(p))return toast('Kapitelziel noch nicht erfüllt.');
    if(p.storyCampaign.claimed.includes(ch.chapter))return;
    p.storyCampaign.claimed.push(ch.chapter);p.clean+=ch.reward;p.reputation=clamp(p.reputation+ch.rep,0,100);
    ledger(p,`Story: ${ch.title}`,ch.reward,'income');log(`${p.family}: ${ch.title} abgeschlossen.`);
    p.storyCampaign.chapter=Math.min(STORY_V2.length+1,p.storyCampaign.chapter+1);
    saveGame();renderAll();openStoryScene(ch,'complete');toast(`Storykapitel abgeschlossen: +${fmt(ch.reward)}.`);
  }
  function portraitForStaff(s){
    if(!s)return ART.vittorio;
    if(s.name==='Marco Bellini'||s.role==='gunman'||s.role==='bodyguard')return ART.marco;
    if(['informant','manager'].includes(s.role)||/Julia|Mara|Giulia|Sofia|Elena|Tessa|Valentina|Mina/.test(s.name))return ART.sofia;
    if(s.role==='lawyer')return ART.keller;
    return ART.vittorio;
  }

  const baseMigrate=migrateState;
  migrateState=function(data){data=baseMigrate(data);for(const p of data.players||[])ensureVisualStory(p);return data;};
  const baseInit=initPlayer;
  initPlayer=function(p){baseInit(p);ensureVisualStory(p);};

  const baseRenderCity=renderCity;
  renderCity=function(){
    baseRenderCity();
    const p=currentPlayer(),grid=$('#districtGrid');if(!grid)return;
    grid.classList.add('illustrated-city-map');
    grid.innerHTML=`<div class="city-art-wrap"><img class="city-art" src="${ART.city}" alt="Noir-Stadtkarte mit den Vierteln von Syndikat" loading="eager"><svg class="city-hotspots" viewBox="0 0 1000 620" role="group" aria-label="Anklickbare Stadtviertel">
      ${DISTRICTS.map(d=>{const l=MAP_LABELS[d.id],s=districtShare(p,d.id),owner=districtOwner(d.id),sel=selectedDistrict===d.id;return `<g class="map-district visual ${sel?'selected':''}" data-district="${d.id}" tabindex="0" role="button" aria-label="${esc(d.name)}, eigener Einfluss ${Math.round(s)} Prozent"><polygon points="${MAP_SHAPES[d.id]}" fill="${sel?'rgba(217,173,84,.24)':'rgba(6,10,16,.16)'}" stroke="${sel?'#f1c96c':d.accent}"/><text x="${l[0]}" y="${l[1]}" class="map-name">${esc(d.name)}</text><text x="${l[0]}" y="${l[1]+24}" class="map-share">${Math.round(s)}% · ${esc(owner.player?owner.player.family:'Neutral')}</text></g>`;}).join('')}
    </svg></div>`;
    $$('#districtGrid [data-district]').forEach(el=>{const activate=()=>{selectedDistrict=el.dataset.district;renderCity();};el.onclick=activate;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}};});
    const list=$('#situationList');if(list&&p.eventArt)list.insertAdjacentHTML('afterbegin',`<div class="event-visual-card"><img src="${p.eventArt}" alt="" loading="lazy"><div><small>Aktuelle Szene</small><strong>${esc(p.eventText||'Ereignis')}</strong></div></div>`);
  };

  const baseRenderStaff=renderStaff;
  renderStaff=function(){
    baseRenderStaff();const p=currentPlayer();
    $$('#staffGrid .person-card').forEach((card,i)=>{const person=(p.staffRoster||[])[i];if(person&&!card.querySelector('.person-portrait'))card.insertAdjacentHTML('afterbegin',`<img class="person-portrait" src="${portraitForStaff(person)}" alt="" loading="lazy">`);});
  };
  const baseOpenStaff=openStaffPerson;
  openStaffPerson=function(id){
    baseOpenStaff(id);const p=currentPlayer(),person=p.staffRoster.find(x=>x.id===id),wrap=$('#dialogContent .dialog-wrap');
    if(person&&wrap&&!wrap.querySelector('.person-detail-portrait'))wrap.querySelector('.dialog-head')?.insertAdjacentHTML('afterend',`<div class="person-detail-hero"><img class="person-detail-portrait" src="${portraitForStaff(person)}" alt="" loading="lazy"><div><small>${esc(STAFF[person.role].name)}</small><strong>${esc(traitName(person.trait))}</strong><p>Fähigkeit ${person.skill}/100 · Loyalität ${person.loyalty}/100</p></div></div>`);
  };

  const baseCorruption=renderCorruption;
  renderCorruption=function(){
    baseCorruption();const pics={officer:ART.keller,inspector:ART.keller,judge:ART.vittorio,prosecutor:ART.keller,mayor:ART.vittorio};
    $$('#corruptionGrid .shop-card').forEach((card,i)=>{const key=Object.keys(CORRUPTION)[i],src=pics[key];if(src&&!card.querySelector('.contact-portrait'))card.insertAdjacentHTML('afterbegin',`<img class="contact-portrait" src="${src}" alt="" loading="lazy">`);});
  };

  const baseRenderMissions=renderMissions;
  renderMissions=function(){
    baseRenderMissions();const p=currentPlayer(),el=$('#missionList');if(!el)return;ensureVisualStory(p);
    el.querySelectorAll('.story-card').forEach(x=>x.remove());const ch=storyCurrent(p);
    const html=ch?`<article class="mission-card panel story-card story-v2"><div class="story-card-art" style="background-image:linear-gradient(90deg,rgba(7,10,15,.92),rgba(7,10,15,.3)),url('${ch.art}')"><img src="${ch.portrait}" alt="" loading="lazy"><div><p class="eyebrow">Storykampagne · ${ch.chapter}/${STORY_V2.length}</p><h3>${esc(ch.title)}</h3><p>${esc(ch.intro)}</p></div></div><div class="mission-progress"><div class="progress"><i style="width:${storyPct(p,ch)}%"></i></div><small>${esc(ch.objective)} · ${esc(storyProgressText(p,ch))}</small></div><footer><div><span>Belohnung ${fmt(ch.reward)} + ${ch.rep} Ruf</span><small>${esc(ch.speaker)}</small></div><div class="mini-actions"><button class="btn btn-secondary" data-story-scene>Szene ansehen</button><button class="btn ${ch.done(p)?'btn-primary':'btn-secondary'}" data-story-v2-claim ${ch.done(p)?'':'disabled'}>${ch.done(p)?'Kapitel abschließen':'Ziel offen'}</button></div></footer></article>`
      :`<article class="mission-card panel story-card story-v2 completed"><div class="story-card-art" style="background-image:linear-gradient(90deg,rgba(7,10,15,.9),rgba(7,10,15,.25)),url('${ART.city}')"><img src="${ART.vittorio}" alt="" loading="lazy"><div><p class="eyebrow">Storykampagne abgeschlossen</p><h3>Die Stadt antwortet zuerst dir</h3><p>Alle zwölf Kapitel der Syndikatskampagne sind abgeschlossen. Die freie Partie läuft weiter, solange du möchtest.</p></div></div></article>`;
    el.insertAdjacentHTML('afterbegin',html);$('[data-story-scene]',el)?.addEventListener('click',()=>openStoryScene(ch,'briefing'));$('[data-story-v2-claim]',el)?.addEventListener('click',claimStory);
  };

  const baseTriggerEvent=triggerEvent;
  triggerEvent=function(p){
    baseTriggerEvent(p);p.eventArt=EVENT_ART[p.eventText]||ART.city;
    if(p.type==='human'&&chance(.42)){const msg=p.eventText;setTimeout(()=>{if(!state||currentPlayer()?.id!==p.id)return;openDialog(`<div class="dialog-wrap event-scene"><div class="event-image"><img src="${p.eventArt}" alt="" loading="lazy"><span>Ereignis · Runde ${state.round}</span></div><div class="event-scene-copy"><h2>${esc(msg)}</h2><p>${esc((EVENTS.find(e=>e.name===msg)?.text)||'Die Lage in der Stadt verändert sich.')}</p></div><div class="dialog-footer"><button class="btn btn-primary" data-close>Weiter</button></div></div>`);},180);}
  };
  const baseRaid=policeRaid;
  policeRaid=function(p){baseRaid(p);p.eventArt=ART.raid;};

  const baseEnd=processEndOfTurn;
  processEndOfTurn=function(p){
    baseEnd(p);ensureVisualStory(p);
    if(p.jailed>0)p.eventArt=ART.prison;
    if((p.courtCases||[]).some(c=>c.status==='pending'))p.eventArt=ART.court;
  };

  const baseCreate=createGame;
  createGame=function(){
    baseCreate();
    if(state){for(const p of state.players)ensureVisualStory(p);const p=currentPlayer(),ch=storyCurrent(p);if(p?.type==='human'&&ch)setTimeout(()=>openStoryScene(ch,'briefing'),420);}
  };

  window.SyndikatVisualStory={art:ART,story:STORY_V2,openStory:()=>openStoryScene(storyCurrent(currentPlayer()),'briefing')};
})();
/* SYNDIKAT_V51_VISUAL_STORY_END */
