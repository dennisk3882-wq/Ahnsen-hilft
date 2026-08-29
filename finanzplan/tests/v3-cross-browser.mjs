import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';

async function run(browserType,name,viewport){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext({viewport,locale:'de-DE'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  try{
    await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
    const setup=page.locator('#newProjectForm');
    await setup.waitFor({state:'visible',timeout:12000});
    await setup.locator('[name="household"]').fill(`V3 ${name}`);
    await setup.locator('[name="accountName"]').fill('Giro');
    await setup.locator('[name="balance"]').fill('1000');
    await setup.locator('button.primary-button').click();
    await page.locator('#modalBackdrop').waitFor({state:'hidden'});
    await page.waitForFunction(()=>globalThis.FinanzV3?.version==='3.1.0');
    assert.equal(await page.evaluate(()=>data.version),'3.1.0');
    assert.equal(await page.evaluate(()=>data.schemaVersion),3);
    assert.equal(await page.evaluate(()=>localStorage.getItem('finanzplan:data:v1')),null);
    assert.equal(await page.evaluate(async()=>!!(await window.__finanzplanStorage.loadState())),true);
    assert.equal(await page.locator('#installPwaButton').isVisible(),true);

    await page.evaluate(()=>{
      const a=data.accounts[0].id,m=data.members[0].id,d=localISO(now);
      data.transactions.push({id:'cent10',date:d,title:'Cent A',amount:.1,type:'expense',categoryId:'c_other',accountId:a,memberId:m,status:'paid'});
      data.transactions.push({id:'cent20',date:d,title:'Cent B',amount:.2,type:'expense',categoryId:'c_other',accountId:a,memberId:m,status:'paid'});
      saveData('Cent test');
    });
    await page.evaluate(()=>FinanzV3.flush());
    assert.equal(await page.evaluate(()=>data.transactions.find(t=>t.id==='cent10').amountCents),10);
    assert.equal(await page.evaluate(()=>data.transactions.find(t=>t.id==='cent20').amountCents),20);
    assert.equal(await page.evaluate(()=>Math.round(monthSummary().expense*100)),30);

    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>globalThis.FinanzV3?.version==='3.1.0'&&data.transactions.some(t=>t.id==='cent20'),null,{timeout:12000});
    assert.equal(await page.evaluate(()=>localStorage.getItem('finanzplan:data:v1')),null);
    assert.equal(await page.evaluate(()=>Math.round(monthSummary().expense*100)),30);
    assert.equal(await page.evaluate(()=>FinanzDiagnostics.runDiagnostics().then(x=>x.indexedDb)),true);
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(`V3 ${name} cross-browser: OK`);
  } finally { await browser.close(); }
}

await run(chromium,'Chromium Desktop',{width:1440,height:1000});
await run(webkit,'WebKit Mobile',{width:390,height:844});