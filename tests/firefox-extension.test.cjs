// Installs the actual extension in a fresh Firefox profile. No browser API mocks.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {Builder,By,until}=require('selenium-webdriver');
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
files=['manifest.json','popup.html','popup.css','popup.js','site-favicon.js','content.js','model.js','progenv.js','progenv-model.js','output-diff.js','progenv-output-hints.js','spec-resize.js']
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
    await network.beforeRequestSent(async event=>{
      if(!event.request.url.startsWith('https://progenv.inf.elte.hu/')) return;
      try {
        const pathname=new URL(event.request.url).pathname;
        const late=new URL(event.request.url).searchParams.has('late');
        let body='<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font:14px system-ui}aside{width:260px}</style></head><body><aside data-sidebar="'+(late?'pending':'content')+'"><ul data-sidebar="menu"><li><a href="/hu/courses">Kurzusok</a></li></ul></aside><main><h1>Test page</h1></main></body></html>';
        if(pathname==='/hu/courses') body='<main><div data-slot="card"><a href="/courses/1">Programming</a></div></main>';
        if(pathname==='/hu/courses/1') body='<main><h1>20. csoport</h1><div data-slot="card"><a href="/courses/1/groups/20/topics/1">Topic One</a><span aria-label="Score 100%"></span><span>1 feladat</span></div></main>';
        await network.provideResponse(new ProvideResponseParameters(event.request.request).statusCode(200)
          .headers([new Header('Content-Type',new BytesValue('string','text/html; charset=utf-8'))])
          .body(new BytesValue('string',body)));
      } catch(error) {networkErrors.push(error.message);}
    });
    await network.addIntercept(new AddInterceptParameters('beforeRequestSent').urlPattern(new UrlPattern().protocol('https').hostname('progenv.inf.elte.hu')));
    // Cold start: do not open the popup until the real content script has loaded.
    await driver.get('https://progenv.inf.elte.hu/hu');
    await driver.wait(until.elementLocated(By.css('.progenv-topic')),10000);
    assert.match(await driver.findElement(By.css('.progenv-topic')).getText(),/^Topic One/);
    await driver.findElement(By.css('.progenv-topic-score')).click();
    const center=await driver.executeScript(function(){const box=document.getElementById('progenv-hide-dialog').getBoundingClientRect();return {x:Math.abs(box.x+box.width/2-innerWidth/2),y:Math.abs(box.y+box.height/2-innerHeight/2)};});
    assert(center.x<1 && center.y<1,JSON.stringify(center));
    await driver.actions().move({origin:'viewport',x:10,y:10}).click().perform();
    assert.equal(await driver.findElement(By.id('progenv-hide-dialog')).isDisplayed(),false);
    await driver.get('https://progenv.inf.elte.hu/hu?late=1');
    await driver.wait(until.elementLocated(By.id('progenv-quick-style')),10000);
    await driver.executeScript(()=>document.querySelector('aside').setAttribute('data-sidebar','content'));
    await driver.wait(until.elementLocated(By.css('.progenv-topic')),10000);
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
    console.log('PASS: actual Firefox cold start before popup, late sidebar hydration, centered dialog with CSS reset, add-on installation, native settings persistence, details');
  } finally {
    if(driver) await driver.quit();
    assert.equal(path.dirname(folder),path.resolve(os.tmpdir()));
    assert(path.basename(folder).startsWith('elte-extras-firefox-'));
    fs.rmSync(folder,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exit(1);});
