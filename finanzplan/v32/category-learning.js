'use strict';
(function(){
  const norm=s=>FinanceLib.normalizeText(String(s||''));
  const words=s=>norm(s).replace(/[^a-z0-9äöüß&]+/gi,' ').replace(/\s+/g,' ').trim();

  function merchantFor(tx={}){
    const raw=tx.sourceMerchant||tx.merchant||tx.title||'';
    return globalThis.FinanzCategoryIntelligence?.merchantAlias?.(raw)||globalThis.FinanzIntelligence?.canonicalMerchant?.(raw)||String(raw).trim();
  }

  function keyFor(raw){return words(globalThis.FinanzCategoryIntelligence?.merchantAlias?.(raw)||raw)}

  function rememberCorrection(tx,categoryId,{reclassify=true}={}){
    if(!tx||!categoryId)return {saved:false,reason:'missing-data'};
    const merchant=merchantFor(tx),key=keyFor(merchant);
    if(!key||key==='unbekannt')return {saved:false,reason:'unknown-merchant'};
    if(!(data.categories||[]).some(c=>c.id===categoryId))return {saved:false,reason:'unknown-category'};

    data.merchantRules=Array.isArray(data.merchantRules)?data.merchantRules:[];
    let rule=data.merchantRules.find(r=>r.userCorrection===true&&keyFor(r.merchant||r.pattern||'')===key);
    if(!rule){
      rule={id:uid('mr'),pattern:merchant,merchant,categoryId,accountId:'',active:true,learned:false,userCorrection:true,confidence:1,hits:1,createdAt:new Date().toISOString()};
      data.merchantRules.push(rule);
    }else{
      rule.pattern=merchant;rule.merchant=merchant;rule.categoryId=categoryId;rule.active=true;rule.learned=false;rule.userCorrection=true;rule.confidence=1;rule.hits=Number(rule.hits||0)+1;rule.updatedAt=new Date().toISOString();
    }

    tx.categoryId=categoryId;
    tx.categoryLocked=true;
    tx.categorySource='manual';
    tx.categoryConfidence=1;
    tx.categoryReason='user-correction';

    const changed=reclassify?(globalThis.FinanzCategoryIntelligence?.reclassifyImportedTransactions?.({onlySuspicious:false})||0):0;
    return {saved:true,merchant,categoryId,changed,ruleId:rule.id};
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
        }
        return out;
      };
      return result;
    };
  }

  window.FinanzCategoryLearning={rememberCorrection,forgetCorrection,merchantFor};
})();