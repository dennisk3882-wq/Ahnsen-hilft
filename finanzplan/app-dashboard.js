'use strict';
function renderAll(){
  ensureAccountBases();
  document.body.classList.toggle('dark',data.settings.theme==='dark');
  document.body.classList.toggle('privacy',!!data.settings.privacy);
  $('#monthLabel').textContent=fmtMonth(selectedMonth);
  renderSidebarAccounts();renderDashboard();renderTransactions();renderPlanning();renderBudgets();renderWealth();renderContracts();renderGoals();renderCalendar();renderStats();renderAssistant();renderMore();renderSettings();updateNav();
}
function renderSidebarAccounts(){
  $('#sidebarAccounts').innerHTML=data.accounts.slice(0,5).map(a=>`<div class="side-account"><b>${escapeHTML(a.name)}</b><span class="money">${money(accountBalance(a))}</span></div>`).join('');
}
function updateNav(){
  $$('.nav-item,[data-view].profile-card,.mobile-nav button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${currentView}`));
  const titles={dashboard:['Übersicht','Deine Finanzen im Überblick'],transactions:['Transaktionen','Alle Einnahmen, Ausgaben und Umbuchungen'],planning:['Planung','Regelmäßige Einnahmen, Fixkosten und Prognosen'],budgets:['Budgets','Deine monatlichen Grenzen und Projektbudgets'],wealth:['Vermögen','Konten, Rücklagen, Schulden und Nettovermögen'],contracts:['Verträge & Abos','Laufende Kosten, Versicherungen und Fristen'],goals:['Sparziele','Ziele, Rücklagen und Notgroschen'],calendar:['Finanzkalender','Alle kommenden Geldbewegungen auf einen Blick'],stats:['Statistiken','Monats-, Jahres- und Kategorieanalysen'],assistant:['Finanzassistent','Lokale Analyse deiner Haushaltsdaten'],more:['Mehr','Dokumente, Import, Export und Werkzeuge'],settings:['Einstellungen','Sicherheit, Darstellung und Haushalt']};
  const [t,s]=titles[currentView]||titles.dashboard;$('#pageTitle').textContent=t;$('#pageSubtitle').textContent=s;
}
function metric(label,value,cls,note,icon='•',spark=[]){
  const pts=spark.length?spark:[0,1,0,2,1,2];const min=Math.min(...pts),max=Math.max(...pts);const coords=pts.map((v,i)=>`${(i/(pts.length-1))*100},${24-((v-min)/(max-min||1))*20}`).join(' ');
  return `<article class="metric-card"><div class="metric-head"><span class="metric-label">${label}</span><span class="metric-icon">${icon}</span></div><strong class="metric-value money ${cls}">${value}</strong><div class="spark"><svg viewBox="0 0 100 28" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="1.8" vector-effect="non-scaling-stroke" class="${cls}"/></svg></div><small class="metric-note">${note}</small></article>`;
}
function history(n=6){const out=[];for(let i=n-1;i>=0;i--){const d=monthStart(addMonths(selectedMonth,-i)),s=monthSummary(d);out.push({d,income:s.income,expense:s.expense,balance:s.balance})}return out}
function lineChart(hist){
  const w=760,h=260,p=36,max=Math.max(1000,...hist.flatMap(x=>[x.income,x.expense]))*1.08;const x=i=>p+i*((w-p*2)/(Math.max(1,hist.length-1)));const y=v=>h-p-(v/max)*(h-p*2);const poly=key=>hist.map((v,i)=>`${x(i)},${y(v[key])}`).join(' ');
  const grid=[0,.25,.5,.75,1].map(v=>`<line x1="${p}" x2="${w-p}" y1="${y(max*v)}" y2="${y(max*v)}" stroke="var(--line)"/><text x="2" y="${y(max*v)+4}" fill="var(--muted)" font-size="10">${shortMoney(max*v)}</text>`).join('');
  const labels=hist.map((v,i)=>`<text x="${x(i)}" y="${h-8}" text-anchor="middle" fill="var(--muted)" font-size="10">${new Intl.DateTimeFormat('de-DE',{month:'short'}).format(v.d)}</text>`).join('');
  return `<svg class="line-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Einnahmen und Ausgaben im Zeitverlauf">${grid}<polyline points="${poly('income')}" fill="none" stroke="var(--green)" stroke-width="3"/><polyline points="${poly('expense')}" fill="none" stroke="var(--red)" stroke-width="3"/>${hist.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v.income)}" r="4" fill="var(--panel)" stroke="var(--green)" stroke-width="3"/><circle cx="${x(i)}" cy="${y(v.expense)}" r="4" fill="var(--panel)" stroke="var(--red)" stroke-width="3"/>`).join('')}${labels}</svg>`;
}
function donutHTML(items,total){
  if(!total)return `<div class="empty">Noch keine Ausgaben in diesem Monat.</div>`;let at=0;const stops=[];items.slice(0,7).forEach((x,i)=>{const start=at;at+=x.value/total*100;stops.push(`${x.cat.color||categoryColors[i]} ${start}% ${at}%`)});
  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops.join(',')})"><div class="donut-center"><b class="money">${money(total)}</b><small>Gesamt</small></div></div><div class="donut-legend">${items.slice(0,7).map(x=>`<div class="legend-row"><span><i class="dot" style="background:${x.cat.color}"></i>${escapeHTML(x.cat.name)}</span><b class="money">${money(x.value)} · ${Math.round(x.value/total*100)}%</b></div>`).join('')}</div></div>`;
}
function insights(){
  const out=[],s=monthSummary(),prev=monthSummary(addMonths(selectedMonth,-1));
  if(prev.expense&&s.expense>prev.expense*1.1)out.push({i:'↑',t:'Ausgaben gestiegen',p:`Du hast aktuell ${Math.round((s.expense/prev.expense-1)*100)} % mehr ausgegeben als im Vormonat.`});
  const biggest=categoryBreakdown()[0];if(biggest)out.push({i:'◎',t:`Größter Bereich: ${biggest.cat.name}`,p:`${money(biggest.value)} bzw. ${s.expense?Math.round(biggest.value/s.expense*100):0} % deiner bisherigen Monatsausgaben.`});
  if(s.forecast>0)out.push({i:'✓',t:'Monatsprognose positiv',p:`Nach allen bekannten geplanten Buchungen bleiben voraussichtlich ${money(s.forecast)} übrig.`});else out.push({i:'!',t:'Monatsprognose kritisch',p:`Bekannte Zahlungen ergeben derzeit ${money(s.forecast)} zum Monatsende.`});
  const fixed=fixedMonthly();if(s.totalExpectedIncome)out.push({i:'▣',t:'Fixkostenquote',p:`Deine hinterlegten Fixkosten entsprechen etwa ${Math.round(fixed/s.totalExpectedIncome*100)} % der erwarteten Einnahmen.`});
  return out.slice(0,4);
}
function renderDashboard(){
  const root=$('#view-dashboard'),s=monthSummary(),hist=history(7),breakdown=categoryBreakdown(),budgetTotal=data.budgets.reduce((x,b)=>x+num(b.amount),0),budgetSpent=data.budgets.reduce((x,b)=>x+categorySpend(b.categoryId),0);const score=financeScore();
  root.innerHTML=`
    <div class="metrics-grid">
      ${metric('Einnahmen',money(s.income),'positive',`${money(s.plannedIncome)} noch geplant`,'↑',hist.map(x=>x.income))}
      ${metric('Ausgaben',money(s.expense),'negative',`${money(s.plannedExpense)} noch geplant`,'↓',hist.map(x=>x.expense))}
      ${metric('Saldo',money(s.balance),s.balance>=0?'neutral':'negative',`${pct(savingsRate())} Sparquote`,'◉',hist.map(x=>x.balance))}
      ${metric('Monatsbudget',money(budgetTotal),'',`${pct(budgetTotal?budgetSpent/budgetTotal*100:0)} verwendet`,'▣',hist.map(x=>x.expense))}
      ${metric('Nettovermögen',money(netWorth()),netWorth()>=0?'positive':'negative',`Finanz-Score ${score}/100`,'◇',netWorthHistory().map(x=>x.value))}
    </div>
    <div class="forecast-banner">
      <div class="forecast-item"><small>Heute auf Konten</small><strong class="money">${money(accountTotal())}</strong></div>
      <div class="forecast-item"><small>Noch erwartete Einnahmen</small><strong class="positive money">+${money(s.plannedIncome)}</strong></div>
      <div class="forecast-item"><small>Noch erwartete Ausgaben</small><strong class="negative money">-${money(s.plannedExpense)}</strong></div>
      <div class="forecast-item"><small>Prognose Monatsende</small><strong class="${s.forecast>=0?'positive':'negative'} money">${money(s.forecast)}</strong></div>
    </div>
    <div class="grid dashboard-main" style="margin-top:16px">
      <article class="card chart-card"><div class="card-title-row"><div><h2>Einnahmen & Ausgaben</h2><p>Entwicklung der letzten Monate</p></div><div class="chart-legend"><span><i class="dot green"></i>Einnahmen</span><span><i class="dot red"></i>Ausgaben</span></div></div>${lineChart(hist)}</article>
      <article class="card"><div class="card-title-row"><div><h2>Ausgaben nach Kategorie</h2><p>${fmtMonth(selectedMonth)}</p></div></div>${donutHTML(breakdown,s.expense)}</article>
    </div>
    <div class="grid dashboard-lower">
      <article class="card"><div class="card-title-row"><div><h2>Letzte Transaktionen</h2><p>Aktuelle Buchungen</p></div><button class="mini-btn" data-go="transactions">Alle</button></div><div class="transaction-list">${renderTxList(s.tx.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6))}</div></article>
      <article class="card"><div class="card-title-row"><div><h2>Budget Übersicht</h2><p>Verbrauch im laufenden Monat</p></div><button class="mini-btn" data-go="budgets">Budgets</button></div>${data.budgets.slice(0,5).map(renderBudgetProgress).join('')}</article>
      <article class="card"><div class="card-title-row"><div><h2>Intelligente Hinweise</h2><p>Automatisch aus deinen Daten</p></div></div>${insights().map(x=>`<div class="insight"><div class="insight-icon">${x.i}</div><div><b>${escapeHTML(x.t)}</b><p>${escapeHTML(x.p)}</p></div></div>`).join('')}</article>
    </div>`;
  $$('[data-go]',root).forEach(b=>b.onclick=()=>navigate(b.dataset.go));
}
function renderTxList(arr){return arr.length?arr.map(t=>`<div class="list-row"><div class="list-icon">${t.type==='income'?'↗':t.type==='transfer'?'⇄':'↙'}</div><div><strong>${escapeHTML(t.title)}</strong><small>${fmtDate(t.date)} · ${escapeHTML(getCat(t.categoryId).name)} · ${escapeHTML(t.status||'paid')}</small></div><div class="list-amount money ${t.type==='income'?'positive':t.type==='expense'?'negative':''}">${t.type==='income'?'+':t.type==='expense'?'-':''}${money(t.amount)}</div></div>`).join(''):`<div class="empty">Keine Buchungen vorhanden.</div>`}
function renderBudgetProgress(b){const spent=categorySpend(b.categoryId),r=b.amount?spent/b.amount*100:0;return `<div class="progress-block"><div class="progress-head"><span><b>${escapeHTML(b.name)}</b><small> ${money(spent)} / ${money(b.amount)}</small></span><b class="${r>=100?'negative':r>=b.warning?'warn':''}">${pct(r)}</b></div><div class="progress-track"><div class="progress-fill" style="width:${clamp(r,0,100)}%"></div></div></div>`}
