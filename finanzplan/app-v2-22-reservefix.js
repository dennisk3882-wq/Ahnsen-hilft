'use strict';

// Rebuild automatic reserves chronologically. Payments after the baseline month must not
// be marked as consumed before their month is replayed.
reserveCurrentDerived=function(r){
  if(r.active===false)return 0;
  if(!r.auto)return Math.max(0,num(r.current));
  if(!r._v22BaseMonth){r._v22BaseMonth=monthKey(now);r._v22BaseCurrent=num(r.current);r._v22BaselinePaid={}}
  let bal=Math.max(0,num(r._v22BaseCurrent));
  const baseline=r._v22BaselinePaid||{},seen=new Set(),all=data.transactions.filter(t=>((r.contractId&&t.contractId===r.contractId)||(r.insuranceId&&t.insuranceId===r.insuranceId)));

  // The migration baseline may already contain paid transactions. Reverse only their delta
  // when the transaction was later changed/removed; those baseline amounts were already in baseCurrent.
  for(const [id,oldAmount] of Object.entries(baseline)){
    const t=all.find(x=>x.id===id);
    if(t&&(t.status||'paid')==='paid'){
      bal+=num(oldAmount)-num(t.amount);
      seen.add(id);
    }else bal+=num(oldAmount);
  }

  // Apply only payments that truly belong to/before the baseline month here.
  for(const t of all.filter(t=>(t.status||'paid')==='paid'&&!seen.has(t.id)&&String(FinanceLib.normalizeDate(t.date)||'').slice(0,7)<=r._v22BaseMonth)){
    bal-=num(t.amount);
    seen.add(t.id);
  }

  let cursor=FinanceLib.addMonths(FinanceLib.parseISO(`${r._v22BaseMonth}-01`),1);
  const end=FinanceLib.parseISO(`${monthKey(now)}-01`),cap=num(r.target)>0?num(r.target):Infinity;
  while(cursor&&end&&cursor<=end){
    const mk=FinanceLib.iso(cursor).slice(0,7);
    bal=Math.min(cap,Math.max(0,bal)+Math.max(0,num(r.monthly)));
    for(const t of all.filter(t=>(t.status||'paid')==='paid'&&!seen.has(t.id)&&String(FinanceLib.normalizeDate(t.date)||'').slice(0,7)===mk)){
      bal-=num(t.amount);
      seen.add(t.id);
    }
    cursor=FinanceLib.addMonths(cursor,1);
  }
  return Math.max(0,bal);
};
reserveCurrent=function(r){return reserveCurrentDerived(r)};
accrueAutomaticReserves=function(){for(const r of data.reserves.filter(x=>x.auto))r.current=reserveCurrentDerived(r)};
