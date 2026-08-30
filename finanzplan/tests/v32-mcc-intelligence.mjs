import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:412,height:915},locale:'de-DE'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});
try{
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
  const setup=page.locator('#newProjectForm');
  await setup.waitFor({state:'visible',timeout:12000});
  await setup.locator('[name="household"]').fill('MCC Test');
  await setup.locator('[name="accountName"]').fill('N26 Girokonto');
  await setup.locator('[name="balance"]').fill('0');
  await setup.locator('button.primary-button').click();
  await page.locator('#modalBackdrop').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.FinanzCategoryIntelligence&&window.FinanzN26&&window.__finanzplanV32Ready===true);

  const result=await page.evaluate(()=>{
    const catName=id=>data.categories.find(c=>c.id===id)?.name||'';
    const samples=[
      {key:'edeka',merchant:'Edeka Bolinger',mcc:'5411',want:'Lebensmittel'},
      {key:'penny',merchant:'PENNY MARKT',mcc:'5411',want:'Lebensmittel'},
      {key:'restaurant',merchant:'Restaurant Labyrinth I',mcc:'5812',want:'Restaurant'},
      {key:'vodafone',merchant:'Vodafone GmbH',mcc:'4814',want:'Abos & Verträge'},
      {key:'health',merchant:'Unbekannte Apotheke',mcc:'5912',want:'Gesundheit'},
      {key:'clothes',merchant:'Modehaus Beispiel',mcc:'5611',want:'Kleidung'},
      {key:'transactionSpecific',merchant:'Shell Station Shop',mcc:'5411',want:'Lebensmittel'}
    ];
    const out={};
    for(const s of samples){
      const smart=FinanzCategoryIntelligence.categorizeTransaction({merchant:s.merchant,title:s.merchant,type:'expense',mcc:s.mcc});
      const tx=FinanzN26.txFromBank({id:`mcc-${s.key}`,date:'2026-08-29',amount:12.34,direction:'debit',merchant:s.merchant,title:s.merchant,mcc:s.mcc});
      out[s.key]={category:catName(smart.categoryId),source:smart.source,reason:smart.reason,txCategory:catName(tx.categoryId),txMcc:tx.mcc};
    }

    const clothes=data.categories.find(c=>FinanceLib.normalizeText(c.name)==='kleidung')?.id;
    const food=data.categories.find(c=>FinanceLib.normalizeText(c.name)==='lebensmittel')?.id;
    const account=data.accounts[0].id;
    data.merchantRules.push({id:'manual-mcc-test',pattern:'EDEKA TEST',merchant:'EDEKA TEST',categoryId:clothes,accountId:account,active:true,learned:false});
    const manual=FinanzCategoryIntelligence.categorizeTransaction({merchant:'EDEKA TEST',title:'EDEKA TEST',type:'expense',mcc:'5411'});

    const existing={id:'old-n26',date:'2026-08-28',title:'Edeka Bolinger',merchant:'EDEKA',sourceMerchant:'Edeka Bolinger',amount:20,type:'expense',categoryId:clothes,accountId:account,memberId:data.members[0].id,status:'paid',source:'n26',tags:['n26'],externalId:'old-ext',categorySource:'smart',categoryConfidence:.9};
    data.transactions.push(existing);
    const changed=FinanzN26.enrichExisting(existing,{...existing,mcc:'5411',categoryId:food,categorySource:'mcc+smart',categoryConfidence:.997,categoryReason:'test'});
    return {out,manual:{category:catName(manual.categoryId),source:manual.source},enriched:{changed,category:catName(existing.categoryId),mcc:existing.mcc,source:existing.categorySource}};
  });

  for(const [key,want] of Object.entries({edeka:'Lebensmittel',penny:'Lebensmittel',restaurant:'Restaurant',vodafone:'Abos & Verträge',health:'Gesundheit',clothes:'Kleidung',transactionSpecific:'Lebensmittel'})){
    assert.equal(result.out[key].category,want,`${key} smart category`);
    assert.equal(result.out[key].txCategory,want,`${key} N26 category`);
    assert.match(result.out[key].txMcc,/^\d{4}$/);
  }
  assert.equal(result.manual.category,'Kleidung');
  assert.equal(result.manual.source,'manual');
  assert.equal(result.enriched.changed,true);
  assert.equal(result.enriched.category,'Lebensmittel');
  assert.equal(result.enriched.mcc,'5411');

  const backend=await readFile('finanzplan-backend/supabase/functions/finanzplan-api/index.ts','utf8');
  assert.match(backend,/merchant_category_code/);
  assert.match(backend,/mcc/);

  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Finanzplan V3.2 MCC intelligence smoke: OK');
} finally {await browser.close()}
