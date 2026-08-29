'use strict';
(function(){
  const toCents=v=>{const n=typeof v==='string'&&globalThis.FinanceLib?FinanceLib.parseMoney(v):Number(v);return Math.round((Number.isFinite(n)?n:0)*100)};
  const fromCents=c=>Number(c||0)/100;
  const sumCents=arr=>arr.reduce((s,v)=>s+toCents(v),0);
  const field=(obj,name)=>{const ck=`${name}Cents`;const c=Number.isInteger(obj?.[ck])?obj[ck]:toCents(obj?.[name]);if(obj){obj[ck]=c;obj[name]=fromCents(c)}return c};
  const syncField=(obj,name)=>{if(!obj)return 0;const ck=`${name}Cents`,c=obj[name]===undefined&&Number.isInteger(obj[ck])?obj[ck]:toCents(obj[name]);obj[ck]=c;obj[name]=fromCents(c);return c};
  globalThis.FinanzMoney={toCents,fromCents,sumCents,field,syncField};

  globalThis.syncMoneyFieldsV3=function(){
    for(const t of data.transactions||[]){syncField(t,'amount');for(const s of t.splits||[])syncField(s,'amount')}
    for(const r of data.recurring||[])syncField(r,'amount');
    for(const a of data.accounts||[]){syncField(a,'openingBalance');if(a.baseBalance!=null||a.baseBalanceCents!=null)syncField(a,'baseBalance')}
    for(const r of data.reconciliations||[])syncField(r,'balance');
    for(const b of data.budgets||[])syncField(b,'amount');
    for(const g of data.goals||[]){syncField(g,'target');syncField(g,'current');if(g.allocated!=null||g.allocatedCents!=null)syncField(g,'allocated')}
    for(const r of data.reserves||[]){syncField(r,'target');syncField(r,'current');syncField(r,'monthly');if(r._v22BaseCurrent!=null||r._v22BaseCurrentCents!=null)syncField(r,'_v22BaseCurrent')}
    for(const c of data.contracts||[])syncField(c,'amount');
    for(const i of data.insurances||[])syncField(i,'amount');
    for(const d of data.debts||[]){syncField(d,'principal');syncField(d,'openingBalance');syncField(d,'balance');syncField(d,'rate');for(const x of d.extraPayments||[])syncField(x,'amount')}
    for(const p of data.projects||[]){syncField(p,'budget');syncField(p,'spent')}
    return data;
  };

  function impactCents(t,accountId){
    if((t.status||'paid')!=='paid')return 0;const a=field(t,'amount');
    if(t.type==='transfer'&&t.accountId===t.targetAccountId)return 0;
    if((t.type==='income'||t.type==='refund')&&t.accountId===accountId)return a;
    if(t.type==='expense'&&t.accountId===accountId)return-a;
    if(t.type==='adjustment'&&t.accountId===accountId)return toCents(t.signedAmount??t.amount);
    if(t.type==='transfer'){if(t.accountId===accountId)return-a;if(t.targetAccountId===accountId)return a}
    return 0;
  }
  globalThis.txAccountImpactCentsV3=impactCents;
  txAccountImpact=function(t,accountId){return fromCents(impactCents(t,accountId))};

  accountBalanceAtDate=function(aOrId,dateISO=localISO(now)){
    const a=typeof aOrId==='string'?data.accounts.find(x=>x.id===aOrId):aOrId;if(!a)return 0;dateISO=FinanceLib.normalizeDate(dateISO)||localISO(now);const rec=relevantReconciliation(a.id,dateISO);let base=rec?field(rec,'balance'):field(a,'openingBalance'),from=rec?rec.date:a.openingDate;
    for(const t of data.transactions){const td=FinanceLib.normalizeDate(t.date);if(!td||td>dateISO||td<from)continue;if(rec&&td===from&&t.id===rec.sourceTxId)continue;base+=impactCents(t,a.id)}return fromCents(base)
  };
  accountBalance=function(aOrId){return accountBalanceAtDate(aOrId,localISO(now))};
  accountTotalAtDate=function(date=localISO(now)){return fromCents(data.accounts.reduce((s,a)=>s+toCents(accountBalanceAtDate(a,date)),0))};
  accountTotal=function(){return accountTotalAtDate(localISO(now))};
  ledgerImpact=function(accountId){const a=data.accounts.find(x=>x.id===accountId);return a?fromCents(toCents(accountBalance(a))-field(a,'openingBalance')):0};

  categoryAmountInTx=function(t,ids){const sign=t.type==='refund'?-1:t.type==='expense'?1:0;if(!sign)return 0;let cents=0;const splits=splitLines(t);if(splits){for(const s of splits)if(ids.includes(s.categoryId))cents+=sign*field(s,'amount')}else if(ids.includes(t.categoryId))cents+=sign*field(t,'amount');return fromCents(cents)};
  categorySpend=function(catId,d=selectedMonth){const ids=descendants(catId),cents=txForMonth(d).filter(t=>(t.status||'paid')==='paid').reduce((s,t)=>s+toCents(categoryAmountInTx(t,ids)),0);return fromCents(cents)};

  monthSummary=function(d=selectedMonth){const tx=txForMonth(d),paid=tx.filter(t=>(t.status||'paid')==='paid'),planned=tx.filter(t=>(t.status||'paid')==='planned'),sum=(arr,type)=>arr.filter(t=>t.type===type).reduce((s,t)=>s+field(t,'amount'),0),incomeC=sum(paid,'income'),refundC=sum(paid,'refund'),grossC=sum(paid,'expense'),expenseC=grossC-refundC,plannedIncomeC=sum(planned,'income'),plannedRefundC=sum(planned,'refund'),plannedGrossC=sum(planned,'expense'),plannedExpenseC=plannedGrossC-plannedRefundC,totalIncomeC=incomeC+plannedIncomeC,totalExpenseC=expenseC+plannedExpenseC;return{tx,paid,income:fromCents(incomeC),expense:fromCents(expenseC),grossExpense:fromCents(grossC),refunds:fromCents(refundC),balance:fromCents(incomeC-expenseC),plannedIncome:fromCents(plannedIncomeC),plannedExpense:fromCents(plannedExpenseC),totalExpectedIncome:fromCents(totalIncomeC),totalExpectedExpense:fromCents(totalExpenseC),forecast:fromCents(totalIncomeC-totalExpenseC)}};

  refundAlreadyAllocated=function(originalId,ignoreId=''){return fromCents(data.transactions.filter(t=>t.id!==ignoreId&&t.type==='refund'&&t.refundOf===originalId&&(t.status||'paid')!=='skipped').reduce((s,t)=>s+field(t,'amount'),0))};
  refundRemaining=function(originalId,ignoreId=''){const original=data.transactions.find(t=>t.id===originalId&&t.type==='expense');return original?fromCents(Math.max(0,field(original,'amount')-toCents(refundAlreadyAllocated(originalId,ignoreId)))):Infinity};
  proportionalRefundSplits=function(original,amount){const src=splitLines(original);if(!src?.length)return[];const total=field(original,'amount'),refund=toCents(amount),srcC=src.map(x=>field(x,'amount')),base=srcC.reduce((a,b)=>a+b,0)||total;let used=0;return src.map((x,i)=>{const c=i===src.length-1?refund-used:Math.round(refund*srcC[i]/base);used+=c;return{categoryId:x.categoryId,amount:fromCents(Math.max(0,c)),amountCents:Math.max(0,c)}})};

  projectSpend=function(p){const start=FinanceLib.normalizeDate(p.start),end=FinanceLib.normalizeDate(p.end),tag=FinanceLib.normalizeText(p.tag||p.name),cats=expandedCategoryIds(p.categoryIds||[]),within=t=>{const d=FinanceLib.normalizeDate(t.date);return d&&(!start||d>=start)&&(!end||d<=end)},direct=t=>{const original=t.type==='refund'&&t.refundOf?data.transactions.find(x=>x.id===t.refundOf):null;return (t.projectIds||[]).includes(p.id)||(tag&&(t.tags||[]).map(FinanceLib.normalizeText).includes(tag))||(original&&((original.projectIds||[]).includes(p.id)||(tag&&(original.tags||[]).map(FinanceLib.normalizeText).includes(tag))))};let cents=field(p,'spent');for(const t of data.transactions.filter(t=>['expense','refund'].includes(t.type)&&(t.status||'paid')==='paid'&&within(t))){if(direct(t))cents+=(t.type==='refund'?-1:1)*field(t,'amount');else cents+=toCents(categoryAmountInTx(t,cats))}return fromCents(cents)};

  spendableLiquid=function(){return fromCents(data.accounts.filter(a=>a.spendable!==false&&a.type!=='investment').reduce((s,a)=>s+toCents(accountBalance(a)),0))};
  const priorEarmarked=earmarkedTotal;earmarkedTotal=function(events=cashflowEvents(localISO(now),localISO(monthEnd(now)))){return fromCents(toCents(priorEarmarked(events)))};
  safeToSpendMetrics=function(){const end=localISO(monthEnd(now)),events=cashflowEvents(localISO(now),end),plannedIncomeC=events.filter(t=>t.type==='income'||t.type==='refund').reduce((s,t)=>s+field(t,'amount'),0),plannedExpenseC=events.filter(t=>t.type==='expense').reduce((s,t)=>s+field(t,'amount'),0),earmarkedC=toCents(earmarkedTotal(events)),safeC=toCents(spendableLiquid())+plannedIncomeC-plannedExpenseC-earmarkedC,days=Math.max(1,daysRemaining());return{safe:fromCents(safeC),perDay:fromCents(Math.floor(safeC/days)),plannedIncome:fromCents(plannedIncomeC),plannedExpense:fromCents(plannedExpenseC),earmarked:fromCents(earmarkedC),days}};

  debtBalanceAtDate=function(d,dateISO=localISO(now)){dateISO=FinanceLib.normalizeDate(dateISO)||localISO(now);const start=FinanceLib.normalizeDate(d.openingDate||d.start)||dateISO;if(dateISO<start)return fromCents(field(d,'openingBalance')||field(d,'principal')||field(d,'balance'));let bal=field(d,'openingBalance')||field(d,'balance')||field(d,'principal'),monthlyRate=num(d.interest)/100/12,cursor=FinanceLib.parseISO(start),end=FinanceLib.parseISO(dateISO),payments=debtPayments(d,dateISO),pi=0;while(cursor<=end&&bal>0){const ym=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`;bal+=Math.round(bal*monthlyRate);while(pi<payments.length&&String(payments[pi].date).slice(0,7)===ym){bal=Math.max(0,bal-field(payments[pi],'amount'));pi++}cursor=FinanceLib.addMonths(cursor,1)}return fromCents(Math.max(0,bal))};
  netWorthAtDate=function(date=localISO(now)){const assets=data.accounts.filter(a=>a.includeNetWorth!==false).reduce((s,a)=>s+toCents(accountBalanceAtDate(a,date)),0),debts=data.debts.reduce((s,d)=>s+toCents(debtBalanceAtDate(d,date)),0);return fromCents(assets-debts)};netWorth=function(){return netWorthAtDate(localISO(now))};
  syncMoneyFieldsV3();
})();
