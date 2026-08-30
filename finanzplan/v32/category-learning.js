'use strict';
(function(){
  const norm=s=>FinanceLib.normalizeText(String(s||''));
  const words=s=>norm(s).replace(/[^a-z0-9äöüß&]+/gi,' ').replace(/\s+/g,' ').trim();
  const CASH_CATEGORY_ID='c_cash';
  const CASH_CATEGORY_NAME='Bargeldabhebung';
  const ambiguousMerchants=['amazon','paypal','klarna','ebay','sumup','stripe','adyen','mollie','apple com bill','google pay','google payments','pmnt','payment','card payment','kartenzahlung','pos payment','n26 payment'];
  const cashPatterns=['bargeldabhebung','bargeld abhebung','bargeldauszahlung','barabhebung','bar abhebung','geldautomat','atm withdrawal','atm cash','cash withdrawal','cashwithdrawal','cash out','cashout','cash dispenser','cash machine','withdrawal'];

  function ensureCashCategory(){
    data.categories=Array.isArray(data.categories)?data.categories:[];
    const existing=data.categories.find(c=>c.id===CASH_CATEGORY_ID)||data.categories.find(c=>['bargeldabhebung','bargeld abgehoben'].includes(words(c.name)));
    if(existing)return existing.id;
    data.categories.push({id:CASH_CATEGORY_ID,name:CASH_CATEGORY_NAME,kind:'expense',parent:null,color:'#64748b'});
    return CASH_CATEGORY_ID;
  }
  function cashCategoryId(){return ensureCashCategory()}
  function detectCashWithdrawal(input={}){
    if(input.type==='income')return '';
    const raw=[input.merchant,input.title,input.note,input.remittance,input.reference,input.bankCode,input.bankCodeDescription,input.transactionType,input.transactionSubType,input.additionalInfo].filter(Boolean).join(' ');
    const n=words(raw);
    return cashPatterns.find(p=>n.includes(words(p)))||((` ${n} `).includes(' atm ')?'atm':'');
  }

  const categoryApi=globalThis.FinanzCategoryIntelligence;
  const baseCategorize=categoryApi?.categorizeTransaction?.bind(categoryApi);
  if(categoryApi&&baseCategorize&&!categoryApi.__cashWithdrawalPatched){
    categoryApi.categorizeTransaction=function(input={}){
      const evidence=detectCashWithdrawal(input);
      if(evidence){
        const categoryId=cashCategoryId();
        const merchant=categoryApi.merchantAlias?.(input.merchant||input.title||'')||String(input.merchant||input.title||'Bargeldabhebung');
        return {categoryId,merchant,confidence:.995,reason:`cash-withdrawal:${evidence}`,source:'cash',mcc:categoryApi.normalizeMcc?.(input.mcc)||''};
      }
      return baseCategorize(input);
    };
    categoryApi.__cashWithdrawalPatched=true;
  }

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
    // is unknown, generic or a multi-purpose marketplace/payment processor that should not be learned globally.
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
      ensureCashCategory();
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
          else if(learned.reason==='ambiguous-merchant')toast(`${learned.merchant}: Nur diese Buchung wurde fest korrigiert, weil keine eindeutige dauerhafte Händlerzuordnung möglich ist.`,'success');
        }
        return out;
      };
      return result;
    };
  }

  ensureCashCategory();
  window.FinanzCategoryLearning={rememberCorrection,forgetCorrection,merchantFor,isAmbiguousMerchant,ensureCashCategory,cashCategoryId,detectCashWithdrawal};
})();