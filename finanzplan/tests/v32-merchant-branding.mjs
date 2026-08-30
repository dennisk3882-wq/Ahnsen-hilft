import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:412,height:915},locale:'de-DE'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
await page.route('https://api.brandfetch.io/**',async route=>{
  const u=route.request().url();
  if(u.includes('Buchholz%20Genusswelt'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{name:'Buchholz Genusswelt',domain:'genusswelt.example'}])});
  return route.fulfill({status:200,contentType:'application/json',body:'[]'});
});
await page.route('https://cdn.brandfetch.io/**',route=>route.fulfill({status:200,contentType:'image/png',body:png}));
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
    FinanzBrand.cfg().clientId='test-client';
    const knownUrl=FinanzBrand.logoUrl(knownEdeka.domain,80);
    const host=document.createElement('div');
    host.innerHTML=FinanzBrand.logoHTML({title:'EDEKA BOLINGER'},{size:40})+FinanzBrand.logoHTML({title:'Buchholz Genusswelt'},{size:40})+FinanzBrand.logoHTML({title:'Bargeldabhebung',categoryId:'c_cash'},{size:40});
    document.body.appendChild(host);
    await FinanzBrand.hydrate(host);
    await new Promise(r=>setTimeout(r,50));
    const nodes=[...host.querySelectorAll('.merchant-logo')];
    const edekaImg=!!nodes[0]?.querySelector('img');
    const learned=FinanzBrand.brandFor({title:'Buchholz Genusswelt'});
    const unknownImg=!!nodes[1]?.querySelector('img');
    const cashText=nodes[2]?.textContent;
    const ids=Object.fromEntries(data.categories.map(c=>[c.name,c.id]));
    data.transactions=[
      {id:'b1',date:localISO(selectedMonth),title:'EDEKA BOLINGER',merchant:'EDEKA',amount:50,type:'expense',categoryId:ids.Lebensmittel||'c_food',accountId:data.accounts[0]?.id||'',status:'paid'},
      {id:'b2',date:localISO(selectedMonth),title:'EDEKA BOLINGER',merchant:'EDEKA',amount:20,type:'expense',categoryId:ids.Lebensmittel||'c_food',accountId:data.accounts[0]?.id||'',status:'paid'},
      {id:'b3',date:localISO(selectedMonth),title:'Netflix',merchant:'Netflix',amount:17.99,type:'expense',categoryId:ids['Abos & Verträge']||'c_subs',accountId:data.accounts[0]?.id||'',status:'paid'}
    ];
    const top=FinanzBrand.topMerchants(selectedMonth,5);
    renderDashboard();renderTransactions();renderStats();renderContracts();
    const ui={
      dashboardLogos:document.querySelectorAll('#view-dashboard .merchant-logo').length,
      transactionLogos:document.querySelectorAll('#view-transactions .merchant-logo').length,
      statsLogos:document.querySelectorAll('#view-stats .merchant-logo').length,
      contractLogos:document.querySelectorAll('#view-contracts .merchant-logo').length,
      settingsCard:!!document.querySelector('#merchantBrandSettings')
    };
    host.remove();
    return {knownEdeka,knownNetflix,cash,unknown,fallbackHtml,knownUrl,edekaImg,unknownImg,cashText,learned,top:top.map(x=>({name:x.name,value:x.value,count:x.count})),ui};
  });
  assert.equal(result.knownEdeka.name,'EDEKA');
  assert.equal(result.knownEdeka.domain,'edeka.de');
  assert.equal(result.knownNetflix.name,'Netflix');
  assert.equal(result.knownNetflix.domain,'netflix.com');
  assert.equal(result.cash.kind,'cash');
  assert.equal(result.cash.name,'Bargeldabhebung');
  assert.equal(result.unknown.kind,'fallback');
  assert.match(result.fallbackHtml,/merchant-logo-fallback/);
  assert.match(result.knownUrl,/cdn\.brandfetch\.io\/domain\/edeka\.de/);
  assert.equal(result.edekaImg,true,'known merchant logo should hydrate from Brandfetch');
  assert.equal(result.unknownImg,true,'unknown merchant should search Brandfetch and then hydrate');
  assert.equal(result.learned.domain,'genusswelt.example');
  assert.equal(result.cashText,'€');
  assert.equal(result.top[0].name,'EDEKA');
  assert.equal(result.top[0].value,70);
  assert.equal(result.top[0].count,2);
  assert.ok(result.ui.dashboardLogos>=1);
  assert.ok(result.ui.transactionLogos>=3);
  assert.ok(result.ui.statsLogos>=2);
  assert.ok(result.ui.contractLogos>=1);
  assert.equal(result.ui.settingsCard,true);
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Finanzplan V3.2 merchant branding smoke: OK');
} finally {await browser.close()}
