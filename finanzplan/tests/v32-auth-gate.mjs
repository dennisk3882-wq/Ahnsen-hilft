import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:412,height:915},locale:'de-DE'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});
const supabase='https://yhsuuoexxjejboqbrvuk.supabase.co';
const user={id:'11111111-1111-4111-8111-111111111111',email:'auth-test@example.de',role:'authenticated',aud:'authenticated'};
const household={id:'22222222-2222-4222-8222-222222222222',name:'Auth Test Haushalt',created_at:'2026-08-31T10:00:00Z'};
await page.route(`${supabase}/**`,async route=>{
  const req=route.request(),u=new URL(req.url()),path=u.pathname;
  if(path==='/auth/v1/token'&&u.searchParams.get('grant_type')==='password'){
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'test-access-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'test-refresh-token',user})});
  }
  if(path==='/auth/v1/logout')return route.fulfill({status:204,body:''});
  if(path==='/rest/v1/households'&&req.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([household])});
  if(path==='/rest/v1/finance_records'&&req.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  if(path==='/rest/v1/finance_records'&&req.method()==='POST'){
    const body=JSON.parse(req.postData()||'{}');
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify([{...body,updated_at:new Date().toISOString(),version:Number(body.version||1)}])});
  }
  if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  return route.fulfill({status:200,contentType:'application/json',body:'{}'});
});
try{
  await page.goto('http://127.0.0.1:8080/?auth_test=1',{waitUntil:'commit'});
  const gate=page.locator('#finanzplanAuthGate');
  await gate.waitFor({state:'visible',timeout:12000});
  assert.equal(await page.locator('#appShell').getAttribute('aria-hidden'),'true','app shell must be inaccessible before login');
  assert.match(await gate.textContent(),/Bei Finanzplan anmelden/);
  assert.match(await gate.textContent(),/Account erstellen/);

  await gate.locator('[data-auth-mode="register"]').click();
  await gate.locator('input[name="consent"]').waitFor({state:'visible'});
  assert.match(await gate.textContent(),/Deinen Finanzplan starten/);
  await gate.locator('[data-auth-mode="login"]').click();

  await gate.locator('input[name="email"]').fill('auth-test@example.de');
  await gate.locator('input[name="password"]').fill('sicheres-test-passwort');
  await gate.locator('[data-auth-submit]').click();
  await gate.waitFor({state:'detached',timeout:15000});
  await page.waitForFunction(()=>window.__finanzplanV32Ready===true&&window.FinanzAuthGate?.version==='1.0.1',{timeout:15000});

  const result=await page.evaluate(async()=>({
    hidden:document.getElementById('appShell')?.getAttribute('aria-hidden'),
    inert:document.getElementById('appShell')?.inert,
    email:document.querySelector('.profile-card small')?.textContent||'',
    household:data.integrations?.cloud?.householdId||'',
    cloudEnabled:!!data.integrations?.cloud?.enabled,
    sessionEmail:(await FinanzCloud.getSession())?.user?.email||'',
    authGate:!!document.getElementById('finanzplanAuthGate'),
    canInvite:typeof FinanzAuthGate.openInvite==='function',
    canAccept:typeof FinanzAuthGate.openAcceptInvite==='function'
  }));
  assert.equal(result.hidden,null);
  assert.equal(result.inert,false);
  assert.equal(result.email,'auth-test@example.de');
  assert.equal(result.household,household.id);
  assert.equal(result.cloudEnabled,true);
  assert.equal(result.sessionEmail,'auth-test@example.de');
  assert.equal(result.authGate,false);
  assert.equal(result.canInvite,true);
  assert.equal(result.canAccept,true);
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Finanzplan V3.2 mandatory auth gate smoke: OK');
} finally {await browser.close()}
