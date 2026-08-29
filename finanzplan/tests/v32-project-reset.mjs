import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:412,height:915},locale:'de-DE'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});
try{
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
  const first=page.locator('#newProjectForm');
  await first.waitFor({state:'visible',timeout:12000});
  await first.locator('[name="household"]').fill('Initial');
  await first.locator('button.primary-button').click();
  await page.locator('#modalBackdrop').waitFor({state:'hidden',timeout:12000});
  await page.waitForFunction(()=>window.FinanzV32?.version==='3.2.0');

  await page.evaluate(async()=>{
    data=defaultData();
    migrateV2Data();
    saveData('');
    if(window.FinanzV3?.flush)await window.FinanzV3.flush();
    openNewProjectWizard(false);
  });
  const form=page.locator('#newProjectForm');
  await form.waitFor({state:'visible',timeout:8000});
  assert.match(await form.textContent(),/Beispieldaten erkannt/);
  await form.locator('[name="household"]').fill('Dennis');
  await form.locator('[name="accountName"]').fill('');
  await form.locator('[name="balance"]').fill('1');
  await form.locator('[name="salary"]').fill('0');
  await form.locator('button.primary-button').click();
  await page.locator('#modalBackdrop').waitFor({state:'hidden',timeout:12000});
  await page.waitForFunction(()=>data?.household?.name==='Dennis'&&data.transactions?.length===0);
  const state=await page.evaluate(()=>({
    household:data.household.name,
    accounts:data.accounts.map(a=>({name:a.name,openingBalance:a.openingBalance})),
    transactions:data.transactions.length,
    recurring:data.recurring.length,
    version:data.version,
    legacy:localStorage.getItem('finanzplan:data:v1')
  }));
  assert.equal(state.household,'Dennis');
  assert.equal(state.accounts.length,1);
  assert.equal(state.accounts[0].name,'Girokonto');
  assert.equal(Number(state.accounts[0].openingBalance),1);
  assert.equal(state.transactions,0);
  assert.equal(state.recurring,0);
  assert.equal(state.version,'3.2.0');
  assert.equal(state.legacy,null);
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Finanzplan V3.2 demo reset smoke: OK');
} finally {await browser.close()}
