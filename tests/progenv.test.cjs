const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const model = require('../progenv-model.js');
const root = path.resolve(__dirname,'..');
assert.equal(model.courseName('IP-18PROGEG - Programozás'),'Programozás');
assert.equal(model.groupLabel('20. csoport'),'20. csoport');
assert.equal(model.groupLabel('20. csoport – Labor'),'20. csoport – Labor');
assert.equal(model.route('/courses/1/groups/20/topics/2').url,'https://progenv.inf.elte.hu/hu/courses/1/groups/20/topics/2');
assert.equal(model.route('https://example.com/courses/1'),null);
assert.equal(model.route('javascript:alert(1)'),null);
assert.equal(model.deadlineTime('Határidő: 2026. 10. 27.'),new Date(2026,9,27,23,59,59,999).getTime());
assert.equal(model.deadlineTime('Lezárva ekkor: 2026. 10. 27. 12:30'),new Date(2026,9,27,12,30,0,0).getTime());
assert.equal(model.deadlineTime('Due: 10/27/2026','en'),new Date(2026,9,27,23,59,59,999).getTime());
assert.equal(model.deadlineTime('Határidő: 2026. 02. 30.'),null);
const orderFixture = [{name:'undated',expiresAt:null},{name:'late',expiresAt:300},{name:'older overdue',expiresAt:10},
  {name:'soon',expiresAt:200},{name:'recent overdue',expiresAt:99},{name:'another undated',expiresAt:null}];
assert.deepEqual(model.sortTopics(orderFixture,100).map(x=>x.name),['soon','late','recent overdue','older overdue','undated','another undated']);
assert.equal(orderFixture[0].name,'undated');

const card = (href,name,score,count,deadline='') => `<div data-slot="card"><a href="${href}"><h3>${name}</h3></a><div aria-label="Score ${score}%">${score}%</div><span>${count} feladat</span>${deadline?`<span>Határidő: ${deadline}</span>`:''}</div>`;
const coursesFixture = '<main><h1>Kurzusok</h1><div data-slot="card"><a href="/courses/1">IP-18PROGEG - Programozás</a></div></main>';
const groupFixture = '<main><h1>20. csoport</h1>'+card('/courses/1/groups/20/topics/1','1. gyakorlat',0,1)+card('/courses/1/groups/20/topics/2','2. gyakorlat',100,2)+card('/courses/1/topics/1','1. beadandó',100,1,'2026. 11. 01.')+'</main>';
const sidebarMarkup = '<ul data-sidebar="menu"><li><a href="/hu/courses">Kurzusok</a></li><li><a href="/hu/tasks">Feladattár</a></li><li><a href="/hu/about-us">Rólunk</a></li></ul>';
const fixtures = process.env.PROGENV_FIXTURE_DIRECTORY;
const coursesHTML = fixtures ? fs.readFileSync(path.join(fixtures,'progenv-courses-dom.html'),'utf8') : coursesFixture;
const groupHTML = fixtures ? fs.readFileSync(path.join(fixtures,'progenv-group-dom.html'),'utf8') : groupFixture;
const shell = fixtures ? JSON.parse(fs.readFileSync(path.join(fixtures,'progenv-shell.json'),'utf8')) : null;
const css = process.env.PROGENV_CSS_PATH ? fs.readFileSync(process.env.PROGENV_CSS_PATH,'utf8') : '';

(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(10000);
    const calls = [], errors = [];
    page.on('pageerror',error => errors.push(error.message));
    let mode = 'normal';
    const body = `<!doctype html><html class="dark"><head><meta charset="utf-8"><style>${css}
      body{margin:0;font:14px system-ui;background:var(--background,#090909);color:var(--foreground,#eee)}
      aside{position:fixed;inset:0 auto 0 0;width:256px;padding:8px;background:var(--sidebar,#171717)}
      body>main{margin-left:256px;padding:24px;min-height:100vh;background:var(--background,#090909)}
      aside [data-sidebar=header]{padding-bottom:12px} aside [data-sidebar=content]{overflow:auto;max-height:calc(100vh - 100px)}
      aside a:not(.progenv-topic){display:flex;padding:8px;color:inherit;text-decoration:none;font-size:14px}
      aside ul{list-style:none;padding:0;margin:0}
      </style></head><body><aside>${shell?.sidebarHeader || '<div data-sidebar="header"><a href="/hu" style="font-size:24px;font-weight:700">▣ Progenv</a></div>'}${shell?.sidebarContent || `<div data-sidebar="content">${sidebarMarkup}</div>`}</aside><main><h1>Kezdőlap</h1></main></body></html>`;
    await page.route('**/*',route => {
      const request = route.request(), url = new URL(request.url());
      calls.push({path:url.pathname,method:request.method()});
      if (url.origin !== 'https://progenv.inf.elte.hu') return route.abort();
      if (url.pathname === '/hu' || url.pathname === '/hu/login') return route.fulfill({contentType:'text/html; charset=utf-8',body});
      if (url.pathname === '/hu/courses') {
        if (mode === 'login') return route.fulfill({contentType:'text/html',body:'<main><input type="password"></main>'});
        if (mode === 'error') return route.fulfill({status:503,body:'Unavailable'});
        if (mode === 'empty') return route.fulfill({contentType:'text/html',body:'<main><h1>Kurzusok</h1></main>'});
        return route.fulfill({contentType:'text/html; charset=utf-8',body:coursesHTML});
      }
      if (url.pathname === '/hu/courses/1') {
        if (mode === 'groups') return route.fulfill({contentType:'text/html',body:'<main><a href="/courses/1/groups/20">20. csoport</a><a href="/courses/1/groups/21">21. csoport</a></main>'});
        if (mode === 'meta') return route.fulfill({contentType:'text/html',body:'<meta http-equiv="refresh" content="0;url=/hu/courses/1/groups/20">'});
        // Supply the final group document at the course URL. Native fetch follows
        // HTTP redirects; this also exercises streamed pages retaining the URL.
        return route.fulfill({contentType:'text/html; charset=utf-8',body:groupHTML});
      }
      if (url.pathname === '/hu/courses/1/groups/20') return route.fulfill({contentType:'text/html; charset=utf-8',body:groupHTML});
      if (url.pathname === '/hu/courses/1/groups/21') return route.fulfill({contentType:'text/html; charset=utf-8',body:'<main><h1>21. csoport</h1>'+card('/courses/1/groups/21/topics/9','Másik témakör',100,3)+'</main>'});
      if (/\/topics\/\d+$/.test(url.pathname)) {
        if (mode === 'task-error') return route.fulfill({status:503,body:'Unavailable'});
        return route.fulfill({contentType:'text/html; charset=utf-8',body:`<main>
          <div class="flex flex-1 items-start justify-between"><div><a href="${url.pathname}/tasks/11"><h3 class="font-medium">Esős napok száma</h3></a><span class="text-muted-foreground text-sm">Submissions: 1</span></div></div>
          <div><a href="/tasks/12"><h3>Leghidegebb hőmérséklet a Balatonon</h3></a></div>
          <div data-slot="card"><a href="https://example.com/tasks/99"><h3>External</h3></a></div>
          <div data-slot="card" hidden><a href="/tasks/88">Hidden</a></div>
        </main>`});
      }
      return route.fulfill({status:404,body:'Unexpected test request'});
    });
    async function load(collapsed = {}) {
      await page.goto('https://progenv.inf.elte.hu/hu');
      await page.evaluate(collapsed => {
        window.testSettings = {progenvCollapsed:collapsed};
        window.browser = {storage:{local:{get:async()=>testSettings,set:async value=>Object.assign(testSettings,value)}}};
      },collapsed);
      for (const name of ['progenv-model.js','progenv.js']) await page.addScriptTag({path:path.join(root,name)});
    }
    await load();
    try { await page.waitForFunction(() => document.querySelectorAll('.progenv-topic').length >= 3); }
    catch (error) { console.log('INITIAL STATE',await page.locator('body').innerText(),calls,errors); throw error; }
    const detail = page.locator('.progenv-quick-courses details').first();
    assert.equal(await detail.getAttribute('open'),'');
    assert.equal(await page.locator('.progenv-course-name').innerText(),'Programozás');
    assert.equal(await page.locator('.progenv-group-number').innerText(),'20. csoport');
    assert.equal(await page.locator('.progenv-quick-courses').evaluate(root => root.tagName),'SECTION');
    assert.equal(await page.locator('.progenv-quick-courses').evaluate(root => root.previousElementSibling?.getAttribute('data-sidebar')),'menu');
    assert.deepEqual(await page.locator('[data-sidebar="content"] > [data-sidebar="menu"] > li > a').allTextContents(),['Kurzusok','Feladattár','Rólunk']);
    assert.equal(await page.locator('.progenv-topic').first().getAttribute('href'),'https://progenv.inf.elte.hu/hu/courses/1/topics/1');
    assert.equal(await page.locator('.progenv-topic[href$="/courses/1/topics/1"]').count(),1);
    assert.equal(await page.locator('.progenv-topic-score[data-result="incomplete"]').count(),1);
    assert.match(await page.locator('.progenv-topic').last().getAttribute('title'),/feladat/);
    assert.equal(await page.locator('body>main').innerText(),'Kezdőlap');
    await page.waitForFunction(() => document.querySelectorAll('.progenv-task').length >= 2);
    assert.equal(await page.locator('.progenv-task').first().innerText(),'Esős napok száma');
    assert.equal(await page.locator('.progenv-task[href="https://progenv.inf.elte.hu/hu/tasks/12"]').count(),1);
    assert.equal(await page.locator('.progenv-task').count(),2);
    // A completed topic with a deadline lists tasks; undated topics do not,
    // even when their completion is below 100%.
    assert.equal(await page.locator('li').filter({has:page.locator('.progenv-topic-score[data-result="incomplete"]')}).locator('.progenv-task').count(),0);
    assert.equal(calls.some(call=>call.path==='/hu/courses/1/groups/20/topics/1'),false);
    assert(calls.some(call=>call.path==='/hu/courses/1/topics/1'));
    assert.equal(calls.some(call=>call.path==='/hu/courses/1/groups/20/topics/2'),false);
    const badge=await page.locator('.progenv-topic-score').first().evaluate(node=>{
      const badge=node.getBoundingClientRect(),row=node.parentElement.getBoundingClientRect();
      return {offset:Math.abs(badge.y+badge.height/2-row.y-row.height/2),height:badge.height,width:badge.width};
    });
    assert(badge.offset<1 && badge.height>=21 && badge.width>=38,JSON.stringify(badge));
    if (fixtures) {
      assert.equal(await page.locator('.progenv-topic').count(),5);
      assert.equal(await page.locator('.progenv-topic-score[data-result="complete"]').count(),4);
    }
    if (process.env.PROGENV_PREVIEW_PATH) await page.screenshot({path:process.env.PROGENV_PREVIEW_PATH});
    const headingBefore=await page.locator('.progenv-course-name').boundingBox();
    const arrowBox=()=>page.locator('.progenv-quick-courses summary').evaluate(node=>{
      const style=getComputedStyle(node,'::before');return {content:style.content,width:style.width,height:style.height};
    });
    const arrowBefore=await arrowBox();
    assert.deepEqual(arrowBefore,{content:'""',width:'7px',height:'7px'});
    await page.locator('.progenv-quick-courses summary').click();
    assert.equal(await detail.getAttribute('open'),null);
    const headingAfter=await page.locator('.progenv-course-name').boundingBox();
    assert.equal(headingBefore.x,headingAfter.x);assert.equal(headingBefore.y,headingAfter.y);
    assert.deepEqual(await arrowBox(),arrowBefore);
    await page.waitForFunction(() => testSettings.progenvCollapsed['1/20'] === true);
    await page.locator('.progenv-quick-courses summary').click();
    await page.waitForFunction(() => !testSettings.progenvCollapsed['1/20']);
    const firstHref = await page.locator('.progenv-topic').first().getAttribute('href');
    await page.evaluate(url => history.pushState({},'',url),firstHref);
    await page.waitForFunction(() => document.querySelector('.progenv-topic[aria-current="page"]'));
    // The framework replacing its sidebar must not remove or duplicate the shortcuts.
    await page.evaluate(markup => { document.querySelector('[data-sidebar="content"]').innerHTML = markup; },sidebarMarkup);
    await page.waitForFunction(() => document.querySelectorAll('.progenv-quick-courses').length === 1 && document.querySelectorAll('.progenv-topic').length >= 3);
    await page.setViewportSize({width:450,height:800});
    assert.equal(await page.locator('.progenv-quick-courses').count(),1);
    await load({'1/20':true});
    await page.waitForFunction(() => document.querySelector('.progenv-quick-courses details'));
    assert.equal(await page.locator('.progenv-quick-courses details').getAttribute('open'),null);
    mode = 'meta'; await load();
    await page.waitForFunction(() => document.querySelectorAll('.progenv-topic').length >= 3);
    mode = 'groups'; await load();
    await page.waitForFunction(() => document.querySelectorAll('.progenv-quick-courses details').length === 2);
    assert.equal(await page.locator('.progenv-group-number').last().innerText(),'21. csoport');
    mode = 'error'; await load();
    await page.getByRole('button',{name:'Újrapróbálás'}).waitFor();
    mode = 'normal'; await page.getByRole('button',{name:'Újrapróbálás'}).click();
    await page.waitForFunction(() => document.querySelectorAll('.progenv-topic').length >= 3);
    mode = 'task-error'; await load();
    await page.getByText('A feladatlista most nem érhető el.').first().waitFor();
    assert.equal(await page.locator('.progenv-topic').count(),3);
    mode = 'login'; await load();
    await page.getByRole('button',{name:'Újrapróbálás'}).waitFor();
    assert.equal(await page.locator('.progenv-topic').count(),0);
    assert.match(await page.locator('.progenv-quick-status').innerText(),/Jelentkezz/);
    mode = 'empty'; await load();
    await page.getByText('Nincs elérhető kurzus.',{exact:true}).waitFor();
    mode = 'normal'; await load();
    await page.waitForFunction(() => document.querySelectorAll('.progenv-topic').length >= 3);
    await page.evaluate(() => history.pushState({},'','/hu/login'));
    await page.waitForFunction(() => document.querySelectorAll('.progenv-quick-courses').length === 0);
    assert(calls.every(call => call.method === 'GET'));
    assert.deepEqual(errors,[]);
    console.log('PASS: course/group/topic parsing, task links from observed card structure, centered larger badges, task-page failures, locale links, sidebar dropdowns, default open, compact metadata, course-level topics, collapse persistence, active links, SPA remount, streaming redirects, multiple groups, errors/retry, expired login, empty list, logout cleanup, GET-only requests'+(fixtures?' (observed signed-in page markup)':''));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
