import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
  const setup=page.locator('#newProjectForm');await setup.waitFor({state:'visible',timeout:12000});
  await setup.locator('[name="household"]').fill('Backup Test');await setup.locator('[name="accountName"]').fill('Giro');await setup.locator('[name="balance"]').fill('1500');await setup.locator('button.primary-button').click();await page.locator('#modalBackdrop').waitFor({state:'hidden'});

  await page.evaluate(async()=>{await storeFile(new File([new TextEncoder().encode('beleg-v3')],'beleg-v3.txt',{type:'text/plain'}),'');data.transactions.push({id:'backup_tx',date:localISO(now),title:'Backup Buchung',amount:12.34,type:'expense',categoryId:'c_other',accountId:data.accounts[0].id,memberId:data.members[0].id,status:'paid'});saveData('Backup Test')});
  await page.evaluate(()=>FinanzV3.flush());
  const backup=await page.evaluate(async()=>{const r=await FinanzBackupV3.buildV3BackupBlob('secret33');return new Uint8Array(await r.blob.arrayBuffer())});
  assert.ok(backup.length>100);

  const restored=await page.evaluate(async bytes=>{
    await window.__finanzplanStorage.clearState();
    const db=await openFileDB();await new Promise(resolve=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').clear();tx.oncomplete=resolve;tx.onerror=resolve});
    data=emptyProjectData(false);renderAll();
    const file=new File([new Uint8Array(bytes)],'restore.fplan',{type:'application/octet-stream'});
    const result=await FinanzBackupV3.restoreV3Backup(file,'secret33');
    return{result,hasTx:data.transactions.some(t=>t.id==='backup_tx'),docs:data.documents.map(d=>d.name),balance:accountTotal()};
  },Array.from(backup));
  assert.equal(restored.hasTx,true);assert.ok(restored.docs.includes('beleg-v3.txt'));assert.equal(Math.round(restored.balance*100),148766);

  const scale=await page.evaluate(async()=>{const a=data.accounts[0].id,m=data.members[0].id,d=localISO(now);for(let i=0;i<10000;i++)data.transactions.push({id:`scale_${i}`,date:d,title:`Scale ${i}`,amount:1,type:'expense',categoryId:'c_other',accountId:a,memberId:m,status:'paid'});saveData('Scale test');await FinanzV3.flush();return{count:data.transactions.length,plain:localStorage.getItem('finanzplan:data:v1')}});
  assert.ok(scale.count>=10001);assert.equal(scale.plain,null);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.FinanzV3?.version==='3.2.0'&&data.transactions.some(t=>t.id==='scale_9999'),null,{timeout:20000});assert.ok(await page.evaluate(()=>data.transactions.length)>=10001);
  if(errors.length)throw new Error(errors.join('\n'));console.log('V3 storage/backup/scale: OK');
}finally{await browser.close()}
