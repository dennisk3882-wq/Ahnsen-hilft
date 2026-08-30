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
    const amount=Math.abs(num(t.amount)),type=t.direction==='credit'?'income':'expense',accountId=conf().localAccountId||data.accounts?.[0]?.id||'',title=t.merchant||t.title||t.remittance||t.bankCodeDescription||'N26 Umsatz',note=t.remittance||t.reference||'',mcc=globalThis.FinanzCategoryIntelligence?.normalizeMcc?.(t.mcc)||String(t.mcc||''),bankCode=String(t.bankCode||''),bankSubCode=String(t.bankSubCode||''),bankCodeDescription=String(t.bankCodeDescription||'');
    const smart=globalThis.FinanzCategoryIntelligence?.categorizeTransaction?.({title,merchant:t.merchant,note,remittance:t.remittance,reference:t.reference,type,mcc,bankCode,bankSubCode,bankCodeDescription})||null;
    const draft=applyMerchantRule(title,{categoryId:smart?.categoryId||safeFallbackCategory(type),accountId,type,merchant:t.merchant||'',note,remittance:t.remittance||'',reference:t.reference||'',mcc,bankCode,bankSubCode,bankCodeDescription});
    const merchant=draft.merchant||smart?.merchant||globalThis.FinanzIntelligence?.canonicalMerchant?.(t.merchant||title)||t.merchant||'';
    const categoryId=data.categories.find(c=>c.id===draft.categoryId)?.id||safeFallbackCategory(type);
    const tx={id:uid('tx'),date:FinanceLib.normalizeDate(t.date)||localISO(new Date()),title,merchant,sourceMerchant:t.merchant||'',amount,type,categoryId,accountId:draft.accountId||accountId,memberId:data.members?.[0]?.id||'',status:'paid',note,tags:['n26'],source:'n26',externalId:t.id||t.reference||'',bankReference:t.reference||'',mcc,bankCode,bankSubCode,bankCodeDescription,categorySource:draft.categorySource||smart?.source||'fallback',categoryConfidence:Number(draft.categoryConfidence??smart?.confidence??0),categoryReason:draft.categoryReason||smart?.reason||''};tx.fingerprint=transactionFingerprint(tx);return tx
  }
  function enrichExisting(existing,fresh){
    let changed=false;
    for(const key of ['mcc','sourceMerchant','bankReference','bankCode','bankSubCode','bankCodeDescription']){if(fresh[key]&&existing[key]!==fresh[key]){existing[key]=fresh[key];changed=true}}
    if(!existing.note&&fresh.note){existing.note=fresh.note;changed=true}
    if(existing.categorySource!=='manual'&&existing.categoryLocked!==true){
      const smart=globalThis.FinanzCategoryIntelligence?.categorizeTransaction?.({title:existing.title||fresh.title,merchant:existing.sourceMerchant||fresh.sourceMerchant||existing.merchant,note:existing.note||fresh.note,remittance:existing.note||fresh.note,reference:existing.bankReference||fresh.bankReference||existing.externalId||fresh.externalId,type:existing.type||fresh.type,mcc:existing.mcc||fresh.mcc,bankCode:existing.bankCode||fresh.bankCode,bankSubCode:existing.bankSubCode||fresh.bankSubCode,bankCodeDescription:existing.bankCodeDescription||fresh.bankCodeDescription});
      if(smart?.categoryId&&(existing.categoryId!==smart.categoryId||existing.merchant!==smart.merchant||existing.categorySource!==smart.source||Number(existing.categoryConfidence||0)!==Number(smart.confidence||0))){existing.categoryId=smart.categoryId;existing.merchant=smart.merchant||existing.merchant;existing.categorySource=smart.source;existing.categoryConfidence=smart.confidence;existing.categoryReason=smart.reason;changed=true}
    }
    const freshFingerprint=transactionFingerprint(existing);if(existing.fingerprint!==freshFingerprint){existing.fingerprint=freshFingerprint;changed=true}
    return changed;
  }
  function isN26Transaction(t){return !!t&&(t.source==='n26'||(t.tags||[]).includes('n26'))}
  function merchantIdentity(t){
    const raw=t?.sourceMerchant||t?.merchant||t?.title||'';
    const canonical=globalThis.FinanzCategoryIntelligence?.merchantAlias?.(raw)||globalThis.FinanzIntelligence?.canonicalMerchant?.(raw)||raw;
    return FinanceLib.normalizeText(canonical);
  }
  function n26Signature(t){
    const date=FinanceLib.normalizeDate(t?.date)||'',cents=Math.round(Math.abs(num(t?.amount))*100),type=t?.type||(t?.direction==='credit'?'income':'expense'),accountId=t?.accountId||conf().localAccountId||'';
    return [date,cents,type,merchantIdentity(t),accountId].join('|');
  }
  function sameN26Signature(a,b){return !!a&&!!b&&n26Signature(a)===n26Signature(b)}
  function repairN26Fingerprints(){let changed=0;for(const t of data.transactions||[]){if(!isN26Transaction(t))continue;const fp=transactionFingerprint(t);if(t.fingerprint!==fp){t.fingerprint=fp;changed++}}return changed}
  function candidateScore(t){return (t.categorySource==='manual'||t.categoryLocked===true?100:0)+(t.externalId?10:0)+(t.bankReference?6:0)+(t.sourceMerchant?4:0)+(t.bankCode?2:0)+(t.mcc?1:0)}
  function mergeDuplicateDetails(keep,extra){
    let changed=false;
    if(extra.categorySource==='manual'||extra.categoryLocked===true){if(extra.categoryId&&keep.categoryId!==extra.categoryId){keep.categoryId=extra.categoryId;changed=true}if(keep.categorySource!=='manual'){keep.categorySource='manual';changed=true}if(keep.categoryLocked!==true){keep.categoryLocked=true;changed=true}keep.categoryConfidence=1;keep.categoryReason=extra.categoryReason||'manual'}
    if(Array.isArray(extra.splits)&&extra.splits.length&&!(Array.isArray(keep.splits)&&keep.splits.length)){keep.splits=JSON.parse(JSON.stringify(extra.splits));changed=true}
    if(!keep.note&&extra.note){keep.note=extra.note;changed=true}
    const tags=[...new Set([...(keep.tags||[]),...(extra.tags||[]),'n26'])];if(JSON.stringify(tags)!==JSON.stringify(keep.tags||[])){keep.tags=tags;changed=true}
    for(const d of data.documents||[])if(d.txId===extra.id){d.txId=keep.id;changed=true}
    const fp=transactionFingerprint(keep);if(keep.fingerprint!==fp){keep.fingerprint=fp;changed=true}
    return changed;
  }
  function mergeSyncedRows(rows=[]){
    const local=(data.transactions||[]).filter(isN26Transaction),used=new Set();let added=0,enriched=0;
    for(const tx of rows){tx.fingerprint=transactionFingerprint(tx);let existing=tx.externalId?local.find(x=>!used.has(x.id)&&x.externalId===tx.externalId):null;
      if(!existing){const candidates=local.filter(x=>!used.has(x.id)&&sameN26Signature(x,tx)).sort((a,b)=>candidateScore(b)-candidateScore(a));existing=candidates[0]||null}
      if(existing){used.add(existing.id);let touched=false;if(tx.externalId&&existing.externalId!==tx.externalId){existing.externalId=tx.externalId;touched=true}if(tx.bankReference&&existing.bankReference!==tx.bankReference){existing.bankReference=tx.bankReference;touched=true}if(enrichExisting(existing,tx))touched=true;if(touched)enriched++;continue}
      const nonBankDuplicate=(data.transactions||[]).find(x=>!isN26Transaction(x)&&transactionFingerprint(x)===tx.fingerprint);if(nonBankDuplicate)continue;
      data.transactions.push(tx);local.push(tx);used.add(tx.id);added++;
    }
    return {added,enriched,used};
  }
  function cleanupN26Duplicates(rows=[],used=new Set()){
    const local=(data.transactions||[]).filter(isN26Transaction),removeIds=new Set();let mergedManual=0;
    for(const extra of local){if(used.has(extra.id))continue;const remoteMatch=rows.some(r=>sameN26Signature(extra,r));if(!remoteMatch)continue;const keep=local.filter(k=>used.has(k.id)&&sameN26Signature(k,extra)).sort((a,b)=>candidateScore(b)-candidateScore(a))[0];if(!keep)continue;if(mergeDuplicateDetails(keep,extra))mergedManual++;removeIds.add(extra.id)}
    if(removeIds.size)data.transactions=data.transactions.filter(t=>!removeIds.has(t.id));
    return {removed:removeIds.size,mergedManual};
  }
  function reconcileSyncedRows(rows=[]){
    const repaired=repairN26Fingerprints(),merged=mergeSyncedRows(rows),cleaned=cleanupN26Duplicates(rows,merged.used);return {added:merged.added,enriched:merged.enriched,removed:cleaned.removed,mergedManual:cleaned.mergedManual,repaired,used:merged.used};
  }
  async function sync({days=180,reconcile=true}={}){const householdId=data.integrations?.cloud?.householdId||'';if(!householdId)throw new Error('Kein Cloud-Haushalt gewählt');const qs=new URLSearchParams({days:String(Math.max(1,Math.min(730,days))),householdId}),j=await req(`/api/banking/n26/sync?${qs}`),bankRows=j.transactions||[];ensureLocalAccount(bankRows);const rows=bankRows.map(txFromBank),merged=reconcileSyncedRows(rows),recategorized=globalThis.FinanzCategoryIntelligence?.reclassifyImportedTransactions?.({onlySuspicious:false})||0,repairedAfter=repairN26Fingerprints();if(reconcile&&Number.isFinite(Number(j.balance))&&typeof reconcileAccount==='function'){try{reconcileAccount(conf().localAccountId,Number(j.balance),localISO(new Date()),'N26 PSD2-Abgleich',false)}catch(e){console.warn(e)}}conf().lastSync=new Date().toISOString();conf().lastBalance=j.balance;detectSubscriptionSuggestions?.();saveData(`N26: ${merged.added} neu, ${merged.enriched} angereichert, ${merged.removed} Dublette${merged.removed===1?'':'n'} bereinigt, ${recategorized} neu kategorisiert`);return {added:merged.added,enriched:merged.enriched,removed:merged.removed,repaired:merged.repaired+repairedAfter,recategorized,total:rows.length,balance:j.balance}}
  window.FinanzN26={conf,status,start,handleCallback,sync,txFromBank,ensureLocalAccount,enrichExisting,req,isN26Transaction,n26Signature,sameN26Signature,repairN26Fingerprints,mergeSyncedRows,cleanupN26Duplicates,reconcileSyncedRows};
})();