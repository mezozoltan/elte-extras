// Integration test against a downloaded copy of the real Stuki client.
// Set STUKI_BUNDLE_PATH to that JavaScript bundle. Every API call is intercepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const repository = path.resolve(__dirname, '..');

(async () => {
  if (!process.env.STUKI_BUNDLE_PATH) throw new Error('Set STUKI_BUNDLE_PATH to a local Stuki JavaScript bundle.');
  const bundle = fs.readFileSync(process.env.STUKI_BUNDLE_PATH, 'utf8');
  const browser = await chromium.launch({headless:true,
    ...(process.env.TEST_BROWSER_PATH ? {executablePath:process.env.TEST_BROWSER_PATH} : {})});
  try {
    const page = await browser.newPage();
    const saves = [], errors = [];
    let lastSaved = null, failSave = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://progalap.elte.hu/**', route => {
      if (route.request().url().includes('/assets/app.js')) return route.fulfill({contentType:'application/javascript',body:bundle});
      return route.fulfill({contentType:'text/html; charset=utf-8', body:'<!doctype html><html><body><div id="root"></div><script type="module" src="/stuki/assets/app.js"></script></body></html>'});
    });
    await page.route('https://webprogramozas.inf.elte.hu:*/**', route => {
      const request = route.request();
      const headers = {'access-control-allow-origin':'https://progalap.elte.hu','access-control-allow-credentials':'true','access-control-allow-headers':'Authorization,Content-Type,Accept'};
      if (request.method() === 'OPTIONS') return route.fulfill({status:204, headers});
      if (request.url().endsWith('/me')) return route.fulfill({headers, json:{user:{sub:'offline-test',neptun:'TEST'},accessToken:'offline-token'}});
      if (request.method() === 'POST' && request.url().endsWith('/structograms')) {
        const payload = request.postDataJSON(); saves.push(payload);
        if (failSave) return route.fulfill({status:503,headers,json:{error:'Offline test failure'}});
        lastSaved = {...payload,id:saves.length,uuid:`test-save-${saves.length}`,neptun:'TEST'};
        return route.fulfill({headers,json:lastSaved});
      }
      if (request.url().endsWith('/structograms')) return route.fulfill({headers,json:lastSaved?[lastSaved]:[]});
      if (request.url().includes('/structograms/test-save-') && lastSaved) return route.fulfill({headers,json:lastSaved});
      return route.fulfill({status:404,headers,json:{error:'Unexpected intercepted request'}});
    });
    async function load(url) {
      await page.goto(url);
      await page.locator('#app .structogram').first().waitFor();
      await page.evaluate(() => {
        const original = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function(options) {
          const root = original.call(this,options);
          if (this.id === 'stuki-history-extension') window.testShadow = root;
          return root;
        };
        window.browser = {storage:{local:{get:async()=>({}),set:async()=>{}}}};
      });
      for (const file of ['model.js','content.js']) await page.addScriptTag({path:path.join(repository,file)});
    }
    const visible = () => page.evaluate(() => testShadow.getElementById('name-dialog').open);
    const click = id => page.evaluate(id => testShadow.getElementById(id).click(),id);
    const fill = value => page.evaluate(value => {
      const input = testShadow.getElementById('save-name'); input.value = value;
      input.dispatchEvent(new Event('input',{bubbles:true}));
    },value);
    const saveButton = () => page.getByRole('button',{name:/^Save/});

    await load('https://progalap.elte.hu/stuki/');
    await saveButton().click();
    assert.equal(await visible(),true);
    assert.equal(saves.length,0);
    await fill('   '); await click('name-submit');
    assert.equal(saves.length,0);
    assert.equal(await visible(),true);
    await click('name-cancel');
    assert.equal(await visible(),false);
    assert.equal(await page.locator('.header-container').count(),0);
    // Closing a native dialog queues its close/focus-restoration event.
    await page.waitForFunction(() => /^Save/.test(document.activeElement?.textContent || ''));
    await page.keyboard.press('Control+s');
    assert.equal(await visible(),true);
    await page.keyboard.press('Control+s');
    assert.equal(saves.length,0);
    await fill('Maximumkeresés');
    // Actual Enter behavior on the focused name field submits the form.
    await page.evaluate(() => testShadow.getElementById('save-name').focus());
    await page.keyboard.press('Enter');
    await page.waitForURL('**/?uuid=test-save-1');
    assert.equal(saves.length,1);
    assert.equal(saves[0].data.structograms[0].name,'Maximumkeresés');
    assert.equal(saves[0].data.structograms[0].showHeader,false);
    assert.equal(saves[0].prev_id,null);
    assert.equal(await visible(),false);
    await saveButton().click();
    await page.waitForURL('**/?uuid=test-save-2');
    assert.equal(saves.length,2);
    assert.equal(saves[1].prev_id,1);
    assert.equal(saves[1].data.structograms[0].name,'Maximumkeresés');
    assert.equal(await visible(),false);
    // Loaded documents also bypass first-save naming, including Ctrl+S.
    await load('https://progalap.elte.hu/stuki/?uuid=test-save-2');
    await page.keyboard.press('Control+s');
    await page.waitForURL('**/?uuid=test-save-3');
    assert.equal(saves[2].prev_id,2);
    assert.equal(await visible(),false);
    // A failed first save leaves the new document eligible for a naming retry.
    await load('https://progalap.elte.hu/stuki/');
    failSave = true;
    await saveButton().click(); await fill('Új név');
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/structograms')),
      click('name-submit')
    ]);
    await page.waitForFunction(() => !testShadow.getElementById('name-dialog').open);
    assert.equal(saves.at(-1).data.structograms[0].name,'Új név');
    assert.equal(new URL(page.url()).search,'');
    await saveButton().click();
    assert.equal(await visible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await visible(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: first Save and Ctrl+S prompt, whitespace validation, cancel, Enter, exactly one native save, persisted name, hidden header preserved, version linking, existing saves, failed-save retry, Escape');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
