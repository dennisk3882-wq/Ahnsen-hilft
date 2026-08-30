import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:412,height:915},locale:'de-DE'});
const page=await context.newPage();
try{
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
  const setup=page.locator('#newProjectForm');
  if(await setup.isVisible().catch(()=>false)){
    await setup.locator('[name="household"]').fill('N26 Dedupe Test');
    await setup.locator('button.primary-button').click();
    await page.locator('#modalBackdrop').waitFor({state:'hidden',timeout:12000});
  }
  await page.waitForFunction(()=>window.FinanzN26&&window.FinanzCategoryIntelligence&&window.__finanzplanV32Ready===true,{timeout:12000});
  const result=await page.evaluate(()=>{
    data.accounts=data.accounts||[];
    const account=data.accounts[0]||{id:'acc-n26-dedupe-test',name:'N26 Girokonto',type:'checking',openingBalance:0,openingDate:'2026-08-01',includeNetWorth:true,spendable:true,source:'n26'};
    if(!data.accounts.length)data.accounts.push(account);
    data.integrations=data.integrations||{};data.integrations.n26=data.integrations.n26||{};data.integrations.n26.localAccountId=account.id;
    data.documents=[];
    data.transactions=[];
    const raw={date:'2026-08-04',merchant:'Penny Am Steinzeichen',amount:12.69,direction:'debit',remittance:'Kartenzahlung PENNY'};
    const a=FinanzN26.txFromBank({...raw,id:'legacy-provider-a',reference:'legacy-a'});
    a.id='local-a';a.externalId='legacy-provider-a';a.fingerprint='stale-fingerprint-a';
    const b=FinanzN26.txFromBank({...raw,id:'legacy-provider-b',reference:'legacy-b'});
    b.id='local-b';b.externalId='legacy-provider-b';b.fingerprint='stale-fingerprint-b';b.categoryId='c_food';b.categorySource='manual';b.categoryLocked=true;b.categoryConfidence=1;
    data.transactions.push(a,b);
    const fresh=FinanzN26.txFromBank({...raw,id:'stable-current-id',reference:'stable-current-id'});
    const repaired=FinanzN26.reconcileSyncedRows([fresh]);
    const afterRepair=data.transactions.filter(FinanzN26.isN26Transaction).map(t=>({id:t.id,externalId:t.externalId,categoryId:t.categoryId,categorySource:t.categorySource,locked:t.categoryLocked,fingerprint:t.fingerprint,signature:FinanzN26.n26Signature(t)}));

    data.transactions=[];
    const r1=FinanzN26.txFromBank({...raw,id:'real-one',reference:'real-one'});
    const r2=FinanzN26.txFromBank({...raw,id:'real-two',reference:'real-two'});
    const firstSync=FinanzN26.reconcileSyncedRows([r1,r2]);
    const afterTwo=data.transactions.filter(FinanzN26.isN26Transaction).map(t=>({externalId:t.externalId,signature:FinanzN26.n26Signature(t)}));
    const again1=FinanzN26.txFromBank({...raw,id:'real-one',reference:'real-one'});
    const again2=FinanzN26.txFromBank({...raw,id:'real-two',reference:'real-two'});
    const secondSync=FinanzN26.reconcileSyncedRows([again1,again2]);
    const afterResync=data.transactions.filter(FinanzN26.isN26Transaction).map(t=>t.externalId).sort();
    return {repaired:{...repaired,used:repaired.used.size},afterRepair,firstSync:{...firstSync,used:firstSync.used.size},afterTwo,secondSync:{...secondSync,used:secondSync.used.size},afterResync};
  });

  assert.equal(result.repaired.removed,1,'one historical local N26 duplicate must be removed');
  assert.equal(result.afterRepair.length,1);
  assert.equal(result.afterRepair[0].externalId,'stable-current-id');
  assert.equal(result.afterRepair[0].categorySource,'manual','manual categorization from the duplicate must survive the merge');
  assert.equal(result.afterRepair[0].locked,true);
  assert.notMatch(result.afterRepair[0].fingerprint,/stale-fingerprint/);

  assert.equal(result.firstSync.added,2,'two genuinely separate identical N26 bookings must both be imported');
  assert.equal(result.firstSync.removed,0);
  assert.equal(result.afterTwo.length,2);
  assert.deepEqual(result.afterTwo.map(x=>x.externalId).sort(),['real-one','real-two']);
  assert.equal(result.afterTwo[0].signature,result.afterTwo[1].signature,'multiplicity must be preserved even with an identical signature');
  assert.equal(result.secondSync.added,0);
  assert.equal(result.secondSync.removed,0);
  assert.deepEqual(result.afterResync,['real-one','real-two']);
  console.log('N26 duplicate reconciliation smoke: OK');
} finally {await browser.close()}
