const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function outputs(expected,actual,file='out.1',actualFile=file) {
  return `<div class="outputs"><div><div><span>Elvárt kimenet (${file})</span></div><pre>${escape(expected)}</pre></div><div><div><span>Hallgatói kimenet (${actualFile})</span></div><pre>${escape(actual)}</pre></div></div>`;
}
function card(id,expected,actual,score='0/1 pts',actualFile='out.1') {
  return `<div class="test" data-test="${id}"><div><span>Test ${id}</span><span data-slot="badge">${score}</span></div><div class="test-details">${outputs(expected,actual,'out.1',actualFile)}</div></div>`;
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1000,height:750}}); page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const css=process.env.PROGENV_CSS_PATH?fs.readFileSync(process.env.PROGENV_CSS_PATH,'utf8'):'';
    const fixture=card(1,'2 4 6','2 4 6\n')+card(2,'2 4 6','2 4 7')+card(3,'same','same\n','1/1 pts')+card(4,'same','same')+card(5,'12','1 2')+card(6,'a','a\n','0/1 pts','out.2');
    const html=`<!doctype html><html class="dark"><head><meta charset="utf-8"><style>${css}
      body{margin:0;padding:24px;font:13px system-ui;background:var(--background,#171717);color:var(--foreground,#eee)}
      .test{border:1px solid #8886;border-radius:6px;padding:10px;margin:10px 0;background:var(--card,#202020)}
      .test>div:first-child{display:flex;justify-content:space-between;gap:20px}
      .outputs{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-top:8px}
      .outputs span{font-size:11px;opacity:.75}pre{white-space:pre-wrap;border:1px solid #8886;padding:6px;border-radius:4px;min-height:38px;font:12px monospace}
      </style></head><body><h3>Beadások — teszteredmények</h3><div role="tabpanel" id="fixture-content-tests">${fixture}</div></body></html>`;
    const requests=[];await page.route('**/*',route=>{requests.push(route.request().url());return route.fulfill({contentType:'text/html; charset=utf-8',body:html});});
    await page.goto('https://progenv.inf.elte.hu/hu/courses/1/groups/20/topics/4/tasks/2');
    for (const file of ['output-diff.js','progenv-output-hints.js']) await page.addScriptTag({path:path.join(root,file)});
    const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await settle();
    assert.equal(await page.locator('.progenv-output-hint').count(),1);
    assert.match(await page.locator('.progenv-output-hint').innerText(),/Plusz sortörés/);
    assert.match(await page.locator('.progenv-output-hint').getAttribute('title'),/Elvárt/);
    assert.equal(await page.locator('[data-test="1"] pre').last().textContent(),'2 4 6\n');
    if (process.env.OUTPUT_HINT_PREVIEW_PATH) await page.screenshot({path:process.env.OUTPUT_HINT_PREVIEW_PATH});
    // Async expansion/loading adds the pre blocks after the test already exists.
    await page.evaluate(markup=>document.getElementById('fixture-content-tests').insertAdjacentHTML('beforeend',markup),card(7,'x y','x\ty'));
    await page.waitForFunction(()=>document.querySelectorAll('.progenv-output-hint').length===2);
    // Updating output to a genuinely wrong value removes the formatting hint.
    await page.locator('[data-test="1"] pre').last().evaluate(pre=>pre.textContent='wrong');
    await page.waitForFunction(()=>document.querySelectorAll('.progenv-output-hint').length===1);
    // A test that later passes must not keep the hint.
    await page.locator('[data-test="7"] [data-slot="badge"]').evaluate(badge=>badge.textContent='1/1 pts');
    await page.waitForFunction(()=>document.querySelectorAll('.progenv-output-hint').length===0);
    // Re-check and repeated injection must never duplicate a hint.
    await page.locator('[data-test="7"] [data-slot="badge"]').evaluate(badge=>badge.textContent='0/1 pts');
    await page.waitForFunction(()=>document.querySelectorAll('.progenv-output-hint').length===1);
    await page.addScriptTag({path:path.join(root,'progenv-output-hints.js')});await settle();
    assert.equal(await page.locator('.progenv-output-hint').count(),1);
    // Filenames are paired independently when a test has several output files.
    await page.locator('[data-test="7"] .test-details').evaluate((details,html)=>details.innerHTML=html,`<div class="outputs">${outputs('a','a\n','out.1').replace(/^<div class="outputs">|<\/div>$/g,'')}${outputs('b','b\t','out.2').replace(/^<div class="outputs">|<\/div>$/g,'')}</div>`);
    await page.waitForFunction(()=>document.querySelectorAll('.progenv-output-hint').length===2);
    assert.match(await page.locator('.progenv-output-hint').first().innerText(),/^out\.1:/);
    await page.locator('[data-test="7"]').evaluate(card=>card.remove());await settle();
    assert.equal(await page.locator('.progenv-output-hint').count(),0);
    // English routes use English wording; original outputs stay untouched.
    await page.evaluate(()=>history.pushState({},'','/en/courses/1/groups/20/topics/4/tasks/2'));
    await page.evaluate(markup=>document.getElementById('fixture-content-tests').insertAdjacentHTML('beforeend',markup),card(8,'x','x\n'));
    await page.waitForFunction(()=>document.querySelector('.progenv-output-hint'));
    assert.match(await page.locator('.progenv-output-hint').innerText(),/Extra newline/);
    if (process.env.FAILED_TEST_FIXTURE_PATH) {
      const actual=fs.readFileSync(process.env.FAILED_TEST_FIXTURE_PATH,'utf8');
      await page.evaluate(markup=>{history.pushState({},'','/hu/courses/1/groups/20/topics/4/tasks/2');document.getElementById('fixture-content-tests').innerHTML=markup;},actual);
      await page.waitForFunction(()=>document.querySelector('.progenv-output-hint'));
      assert.equal(await page.locator('.progenv-output-hint').count(),1);
      assert.match(await page.locator('.progenv-output-hint').innerText(),/Csak whitespace/);
      assert.match(await page.locator('.progenv-output-hint').getAttribute('title'),/Záró whitespace/);
    }
    assert.deepEqual(errors,[]);
    assert(requests.every(url=>!url.includes('/api/')));
    console.log('PASS: failed-only conditional hints, unchanged output, async test expansion, visible mismatch suppression, passing-test suppression, filename pairing, rerender cleanup, no duplicates, locale support, no API requests'+(process.env.FAILED_TEST_FIXTURE_PATH?' (observed failed-test markup)':''));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
