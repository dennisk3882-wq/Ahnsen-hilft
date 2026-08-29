'use strict';
(function(){
  if(!window.FinanzPremium)return;
  const original=window.FinanzPremium;
  function isoDate(value){if(value instanceof Date)return localISO(value);return FinanceLib.normalizeDate(value)||localISO(new Date())}
  function netWorthAt(date=new Date()){
    const iso=isoDate(date),assetDate=date instanceof Date?date:new Date(`${iso}T12:00:00`);
    const accounts=(data.accounts||[]).filter(a=>a.includeNetWorth!==false).reduce((s,a)=>s+accountBalanceAtDate(a,iso),0);
    const debts=(data.debts||[]).reduce((s,d)=>s+debtBalanceAtDate(d,iso),0);
    return Math.round((accounts-debts+original.assetTotalAt(assetDate))*100)/100;
  }
  netWorthAtDate=netWorthAt;
  netWorth=()=>netWorthAt(new Date());

  function autopilot(){
    original.ensurePremiumData();
    const safe=typeof safeToSpendMetrics==='function'?safeToSpendMetrics():{safe:0,perDay:0},forecast=original.uncertaintyForecast(),alerts=original.anomalies(),contracts=original.contractOptimization();
    const start=new Date(),end=new Date(start);end.setDate(end.getDate()+21);
    const upcoming=typeof cashflowEvents==='function'?cashflowEvents(localISO(start),localISO(end)).slice(0,8):[];
    const actions=[];
    if(safe.safe<0)actions.push({priority:'high',title:'Freier Betrag negativ',detail:`Bis Monatsende fehlen voraussichtlich ${money(Math.abs(safe.safe))}.`});
    if(alerts.some(a=>a.severity==='high'))actions.push({priority:'high',title:'Auffällige Buchung prüfen',detail:`${alerts.filter(a=>a.severity==='high').length} auffällige oder doppelte Buchung(en) erkannt.`});
    if(contracts.some(c=>c.priority==='high'))actions.push({priority:'high',title:'Kündigungsfrist beachten',detail:contracts.find(c=>c.priority==='high').detail});
    if(forecast.monthEnd.conservative<0)actions.push({priority:'medium',title:'Konservative Prognose negativ',detail:`Ungünstiger Monatsverlauf: ${money(forecast.monthEnd.conservative)}.`});
    if(!actions.length)actions.push({priority:'low',title:'Finanzlage stabil',detail:`Aktuell ${money(safe.safe)} frei; konservatives Monatsende ${money(forecast.monthEnd.conservative)}.`});
    return {safe,forecast,alerts,contracts,upcoming,actions,generatedAt:new Date().toISOString()};
  }
  window.FinanzPremium.autopilot=autopilot;
  window.FinanzPremium.netWorthAtDate=netWorthAt;
})();
