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
    async function load(ratio,visualizationRatio = .5) {
      await page.goto('https://progalap.elte.hu/specifikacio/');
      await page.evaluate(({ratio,visualizationRatio})=>{
        window.settings={specPanelRatio:ratio,specVisualizationRatio:visualizationRatio};
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
      },{ratio,visualizationRatio});
      await page.addScriptTag({path:path.join(repository,'spec-resize.js')});
      await settle();
    }
    const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const sizes=()=>page.evaluate(()=>{
      const left=document.getElementById('editor-container').parentElement;
      const data=document.getElementById('data-container'),history=document.getElementById('history-container'),divider=document.getElementById('spec-panel-divider');
      return {left:left.getBoundingClientRect().width,data:data.getBoundingClientRect().width,history:history.getBoundingClientRect().width,
        total:left.parentElement.getBoundingClientRect().width,divider:divider.getBoundingClientRect().width,gap:data.getBoundingClientRect().left-left.getBoundingClientRect().right,hidden:divider.hidden,value:+divider.getAttribute('aria-valuenow')};
    });
    const heights=()=>page.evaluate(()=>{
      const editor=document.getElementById('editor-container'),visualization=document.getElementById('visualization-container'),divider=document.getElementById('spec-visualization-divider');
      const top=editor.getBoundingClientRect(),bottom=visualization.getBoundingClientRect();
      return {editor:top.height,visualization:bottom.height,total:editor.parentElement.clientHeight,gap:bottom.top-top.bottom,hidden:divider.hidden,value:+divider.getAttribute('aria-valuenow')};
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
    // The hitbox overlaps the existing boundary; it adds no visible stripe or gap.
    assert.equal((await sizes()).divider,9);
    assert(Math.abs((await sizes()).gap)<1);
    const appearance=()=>divider.evaluate(node=>({background:getComputedStyle(node).backgroundColor,extraLine:getComputedStyle(node,'::after').content}));
    assert.deepEqual(await appearance(),{background:'rgba(0, 0, 0, 0)',extraLine:'none'});
    await divider.hover();
    assert.deepEqual(await appearance(),{background:'rgba(0, 0, 0, 0)',extraLine:'none'});
    // Both sides of the invisible hitbox must drag without snapping on pickup.
    for(const inset of [1,8]) {
      const edgeBox=await divider.boundingBox(),before=await sizes();
      const x=edgeBox.x+inset,y=edgeBox.y+edgeBox.height/2;
      await page.mouse.move(x,y);await page.mouse.down();
      assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('spec-divider-dragging')),true);
      await page.mouse.move(x+30,y);await page.mouse.up();
      assert(Math.abs((await sizes()).left-before.left-30)<1);
    }
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
      if(flags.editor||flags.visualization||flags.data||flags.history)assert(Math.abs(size.left+size.data+size.history-size.total)<3,JSON.stringify({flags,size}));
      if(!size.hidden)assert(Math.abs(size.gap)<1,JSON.stringify({flags,size}));
      const height=await heights();
      assert.equal(height.hidden,!(flags.editor&&flags.visualization));
      if(flags.editor||flags.visualization)assert(Math.abs(height.editor+height.visualization-height.total)<2,JSON.stringify({flags,height}));
      if(!height.hidden)assert(Math.abs(height.gap)<1);
    }
    await panels({editor:true,data:true,visualization:true,history:true});
    const vertical=page.locator('#spec-visualization-divider');
    assert.equal(await vertical.getAttribute('aria-orientation'),'horizontal');
    assert.equal((await heights()).value,50);
    const widthBefore=(await sizes()).left;
    for(const inset of [1,8]) {
      const box=await vertical.boundingBox(),before=await heights();
      const x=box.x+box.width/2,y=box.y+inset;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+35);await page.mouse.up();
      assert(Math.abs((await heights()).editor-before.editor-35)<1);
    }
    assert.equal((await sizes()).left,widthBefore);
    assert(Math.abs(await page.evaluate(()=>settings.specVisualizationRatio)-(await heights()).editor/(await heights()).total)<.01);
    const savedHeight=(await heights()).value;
    await panels({visualization:false});assert.equal((await heights()).hidden,true);
    assert(Math.abs((await heights()).editor-(await heights()).total)<1);
    await panels({visualization:true});assert.equal((await heights()).value,savedHeight);
    await panels({editor:false});assert.equal((await heights()).hidden,true);
    assert(Math.abs((await heights()).visualization-(await heights()).total)<1);
    await panels({editor:true,data:false});assert.equal((await heights()).hidden,false);
    await vertical.focus();await page.keyboard.press('Home');assert((await heights()).editor>=119);
    await page.keyboard.press('End');assert((await heights()).visualization>=119);
    await vertical.dblclick();assert.equal((await heights()).value,50);
    await page.keyboard.press('ArrowDown');assert.equal((await heights()).value,52);
    const cancelVertical=await vertical.boundingBox(),beforeVerticalCancel=(await heights()).value;
    await page.mouse.move(cancelVertical.x+50,cancelVertical.y+4);await page.mouse.down();await page.mouse.move(cancelVertical.x+50,250);
    await page.keyboard.press('Escape');await page.mouse.up();assert.equal((await heights()).value,beforeVerticalCancel);
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('spec-visualization-dragging')),false);
    await panels({data:true});
    await divider.focus();await page.keyboard.press('End'); assert((await sizes()).value>=85);
    const focused=await divider.evaluate(node=>{
      const style=getComputedStyle(node),line=getComputedStyle(node,'::after');
      return {outline:style.outlineStyle,lineWidth:line.width,lineLeft:line.left,visible:node.matches(':focus-visible')};
    });
    assert.deepEqual(focused,{outline:'none',lineWidth:'1px',lineLeft:'3px',visible:true});
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
    await page.addScriptTag({path:path.join(repository,'spec-resize.js')});assert.equal(await divider.count(),1);assert.equal(await vertical.count(),1);
    if(process.env.SPEC_PREVIEW_PATH){
      await panels({editor:true,data:true,visualization:true,history:false});
      await vertical.evaluate(node=>node.blur());
      await page.mouse.move(0,0);
      await page.emulateMedia({colorScheme:'dark'});
      await page.screenshot({path:process.env.SPEC_PREVIEW_PATH});
    }
    await load(.4,.35);assert.equal((await sizes()).value,40);
    await panels({editor:true,visualization:true});assert.equal((await heights()).value,35);
    assert.deepEqual(errors,[]);
    console.log('PASS: horizontal and vertical pointer dragging, saved width and height, Visualization and Data toggles, all 16 S/D/V/H combinations, keyboard controls, double-click resets, viewport resize, Escape cleanup, duplicate injection'+(process.env.SPEC_HTML_PATH?' (actual Speci HTML/CSS)':''));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
