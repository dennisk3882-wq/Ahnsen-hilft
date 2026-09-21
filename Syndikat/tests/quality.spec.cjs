const {test,expect}=require('playwright/test');
const fs=require('fs');const path=require('path');
const base='http://127.0.0.1:4173/index-source.html';
test.use({viewport:{width:390,height:844}});
async function start(page,url=base){await page.goto(url);await page.locator('#newGameBtn').click();await page.selectOption('#aiCount','0');await page.selectOption('#guidedTutorial','off');await page.locator('#startGameBtn').click();await page.keyboard.press('Escape');}

test('all 218 graphics decode in the browser engine',async({page})=>{
 await page.goto(base);const assets=fs.readdirSync(path.join(__dirname,'../assets')).filter(x=>/\.(svg|webp|png|jpg)$/.test(x));
 const failed=await page.evaluate(async names=>{const bad=[];for(const name of names){try{const img=new Image();img.src='./assets/'+name;await img.decode();if(!img.naturalWidth)bad.push(name);}catch{bad.push(name);}}return bad;},assets);
 expect(failed).toEqual([]);
});
test('WCAG audit of menu, setup, city, actions and business dialog',async({page})=>{
 const axe=require.resolve('axe-core/axe.min.js');
 async function audit(){await page.addScriptTag({path:axe});const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);}
 await page.goto(base);await audit();await page.locator('#newGameBtn').click();await audit();await page.selectOption('#aiCount','0');await page.selectOption('#guidedTutorial','off');await page.locator('#startGameBtn').click();await page.keyboard.press('Escape');await audit();
 await page.locator('.bottom-bar [data-view="actions"]').click();await audit();await page.locator('.bottom-bar [data-view="businesses"]').click();await page.locator('[data-action="open-buy"]').click();await audit();
});
test('cached restart restores save and gameplay without origin access',{tag:'@offline'},async({page,context,browserName,request})=>{
 let server,url=base;
 try{
  if(browserName==='webkit'){
   // WebKit's setOffline rejects even literal service-worker responses:
   // https://github.com/microsoft/playwright/issues/42775
   // Test a stopped origin instead; this is not full network-offline emulation.
   const {spawn}=require('node:child_process');
   server=spawn('python3',[path.join(__dirname,'../tools/serve-candidate.py')],{env:{...process.env,SYNDIKAT_TEST_PORT:'4180'},stdio:'ignore'});
   url='http://127.0.0.1:4180/index-source.html';
   await expect.poll(async()=>{try{return (await request.get(url)).ok();}catch{return false;}}).toBe(true);
  }
  await start(page,url);await page.locator('.bottom-bar [data-view="businesses"]').click();await page.locator('[data-action="open-buy"]').click();await page.locator('[data-buy="machines"]').click();
  await page.evaluate(()=>navigator.serviceWorker.ready);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  if(server){
   await context.route('https://**/*',route=>route.abort());
   const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped;
   // A direct uncached request must fail, proving the origin really is unavailable.
   await expect(request.get(url,{timeout:2000})).rejects.toThrow();
  }else await context.setOffline(true);
  await page.reload();await page.locator('#continueBtn').click();
  await expect(page.locator('#gameScreen')).toHaveClass(/active/);await expect.poll(()=>page.locator('.city-art-map img').evaluate(i=>i.naturalWidth)).toBeGreaterThan(0);
  await page.locator('#endTurnBtn').click();await expect(page.locator('#roundLabel')).toContainText('2');
 }finally{if(server&&server.exitCode===null)server.kill('SIGTERM');await context.setOffline(false);}
});
test('300-round browser soak uses normal turns and bounded DOM/save growth',async({page})=>{
 test.setTimeout(180000);await page.goto(base);await page.locator('#newGameBtn').click();await page.selectOption('#aiCount','0');await page.selectOption('#gameLength','endless');await page.selectOption('#guidedTutorial','off');await page.locator('#startGameBtn').click();await page.keyboard.press('Escape');
 // Established save fixture isolates long-session rendering from insolvency; turns use UI.
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('syndikat_save_v3'));s.players[0].clean=100000000;localStorage.setItem('syndikat_save_v3',JSON.stringify(s));});await page.reload();await page.locator('#continueBtn').click();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));const times=[];
 for(let i=0;i<300;i++){await page.keyboard.press('Escape');const t=Date.now();await page.locator('#endTurnBtn').click();times.push(Date.now()-t);}
 const size=await page.evaluate(()=>({nodes:document.querySelectorAll('*').length,bytes:localStorage.getItem('syndikat_save_v3').length}));
 expect(size.nodes).toBeLessThan(5000);expect(size.bytes).toBeLessThan(2000000);expect(times.sort((a,b)=>a-b)[285]).toBeLessThan(2000);expect(errors).toEqual([]);await expect(page.locator('#roundLabel')).toContainText('301');
});
