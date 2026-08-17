import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const server=spawn('python3',['-m','http.server','4173','--bind','127.0.0.1'],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(){for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:4173/');if(r.ok)return;}catch{}await wait(150);}throw new Error('local server did not start');}
let browser;
try{
  await ready(); browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.click('#newBtn'); await page.fill('#cityName','E2E-Stadt'); await page.fill('#mayorName','Test'); await page.click('#startBtn');
  const before=await page.locator('[data-buy="houses"]').count(); assert.ok(before>0,'market buy button missing');
  await page.click('[data-buy="houses"]');
  await page.click('[data-game-tab="city"]'); assert.ok((await page.locator('text=Wohnraum').count())>0,'city metrics missing');
  await page.click('#monthBtn');
  const saldo0=await page.locator('#liveSaldo').textContent();
  await page.$eval('#tax',el=>{el.value='16';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const saldo1=await page.locator('#liveSaldo').textContent(); assert.notEqual(saldo0,saldo1,'tax slider does not update live balance');
  await page.click('#cancelMonth');

  // Seed a wealthy save and verify supermarket export economics in the real UI.
  await page.evaluate(()=>{const k='buergermeister1992plus.save.v1';const g=JSON.parse(localStorage.getItem(k));g.cash=100000;g.inventory.supermarkets=1;g.inventory.food=3000;g.inventory.land=40;localStorage.setItem(k,JSON.stringify(g));});
  await page.reload({waitUntil:'networkidle'}); await page.click('#continueBtn'); await page.click('#monthBtn');
  const need=await page.evaluate(()=>{const g=JSON.parse(localStorage.getItem('buergermeister1992plus.save.v1'));return Math.ceil(g.population*.68*(1-Math.min(.20,g.inventory.supermarkets*.04)));});
  await page.$eval('#food',(el,val)=>{el.value=String(val);el.dispatchEvent(new Event('input',{bubbles:true}));},need+150);
  const rev=await page.locator('#liveFoodExport').textContent(); const cost=await page.locator('#liveFoodExportCost').textContent(); const margin=await page.locator('#liveFoodExportMargin').textContent();
  assert.ok(!rev.includes('+0'),'regional export revenue not shown'); assert.ok(!cost.includes('−0'),'export restocking cost not shown'); assert.ok(!margin.includes('0 $'),'export margin not shown');
  await page.click('#cancelMonth');

  // Save survives reload and mobile viewport has no material horizontal overflow.
  await page.reload({waitUntil:'networkidle'}); assert.equal(await page.locator('#continueBtn').isEnabled(),true,'save did not survive reload');
  await page.click('#continueBtn');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth); assert.ok(overflow<=4,`mobile horizontal overflow ${overflow}px`);
  console.log('E2E_OK',{saldo0,saldo1,rev,cost,margin,overflow});
} finally { if(browser) await browser.close(); server.kill('SIGTERM'); }
