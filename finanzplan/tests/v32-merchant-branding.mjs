import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:412,height:915},locale:'de-DE'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});
const svg='<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Test Brand</title><path d="M2 2h20v20H2z"/></svg>';
await page.route('https://cdn.jsdelivr.net/npm/simple-icons@16.29.0/icons/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*','cache-control':'public, max-age=3600'},body:svg}));
try{
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.FinanzBrand&&window.FinanzCategoryIntelligence&&window.__finanzplanV32Ready===true,{timeout:12000});
  const first=page.locator('#newProjectForm');
  if(await first.isVisible().catch(()=>false)){
    await first.locator('[name="household"]').fill('Brand Test');
    await first.locator('button.primary-button').click();
    await page.locator('#modalBackdrop').waitFor({state:'hidden',timeout:12000});
  }
  const result=await page.evaluate(async()=>{
    const knownEdeka=FinanzBrand.brandFor({title:'EDEKA BOLINGER'});
    const knownNetflix=FinanzBrand.brandFor({title:'NETFLIX.COM'});
    const cash=FinanzBrand.brandFor({title:'PMNT',note:'Bargeldauszahlung an der Kasse',categoryId:'c_cash'});
    const unknown=FinanzBrand.brandFor({title:'Buchholz Genusswelt'});
    const fallbackHtml=FinanzBrand.logoHTML({title:'Buchholz Genusswelt'},{size:40});
    const knownUrl=FinanzBrand.iconUrl(knownEdeka.slug);
    const host=document.createElement('div');
    host.innerHTML=FinanzBrand.logoHTML({title:'EDEKA BOLINGER'},{size:40})+FinanzBrand.logoHTML({title:'Buchholz Genusswelt'},{size:40})+FinanzBrand.logoHTML({title:'Bargeldabhebung',categoryId:'c_cash'},{size:40});
    document.body.appendChild(host);
    await FinanzBrand.hydrate(host);
    const nodes=[...host.querySelectorAll('.merchant-logo')];
    const edekaSvg=!!nodes[0]?.querySelector('svg path');
    const unknownSvg=!!nodes[1]?.querySelector('svg');
    const cashText=nodes[2]?.textContent;
    const ids=Object.fromEntries(data.categories.map(c=>[c.name,c.id]));
    data.transactions=[
      {id:'b1',date:localISO(selectedMonth),title:'EDEKA BOLINGER',merchant:'EDEKA',amount:50,type:'expense',categoryId:ids.Lebensmittel||'c_food',accountId:data.accounts[0]?.id||'',status:'paid'},
      {id:'b2',date:localISO(selectedMonth),title:'EDEKA BOLINGER',merchant:'EDEKA',amount:20,type:'expense',categoryId:ids.Lebensmittel||'c_food',accountId:data.accounts[0]?.id||'',status:'paid'},
      {id:'b3',date:localISO(selectedMonth),title:'Netflix',merchant:'Netflix',amount:17.99,type:'expense',categoryId:ids['Abos & Verträge']||'c_subs',accountId:data.accounts[0]?.id||'',status:'paid'}
    ];
    data.contracts=[
      {id:'bc1',name:'Netflix Standard',provider:'Netflix',amount:17.99,frequency:'monthly',categoryId:'c_subs',nextDate:localISO(now),start:localISO(now),end:'',noticeDays:30,type:'contract',active:true}
    ];
    data.insurances=[
      {id:'bi1',name:'Privathaftpflicht',provider:'Allianz',amount:96,frequency:'annual',nextDate:localISO(now),policyNo:'',noticeDays:90}
    ];
    const top=FinanzBrand.topMerchants(selectedMonth,5);
    renderDashboard();renderTransactions();renderStats();renderContracts();renderSettings();
    await FinanzBrand.hydrate(document);
    const contractButton=document.querySelector('[data-edit-contract="bc1"]');
    const insuranceButton=document.querySelector('[data-edit-insurance="bi1"]');
    const contractRow=contractButton?.closest('.list-row');
    const insuranceRow=insuranceButton?.closest('.list-row');
    const ui={
      dashboardLogos:document.querySelectorAll('#view-dashboard .merchant-logo').length,
      dashboardSvgs:document.querySelectorAll('#view-dashboard .merchant-logo svg').length,
      transactionLogos:document.querySelectorAll('#view-transactions .merchant-logo').length,
      transactionSvgs:document.querySelectorAll('#view-transactions .merchant-logo svg').length,
      statsLogos:document.querySelectorAll('#view-stats .merchant-logo').length,
      contractLogos:document.querySelectorAll('#view-contracts .merchant-logo').length,
      netflixContractLogo:!!contractRow?.querySelector('.merchant-logo'),
      netflixContractSvg:!!contractRow?.querySelector('.merchant-logo svg path'),
      insuranceBrandSlot:!!insuranceRow?.querySelector('.merchant-logo'),
      insuranceHasVisual:!!insuranceRow?.querySelector('.merchant-logo svg, .merchant-logo-fallback, .merchant-logo-system'),
      settingsCard:!!document.querySelector('#merchantBrandSettings'),
      settingsText:document.querySelector('#merchantBrandSettings')?.textContent||''
    };
    host.remove();
    return {knownEdeka,knownNetflix,cash,unknown,fallbackHtml,knownUrl,edekaSvg,unknownSvg,cashText,top:top.map(x=>({name:x.name,value:x.value,count:x.count})),ui,version:FinanzBrand.version};
  });
  assert.equal(result.knownEdeka.name,'EDEKA');
  assert.equal(result.knownEdeka.slug,'edeka');
  assert.equal(result.knownNetflix.name,'Netflix');
  assert.equal(result.knownNetflix.slug,'netflix');
  assert.equal(result.cash.kind,'cash');
  assert.equal(result.cash.name,'Bargeldabhebung');
  assert.equal(result.unknown.kind,'fallback');
  assert.match(result.fallbackHtml,/merchant-logo-fallback/);
  assert.match(result.knownUrl,/cdn\.jsdelivr\.net\/npm\/simple-icons@16\.29\.0\/icons\/edeka\.svg/);
  assert.equal(result.edekaSvg,true,'known merchant must hydrate into a sanitized inline SVG logo');
  assert.equal(result.unknownSvg,false,'unknown local merchant must retain safe initials fallback');
  assert.equal(result.cashText,'€');
  assert.equal(result.top[0].name,'EDEKA');
  assert.equal(result.top[0].value,70);
  assert.equal(result.top[0].count,2);
  assert.ok(result.ui.dashboardLogos>=1);
  assert.ok(result.ui.dashboardSvgs>=1);
  assert.ok(result.ui.transactionLogos>=3);
  assert.ok(result.ui.transactionSvgs>=3);
  assert.ok(result.ui.statsLogos>=2);
  assert.ok(result.ui.contractLogos>=2);
  assert.equal(result.ui.netflixContractLogo,true);
  assert.equal(result.ui.netflixContractSvg,true,'known contract provider must use an inline SVG logo');
  assert.equal(result.ui.insuranceBrandSlot,true);
  assert.equal(result.ui.insuranceHasVisual,true,'insurer must retain a safe branded/fallback visual even when no official icon is available');
  assert.equal(result.ui.settingsCard,true);
  assert.match(result.ui.settingsText,/Keine Einrichtung nötig/);
  assert.equal(result.version,'16.29.0');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Finanzplan V3.2 merchant branding smoke: OK');
} finally {await browser.close()}
