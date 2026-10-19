const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');

(async () => {
  // Disabled sites must stop before accessing the DOM, network or observers.
  for (const [file,site] of [['content.js','stuki'],['spec-resize.js','speci'],['progenv.js','progenv'],['progenv-output-hints.js','progenv']]) {
    let read = false;
    await vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'), {
      browser:{storage:{local:{get:async key => {
        assert.equal(key,'siteEnabled'); read = true;
        return {siteEnabled:{[site]:false}};
      }}}}
    });
    assert.equal(read,true);
  }
  const browser = await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror',error=>errors.push(error.message));
    let settings = {progenvCollapsed:{'existing':'preserved'}};
    let fail = false;
    await page.exposeFunction('readSettings',()=>settings);
    await page.exposeFunction('writeSettings',value=>{
      if (fail) throw new Error('Test storage failure');
      Object.assign(settings,value);
    });
    await page.addInitScript(()=>{ window.browser={storage:{local:{get:()=>readSettings(),set:value=>writeSettings(value)}}}; });
    await page.route('https://extension.test/**',route=>{
      const name = new URL(route.request().url()).pathname.slice(1) || 'popup.html';
      if (!['popup.html','popup.js','popup.css'].includes(name)) return route.abort();
      return route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(root,name))});
    });
    async function load() {
      await page.goto('https://extension.test/popup.html');
      await page.waitForFunction(()=>[...document.querySelectorAll('input')].every(i=>!i.disabled));
    }
    await load();
    const check = name=>page.locator(`input[name="${name}"]`);
    for (const name of ['stuki','speci','progenv']) assert.equal(await check(name).isChecked(),true);
    await check('progenv').uncheck();
    await page.waitForFunction(()=>!document.querySelector('input').disabled);
    assert.deepEqual(settings.siteEnabled,{progenv:false});
    await load();
    assert.equal(await check('progenv').isChecked(),false);
    assert.equal(await check('stuki').isChecked(),true);
    await check('stuki').uncheck();
    await page.waitForFunction(()=>!document.querySelector('input').disabled);
    assert.deepEqual(settings.siteEnabled,{progenv:false,stuki:false});
    await check('progenv').check();
    await page.waitForFunction(()=>!document.querySelector('input').disabled);
    assert.deepEqual(settings.siteEnabled,{progenv:true,stuki:false});
    assert.deepEqual(settings.progenvCollapsed,{'existing':'preserved'});
    fail = true;
    await check('speci').uncheck();
    await page.waitForFunction(()=>!document.querySelector('input').disabled);
    assert.equal(await check('speci').isChecked(),true);
    assert.match(await page.locator('#status').textContent(),/Nem sikerült/);
    assert.deepEqual(errors,[]);
    console.log('PASS: all site gates, default enabled, independent switches, persistence, existing preferences preserved, storage-error rollback');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
