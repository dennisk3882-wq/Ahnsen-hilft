'use strict';
(function(){
  const VERSION='3.2.0',baseStart=window.finanzplanV3Start,baseImport=window.handleImportFile;
  if(typeof baseImport==='function')window.handleImportFile=async function(file){const r=await baseImport(file);try{FinanzIntelligence?.postImport?.()}catch(e){FinanzMonitoring?.record?.('intelligence','warn','post_import_failed',e.message)}return r};
  window.finanzplanV3Start=async function(options={}){await baseStart(options);data.version=VERSION;data.schemaVersion=3;try{FinanzIntelligence.learnFromHistory()}catch(e){FinanzMonitoring?.record?.('intelligence','warn','merchant_learning_failed',e.message)}try{if(data.integrations?.cloud?.e2ee?.enabled&&!FinanzE2EE.unlocked())FinanzMonitoring?.record?.('security','info','e2ee_locked','Cloud-E2EE ist auf diesem Gerät gesperrt')}catch{}if(!data.settings?.vault)await window.__finanzplanStorage.saveState(data).catch(()=>{});else if(window.__vaultKey)await persistVault().catch(()=>{});renderAll();FinanzMonitoring?.record?.('runtime','info','v32_boot','Finanzplan V3.2 gestartet')};
  window.addEventListener('beforeunload',()=>FinanzE2EE?.lock?.(),{once:true});
  window.FinanzV32={version:VERSION};
})();
