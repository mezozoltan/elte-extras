const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const repository = path.resolve(__dirname,'..');
const fallback = `<!doctype html><html><head></head><body><div class="screen">
  <div id="panel-buttons">${['editor','data','visualization','history'].map((name,index)=>`<label for="show-${name}">${name}<input type="checkbox" id="show-${name}" ${index<2?'checked':''}></label>`).join('')}</div>
  <div class="panels"><div id="history-container" class="hidden">History</div><div class="left"><div id="editor-container">1 Specification<div id="specification-editor"></div></div><div id="visualization-container" class="hidden">3 Visualization</div></div><div id="data-container">2 Data<div id="data-editor"></div></div></div>
  </div></body></html>`;
const basicCSS = `*{box-sizing:border-box}body{margin:0}.screen{height:100vh;display:flex;flex-direction:column}.panels{display:flex;flex:1;min-height:0}.panels>*{overflow:auto;flex:1}.left{display:flex;flex-direction:column}#editor-container,#visualization-container,#data-container{display:flex;flex-direction:column;flex:1}.hidden{display:none!important}`;
let html = process.env.SPEC_HTML_PATH ? fs.readFileSync(process.env.SPEC_HTML_PATH,'utf8') : fallback;
const css = process.env.SPEC_CSS_PATH ? fs.readFileSync(process.env.SPEC_CSS_PATH,'utf8') : basicCSS;
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
html = html.replace('</head>',`<style>${css}</style></head>`);

(async()=>{
  const browser = await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    page.setDefaultTimeout(10000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
    async function load(ratio) {
      await page.goto('https://progalap.elte.hu/specifikacio/');
      await page.evaluate(ratio=>{
        window.settings={specPanelRatio:ratio};
        window.browser={storage:{local:{get:async()=>settings,set:async value=>Object.assign(settings,value)}}};
        // The real client's V7 panel-toggle behavior, independent of Monaco/auth.
        window.nativePanels=()=>{
          const on=name=>document.getElementById('show-'+name).checked;
          document.getElementById('editor-container').classList.toggle('hidden',!on('editor'));
          document.getElementById('data-container').classList.toggle('hidden',!on('data'));
          document.getElementById('visualization-container').classList.toggle('hidden',!on('visualization'));
          document.getElementById('history-container').classList.toggle('hidden',!on('history'));
          document.getElementById('editor-container').parentElement.classList.toggle('hidden',!on('editor')&&!on('visualization'));
        };
        document.getElementById('panel-buttons').addEventListener('click',nativePanels);
        document.getElementById('panel-buttons').addEventListener('change',nativePanels);
        nativePanels();
      },ratio);
      await page.addScriptTag({path:path.join(repository,'spec-resize.js')});
      await settle();
    }
    const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const sizes=()=>page.evaluate(()=>{
      const left=document.getElementById('editor-container').parentElement;
      const data=document.getElementById('data-container'),history=document.getElementById('history-container'),divider=document.getElementById('spec-panel-divider');
      return {left:left.getBoundingClientRect().width,data:data.getBoundingClientRect().width,history:history.getBoundingClientRect().width,
        total:left.parentElement.getBoundingClientRect().width,divider:divider.getBoundingClientRect().width,hidden:divider.hidden,value:+divider.getAttribute('aria-valuenow')};
    });
    async function panels(flags) {
      await page.evaluate(flags=>{
        for(const [name,value]of Object.entries(flags))document.getElementById('show-'+name).checked=value;
        nativePanels();
      },flags);
      await settle();
    }
    await load(.6);
    assert.equal((await sizes()).value,60);
    const divider=page.locator('#spec-panel-divider');
    const initial=await sizes(),box=await divider.boundingBox();
    await page.mouse.move(box.x+3,box.y+box.height/2); await page.mouse.down();
    await page.mouse.move(430,box.y+box.height/2,{steps:5}); await page.mouse.up();
    const dragged=await sizes();
    assert(dragged.left<initial.left-100);
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('spec-divider-dragging')),false);
    assert(Math.abs(await page.evaluate(()=>settings.specPanelRatio)-dragged.left/(dragged.left+dragged.data))<.02);
    // Visualization may be hidden: the 1/2 divider still changes their widths.
    assert.equal(await page.locator('#visualization-container').isVisible(),false);
    const savedRatio=dragged.value;
    await page.locator('label[for="show-data"]').click(); await settle();
    const dataHidden=await sizes(); assert.equal(dataHidden.hidden,true); assert(Math.abs(dataHidden.left-dataHidden.total)<2);
    await page.locator('label[for="show-data"]').click(); await settle();
    assert.equal((await sizes()).value,savedRatio);
    for(let bits=0;bits<16;bits++){
      const flags={editor:Boolean(bits&1),data:Boolean(bits&2),visualization:Boolean(bits&4),history:Boolean(bits&8)};
      await panels(flags);const size=await sizes();
      assert.equal(size.hidden,!((flags.editor||flags.visualization)&&flags.data),JSON.stringify(flags));
      if(flags.editor||flags.visualization||flags.data||flags.history)assert(Math.abs(size.left+size.data+size.history+size.divider-size.total)<3,JSON.stringify({flags,size}));
    }
    await panels({editor:true,data:true,visualization:true,history:true});
    await divider.focus();await page.keyboard.press('End'); assert((await sizes()).value>=85);
    await page.keyboard.press('Home'); assert((await sizes()).value<=15);
    await page.keyboard.press('ArrowRight'); assert((await sizes()).value>10);
    await divider.dblclick(); assert.equal((await sizes()).value,67);
    await panels({editor:true,data:true,visualization:false,history:false});
    await page.setViewportSize({width:500,height:750});await settle();
    const narrow=await sizes();assert(narrow.left>=119&&narrow.data>=119);
    await page.setViewportSize({width:1440,height:900});await settle();
    const cancelBox=await divider.boundingBox(),beforeCancel=(await sizes()).value;
    await page.mouse.move(cancelBox.x+3,cancelBox.y+50);await page.mouse.down();await page.mouse.move(300,cancelBox.y+50);await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal((await sizes()).value,beforeCancel);
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('spec-divider-dragging')),false);
    await page.addScriptTag({path:path.join(repository,'spec-resize.js')});assert.equal(await divider.count(),1);
    if(process.env.SPEC_PREVIEW_PATH)await page.screenshot({path:process.env.SPEC_PREVIEW_PATH});
    await load(.4);assert.equal((await sizes()).value,40);
    assert.deepEqual(errors,[]);
    console.log('PASS: pointer dragging, persistence, Visualization disabled, Data disabled/full width/restored, all 16 S/D/V/H combinations, keyboard controls, double-click reset, viewport resize, Escape cleanup, duplicate injection'+(process.env.SPEC_HTML_PATH?' (actual Speci HTML/CSS)':''));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
