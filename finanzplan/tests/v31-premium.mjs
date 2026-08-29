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
  await page.waitForFunction(()=>window.FinanzPremium?.VERSION==='3.1.0'&&window.FinanzAI&&window.FinanzCloud&&window.FinanzStatementImport&&window.FinanzPush&&window.FinanzPasskey&&window.FinanzV31Status);

  const base=await page.evaluate(()=>({
    version:data.version,
    cloudUrl:data.integrations?.cloud?.url,
    key:data.integrations?.cloud?.publishableKey,
    backend:data.integrations?.backendUrl,
    status:window.FinanzV31Status,
    matrix:featureMatrix().filter(x=>[18,32,38,44].includes(x.n)).map(x=>({n:x.n,status:x.status})),
    passkeyType:typeof FinanzPasskey.unlock,
    api:Object.keys(FinanzPremium),
    ai:FinanzAI.localExplain('Wie viel kann ich frei ausgeben?'),
    qif:FinanzStatementImport.parseQIF('!Type:Bank\nD29.08.2026\nT-12,34\nPTest Händler\nMTest\nNabc\n^'),
    ofx:FinanzStatementImport.parseOFX('<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260829<TRNAMT>-5.50<NAME>Shop<FITID>x1</STMTTRN></BANKTRANLIST></OFX>'),
    mt940:FinanzStatementImport.parseMT940(':20:START\n:61:260829D12,34NTRFNONREF\n:86:Test Händler'),
    camt:FinanzStatementImport.parseCAMT('<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt><Stmt><Ntry><Amt Ccy="EUR">7.89</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-08-29</Dt></BookgDt><NtryDtls><TxDtls><RmtInf><Ustrd>CAMT Test</Ustrd></RmtInf><Refs><AcctSvcrRef>camt1</AcctSvcrRef></Refs></TxDtls></NtryDtls></Ntry></Stmt></BkToCstmrStmt></Document>'),
    auto:FinanzPremium.autopilot(),
    year:FinanzPremium.annualCompare(new Date().getFullYear())
  }));
  assert.equal(base.version,'3.1.0');
  assert.match(base.cloudUrl,/^https:\/\/[^/]+\.supabase\.co$/);
  assert.match(base.key,/^sb_publishable_/);
  assert.match(base.backend,/^https:\/\/[^/]+\.supabase\.co\/functions\/v1\/finanzplan-api$/);
  assert.deepEqual(base.status,{version:'3.1.0',complete:43,partial:2,missing:0});
  assert.equal(base.matrix.find(x=>x.n===18)?.status,'complete');
  assert.equal(base.matrix.find(x=>x.n===32)?.status,'complete');
  assert.equal(base.matrix.find(x=>x.n===38)?.status,'partial');
  assert.equal(base.matrix.find(x=>x.n===44)?.status,'partial');
  assert.equal(base.passkeyType,'function');
  assert.ok(base.api.includes('uncertaintyForecast')&&base.api.includes('anomalies')&&base.api.includes('generateMonthlyReport'));
  assert.ok(base.ai.length>20);
  assert.equal(base.qif.length,1);assert.equal(Math.round(base.qif[0].signedAmount*100),-1234);
  assert.equal(base.ofx.length,1);assert.equal(Math.round(base.ofx[0].signedAmount*100),-550);
  assert.equal(base.mt940.length,1);assert.equal(Math.round(base.mt940[0].signedAmount*100),-1234);
  assert.equal(base.camt.length,1);assert.equal(Math.round(base.camt[0].signedAmount*100),-789);
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

  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.ready));
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.FinanzPremium?.VERSION==='3.1.0'&&window.FinanzV31Status?.complete===43);
  const offline=await page.evaluate(()=>({version:data.version,asset:data.assets?.[0]?.name,cloudEnabled:!!data.integrations?.cloud?.enabled,status:FinanzV31Status.complete}));
  assert.equal(offline.version,'3.1.0');assert.equal(offline.asset,'Test Asset');assert.equal(offline.cloudEnabled,false);assert.equal(offline.status,43);

  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Finanzplan V3.1 premium smoke: OK');
} finally {await browser.close()}
