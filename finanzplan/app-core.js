'use strict';
const STORE_KEY='finanzplan:data:v1';
const SNAP_KEY='finanzplan:snapshots:v1';
const APP_VERSION='1.0.0';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const uid=(p='id')=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const now=new Date();
const pad=n=>String(n).padStart(2,'0');
const localISO=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const monthKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const parseDate=s=>{const [y,m,d]=String(s).slice(0,10).split('-').map(Number);return new Date(y,m-1,d||1)};
const monthStart=d=>new Date(d.getFullYear(),d.getMonth(),1);
const monthEnd=d=>new Date(d.getFullYear(),d.getMonth()+1,0);
const addMonths=(d,n)=>new Date(d.getFullYear(),d.getMonth()+n,Math.min(d.getDate(),28));
const daysInMonth=d=>new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const num=v=>Number(String(v??0).replace(',','.'))||0;
const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(num(v));
const shortMoney=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(num(v));
const pct=v=>`${Math.round(num(v))}%`;
const fmtDate=s=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'short',year:'numeric'}).format(parseDate(s));
const fmtMonth=d=>new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(d);
const escapeHTML=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const safeJSON=s=>{try{return JSON.parse(s)}catch{return null}};
const download=(name,content,type='text/plain;charset=utf-8')=>{const b=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
const categoryColors=['#3565ff','#ff5f7d','#9a5cff','#ff9d2e','#20bd8a','#55bce8','#e9c94f','#7c8aa5','#e66fc0','#4ba56a','#d35c4f','#6e7df4'];

function defaultData(){
  const y=now.getFullYear(),m=now.getMonth();
  const d=n=>localISO(new Date(y,m,n));
  const last=(mo,day)=>localISO(new Date(y,m-mo,day));
  return {
    version:APP_VERSION,
    createdAt:new Date().toISOString(),
    household:{name:'Mein Haushalt',currency:'EUR',locale:'de-DE'},
    members:[
      {id:'m1',name:'Ich',role:'admin',active:true},
      {id:'m2',name:'Partner/in',role:'adult',active:true},
      {id:'m3',name:'Kinder',role:'limited',active:true}
    ],
    accounts:[
      {id:'a1',name:'Girokonto',type:'checking',balance:2450.75,includeNetWorth:true},
      {id:'a2',name:'Tagesgeld',type:'savings',balance:8200,includeNetWorth:true},
      {id:'a3',name:'PayPal',type:'wallet',balance:120,includeNetWorth:true},
      {id:'a4',name:'Kreditkarte',type:'credit',balance:-320,includeNetWorth:true}
    ],
    categories:[
      {id:'c_income_salary',name:'Gehalt',kind:'income',parent:null,color:'#18b979'},
      {id:'c_income_other',name:'Weitere Einnahmen',kind:'income',parent:null,color:'#45c49b'},
      {id:'c_home',name:'Wohnen',kind:'expense',parent:null,color:categoryColors[0]},
      {id:'c_food',name:'Lebensmittel',kind:'expense',parent:null,color:categoryColors[1]},
      {id:'c_mob',name:'Mobilität',kind:'expense',parent:null,color:categoryColors[2]},
      {id:'c_leisure',name:'Freizeit',kind:'expense',parent:null,color:categoryColors[3]},
      {id:'c_subs',name:'Abos & Verträge',kind:'expense',parent:null,color:categoryColors[4]},
      {id:'c_kids',name:'Kinder',kind:'expense',parent:null,color:categoryColors[5]},
      {id:'c_ins',name:'Versicherungen',kind:'expense',parent:null,color:categoryColors[6]},
      {id:'c_health',name:'Gesundheit',kind:'expense',parent:null,color:categoryColors[8]},
      {id:'c_clothes',name:'Kleidung',kind:'expense',parent:null,color:categoryColors[9]},
      {id:'c_debt',name:'Kredite',kind:'expense',parent:null,color:categoryColors[10]},
      {id:'c_other',name:'Sonstiges',kind:'expense',parent:null,color:categoryColors[7]},
      {id:'c_fuel',name:'Tanken',kind:'expense',parent:'c_mob',color:'#814df3'},
      {id:'c_restaurant',name:'Restaurant',kind:'expense',parent:'c_leisure',color:'#f4a126'}
    ],
    transactions:[
      {id:uid('tx'),date:d(2),title:'Gehalt',amount:2950,type:'income',categoryId:'c_income_salary',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:['regelmäßig']},
      {id:uid('tx'),date:d(3),title:'Miete / Hausrate',amount:700,type:'expense',categoryId:'c_home',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:['fixkosten']},
      {id:uid('tx'),date:d(5),title:'Stromabschlag',amount:85,type:'expense',categoryId:'c_home',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:['fixkosten']},
      {id:uid('tx'),date:d(7),title:'REWE Supermarkt',amount:78.23,type:'expense',categoryId:'c_food',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:[]},
      {id:uid('tx'),date:d(10),title:'Tankstelle',amount:60,type:'expense',categoryId:'c_fuel',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:[]},
      {id:uid('tx'),date:d(11),title:'Netflix',amount:15.99,type:'expense',categoryId:'c_subs',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:['abo']},
      {id:uid('tx'),date:d(12),title:'Spotify',amount:9.99,type:'expense',categoryId:'c_subs',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:['abo']},
      {id:uid('tx'),date:last(1,2),title:'Gehalt',amount:2950,type:'income',categoryId:'c_income_salary',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:['regelmäßig']},
      {id:uid('tx'),date:last(1,7),title:'Lebensmittel',amount:520,type:'expense',categoryId:'c_food',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:[]},
      {id:uid('tx'),date:last(1,10),title:'Mobilität',amount:280,type:'expense',categoryId:'c_mob',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:[]},
      {id:uid('tx'),date:last(2,2),title:'Gehalt',amount:2900,type:'income',categoryId:'c_income_salary',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:['regelmäßig']},
      {id:uid('tx'),date:last(2,9),title:'Haushalt & Leben',amount:1620,type:'expense',categoryId:'c_other',accountId:'a1',memberId:'m1',status:'paid',note:'',tags:[]}
    ],
    recurring:[
      {id:'r1',title:'Gehalt',amount:2950,type:'income',categoryId:'c_income_salary',accountId:'a1',memberId:'m1',frequency:'monthly',interval:1,day:2,start:d(1),end:'',active:true,estimate:false},
      {id:'r2',title:'Miete / Hausrate',amount:700,type:'expense',categoryId:'c_home',accountId:'a1',memberId:'m1',frequency:'monthly',interval:1,day:3,start:d(1),end:'',active:true,estimate:false},
      {id:'r3',title:'Stromabschlag',amount:85,type:'expense',categoryId:'c_home',accountId:'a1',memberId:'m1',frequency:'monthly',interval:1,day:5,start:d(1),end:'',active:true,estimate:true},
      {id:'r4',title:'Netflix',amount:15.99,type:'expense',categoryId:'c_subs',accountId:'a1',memberId:'m1',frequency:'monthly',interval:1,day:11,start:d(1),end:'',active:true,estimate:false},
      {id:'r5',title:'Kfz-Versicherung',amount:330,type:'expense',categoryId:'c_ins',accountId:'a1',memberId:'m1',frequency:'semiannual',interval:6,day:15,start:localISO(new Date(y,m-2,15)),end:'',active:true,estimate:false},
      {id:'r6',title:'Rundfunkbeitrag',amount:55.08,type:'expense',categoryId:'c_home',accountId:'a1',memberId:'m1',frequency:'quarterly',interval:3,day:15,start:localISO(new Date(y,m-1,15)),end:'',active:true,estimate:false}
    ],
    budgets:[
      {id:'b1',name:'Wohnen',categoryId:'c_home',amount:900,period:'monthly',warning:80},
      {id:'b2',name:'Lebensmittel',categoryId:'c_food',amount:600,period:'monthly',warning:80},
      {id:'b3',name:'Mobilität',categoryId:'c_mob',amount:350,period:'monthly',warning:80},
      {id:'b4',name:'Freizeit',categoryId:'c_leisure',amount:300,period:'monthly',warning:80}
    ],
    goals:[
      {id:'g1',name:'Urlaub',target:4000,current:2350,targetDate:localISO(new Date(y+1,5,1)),icon:'☀',type:'goal'},
      {id:'g2',name:'Notgroschen',target:7800,current:4300,targetDate:localISO(new Date(y+1,11,31)),icon:'☂',type:'emergency'}
    ],
    reserves:[
      {id:'res1',name:'Auto & Reparaturen',target:2400,current:900,monthly:120},
      {id:'res2',name:'Weihnachten & Geschenke',target:1200,current:430,monthly:100}
    ],
    contracts:[
      {id:'co1',name:'Netflix',provider:'Netflix',amount:15.99,frequency:'monthly',categoryId:'c_subs',nextDate:d(11),start:last(8,11),end:'',noticeDays:30,type:'subscription',active:true},
      {id:'co2',name:'Spotify Premium',provider:'Spotify',amount:9.99,frequency:'monthly',categoryId:'c_subs',nextDate:d(12),start:last(12,12),end:'',noticeDays:30,type:'subscription',active:true},
      {id:'co3',name:'Internet',provider:'Provider',amount:46,frequency:'monthly',categoryId:'c_subs',nextDate:d(20),start:last(18,20),end:'',noticeDays:90,type:'contract',active:true}
    ],
    insurances:[
      {id:'i1',name:'Haftpflicht',provider:'Versicherung',amount:82,frequency:'annual',nextDate:localISO(new Date(y,m+2,1)),policyNo:'',noticeDays:90},
      {id:'i2',name:'Kfz-Versicherung',provider:'Versicherung',amount:330,frequency:'semiannual',nextDate:localISO(new Date(y,m+1,15)),policyNo:'',noticeDays:30}
    ],
    debts:[
      {id:'de1',name:'Hauskredit',principal:5800,balance:5800,rate:700,interest:2.4,start:last(42,1),accountId:'a1'},
      {id:'de2',name:'Gartenkredit',principal:6500,balance:3200,rate:210,interest:5.1,start:last(24,1),accountId:'a1'}
    ],
    projects:[
      {id:'p1',name:'Sommerurlaub',budget:2500,spent:680,start:d(1),end:localISO(new Date(y,m+2,30)),categoryIds:['c_leisure','c_food','c_mob']}
    ],
    monthClosures:[],
    documents:[],
    notifications:[],
    integrations:{bank:{provider:'',connected:false,lastSync:null},ai:{provider:'local',apiKeyConfigured:false},push:{enabled:false}},
    settings:{theme:'light',privacy:false,notifications:false,pinHash:'',vault:false,dashboardWidgets:['metrics','forecast','trend','transactions','categories','budgets','insights'],autoSnapshots:true},
    assistantLog:[{role:'bot',text:'Hallo! Ich analysiere deine lokalen Finanzdaten. Frage mich z. B. „Warum war dieser Monat teuer?“, „Wie hoch sind meine Fixkosten?“ oder „Wie viel gebe ich fürs Auto aus?“'}]
  };
}

let data=loadData();
let selectedMonth=monthStart(now);
let currentView='dashboard';
let txFilters={q:'',type:'all',category:'all',status:'all'};

function loadData(){
  const raw=localStorage.getItem(STORE_KEY);const parsed=raw?safeJSON(raw):null;
  return parsed&&parsed.version?parsed:defaultData();
}
function saveData(reason='Änderung gespeichert'){
  data.version=APP_VERSION;data.updatedAt=new Date().toISOString();localStorage.setItem(STORE_KEY,JSON.stringify(data));
  if(data.settings.autoSnapshots) autoSnapshot();
  renderAll(); if(reason) toast(reason,'success');
}
function autoSnapshot(){
  const snaps=safeJSON(localStorage.getItem(SNAP_KEY))||[];const last=snaps[0];
  if(last&&Date.now()-new Date(last.at).getTime()<5*60*1000)return;
  snaps.unshift({at:new Date().toISOString(),data:JSON.stringify(data)});localStorage.setItem(SNAP_KEY,JSON.stringify(snaps.slice(0,10)));
}
function getCat(id){return data.categories.find(x=>x.id===id)||{name:'Ohne Kategorie',color:'#7c8aa5',kind:'expense'}}
function getAccount(id){return data.accounts.find(x=>x.id===id)||{name:'Unbekannt'}}
function getMember(id){return data.members.find(x=>x.id===id)||{name:'Gemeinsam'}}
function txForMonth(d=selectedMonth){const k=monthKey(d);return data.transactions.filter(t=>String(t.date).slice(0,7)===k)}
function signed(t){return t.type==='income'?num(t.amount):t.type==='expense'?-num(t.amount):0}
function sumTx(arr,type,statuses=['paid']){return arr.filter(t=>(!type||t.type===type)&&statuses.includes(t.status||'paid')).reduce((a,t)=>a+num(t.amount),0)}
function descendants(catId){const ids=[catId];for(const c of data.categories)if(c.parent===catId)ids.push(c.id);return ids}
function monthlyEquivalent(item){const a=num(item.amount);const f=item.frequency||item.period||'monthly';return f==='weekly'?a*52/12:f==='biweekly'?a*26/12:f==='quarterly'?a/3:f==='semiannual'?a/6:f==='annual'?a/12:a}
function recurringDueInMonth(r,d){
  if(!r.active)return false;const start=parseDate(r.start||localISO(now));const end=r.end?parseDate(r.end):null;const ms=monthStart(d),me=monthEnd(d);if(start>me||(end&&end<ms))return false;
  const diff=(ms.getFullYear()-start.getFullYear())*12+(ms.getMonth()-start.getMonth());const interval=num(r.interval)||({quarterly:3,semiannual:6,annual:12}[r.frequency]||1);return diff>=0&&diff%interval===0;
}
function recurringDate(r,d){return localISO(new Date(d.getFullYear(),d.getMonth(),clamp(num(r.day)||1,1,daysInMonth(d))))}
function generateRecurringForMonth(d=selectedMonth){
  let changed=false;for(const r of data.recurring){if(!recurringDueInMonth(r,d))continue;const rk=`${r.id}:${monthKey(d)}`;if(data.transactions.some(t=>t.recurringKey===rk))continue;
    data.transactions.push({id:uid('tx'),recurringKey:rk,date:recurringDate(r,d),title:r.title,amount:num(r.amount),type:r.type,categoryId:r.categoryId,accountId:r.accountId,memberId:r.memberId,status:parseDate(recurringDate(r,d))<=now?'planned':'planned',estimated:!!r.estimate,note:'Automatisch aus Planung',tags:['regelmäßig']});changed=true;
  }if(changed)localStorage.setItem(STORE_KEY,JSON.stringify(data));
}
function monthSummary(d=selectedMonth){
  const tx=txForMonth(d);const paid=tx.filter(t=>(t.status||'paid')==='paid');const income=sumTx(paid,'income');const expense=sumTx(paid,'expense');const plannedIncome=sumTx(tx,'income',['planned']);const plannedExpense=sumTx(tx,'expense',['planned']);
  const totalExpectedIncome=income+plannedIncome,totalExpectedExpense=expense+plannedExpense;
  return {tx,paid,income,expense,balance:income-expense,plannedIncome,plannedExpense,totalExpectedIncome,totalExpectedExpense,forecast:totalExpectedIncome-totalExpectedExpense};
}
function netWorth(){return data.accounts.filter(a=>a.includeNetWorth!==false).reduce((s,a)=>s+num(a.balance),0)-data.debts.reduce((s,d)=>s+num(d.balance),0)}
function fixedMonthly(){return data.recurring.filter(r=>r.active&&r.type==='expense').reduce((s,r)=>s+monthlyEquivalent(r),0)}
function savingsRate(d=selectedMonth){const s=monthSummary(d);return s.income?clamp((s.balance/s.income)*100,-999,100):0}
function financeScore(){
  const s=monthSummary();const income=Math.max(s.totalExpectedIncome,1);const fixed=clamp(fixedMonthly()/income,0,1);const sr=clamp(savingsRate()/20,0,1);const emergency=data.goals.find(g=>g.type==='emergency');const er=emergency?clamp(emergency.current/emergency.target,0,1):0;const debt=Math.max(0,1-clamp(data.debts.reduce((x,d)=>x+num(d.balance),0)/(income*12),0,1));return Math.round(100*(sr*.3+(1-fixed)*.25+er*.25+debt*.2));
}
function categorySpend(catId,d=selectedMonth){const ids=descendants(catId);return txForMonth(d).filter(t=>t.type==='expense'&&(t.status||'paid')==='paid'&&ids.includes(t.categoryId)).reduce((s,t)=>s+num(t.amount),0)}
function categoryBreakdown(d=selectedMonth){const top=data.categories.filter(c=>c.kind==='expense'&&!c.parent);const all=top.map(c=>({cat:c,value:categorySpend(c.id,d)})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value);return all}
function accountTotal(){return data.accounts.reduce((s,a)=>s+num(a.balance),0)}
function daysRemaining(){if(monthKey(selectedMonth)!==monthKey(now))return daysInMonth(selectedMonth);return Math.max(0,daysInMonth(now)-now.getDate())}