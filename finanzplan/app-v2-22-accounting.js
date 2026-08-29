'use strict';

const V22_VERSION='2.2.0';

function v22MonthDistance(a,b){const A=String(a||'').split('-').map(Number),B=String(b||'').split('-').map(Number);return A.length>=2&&B.length>=2?(B[0]-A[0])*12+B[1]-A[1]:0}
function linkedReserveTxs(r){return data.transactions.filter(t=>(t.status||'paid')==='paid'&&FinanceLib.normalizeDate(t.date)<=localISO(now)&&((r.contractId&&t.contractId===r.contractId)||(r.insuranceId&&t.insuranceId===r.insuranceId)))}
function initializeV22Accounting(){
  data.schemaVersion=Math.max(22,num(data.schemaVersion));data.version=V22_VERSION;data.settings=data.settings||{};
  if(!Array.isArray(data.settings.essentialCategoryIds))data.settings.essentialCategoryIds=['c_food','c_mob','c_kids','c_health'];
  for(const r of data.reserves.filter(x=>x.auto)){
    if(!r._v22BaseMonth){r._v22BaseMonth=monthKey(now);r._v22BaseCurrent=num(r.current);r._v22BaselinePaid={};for(const t of linkedReserveTxs(r))r._v22BaselinePaid[t.id]=num(t.amount)}
    if(r.active==null)r.active=true;
  }
  // Existing account-linked goals become real allocations. The same euro can no longer fund several goals.
  const groups=new Map();for(const g of data.goals.filter(x=>x.accountId)){if(!groups.has(g.accountId))groups.set(g.accountId,[]);groups.get(g.accountId).push(g)}
  for(const [accountId,goals] of groups){let free=Math.max(0,accountBalance(accountId));for(const g of goals){let wanted=Number.isFinite(Number(g.allocated))?num(g.allocated):Math.min(num(g.current),num(g.target)||Infinity);g.allocated=Math.max(0,Math.min(wanted,free));g.current=g.allocated;free-=g.allocated}}
}
initializeV22Accounting();

// A transfer to the same account is economically a no-op and is rejected by the UI below.
txAccountImpact=function(t,accountId){
  if((t.status||'paid')!=='paid')return 0;const a=Math.abs(num(t.amount));
  if(t.type==='transfer'&&t.accountId===t.targetAccountId)return 0;
  if(t.type==='income'&&t.accountId===accountId)return a;
  if(t.type==='refund'&&t.accountId===accountId)return a;
  if(t.type==='expense'&&t.accountId===accountId)return-a;
  if(t.type==='adjustment'&&t.accountId===accountId)return num(t.signedAmount??t.amount);
  if(t.type==='transfer'){if(t.accountId===accountId)return-a;if(t.targetAccountId===accountId)return a}
  return 0;
};

function reserveCurrentDerived(r){
  if(r.active===false)return 0;if(!r.auto)return Math.max(0,num(r.current));if(!r._v22BaseMonth){r._v22BaseMonth=monthKey(now);r._v22BaseCurrent=num(r.current);r._v22BaselinePaid={}}
  let bal=Math.max(0,num(r._v22BaseCurrent)),baseline=r._v22BaselinePaid||{},seen=new Set(),all=data.transactions.filter(t=>((r.contractId&&t.contractId===r.contractId)||(r.insuranceId&&t.insuranceId===r.insuranceId)));
  // Roll back/adjust payments that were already reflected when v2.2 was introduced.
  for(const [id,oldAmount] of Object.entries(baseline)){const t=all.find(x=>x.id===id);if(t&&(t.status||'paid')==='paid'){bal+=num(oldAmount)-num(t.amount);seen.add(id)}else bal+=num(oldAmount)}
  // New payments in the baseline month are applied after the baseline snapshot.
  for(const t of all.filter(t=>(t.status||'paid')==='paid'&&!seen.has(t.id)&&FinanceLib.normalizeDate(t.date)?.slice(0,7)<=monthKey(now))){if(String(t.date).slice(0,7)<=r._v22BaseMonth)bal-=num(t.amount);seen.add(t.id)}
  let cursor=FinanceLib.addMonths(FinanceLib.parseISO(`${r._v22BaseMonth}-01`),1),end=FinanceLib.parseISO(`${monthKey(now)}-01`);
  while(cursor&&end&&cursor<=end){const mk=FinanceLib.iso(cursor).slice(0,7);bal=Math.min(num(r.target)>0?num(r.target):Infinity,bal+Math.max(0,num(r.monthly)));for(const t of all.filter(t=>(t.status||'paid')==='paid'&&!seen.has(t.id)&&String(t.date).slice(0,7)===mk)){bal-=num(t.amount);seen.add(t.id)}cursor=FinanceLib.addMonths(cursor,1)}
  return Math.max(0,bal);
}
reserveCurrent=function(r){return reserveCurrentDerived(r)};
accrueAutomaticReserves=function(){for(const r of data.reserves.filter(x=>x.auto))r.current=reserveCurrentDerived(r)};

const v22EnsureReserveBase=ensureAutoReserveForSource;
ensureAutoReserveForSource=function(source,kind='contract'){
  const linkKey=kind==='insurance'?'insuranceId':'contractId',existing=data.reserves.find(x=>x[linkKey]===source.id);
  if(!source.autoReserve){if(existing)existing.active=false;return existing||null}
  const r=v22EnsureReserveBase(source,kind);if(r){r.active=source.active!==false;if(!r._v22BaseMonth){r._v22BaseMonth=monthKey(now);r._v22BaseCurrent=num(r.current);r._v22BaselinePaid={}}}return r;
};

function refreshLinkedSources(){
  accrueAutomaticReserves();const today=localISO(now);
  for(const source of [...data.contracts,...data.insurances]){
    const key=data.contracts.includes(source)?'contractId':'insuranceId',planned=data.transactions.filter(t=>t[key]===source.id&&(t.status||'planned')==='planned'&&FinanceLib.normalizeDate(t.date)>=today).sort((a,b)=>a.date.localeCompare(b.date));
    if(planned[0])source.nextDate=planned[0].date;else{const paid=data.transactions.filter(t=>t[key]===source.id&&(t.status||'paid')==='paid').sort((a,b)=>b.date.localeCompare(a.date))[0];if(paid)source.nextDate=FinanceLib.iso(FinanceLib.addFrequency(FinanceLib.parseISO(paid.date),source.frequency||'monthly'))}
    const reserve=data.reserves.find(r=>r[key]===source.id);if(reserve)reserve.active=source.active!==false&&source.autoReserve!==false;
  }
}
// Side effects are now derived from transactions on every save instead of permanently mutating source state once.
handleLinkedPayment=function(){};
const v22SaveAccounting=saveData;
saveData=function(reason='Änderung gespeichert'){refreshLinkedSources();return v22SaveAccounting(reason)};

function goalCurrent(g){return g.accountId?Math.max(0,num(g.allocated)):Math.max(0,num(g.current))}
function allocatedOnAccount(accountId,ignore=''){return data.goals.filter(g=>g.id!==ignore&&g.accountId===accountId).reduce((s,g)=>s+Math.max(0,num(g.allocated)),0)}
function goalAvailableOnAccount(accountId,ignore=''){return Math.max(0,accountBalance(accountId)-allocatedOnAccount(accountId,ignore))}

function linkedPlannedCoverage(r,events){return events.filter(t=>t.type==='expense'&&((r.contractId&&t.contractId===r.contractId)||(r.insuranceId&&t.insuranceId===r.insuranceId))).reduce((s,t)=>s+num(t.amount),0)}
earmarkedTotal=function(events=cashflowEvents(localISO(now),localISO(monthEnd(now)))){
  const reserves=data.reserves.filter(r=>r.active!==false).reduce((s,r)=>{const cur=reserveCurrentDerived(r);if(!r.auto||(!r.contractId&&!r.insuranceId))return s+cur;return s+Math.max(0,cur-linkedPlannedCoverage(r,events))},0);
  const goals=data.goals.reduce((s,g)=>s+goalCurrent(g),0);return reserves+goals;
};
safeToSpendMetrics=function(){const end=localISO(monthEnd(now)),events=cashflowEvents(localISO(now),end),plannedIncome=events.filter(t=>t.type==='income'||t.type==='refund').reduce((s,t)=>s+num(t.amount),0),plannedExpense=events.filter(t=>t.type==='expense').reduce((s,t)=>s+num(t.amount),0),earmarked=earmarkedTotal(events),safe=FinanceLib.safeToSpend({liquid:spendableLiquid(),plannedIncome,plannedExpense,earmarked}),days=Math.max(1,daysRemaining());return{safe,perDay:FinanceLib.dailyBudget({safe,days}),plannedIncome,plannedExpense,earmarked,days}};

function refundAlreadyAllocated(originalId,ignoreId=''){return data.transactions.filter(t=>t.id!==ignoreId&&t.type==='refund'&&t.refundOf===originalId&&(t.status||'paid')!=='skipped').reduce((s,t)=>s+num(t.amount),0)}
function refundRemaining(originalId,ignoreId=''){const original=data.transactions.find(t=>t.id===originalId&&t.type==='expense');return original?Math.max(0,num(original.amount)-refundAlreadyAllocated(originalId,ignoreId)):Infinity}
function proportionalRefundSplits(original,amount){const src=splitLines(original);if(!src?.length)return[];const base=src.reduce((s,x)=>s+num(x.amount),0)||num(original.amount),out=[];let used=0;src.forEach((x,i)=>{const value=i===src.length-1?Math.max(0,Math.round((amount-used)*100)/100):Math.max(0,Math.round((amount*num(x.amount)/base)*100)/100);out.push({categoryId:x.categoryId,amount:value});used+=value});return out}

openTransactionModal=function(t=null,preset={}){
  const edit=!!t,id=t?.id||uid('tx'),x=t?{...t}:{id,date:localISO(now),title:'',merchant:'',amount:'',type:preset.type||'expense',categoryId:'c_other',accountId:data.accounts[0]?.id||'',memberId:data.members[0]?.id||'',status:preset.status||'paid',note:'',tags:[],splits:[]};let saved=false;
  openModal(edit?'Buchung bearbeiten':'Neue Buchung','Mit Split, Teilrückerstattung, Beleg, Duplikat- und Kontoprüfung.',`<form id="txForm"><div class="form-grid"><div class="field"><label>Typ</label><select name="type" class="select"><option value="expense" ${x.type==='expense'?'selected':''}>Ausgabe</option><option value="income" ${x.type==='income'?'selected':''}>Einnahme</option><option value="transfer" ${x.type==='transfer'?'selected':''}>Umbuchung</option><option value="refund" ${x.type==='refund'?'selected':''}>Rückerstattung</option></select></div><div class="field"><label>Datum</label><input name="date" type="date" class="input" value="${x.date}" required></div><div class="field full"><label>Bezeichnung</label><input name="title" class="input" value="${escapeHTML(x.title)}" required></div><div class="field"><label>Händler / Partner</label><input name="merchant" class="input" value="${escapeHTML(x.merchant||'')}"></div><div class="field"><label>Betrag</label><input name="amount" type="number" step="0.01" min="0.01" class="input" value="${x.amount}" required></div><div class="field"><label>Status</label><select name="status" class="select"><option value="paid" ${x.status==='paid'?'selected':''}>Bezahlt</option><option value="planned" ${x.status==='planned'?'selected':''}>Geplant</option><option value="skipped" ${x.status==='skipped'?'selected':''}>Übersprungen</option></select></div><div class="field"><label>Kategorie</label><select name="categoryId" class="select">${categoryOptions(x.categoryId)}</select></div><div class="field"><label>Konto</label><select name="accountId" class="select">${accountOptions(x.accountId)}</select></div><div class="field" id="targetAccountField"><label>Zielkonto</label><select name="targetAccountId" class="select">${accountOptions(x.targetAccountId||data.accounts[1]?.id||'')}</select></div><div class="field" id="refundField"><label>Erstattung zu</label><select name="refundOf" class="select">${refundOptions(x.refundOf)}</select><small id="refundRemainingHint"></small></div><div class="field"><label>Person</label><select name="memberId" class="select">${memberOptions(x.memberId)}</select></div><div class="field full"><label>Notiz</label><textarea name="note" class="textarea">${escapeHTML(x.note||'')}</textarea></div><div class="field full"><label>Tags / Projekte</label><input name="tags" class="input" value="${escapeHTML((x.tags||[]).join(', '))}"></div><div class="field full"><label><input id="splitToggle" type="checkbox" ${x.splits?.length&&x.type==='expense'?'checked':''}> Ausgabe auf mehrere Kategorien aufteilen</label></div>${splitEditorHTML(x.type==='expense'?x.splits||[]:[])}</div><div class="modal-actions">${deleteButton('Buchung',x.id)}<button type="button" class="secondary-button" id="receiptLink">▧ Beleg</button><button type="button" class="secondary-button" data-cancel>Abbrechen</button><button class="primary-button">${edit?'Speichern':'Buchung anlegen'}</button></div></form>`,()=>{
    const f=$('#txForm'),type=f.elements.type,splitToggle=$('#splitToggle'),splitEditor=$('#splitEditor'),refundSel=f.elements.refundOf;
    const sync=()=>{const transfer=type.value==='transfer',refund=type.value==='refund';$('#targetAccountField').style.display=transfer?'grid':'none';$('#refundField').style.display=refund?'grid':'none';splitToggle.closest('.field').style.display=type.value==='expense'?'grid':'none';splitEditor.classList.toggle('hidden',!(type.value==='expense'&&splitToggle.checked));updateRefundHint()};
    const updateRefundHint=()=>{if(type.value!=='refund'||!refundSel.value){$('#refundRemainingHint').textContent='';return}$('#refundRemainingHint').textContent=`Noch erstattbar: ${money(refundRemaining(refundSel.value,id))}`};
    type.onchange=sync;refundSel.onchange=updateRefundHint;splitToggle.onchange=sync;sync();
    f.elements.title.onblur=()=>{const a=applyMerchantRule(f.elements.title.value,{categoryId:f.elements.categoryId.value,accountId:f.elements.accountId.value});if(a.categoryId)f.elements.categoryId.value=a.categoryId;if(a.accountId)f.elements.accountId.value=a.accountId};
    $('#addSplitRow').onclick=()=>{$('#splitRows').insertAdjacentHTML('beforeend',splitRowHTML({categoryId:f.elements.categoryId.value,amount:''},Date.now()));$$('.split-remove',f).forEach(b=>b.onclick=()=>b.closest('.split-row').remove())};$$('.split-remove',f).forEach(b=>b.onclick=()=>b.closest('.split-row').remove());
    f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f),amount=num(formVal(fd,'amount')),txType=formVal(fd,'type'),accountId=formVal(fd,'accountId'),targetAccountId=formVal(fd,'targetAccountId'),refundOf=formVal(fd,'refundOf');if(txType==='transfer'&&accountId===targetAccountId)return toast('Quell- und Zielkonto müssen verschieden sein','error');let splits=txType==='expense'&&splitToggle.checked?collectSplits(f):[];if(splits.length&&Math.abs(splits.reduce((s,a)=>s+a.amount,0)-amount)>.01)return toast('Die Split-Summe muss dem Gesamtbetrag entsprechen','error');let categoryId=formVal(fd,'categoryId');if(txType==='refund'&&refundOf){const original=data.transactions.find(q=>q.id===refundOf&&q.type==='expense'),remaining=refundRemaining(refundOf,id);if(!original)return toast('Die ursprüngliche Ausgabe wurde nicht gefunden','error');if(amount>remaining+.001)return toast(`Maximal noch ${money(remaining)} erstattbar`,'error');categoryId=original.categoryId;splits=proportionalRefundSplits(original,amount)}const obj={...x,id,date:formVal(fd,'date'),title:formVal(fd,'title'),merchant:formVal(fd,'merchant'),amount,type:txType,categoryId,accountId,targetAccountId,refundOf,memberId:formVal(fd,'memberId'),status:formVal(fd,'status'),note:formVal(fd,'note'),tags:formVal(fd,'tags').split(',').map(s=>s.trim()).filter(Boolean),splits,manualOverride:!!x.recurringId};obj.fingerprint=transactionFingerprint(obj);if(isDuplicateTransaction(obj,id)&&!confirm('Eine sehr ähnliche Buchung existiert bereits. Trotzdem speichern?'))return;if(edit)Object.assign(t,obj);else data.transactions.push(obj);saved=true;closeModal();saveData(edit?'Buchung aktualisiert':'Buchung angelegt')};
    $('[data-cancel]',f).onclick=async()=>{if(!saved&&!edit&&typeof discardDocumentsForTx==='function')await discardDocumentsForTx(id);closeModal()};$('#receiptLink').onclick=()=>selectReceipt(id);if(preset.receipt)setTimeout(()=>selectReceipt(id),100);attachDelete('transactions',x.id,'Buchung')});
};

projectSpend=function(p){
  const start=FinanceLib.normalizeDate(p.start),end=FinanceLib.normalizeDate(p.end),tag=FinanceLib.normalizeText(p.tag||p.name),cats=[...(p.categoryIds||[])],within=t=>{const d=FinanceLib.normalizeDate(t.date);return d&&(!start||d>=start)&&(!end||d<=end)},direct=t=>{const original=t.type==='refund'&&t.refundOf?data.transactions.find(x=>x.id===t.refundOf):null;return (t.projectIds||[]).includes(p.id)||(t.tags||[]).map(FinanceLib.normalizeText).includes(tag)||(original&&((original.projectIds||[]).includes(p.id)||(original.tags||[]).map(FinanceLib.normalizeText).includes(tag)))};
  return num(p.spent)+data.transactions.filter(t=>['expense','refund'].includes(t.type)&&(t.status||'paid')==='paid'&&within(t)).reduce((sum,t)=>{if(direct(t))return sum+(t.type==='refund'?-num(t.amount):num(t.amount));return sum+categoryAmountInTx(t,cats)},0);
};

const v22RestoreTrashBase=restoreTrash;
softDelete=function(collection,id,label='Eintrag',persist=true){
  const arr=data[collection];if(!Array.isArray(arr))return false;const item=arr.find(x=>x.id===id);if(!item)return false;const blocked=canDelete(collection,id);if(blocked){toast(blocked,'error');return false}const row={id:uid('trash'),collection,item:JSON.parse(JSON.stringify(item)),label,deletedAt:new Date().toISOString(),meta:{}};
  if(collection==='contracts'||collection==='insurances'){const key=collection==='contracts'?'contractId':'insuranceId',reserve=data.reserves.find(r=>r[key]===id);if(reserve){row.meta.reserve=JSON.parse(JSON.stringify(reserve));data.reserves=data.reserves.filter(r=>r.id!==reserve.id)}}
  data.trash.push(row);data[collection]=arr.filter(x=>x.id!==id);
  if(collection==='recurring')removeRecurringSeries(id);
  if(collection==='contracts'||collection==='insurances'||collection==='debts'){const key=collection==='contracts'?'contractId':collection==='insurances'?'insuranceId':'debtId',linked=data.recurring.filter(r=>r[key]===id);for(const r of linked)removeRecurringSeries(r.id);data.recurring=data.recurring.filter(r=>r[key]!==id)}
  if(persist)saveData(`${label} in Papierkorb verschoben`);return true;
};
restoreTrash=function(id){
  const row=data.trash.find(x=>x.id===id);if(!row)return false;if(row.collection==='documents')return v22RestoreTrashBase(id);if(!Array.isArray(data[row.collection]))return false;if(data[row.collection].some(x=>x.id===row.item.id)){toast('Ein Eintrag mit dieser ID existiert bereits','error');return false}
  data[row.collection].push(row.item);if(row.meta?.reserve&&!data.reserves.some(r=>r.id===row.meta.reserve.id))data.reserves.push(row.meta.reserve);data.trash=data.trash.filter(x=>x.id!==id);
  if(row.collection==='contracts')syncLinkedRecurring(row.item,'contract');if(row.collection==='insurances')syncLinkedRecurring(row.item,'insurance');if(row.collection==='debts')linkDebtRecurring(row.item);if(row.collection==='recurring')rebuildRecurringSeries(row.item);initializeV22Accounting();saveData(`${row.label||'Eintrag'} wiederhergestellt`);return true;
};

function stableRecurringGroup(arr){if(arr.length<3)return false;const prev=arr.slice(-4,-1),avg=prev.reduce((s,t)=>s+num(t.amount),0)/prev.length;if(!avg)return false;const variation=Math.max(...prev.map(t=>Math.abs(num(t.amount)-avg)))/avg;if(variation>.08)return false;const gaps=[];for(let i=Math.max(1,arr.length-4);i<arr.length;i++)gaps.push((FinanceLib.parseISO(arr[i].date)-FinanceLib.parseISO(arr[i-1].date))/86400000);return gaps.filter(g=>g>=25&&g<=35).length>=Math.max(1,gaps.length-1)}
detectPriceChanges=function(){const groups=new Map();for(const t of data.transactions.filter(t=>t.type==='expense'&&(t.status||'paid')==='paid')){const key=t.contractId?`contract:${t.contractId}`:t.insuranceId?`insurance:${t.insuranceId}`:FinanceLib.normalizeText(t.merchant||t.title);if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)}const out=[];for(const [key,arr] of groups){arr.sort((a,b)=>a.date.localeCompare(b.date));if(arr.length<2)continue;const linked=key.startsWith('contract:')||key.startsWith('insurance:');if(!linked&&!stableRecurringGroup(arr))continue;const last=arr.at(-1),prev=arr.slice(-4,-1),avg=prev.reduce((s,t)=>s+num(t.amount),0)/Math.max(1,prev.length);if(avg>0&&num(last.amount)>avg*1.03)out.push({key,title:last.merchant||last.title,old:avg,current:num(last.amount),change:(num(last.amount)/avg-1)*100,date:last.date})}return out.sort((a,b)=>b.change-a.change)};

function variableEssentialMonth(d){const ids=new Set(data.settings.essentialCategoryIds||[]),recIds=new Set(data.recurring.filter(r=>r.type==='expense').map(r=>r.id));return txForMonth(d).filter(t=>(t.status||'paid')==='paid'&&!recIds.has(t.recurringId)&&['expense','refund'].includes(t.type)).reduce((s,t)=>s+categoryAmountInTx(t,[...ids]),0)}
stressAnalysis=function(){const values=[];for(let i=1;i<=3;i++)values.push(Math.max(0,variableEssentialMonth(addMonths(selectedMonth,-i))));const variable=values.reduce((a,b)=>a+b,0)/Math.max(1,values.length),essentials=Math.max(0,fixedMonthly()+variable),liquid=Math.max(0,spendableLiquid()-earmarkedTotal()),runway=FinanceLib.monthsRunway(liquid,essentials),s=monthSummary();return{essentials,variableEssentials:variable,liquid,runway,oneIncomeLoss:liquid-essentials,income:s.totalExpectedIncome}};

const v22IntegrityBase=integrityReport;
integrityReport=function(){const issues=v22IntegrityBase();for(const t of data.transactions){if(t.type==='transfer'&&t.accountId&&t.accountId===t.targetAccountId)issues.push({type:'transfer',id:t.id,text:`Umbuchung auf dasselbe Konto: ${t.title}`});if(t.type==='refund'&&t.refundOf&&num(t.amount)>refundRemaining(t.refundOf,t.id)+.001)issues.push({type:'refund',id:t.id,text:`Rückerstattung übersteigt Restbetrag: ${t.title}`})}for(const a of data.accounts){const allocated=allocatedOnAccount(a.id);if(allocated>Math.max(0,accountBalance(a))+.01)issues.push({type:'allocation',id:a.id,text:`Sparziele auf ${a.name} übersteigen den Kontostand`})}return issues};

refreshLinkedSources();