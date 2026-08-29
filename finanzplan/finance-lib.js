(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FinanceLib=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseISO=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3]);return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]?d:null};
  const daysInMonth=(y,m)=>new Date(y,m+1,0).getDate();
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

  function parseMoney(value){
    if(typeof value==='number')return Number.isFinite(value)?value:0;
    let s=String(value??'').trim();if(!s)return 0;
    let neg=/^\(.*\)$/.test(s)||/^\s*-/.test(s)||s.includes('−');
    s=s.replace(/[()\s\u00A0\u202F€$£CHFUSDGBP]/gi,'').replace(/−/g,'-').replace(/[^0-9,.'-]/g,'');
    s=s.replace(/'/g,'');
    const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
    let dec=null;
    if(comma>=0&&dot>=0)dec=comma>dot?',':'.';
    else if(comma>=0){const tail=s.length-comma-1;dec=tail>0&&tail<=2?',':null}
    else if(dot>=0){const tail=s.length-dot-1;dec=tail>0&&tail<=2?'.':null}
    if(dec){const other=dec===','?'.':',';s=s.split(other).join('');const i=s.lastIndexOf(dec);s=s.slice(0,i).split(dec).join('')+'.'+s.slice(i+1)}
    else s=s.replace(/[,.]/g,'');
    const n=Math.abs(Number(s.replace(/-/g,''))||0);return neg?-n:n;
  }

  function normalizeDate(value){
    if(value instanceof Date&&!isNaN(value))return iso(value);
    if(typeof value==='number'&&value>20000&&value<80000){const epoch=new Date(1899,11,30);epoch.setDate(epoch.getDate()+Math.round(value));return iso(epoch)}
    const s=String(value??'').trim();if(!s)return '';
    const direct=parseISO(s.slice(0,10));if(direct)return iso(direct);
    let m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/);
    if(m){let y=+m[3];if(y<100)y+=y<70?2000:1900;const d=new Date(y,+m[2]-1,+m[1]);if(d.getFullYear()===y&&d.getMonth()===+m[2]-1&&d.getDate()===+m[1])return iso(d)}
    m=s.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);if(m){const d=new Date(+m[1],+m[2]-1,+m[3]);if(!isNaN(d))return iso(d)}
    return '';
  }

  function addMonths(date,n){const y=date.getFullYear(),m=date.getMonth()+n,day=date.getDate();return new Date(y,m,Math.min(day,daysInMonth(y,m)))}
  function addFrequency(date,frequency,count=1){const d=new Date(date);if(frequency==='weekly')d.setDate(d.getDate()+7*count);else if(frequency==='biweekly')d.setDate(d.getDate()+14*count);else if(frequency==='quarterly')return addMonths(d,3*count);else if(frequency==='semiannual')return addMonths(d,6*count);else if(frequency==='annual')return addMonths(d,12*count);else return addMonths(d,count);return d}
  function frequencyMonths(f){return f==='quarterly'?3:f==='semiannual'?6:f==='annual'?12:1}

  function recurrenceDates(rule,fromISO,toISO){
    const start=parseISO(normalizeDate(rule.start)||fromISO),end=rule.end?parseISO(normalizeDate(rule.end)):null,from=parseISO(normalizeDate(fromISO)),to=parseISO(normalizeDate(toISO));if(!start||!from||!to||from>to||rule.active===false)return[];
    const out=[],min=from>start?from:start,max=end&&end<to?end:to;if(min>max)return out;
    const freq=rule.frequency||'monthly';
    if(freq==='weekly'||freq==='biweekly'){
      const step=freq==='weekly'?7:14,dayMs=86400000;let cur=new Date(start);if(cur<min){const delta=Math.floor((min-cur)/dayMs),jump=Math.floor(delta/step);cur.setDate(cur.getDate()+jump*step);while(cur<min)cur.setDate(cur.getDate()+step)}
      while(cur<=max){out.push(iso(cur));cur=new Date(cur);cur.setDate(cur.getDate()+step)}return out;
    }
    const interval=frequencyMonths(freq),anchorMonth=start.getFullYear()*12+start.getMonth();let cursor=new Date(min.getFullYear(),min.getMonth(),1),last=new Date(max.getFullYear(),max.getMonth(),1);const day=clamp(Number(rule.day)||start.getDate(),1,31);
    while(cursor<=last){const cm=cursor.getFullYear()*12+cursor.getMonth(),diff=cm-anchorMonth;if(diff>=0&&diff%interval===0){const candidate=new Date(cursor.getFullYear(),cursor.getMonth(),Math.min(day,daysInMonth(cursor.getFullYear(),cursor.getMonth())));if(candidate>=min&&candidate<=max)out.push(iso(candidate))}cursor=addMonths(cursor,1)}
    return out;
  }

  function normalizeText(s){return String(s??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
  function fnv1a(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}return (h>>>0).toString(16).padStart(8,'0')}
  function fingerprint(tx){const key=[normalizeDate(tx.date),Math.round(Math.abs(parseMoney(tx.amount))*100),tx.type||'',normalizeText(tx.merchant||tx.title||''),tx.accountId||''].join('|');return fnv1a(key)}

  function debtSchedule({balance,annualRate=0,monthlyPayment=0,startDate,extraPayments=[]},maxMonths=1200){
    let bal=Math.max(0,parseMoney(balance)),rate=Math.max(0,Number(annualRate)||0)/100/12,pay=Math.max(0,parseMoney(monthlyPayment)),date=parseISO(normalizeDate(startDate))||new Date(),rows=[],month=0;const extras=new Map(extraPayments.map(x=>[normalizeDate(x.date),Math.max(0,parseMoney(x.amount))]));
    if(pay<=0)return rows;
    while(bal>0.005&&month<maxMonths){date=addMonths(date,1);const interest=bal*rate,extra=extras.get(iso(date))||0,scheduled=Math.min(pay,bal+interest),principal=Math.max(0,scheduled-interest),extraApplied=Math.min(extra,Math.max(0,bal-principal));bal=Math.max(0,bal-principal-extraApplied);rows.push({date:iso(date),payment:scheduled,interest,principal,extra:extraApplied,balance:bal});month++;if(rate>0&&pay<=interest&&extraApplied===0)break}
    return rows;
  }

  function monthsRunway(liquid,monthlyEssentials){const e=Math.max(0,parseMoney(monthlyEssentials));return e?Math.max(0,parseMoney(liquid))/e:Infinity}
  function safeToSpend({liquid=0,plannedIncome=0,plannedExpense=0,earmarked=0}){return parseMoney(liquid)+parseMoney(plannedIncome)-parseMoney(plannedExpense)-Math.max(0,parseMoney(earmarked))}
  function dailyBudget({safe=0,days=1}){return Math.max(0,parseMoney(safe))/Math.max(1,Number(days)||1)}
  function cancellationDeadline(endDate,noticeDays){const d=parseISO(normalizeDate(endDate));if(!d)return '';d.setDate(d.getDate()-Math.max(0,Number(noticeDays)||0));return iso(d)}
  function similarity(a,b){a=normalizeText(a);b=normalizeText(b);if(!a||!b)return 0;if(a===b)return 1;const A=new Set(a.split(' ')),B=new Set(b.split(' ')),inter=[...A].filter(x=>B.has(x)).length,union=new Set([...A,...B]).size;return union?inter/union:0}

  return {parseMoney,normalizeDate,parseISO,iso,addMonths,addFrequency,recurrenceDates,fingerprint,normalizeText,fnv1a,debtSchedule,monthsRunway,safeToSpend,dailyBudget,cancellationDeadline,similarity};
});