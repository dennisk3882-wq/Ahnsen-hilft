'use strict';
(function(){
  const VERSION='3.2.0',baseStart=window.finanzplanV3Start,baseImport=window.handleImportFile,baseSettings=window.renderSettings,baseSave=window.saveData,baseFlush=window.FinanzV3?.flush?.bind(window.FinanzV3),basePersistVault=typeof window.persistVault==='function'?window.persistVault:null,storage=window.__finanzplanStorage;
  let v32Persist=Promise.resolve();
  const clone=v=>JSON.parse(JSON.stringify(v));
  const clearLegacyPlaintext=()=>{localStorage.removeItem('finanzplan:data:v1');localStorage.removeItem('finanzplan:snapshots:v1');localStorage.removeItem('finanzplan:undo:v1')};
  function stamp(){data.version=VERSION;data.schemaVersion=3;if(globalThis.FinanzV3)globalThis.FinanzV3.version=VERSION;return data}
  if(basePersistVault)window.persistVault=async function(...args){stamp();const r=await basePersistVault(...args);clearLegacyPlaintext();return r};
  if(typeof baseSave==='function')window.saveData=function(reason='Änderung gespeichert'){const result=baseSave(reason);stamp();clearLegacyPlaintext();if(!data.settings?.vault){const copy=clone(data);v32Persist=v32Persist.catch(()=>{}).then(async()=>{if(baseFlush)await baseFlush();await storage.saveState(copy);clearLegacyPlaintext()}).catch(e=>console.error('V3.2 IndexedDB save failed',e))}return result};
  if(globalThis.FinanzV3){const oldFlush=baseFlush;globalThis.FinanzV3.flush=async()=>{if(oldFlush)await oldFlush();await v32Persist;clearLegacyPlaintext()}};
  if(typeof baseImport==='function')window.handleImportFile=async function(file){const r=await baseImport(file);try{FinanzIntelligence?.postImport?.()}catch(e){FinanzMonitoring?.record?.('intelligence','warn','post_import_failed',e.message)}stamp();clearLegacyPlaintext();return r};
  if(typeof baseSettings==='function')window.renderSettings=function(){baseSettings();const root=$('#view-settings');for(const row of $$('.setting-row',root)){if(row.textContent.includes('Version')){const value=row.querySelector(':scope > b');if(value)value.textContent=VERSION}}const h=$('#v3StorageStatus h2',root);if(h)h.textContent='V3.2 Datenspeicher'};
  window.finanzplanV3Start=async function(options={}){await baseStart(options);stamp();clearLegacyPlaintext();try{FinanzIntelligence.learnFromHistory()}catch(e){FinanzMonitoring?.record?.('intelligence','warn','merchant_learning_failed',e.message)}try{if(data.integrations?.cloud?.e2ee?.enabled&&!FinanzE2EE.unlocked())FinanzMonitoring?.record?.('security','info','e2ee_locked','Cloud-E2EE ist auf diesem Gerät gesperrt')}catch{}if(!data.settings?.vault)await storage.saveState(data).catch(()=>{});else if(window.__vaultKey)await persistVault().catch(()=>{});renderAll();stamp();clearLegacyPlaintext();FinanzMonitoring?.record?.('runtime','info','v32_boot','Finanzplan V3.2 gestartet')};
  window.addEventListener('beforeunload',()=>FinanzE2EE?.lock?.(),{once:true});
  window.FinanzV32={version:VERSION,stamp,clearLegacyPlaintext};
})();
