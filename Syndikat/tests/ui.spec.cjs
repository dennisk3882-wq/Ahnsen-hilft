const { test, expect } = require('@playwright/test');

async function expectImageLoaded(locator){
  await expect(locator).toBeVisible();
  await expect.poll(async()=>locator.evaluate(img=>img.complete?img.naturalWidth:0),{timeout:5000}).toBeGreaterThan(0);
}
async function closeDialog(page){
  const d=page.locator('#gameDialog');
  if(await d.isVisible().catch(()=>false)){
    const close=d.locator('[data-close]').first();
    if(await close.isVisible().catch(()=>false)) await close.tap();
    else await page.keyboard.press('Escape');
  }
}
function watchErrors(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  return errors;
}

test.use({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
test.setTimeout(60000);

test('mobile v5.5 core and management systems', async ({page})=>{
  const errors=watchErrors(page);
  await page.route('https://cdn.jsdelivr.net/**',r=>r.abort());
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#menuScreen')).toBeVisible();
  await expect(page.locator('.v4-badge')).toContainText('v5.5');

  await page.locator('#settingsBtn').tap();
  await expect(page.locator('#gameDialog')).toBeVisible();
  await closeDialog(page);
  await page.locator('#hallBtn').tap();
  await expect(page.locator('#gameDialog')).toBeVisible();
  await closeDialog(page);

  await page.locator('#newGameBtn').tap();
  await expect(page.locator('#setupScreen')).toHaveClass(/active/);
  await page.selectOption('#aiCount','1');
  await page.selectOption('#guidedTutorial','off');
  await page.locator('#startGameBtn').tap();
  await page.waitForTimeout(350);
  await closeDialog(page);
  await expect(page.locator('#gameScreen')).toHaveClass(/active/);

  await expectImageLoaded(page.locator('.city-art-map img').first());
  await expect(page.locator('.city-hotspot')).toHaveCount(8);
  await expect(page.locator('[data-map-mode]')).toHaveCount(5);
  for(const mode of ['ownership','police','income','rivals','normal']) await page.locator('[data-map-mode="'+mode+'"]').tap();

  await page.locator('.bottom-bar [data-view="businesses"]').tap();
  await page.locator('[data-action="open-buy"]').tap();
  await expectImageLoaded(page.locator('.business-buy-thumb').first());
  await page.locator('[data-buy="machines"]').tap();
  await expect(page.locator('#businessList .business-card')).toHaveCount(1);
  await page.locator('[data-action="routes"]').tap();
  await expect(page.locator('#gameDialog')).toBeVisible();
  await closeDialog(page);

  await page.locator('.bottom-bar [data-action="more"]').tap();
  await page.locator('#gameDialog [data-go="staff"]').tap();
  await page.locator('[data-recruit]').tap();
  await page.locator('[data-hire="informant"]').tap();
  await expect(page.locator('#staffGrid .person-card')).toHaveCount(1);
  await expectImageLoaded(page.locator('#staffGrid .person-card img').first());
  await page.locator('[data-crews]').tap();
  await expect(page.locator('#gameDialog')).toBeVisible();
  await page.locator('[data-new-crew]').tap();
  await expect(page.locator('[data-save-crew]')).toBeVisible();
  await page.locator('[data-save-crew]').tap();
  await page.locator('[data-arsenal]').tap();
  await expect(page.locator('#gameDialog')).toBeVisible();
  await closeDialog(page);

  await page.locator('.bottom-bar [data-view="actions"]').tap();
  await expect(page.locator('#crimeGrid .crime-card').first()).toBeVisible();
  await page.locator('.bottom-bar [data-action="more"]').tap();
  await page.locator('#gameDialog [data-more-diplomacy]').tap();
  await expect(page.locator('#gameDialog')).toBeVisible();
  await expect(page.locator('#gameDialog [data-gift]').first()).toBeVisible();
  await closeDialog(page);

  await page.locator('.bottom-bar [data-action="more"]').tap();
  await page.locator('#gameDialog [data-go="finance"]').tap();
  await page.locator('[data-action="bank"]').tap();
  await expect(page.locator('[data-loan-amt]').first()).toBeVisible();
  await page.locator('[data-loan-amt]').first().tap();
  await expect(page.locator('#ledgerList [data-repay-loan]').first()).toBeVisible();

  await page.locator('.bottom-bar [data-action="more"]').tap();
  await page.locator('#gameDialog [data-go="missions"]').tap();
  await expect(page.locator('.story-v51-card')).toBeVisible();
  await expect(page.locator('.story-v51-card img').first()).toBeVisible();

  await page.locator('.bottom-bar [data-action="more"]').tap();
  await page.locator('#gameDialog [data-go="ranking"]').tap();
  await expect(page.locator('.rank-row')).toHaveCount(2);
  await expect(page.locator('.rival-rank-portrait').first()).toBeVisible();
  await page.locator('.clickable-rival').first().tap();
  await expect(page.locator('.rival-profile')).toBeVisible();
  await closeDialog(page);

  await page.locator('[data-action="back-menu"]').tap();
  await expect(page.locator('#menuScreen')).toHaveClass(/active/);
  await page.locator('#saveSlotsBtn').tap();
  await expect(page.locator('[data-slot-save="1"]')).toBeVisible();
  await page.locator('[data-slot-save="1"]').tap();
  await expect(page.locator('[data-slot-load="1"]')).toBeVisible();
  await closeDialog(page);

  expect(errors).toEqual([]);
});

test('offline shell declares complete v5.5 PWA', async ({page})=>{
  const errors=watchErrors(page);
  await page.route('https://cdn.jsdelivr.net/**',r=>r.abort());
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.v4-badge')).toContainText('v5.5');
  const manifest=await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifest).toBe('./manifest.webmanifest');
  const cache=await page.request.get('http://127.0.0.1:4173/sw.js');
  expect(await cache.text()).toContain("syndikat-v5-5-0");
  expect(errors).toEqual([]);
});


test('advanced v5.5 systems open and render without browser errors', async ({page})=>{
  const errors=watchErrors(page);
  await page.route('https://cdn.jsdelivr.net/**',r=>r.abort());
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#newGameBtn').tap();
  await page.selectOption('#aiCount','1');
  await page.selectOption('#guidedTutorial','off');
  await page.locator('#startGameBtn').tap();
  await page.waitForTimeout(300);
  await closeDialog(page);

  await page.evaluate(()=>window.SyndikatV4.openOperation('bank'));
  await expect(page.locator('.v4-operation')).toBeVisible();
  await expect(page.locator('#opCrew')).toBeVisible();
  await closeDialog(page);

  await page.evaluate(()=>window.SyndikatEconomyDepth.openPropertyMarket());
  await expect(page.locator('[data-buy-land]').first()).toBeVisible();
  await closeDialog(page);

  await page.evaluate(()=>{
    const st=JSON.parse(localStorage.getItem('syndikat_save_v3'));
    const p=st.players[0],r=st.players[1];
    p.clean=1000000;p.dirty=500000;p.actionPoints=8;
    p.staffRoster=[{id:'spy1',role:'informant',name:'Test Informant',skill:82,loyalty:90,trait:'steady',salary:900,heldUntil:0,level:2,xp:20}];
    r.staffRoster=[{id:'target1',role:'guard',name:'Rival Guard',skill:45,loyalty:35,trait:'steady',salary:700,heldUntil:0,level:1,xp:0}];
    localStorage.setItem('syndikat_save_v3',JSON.stringify(st));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#continueBtn').tap();
  await page.evaluate(()=>window.SyndikatDepth.openEspionage());
  await expect(page.locator('[data-mole]').first()).toBeVisible();
  await expect(page.locator('[data-defect]').first()).toBeVisible();
  await closeDialog(page);

  await page.evaluate(()=>{
    const st=JSON.parse(localStorage.getItem('syndikat_save_v3'));
    const p=st.players[0];
    p.clean=1000000;p.dirty=500000;p.actionPoints=8;p.jailed=0;
    p.investigation=Object.assign({},p.investigation||{},{evidence:78,stage:'Anklage droht',warrant:true,corruptionExposure:0});
    p.courtCases=[{id:'case-test',charge:'Organisierte Erpressung',severity:2,evidenceAtOpen:78,openedRound:st.round,hearingRound:st.round+2,status:'pending',result:null,fine:0,jail:0}];
    p.courtHistory=[];
    localStorage.setItem('syndikat_save_v3',JSON.stringify(st));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#continueBtn').tap();
  await page.evaluate(()=>window.SyndikatJustice.open());
  await expect(page.locator('[data-court="fight"]')).toBeVisible();
  await expect(page.locator('[data-court="deal"]')).toBeVisible();
  await expect(page.locator('[data-court="corrupt"]')).toBeVisible();
  await closeDialog(page);

  await page.evaluate(()=>{
    const st=JSON.parse(localStorage.getItem('syndikat_save_v3'));
    const p=st.players[0];
    p.jailed=3;p.actionPoints=3;p.clean=100000;p.dirty=100000;
    localStorage.setItem('syndikat_save_v3',JSON.stringify(st));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#continueBtn').tap();
  await page.locator('.bottom-bar [data-view="actions"]').tap();
  await expect(page.locator('[data-prison-final]')).toHaveCount(7);

  await page.evaluate(()=>{
    const st=JSON.parse(localStorage.getItem('syndikat_save_v3'));
    const p=st.players[0];
    p.jailed=0;p.clean=1000000;p.dirty=500000;p.actionPoints=8;
    p.finalCrisis={triggered:true,active:true,choice:null,startedRound:st.round,resolveRound:0,resolved:false,outcome:null};
    localStorage.setItem('syndikat_save_v3',JSON.stringify(st));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#continueBtn').tap();
  await page.evaluate(()=>window.SyndikatFinalSystems.openFinalCrisis());
  await expect(page.locator('[data-final-choice]')).toHaveCount(3);
  await expect(page.locator('[data-final-choice="legit"]')).toBeVisible();
  await closeDialog(page);

  expect(errors).toEqual([]);
});
