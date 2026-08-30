'use strict';
(function(){
  const norm=s=>FinanceLib.normalizeText(String(s||''));
  const words=s=>norm(s).replace(/[^a-z0-9äöüß&]+/gi,' ').replace(/\s+/g,' ').trim();
  const baseApply=window.applyMerchantRule;
  const basePost=window.FinanzIntelligence?.postImport?.bind(window.FinanzIntelligence);
  const canonical=raw=>window.FinanzIntelligence?.canonicalMerchant?.(raw)||String(raw||'').trim()||'Unbekannt';

  const aliases=[
    ['edeka','EDEKA'],['penny','PENNY'],['rewe','REWE'],['aldi','ALDI'],['lidl','Lidl'],['netto','Netto'],['kaufland','Kaufland'],['marktkauf','Marktkauf'],['norma','NORMA'],['nahkauf','nahkauf'],['tegut','tegut'],['famila','famila'],['combi','Combi'],['globus','Globus'],
    ['vodafone','Vodafone'],['deutsche telekom','Telekom'],['telekom','Telekom'],['telefonica','O2'],['o2','O2'],['1und1','1&1'],['1&1','1&1'],['congstar','congstar'],['freenet','freenet'],
    ['mcdonald','McDonald’s'],['burger king','Burger King'],['lieferando','Lieferando'],['dominos','Domino’s'],['subway','Subway'],['starbucks','Starbucks'],
    ['aral','Aral'],['shell','Shell'],['esso','Esso'],['totalenergies','TotalEnergies'],['hem','HEM'],['avia','AVIA'],['jet','JET'],
    ['dm drogerie','dm'],['rossmann','Rossmann'],['mueller drogerie','Müller'],['müller drogerie','Müller'],
    ['amazon','Amazon'],['zalando','Zalando'],['about you','ABOUT YOU'],['h&m','H&M'],['c&a','C&A'],['new yorker','New Yorker'],['takko','Takko'],['kik','KiK'],['deichmann','Deichmann'],
    ['netflix','Netflix'],['spotify','Spotify'],['disney','Disney+'],['sky','Sky'],['dazn','DAZN'],['youtube','YouTube'],
    ['deutsche bahn','Deutsche Bahn'],['db vertrieb','Deutsche Bahn'],['uber','Uber'],['bolt','Bolt']
  ];

  const rules=[
    {id:'c_food',names:['lebensmittel'],confidence:.99,patterns:['edeka','penny','rewe','aldi','lidl','netto','kaufland','marktkauf','norma','nahkauf','tegut','famila','combi','globus','hit markt','supermarkt','lebensmittelmarkt','getraenkemarkt','getränkemarkt','getraenke hoffmann','getränke hoffmann']},
    {id:'c_restaurant',names:['restaurant'],confidence:.98,patterns:['restaurant','bistro','gasthaus','gaststaette','gaststätte','pizzeria','trattoria','steakhouse','imbiss','mcdonald','burger king','kfc','subway','domino','lieferando','wolt','starbucks','cafe','café','baeckerei','bäckerei']},
    {id:'c_subs',names:['abos & vertraege','abos & verträge','abos','vertraege','verträge'],confidence:.98,patterns:['vodafone','deutsche telekom','telekom','telefonica','o2','1und1','1&1','congstar','freenet','mobilcom','netflix','spotify','disney','dazn','sky deutschland','youtube premium','amazon prime','apple com bill','google one','google storage','dropbox','adobe','microsoft 365']},
    {id:'c_health',names:['gesundheit'],confidence:.98,patterns:['praxis','arzt','aerzte','ärzte','zahnarzt','apotheke','physio','physiotherapie','klinik','krankenhaus','sanitaetshaus','sanitätshaus','labor','orthopaed','orthopäd','therapiezentrum','optiker']},
    {id:'c_fuel',names:['tanken'],confidence:.99,patterns:['aral','shell','esso','jet tank','jet station','totalenergies','total station','hem tank','avia','tankstelle','autohof']},
    {id:'c_mob',names:['mobilitaet','mobilität'],confidence:.95,patterns:['deutsche bahn','db vertrieb','flixbus','uber','bolt','taxi','parkhaus','parking','parkster','easypark','verkehrsbetrieb','bus ticket','bahn ticket']},
    {id:'c_home',names:['wohnen'],confidence:.95,patterns:['stadtwerke','e on','eon energie','vattenfall','enercity','stromabschlag','gasabschlag','wasserverband','miete','hausrate','nebenkosten','grundsteuer','rundfunkbeitrag']},
    {id:'c_ins',names:['versicherungen'],confidence:.97,patterns:['allianz','huk','huk24','axa','r+v','ruv','vhv','devk','ergo versicherung','signal iduna','versicherung','versicherungsbeitrag']},
    {id:'c_clothes',names:['kleidung'],confidence:.97,patterns:['zalando','about you','h&m','hm com','c&a','new yorker','takko','kik textil','peek & cloppenburg','peek und cloppenburg','snipes','deichmann','breuninger']},
    {id:'c_kids',names:['kinder'],confidence:.94,patterns:['kindergarten','kita','kinderkrippe','hort','schulessen','schulverein','tonies','mytoys','babyone']},
    {id:'c_debt',names:['kredite'],confidence:.94,patterns:['darlehensrate','kreditrate','kredittilgung','baufinanzierung','ratenkredit']},
    {id:'c_leisure',names:['freizeit'],confidence:.91,patterns:['kino','cinema','bowling','freizeitpark','zoo','museum','ticketmaster','eventim','steamgames','playstation network','nintendo eshop']},
    {id:'c_other',names:['sonstiges'],confidence:.79,patterns:['amazon','paypal','dm drogerie','rossmann','mueller drogerie','müller drogerie','ikea','obi','hornbach','bauhaus']}
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
  function classifyKnowledge(text,type='expense'){
    const n=words(text);
    if(type==='income'){
      if(['gehalt','lohn','salary','payroll','arbeitsentgelt','lohnabrechnung'].some(p=>contains(n,p)))return {categoryId:categoryId('c_income_salary',['gehalt']),confidence:.99,reason:'income-salary'};
      return {categoryId:fallbackCategory('income'),confidence:.8,reason:'income-other'};
    }
    for(const rule of rules){if(rule.patterns.some(p=>contains(n,p))){const id=categoryId(rule.id,rule.names);if(id)return {categoryId:id,confidence:rule.confidence,reason:`knowledge:${rule.id}`}}}
    return {categoryId:fallbackCategory('expense'),confidence:.55,reason:'expense-fallback'};
  }
  function categorizeTransaction(input={}){
    const type=input.type==='income'?'income':'expense';
    const raw=[input.merchant,input.title,input.note,input.remittance,input.reference].filter(Boolean).join(' ');
    const merchant=merchantAlias(input.merchant||input.title||raw);
    const searchable=`${merchant} ${raw}`;
    const manual=manualRule(searchable);
    if(manual)return {categoryId:manual.categoryId||fallbackCategory(type),merchant:manual.merchant||merchant,confidence:1,reason:'manual-rule',source:'manual'};
    const smart=classifyKnowledge(searchable,type);
    if(smart.confidence>=.84)return {...smart,merchant,source:'smart'};
    const learned=learnedRule(merchant);
    if(learned)return {categoryId:learned.categoryId||fallbackCategory(type),merchant:learned.merchant||merchant,confidence:Number(learned.confidence||.8),reason:'learned-rule',source:'learned'};
    return {...smart,categoryId:smart.categoryId||fallbackCategory(type),merchant,source:'fallback'};
  }

  window.applyMerchantRule=function(title,draft={}){
    const raw=`${title||''} ${draft.merchant||''} ${draft.note||''} ${draft.remittance||''} ${draft.reference||''}`;
    const manual=manualRule(raw);
    const base=typeof baseApply==='function'?baseApply(title,draft):{...draft};
    if(manual)return {...base,categoryId:manual.categoryId||fallbackCategory(draft.type),accountId:manual.accountId||base.accountId,merchant:manual.merchant||base.merchant||merchantAlias(title),categorySource:'manual',categoryConfidence:1,categoryReason:'manual-rule'};
    const smart=categorizeTransaction({title,merchant:draft.merchant,note:draft.note,remittance:draft.remittance,reference:draft.reference,type:draft.type});
    return {...base,categoryId:smart.categoryId||fallbackCategory(draft.type),merchant:smart.merchant||base.merchant||merchantAlias(title),categorySource:smart.source,categoryConfidence:smart.confidence,categoryReason:smart.reason};
  };

  function repairLearnedRules(){
    let changed=0;
    for(const r of data.merchantRules||[]){
      if(!r.learned||r.active===false)continue;
      const smart=classifyKnowledge(`${r.merchant||''} ${r.pattern||''}`,'expense');
      if(smart.confidence>=.84&&smart.categoryId&&r.categoryId!==smart.categoryId){r.categoryId=smart.categoryId;r.confidence=Math.max(Number(r.confidence||0),smart.confidence);r.correctedBy='smart-knowledge';r.updatedAt=new Date().toISOString();changed++}
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
      const suspicious=!t.categoryId||currentName==='kleidung'||currentName==='sonstiges'||t.categorySource==='fallback'||t.categorySource==='smart'||!t.categorySource;
      if(onlySuspicious&&!suspicious)continue;
      const smart=categorizeTransaction({title:t.title,merchant:t.sourceMerchant||t.merchant,note:t.note,remittance:t.remittance,reference:t.reference,type:t.type});
      const target=smart.categoryId||fallbackCategory(t.type);
      if(!target)continue;
      if(smart.confidence>=.84||(suspicious&&smart.confidence>=.55)){
        if(t.categoryId!==target||t.merchant!==smart.merchant||t.categorySource!==smart.source){t.categoryId=target;t.merchant=smart.merchant||t.merchant;t.categorySource=smart.source;t.categoryConfidence=smart.confidence;t.categoryReason=smart.reason;changed++}
      }
    }
    return changed;
  }

  function postImport(){
    const recategorized=reclassifyImportedTransactions({onlySuspicious:true});
    const repaired=repairLearnedRules();
    const base=basePost?basePost():{};
    return {...(base||{}),recategorized,repaired};
  }

  const api={categorizeTransaction,classifyKnowledge,merchantAlias,reclassifyImportedTransactions,repairLearnedRules,postImport,fallbackCategory};
  window.FinanzCategoryIntelligence=api;
  if(window.FinanzIntelligence)window.FinanzIntelligence.postImport=postImport;
})();
