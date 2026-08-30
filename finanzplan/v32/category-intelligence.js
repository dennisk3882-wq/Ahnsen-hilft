'use strict';
(function(){
  const norm=s=>FinanceLib.normalizeText(String(s||''));
  const words=s=>norm(s).replace(/[^a-z0-9äöüß&]+/gi,' ').replace(/\s+/g,' ').trim();
  const baseApply=window.applyMerchantRule;
  const basePost=window.FinanzIntelligence?.postImport?.bind(window.FinanzIntelligence);
  const canonical=raw=>window.FinanzIntelligence?.canonicalMerchant?.(raw)||String(raw||'').trim()||'Unbekannt';

  const aliases=[
    ['edeka','EDEKA'],['penny','PENNY'],['rewe','REWE'],['aldi','ALDI'],['lidl','Lidl'],['netto','Netto'],['kaufland','Kaufland'],['marktkauf','Marktkauf'],['norma','NORMA'],['nahkauf','nahkauf'],['tegut','tegut'],['famila','famila'],['combi','Combi'],['globus','Globus'],['hit markt','HIT'],
    ['labyrinth','Labyrinth'],['mcdonald','McDonald’s'],['burger king','Burger King'],['kfc','KFC'],['lieferando','Lieferando'],['wolt','Wolt'],['dominos','Domino’s'],['subway','Subway'],['starbucks','Starbucks'],
    ['vodafone','Vodafone'],['deutsche telekom','Telekom'],['telekom','Telekom'],['telefonica','O2'],['o2','O2'],['1und1','1&1'],['1&1','1&1'],['congstar','congstar'],['freenet','freenet'],['mobilcom','mobilcom-debitel'],
    ['aral','Aral'],['shell','Shell'],['esso','Esso'],['totalenergies','TotalEnergies'],['hem','HEM'],['avia','AVIA'],['jet','JET'],
    ['dm drogerie','dm'],['rossmann','Rossmann'],['mueller drogerie','Müller'],['müller drogerie','Müller'],
    ['amazon','Amazon'],['zalando','Zalando'],['about you','ABOUT YOU'],['h&m','H&M'],['c&a','C&A'],['new yorker','New Yorker'],['takko','Takko'],['kik','KiK'],['deichmann','Deichmann'],
    ['netflix','Netflix'],['spotify','Spotify'],['disney','Disney+'],['sky','Sky'],['dazn','DAZN'],['youtube','YouTube'],
    ['deutsche bahn','Deutsche Bahn'],['db vertrieb','Deutsche Bahn'],['uber','Uber'],['bolt','Bolt']
  ];

  // Merchant profiles are intentionally stronger than MCC. A card MCC is useful evidence,
  // but may be missing, generic, stale or represent a sub-purchase rather than the merchant itself.
  // Only explicitly allowed MCC categories may override a trusted merchant profile.
  const merchantProfiles=[
    {id:'c_food',names:['lebensmittel'],confidence:.998,patterns:['edeka','penny','rewe','aldi','lidl','netto','kaufland','marktkauf','norma','nahkauf','tegut','famila','combi','globus','hit markt']},
    {id:'c_restaurant',names:['restaurant'],confidence:.997,patterns:['labyrinth','mcdonald','burger king','kfc','subway','domino','lieferando','wolt','starbucks']},
    {id:'c_subs',names:['abos & vertraege','abos & verträge','abos','vertraege','verträge'],confidence:.997,patterns:['vodafone','deutsche telekom','telekom','telefonica','o2','1und1','1&1','congstar','freenet','mobilcom','netflix','spotify','disney','dazn','sky deutschland','youtube premium','amazon prime','adobe','microsoft 365']},
    {id:'c_fuel',names:['tanken'],confidence:.997,patterns:['aral','shell','esso','jet tank','jet station','totalenergies','total station','hem tank','avia'],mccOverrides:['c_food','c_restaurant']},
    {id:'c_clothes',names:['kleidung'],confidence:.997,patterns:['zalando','about you','h&m','hm com','c&a','new yorker','takko','kik textil','peek & cloppenburg','peek und cloppenburg','snipes','deichmann','breuninger']},
    {id:'c_mob',names:['mobilitaet','mobilität'],confidence:.994,patterns:['deutsche bahn','db vertrieb','flixbus','uber','bolt']}
  ];

  const rules=[
    {id:'c_food',names:['lebensmittel'],confidence:.97,patterns:['supermarkt','lebensmittelmarkt','getraenkemarkt','getränkemarkt','getraenke hoffmann','getränke hoffmann','lebensmittel','market grocery']},
    {id:'c_restaurant',names:['restaurant'],confidence:.97,patterns:['restaurant','bistro','gasthaus','gaststaette','gaststätte','pizzeria','trattoria','steakhouse','imbiss','cafe','café','baeckerei','bäckerei']},
    {id:'c_subs',names:['abos & vertraege','abos & verträge','abos','vertraege','verträge'],confidence:.96,patterns:['mobilfunk','telefonrechnung','internetvertrag','dsl','kabel internet','streaming','subscription','abo','apple com bill','google one','google storage','dropbox']},
    {id:'c_health',names:['gesundheit'],confidence:.97,patterns:['praxis','arzt','aerzte','ärzte','zahnarzt','apotheke','physio','physiotherapie','klinik','krankenhaus','sanitaetshaus','sanitätshaus','labor','orthopaed','orthopäd','therapiezentrum','optiker']},
    {id:'c_fuel',names:['tanken'],confidence:.97,patterns:['tankstelle','autohof','kraftstoff','benzin','diesel']},
    {id:'c_mob',names:['mobilitaet','mobilität'],confidence:.94,patterns:['taxi','parkhaus','parking','parkster','easypark','verkehrsbetrieb','bus ticket','bahn ticket']},
    {id:'c_home',names:['wohnen'],confidence:.95,patterns:['stadtwerke','e on','eon energie','vattenfall','enercity','stromabschlag','gasabschlag','wasserverband','miete','hausrate','nebenkosten','grundsteuer','rundfunkbeitrag']},
    {id:'c_ins',names:['versicherungen'],confidence:.97,patterns:['allianz','huk','huk24','axa','r+v','ruv','vhv','devk','ergo versicherung','signal iduna','versicherung','versicherungsbeitrag']},
    {id:'c_clothes',names:['kleidung'],confidence:.95,patterns:['modehaus','fashion','bekleidung','schuhhaus','schuhe','textilien']},
    {id:'c_kids',names:['kinder'],confidence:.94,patterns:['kindergarten','kita','kinderkrippe','hort','schulessen','schulverein','tonies','mytoys','babyone']},
    {id:'c_debt',names:['kredite'],confidence:.94,patterns:['darlehensrate','kreditrate','kredittilgung','baufinanzierung','ratenkredit']},
    {id:'c_leisure',names:['freizeit'],confidence:.91,patterns:['kino','cinema','bowling','freizeitpark','zoo','museum','ticketmaster','eventim','steamgames','playstation network','nintendo eshop']},
    {id:'c_other',names:['sonstiges'],confidence:.79,patterns:['amazon','paypal','dm drogerie','rossmann','mueller drogerie','müller drogerie','ikea','obi','hornbach','bauhaus']}
  ];

  // MCC is supporting evidence, not ground truth. Confidence is deliberately below a
  // trusted merchant identity / explicit semantic text match.
  const mccRules=[
    {id:'c_food',names:['lebensmittel'],confidence:.95,label:'Lebensmittel',codes:['5411','5422','5441','5451','5462','5499']},
    {id:'c_restaurant',names:['restaurant'],confidence:.95,label:'Restaurant/Gastronomie',codes:['5811','5812','5813','5814']},
    {id:'c_subs',names:['abos & vertraege','abos & verträge','abos','vertraege','verträge'],confidence:.94,label:'Telekommunikation',codes:['4812','4814','4816','4899']},
    {id:'c_health',names:['gesundheit'],confidence:.95,label:'Gesundheit',codes:['5912','8011','8021','8031','8041','8042','8043','8049','8050','8062','8071','8099']},
    {id:'c_fuel',names:['tanken'],confidence:.95,label:'Tankstelle/Kraftstoff',codes:['5541','5542','5983']},
    {id:'c_mob',names:['mobilitaet','mobilität'],confidence:.93,label:'Mobilität',codes:['4111','4112','4121','4131','4215','4784','4789','7512','7523']},
    {id:'c_home',names:['wohnen'],confidence:.91,label:'Wohnen/Versorger',codes:['4900','5200','5211','5231','5251','5261','5712','5713','5714','5718','5719']},
    {id:'c_ins',names:['versicherungen'],confidence:.95,label:'Versicherung',codes:['6300','6381','6399']},
    {id:'c_clothes',names:['kleidung'],confidence:.95,label:'Kleidung/Schuhe',codes:['5611','5621','5631','5641','5651','5655','5661','5681','5691','5697','5698','5699']},
    {id:'c_kids',names:['kinder'],confidence:.91,label:'Spielwaren/Kinder',codes:['5945']},
    {id:'c_leisure',names:['freizeit'],confidence:.92,label:'Freizeit/Unterhaltung',codes:['7832','7841','7911','7922','7929','7932','7933','7941','7991','7992','7993','7994','7996','7997','7998','7999']},
    {id:'c_other',names:['sonstiges'],confidence:.78,label:'Allgemeiner Handel',codes:['5310','5311','5331','5399','5999']}
  ];

  function categoryId(id,names=[]){
    if((data.categories||[]).some(c=>c.id===id))return id;
    const wanted=names.map(words);
    return (data.categories||[]).find(c=>wanted.includes(words(c.name)))?.id||'';
  }
  function fallbackCategory(type='expense'){
    return type==='income'
      ? categoryId('c_income_other',['weitere einnahmen'])
      : categoryId('c_other',['sonstiges']);
  }
  function contains(text,needle){
    const t=` ${words(text)} `,p=words(needle);
    return !!p&&t.includes(` ${p} `);
  }
  function merchantAlias(raw){
    const n=words(raw);
    for(const [needle,name] of aliases)if(contains(n,needle))return name;
    return canonical(raw);
  }
  function merchantKey(raw){return words(merchantAlias(raw))}
  function manualRule(text){
    const n=words(text);
    return (data.merchantRules||[]).filter(r=>r.active!==false&&!r.learned&&r.categoryId).sort((a,b)=>String(b.pattern||'').length-String(a.pattern||'').length).find(r=>{
      const p=words(r.pattern||r.merchant||'');return p&&(n===p||n.includes(` ${p} `)||(` ${n} `).includes(` ${p} `));
    })||null;
  }
  function learnedRule(merchant){
    const key=merchantKey(merchant);if(!key||key==='unbekannt')return null;
    return (data.merchantRules||[]).filter(r=>r.active!==false&&r.learned&&r.categoryId&&Number(r.confidence||0)>=.8).sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0)).find(r=>merchantKey(r.merchant||r.pattern||'')===key)||null;
  }
  function normalizeMcc(raw){const m=String(raw??'').replace(/\D/g,'').slice(0,4);return m.length===4?m:''}
  function classifyMcc(raw,type='expense'){
    if(type==='income')return null;
    const mcc=normalizeMcc(raw);if(!mcc)return null;
    const rule=mccRules.find(r=>r.codes.includes(mcc));if(!rule)return null;
    const id=categoryId(rule.id,rule.names);if(!id)return null;
    return {categoryId:id,ruleId:rule.id,confidence:rule.confidence,reason:`mcc:${mcc}:${rule.label}`,source:'mcc',mcc};
  }
  function classifyMerchant(text,type='expense'){
    if(type==='income')return null;
    const n=words(text);
    for(const profile of merchantProfiles){
      const matched=profile.patterns.find(p=>contains(n,p));
      if(!matched)continue;
      const id=categoryId(profile.id,profile.names);if(!id)continue;
      return {categoryId:id,ruleId:profile.id,confidence:profile.confidence,reason:`merchant:${matched}:${profile.id}`,source:'merchant',mccOverrides:profile.mccOverrides||[]};
    }
    return null;
  }
  function classifyKnowledge(text,type='expense'){
    const n=words(text);
    if(type==='income'){
      if(['gehalt','lohn','salary','payroll','arbeitsentgelt','lohnabrechnung'].some(p=>contains(n,p)))return {categoryId:categoryId('c_income_salary',['gehalt']),confidence:.99,reason:'income-salary',source:'knowledge'};
      return {categoryId:fallbackCategory('income'),confidence:.8,reason:'income-other',source:'knowledge'};
    }
    for(const rule of rules){if(rule.patterns.some(p=>contains(n,p))){const id=categoryId(rule.id,rule.names);if(id)return {categoryId:id,ruleId:rule.id,confidence:rule.confidence,reason:`knowledge:${rule.id}`,source:'knowledge'}}}
    return {categoryId:fallbackCategory('expense'),confidence:.55,reason:'expense-fallback',source:'fallback'};
  }
  function chooseMerchantEvidence(merchantEvidence,mcc){
    if(!merchantEvidence)return null;
    if(!mcc)return merchantEvidence;
    if(mcc.categoryId===merchantEvidence.categoryId)return {...merchantEvidence,confidence:.999,reason:`${merchantEvidence.reason}+${mcc.reason}`,source:'merchant+mcc'};
    if((merchantEvidence.mccOverrides||[]).includes(mcc.ruleId))return {...mcc,confidence:Math.max(mcc.confidence,.965),reason:`${mcc.reason}+merchant-override:${merchantEvidence.ruleId}`,source:'mcc+merchant-context'};
    return {...merchantEvidence,reason:`${merchantEvidence.reason}+conflict:${mcc.reason}`,source:'merchant'};
  }
  function chooseGenericEvidence(knowledge,mcc){
    if(!mcc)return knowledge;
    if(!knowledge?.categoryId)return mcc;
    if(mcc.categoryId===knowledge.categoryId)return {...knowledge,confidence:Math.min(.995,Math.max(mcc.confidence,knowledge.confidence)+.01),reason:`${knowledge.reason}+${mcc.reason}`,source:'knowledge+mcc'};
    if(knowledge.reason==='expense-fallback')return mcc;
    if(Number(knowledge.confidence||0)>=.96)return {...knowledge,reason:`${knowledge.reason}+conflict:${mcc.reason}`,source:'knowledge'};
    if(Number(mcc.confidence||0)>Number(knowledge.confidence||0)+.02)return mcc;
    return knowledge;
  }
  function categorizeTransaction(input={}){
    const type=input.type==='income'?'income':'expense';
    const raw=[input.merchant,input.title,input.note,input.remittance,input.reference].filter(Boolean).join(' ');
    const merchant=merchantAlias(input.merchant||input.title||raw);
    const searchable=`${merchant} ${raw}`;
    const mcc=classifyMcc(input.mcc,type);

    const manual=manualRule(searchable);
    if(manual)return {categoryId:manual.categoryId||fallbackCategory(type),merchant:manual.merchant||merchant,confidence:1,reason:'manual-rule',source:'manual',mcc:normalizeMcc(input.mcc)};

    const merchantEvidence=classifyMerchant(searchable,type);
    if(merchantEvidence){
      const chosen=chooseMerchantEvidence(merchantEvidence,mcc);
      return {...chosen,merchant,source:chosen.source||'merchant',mcc:normalizeMcc(input.mcc)};
    }

    // Learned history is useful for merchants that are not part of the trusted knowledge base.
    // A trusted merchant profile is intentionally evaluated first so old learning produced by a
    // previously wrong MCC cannot permanently poison future categorizations.
    const learned=learnedRule(merchant);
    if(learned)return {categoryId:learned.categoryId||fallbackCategory(type),merchant:learned.merchant||merchant,confidence:Number(learned.confidence||.8),reason:'learned-rule',source:'learned',mcc:normalizeMcc(input.mcc)};

    const knowledge=classifyKnowledge(searchable,type),smart=chooseGenericEvidence(knowledge,mcc);
    return {...smart,categoryId:smart?.categoryId||fallbackCategory(type),merchant,source:smart?.source||'fallback',mcc:normalizeMcc(input.mcc)};
  }

  window.applyMerchantRule=function(title,draft={}){
    const raw=`${title||''} ${draft.merchant||''} ${draft.note||''} ${draft.remittance||''} ${draft.reference||''}`;
    const manual=manualRule(raw);
    const base=typeof baseApply==='function'?baseApply(title,draft):{...draft};
    if(manual)return {...base,categoryId:manual.categoryId||fallbackCategory(draft.type),accountId:manual.accountId||base.accountId,merchant:manual.merchant||base.merchant||merchantAlias(title),categorySource:'manual',categoryConfidence:1,categoryReason:'manual-rule'};
    const smart=categorizeTransaction({title,merchant:draft.merchant,note:draft.note,remittance:draft.remittance,reference:draft.reference,type:draft.type,mcc:draft.mcc});
    return {...base,categoryId:smart.categoryId||fallbackCategory(draft.type),merchant:smart.merchant||base.merchant||merchantAlias(title),categorySource:smart.source,categoryConfidence:smart.confidence,categoryReason:smart.reason};
  };

  function repairLearnedRules(){
    let changed=0;
    for(const r of data.merchantRules||[]){
      if(!r.learned||r.active===false)continue;
      const trusted=classifyMerchant(`${r.merchant||''} ${r.pattern||''}`,'expense');
      if(trusted?.categoryId&&r.categoryId!==trusted.categoryId){
        r.categoryId=trusted.categoryId;
        r.confidence=Math.max(Number(r.confidence||0),trusted.confidence);
        r.correctedBy='trusted-merchant';
        r.updatedAt=new Date().toISOString();
        changed++;
      }
    }
    return changed;
  }

  function reclassifyImportedTransactions({onlySuspicious=false}={}){
    let changed=0;
    for(const t of data.transactions||[]){
      const imported=t.source==='n26'||(t.tags||[]).includes('n26')||t.source==='bank';
      if(!imported||t.categorySource==='manual'||t.categoryLocked===true)continue;
      const current=(data.categories||[]).find(c=>c.id===t.categoryId);
      const currentName=words(current?.name||'');
      const suspicious=!t.categoryId||currentName==='kleidung'||currentName==='sonstiges'||t.categorySource==='fallback'||t.categorySource==='smart'||t.categorySource==='mcc'||t.categorySource==='mcc+smart'||t.categorySource==='knowledge'||t.categorySource==='knowledge+mcc'||!t.categorySource;
      if(onlySuspicious&&!suspicious)continue;
      const smart=categorizeTransaction({title:t.title,merchant:t.sourceMerchant||t.merchant,note:t.note,remittance:t.remittance,reference:t.reference,type:t.type,mcc:t.mcc});
      const target=smart.categoryId||fallbackCategory(t.type);
      if(!target)continue;
      if(smart.confidence>=.8||(suspicious&&smart.confidence>=.55)){
        if(t.categoryId!==target||t.merchant!==smart.merchant||t.categorySource!==smart.source||Number(t.categoryConfidence||0)!==Number(smart.confidence||0)||t.categoryReason!==smart.reason){
          t.categoryId=target;t.merchant=smart.merchant||t.merchant;t.categorySource=smart.source;t.categoryConfidence=smart.confidence;t.categoryReason=smart.reason;changed++;
        }
      }
    }
    return changed;
  }

  function postImport(){
    const repaired=repairLearnedRules();
    const recategorized=reclassifyImportedTransactions({onlySuspicious:true});
    const base=basePost?basePost():{};
    return {...(base||{}),recategorized,repaired};
  }

  const api={categorizeTransaction,classifyKnowledge,classifyMerchant,classifyMcc,normalizeMcc,merchantAlias,reclassifyImportedTransactions,repairLearnedRules,postImport,fallbackCategory};
  window.FinanzCategoryIntelligence=api;
  if(window.FinanzIntelligence)window.FinanzIntelligence.postImport=postImport;
})();