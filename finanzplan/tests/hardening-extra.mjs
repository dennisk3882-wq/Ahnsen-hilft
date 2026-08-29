import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});const setup=page.locator('#newProjectForm');await setup.waitFor({state:'visible',timeout:12000});await setup.locator('[name="household"]').fill('Extra Test');await setup.locator('[name="accountName"]').fill('Giro');await setup.locator('[name="balance"]').fill('2000');await setup.locator('button.primary-button').click();await page.locator('#modalBackdrop').waitFor({state:'hidden'});

  const results=await page.evaluate(()=>{
    const today=localISO(now),monthStartIso=localISO(monthStart(now)),monthEndIso=localISO(monthEnd(now));
    data.settings.essentialCategoryIds=['c_mob'];
    data.transactions.push({id:'fuel_edge',date:today,title:'Tanken Edge',amount:25,type:'expense',categoryId:'c_fuel',accountId:data.accounts[0].id,memberId:'m1',status:'paid'});
    const essential=variableEssentialMonth(selectedMonth);
    const project={id:'pedge',name:'Mobil Projekt',budget:100,spent:0,start:monthStartIso,end:monthEndIso,categoryIds:['c_mob'],tag:''};
    const projectValue=projectSpend(project);

    const src={id:'cycle_contract',name:'Jahresbeitrag',amount:600,frequency:'annual',nextDate:today,active:true,autoReserve:true,accountId:data.accounts[0].id};data.contracts.push(src);syncLinkedRecurring(src,'contract');const r=data.reserves.find(x=>x.contractId===src.id);r.target=600;r.monthly=50;r._v22BaseMonth='2026-06';r._v22BaseCurrent=600;r._v22BaselinePaid={};data.transactions.push({id:'cycle_paid',date:'2026-07-15',title:'Jahresbeitrag',amount:600,type:'expense',categoryId:'c_subs',accountId:data.accounts[0].id,memberId:'m1',status:'paid',contractId:src.id});const cycleReserve=reserveCurrentDerived(r);

    data.members.push({id:'limited_edge',name:'Kind Profil',role:'limited',active:true});data.settings.activeMemberId='limited_edge';const oldView=currentView;navigate('settings');const blockedView=currentView===oldView;const deleteBlocked=softDelete('contracts','cycle_contract','Testvertrag',false)===false;data.settings.activeMemberId='m1';
    saveData('Extra edge save');
    return{essential,projectValue,cycleReserve,blockedView,deleteBlocked,version:data.version,schema:data.schemaVersion};
  });
  assert.ok(results.essential>=25,'parent essential category must include fuel subcategory');assert.ok(results.projectValue>=25,'project parent category must include fuel subcategory');assert.equal(Math.round(results.cycleReserve),50);assert.equal(results.blockedView,true);assert.equal(results.deleteBlocked,true);assert.match(results.version,/^3\.(0|1|2)\.0$/);assert.equal(results.schema,3);

  await page.evaluate(async()=>{await storeFile(new File([new TextEncoder().encode('trash-only')],'trash-only.txt',{type:'text/plain'}),'');const id=data.documents.find(d=>d.name==='trash-only.txt').id;await deleteStoredFile(id)});
  assert.equal(await page.evaluate(()=>data.documents.some(d=>d.name==='trash-only.txt')),false);assert.equal(await page.evaluate(()=>data.trash.some(x=>x.collection==='documents'&&x.item?.name==='trash-only.txt')),true);
  await page.evaluate(()=>openNewProjectWizard(false));await page.locator('#modalTitle').waitFor({state:'visible'});assert.match(await page.locator('#modalTitle').textContent(),/Belege vor Reset sichern/);await page.locator('[data-cancel]').click();

  const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');assert.match(csp,/default-src 'self'/);
  const manifest=await page.evaluate(async()=>await (await fetch('./manifest.webmanifest')).json());assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
  if(errors.length)throw new Error(errors.join('\n'));console.log('Finanzplan V3 extra edge smoke: OK');
}finally{await browser.close()}
