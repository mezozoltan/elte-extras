const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const confirmation='Biztosan el akarod rejteni ezt a feladatot a ball oldalról? Később a feladaton lévő gombbal újra megjelenítheted itt.';
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let settings={},failStorage=false;
    await page.exposeFunction('getSettings',()=>settings);
    await page.exposeFunction('setSettings',value=>{if(failStorage) throw new Error('Storage unavailable');Object.assign(settings,value);});
    const cards=Array.from({length:5},(_,i)=>`<article data-slot="card"><header><a href="/hu/courses/1/groups/20/topics/${i+1}"><h3>${i+1}. gyakorlat</h3></a><div class="scores"><span aria-label="Score 100%">▥</span><span class="native-score">100%</span></div></header><p>2 feladat</p></article>`).join('');
    await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}body{margin:0;background:#090909;color:#eee;font:14px system-ui}aside{position:fixed;inset:0 auto 0 0;width:256px;padding:8px;background:#171717}main{margin-left:290px;padding:30px}aside ul{padding:0;list-style:none}aside a{color:inherit}article{background:#171717;border:1px solid #333;border-radius:12px;margin:16px 0;padding:20px}article header,.scores{display:flex;align-items:center;gap:12px}article header>a{flex:1;color:inherit;text-decoration:none}.native-score{background:#86efac;color:#14532d;padding:4px 12px;border-radius:5px}
      </style></head><body><aside><ul data-sidebar="menu"><li><a href="/hu/courses">Kurzusok</a></li></ul><div data-sidebar="content"><ul data-sidebar="menu"><li><a href="/hu/courses">Kurzusok</a></li></ul></div></aside><main><h1>20. csoport</h1>${cards}</main></body></html>`}));
    async function load(mode='normal',lang='hu') {
      await page.goto('https://progenv.inf.elte.hu/'+lang);
      await page.evaluate(mode=>{
        window.mode=mode;window.calls=[];
        window.browser={storage:{local:{get:()=>getSettings(),set:value=>setSettings(value)},onChanged:{addListener:fn=>{window.storageChanged=fn;}}}};
        const timeout=window.setTimeout.bind(window);
        if(mode==='timeout') window.setTimeout=(fn,ms,...args)=>timeout(fn,ms===15000?150:ms,...args);
        window.fetch=async(url,options)=>{
          const pathname=new URL(url).pathname;calls.push(pathname);
          const html=body=>new Response(body,{headers:{'Content-Type':'text/html'}});
          if(/\/(hu|en)\/courses$/.test(pathname)) {
            if(window.mode==='list-error') return new Response('Unavailable',{status:503});
            return html('<main><div data-slot="card"><a href="/courses/1">IP-18 - Programozás</a></div>'+(window.mode==='course-error'?'<div data-slot="card"><a href="/courses/2">Other course</a></div>':'')+'</main>');
          }
          if(pathname.endsWith('/courses/2')) return new Response('Unavailable',{status:503});
          if(pathname.endsWith('/courses/1')) return html('<main><h1>20. csoport</h1>'+Array.from({length:5},(_,i)=>`<div data-slot="card"><a href="/courses/1/groups/20/topics/${i+1}">${i+1}. gyakorlat</a><span aria-label="Score 100%"></span><span>2 feladat</span><span>Határidő: 2026. 11. 01.</span></div>`).join('')+'</main>');
          if(pathname.includes('/topics/')) {
            if(window.mode==='task-auth') return new Response('Sign in',{status:401});
            const id=Number(pathname.split('/').at(-1));
            if(window.mode==='focus' || window.mode==='timeout' && id<=3) await new Promise((resolve,reject)=>{
              const timer=timeout(resolve,window.mode==='focus'?500:1000);
              options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(options.signal.reason);},{once:true});
            });
            return html(`<main><a href="${pathname}/tasks/1"><h3>Task ${id}</h3></a></main>`);
          }
          throw new Error('Unexpected request '+pathname);
        };
      },mode);
      for(const file of ['progenv-model.js','progenv.js']) await page.addScriptTag({path:path.join(root,file)});
      await page.waitForFunction(()=>document.querySelectorAll('.progenv-topic').length===5);
    }
    const first=()=>page.locator('.progenv-topic-row').first();
    async function ask() {await first().locator('button').click();await page.locator('#progenv-hide-dialog').waitFor({state:'visible'});}
    async function hide() {await ask();await page.getByRole('button',{name:'Elrejtés',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.progenv-topic').length===4);}
    await load(); await page.waitForFunction(()=>document.querySelectorAll('.progenv-task').length===5);
    await first().hover();await page.waitForTimeout(250);
    const shape=await first().locator('button').evaluate(node=>{const box=node.getBoundingClientRect();return {w:box.width,h:box.height,value:getComputedStyle(node.querySelector('.progenv-score-value')).opacity,cross:getComputedStyle(node.querySelector('.progenv-hide-symbol')).opacity};});
    assert(Math.abs(shape.w-shape.h)<1,JSON.stringify(shape));assert.equal(shape.value,'0');assert.equal(shape.cross,'1');
    if(process.env.PROGENV_HIDE_PREVIEW_PATH) await page.screenshot({path:process.env.PROGENV_HIDE_PREVIEW_PATH});
    await ask();assert.equal(await page.locator('#progenv-hide-dialog > p').first().innerText(),confirmation);
    const center=await page.locator('#progenv-hide-dialog').evaluate(node=>{const box=node.getBoundingClientRect();return {x:Math.abs(box.x+box.width/2-innerWidth/2),y:Math.abs(box.y+box.height/2-innerHeight/2)};});
    assert(center.x<1 && center.y<1,JSON.stringify(center));
    if(process.env.PROGENV_CONFIRM_PREVIEW_PATH) await page.screenshot({path:process.env.PROGENV_CONFIRM_PREVIEW_PATH});
    await page.getByRole('button',{name:'Mégse',exact:true}).click();assert.equal(await page.locator('.progenv-topic').count(),5);
    await ask();await page.mouse.click(10,10);assert.equal(await page.locator('#progenv-hide-dialog').isVisible(),false);assert.equal(await page.locator('.progenv-topic').count(),5);
    await ask();await page.keyboard.press('Escape');assert.equal(await page.locator('.progenv-topic').count(),5);
    failStorage=true;await ask();await page.getByRole('button',{name:'Elrejtés',exact:true}).click();
    await page.locator('#progenv-hide-dialog [role="alert"]').waitFor({state:'visible'});assert.equal(await page.locator('.progenv-topic').count(),5);
    failStorage=false;await page.getByRole('button',{name:'Elrejtés',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.progenv-topic').length===4);
    assert.equal(settings.progenvHiddenTopics['/courses/1/groups/20/topics/1'],true);
    assert.equal(await page.locator('main article .progenv-topic-restore').count(),1);
    if(process.env.PROGENV_CARD_RESTORE_PREVIEW_PATH) await page.screenshot({path:process.env.PROGENV_CARD_RESTORE_PREVIEW_PATH});
    await page.goto('https://progenv.inf.elte.hu/hu');
    // Reload the extension scripts against persisted settings, then restore from a native card.
    await page.evaluate(()=>{window.browser={storage:{local:{get:()=>getSettings(),set:value=>setSettings(value)}}};window.fetch=async()=>new Response('<main></main>');});
    for(const file of ['progenv-model.js','progenv.js']) await page.addScriptTag({path:path.join(root,file)});
    await page.locator('main article .progenv-topic-restore').waitFor();
    await page.locator('main article .progenv-topic-restore').click();
    await page.waitForFunction(()=>document.querySelectorAll('.progenv-topic-restore').length===0);
    assert(!settings.progenvHiddenTopics['/courses/1/groups/20/topics/1']);
    await load();await hide();
    await page.evaluate(()=>{history.pushState({},'','/hu/courses/1/groups/20/topics/1');document.querySelector('main').innerHTML='<h1>1. gyakorlat</h1><p>Description</p>';});
    await page.locator('main h1 .progenv-topic-restore').waitFor();
    if(process.env.PROGENV_RESTORE_PREVIEW_PATH) await page.screenshot({path:process.env.PROGENV_RESTORE_PREVIEW_PATH});
    await page.locator('main h1 .progenv-topic-restore').click();await page.waitForFunction(()=>document.querySelectorAll('.progenv-topic').length===5);
    assert.equal(await page.locator('.progenv-topic-restore').count(),0);
    // A slow task response must retain both the link node and its keyboard focus.
    await load('focus');
    await page.locator('.progenv-topic').first().focus();
    await page.evaluate(()=>{window.focusedTopic=document.activeElement;});
    await page.waitForFunction(()=>document.querySelectorAll('.progenv-task').length===5);
    assert(await page.evaluate(()=>document.activeElement===focusedTopic && focusedTopic.isConnected));
    // One broken course keeps all five topics from the successful course.
    await load('course-error');await page.locator('.progenv-refresh').waitFor();assert.equal(await page.locator('.progenv-topic').count(),5);
    await page.evaluate(()=>{window.mode='list-error';});await page.locator('.progenv-refresh').click();
    await page.waitForFunction(()=>document.querySelector('.progenv-quick-status').textContent.includes('503'));
    assert.equal(await page.locator('.progenv-topic').count(),5);
    await page.evaluate(()=>{window.mode='normal';});await page.locator('.progenv-refresh').click();await page.waitForFunction(()=>!document.querySelector('.progenv-refresh'));
    // Per-request timeouts leave later topics reachable and have individual Retry buttons.
    await load('timeout');await page.waitForFunction(()=>document.querySelectorAll('.progenv-task-retry').length===3 && document.querySelectorAll('.progenv-task').length===2);
    assert.equal(await page.evaluate(()=>calls.filter(url=>url.includes('/topics/')).length),5);
    await page.evaluate(()=>{window.mode='normal';});await page.locator('.progenv-task-retry').first().click();await page.waitForFunction(()=>document.querySelectorAll('.progenv-task-retry').length===2);
    await page.evaluate(()=>history.pushState({},'','/en/courses/1/groups/20/topics/1'));
    await page.waitForFunction(()=>[...document.querySelectorAll('.progenv-topic,.progenv-task')].every(link=>new URL(link.href).pathname.startsWith('/en/')) && calls.includes('/en/courses'));
    // A change from another tab applies without a reload.
    await page.evaluate(()=>storageChanged({progenvHiddenTopics:{newValue:{'/courses/1/groups/20/topics/1':true}}},'local'));
    await page.waitForFunction(()=>document.querySelectorAll('.progenv-topic').length===4);
    await load('timeout');await page.waitForFunction(()=>document.querySelectorAll('.progenv-task-retry').length===3);
    await page.evaluate(()=>{window.mode='task-auth';});await page.locator('.progenv-task-retry').first().click();
    await page.waitForFunction(()=>document.querySelectorAll('.progenv-topic').length===0);
    assert.match(await page.locator('.progenv-quick-status').innerText(),/Jelentkezz/);
    assert.deepEqual(errors,[]);
    console.log('PASS: hover morph, exact confirmation, cancel/Escape, storage rollback, persistent hiding, card/page restoration, focused node reuse, partial failures, per-request timeout/retry, locale refresh, cross-tab changes');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
