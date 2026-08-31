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
  await page.waitForFunction(()=>window.FinanzSparkasse&&window.FinanzBankingHub&&window.FinanzCategoryIntelligence&&window.__finanzplanV32Ready===true,{timeout:12000});
  const first=page.locator('#newProjectForm');
  if(await first.isVisible().catch(()=>false)){
    await first.locator('[name="household"]').fill('Sparkasse Test');
    await first.locator('button.primary-button').click();
    await page.locator('#modalBackdrop').waitFor({state:'hidden',timeout:12000});
  }
  const result=await page.evaluate(()=>{
    const ids=Object.fromEntries((data.categories||[]).map(c=>[c.name,c.id]));
    data.accounts=[{id:'spk-local',name:'Sparkasse Girokonto',type:'checking',openingBalance:0,openingDate:'2026-08-01',includeNetWorth:true,spendable:true,source:'sparkasse'}];
    data.integrations=data.integrations||{};
    data.integrations.sparkasse={bankName:'Sparkasse Teststadt',localAccountId:'spk-local',sessionReady:true};
    const tx=FinanzSparkasse.txFromBank({
      id:'spk-1',date:'2026-08-31',amount:42.17,direction:'debit',
      merchant:'E center Teststadt',title:'E center Teststadt',remittance:'Kartenzahlung E center',
      reference:'spk-ref-1',mcc:'5411',bankCode:'PMNT',bankSubCode:'POS',bankCodeDescription:'Kartenzahlung'
    });
    const unknown=FinanzSparkasse.txFromBank({
      id:'spk-2',date:'2026-08-31',amount:12.50,direction:'debit',merchant:'Lokaler Testladen',title:'Lokaler Testladen',reference:'spk-ref-2'
    });
    return {
      version:FinanzSparkasse.version,
      providers:FinanzBankingHub.list(),
      tx:{source:tx.source,tags:tx.tags,categoryId:tx.categoryId,categoryName:(data.categories||[]).find(c=>c.id===tx.categoryId)?.name,merchant:tx.merchant,mcc:tx.mcc,bankCode:tx.bankCode,bankSubCode:tx.bankSubCode,bankCodeDescription:tx.bankCodeDescription,accountId:tx.accountId,bankName:tx.bankName},
      unknown:{categoryName:(data.categories||[]).find(c=>c.id===unknown.categoryId)?.name},
      foodId:ids.Lebensmittel
    };
  });
  assert.equal(result.version,'1.0.0');
  assert.ok(result.providers.some(p=>p.id==='n26'&&p.kind==='psd2'));
  assert.ok(result.providers.some(p=>p.id==='sparkasse'&&p.kind==='psd2'));
  assert.ok(result.providers.some(p=>p.id==='file'));
  assert.equal(result.tx.source,'sparkasse');
  assert.ok(result.tx.tags.includes('sparkasse'));
  assert.equal(result.tx.categoryName,'Lebensmittel');
  assert.equal(result.tx.categoryId,result.foodId);
  assert.equal(result.tx.merchant,'EDEKA');
  assert.equal(result.tx.mcc,'5411');
  assert.equal(result.tx.bankCode,'PMNT');
  assert.equal(result.tx.bankSubCode,'POS');
  assert.equal(result.tx.bankCodeDescription,'Kartenzahlung');
  assert.equal(result.tx.accountId,'spk-local');
  assert.equal(result.tx.bankName,'Sparkasse Teststadt');
  assert.equal(result.unknown.categoryName,'Sonstiges');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Finanzplan V3.2 Sparkasse multi-bank smoke: OK');
} finally {await browser.close()}
