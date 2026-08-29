'use strict';
(function(){
  const VERSION='3.1.0',baseStart=window.finanzplanV3Start;
  const ageMinutes=iso=>iso?(Date.now()-new Date(iso).getTime())/60000:Infinity;
  async function quiet(label,fn){try{return await fn()}catch(e){console.warn(`V3.1 ${label}`,e);return null}}
  async function startupOnline(){if(!navigator.onLine)return;
    const cloud=data.integrations?.cloud;if(cloud?.enabled&&cloud.url&&cloud.publishableKey){const s=await quiet('cloud session',()=>FinanzCloud.getSession());if(s?.access_token&&cloud.householdId&&ageMinutes(cloud.lastSync)>5)await quiet('cloud sync',()=>FinanzCloud.fullSync())}
    const n=data.integrations?.n26;if(n?.sessionReady&&n.localAccountId&&n.backendUrl&&ageMinutes(n.lastSync)>15)await quiet('N26 auto sync',()=>FinanzN26.sync({days:180,reconcile:true}));
    if(data.integrations?.push?.enabled&&data.integrations?.cloud?.householdId)await quiet('push schedule',()=>FinanzPush.syncJobs());
  }
  window.finanzplanV3Start=async function(options={}){await baseStart(options);FinanzPremium.ensurePremiumData();data.version=VERSION;data.schemaVersion=3;let changed=FinanzPremium.maybeCreatePreviousMonthReport();if(changed)saveData('Automatischer Monatsbericht erstellt');
    if(new URL(location.href).searchParams.get('code'))await quiet('N26 callback',()=>FinanzN26.handleCallback());
    await startupOnline();data.version=VERSION;if(!data.settings?.vault)await window.__finanzplanStorage.saveState(data).catch(()=>{});else if(window.__vaultKey)await persistVault().catch(()=>{});renderAll();
  };
  window.addEventListener('online',()=>startupOnline().then(()=>renderAll()),{passive:true});
  window.FinanzV31={version:VERSION,startupOnline,ageMinutes};
})();
