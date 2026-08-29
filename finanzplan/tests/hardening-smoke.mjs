import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE',acceptDownloads:true});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});
const waitClosed=()=>page.locator('#modalBackdrop').waitFor({state:'hidden',timeout:5000});

try{
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
  const setup=page.locator('#newProjectForm');await setup.waitFor({state:'visible',timeout:7000});await setup.locator('[name="household"]').fill('Hardening Haushalt');await setup.locator('[name="accountName"]').fill('Giro');await setup.locator('[name="balance"]').fill('1000');await setup.locator('button.primary-button').click();await waitClosed();
  await page.evaluate(()=>{data.accounts.push({id:'a_second',name:'Tagesgeld',type:'savings',openingBalance:500,openingDate:localISO(now),includeNetWorth:true,spendable:false});saveData('Testkonto')});

  // Same-account transfers must be rejected and ledger impact must be zero.
  await page.locator('#quickAddMobile').click();await page.locator('[data-q="transfer"]').click();let f=page.locator('#txForm');await f.locator('[name="title"]').fill('Ungültige Umbuchung');await f.locator('[name="amount"]').fill('100');const source=await f.locator('[name="accountId"]').inputValue();await f.locator('[name="targetAccountId"]').selectOption(source);await f.locator('button.primary-button').click();assert.equal(await page.locator('#modalBackdrop').isVisible(),true);assert.equal(await page.evaluate(()=>data.transactions.some(t=>t.title==='Ungültige Umbuchung')),false);await f.locator('[data-cancel]').click();await waitClosed();assert.equal(await page.evaluate(()=>txAccountImpact({status:'paid',type:'transfer',amount:100,accountId:'x',targetAccountId:'x'},'x')),0);

  // Split expense 70/30 and proportional partial refund 35/15.
  await page.locator('#quickAddMobile').click();await page.locator('[data-q="expense"]').click();f=page.locator('#txForm');await f.locator('[name="title"]').fill('Split Original');await f.locator('[name="amount"]').fill('100');await f.locator('#splitToggle').check();const cats=f.locator('[name="splitCategory"]'),amts=f.locator('[name="splitAmount"]');await cats.nth(0).selectOption('c_food');await cats.nth(1).selectOption('c_other');await amts.nth(0).fill('70');await amts.nth(1).fill('30');await f.locator('button.primary-button').click();await waitClosed();
  const originalId=await page.evaluate(()=>data.transactions.find(t=>t.title==='Split Original').id);
  await page.locator('#quickAddMobile').click();await page.locator('[data-q="refund"]').click();f=page.locator('#txForm');await f.locator('[name="title"]').fill('Teil-Erstattung');await f.locator('[name="amount"]').fill('50');await f.locator('[name="refundOf"]').selectOption(originalId);await f.locator('button.primary-button').click();await waitClosed();
  const refund=await page.evaluate(()=>data.transactions.find(t=>t.title==='Teil-Erstattung'));
  assert.deepEqual(refund.splits.map(x=>[x.categoryId,x.amount]),[['c_food',35],['c_other',15]]);
  assert.equal(Math.round((await page.evaluate(()=>categorySpend('c_food')))*100),3500);

  // Over-refund must be rejected (only 50 remains).
  await page.locator('#quickAddMobile').click();await page.locator('[data-q="refund"]').click();f=page.locator('#txForm');await f.locator('[name="title"]').fill('Zu hohe Erstattung');await f.locator('[name="amount"]').fill('60');await f.locator('[name="refundOf"]').selectOption(originalId);await f.locator('button.primary-button').click();assert.equal(await page.locator('#modalBackdrop').isVisible(),true);assert.equal(await page.evaluate(()=>data.transactions.some(t=>t.title==='Zu hohe Erstattung')),false);await f.locator('[data-cancel]').click();await waitClosed();

  // Contract delete/restore must rebuild recurring relationship.
  const contract=await page.evaluate(()=>{const c={id:'hard_contract',name:'Hard Contract',provider:'Test',amount:40,frequency:'monthly',nextDate:localISO(FinanceLib.addMonths(now,1)),end:'',noticeDays:30,active:true,autoReserve:false,accountId:data.accounts[0].id};data.contracts.push(c);syncLinkedRecurring(c,'contract');saveData('Contract test');return c});
  const contractTrash=await page.evaluate(()=>{softDelete('contracts','hard_contract','Hard Contract');return data.trash.find(x=>x.collection==='contracts'&&x.item.id==='hard_contract').id});assert.equal(await page.evaluate(()=>data.recurring.some(r=>r.contractId==='hard_contract')),false);await page.evaluate(id=>restoreTrash(id),contractTrash);assert.equal(await page.evaluate(()=>data.recurring.some(r=>r.contractId==='hard_contract')),true);

  // Debt delete/restore must remove/recreate its recurring rule.
  const debtTrash=await page.evaluate(()=>{const d={id:'hard_debt',name:'Hard Debt',principal:1000,openingBalance:1000,balance:1000,openingDate:localISO(now),start:localISO(now),rate:100,interest:3,paymentDay:5,accountId:data.accounts[0].id,extraPayments:[]};data.debts.push(d);linkDebtRecurring(d);saveData('Debt test');softDelete('debts',d.id,'Hard Debt');return data.trash.find(x=>x.collection==='debts'&&x.item.id===d.id).id});assert.equal(await page.evaluate(()=>data.recurring.some(r=>r.debtId==='hard_debt')),false);await page.evaluate(id=>restoreTrash(id),debtTrash);assert.equal(await page.evaluate(()=>data.recurring.some(r=>r.debtId==='hard_debt')),true);

  // Automatic reserve must roll back when paid -> planned and Safe-to-Spend may not double count a covered bill.
  const reserveCheck=await page.evaluate(()=>{const c={id:'reserve_contract',name:'Jahresrechnung',provider:'Test',amount:600,frequency:'annual',nextDate:localISO(now),end:'',noticeDays:30,active:true,autoReserve:true,accountId:data.accounts[0].id};data.contracts.push(c);syncLinkedRecurring(c,'contract');const r=data.reserves.find(x=>x.contractId===c.id);r._v22BaseMonth=monthKey(now);r._v22BaseCurrent=600;r._v22BaselinePaid={};r.current=600;let tx=data.transactions.find(t=>t.contractId===c.id&&(t.status||'planned')==='planned');if(!tx){tx={id:'reserve_tx',date:localISO(now),title:'Jahresrechnung',amount:600,type:'expense',categoryId:'c_subs',accountId:data.accounts[0].id,memberId:'m1',status:'planned',contractId:c.id};data.transactions.push(tx)}tx.date=localISO(now);tx.status='paid';saveData('paid');const afterPaid=reserveCurrentDerived(r);tx.status='planned';saveData('planned');const afterRollback=reserveCurrentDerived(r),events=cashflowEvents(localISO(now),localISO(monthEnd(now))),earmark=earmarkedTotal(events);return{afterPaid,afterRollback,earmark,reserve:reserveCurrentDerived(r),planned:events.filter(x=>x.contractId===c.id).reduce((s,x)=>s+x.amount,0)}});
  assert.equal(Math.round(reserveCheck.afterPaid),0);assert.equal(Math.round(reserveCheck.afterRollback),600);assert.ok(reserveCheck.earmark<reserveCheck.reserve+.01,'covered bill must not be double-counted as earmark');

  // Goal allocations on one account may never exceed the actual account balance.
  const allocation=await page.evaluate(()=>{const id=data.accounts[0].id,bal=Math.max(0,accountBalance(id));data.goals=[{id:'ga',name:'A',target:10000,current:bal,allocated:bal,accountId:id,targetDate:localISO(FinanceLib.addMonths(now,12)),type:'goal'},{id:'gb',name:'B',target:10000,current:bal,allocated:bal,accountId:id,targetDate:localISO(FinanceLib.addMonths(now,12)),type:'goal'}];initializeV22Accounting();return{sum:allocatedOnAccount(id),bal:Math.max(0,accountBalance(id)),a:data.goals[0].allocated,b:data.goals[1].allocated}});assert.ok(allocation.sum<=allocation.bal+.01);

  // Project category accounting must respect splits and proportional refund.
  const projectNet=await page.evaluate(()=>{const p={id:'proj_hard',name:'Food Projekt',budget:500,spent:0,start:localISO(monthStart(now)),end:localISO(monthEnd(now)),categoryIds:['c_food'],tag:''};return projectSpend(p)});assert.equal(Math.round(projectNet*100),3500);

  // A real file must be part of the full bundle.
  await page.evaluate(async()=>{await storeFile(new File([new TextEncoder().encode('receipt-test')],'beleg.txt',{type:'text/plain'}),'')});const bundleInfo=await page.evaluate(async()=>{const b=await buildFullBundle();return{count:b.files.length,hasPayload:b.files.some(f=>f.name==='beleg.txt'&&f.base64.length>0)}});assert.ok(bundleInfo.count>=1&&bundleInfo.hasPayload);

  // Destructive reset with documents must open backup safeguard instead of reset form.
  await page.evaluate(()=>openNewProjectWizard(false));await page.locator('#modalTitle').waitFor({state:'visible'});assert.match(await page.locator('#modalTitle').textContent(),/Belege vor Reset sichern/);await page.locator('[data-cancel]').click();await waitClosed();

  // Vault hard lock must remove key and plaintext data from memory, then password unlock restores it.
  const vault=await page.evaluate(async()=>{await enableVault('secret22');const before=data.accounts.length;await hardVaultLock();const locked={key:!!window.__vaultKey,accounts:data.accounts.length};await unlockVault('secret22');return{before,...locked,after:data.accounts.length}});assert.equal(vault.key,false);assert.equal(vault.accounts,0);assert.equal(vault.after,vault.before);

  const issues=await page.evaluate(()=>integrityReport().map(x=>x.text));assert.deepEqual(issues,[],`integrity issues: ${issues.join('; ')}`);
  if(errors.length)throw new Error(errors.join('\n'));console.log('Finanzplan v2.2 hardening smoke: OK');
}finally{await browser.close()}
