'use strict';
(function(){
  const norm=s=>FinanceLib.normalizeText(String(s||''));
  const words=s=>norm(s).replace(/[^a-z0-9äöüß&]+/gi,' ').replace(/\s+/g,' ').trim();
  const ambiguousMerchants=['amazon','paypal','klarna','ebay','sumup','stripe','adyen','mollie','apple com bill','google pay','google payments'];

  function merchantFor(tx={}){
    const raw=tx.sourceMerchant||tx.merchant||tx.title||'';
    return globalThis.FinanzCategoryIntelligence?.merchantAlias?.(raw)||globalThis.FinanzIntelligence?.canonicalMerchant?.(raw)||String(raw).trim();
  }

  function keyFor(raw){return words(globalThis.FinanzCategoryIntelligence?.merchantAlias?.(raw)||raw)}
  function isAmbiguousMerchant(raw){
    const key=keyFor(raw);
    return ambiguousMerchants.some(p=>key===words(p)||key.startsWith(`${words(p)} `)||key.includes(` ${words(p)} `));
  }
  function lockTransaction(tx,categoryId,reason='user-correction'){
    tx.categoryId=categoryId;
    tx.categoryLocked=true;
    tx.categorySource='manual';
    tx.categoryConfidence=1;
    tx.categoryReason=reason;
  }

  function rememberCorrection(tx,categoryId,{reclassify=true}={}){
    if(!tx||!categoryId)return {saved:false,reason:'missing-data'};
    if(!(data.categories||[]).some(c=>c.id===categoryId))return {saved:false,reason:'unknown-category'};

    const merchant=merchantFor(tx),key=keyFor(merchant);
    // The individual correction must always survive a future bank sync, even when the merchant
    // is unknown or a multi-purpose marketplace/payment processor that should not be learned globally.
    lockTransaction(tx,categoryId);
    if(!key||key==='unbekannt')return {saved:false,locked:true,merchant,categoryId,reason:'unknown-merchant'};
    if(isAmbiguousMerchant(merchant))return {saved:false,locked:true,merchant,categoryId,reason:'ambiguous-merchant'};

    data.merchantRules=Array.isArray(data.merchantRules)?data.merchantRules:[];
    let rule=data.merchantRules.find(r=>r.userCorrection===true&&keyFor(r.merchant||r.pattern||'')===key);
    if(!rule){
      rule={id:uid('mr'),pattern:merchant,merchant,categoryId,accountId:'',active:true,learned:false,userCorrection:true,confidence:1,hits:1,createdAt:new Date().toISOString()};
      data.merchantRules.push(rule);
    }else{
      rule.pattern=merchant;rule.merchant=merchant;rule.categoryId=categoryId;rule.active=true;rule.learned=false;rule.userCorrection=true;rule.confidence=1;rule.hits=Number(rule.hits||0)+1;rule.updatedAt=new Date().toISOString();
    }

    const changed=reclassify?(globalThis.FinanzCategoryIntelligence?.reclassifyImportedTransactions?.({onlySuspicious:false})||0):0;
    return {saved:true,locked:true,merchant,categoryId,changed,ruleId:rule.id};
  }

  function forgetCorrection(txOrMerchant){
    const raw=typeof txOrMerchant==='string'?txOrMerchant:merchantFor(txOrMerchant||{}),key=keyFor(raw);
    if(!key)return 0;
    const before=(data.merchantRules||[]).length;
    data.merchantRules=(data.merchantRules||[]).filter(r=>!(r.userCorrection===true&&keyFor(r.merchant||r.pattern||'')===key));
    return before-data.merchantRules.length;
  }

  const baseOpen=window.openTransactionModal;
  if(typeof baseOpen==='function'){
    window.openTransactionModal=function(t=null,preset={}){
      const originalCategory=t?.categoryId||'';
      const imported=!!t&&(t.source==='n26'||t.source==='bank'||(t.tags||[]).includes('n26'));
      const result=baseOpen(t,preset);
      const form=document.querySelector('#txForm');
      if(!form||!t)return result;
      const originalSubmit=form.onsubmit;
      form.onsubmit=function(e){
        const chosen=String(form.elements.categoryId?.value||'');
        const categoryChanged=chosen&&chosen!==originalCategory;
        const out=originalSubmit?.call(this,e);
        if(categoryChanged){
          const learned=rememberCorrection(t,chosen,{reclassify:imported});
          saveData(learned.saved?`Kategorie für ${learned.merchant} dauerhaft gelernt`:'Kategorie manuell gespeichert');
          if(learned.saved)toast(`Künftige Buchungen von ${learned.merchant} werden automatisch so kategorisiert.`,'success');
          else if(learned.reason==='ambiguous-merchant')toast(`${learned.merchant}: Nur diese Buchung wurde fest korrigiert, weil der Anbieter viele unterschiedliche Käufe bündelt.`,'success');
        }
        return out;
      };
      return result;
    };
  }

  window.FinanzCategoryLearning={rememberCorrection,forgetCorrection,merchantFor,isAmbiguousMerchant};
})();