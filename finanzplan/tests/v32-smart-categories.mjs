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
  if(await first.isVisible().catch(()=>false)){
    await first.locator('[name="household"]').fill('SmartCat Test');
    await first.locator('button.primary-button').click();
    await page.locator('#modalBackdrop').waitFor({state:'hidden',timeout:12000});
  }
  await page.waitForFunction(()=>window.FinanzCategoryIntelligence&&window.FinanzV32?.version==='3.2.0',{timeout:12000});
  const result=await page.evaluate(()=>{
    const catName=id=>(data.categories||[]).find(c=>c.id===id)?.name||'';
    const classify=(title,type='expense',merchant='')=>{
      const r=FinanzCategoryIntelligence.categorizeTransaction({title,merchant,type});
      return {name:catName(r.categoryId),source:r.source,confidence:r.confidence,merchant:r.merchant};
    };
    const checks={
      edeka:classify('Edeka Bolinger'),
      penny:classify('PENNY Markt 1234'),
      restaurant:classify('Restaurant Labyrinth I'),
      bistro:classify('LE BISTRO'),
      vodafone:classify('Vodafone GmbH'),
      praxis:classify('Praxis Ahmet Cetindere'),
      shell:classify('Shell Station 123'),
      bahn:classify('DB Vertrieb GmbH'),
      clothes:classify('Zalando SE'),
      amazon:classify('WWW.AMAZON.DE'),
      unknown:classify('Martina Koch'),
      income:classify('Axians IT-Infrastructure','income')
    };
    const ids=Object.fromEntries(data.categories.map(c=>[c.name,c.id]));
    data.merchantRules=[{id:'bad',pattern:'EDEKA',merchant:'EDEKA',categoryId:ids.Kleidung,active:true,learned:true,confidence:.99,hits:5}];
    const learnedProtected=classify('EDEKA BOLINGER');
    data.transactions=[
      {id:'n1',date:'2026-08-29',title:'Edeka Bolinger',merchant:'EDEKA',sourceMerchant:'EDEKA BOLINGER',amount:12,type:'expense',categoryId:ids.Kleidung,accountId:data.accounts[0]?.id||'',status:'paid',source:'n26',tags:['n26']},
      {id:'n2',date:'2026-08-29',title:'Vodafone GmbH',merchant:'Vodafone',sourceMerchant:'Vodafone GmbH',amount:40,type:'expense',categoryId:ids.Kleidung,accountId:data.accounts[0]?.id||'',status:'paid',source:'n26',tags:['n26']},
      {id:'n3',date:'2026-08-29',title:'Restaurant Labyrinth I',merchant:'Restaurant Labyrinth I',sourceMerchant:'Restaurant Labyrinth I',amount:55,type:'expense',categoryId:ids.Kleidung,accountId:data.accounts[0]?.id||'',status:'paid',source:'n26',tags:['n26']},
      {id:'n4',date:'2026-08-29',title:'Praxis Ahmet Cetindere',merchant:'Praxis Ahmet Cetindere',sourceMerchant:'Praxis Ahmet Cetindere',amount:25,type:'expense',categoryId:ids.Kleidung,accountId:data.accounts[0]?.id||'',status:'paid',source:'n26',tags:['n26']},
      {id:'n5',date:'2026-08-29',title:'Martina Koch',merchant:'Martina Koch',sourceMerchant:'Martina Koch',amount:20,type:'expense',categoryId:ids.Kleidung,accountId:data.accounts[0]?.id||'',status:'paid',source:'n26',tags:['n26']}
    ];
    const changed=FinanzCategoryIntelligence.reclassifyImportedTransactions({onlySuspicious:true});
    const repaired=Object.fromEntries(data.transactions.map(t=>[t.id,catName(t.categoryId)]));
    return {checks,learnedProtected,changed,repaired};
  });
  assert.equal(result.checks.edeka.name,'Lebensmittel');
  assert.equal(result.checks.penny.name,'Lebensmittel');
  assert.equal(result.checks.restaurant.name,'Restaurant');
  assert.equal(result.checks.bistro.name,'Restaurant');
  assert.equal(result.checks.vodafone.name,'Abos & Verträge');
  assert.equal(result.checks.praxis.name,'Gesundheit');
  assert.equal(result.checks.shell.name,'Tanken');
  assert.equal(result.checks.bahn.name,'Mobilität');
  assert.equal(result.checks.clothes.name,'Kleidung');
  assert.equal(result.checks.amazon.name,'Sonstiges');
  assert.equal(result.checks.unknown.name,'Sonstiges');
  assert.equal(result.checks.income.name,'Weitere Einnahmen');
  assert.equal(result.learnedProtected.name,'Lebensmittel','wrong learned EDEKA rule must not override knowledge');
  assert.ok(result.changed>=5);
  assert.equal(result.repaired.n1,'Lebensmittel');
  assert.equal(result.repaired.n2,'Abos & Verträge');
  assert.equal(result.repaired.n3,'Restaurant');
  assert.equal(result.repaired.n4,'Gesundheit');
  assert.equal(result.repaired.n5,'Sonstiges');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Finanzplan V3.2 smart categorization smoke: OK');
} finally {await browser.close()}
