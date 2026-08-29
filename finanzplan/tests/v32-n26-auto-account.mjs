import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:412,height:915},locale:'de-DE'});
const page=await context.newPage();
try{
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
  const setup=page.locator('#newProjectForm');
  await setup.waitFor({state:'visible',timeout:12000});
  await setup.locator('[name="household"]').fill('N26 Test');
  await setup.locator('button.primary-button').click();
  await page.locator('#modalBackdrop').waitFor({state:'hidden',timeout:12000});
  await page.waitForFunction(()=>window.FinanzV32?.version==='3.2.0');
  const result=await page.evaluate(()=>{
    data.accounts=[];
    data.integrations.n26.localAccountId='';
    const rows=[
      {id:'n26-1',date:'2026-08-20',merchant:'REWE',amount:20,direction:'debit'},
      {id:'n26-2',date:'2026-08-25',merchant:'Arbeitgeber',amount:1000,direction:'credit'}
    ];
    const account=FinanzN26.ensureLocalAccount(rows);
    return {count:data.accounts.length,name:account.name,id:account.id,openingDate:account.openingDate,localId:data.integrations.n26.localAccountId};
  });
  assert.equal(result.count,1);
  assert.equal(result.name,'N26 Girokonto');
  assert.equal(result.localId,result.id);
  assert.ok(result.openingDate<'2026-08-20');
  console.log('N26 auto-account smoke: OK');
} finally {await browser.close()}
