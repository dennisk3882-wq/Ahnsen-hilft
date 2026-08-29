import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
  // Build a valid household, downgrade its metadata to V2.2, remove V3 DB and verify automatic migration.
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'}),page=await context.newPage();
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});let setup=page.locator('#newProjectForm');await setup.waitFor({state:'visible',timeout:12000});await setup.locator('[name="household"]').fill('Migration Haushalt');await setup.locator('[name="accountName"]').fill('Alt Giro');await setup.locator('[name="balance"]').fill('777.77');await setup.locator('button.primary-button').click();await page.locator('#modalBackdrop').waitFor({state:'hidden'});await page.evaluate(()=>FinanzV3.flush());
  await page.evaluate(async()=>{const legacy=JSON.parse(JSON.stringify(data));legacy.version='2.2.3';legacy.schemaVersion=2;legacy.transactions.push({id:'legacy_tx',date:localISO(now),title:'Legacy Einkauf',amount:22.22,type:'expense',categoryId:'c_other',accountId:legacy.accounts[0].id,memberId:legacy.members[0].id,status:'paid'});await window.__finanzplanStorage.clearState();localStorage.setItem('finanzplan:data:v1',JSON.stringify(legacy));});
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.FinanzV3?.version==='3.0.0'&&data.transactions.some(t=>t.id==='legacy_tx'),null,{timeout:12000});
  assert.equal(await page.evaluate(()=>data.version),'3.0.0');assert.equal(await page.evaluate(()=>data.schemaVersion),3);assert.equal(await page.evaluate(()=>data.transactions.find(t=>t.id==='legacy_tx').amountCents),2222);assert.equal(await page.evaluate(()=>localStorage.getItem('finanzplan:data:v1')),null);assert.equal(await page.evaluate(async()=>!!(await window.__finanzplanStorage.loadState()).transactions.find(t=>t.id==='legacy_tx')),true);
  await context.close();

  // Installed/standalone mode must hide the website install icon.
  const installed=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'});await installed.addInitScript(()=>{try{Object.defineProperty(navigator,'standalone',{configurable:true,value:true})}catch(_){}});const app=await installed.newPage();await app.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});await app.waitForSelector('#installPwaButton',{timeout:12000});assert.equal(await app.locator('#installPwaButton').isVisible(),false);assert.equal(await app.evaluate(()=>FinanzPWA.isStandalone()),true);await installed.close();
  console.log('V3 migration/install mode: OK');
}finally{await browser.close()}
