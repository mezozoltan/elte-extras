const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://progalap.elte.hu/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="/old.ico" type="image/x-icon" sizes="32x32"></head><body></body></html>'}));
    const script = path.resolve(__dirname,'../site-favicon.js');
    async function load(site,enabled=true) {
      await page.goto('https://progalap.elte.hu/'+(site==='stuki'?'stuki/':'specifikacio/'));
      await page.evaluate(({site,enabled})=>{
        window.browser={storage:{local:{get:async()=>({siteEnabled:{[site]:enabled}})}},runtime:{getURL:asset=>'https://extension.test/'+asset}};
      },{site,enabled});
      await page.addScriptTag({path:script});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    }
    for (const [site,icon] of [['stuki','struktogram'],['speci','specifikacio']]) {
      await load(site,false);
      assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),'/old.ico');
      await load(site);
      const expected='https://extension.test/icons/'+icon+'.png';
      assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),expected);
      assert.equal(await page.locator('link[rel="icon"]').getAttribute('type'),'image/png');
      await page.evaluate(()=>{document.querySelector('link[rel="icon"]').href='/changed.ico';});
      await page.waitForFunction(expected=>document.querySelector('link[rel="icon"]').href===expected,expected);
      await page.evaluate(()=>{document.querySelector('link[rel="icon"]').remove();});
      await page.waitForFunction(expected=>document.querySelector('link[rel="icon"]')?.href===expected,expected);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: both favicons, original retained when disabled, native icon changes/removal handled');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
