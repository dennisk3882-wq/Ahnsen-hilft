'use strict';
(function(){
  const objectPath=(hid,id)=>`${String(hid).split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(id)}`;
  async function auth(){const c=FinanzCloud.cfg(),s=await FinanzCloud.getSession();if(!c.url||!c.key||!s?.access_token)throw new Error('Cloud-Anmeldung fehlt');return {...c,token:s.access_token}}
  async function upload(doc,blob){const a=await auth(),hid=FinanzCloud.cloud().householdId,path=objectPath(hid,doc.id),r=await fetch(`${a.url}/storage/v1/object/finance-documents/${path}`,{method:'POST',headers:{apikey:a.key,Authorization:`Bearer ${a.token}`,'Content-Type':doc.type||'application/octet-stream','x-upsert':'true'},body:blob});if(!r.ok)throw new Error(`Beleg-Upload ${r.status}`)}
  async function download(doc){const a=await auth(),hid=FinanzCloud.cloud().householdId,path=objectPath(hid,doc.id),r=await fetch(`${a.url}/storage/v1/object/finance-documents/${path}`,{headers:{apikey:a.key,Authorization:`Bearer ${a.token}`},cache:'no-store'});if(r.status===404)return null;if(!r.ok)throw new Error(`Beleg-Download ${r.status}`);return r.blob()}
  async function fileRowsRaw(){const db=await openFileDB();return new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
  async function putLocal(doc,blob){const base={id:doc.id,name:doc.name,type:doc.type||blob.type,size:blob.size,txId:doc.txId||'',createdAt:doc.createdAt||new Date().toISOString(),deletedAt:doc.deletedAt||'',blob},rec=data.settings?.vault&&window.__vaultKey?await encryptFileRecord(base,window.__vaultKey):base,db=await openFileDB();await new Promise((resolve,reject)=>{const tr=db.transaction('files','readwrite');tr.objectStore('files').put(rec);tr.oncomplete=resolve;tr.onerror=()=>reject(tr.error)})}
  async function syncDocuments(){const docs=data.documents||[],raw=await fileRowsRaw(),rawIds=new Set(raw.map(x=>x.id)),plain=typeof getAllStoredFiles==='function'?await getAllStoredFiles():[],plainMap=new Map(plain.map(x=>[x.id,x]));let uploaded=0,downloaded=0;
    for(const doc of docs){const local=plainMap.get(doc.id);if(local?.blob&&!doc.cloudUploadedAt){await upload(doc,local.blob);doc.cloudUploadedAt=new Date().toISOString();uploaded++}else if(!rawIds.has(doc.id)&&doc.cloudUploadedAt){const blob=await download(doc);if(blob){await putLocal(doc,blob);downloaded++}}}
    if(uploaded||downloaded)saveData(`Cloud-Belege: ${uploaded} hochgeladen, ${downloaded} geladen`);return {uploaded,downloaded}}
  FinanzCloud.syncDocuments=syncDocuments;
  window.FinanzCloudDocuments={syncDocuments,upload,download};
})();
