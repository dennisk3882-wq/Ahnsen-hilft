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
  const setup=page.locator('#newProjectForm');
  await setup.waitFor({state:'visible',timeout:8000});
  await setup.locator('[name="household"]').fill('V31 Test');
  await setup.locator('[name="accountName"]').fill('V31 Giro');
  await setup.locator('[name="balance"]').fill('1000');
  await setup.locator('button.primary-button').click();
  await page.locator('#modalBackdrop').waitFor({state:'hidden',timeout:5000});
  await page.waitForFunction(()=>window.FinanzPremium?.VERSION==='3.1.0'&&window.FinanzAI&&window.FinanzCloud&&window.FinanzStatementImport);

  const base=await page.evaluate(()=>({
    version:data.version,
    cloudUrl:data.integrations?.cloud?.url,
    key:data.integrations?.cloud?.publishableKey,
    api:Object.keys(FinanzPremium),
    ai:FinanzAI.localExplain('Wie viel kann ich frei ausgeben?'),
    qif:FinanzStatementImport.parseQIF('!Type:Bank\nD29.08.2026\nT-12,34\nPTest Händler\nMTest\nNabc\n^'),
    ofx:FinanzStatementImport.parseOFX('<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260829<TRNAMT>-5.50<NAME>Shop<FITID>x1</STMTTRN></BANKTRANLIST></OFX>'),
    auto:FinanzPremium.autopilot(),
    year:FinanzPremium.annualCompare(new Date().getFullYear())
  }));
  assert.equal(base.version,'3.1.0');
  assert.match(base.cloudUrl,/^https:\/\/[^/]+\.supabase\.co$/);
  assert.match(base.key,/^sb_publishable_/);
  assert.ok(base.api.includes('uncertaintyForecast')&&base.api.includes('anomalies')&&base.api.includes('generateMonthlyReport'));
  assert.ok(base.ai.length>20);
  assert.equal(base.qif.length,1);assert.equal(Math.round(base.qif[0].signedAmount*100),-1234);
  assert.equal(base.ofx.length,1);assert.equal(Math.round(base.ofx[0].signedAmount*100),-550);
  assert.ok(Number.isFinite(base.auto.forecast.monthEnd.base));
  assert.ok(Number.isFinite(base.year.current.expense));

  const asset=await page.evaluate(()=>{
    const before=netWorth();
    FinanzPremium.upsertAsset({name:'Test Asset',type:'other',currentValue:250});
    saveData('Asset test');
    return {before,after:netWorth(),assets:data.assets.length,allocation:FinanzPremium.assetAllocation()};
  });
  assert.equal(asset.assets,1);
  assert.equal(Math.round((asset.after-asset.before)*100),25000);
  assert.ok(asset.allocation.some(x=>x.type==='other'&&Math.round(x.value*100)===25000));

  const report=await page.evaluate(()=>FinanzPremium.generateMonthlyReport(new Date(new Date().getFullYear(),new Date().getMonth()-1,1),false));
  assert.match(report.id,/^report:/);assert.ok(Number.isFinite(report.income));assert.ok(Number.isFinite(report.netWorth));

  const storage=await page.evaluate(async()=>{await FinanzV3.flush();const state=await window.__finanzplanStorage.loadState();return {version:state.version,assets:state.assets?.length||0,plain:localStorage.getItem('finanzplan:data:v1')}});
  assert.equal(storage.version,'3.1.0');assert.equal(storage.assets,1);assert.equal(storage.plain,null);

  // V3.1 must stay offline-capable even though cloud configuration is present but disabled.
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.ready));
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.FinanzPremium?.VERSION==='3.1.0');
  const offline=await page.evaluate(()=>({version:data.version,asset:data.assets?.[0]?.name,cloudEnabled:!!data.integrations?.cloud?.enabled}));
  assert.equal(offline.version,'3.1.0');assert.equal(offline.asset,'Test Asset');assert.equal(offline.cloudEnabled,false);

  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Finanzplan V3.1 premium smoke: OK');
} finally {await browser.close()}
