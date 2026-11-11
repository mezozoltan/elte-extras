// Installs the actual extension in a fresh Firefox profile. No browser API mocks.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {Builder,By,Key,until}=require('selenium-webdriver');
const firefox=require('selenium-webdriver/firefox');
const {Network}=require('selenium-webdriver/bidi/network');
const {AddInterceptParameters}=require('selenium-webdriver/bidi/addInterceptParameters');
const {UrlPattern}=require('selenium-webdriver/bidi/urlPattern');
const {ProvideResponseParameters}=require('selenium-webdriver/bidi/provideResponseParameters');
const {BytesValue,Header}=require('selenium-webdriver/bidi/networkTypes');
const root=path.resolve(__dirname,'..');
(async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'elte-extras-firefox-'));
  const archive=path.join(folder,'extension.zip');
  let driver;
  try {
    const python=process.env.PYTHON || (process.platform==='win32'?'python':'python3');
    const packaged=spawnSync(python,['-c',`import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1])
files=['manifest.json','popup.html','popup.css','popup.js','site-favicon.js','content.js','model.js','progenv.js','progenv-model.js','output-diff.js','progenv-output-hints.js','spec-resize.js','klettner-login.js']
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as archive:
 for name in files: archive.write(root/name,name)
 for image in (root/'icons').iterdir():
  if image.is_file(): archive.write(image,'icons/'+image.name)
`,root,archive],{encoding:'utf8'});
    assert.equal(packaged.status,0,packaged.stderr || packaged.error?.message);
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
    const addonId=manifest.browser_specific_settings.gecko.id;
    const uuid='81c23b24-a315-4ef4-b341-360533455e91';
    const options=new firefox.Options().addArguments('-headless').enableBidi()
      .setPreference('extensions.webextensions.uuids',JSON.stringify({[addonId]:uuid}));
    if(process.env.FIREFOX_BINARY) options.setBinary(process.env.FIREFOX_BINARY);
    const builder=new Builder().forBrowser('firefox').setFirefoxOptions(options);
    builder.setFirefoxService(new firefox.ServiceBuilder(process.env.GECKODRIVER_PATH).addArguments('--allow-system-access'));
    driver=await builder.build();
    assert.equal(await driver.installAddon(archive,true),addonId);
    const network=await Network(driver);
    const networkErrors=[];
    const loginPath='/Downloads/progptin/login.txt';
    const klettner='https://klettner.web.elte.hu';
    const sso='https://idp.elte.hu';
    let loginReplies=[302], loginChecks=0, ssoVisits=0;
    const loginTrace=[];
    const slideRequests=new Set();
    await network.beforeRequestSent(async event=>{
      if(event.request.url.startsWith(sso+'/')) {
        try {
          ssoVisits++;
          await network.provideResponse(new ProvideResponseParameters(event.request.request).statusCode(200)
            .headers([new Header('Content-Type',new BytesValue('string','text/html; charset=utf-8'))])
            .body(new BytesValue('string','<!doctype html><a href="'+klettner+'/test-sso-complete">Finish test login</a>')));
        } catch(error) {networkErrors.push(error.message);}
        return;
      }
      if(event.request.url.startsWith(klettner+'/')) {
        try {
          const pathname=new URL(event.request.url).pathname;
          let status=200, type='text/html; charset=utf-8';
          let body=`<!doctype html><meta charset="utf-8"><header id="masthead"><div id="bar"><nav>Oktatás</nav><div id="searchicon">Keresés</div></div></header>
            <main class="entry-content"><a href="${loginPath}">ide</a>
            <a id="slide" data-slb-group="722" href="/Downloads/progptin/dia1/Dia1.JPG">Alapvető tudnivalók</a>
            ${Array.from({length:11},(_,index)=>`<a data-slb-group="722" href="/Downloads/progptin/dia1/Dia${index+2}.JPG"></a>`).join('')}
            <a id="second-deck" data-slb-group="722" href="/Downloads/progptin/dia1/Dia13.JPG">Another deck</a>
            <a data-slb-group="other" href="/Downloads/progptin/dia1/Dia14.JPG">Unrelated gallery</a>
            <a id="public" href="#public">Public material</a><output></output></main>
            <script>document.querySelector('#slide').addEventListener('click', event=>{
              event.preventDefault(); document.querySelector('output').textContent='Viewer opened';
            });</script>`;
          if(pathname===loginPath) {
            loginChecks++;
            status=loginReplies.shift() ?? 500; type='text/plain';
            loginTrace.push({status, destination:event.request.headers.find(h=>h.name.toLowerCase()==='sec-fetch-dest')?.value.value});
            body=status===200?'Sikeres bejelentkezés!\nPlease return to the course page.':'';
            if(status===200 && [6,7].includes(loginChecks)) body=body.replace('é','\uFFFD');
          } else if(pathname==='/test-sso-complete') {
            status=302; body=''; loginReplies=[200,503,200];
          } else if(pathname.startsWith('/Downloads/progptin/dia1/')) {
            slideRequests.add(pathname);
            type='image/svg+xml';
            body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>';
          }
          const headers=[new Header('Content-Type',new BytesValue('string',type))];
          if(status===302) headers.push(new Header('Location',new BytesValue('string',
            pathname===loginPath ? sso+'/test-sso' : klettner+loginPath)));
          const responseBody=pathname===loginPath && status===200 && !body.includes('\uFFFD')
            ? new BytesValue('base64',Buffer.from(body,'latin1').toString('base64'))
            : new BytesValue('string',body);
          await network.provideResponse(new ProvideResponseParameters(event.request.request).statusCode(status)
            .headers(headers).body(responseBody));
        } catch(error) {networkErrors.push(error.message);}
        return;
      }
      if(!event.request.url.startsWith('https://progenv.inf.elte.hu/')) return;
      try {
        const pathname=new URL(event.request.url).pathname;
        const late=new URL(event.request.url).searchParams.has('late');
        let body='<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font:14px system-ui}aside{width:260px}</style></head><body><aside data-sidebar="'+(late?'pending':'content')+'"><ul data-sidebar="menu"><li><a href="/hu/courses">Kurzusok</a></li></ul></aside><main><h1>Test page</h1></main></body></html>';
        if(pathname==='/hu/courses') body='<main><div data-slot="card"><a href="/courses/1">Programming</a></div></main>';
        if(pathname==='/hu/courses/1') body='<main><h1>20. csoport</h1>'+[1,2].map(id=>`<div data-slot="card"><a href="/courses/1/groups/20/topics/${id}">Topic ${id===1?'One':'Two'}</a><span aria-label="Score 100%"></span><span>1 feladat</span></div>`).join('')+'</main>';
        if(pathname.endsWith('/topics/1')) body='<main><a href="/hu/courses/1/groups/20/topics/1/tasks/1"><h3>Task One</h3></a></main>';
        await network.provideResponse(new ProvideResponseParameters(event.request.request).statusCode(200)
          .headers([new Header('Content-Type',new BytesValue('string','text/html; charset=utf-8'))])
          .body(new BytesValue('string',body)));
      } catch(error) {networkErrors.push(error.message);}
    });
    await network.addIntercept(new AddInterceptParameters('beforeRequestSent').urlPattern(new UrlPattern().protocol('https').hostname('progenv.inf.elte.hu')));
    await network.addIntercept(new AddInterceptParameters('beforeRequestSent').urlPattern(new UrlPattern().protocol('https').hostname('klettner.web.elte.hu')));
    await network.addIntercept(new AddInterceptParameters('beforeRequestSent').urlPattern(new UrlPattern().protocol('https').hostname('idp.elte.hu')));
    // Cold start: do not open the popup until the real content script has loaded.
    await driver.get('https://progenv.inf.elte.hu/hu');
    await driver.wait(until.elementLocated(By.css('.progenv-topic')),10000);
    assert.match(await driver.findElement(By.css('.progenv-topic')).getText(),/^Topic One/);
    await driver.findElement(By.css('.progenv-topic-score')).click();
    const center=await driver.executeScript(function(){const box=document.getElementById('progenv-hide-dialog').getBoundingClientRect();return {x:Math.abs(box.x+box.width/2-innerWidth/2),y:Math.abs(box.y+box.height/2-innerHeight/2)};});
    assert(center.x<1 && center.y<1,JSON.stringify(center));
    await driver.actions().move({origin:'viewport',x:10,y:10}).click().perform();
    assert.equal(await driver.findElement(By.id('progenv-hide-dialog')).isDisplayed(),false);
    const firstTopic=await driver.findElement(By.css('.progenv-topic'));
    await driver.actions().contextClick(firstTopic).perform();
    const toggle=await driver.wait(until.elementLocated(By.css('#progenv-topic-menu [role="menuitem"]')),10000);
    assert.equal(await toggle.getText(),'Feladatok megjelenítése');await toggle.click();
    await driver.wait(until.elementLocated(By.css('.progenv-task')),10000,'Firefox should load tasks selected in the context menu');
    // Gecko WebDriver does not reliably synthesize native drop (Mozilla bug 1515879).
    // Edge covers native mouse dragging; here exercise Firefox's real content-script
    // handlers and storage using DOM drag events, without mocking extension APIs.
    await driver.executeScript(()=>{
      const [source,target]=document.querySelectorAll('.progenv-topic-row'), dataTransfer=new DataTransfer();
      const box=target.getBoundingClientRect();
      const event=type=>new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer,clientX:box.left+20,clientY:box.bottom-1});
      source.dispatchEvent(event('dragstart'));target.dispatchEvent(event('dragover'));target.dispatchEvent(event('drop'));source.dispatchEvent(event('dragend'));
    });
    await driver.wait(async()=>await driver.findElement(By.css('.progenv-topic-name')).getText()==='Topic Two',10000,'Firefox should reorder dragged topics');
    await driver.get('https://progenv.inf.elte.hu/hu?late=1');
    await driver.wait(until.elementLocated(By.id('progenv-quick-style')),10000);
    await driver.executeScript(()=>document.querySelector('aside').setAttribute('data-sidebar','content'));
    await driver.wait(until.elementLocated(By.css('.progenv-topic')),10000);
    assert.equal(await driver.findElement(By.css('.progenv-topic-name')).getText(),'Topic Two');
    assert.equal(await driver.wait(until.elementLocated(By.css('.progenv-task')),10000).then(node=>node.getText()),'Task One');
    await driver.get(klettner+'/?p=722');
    const loginControl='#elte-extras-klettner-login';
    const loginLink=await driver.wait(until.elementLocated(By.css(loginControl+' > a')),10000);
    assert.equal(await loginLink.getText(),'BEJELENTKEZÉS');
    assert.equal(await loginLink.getCssValue('border-top-left-radius'),'0px');
    assert.equal(await driver.findElements(By.css('#bar > '+loginControl+' + #searchicon')).then(nodes=>nodes.length),1);
    assert.equal(await loginLink.getAttribute('href'),klettner+loginPath);
    assert.equal(await loginLink.getCssValue('background-color'),'rgb(177, 68, 55)');
    assert.equal(loginChecks,1);
    assert.equal(ssoVisits,0);
    const slide=await driver.findElement(By.id('slide'));
    await driver.findElement(By.id('public')).click();
    assert.equal(new URL(await driver.getCurrentUrl()).hash,'#public');
    assert.equal(loginChecks,1);
    loginReplies=[302,302];
    const windowsBeforeLogin=await driver.getAllWindowHandles();
    await slide.click();
    const dialog=await driver.wait(until.elementLocated(By.css('#elte-extras-klettner-dialog[open]')),10000);
    assert.equal(await dialog.getCssValue('border-top-left-radius'),'0px');
    const viewer=await driver.findElement(By.css('output'));
    assert.equal(await viewer.getText(),'');
    assert.deepEqual(await driver.executeScript(element=>Array.from(element.children,child=>child.tagName),dialog),['IFRAME']);
    assert.deepEqual(await driver.getAllWindowHandles(),windowsBeforeLogin);
    const frame=await dialog.findElement(By.css('iframe'));
    await driver.switchTo().frame(frame);
    const finishLogin=await driver.wait(until.elementLocated(By.linkText('Finish test login')),10000);
    await driver.switchTo().defaultContent();
    assert.equal(ssoVisits,1);
    await driver.executeScript(()=>document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(loginChecks,3,'Do not start another login probe while the dialog is open');
    await driver.switchTo().frame(frame);
    await finishLogin.click();
    await driver.switchTo().defaultContent();
    const loggedIn=await driver.wait(until.elementLocated(By.css(loginControl+' > span')),10000);
    assert.equal(await loggedIn.getText(),'BEJELENTKEZVE');
    assert.equal(loginChecks,6,JSON.stringify(loginTrace));
    await driver.wait(until.elementIsNotVisible(dialog),10000);
    await driver.wait(async()=>!(await dialog.findElements(By.css('iframe'))).length,10000);
    loginReplies=[200];
    await slide.click();
    const slideViewer=await driver.wait(until.elementLocated(By.id('elte-extras-slide-viewer')),10000);
    assert.equal(await viewer.getText(),'');
    assert.equal(await slideViewer.findElement(By.css('.elte-slide-navigation span')).getText(),'/ 13');
    assert.equal(await slideViewer.findElements(By.css('button')).then(buttons=>buttons.length),3);
    const pageNumber=await slideViewer.findElement(By.css('input'));
    const slideTitle=await slideViewer.findElement(By.css('strong'));
    await driver.wait(()=>slideRequests.size>=9,10000);
    assert.deepEqual(slideRequests,new Set([1,2,3,4,5,6,7,12,13].map(index=>`/Downloads/progptin/dia1/Dia${index}.JPG`)));
    await driver.actions().sendKeys(Key.ARROW_LEFT).perform();
    assert.equal(await pageNumber.getProperty('value'),'13');
    assert.equal(await slideTitle.getText(),'Another deck');
    await driver.actions().sendKeys(Key.ARROW_RIGHT).perform();
    assert.equal(await pageNumber.getProperty('value'),'1');
    assert.equal(await slideTitle.getText(),'Alapvető tudnivalók');
    await driver.actions().sendKeys(Key.ARROW_RIGHT,Key.ARROW_RIGHT,Key.ARROW_RIGHT).perform();
    assert.equal(await pageNumber.getProperty('value'),'4');
    await pageNumber.click();
    await driver.actions().keyDown(Key.CONTROL).sendKeys('a').keyUp(Key.CONTROL).sendKeys('12').perform();
    assert.equal(await pageNumber.getProperty('value'),'12');
    await driver.wait(async()=>await driver.executeScript(element=>{
      const img=element.querySelector('img');
      return img.src.endsWith('/Dia12.JPG') && img.naturalWidth>0;
    },slideViewer),10000,'Typing 12 should load slide 12 without Enter');
    assert.match(await slideViewer.findElement(By.css('img')).getAttribute('src'),/Dia12\.JPG$/);
    const stageFit=await driver.executeScript(element=>{
      const stage=element.querySelector('.elte-slide-stage').getBoundingClientRect();
      return Math.abs(stage.width-stage.height)<1 && element.getBoundingClientRect().bottom<=innerHeight;
    },slideViewer);
    assert.equal(stageFit,true);
    await pageNumber.sendKeys(Key.ENTER);
    await driver.actions().sendKeys(Key.ARROW_LEFT).perform();
    assert.equal(await pageNumber.getProperty('value'),'11');
    assert(!slideRequests.has('/Downloads/progptin/dia1/Dia14.JPG'));
    await driver.actions().move({x:5,y:5}).click().perform();
    await driver.wait(until.stalenessOf(slideViewer),10000);
    assert.equal(await dialog.isDisplayed(),false);
    assert.equal(loginChecks,7);
    loginReplies=[200];
    await driver.findElement(By.id('second-deck')).click();
    const secondViewer=await driver.wait(until.elementLocated(By.css('#elte-extras-slide-viewer[open]')),10000);
    assert.equal(await secondViewer.findElement(By.css('input')).getProperty('value'),'13');
    assert.equal(await secondViewer.findElement(By.css('strong')).getText(),'Another deck');
    await driver.actions().sendKeys(Key.ESCAPE).perform();
    await driver.wait(until.stalenessOf(secondViewer),10000);
    loginReplies=[503,503];
    await driver.executeScript(()=>document.dispatchEvent(new Event('visibilitychange')));
    await driver.wait(until.elementIsNotVisible(driver.findElement(By.css(loginControl))),10000);
    assert.equal(loginChecks,10);
    assert.equal(ssoVisits,1);
    assert.deepEqual(networkErrors,[]);
    // Firefox blocks WebDriver's ordinary navigation to extension origins.
    // Open a trusted tab through the browser UI in this disposable test profile.
    await driver.setContext(firefox.Context.CHROME);
    const popup=await driver.executeScript(function(id) {
      const uuid=JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids'))[id];
      const url='moz-extension://'+uuid+'/popup.html';
      gBrowser.selectedTab=gBrowser.addTab(url,{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
      return url;
    },addonId);
    assert(popup.startsWith('moz-extension://'));
    await driver.setContext(firefox.Context.CONTENT);
    const windows=await driver.getAllWindowHandles();
    await driver.switchTo().window(windows.at(-1));
    const stuki=await driver.wait(until.elementLocated(By.css('input[name="stuki"]')),10000);
    await driver.wait(until.elementIsEnabled(stuki),10000);
    assert.equal(await stuki.isSelected(),true);
    await stuki.click();
    await driver.wait(until.elementIsEnabled(stuki),10000);
    await driver.navigate().refresh();
    const reloaded=await driver.wait(until.elementLocated(By.css('input[name="stuki"]')),10000);
    await driver.wait(until.elementIsEnabled(reloaded),10000);
    assert.equal(await reloaded.isSelected(),false);
    assert.equal(await driver.findElement(By.css('input[name="speci"]')).isSelected(),true);
    await driver.findElement(By.id('details-toggle')).click();
    assert.equal(await driver.findElement(By.id('details')).isDisplayed(),true);
    assert.equal(await driver.findElement(By.id('status')).getText(),'');
    await driver.uninstallAddon(addonId);
    console.log('PASS: Firefox startup, sidebar controls and persistence, embedded login and session retries, popup settings');
  } finally {
    if(driver) await driver.quit();
    assert.equal(path.dirname(folder),path.resolve(os.tmpdir()));
    assert(path.basename(folder).startsWith('elte-extras-firefox-'));
    fs.rmSync(folder,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exit(1);});
