const {test,expect}=require('playwright/test');
test.setTimeout(900000);
const base=process.env.SYNDIKAT_TEST_URL||'http://127.0.0.1:4173/index-source.html';
async function close(page){if(await page.locator('#gameDialog').isVisible())await page.keyboard.press('Escape');}
async function saved(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('syndikat_save_v3')||'null'));}

test('complete online match through visible controls, including closed browser tab and reconnect',async({browser})=>{
 const contexts=await Promise.all([browser.newContext({viewport:{width:390,height:844}}),browser.newContext({viewport:{width:390,height:844}})]);
 let pages=await Promise.all(contexts.map(c=>c.newPage()));let hostSession;const errors=[];
 for(const p of pages)p.on('pageerror',e=>errors.push(String(e)));
 try{
  for(const p of pages){await p.goto(base);await p.locator('[data-cloud-hub]').click();}
  await pages[0].locator('#cloudName').fill('UI Host');await pages[0].locator('#cloudAi').selectOption('0');await pages[0].locator('#cloudLength').selectOption('short');
  await pages[0].locator('[data-cloud-create]').click();await expect(pages[0].locator('[data-online-start]')).toBeVisible();
  hostSession=await pages[0].evaluate(()=>JSON.parse(localStorage.getItem('syndikat_online_session_v1')));
  await pages[1].locator('#joinCode').fill(hostSession.code);await pages[1].locator('#joinName').fill('UI Gast');await pages[1].locator('#joinFamily').fill('Moretti');await pages[1].locator('[data-cloud-join]').click();
  await expect(pages[1].locator('[data-ready]')).toBeVisible();await pages[1].locator('[data-ready]').click();
  await close(pages[0]);await pages[0].locator('[data-cloud-hub]').click();await pages[0].locator('[data-online-start]').click();
  await expect(pages[0].locator('#gameScreen')).toHaveClass(/active/);
  await pages[1].reload();await pages[1].locator('[data-cloud-hub]').click();await pages[1].locator('[data-online-open]').click();await close(pages[1]);
  const sessions=await Promise.all(pages.map(p=>p.evaluate(()=>JSON.parse(localStorage.getItem('syndikat_online_session_v1')))));
  let actions=0,turns=0,finished=null;
  for(;turns<190;turns++){
   const st=await saved(pages[0]);if(st?.gameOver){finished=st;break;}
   const pid=st.players[st.currentIndex].onlineParticipantId,idx=sessions.findIndex(s=>s.participantId===pid),p=pages[idx];
   await expect.poll(async()=>{const s=await saved(p);return s?.players[s.currentIndex]?.onlineParticipantId},{timeout:45000}).toBe(pid);
   await close(p);
   if(turns<4){
    await p.locator('.bottom-bar [data-view="businesses"]').click();await p.locator('[data-action="open-buy"]').click();
    const buy=p.locator('[data-buy="machines"]');if(await buy.isEnabled()){await buy.click();actions++;}else await close(p);
   }
   if(turns===4){await pages[1].close();pages[1]=await contexts[1].newPage();pages[1].on('pageerror',e=>errors.push(String(e)));await pages[1].goto(base);await pages[1].locator('[data-cloud-hub]').click();await pages[1].locator('[data-online-open]').click();await close(pages[1]);}
   const active=pages[idx];await close(active);
   await active.locator('#endTurnBtn').click();
   await expect.poll(async()=>{const g=await active.evaluate(s=>SyndikatCloud.getGame(s.code,s.token),sessions[idx]);return g.status==='finished'||g.active_participant_id!==pid},{timeout:20000}).toBe(true);
   // Observe state via the normal refresh button after a reconnect; other turns use realtime/polling.
   if(turns===4){await pages[1].reload();await pages[1].locator('[data-cloud-hub]').click();await pages[1].locator('[data-online-open]').click();await close(pages[1]);}
   await expect.poll(async()=>{const a=await saved(pages[0]),b=await saved(pages[1]);return !!a&&!!b&&a.round===b.round&&a.currentIndex===b.currentIndex&&a.gameOver===b.gameOver},{timeout:45000}).toBe(true);
  }
  expect(actions).toBeGreaterThanOrEqual(2);expect(finished?.gameOver).toBe(true);expect(turns).toBeGreaterThan(4);
  const other=await saved(pages[1]);expect(other.winnerId).toBe(finished.winnerId);expect(errors).toEqual([]);
 }finally{
  if(hostSession)await pages[0].evaluate(s=>SyndikatCloud.deleteOnlineGame(s),hostSession).catch(()=>{});
  await Promise.all(contexts.map(c=>c.close()));
 }
});
