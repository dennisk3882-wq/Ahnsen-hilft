'use strict';
(function(){
  const MAGIC=new TextEncoder().encode('FPLAN3\r\n');
  const u32=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b};
  const readU32=async(blob,offset)=>new DataView(await blob.slice(offset,offset+4).arrayBuffer()).getUint32(0,true);
  const enc=new TextEncoder(),dec=new TextDecoder();
  async function encryptRecord(bytes,key){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes);return{iv:bytesToB64(iv),cipher:new Uint8Array(cipher)}}
  async function decryptRecord(cipher,key,iv){return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(iv)},key,cipher))}
  function frame(type,meta,payload){const m=enc.encode(JSON.stringify(meta));return [new Uint8Array([type]),u32(m.length),u32(payload.byteLength),m,payload]}
  function downloadBlob(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}

  async function buildV3BackupBlob(pass){
    if(!pass||pass.length<6)throw new Error('Backup-Passwort muss mindestens 6 Zeichen haben');
    syncMoneyFieldsV3?.();const salt=crypto.getRandomValues(new Uint8Array(16)),key=await deriveBackupKey(pass,salt),header={format:'finanzplan-binary-v3',version:'3.0.0',schemaVersion:3,kdf:'PBKDF2-SHA256',iterations:250000,salt:bytesToB64(salt),exportedAt:new Date().toISOString()},headerBytes=enc.encode(JSON.stringify(header)),parts=[MAGIC,u32(headerBytes.length),headerBytes];
    const stateBytes=enc.encode(JSON.stringify(data)),stateEncrypted=await encryptRecord(stateBytes,key);parts.push(...frame(1,{iv:stateEncrypted.iv},stateEncrypted.cipher));
    const files=typeof getAllStoredFilesDecrypted==='function'?await getAllStoredFilesDecrypted():await getAllStoredFiles();
    for(const f of files){const blob=f.blob||f.encryptedBlob;if(!blob)continue;const encrypted=await encryptRecord(new Uint8Array(await blob.arrayBuffer()),key),meta={id:f.id,name:f.name,type:f.type||blob.type||'application/octet-stream',size:f.size||blob.size,txId:f.txId||'',createdAt:f.createdAt||'',deletedAt:f.deletedAt||'',iv:encrypted.iv};parts.push(...frame(2,meta,encrypted.cipher))}
    parts.push(...frame(255,{},new Uint8Array()));return{blob:new Blob(parts,{type:'application/octet-stream'}),count:files.length,header}
  }

  async function exportV3FullBackup(pass=null,prefix='finanzplan-vollbackup'){
    pass=pass||prompt('Passwort für das verschlüsselte Vollbackup eingeben (mindestens 6 Zeichen):');if(!pass||pass.length<6){toast('Backup abgebrochen – Passwort zu kurz','error');return false}
    try{toast('V3-Vollbackup wird erstellt…');const result=await buildV3BackupBlob(pass);downloadBlob(`${prefix}-${localISO(new Date())}.fplan`,result.blob);toast(`Vollbackup mit ${result.count} Beleg(en) erstellt`,'success');return result}catch(e){toast(`Backup fehlgeschlagen: ${e.message}`,'error');return false}
  }

  async function isV3Backup(file){if(!file||file.size<MAGIC.length+4)return false;const b=new Uint8Array(await file.slice(0,MAGIC.length).arrayBuffer());return b.length===MAGIC.length&&b.every((v,i)=>v===MAGIC[i])}
  async function restoreV3Backup(file,pass){
    if(!await isV3Backup(file))throw new Error('Kein V3-Backup');let offset=MAGIC.length,headerLen=await readU32(file,offset);offset+=4;const header=JSON.parse(dec.decode(await file.slice(offset,offset+headerLen).arrayBuffer()));offset+=headerLen;const key=await deriveBackupKey(pass,b64ToBytes(header.salt));let restoredData=null;const restoredFiles=[];
    while(offset<file.size){const h=new Uint8Array(await file.slice(offset,offset+9).arrayBuffer());if(h.length<9)break;const type=h[0],view=new DataView(h.buffer),metaLen=view.getUint32(1,true),payloadLen=view.getUint32(5,true);offset+=9;const meta=JSON.parse(dec.decode(await file.slice(offset,offset+metaLen).arrayBuffer()));offset+=metaLen;const cipher=new Uint8Array(await file.slice(offset,offset+payloadLen).arrayBuffer());offset+=payloadLen;if(type===255)break;const plain=await decryptRecord(cipher,key,meta.iv);if(type===1)restoredData=JSON.parse(dec.decode(plain));else if(type===2)restoredFiles.push({...meta,blob:new Blob([plain],{type:meta.type||'application/octet-stream'})})
    }
    if(!restoredData)throw new Error('Backup enthält keine Finanzdaten');if(restoredData.settings?.vault&&!window.__vaultKey)restoredData.settings.vault=false;data=restoredData;migrateV2Data();syncMoneyFieldsV3?.();
    const db=await openFileDB();await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite'),s=tx.objectStore('files');s.clear();for(const f of restoredFiles)s.put({id:f.id,name:f.name,type:f.type,size:f.size,txId:f.txId,createdAt:f.createdAt,deletedAt:f.deletedAt||'',blob:f.blob});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
    await window.__finanzplanStorage?.saveState?.(data);window.__v3LastPersistedState=JSON.parse(JSON.stringify(data));renderAll();return{files:restoredFiles.length,header}
  }

  const baseImport=handleImportFile;
  handleImportFile=async function(file){if(!file)return;if(await isV3Backup(file)){const pass=prompt('Passwort des V3-Vollbackups eingeben:');if(!pass)return toast('Wiederherstellung abgebrochen','error');try{const result=await restoreV3Backup(file,pass);closeModal();toast(`V3-Backup mit ${result.files} Beleg(en) wiederhergestellt`,'success')}catch(e){toast(`Backup konnte nicht geöffnet werden: ${e.message}`,'error')}return}return baseImport(file)};
  exportEncryptedFullBackup=()=>exportV3FullBackup();
  createMandatoryResetBackup=async function(){const pass=prompt('Vor dem Löschen wird ein verschlüsseltes V3-Vollbackup erstellt. Backup-Passwort (mindestens 6 Zeichen):');if(!pass||pass.length<6){toast('Reset abgebrochen – zuerst Vollbackup erstellen','error');return false}const result=await exportV3FullBackup(pass,'finanzplan-vor-reset');if(!result)return false;sessionStorage.setItem('finanzplan:reset-backup-version',String(data.updatedAt||data.createdAt||''));return true};
  globalThis.FinanzBackupV3={buildV3BackupBlob,restoreV3Backup,isV3Backup,exportV3FullBackup};
})();
