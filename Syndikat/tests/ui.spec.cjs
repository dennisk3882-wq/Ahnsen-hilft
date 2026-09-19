const { test, expect } = require('@playwright/test');

async function closeDialog(page){
  const d=page.locator('#gameDialog');
  if(await d.isVisible().catch(()=>false)){
    const close=d.locator('[data-close]').first();
    if(await close.isVisible().catch(()=>false)) await close.tap();
    else await page.keyboard.press('Escape');
  }
}

test.use({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });

test('mobile PWA core journey and visual assets', async ({page})=>{
  await page.route('https://cdn.jsdelivr.net/**',r=>r.abort());
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#menuScreen')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('SYNDIKAT');

  await page.locator('#newGameBtn').tap();
  await expect(page.locator('#setupScreen')).toHaveClass(/active/);
  await page.selectOption('#aiCount','1');
  await page.selectOption('#guidedTutorial','off');
  await page.locator('#startGameBtn').tap();
  await page.waitForTimeout(550);
  await closeDialog(page);

  await expect(page.locator('#gameScreen')).toHaveClass(/active/);
  const map=page.locator('.city-art-map img').first();
  await expect(map).toBeVisible();
  expect(await map.evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();
  await expect(page.locator('.city-hotspot')).toHaveCount(8);
  await expect(page.locator('.city-map-tag')).toHaveCount(8);
  await expect(page.locator('[data-map-mode]')).toHaveCount(5);

  await page.locator('[data-map-mode="ownership"]').tap();
  await page.locator('.city-hotspot[data-map-district="oldtown"]').tap();
  await expect(page.locator('.district-visual img')).toBeVisible();
  expect(await page.locator('.district-visual img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();

  await page.locator('.bottom-bar [data-view="businesses"]').tap();
  await page.locator('[data-action="open-buy"]').tap();
  await expect(page.locator('.business-buy-thumb').first()).toBeVisible();
  expect(await page.locator('.business-buy-thumb').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();
  await page.locator('[data-buy="machines"]').tap();
  await expect(page.locator('#businessList .business-card')).toHaveCount(1);
  await expect(page.locator('#businessList .business-thumb')).toHaveCount(1);

  await page.locator('.bottom-bar [data-action="more"]').tap();
  await page.locator('#gameDialog [data-go="staff"]').tap();
  await page.locator('[data-recruit]').tap();
  await page.locator('[data-hire="informant"]').tap();
  await expect(page.locator('#staffGrid .person-card')).toHaveCount(1);
  const staffImg=page.locator('#staffGrid .person-card img').first();
  await expect(staffImg).toBeVisible();
  expect(await staffImg.evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();

  await page.locator('.bottom-bar [data-action="more"]').tap();
  await page.locator('#gameDialog [data-go="missions"]').tap();
  await expect(page.locator('.story-card')).toBeVisible();
  await expect(page.locator('.story-card img').first()).toBeVisible();

  await page.locator('.bottom-bar [data-action="more"]').tap();
  await page.locator('#gameDialog [data-go="ranking"]').tap();
  await expect(page.locator('.rank-row')).toHaveCount(2);
  await expect(page.locator('.rival-rank-portrait').first()).toBeVisible();

  await page.locator('.clickable-rival').first().tap();
  await expect(page.locator('.rival-profile')).toBeVisible();
  await expect(page.locator('.rival-hero img')).toBeVisible();
});

test('offline shell declares full v5.3 app', async ({page})=>{
  await page.route('https://cdn.jsdelivr.net/**',r=>r.abort());
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.v4-badge')).toContainText('v5.3');
  const manifest=await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifest).toBe('./manifest.webmanifest');
});
