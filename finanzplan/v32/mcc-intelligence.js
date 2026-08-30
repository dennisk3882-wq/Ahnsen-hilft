'use strict';
(function(){
  const api=window.FinanzCategoryIntelligence;
  if(!api)return;

  const baseCategorize=api.categorizeTransaction?.bind(api);
  const baseReclassify=api.reclassifyImportedTransactions?.bind(api);
  const baseApply=window.applyMerchantRule;
  const norm=s=>FinanceLib.normalizeText(String(s||''));

  const groups=[
    {id:'c_food',names:['lebensmittel'],confidence:.995,codes:['5300','5411','5422','5441','5451','5462','5499']},
    {id:'c_restaurant',names:['restaurant'],confidence:.995,codes:['5811','5812','5813','5814']},
    {id:'c_fuel',names:['tanken'],confidence:.995,codes:['5541','5542','5983']},
    {id:'c_subs',names:['abos & vertraege','abos & verträge','abos','vertraege','verträge'],confidence:.99,codes:['4812','4814','4816','4899']},
    {id:'c_ins',names:['versicherungen'],confidence:.99,codes:['5960','6300']},
    {id:'c_kids',names:['kinder'],confidence:.93,codes:['5945']},
    {id:'c_mob',names:['mobilitaet','mobilität'],confidence:.985,codes:['4111','4112','4121','4131','4411','4457','4468','4511','4582','4722','4784','4789','7512','7513','7519','7523']},
    {id:'c_home',names:['wohnen'],confidence:.97,codes:['4900','5200','5211','5231','5251','5261','5712','5713','5714','5718','5719']},
    {id:'c_leisure',names:['freizeit'],confidence:.96,codes:['7832','7841','7911','7922','7929','7932','7933','7941','7991','7992','7993','7994','7996','7997','7998','7999']}
  ];

  const ranges=[
    {from:5611,to:5699,id:'c_clothes',names:['kleidung'],confidence:.985},
    {from:8011,to:8099,id:'c_health',names:['gesundheit'],confidence:.99}
  ];

  function normalizeMcc(value){
    const digits=String(value||'').replace(/\D/g,'');
    return digits.length>=4?digits.slice(0,4):'';
  }
  function categoryId(id,names=[]){
    if((data.categories||[]).some(c=>c.id===id))return id;
    const wanted=names.map(norm);
    return (data.categories||[]).find(c=>wanted.includes(norm(c.name)))?.id||'';
  }
  function classifyMcc(value,type='expense'){
    if(type==='income')return null;
    const mcc=normalizeMcc(value);if(!mcc)return null;
    const exact=groups.find(g=>g.codes.includes(mcc));
    const numeric=Number(mcc),range=Number.isFinite(numeric)?ranges.find(r=>numeric>=r.from&&numeric<=r.to):null;
    const hit=exact||range;if(!hit)return null;
    const id=categoryId(hit.id,hit.names);if(!id)return null;
    return {mcc,categoryId:id,confidence:hit.confidence,reason:`mcc:${mcc}`,source:'mcc'};
  }

  function categorizeTransaction(input={}){
    const base=baseCategorize?baseCategorize(input):{};
    if(base?.source==='manual')return base;
    const hit=classifyMcc(input.mcc,input.type);
    if(!hit)return base;
    return {...base,...hit,merchant:base?.merchant||input.merchant||input.title||''};
  }

  if(typeof baseApply==='function')window.applyMerchantRule=function(title,draft={}){
    const result=baseApply(title,draft);
    if(result?.categorySource==='manual')return result;
    const hit=classifyMcc(draft.mcc,draft.type);
    if(!hit)return result;
    return {...result,categoryId:hit.categoryId,categorySource:'mcc',categoryConfidence:hit.confidence,categoryReason:hit.reason,mcc:hit.mcc};
  };

  function reclassifyMccTransactions(){
    let changed=0;
    for(const t of data.transactions||[]){
      const imported=t.source==='n26'||(t.tags||[]).includes('n26')||t.source==='bank';
      if(!imported||!t.mcc||t.categorySource==='manual'||t.categoryLocked===true)continue;
      const hit=classifyMcc(t.mcc,t.type);if(!hit)continue;
      if(t.categoryId!==hit.categoryId||t.categorySource!=='mcc'||Number(t.categoryConfidence||0)!==hit.confidence){
        t.categoryId=hit.categoryId;t.categorySource='mcc';t.categoryConfidence=hit.confidence;t.categoryReason=hit.reason;changed++;
      }
    }
    return changed;
  }

  api.categorizeTransaction=categorizeTransaction;
  api.classifyMcc=classifyMcc;
  api.normalizeMcc=normalizeMcc;
  api.reclassifyMccTransactions=reclassifyMccTransactions;
  if(baseReclassify)api.reclassifyImportedTransactions=function(options={}){return Number(baseReclassify(options)||0)+reclassifyMccTransactions()};
  window.FinanzMCC={classify:classifyMcc,normalize:normalizeMcc,reclassify:reclassifyMccTransactions};
})();
