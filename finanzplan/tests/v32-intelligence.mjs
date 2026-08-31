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
  await setup.waitFor({state:'visible',timeout:12000});
  await setup.locator('[name="household"]').fill('V32 Test');
  await setup.locator('[name="accountName"]').fill('V32 Giro');
  await setup.locator('[name="balance"]').fill('1500');
  await setup.locator('button.primary-button').click();
  await page.locator('#modalBackdrop').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.FinanzV32?.version==='3.2.0'&&window.FinanzIntelligence&&window.FinanzE2EE&&window.FinanzMonitoring&&window.FinanzBankingHub&&window.FinanzAIPlus);
  assert.equal(await page.evaluate(()=>data.version),'3.2.0');
  assert.equal(await page.evaluate(()=>FinanzV3.version),'3.2.0');

  const intel=await page.evaluate(()=>{
    const a=data.accounts[0].id,m=data.members[0].id,cat=data.categories.find(c=>c.id==='c_subs')?.id||data.categories.find(c=>c.kind==='expense')?.id;
    // Set the safe day before changing the month. On dates such as 31 August,
    // setMonth() first would overflow June (which has no 31st) into July and
    // accidentally create duplicate test months.
    for(let i=2;i>=0;i--){const d=new Date();d.setDate(12);d.setMonth(d.getMonth()-i);data.transactions.push({id:`spotify_${i}`,date:FinanceLib.iso(d),title:`SPOTIFY AB ${1000+i}`,merchant:'Spotify AB',amount:10.99,type:'expense',categoryId:cat,accountId:a,memberId:m,status:'paid'})}
    const learned=FinanzIntelligence.learnFromHistory();
    const merchant=FinanzIntelligence.canonicalMerchant('Kartenzahlung SPOTIFY AB 123456');
    const draft=applyMerchantRule('SPOTIFY AB 99999',{categoryId:'',accountId:a});
    const candidates=FinanzIntelligence.recurringCandidates();
    const cand=candidates.find(x=>x.merchant==='Spotify');
    const contract=cand?FinanzIntelligence.acceptContractCandidate(cand):null;
    const letter=contract?FinanzIntelligence.cancellationText(contract,{name:'Max Test',address:'Testweg 1'}):'';
    return {learned,merchant,draftCat:draft.categoryId,candidate:!!cand,contract:contract?.provider,letter,contracts:data.contracts.length};
  });
  assert.equal(intel.merchant,'Spotify');
  assert.ok(intel.draftCat);
  assert.equal(intel.candidate,true);
  assert.equal(intel.contract,'Spotify');
  assert.match(intel.letter,/hiermit kündige ich/i);

  const cryptoTest=await page.evaluate(async()=>{
    const salt=crypto.getRandomValues(new Uint8Array(16)),k=await FinanzE2EE.derive('sehr-lange-test-passphrase',salt),iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode('e2ee-ok'),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,plain),back=await crypto.subtle.decrypt({name:'AES-GCM',iv},k,cipher);return new TextDecoder().decode(back)
  });
  assert.equal(cryptoTest,'e2ee-ok');

  const monitor=await page.evaluate(()=>{const e=FinanzMonitoring.record('test','error','test_code','Fehler fuer test@example.com mit 1234,56 EUR');return {message:e.message,summary:FinanzMonitoring.summary(),providers:FinanzBankingHub.list(),ai:FinanzAI.localExplain('Welche Verträge habe ich und wo kann ich sparen?'),roadmap:FinanzV32Onboarding.roadmap()}});
  assert.doesNotMatch(monitor.message,/test@example.com/);
  assert.doesNotMatch(monitor.message,/1234,56/);
  assert.ok(monitor.summary.total>=1);
  assert.ok(monitor.providers.some(x=>x.id==='n26')&&monitor.providers.some(x=>x.id==='file'));
  assert.ok(monitor.ai.length>20);
  assert.equal(monitor.roadmap.length,10);

  await page.evaluate(()=>navigate('settings'));
  await page.locator('#v32SetupCard').waitFor({state:'visible'});
  assert.match(await page.locator('#v32SetupCard').textContent(),/Automation & Intelligence/);
  const sw=await page.evaluate(async()=>await (await fetch('./sw.js')).text());
  assert.match(sw,/finanzplan-v3\.2\.0/);
  await page.evaluate(async()=>await FinanzV3.flush());
  const stored=await page.evaluate(async()=>await window.__finanzplanStorage.loadState());
  assert.equal(stored.version,'3.2.0');

  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.ready));
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.FinanzV32?.version==='3.2.0'&&data.contracts?.some(c=>c.provider==='Spotify'),null,{timeout:12000});
  assert.equal(await page.evaluate(()=>data.version),'3.2.0');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Finanzplan V3.2 intelligence/offline smoke: OK');
} finally {await browser.close()}