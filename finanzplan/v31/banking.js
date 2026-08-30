'use strict';
(function(){
  function conf(){data.integrations=data.integrations||{};const n=data.integrations.n26=data.integrations.n26||{};n.backendUrl=n.backendUrl||data.integrations.backendUrl||'';return n}
  const backend=()=>String(conf().backendUrl||'').replace(/\/$/,'');
  async function token(){return (await FinanzCloud?.getSession?.())?.access_token||''}
  async function req(path,{method='GET',body}={}){const base=backend();if(!base)throw new Error('Backend-URL fehlt');const t=await token(),r=await fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:body?JSON.stringify(body):undefined}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(typeof j.error==='object'?JSON.stringify(j.error):j.error||j.message||`Bank-API ${r.status}`);return j}
  async function status(){return req('/api/banking/status')}
  async function start(){const s=await FinanzCloud?.getSession?.(),householdId=data.integrations?.cloud?.householdId||'';if(!s?.access_token)throw new Error('Für N26-Verbindung zuerst bei Cloud anmelden');if(!householdId)throw new Error('Bitte zuerst einen Cloud-Haushalt auswählen');const redirectUrl=`${location.origin}${location.pathname}`,j=await req('/api/banking/n26/start',{method:'POST',body:{redirectUrl,householdId,psuId:s.user?.id||'finanzplan-user'}});sessionStorage.setItem('finanzplan:n26:state',j.state||'');location.href=j.url;return j}
  async function handleCallback(){const u=new URL(location.href),code=u.searchParams.get('code'),state=u.searchParams.get('state');if(!code||(!u.searchParams.get('bank_callback')&&!state))return false;const expected=sessionStorage.getItem('finanzplan:n26:state');if(expected&&state&&expected!==state)throw new Error('N26-State stimmt nicht überein');const j=await req('/api/banking/n26/exchange',{method:'POST',body:{code,state,householdId:data.integrations?.cloud?.householdId||''}});conf().sessionReady=true;conf().accounts=j.accounts||[];conf().lastAuthorizedAt=new Date().toISOString();sessionStorage.removeItem('finanzplan:n26:state');history.replaceState({},'',location.pathname);saveData('N26 erfolgreich verbunden');return true}
  function ensureLocalAccount(bankRows=[]){
    const n=conf(),selected=data.accounts?.find(a=>a.id===n.localAccountId);if(selected)return selected;
    if((data.accounts||[]).length===1){n.localAccountId=data.accounts[0].id;return data.accounts[0]}
    if((data.accounts||[]).length>1)throw new Error('Bitte das lokale Konto auswählen, dem N26 zugeordnet werden soll');
    const dates=(bankRows||[]).map(t=>FinanceLib.normalizeDate(t.date)).filter(Boolean).sort(),first=dates[0]||localISO(new Date());let d=FinanceLib.parseISO(first)||new Date();d.setDate(d.getDate()-1);
    const account={id:uid('acc'),name:'N26 Girokonto',type:'checking',openingBalance:0,openingDate:localISO(d),includeNetWorth:true,spendable:true,source:'n26'};
    data.accounts.push(account);n.localAccountId=account.id;return account;
  }
  function safeFallbackCategory(type){
    const smart=globalThis.FinanzCategoryIntelligence?.fallbackCategory?.(type);
    if(smart)return smart;
    const id=type==='income'?'c_income_other':'c_other';
    const name=type==='income'?'weitere einnahmen':'sonstiges';
    return data.categories?.find(c=>c.id===id)?.id||data.categories?.find(c=>FinanceLib.normalizeText(c.name)===name)?.id||'';
  }
  function txFromBank(t){
    const amount=Math.abs(num(t.amount)),type=t.direction==='credit'?'income':'expense',accountId=conf().localAccountId||data.accounts?.[0]?.id||'',title=t.merchant||t.title||t.remittance||'N26 Umsatz',note=t.remittance||t.reference||'',mcc=globalThis.FinanzCategoryIntelligence?.normalizeMcc?.(t.mcc)||String(t.mcc||'');
    const smart=globalThis.FinanzCategoryIntelligence?.categorizeTransaction?.({title,merchant:t.merchant,note,remittance:t.remittance,reference:t.reference,type,mcc})||null;
    const draft=applyMerchantRule(title,{categoryId:smart?.categoryId||safeFallbackCategory(type),accountId,type,merchant:t.merchant||'',note,remittance:t.remittance||'',reference:t.reference||'',mcc});
    const merchant=draft.merchant||smart?.merchant||globalThis.FinanzIntelligence?.canonicalMerchant?.(t.merchant||title)||t.merchant||'';
    const categoryId=data.categories.find(c=>c.id===draft.categoryId)?.id||safeFallbackCategory(type);
    const tx={id:uid('tx'),date:FinanceLib.normalizeDate(t.date)||localISO(new Date()),title,merchant,sourceMerchant:t.merchant||'',amount,type,categoryId,accountId:draft.accountId||accountId,memberId:data.members?.[0]?.id||'',status:'paid',note,tags:['n26'],source:'n26',externalId:t.id||t.reference||'',mcc,categorySource:draft.categorySource||smart?.source||'fallback',categoryConfidence:Number(draft.categoryConfidence??smart?.confidence??0),categoryReason:draft.categoryReason||smart?.reason||''};tx.fingerprint=transactionFingerprint(tx);return tx
  }
  function enrichExisting(existing,fresh){
    let changed=false;
    for(const key of ['mcc','sourceMerchant']){if(fresh[key]&&existing[key]!==fresh[key]){existing[key]=fresh[key];changed=true}}
    if(!existing.note&&fresh.note){existing.note=fresh.note;changed=true}
    if(existing.categorySource!=='manual'&&existing.categoryLocked!==true){
      const smart=globalThis.FinanzCategoryIntelligence?.categorizeTransaction?.({title:existing.title||fresh.title,merchant:existing.sourceMerchant||fresh.sourceMerchant||existing.merchant,note:existing.note||fresh.note,remittance:existing.note||fresh.note,reference:existing.externalId||fresh.externalId,type:existing.type||fresh.type,mcc:existing.mcc||fresh.mcc});
      if(smart?.categoryId&&(existing.categoryId!==smart.categoryId||existing.merchant!==smart.merchant||existing.categorySource!==smart.source||Number(existing.categoryConfidence||0)!==Number(smart.confidence||0))){existing.categoryId=smart.categoryId;existing.merchant=smart.merchant||existing.merchant;existing.categorySource=smart.source;existing.categoryConfidence=smart.confidence;existing.categoryReason=smart.reason;changed=true}
    }
    return changed;
  }
  async function sync({days=180,reconcile=true}={}){const householdId=data.integrations?.cloud?.householdId||'';if(!householdId)throw new Error('Kein Cloud-Haushalt gewählt');const qs=new URLSearchParams({days:String(Math.max(1,Math.min(730,days))),householdId}),j=await req(`/api/banking/n26/sync?${qs}`),bankRows=j.transactions||[];ensureLocalAccount(bankRows);const rows=bankRows.map(txFromBank);let added=0,enriched=0;for(const tx of rows){const existing=tx.externalId?data.transactions.find(x=>x.externalId===tx.externalId):null;if(existing){if(enrichExisting(existing,tx))enriched++;continue}if(isDuplicateTransaction(tx))continue;data.transactions.push(tx);added++}const recategorized=globalThis.FinanzCategoryIntelligence?.reclassifyImportedTransactions?.({onlySuspicious:false})||0;if(reconcile&&Number.isFinite(Number(j.balance))&&typeof reconcileAccount==='function'){try{reconcileAccount(conf().localAccountId,Number(j.balance),localISO(new Date()),'N26 PSD2-Abgleich',false)}catch(e){console.warn(e)}}conf().lastSync=new Date().toISOString();conf().lastBalance=j.balance;detectSubscriptionSuggestions?.();saveData(`N26: ${added} neu, ${enriched} mit Bankdaten angereichert, ${recategorized} neu kategorisiert`);return {added,enriched,recategorized,total:rows.length,balance:j.balance}}
  window.FinanzN26={conf,status,start,handleCallback,sync,txFromBank,ensureLocalAccount,enrichExisting,req};
})();
