'use strict';
(function(){
  const VERSION='3.1.0';
  const cents=v=>Math.round((Number(v)||0)*100), euros=c=>c/100;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const med=a=>{const x=a.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!x.length)return 0;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
  const quantile=(a,q)=>{const x=a.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!x.length)return 0;const p=(x.length-1)*q,b=Math.floor(p),r=p-b;return x[b+1]!==undefined?x[b]+r*(x[b+1]-x[b]):x[b]};
  const mad=a=>{const m=med(a);return med(a.map(v=>Math.abs(v-m)))};
  const monthKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const dateFromKey=k=>new Date(Number(k.slice(0,4)),Number(k.slice(5,7))-1,1);
  const monthTx=d=>typeof txForMonth==='function'?txForMonth(d):(data.transactions||[]).filter(t=>String(t.date||'').slice(0,7)===monthKey(d));
  const netTxAmount=t=>t.type==='income'?num(t.amount):t.type==='refund'?-num(t.amount):t.type==='expense'?num(t.amount):0;
  const expenseOf=t=>t.type==='expense'?num(t.amount):t.type==='refund'?-num(t.amount):0;
  const isPaid=t=>(t.status||'paid')==='paid';
  const categoryName=id=>{try{return getCat(id)?.name||'Sonstiges'}catch{return 'Sonstiges'}};

  function ensurePremiumData(){
    data.assets=Array.isArray(data.assets)?data.assets:[];
    data.monthlyReports=Array.isArray(data.monthlyReports)?data.monthlyReports:[];
    data.settings=data.settings||{};
    data.settings.inflationByYear=data.settings.inflationByYear||{};
    data.settings.premium=data.settings.premium||{autopilot:true,anomalies:true,monthlyReport:true};
    data.integrations=data.integrations||{};
    data.integrations.n26=data.integrations.n26||{enabled:false,localAccountId:'',lastSync:'',sessionReady:false};
    data.integrations.cloud=data.integrations.cloud||{enabled:false};
    data.integrations.ai=data.integrations.ai||{mode:'local',backendUrl:''};
    data.version=VERSION;
  }

  function variableExpenseByMonth(count=9,end=new Date()){
    const out=[];
    for(let i=count;i>=1;i--){
      const d=new Date(end.getFullYear(),end.getMonth()-i,1),rows=monthTx(d).filter(t=>isPaid(t)&&['expense','refund'].includes(t.type));
      const recurringIds=new Set((data.recurring||[]).filter(r=>r.type==='expense').map(r=>r.id));
      const value=rows.filter(t=>!t.recurringId||!recurringIds.has(t.recurringId)).reduce((s,t)=>s+expenseOf(t),0);
      out.push({month:monthKey(d),value:Math.max(0,euros(cents(value)))});
    }
    return out;
  }

  function uncertaintyForecast(){
    const today=new Date(),hist=variableExpenseByMonth(9,today).map(x=>x.value).filter(v=>v>0),days=new Date(today.getFullYear(),today.getMonth()+1,0).getDate(),elapsed=Math.max(1,today.getDate());
    const currentRows=monthTx(today).filter(t=>isPaid(t)&&['expense','refund'].includes(t.type)),currentVariable=Math.max(0,currentRows.filter(t=>!t.recurringId).reduce((s,t)=>s+expenseOf(t),0));
    const pace=currentVariable/elapsed*days,h50=quantile(hist,.5),h20=quantile(hist,.2),h80=quantile(hist,.8),baseVar=hist.length?(.55*h50+.45*pace):pace;
    const lowVar=hist.length?Math.min(baseVar,Math.max(0,.6*h20+.4*pace*.85)):baseVar*.85,highVar=hist.length?Math.max(baseVar,.65*h80+.35*pace*1.15):baseVar*1.15;
    const p=typeof statisticalProjection==='function'?statisticalProjection():null,s=monthSummary(),fixedRemaining=Math.max(0,(p?.projectedExpense??s.totalExpectedExpense)-baseVar),income=p?.projectedIncome??s.totalExpectedIncome;
    const startBalance=typeof accountTotal==='function'?accountTotal():0,remainingIncome=Math.max(0,income-s.income),paidOut=Math.max(0,s.expense),plannedFixed=Math.max(0,fixedRemaining-Math.max(0,currentVariable));
    const monthEnd=(variable)=>startBalance+remainingIncome-plannedFixed-Math.max(0,variable-currentVariable);
    return {variable:{low:euros(cents(lowVar)),base:euros(cents(baseVar)),high:euros(cents(highVar))},monthEnd:{optimistic:euros(cents(monthEnd(lowVar))),base:euros(cents(monthEnd(baseVar))),conservative:euros(cents(monthEnd(highVar)))},history:hist.length,confidence:hist.length>=6?'hoch':hist.length>=3?'mittel':'niedrig'};
  }

  function anomalies({months=6,limit=12}={}){
    const cutoff=new Date();cutoff.setMonth(cutoff.getMonth()-months);const groups=new Map(),rows=(data.transactions||[]).filter(t=>isPaid(t)&&t.type==='expense'&&new Date(t.date)>=cutoff);
    for(const t of rows){const key=FinanceLib.normalizeText(t.merchant||t.title||'');if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)}
    const found=[];
    for(const [key,items] of groups){if(items.length<3)continue;const amounts=items.map(t=>num(t.amount)),m=med(amounts),dev=mad(amounts),last=items.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).at(-1),threshold=Math.max(m*.25,dev*3,5);if(num(last.amount)>m+threshold)found.push({type:'amount',severity:num(last.amount)>m+threshold*1.8?'high':'medium',title:last.merchant||last.title,transactionId:last.id,current:num(last.amount),baseline:m,diff:num(last.amount)-m,date:last.date})}
    const sorted=rows.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i],same=FinanceLib.normalizeText(a.merchant||a.title)===FinanceLib.normalizeText(b.merchant||b.title),delta=Math.abs(new Date(b.date)-new Date(a.date))/86400000;if(same&&Math.abs(num(a.amount)-num(b.amount))<.005&&delta<=1)found.push({type:'duplicate',severity:'high',title:b.merchant||b.title,transactionId:b.id,current:num(b.amount),baseline:num(a.amount),diff:0,date:b.date,otherId:a.id})}
    return found.sort((a,b)=>(b.severity==='high')-(a.severity==='high')||String(b.date).localeCompare(String(a.date))).slice(0,limit);
  }

  function contractOptimization(){
    const out=[],today=new Date();
    for(const c of [...(data.contracts||[]),...(data.insurances||[])]){if(c.active===false)continue;let cancel=null;try{cancel=typeof cancellationInfo==='function'?cancellationInfo(c):null}catch{}const monthly=typeof monthlyEquivalent==='function'?monthlyEquivalent(c):num(c.amount||c.monthly||c.price);if(cancel?.deadline){const dd=(new Date(cancel.deadline)-today)/86400000;if(dd>=0&&dd<=60)out.push({kind:'deadline',priority:dd<=14?'high':'medium',id:c.id,title:c.name||c.title,detail:`Kündigungsfrist in ${Math.ceil(dd)} Tagen`,monthly})}if(monthly>=40)out.push({kind:'review',priority:'low',id:c.id,title:c.name||c.title,detail:`${money(monthly)} monatlich – regelmäßig Tarif/Leistung prüfen`,monthly})}
    const seen=new Map();for(const c of data.contracts||[]){const k=FinanceLib.normalizeText(c.name||c.title);if(!k)continue;if(seen.has(k))out.push({kind:'duplicate-contract',priority:'medium',id:c.id,title:c.name||c.title,detail:'Ähnlicher Vertrag mehrfach hinterlegt',monthly:monthlyEquivalent(c)});else seen.set(k,c)}
    return out.sort((a,b)=>({high:3,medium:2,low:1}[b.priority]-({high:3,medium:2,low:1}[a.priority]))).slice(0,12);
  }

  function autopilot(){
    ensurePremiumData();const safe=typeof safeToSpendMetrics==='function'?safeToSpendMetrics():{safe:0,perDay:0},forecast=uncertaintyForecast(),alerts=anomalies(),contracts=contractOptimization();
    const upcoming=typeof cashflowEvents==='function'?cashflowEvents(21).filter(e=>new Date(e.date)>=new Date()).slice(0,8):[];
    const actions=[];
    if(safe.safe<0)actions.push({priority:'high',title:'Freier Betrag negativ',detail:`Bis Monatsende fehlen voraussichtlich ${money(Math.abs(safe.safe))}.`});
    if(alerts.some(a=>a.severity==='high'))actions.push({priority:'high',title:'Auffällige Buchung prüfen',detail:`${alerts.filter(a=>a.severity==='high').length} auffällige oder doppelte Buchung(en) erkannt.`});
    if(contracts.some(c=>c.priority==='high'))actions.push({priority:'high',title:'Kündigungsfrist beachten',detail:contracts.find(c=>c.priority==='high').detail});
    if(forecast.monthEnd.conservative<0)actions.push({priority:'medium',title:'Konservative Prognose negativ',detail:`Ungünstiger Monatsverlauf: ${money(forecast.monthEnd.conservative)}.`});
    if(!actions.length)actions.push({priority:'low',title:'Finanzlage stabil',detail:`Aktuell ${money(safe.safe)} frei; konservatives Monatsende ${money(forecast.monthEnd.conservative)}.`});
    return {safe,forecast,alerts,contracts,upcoming,actions,generatedAt:new Date().toISOString()};
  }

  function categoryTotals(d){const map=new Map();for(const t of monthTx(d)){if(!isPaid(t)||!['expense','refund'].includes(t.type))continue;if(t.splits?.length){for(const s of t.splits)map.set(s.categoryId,(map.get(s.categoryId)||0)+(t.type==='refund'?-1:1)*num(s.amount))}else map.set(t.categoryId,(map.get(t.categoryId)||0)+expenseOf(t))}return [...map].map(([id,value])=>({id,name:categoryName(id),value:Math.max(0,euros(cents(value)))})).sort((a,b)=>b.value-a.value)}

  function generateMonthlyReport(target=new Date(new Date().getFullYear(),new Date().getMonth()-1,1),persist=true){
    ensurePremiumData();const d=new Date(target.getFullYear(),target.getMonth(),1),prev=new Date(d.getFullYear(),d.getMonth()-1,1),s=monthSummary(d),ps=monthSummary(prev),cats=categoryTotals(d),prevCats=categoryTotals(prev),prevMap=new Map(prevCats.map(x=>[x.id,x.value])),changes=cats.map(x=>({...x,previous:prevMap.get(x.id)||0,diff:x.value-(prevMap.get(x.id)||0)})).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff)).slice(0,5),report={id:`report:${monthKey(d)}`,month:monthKey(d),createdAt:new Date().toISOString(),income:euros(cents(s.income)),expense:euros(cents(s.expense)),savings:euros(cents(s.income-s.expense)),previous:{income:euros(cents(ps.income)),expense:euros(cents(ps.expense))},topCategories:cats.slice(0,5),changes,netWorth:typeof netWorthAtDate==='function'?netWorthAtDate(new Date(d.getFullYear(),d.getMonth()+1,0)):0,anomalies:anomalies({months:6,limit:5}),score:typeof financeScore==='function'?financeScore():null};if(persist){const i=data.monthlyReports.findIndex(r=>r.id===report.id);if(i>=0)data.monthlyReports[i]=report;else data.monthlyReports.push(report)}return report;
  }

  function annualCompare(year=new Date().getFullYear()){
    const calc=y=>{let income=0,expense=0;const months=[];for(let m=0;m<12;m++){const s=monthSummary(new Date(y,m,1));income+=s.income;expense+=s.expense;months.push({month:m+1,income:euros(cents(s.income)),expense:euros(cents(s.expense))})}return {year:y,income:euros(cents(income)),expense:euros(cents(expense)),savings:euros(cents(income-expense)),months}};const current=calc(year),previous=calc(year-1),inflation=num(data.settings.inflationByYear?.[year]??0),realPreviousExpense=previous.expense*(1+inflation/100);return {current,previous,inflation,realPreviousExpense:euros(cents(realPreviousExpense)),expenseChange:euros(cents(current.expense-previous.expense)),realExpenseChange:euros(cents(current.expense-realPreviousExpense)),incomeChange:euros(cents(current.income-previous.income))};
  }

  function assetValueAt(asset,date=new Date()){
    const hist=(asset.valuations||[]).filter(v=>!v.date||new Date(v.date)<=date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));if(hist.length)return num(hist.at(-1).value);if(asset.type==='security')return num(asset.quantity)*num(asset.currentPrice);return num(asset.currentValue||asset.value);
  }
  function assetTotalAt(date=new Date()){return euros((data.assets||[]).filter(a=>a.active!==false).reduce((s,a)=>s+cents(assetValueAt(a,date)),0))}
  function assetAllocation(){const total=assetTotalAt()||1,map=new Map();for(const a of data.assets||[]){if(a.active===false)continue;const k=a.type||'other',v=assetValueAt(a);map.set(k,(map.get(k)||0)+v)}return [...map].map(([type,value])=>({type,value:euros(cents(value)),share:value/total*100})).sort((a,b)=>b.value-a.value)}

  const baseNw=typeof netWorthAtDate==='function'?netWorthAtDate:null;if(baseNw){netWorthAtDate=function(date=new Date()){return euros(cents(baseNw(date)+assetTotalAt(date)))}}
  if(typeof netWorth==='function'){netWorth=function(){return netWorthAtDate(new Date())}}

  function upsertAsset(asset){ensurePremiumData();const x={id:asset.id||uid('asset'),name:String(asset.name||'Vermögenswert'),type:asset.type||'other',currentValue:num(asset.currentValue),quantity:num(asset.quantity),currentPrice:num(asset.currentPrice),currency:asset.currency||'EUR',note:asset.note||'',active:asset.active!==false,valuations:Array.isArray(asset.valuations)?asset.valuations:[]};if(!x.valuations.some(v=>v.date===localISO(new Date())))x.valuations.push({date:localISO(new Date()),value:assetValueAt(x)});const i=data.assets.findIndex(a=>a.id===x.id);if(i>=0)data.assets[i]=x;else data.assets.push(x);return x}

  function maybeCreatePreviousMonthReport(){ensurePremiumData();if(!data.settings.premium?.monthlyReport)return false;const d=new Date(new Date().getFullYear(),new Date().getMonth()-1,1),id=`report:${monthKey(d)}`;if(data.monthlyReports.some(r=>r.id===id))return false;generateMonthlyReport(d,true);return true}

  window.FinanzPremium={VERSION,ensurePremiumData,variableExpenseByMonth,uncertaintyForecast,anomalies,contractOptimization,autopilot,generateMonthlyReport,annualCompare,assetValueAt,assetTotalAt,assetAllocation,upsertAsset,maybeCreatePreviousMonthReport,quantile,median:med,mad,clone};
  ensurePremiumData();
})();
