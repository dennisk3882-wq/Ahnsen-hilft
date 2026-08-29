'use strict';
(function(){
  const COLLECTIONS=['members','accounts','categories','transactions','recurring','budgets','goals','reserves','contracts','insurances','debts','projects','monthClosures','documents','merchantRules','reconciliations','assets','monthlyReports'];
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function stable(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(stable).join(',')}]`;return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`}
  const hash=v=>FinanceLib.fingerprint(stable(v));
  function meta(){data.sync=data.sync||{};return data.sync.cloudMeta=data.sync.cloudMeta||{records:{},conflicts:[]}}
  async function fetchRemote(){const id=FinanzCloud.cloud().householdId;if(!id)throw new Error('Kein Cloud-Haushalt gewählt');return FinanzCloud.api(`/rest/v1/finance_records?household_id=eq.${encodeURIComponent(id)}&select=collection,record_id,payload,version,updated_at,deleted&limit=50000`)}
  async function write(collection,id,payload,baseVersion,deleted=false){const hid=FinanzCloud.cloud().householdId,res=await FinanzCloud.api('/rest/v1/rpc/upsert_finance_record',{method:'POST',body:{p_household_id:hid,p_collection:collection,p_record_id:id,p_payload:payload||{},p_base_version:Number(baseVersion||0),p_deleted:!!deleted}});return Array.isArray(res)?res[0]:res}
  async function latest(collection,id){const hid=FinanzCloud.cloud().householdId,rows=await FinanzCloud.api(`/rest/v1/finance_records?household_id=eq.${encodeURIComponent(hid)}&collection=eq.${encodeURIComponent(collection)}&record_id=eq.${encodeURIComponent(id)}&select=collection,record_id,payload,version,updated_at,deleted&limit=1`);return rows?.[0]||null}
  async function safeWrite(collection,id,payload,version,deleted,conflicts,local){try{return await write(collection,id,payload,version,deleted)}catch(e){if(!/version_conflict/i.test(String(e.message)))throw e;const r=await latest(collection,id);conflicts.push({key:`${collection}:${id}`,collection,id,local:clone(local),remote:r?.deleted?null:clone(r?.payload),remoteVersion:r?.version||0,remoteUpdatedAt:r?.updated_at||'',reason:'concurrent-write'});return null}}
  async function syncRecords(){const m=meta(),remote=await fetchRemote(),rmap=new Map(remote.map(r=>[`${r.collection}:${r.record_id}`,r])),conflicts=[];let pulled=0,pushed=0,deleted=0;
    for(const collection of COLLECTIONS){if(!Array.isArray(data[collection]))data[collection]=[];const localMap=new Map(data[collection].filter(x=>x?.id).map(x=>[x.id,x]));
      for(const [id,local] of localMap){const key=`${collection}:${id}`,seen=m.records[key],rh=rmap.get(key),lh=hash(local);
        if(rh?.deleted){if(seen&&lh===seen.hash){data[collection]=data[collection].filter(x=>x.id!==id);m.records[key]={hash:'',remoteUpdatedAt:rh.updated_at,version:rh.version,deleted:true};deleted++}else conflicts.push({key,collection,id,local:clone(local),remote:null,remoteVersion:rh.version,remoteUpdatedAt:rh.updated_at,reason:'remote-delete'});continue}
        if(rh&&!seen){if(lh===hash(rh.payload)){m.records[key]={hash:lh,remoteUpdatedAt:rh.updated_at,version:rh.version};continue}conflicts.push({key,collection,id,local:clone(local),remote:clone(rh.payload),remoteVersion:rh.version,remoteUpdatedAt:rh.updated_at,reason:'first-sync-collision'});continue}
        const localChanged=!seen||lh!==seen.hash,remoteChanged=!!rh&&rh.updated_at!==seen?.remoteUpdatedAt;
        if(rh&&localChanged&&remoteChanged){conflicts.push({key,collection,id,local:clone(local),remote:clone(rh.payload),remoteVersion:rh.version,remoteUpdatedAt:rh.updated_at,reason:'both-changed'});continue}
        if(rh&&remoteChanged&&!localChanged){const i=data[collection].findIndex(x=>x.id===id);data[collection][i]=clone(rh.payload);m.records[key]={hash:hash(rh.payload),remoteUpdatedAt:rh.updated_at,version:rh.version};pulled++;continue}
        if(!rh||localChanged){const row=await safeWrite(collection,id,local,rh?.version||seen?.version||0,false,conflicts,local);if(row){m.records[key]={hash:lh,remoteUpdatedAt:row.updated_at,version:row.version};pushed++}}
      }
      for(const [key,rh] of rmap){if(rh.collection!==collection||rh.deleted||localMap.has(rh.record_id))continue;const seen=m.records[key];if(seen?.hash){const row=await safeWrite(collection,rh.record_id,{},rh.version,true,conflicts,null);if(row){m.records[key]={hash:'',remoteUpdatedAt:row.updated_at,version:row.version,deleted:true};deleted++}}else{data[collection].push(clone(rh.payload));m.records[key]={hash:hash(rh.payload),remoteUpdatedAt:rh.updated_at,version:rh.version};pulled++}}
    }
    m.conflicts=conflicts;FinanzCloud.cloud().lastSync=new Date().toISOString();saveData(`Cloud-Sync: ${pulled} geladen, ${pushed} gesendet${conflicts.length?`, ${conflicts.length} Konflikt(e)`:''}`);return {pulled,pushed,deleted,conflicts}
  }
  async function resolveConflict(key,choice){const m=meta(),c=m.conflicts.find(x=>x.key===key);if(!c)return false;const arr=data[c.collection]||(data[c.collection]=[]),i=arr.findIndex(x=>x.id===c.id);if(choice==='remote'){if(c.remote){if(i>=0)arr[i]=clone(c.remote);else arr.push(clone(c.remote));m.records[key]={hash:hash(c.remote),remoteUpdatedAt:c.remoteUpdatedAt,version:c.remoteVersion}}else{if(i>=0)arr.splice(i,1);m.records[key]={hash:'',remoteUpdatedAt:c.remoteUpdatedAt,version:c.remoteVersion,deleted:true}}}else if(choice==='local'){if(!c.local)throw new Error('Lokale Version ist nicht verfügbar');const row=await write(c.collection,c.id,c.local,c.remoteVersion||0,false);m.records[key]={hash:hash(c.local),remoteUpdatedAt:row.updated_at,version:row.version}}
    m.conflicts=m.conflicts.filter(x=>x.key!==key);saveData('Cloud-Konflikt aufgelöst');return true}
  async function fullSync(){const records=await syncRecords();let documents={uploaded:0};try{documents=await FinanzCloud.syncDocuments()}catch(e){console.warn('Document cloud sync',e)}return {...records,documents}}
  FinanzCloud.syncRecords=syncRecords;FinanzCloud.resolveConflict=resolveConflict;FinanzCloud.fullSync=fullSync;
  window.FinanzCloudConcurrency={syncRecords,resolveConflict,fetchRemote,write};
})();
