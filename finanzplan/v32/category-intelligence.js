'use strict';
(function(){
  const norm=s=>FinanceLib.normalizeText(String(s||''));
  const baseApply=window.applyMerchantRule;
  const basePost=window.FinanzIntelligence?.postImport?.bind(window.FinanzIntelligence);
  const canonical=raw=>window.FinanzIntelligence?.canonicalMerchant?.(raw)||String(raw||'').trim()||'Unbekannt';

  const aliases=[
    ['edeka','EDEKA'],['penny','PENNY'],['rewe','REWE'],['aldi','ALDI'],['lidl','Lidl'],['netto','Netto'],['kaufland','Kaufland'],['marktkauf','Marktkauf'],['nahkauf','nahkauf'],['tegut','tegut'],['famila','famila'],['combi','Combi'],
    ['vodafone','Vodafone'],['telekom','Telekom'],['telefonica','O2'],['o2','O2'],['1und1','1&1'],['1&1','1&1'],
    ['mcdonald','McDonald’s'],['burger king','Burger King'],['lieferando','Lieferando'],['dominos','Domino’s'],['subway','Subway'],['starbucks','Starbucks'],
    ['aral','Aral'],['shell','Shell'],['esso','Esso'],['totalenergies','TotalEnergies'],['total','TotalEnergies'],['hem','HEM'],['avia','AVIA'],
    ['dm drogerie','dm'],['rossmann','Rossmann'],['mueller drogerie','Müller'],
    ['amazon','Amazon'],['zalando','Zalando'],['about you','ABOUT YOU'],['h&m','H&M'],['hm.com','H&M'],['c&a','C&A'],['new yorker','New Yorker'],['takko','Takko'],['kik','KiK'],
    ['netflix','Netflix'],['spotify','Spotify'],['disney','Disney+'],['sky','Sky'],['dazn','DAZN'],['youtube','YouTube'],
    ['deutsche bahn','Deutsche Bahn'],['db vertrieb','Deutsche Bahn'],['uber','Uber'],['bolt','Bolt']
  ];

  const rules=[
    {id:'c_food',names:['lebensmittel'],confidence:.99,patterns:['edeka','penny','rewe','aldi','lidl','netto','kaufland','marktkauf','nahkauf','tegut','famila','combi','supermarkt','lebensmittelmarkt','getraenkemarkt','getränkemarkt']},
    {id:'c_restaurant',names:['restaurant'],confidence:.98,patterns:['restaurant','bistro','gasthaus','gaststaette','gaststätte','pizzeria','trattoria','steakhouse','imbiss','mcdonald','burger king','kfc','subway','domino','lieferando','wolt','starbucks','cafe','café','baeckerei','bäckerei']},
    {id:'c_subs',names:['abos & vertraege','abos & verträge','abos','vertraege','verträge'],confidence:.98,patterns:['vodafone','telekom','telefonica','o2','1und1','1&1','netflix','spotify','disney','dazn','sky deutschland','youtube premium','amazon prime','apple.com/bill','google storage','dropbox','adobe','microsoft 365']},
    {id:'c_health',names:['gesundheit'],confidence:.98,patterns:['praxis','arzt','aerzte','ärzte','zahnarzt','apotheke','physio','physiotherapie','klinik','krankenhaus','sanitaetshaus','sanitätshaus','labor','orthopaed','orthopäd','therapiezentrum']},
    {id:'c_fuel',names:['tanken'],confidence:.99,patterns:['aral','shell','esso','jet tank','totalenergies','total station','hem tank','avia','tankstelle','autohof']},
    {id:'c_mob',names:['mobilitaet','mobilität'],confidence:.94,patterns:['deutsche bahn','db vertrieb','flixbus','uber','bolt','parkhaus','parking','parkster','easypark','verkehrsbetrieb','bus ticket','bahn ticket']},
    {id:'c_home',names:['wohnen'],confidence:.94,patterns:['stadtwerke','e.on','eon energie','vattenfall','enercity','strom','gasabschlag','wasserverband','miete','hausrate','nebenkosten','grundsteuer','rundfunkbeitrag']},
    {id:'c_ins',names:['versicherungen'],confidence:.97,patterns:['allianz','huk','huk24','axa','r+v','ruv','vhv','devk','ergo versicherung','signal iduna','versicherung','versicherungsbeitrag']},
    {id:'c_clothes',names:['kleidung'],confidence:.97,patterns:['zalando','about you','h&m','hm.com','c&a','new yorker','takko','kik textil','peek & cloppenburg','peek und cloppenburg','snipes','deichmann','breuninger']},
    {id:'c_kids',names:['kinder'],confidence:.94,patterns:['kindergarten','kita','kinderkrippe','hort','schulessen','schulverein','tonies','mytoys','babyone']},
    {id:'c_debt',names:['kredite'],confidence:.93,patterns:['darlehensrate','kreditrate','kredittilgung','baufinanzierung','ratenkredit']},
    {id:'c_leisure',names:['freizeit'],confidence:.9,patterns:['kino','cinema','bowling','freizeitpark','zoo','museum','ticketmaster','eventim','steamgames','playstation network','nintendo eshop']},
    {id:'c_other',names:['sonstiges'],confidence:.78,patterns:['amazon','paypal','dm drogerie','rossmann','mueller drogerie','müller drogerie','ikea','obi','hornbach','bauhaus']}
  ];

  function categoryId(id,names=[]){
    if((data.categories||[]).some(c=>c.id===id))return id;
    const wanted=names.map(norm);
    return (data.categories||[]).find(c=>wanted.includes(norm(c.name)))?.id||'';
  }
  function phrase(raw){return norm(raw).replace(/\s+/g,' ').trim()}
  function containsPhrase(text,needle){
    const t=phrase(text),p=phrase(needle);
    return !!p&&!!t&&(` ${t} `).includes(` ${p} `);
  }
  function merchantAlias(raw){
    const n=phrase(raw);
    for(const [needle,name] of aliases)if(containsPhrase(n,needle))return name;
    return canonical(raw);
  }
  function merchantKey(raw){return phrase(merchantAlias(raw))}
  function matches(pattern,text){return containsPhrase(text,pattern)}
  function manualRule(text){
    const n=norm(text);
    return (data.merchantRules||[]).filter(r=>r.active!==false&&!r.learned&&r.categoryId).sort((a,b)=>String(b.pattern||'').length-String(a.pattern||'').length).find(r=>{
      const p=norm(r.pattern||r.merchant||'');return p&&(n.includes(p)||p.includes(n));
    })||null;
  }
  function learnedRule(merchant){
    const key=merchantKey(merchant);
    if(!key||key==='unbekannt')return null;
    return (data.merchantRules||[]).filter(r=>r.active!==false&&r.learned&&r.categoryId&&Number(r.confidence||0)>=.8).sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0)).find(r=>{
      const ruleKey=merchantKey(r.merchant||r.pattern||'');
      if(!ruleKey||ruleKey.length<3)return false;
      return ruleKey===key;
    })||null;
  }
  function classifyKnowledge(text,type='expense'){
    const n=norm(text);
    if(type==='income'){
      if(/\b(gehalt|lohn|salary|payroll|arbeitsentgelt|lohnabrechnung)\b/.test(n))return {categoryId:categoryId('c_income_salary',['gehalt']),confidence:.99,reason:'income-salary'};
      return {categoryId:categoryId('c_income_other',['weitere einnahmen']),confidence:.8,reason:'income-other'};
    }
    for(const rule of rules){if(rule.patterns.some(p=>matches(p,n))){const id=categoryId(rule.id,rule.names);if(id)return {categoryId:id,confidence:rule.confidence,reason:`knowledge:${rule.id}`}}}
    return {categoryId:categoryId('c_other',['sonstiges']),confidence:.55,reason:'expense-fallback'};
  }
  function categorizeTransaction(input={}){
    const type=input.type==='income'?'income':'expense';
    const raw=[input.merchant,input.title,input.note,input.remittance,input.reference].filter(Boolean).join(' · ');
    const merchant=merchantAlias(input.merchant||input.title||raw);
    const searchable=`${merchant} ${raw}`;
    const manual=manualRule(searchable);
    if(manual)return {categoryId:manual.categoryId,merchant:manual.merchant||merchant,confidence:1,reason:'manual-rule',source:'manual'};
    const smart=classifyKnowledge(searchable,type);
    if(smart.confidence>=.84)return {...smart,merchant,source:'smart'};
    const learned=learnedRule(merchant);
    if(learned)return {categoryId:learned.categoryId,merchant:learned.merchant||merchant,confidence:Number(learned.confidence||.8),reason:'learned-rule',source:'learned'};
    return {...smart,merchant,source:'fallback'};
  }

  window.applyMerchantRule=function(title,draft={}){
    const raw=`${title||''} ${draft.merchant||''} ${draft.note||''} ${draft.remittance||''}`;
    const manual=manualRule(raw);
    const base=typeof baseApply==='function'?baseApply(title,draft):{...draft};
    if(manual)return {...base,categoryId:manual.categoryId,accountId:manual.accountId||base.accountId,merchant:manual.merchant||base.merchant||merchantAlias(title),categorySource:'manual',categoryConfidence:1};
    const smart=categorizeTransaction({title,merchant:draft.merchant,note:draft.note,remittance:draft.remittance,type:draft.type});
    return {...base,categoryId:smart.categoryId||base.categoryId,merchant:smart.merchant||base.merchant||merchantAlias(title),categorySource:smart.source,categoryConfidence:smart.confidence,categoryReason:smart.reason};
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
      const smart=categorizeTransaction({title:t.title,merchant:t.sourceMerchant||t.merchant,note:t.note,type:t.type});
      if(!smart.categoryId)continue;
      const currentName=norm((data.categories||[]).find(c=>c.id===t.categoryId)?.name||'');
      const suspicious=!t.categoryId||currentName==='kleidung'||currentName==='sonstiges'||t.categorySource==='fallback'||t.categorySource==='smart';
      if(onlySuspicious&&!suspicious)continue;
      if(smart.confidence>=.84||(suspicious&&smart.confidence>=.55)){
        if(t.categoryId!==smart.categoryId||t.merchant!==smart.merchant||t.categorySource!==smart.source){t.categoryId=smart.categoryId;t.merchant=smart.merchant||t.merchant;t.categorySource=smart.source;t.categoryConfidence=smart.confidence;t.categoryReason=smart.reason;changed++}
      }
    }
    return changed;
  }

  function postImport(){
    const recategorized=reclassifyImportedTransactions({onlySuspicious:false});
    const repaired=repairLearnedRules();
    const base=basePost?basePost():{};
    return {...(base||{}),recategorized,repaired};
  }

  const api={categorizeTransaction,classifyKnowledge,merchantAlias,reclassifyImportedTransactions,repairLearnedRules,postImport};
  window.FinanzCategoryIntelligence=api;
  if(window.FinanzIntelligence)window.FinanzIntelligence.postImport=postImport;
})();
