'use strict';
(function(){
  const V3_VERSION='3.0.0',V3_SCHEMA=3,storage=window.__finanzplanStorage,PLAIN_KEY='finanzplan:data:v1',OLD_SNAP='finanzplan:snapshots:v1',OLD_UNDO='finanzplan:undo:v2';
  let persistQueue=Promise.resolve(),lastSnapshotAt=0,bootDay='';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const stripLegacy=()=>{try{localStorage.removeItem(PLAIN_KEY);localStorage.removeItem(OLD_SNAP);localStorage.removeItem(OLD_UNDO)}catch(_){}};
  const queuePersist=state=>{const copy=clone(state);persistQueue=persistQueue.catch(()=>{}).then(()=>storage.saveState(copy));return persistQueue};
  const baseSave=saveData,baseOpenBackup=openBackup,baseEnableVault=typeof enableVault==='function'?enableVault:null,baseDisableVault=typeof disableVault==='function'?disableVault:null,baseUnlockVault=typeof unlockVault==='function'?unlockVault:null;

  function stampV3(){data.version=V3_VERSION;data.schemaVersion=V3_SCHEMA;syncMoneyFieldsV3?.();return data}
  function pushUndoV3(label){const previous=window.__v3LastPersistedState;if(!previous||data.settings?.vault)return;storage.saveHistory('undo',label||'Änderung',previous,12).catch(()=>{})}
  async function autoSnapshotV3(){if(data.settings?.vault)return;const t=Date.now();if(t-lastSnapshotAt<5*60*1000)return;lastSnapshotAt=t;await storage.saveHistory('snapshot','Automatische Sicherung',clone(data),10).catch(()=>{})}
  globalThis.pushUndoFromPersisted=pushUndoV3;globalThis.autoSnapshot=autoSnapshotV3;

  saveData=function(reason='Änderung gespeichert'){
    pushUndoV3(reason);stampV3();const result=baseSave(reason);stampV3();
    if(data.settings?.vault){storage.clearState().catch(()=>{});stripLegacy()}else{queuePersist(data).then(()=>{window.__v3LastPersistedState=clone(data);stripLegacy()}).catch(e=>console.error('IndexedDB save failed',e))}
    renderAll();return result
  };

  undoLastChange=function(){
    if(data.settings?.vault)return globalThis.v2PlainUndo?.()||false;
    storage.listHistory('undo').then(async rows=>{const row=rows[0];if(!row){toast('Keine Änderung zum Rückgängigmachen vorhanden','error');return}data=clone(row.data);migrateV2Data();stampV3();await storage.deleteHistory(row.id);await storage.saveState(data);window.__v3LastPersistedState=clone(data);renderAll();toast(`Rückgängig: ${row.label||'letzte Änderung'}`,'success')}).catch(e=>toast(e.message,'error'));return true
  };

  openBackup=function(){
    if(data.settings?.vault)return baseOpenBackup();
    storage.listHistory('snapshot').then(snaps=>openModal('Sicherung & Wiederherstellung','V3 speichert strukturierte Sicherungen in IndexedDB. Das verschlüsselte Vollbackup enthält zusätzlich alle Belegdateien.',`<div class="action-row"><button id="v3SnapshotNow" class="primary-button">Snapshot jetzt</button><button id="v3FullBackup" class="secondary-button">Vollbackup mit Belegen</button><button id="v3RestoreFile" class="secondary-button">Backup-Datei laden</button></div><div class="simple-list" style="margin-top:14px">${snaps.length?snaps.map((s,i)=>`<div class="list-row"><div class="list-icon">☁</div><div><strong>${escapeHTML(s.label||'Snapshot')}</strong><small>${new Date(s.at).toLocaleString('de-DE')}</small></div><button class="mini-btn" data-v3-restore="${i}">Wiederherstellen</button></div>`).join(''):'<div class="empty">Noch keine V3-Snapshots vorhanden.</div>'}</div><div class="modal-actions"><button class="secondary-button" data-cancel>Schließen</button></div>`,()=>{$('#v3SnapshotNow').onclick=async()=>{await storage.saveHistory('snapshot','Manueller Snapshot',clone(data),10);toast('Snapshot gespeichert','success');openBackup()};$('#v3FullBackup').onclick=()=>FinanzBackupV3.exportV3FullBackup();$('#v3RestoreFile').onclick=()=>$('#fileImport').click();$$('[data-v3-restore]').forEach(b=>b.onclick=async()=>{const row=snaps[Number(b.dataset.v3Restore)];if(row&&confirm('Diesen Snapshot wiederherstellen?')){data=clone(row.data);migrateV2Data();stampV3();await storage.saveState(data);window.__v3LastPersistedState=clone(data);closeModal();renderAll();toast('Snapshot wiederhergestellt','success')}});$('[data-cancel]').onclick=closeModal})).catch(e=>toast(e.message,'error'))
  };

  if(baseEnableVault)enableVault=async function(pin){const ok=await baseEnableVault(pin);stampV3();await storage.clearState();stripLegacy();return ok};
  if(baseDisableVault)disableVault=async function(){const ok=await baseDisableVault();stampV3();await storage.saveState(data);window.__v3LastPersistedState=clone(data);stripLegacy();return ok};
  if(baseUnlockVault)unlockVault=async function(pin){const ok=await baseUnlockVault(pin);stampV3();return ok};

  const baseRenderSettings=renderSettings;renderSettings=function(){baseRenderSettings();const root=$('#view-settings');for(const row of $$('.setting-row',root)){if(row.textContent.includes('Version')){const value=row.querySelector(':scope > b');if(value)value.textContent=V3_VERSION}}if(!$('#v3StorageStatus',root))root.insertAdjacentHTML('beforeend',`<article id="v3StorageStatus" class="card" style="margin-top:16px"><div class="card-title-row"><div><h2>V3 Datenspeicher</h2><p>Strukturierte Finanzdaten liegen primär in IndexedDB; LocalStorage wird nur noch für den verschlüsselten Tresor-/Kompatibilitätszustand verwendet.</p></div><span class="tag green">IndexedDB</span></div></article>`)};

  function checkDayRollover(){const today=localISO(new Date());if(bootDay&&today!==bootDay){location.reload();return true}return false}
  function scheduleMidnightReload(){const d=new Date(),next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1,0,0,2);setTimeout(()=>location.reload(),Math.max(1000,next-d))}

  window.finanzplanV3Start=async function({bootState,migrated}={}){
    bootDay=localISO(new Date());stampV3();
    if(data.settings?.vault){await storage.clearState().catch(()=>{})}else{await storage.saveState(data);window.__v3LastPersistedState=clone(data);stripLegacy()}
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDayRollover()},{passive:true});window.addEventListener('focus',checkDayRollover,{passive:true});window.addEventListener('pageshow',checkDayRollover,{passive:true});scheduleMidnightReload();
    if(typeof window.__finanzplanLegacyInit==='function')await window.__finanzplanLegacyInit();
    if(migrated)toast('Finanzdaten wurden auf den V3-IndexedDB-Speicher migriert','success');renderAll();
  };
  globalThis.FinanzV3={version:V3_VERSION,schema:V3_SCHEMA,checkDayRollover,flush:()=>persistQueue};
})();
