(() => {
  "use strict";
  if (document.getElementById('progenv-output-hint-style')) return;
  const analyzer=globalThis.ProgenvOutputDiff;
  if (!analyzer) return;
  const style=document.createElement('style'); style.id='progenv-output-hint-style';
  style.textContent=`
    .progenv-output-hints { margin-top:6px; }
    .progenv-output-hint { margin:3px 0 0; padding:4px 6px; border-left:2px solid var(--muted-foreground,#888); color:var(--muted-foreground,inherit); font-size:11px; line-height:1.45; overflow-wrap:anywhere; }
  `;
  document.head.append(style);
  const hints=new Map();
  let queued=false;
  function output(pre) {
    const column=pre.parentElement;
    if (!column || column.firstElementChild===pre) return null;
    const label=column.firstElementChild.textContent.replace(/\s+/gu,' ').trim();
    const expected=/^(?:Elvárt kimenet|Expected output)\b/iu.test(label);
    const actual=/^(?:Hallgatói kimenet|Student output|Submitted output|Actual output|Your output)\b/iu.test(label);
    if (!expected && !actual) return null;
    return {pre,column,grid:column.parentElement,kind:expected?'expected':'actual',file:label.match(/\(([^)]+)\)/u)?.[1]?.trim() || ''};
  }
  function failed(grid,panel) {
    for (let node=grid.parentElement; node && node!==panel; node=node.parentElement) {
      const title=[...node.querySelectorAll('span')].find(span=>/^(?:Test|Teszt)\s+#?\d+$/iu.test(span.textContent.trim()));
      if (!title) continue;
      const badge=[...node.querySelectorAll('[data-slot="badge"]')].map(b=>b.textContent.trim())
        .map(text=>text.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)(?:\s*(?:pts|pont))?$/iu)).find(Boolean);
      if (!badge) return false;
      const score=Number(badge[1].replace(',','.')),max=Number(badge[2].replace(',','.'));
      return max>0 && score<max;
    }
    return false;
  }
  function scan() {
    const active=new Set();
    const language=location.pathname.startsWith('/en/')?'en':'hu';
    for (const panel of document.querySelectorAll('[role="tabpanel"][id$="-content-tests"]')) {
      const groups=new Map();
      for (const pre of panel.querySelectorAll('pre')) {
        const item=output(pre);
        if (!item?.grid) continue;
        if (!groups.has(item.grid)) groups.set(item.grid,[]);
        groups.get(item.grid).push(item);
      }
      for (const [grid,items] of groups) {
        if (!failed(grid,panel)) continue;
        const messages=[];
        for (const expected of items.filter(item=>item.kind==='expected')) {
          const matches=items.filter(item=>item.kind==='actual' && item.file===expected.file);
          if (matches.length!==1) continue;
          const result=analyzer.analyze(expected.pre.textContent,matches[0].pre.textContent);
          if (result) messages.push({file:expected.file,result});
        }
        if (!messages.length) continue;
        active.add(grid);
        const signature=JSON.stringify({language,messages});
        const previous=hints.get(grid);
        if (previous?.signature===signature && previous.node.isConnected) continue;
        previous?.node.remove();
        const note=document.createElement('div'); note.className='progenv-output-hints';
        for (const {file,result} of messages) {
          const line=document.createElement('p'); line.className='progenv-output-hint'; line.setAttribute('role','note');
          line.textContent=(messages.length>1 && file?file+': ':'')+result[language];
          line.title=result.detail[language];
          note.append(line);
        }
        grid.after(note); hints.set(grid,{node:note,signature});
      }
    }
    for (const [grid,entry] of hints) if (!active.has(grid) || !grid.isConnected) { entry.node.remove(); hints.delete(grid); }
  }
  const observer=new MutationObserver(changes=>{
    if (changes.every(change=>(change.target.nodeType===Node.ELEMENT_NODE?change.target:change.target.parentElement)?.closest('.progenv-output-hints'))) return;
    if (!queued) { queued=true; requestAnimationFrame(()=>{queued=false;scan();}); }
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  scan();
})();
