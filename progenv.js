(async () => {
  "use strict";
  const settings = await browser.storage.local.get(['siteEnabled','progenvCollapsed','progenvHiddenTopics','progenvTopicOrder','progenvTopicTasks']).catch(() => ({}));
  const {siteEnabled = {}} = settings;
  if (siteEnabled.progenv === false) return;
  if (document.getElementById('progenv-quick-style')) return;
  const model = globalThis.ProgenvSidebarModel;
  const origin = "https://progenv.inf.elte.hu";
  const locale = () => location.pathname.split('/')[1] === 'en' ? 'en' : 'hu';
  const translate = (hu,en) => locale() === 'hu' ? hu : en;
  const roots = new Map();
  const showTasks = (topic, preferences=taskVisibility) => typeof preferences[keyOf(topic.url)]==='boolean' ? preferences[keyOf(topic.url)] : Number.isFinite(topic.expiresAt);
  const preferenceMap = value => value && typeof value==='object' && !Array.isArray(value) ? value : {};
  let records = [], loading = false, loaded = false, lastAttempt = 0, pageURL = location.href;
  let controller = null, collapsed = preferenceMap(settings.progenvCollapsed), hiddenTopics = preferenceMap(settings.progenvHiddenTopics), errorText = "", generation = 0, pendingHide = null;
  let topicOrder=preferenceMap(settings.progenvTopicOrder), taskVisibility=preferenceMap(settings.progenvTopicTasks), preferenceError='';
  let pageLocale = locale();
  const style = document.createElement('style');
  style.id = 'progenv-quick-style';
  style.textContent = `
    .progenv-quick-courses { color:var(--sidebar-foreground,inherit); font:inherit; margin-top:8px; padding:8px 0 5px; border-top:1px solid var(--sidebar-border,#8884); min-width:0; }
    .progenv-quick-courses * { box-sizing:border-box; }
    .progenv-quick-courses details { margin:2px 0 5px; }
    .progenv-quick-courses summary { display:flex; align-items:center; gap:5px; min-height:32px; padding:5px 7px; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; list-style:none; user-select:none; -moz-user-select:none; }
    .progenv-quick-courses summary::-webkit-details-marker { display:none; }
    .progenv-quick-courses summary::before { content:''; width:7px; height:7px; margin:0 4px 0 1px; flex:none; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(-45deg); transform-origin:center; transition:transform .12s ease; }
    .progenv-quick-courses details[open] > summary::before { transform:rotate(45deg); }
    .progenv-quick-courses summary:hover,.progenv-quick-courses a:hover { background:var(--sidebar-accent,#8882); color:var(--sidebar-accent-foreground,inherit); }
    .progenv-quick-courses summary:focus-visible,.progenv-quick-courses a:focus-visible,.progenv-quick-courses button:focus-visible { outline:2px solid var(--sidebar-ring,#888); outline-offset:-2px; }
    .progenv-course-name { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .progenv-group-number { flex:0 1 auto; max-width:55%; text-align:right; overflow-wrap:anywhere; font-size:11px; font-weight:500; color:var(--muted-foreground,#888); }
    .progenv-topic-list { margin:2px 0 0; padding:0; border:0; list-style:none; }
    .progenv-topic-list > li[data-topic-key] { position:relative; }
    .progenv-topic-list > li[data-drop]::after { content:''; position:absolute; left:0; right:0; height:2px; background:var(--sidebar-ring,#94a3b8); pointer-events:none; }
    .progenv-topic-list > li[data-drop="before"]::after { top:0; }
    .progenv-topic-list > li[data-drop="after"]::after { bottom:0; }
    .progenv-topic-row[draggable="true"] { cursor:grab; }
    .progenv-topic-list > li[data-dragging] { opacity:.45; }
    #progenv-topic-menu { position:fixed; z-index:2147483647; min-width:180px; max-width:calc(100vw - 8px); padding:4px; border:1px solid var(--border,#8886); border-radius:7px; background:var(--popover,#171717); color:var(--popover-foreground,#eee); box-shadow:0 4px 16px #0005; font:13px/1.4 system-ui,sans-serif; }
    #progenv-topic-menu[hidden] { display:none!important; }
    #progenv-topic-menu button { display:block; width:100%; padding:7px 10px; border:0; border-radius:4px; background:transparent; color:inherit; text-align:left; font:inherit; cursor:pointer; }
    #progenv-topic-menu button:hover,#progenv-topic-menu button:focus-visible { background:var(--accent,#8883); outline:none; }
    .progenv-topic-row { display:flex; align-items:center; gap:6px; border-radius:5px; margin:1px 0; padding-right:5px; }
    .progenv-topic-row:hover,.progenv-topic-row:has([aria-current="page"]) { background:var(--sidebar-accent,#8882); }
    .progenv-quick-courses .progenv-topic { display:flex; flex:1; min-width:0; align-items:center; border-radius:5px; padding:6px 5px; text-decoration:none; color:inherit; }
    .progenv-topic-text { flex:1; min-width:0; }
    .progenv-quick-courses .progenv-topic:hover,.progenv-quick-courses .progenv-topic[aria-current="page"] { background:transparent; color:var(--sidebar-accent-foreground,inherit); }
    .progenv-topic-line { display:flex; gap:5px; align-items:flex-start; }
    .progenv-topic-name { flex:1; min-width:0; font-size:12px; line-height:1.35; overflow-wrap:anywhere; }
    .progenv-topic-meta { display:block; font-size:10px; line-height:1.4; color:var(--muted-foreground,#888); margin-top:2px; }
    .progenv-topic-score { position:relative; flex:none; width:38px; height:22px; border:0; text-align:center; font-size:11px; font-weight:500; line-height:1.4; font-family:inherit; padding:0; border-radius:4px; cursor:pointer; transition:width .18s ease; }
    .progenv-topic-score span { position:absolute; inset:0; display:grid; place-items:center; transition:opacity .12s ease; }
    .progenv-topic-score .progenv-hide-symbol { opacity:0; }
    .progenv-hide-symbol svg { display:block; width:14px; height:14px; }
    .progenv-topic-row:hover .progenv-topic-score,.progenv-topic-score:focus-visible { width:22px; }
    .progenv-topic-row:hover .progenv-score-value,.progenv-topic-score:focus-visible .progenv-score-value { opacity:0; }
    .progenv-topic-row:hover .progenv-hide-symbol,.progenv-topic-score:focus-visible .progenv-hide-symbol { opacity:1; }
    .progenv-topic-score[data-result="unknown"] { background:var(--sidebar-accent,#8882); color:inherit; }
    .progenv-topic-restore { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:5px 9px; border:1px solid var(--border,#8886); border-radius:6px; background:var(--secondary,#272727); color:var(--secondary-foreground,inherit); font:500 12px/1.4 system-ui,sans-serif; cursor:pointer; white-space:normal; }
    .progenv-topic-restore:hover { background:var(--accent,#8883); }
    .progenv-topic-restore:focus-visible { outline:2px solid var(--ring,#888); outline-offset:2px; }
    .progenv-restore-page { float:right; margin:4px 0 4px 16px; }
    .progenv-restore-card { margin:4px 10px 4px 0; }
    #progenv-hide-dialog { position:fixed; top:50%; left:50%; right:auto; bottom:auto; transform:translate(-50%,-50%); margin:0; box-sizing:border-box; width:420px; max-width:calc(100vw - 32px); max-height:calc(100dvh - 32px); overflow:auto; border:1px solid var(--border,#8886); border-radius:12px; padding:24px; background:var(--card,#171717); color:var(--card-foreground,#eee); font:14px/1.6 system-ui,sans-serif; }
    #progenv-hide-dialog::backdrop { background:#0008; }
    #progenv-hide-dialog h2 { font-size:18px; margin:0 0 12px; }
    #progenv-hide-dialog p { margin:0 0 20px; }
    #progenv-hide-dialog .progenv-dialog-actions { display:flex; justify-content:flex-end; gap:8px; }
    #progenv-hide-dialog button { font:inherit; padding:6px 12px; border:1px solid var(--border,#8886); border-radius:6px; background:var(--secondary,#272727); color:inherit; cursor:pointer; }
    #progenv-hide-dialog .progenv-confirm-hide { background:#b91c1c; color:white; }
    #progenv-hide-dialog [role="alert"] { color:#f87171; }
    @media(prefers-reduced-motion:reduce) { .progenv-topic-score,.progenv-topic-score span,.progenv-quick-courses summary::before { transition:none; } }
    .progenv-task-list { margin:0 0 5px; padding:0; list-style:none; }
    .progenv-quick-courses .progenv-task { display:block; padding:4px 7px 4px 18px; border-radius:5px; font-size:11px; line-height:1.4; color:inherit; text-decoration:none; overflow-wrap:anywhere; }
    .progenv-task[aria-current="page"] { background:var(--sidebar-accent,#8882); }
    .progenv-topic-score[data-result="complete"] { background:#86efac; color:#14532d; }
    .progenv-topic-score[data-result="incomplete"] { background:#fecaca; color:#7f1d1d; }
    .progenv-topic-score[data-result="partial"] { background:#fde68a; color:#713f12; }
    .progenv-quick-status { padding:5px 8px; color:var(--muted-foreground,#888); font-size:11px; line-height:1.4; }
    .progenv-quick-status:empty { display:none; }
    .progenv-quick-status button { display:block; padding:3px 0; cursor:pointer; color:inherit; background:none; border:0; text-decoration:underline; font:inherit; }
    [data-collapsible="icon"] .progenv-quick-courses { display:none; }
  `;
  document.head.append(style);
  function element(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function isLoggedOut() { return /\/(?:login|logout)(?:\/|$)/.test(location.pathname); }
  function contentAreas() { return [...document.querySelectorAll('[data-sidebar="content"]')]; }
  const keyOf = url => new URL(url,origin).pathname.replace(/^\/(?:hu|en)(?=\/)/,'').replace(/\/$/,'');
  const localized = url => { const target = new URL(url,origin); target.pathname = '/'+locale()+keyOf(url); return target.href; };
  const isHidden = topic => hiddenTopics[keyOf(topic.url)] === true;
  function orderedTopics(record) {
    const topics=model.sortTopics(record.topics);
    const saved=Array.isArray(topicOrder[record.key]) ? topicOrder[record.key] : [];
    const ranks=new Map(saved.map((key,index)=>[key,index]));
    return topics.sort((a,b)=>(ranks.get(keyOf(a.url)) ?? Infinity)-(ranks.get(keyOf(b.url)) ?? Infinity));
  }
  const keyed = (tag, cls, key, text) => { const node=element(tag,cls,text); node.dataset.key=key; return node; };
  // Reuse keyed nodes, including focused links/buttons, when data arrives or is refreshed.
  function reconcile(parent, desired) {
    const keyedNodes = new Map([...parent.children].filter(node=>node.dataset.key).map(node=>[node.dataset.key,node]));
    let cursor = parent.firstChild;
    for (const next of [...desired.childNodes]) {
      let node = next.nodeType === Node.ELEMENT_NODE && next.dataset.key ? keyedNodes.get(next.dataset.key) : cursor;
      if (!node || node.nodeType !== next.nodeType || node.nodeName !== next.nodeName ||
          (node.nodeType === Node.ELEMENT_NODE && node.dataset.key !== next.dataset.key)) node = next;
      if (node !== cursor) parent.insertBefore(node,cursor);
      if (node !== next) {
        if (node.nodeType === Node.TEXT_NODE) { if (node.data !== next.data) node.data=next.data; }
        else {
          for (const attribute of [...node.attributes]) if (!next.hasAttribute(attribute.name)) node.removeAttribute(attribute.name);
          for (const attribute of next.attributes) if (node.getAttribute(attribute.name)!==attribute.value) node.setAttribute(attribute.name,attribute.value);
          reconcile(node,next);
        }
      }
      cursor = node.nextSibling;
    }
    while (cursor) { const next=cursor.nextSibling; cursor.remove(); cursor=next; }
  }
  function draw(root) {
    const focused=root.contains(document.activeElement) ? document.activeElement : null;
    const desired = document.createElement('div');
    for (const record of records) {
      const details = keyed('details','',record.key);
      details.dataset.recordKey = record.key;
      details.open = !collapsed[record.key];
      const summary = element('summary');
      summary.title = record.courseName + (record.name ? ' · '+record.name : '');
      summary.append(element('span','progenv-course-name',record.courseName),element('span','progenv-group-number',record.label));
      details.append(summary);
      const list = element('ul','progenv-topic-list');
      for (const topic of orderedTopics(record).filter(topic=>!isHidden(topic))) {
        const topicKey = keyOf(topic.url);
        const item = keyed('li','',topicKey);
        item.dataset.topicKey=topicKey;
        const row = element('div','progenv-topic-row');
        row.draggable=true;
        const anchor = keyed('a','progenv-topic','topic'); anchor.href = localized(topic.url);
        anchor.draggable=false;
        if (keyOf(location.href) === topicKey) anchor.setAttribute('aria-current','page');
        anchor.title = [topic.name,topic.count,topic.deadline].filter(Boolean).join(' · ');
        const line = element('span','progenv-topic-line');
        line.append(element('span','progenv-topic-name',topic.name));
        const text = element('span','progenv-topic-text');
        text.append(line);
        const meta = [topic.count,topic.deadline].filter(Boolean).join(' · ');
        if (meta) text.append(element('span','progenv-topic-meta',meta));
        anchor.append(text);
        const score = keyed('button','progenv-topic-score','hide'); score.type='button';
        score.dataset.topicKey=topicKey;
        score.dataset.result = topic.score == null ? 'unknown' : topic.score === 100 ? 'complete' : topic.score === 0 ? 'incomplete' : 'partial';
        score.title = (topic.score == null ? '' : topic.score+'% · ')+translate('Elrejtés a bal oldalról','Hide from sidebar');
        score.setAttribute('aria-label',(topic.score == null ? '' : topic.score+'% · ')+translate('Elrejtés a bal oldalról: ','Hide from sidebar: ')+topic.name);
        const scoreLabel=element('span','progenv-score-value',topic.score == null ? '–' : topic.score+'%');
        const hideSymbol=element('span','progenv-hide-symbol');
        scoreLabel.setAttribute('aria-hidden','true'); hideSymbol.setAttribute('aria-hidden','true');
        const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
        icon.setAttribute('viewBox','0 0 16 16'); icon.setAttribute('fill','none'); icon.setAttribute('focusable','false');
        const cross=document.createElementNS('http://www.w3.org/2000/svg','path');
        cross.setAttribute('d','M4 4L12 12M12 4L4 12'); cross.setAttribute('stroke','currentColor');
        cross.setAttribute('stroke-width','1.75'); cross.setAttribute('stroke-linecap','round');
        icon.append(cross); hideSymbol.append(icon); score.append(scoreLabel,hideSymbol);
        // Native navigation preserves the site's own auth and content handling.
        row.append(anchor,score); item.append(row);
        if (showTasks(topic) && topic.tasks?.length) {
          const tasks = element('ul','progenv-task-list');
          for (const task of topic.tasks) {
            const taskItem = keyed('li','',keyOf(task.url)), link = element('a','progenv-task',task.name);
            link.href = localized(task.url);
            if (keyOf(location.href) === keyOf(task.url)) {
              link.setAttribute('aria-current','page');
              anchor.setAttribute('aria-current','page');
            }
            taskItem.append(link); tasks.append(taskItem);
          }
          item.append(tasks);
        }
        if (showTasks(topic) && topic.tasksError) {
          const status=element('div','progenv-quick-status',translate('A feladatlista most nem érhető el.','The task list is currently unavailable.'));
          const retry=element('button','progenv-task-retry',translate('Újrapróbálás','Retry')); retry.type='button'; retry.dataset.topicKey=topicKey;
          status.append(retry); item.append(status);
        }
        list.append(item);
      }
      if (!list.children.length) list.append(element('li','progenv-quick-status',record.topics.length ? translate('Minden témakör el van rejtve.','All topics are hidden.') : translate('Még nincs témakör.','No topics yet.')));
      details.append(list);
      desired.append(details);
    }
    const status = element('div','progenv-quick-status'); status.setAttribute('role','status');
    if (errorText) {
      status.append(document.createTextNode(errorText));
      const retry = element('button','',translate('Újrapróbálás','Retry')); retry.type = 'button';
      retry.className='progenv-refresh'; status.append(retry);
    } else if (loading && !loaded) status.textContent = translate('Kurzusok betöltése…','Loading courses…');
    else if (loaded && !records.length) status.textContent = translate('Nincs elérhető kurzus.','No available courses.');
    desired.append(status); reconcile(root,desired);
    if (preferenceError) {
      const alert=element('div','progenv-quick-status progenv-preference-error',preferenceError); alert.setAttribute('role','alert'); root.append(alert);
    }
    if (focused?.isConnected && focused.getClientRects().length && document.activeElement!==focused) focused.focus({preventScroll:true});
  }
  function redraw() { for (const root of roots.values()) draw(root); }
  let preferenceWrites=Promise.resolve();
  function writeTopicPreference(name,key,value) {
    const write=preferenceWrites.catch(()=>{}).then(async()=>{
      const stored=await browser.storage.local.get(name);
      const next={...preferenceMap(stored[name])}; next[key]=value;
      await browser.storage.local.set({[name]:next});
      return next;
    });
    preferenceWrites=write; return write;
  }
  async function moveTopic(recordKey,source,target,before) {
    const record=records.find(record=>record.key===recordKey);
    if (!record || source===target) return;
    const keys=orderedTopics(record).map(topic=>keyOf(topic.url));
    if (!keys.includes(source) || !keys.includes(target)) return;
    keys.splice(keys.indexOf(source),1);
    keys.splice(keys.indexOf(target)+(before?0:1),0,source);
    try {
      topicOrder=await writeTopicPreference('progenvTopicOrder',recordKey,keys);
      preferenceError='';
    } catch { preferenceError=translate('Nem sikerült menteni a sorrendet. Próbáld újra.','Could not save the topic order. Try again.'); }
    redraw();
  }
  let draggingTopic=null;
  function endTopicDrag() {
    draggingTopic=null;
    for (const root of roots.values()) for (const node of root.querySelectorAll('[data-drop],[data-dragging]')) {
      delete node.dataset.drop; delete node.dataset.dragging;
    }
  }
  const topicMenu=element('div','progenv-owned'); topicMenu.id='progenv-topic-menu'; topicMenu.hidden=true; topicMenu.setAttribute('role','menu');
  const taskToggle=element('button'); taskToggle.type='button'; taskToggle.setAttribute('role','menuitem'); topicMenu.append(taskToggle); document.body.append(topicMenu);
  let menuTopic=null;
  function closeTopicMenu(restoreFocus=false) {
    const previous=menuTopic; menuTopic=null; topicMenu.hidden=true;
    if (restoreFocus && previous?.anchor.isConnected) previous.anchor.focus({preventScroll:true});
  }
  function openTopicMenu(row,x,y) {
    const key=row.parentElement.dataset.topicKey, topic=matchingTopics(key)[0];
    if (!topic) return;
    menuTopic={key,anchor:row.querySelector('.progenv-topic')};
    taskToggle.textContent=showTasks(topic) ? translate('Feladatok elrejtése','Hide tasks') : translate('Feladatok megjelenítése','Show tasks');
    taskToggle.disabled=false;
    topicMenu.hidden=false;
    const box=topicMenu.getBoundingClientRect();
    topicMenu.style.left=Math.max(4,Math.min(x,innerWidth-box.width-4))+'px';
    topicMenu.style.top=Math.max(4,Math.min(y,innerHeight-box.height-4))+'px';
    taskToggle.focus();
  }
  taskToggle.addEventListener('click',async()=>{
    if (!menuTopic) return;
    const {key}=menuTopic, topic=matchingTopics(key)[0];
    if (!topic) {closeTopicMenu(true);return;}
    const visible=!showTasks(topic);
    closeTopicMenu(true);
    try {
      taskVisibility=await writeTopicPreference('progenvTopicTasks',key,visible);
      preferenceError=''; redraw();
      if (visible && (!Array.isArray(topic.tasks) || topic.tasksError)) await retryTasks(key);
    } catch {
      preferenceError=translate('Nem sikerült menteni a feladatlista beállítását. Próbáld újra.','Could not save task visibility. Try again.'); redraw();
    }
  });
  topicMenu.addEventListener('keydown',event=>{
    if (event.key==='Escape') {event.preventDefault();event.stopPropagation();closeTopicMenu(true);}
    else if (event.key==='Tab') closeTopicMenu(true);
    else if (['ArrowUp','ArrowDown','Home','End'].includes(event.key)) {event.preventDefault();taskToggle.focus();}
  });
  document.addEventListener('pointerdown',event=>{if(!topicMenu.contains(event.target)) closeTopicMenu();},true);
  window.addEventListener('resize',()=>closeTopicMenu());
  window.addEventListener('scroll',()=>closeTopicMenu(),true);
  window.addEventListener('blur',()=>{closeTopicMenu();endTopicDrag();});
  function addTopicControls(root) {
    root.addEventListener('contextmenu',event=>{
      const row=event.target.closest('.progenv-topic-row');
      if (!row) return;
      event.preventDefault();event.stopPropagation();
      const box=row.getBoundingClientRect();
      openTopicMenu(row,event.clientX || box.left,event.clientY || box.bottom);
    });
    root.addEventListener('keydown',event=>{
      const row=event.target.closest('.progenv-topic-row');
      if (!row) return;
      if (event.key==='ContextMenu' || event.shiftKey && event.key==='F10') {
        event.preventDefault();const box=row.getBoundingClientRect();openTopicMenu(row,box.left,box.bottom);
      } else if (event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) {
        const recordKey=row.closest('details').dataset.recordKey, record=records.find(record=>record.key===recordKey);
        if (!record) return;
        event.preventDefault();
        const keys=orderedTopics(record).filter(topic=>!isHidden(topic)).map(topic=>keyOf(topic.url));
        const source=row.parentElement.dataset.topicKey, target=keys[keys.indexOf(source)+(event.key==='ArrowUp'?-1:1)];
        if (target) moveTopic(recordKey,source,target,event.key==='ArrowUp');
      }
    });
    root.addEventListener('dragstart',event=>{
      const row=event.target.closest('.progenv-topic-row');
      if (!row) return;
      if (event.target.closest('button')) {event.preventDefault();return;}
      closeTopicMenu();
      draggingTopic={recordKey:row.closest('details').dataset.recordKey,key:row.parentElement.dataset.topicKey};
      event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('application/x-elte-extras-topic',draggingTopic.key);
      row.parentElement.dataset.dragging='true';
    });
    root.addEventListener('dragover',event=>{
      const item=event.target.closest('li[data-topic-key]');
      for (const node of root.querySelectorAll('[data-drop]')) delete node.dataset.drop;
      if (!draggingTopic || !item || item.closest('details').dataset.recordKey!==draggingTopic.recordKey || item.dataset.topicKey===draggingTopic.key) return;
      event.preventDefault();event.dataTransfer.dropEffect='move';
      const box=item.querySelector('.progenv-topic-row').getBoundingClientRect();
      item.dataset.drop=event.clientY<box.top+box.height/2?'before':'after';
    });
    root.addEventListener('drop',event=>{
      if (!draggingTopic) return;
      event.preventDefault();event.stopPropagation();
      const item=event.target.closest('li[data-topic-key]'), source=draggingTopic;
      if (item?.dataset.drop && item.closest('details').dataset.recordKey===source.recordKey) moveTopic(source.recordKey,source.key,item.dataset.topicKey,item.dataset.drop==='before');
      endTopicDrag();
    });
    root.addEventListener('dragend',endTopicDrag);
    root.addEventListener('dragleave',event=>{
      if (!root.contains(event.relatedTarget)) for (const node of root.querySelectorAll('[data-drop]')) delete node.dataset.drop;
    });
  }
  function mount() {
    for (const [area,root] of roots) if (!area.isConnected) { root.remove(); roots.delete(area); }
    if (isLoggedOut()) {
      closeTopicMenu(); endTopicDrag();
      ++generation; controller?.abort(); loading = false; records = []; loaded = false;
      for (const root of roots.values()) root.remove(); roots.clear();
      return;
    }
    for (const area of contentAreas()) {
      const link = [...area.querySelectorAll('a[href]')].find(a => /\/(?:hu\/|en\/)?courses\/?$/.test(new URL(a.href).pathname));
      if (!link) continue;
      let root = roots.get(area);
      if (!root) {
        root = element('section','progenv-quick-courses'); root.dataset.progenvQuickCourses = '';
        root.setAttribute('aria-label',translate('Kurzusok témakörei','Course topics'));
        root.addEventListener('toggle',event=>{
          const details=event.target, key=details.dataset.recordKey;
          if (!key || !details.isConnected || Boolean(collapsed[key])===!details.open) return;
          if (details.open) delete collapsed[key]; else collapsed[key]=true;
          browser.storage.local.set({progenvCollapsed:{...collapsed}}).catch(()=>{});
          for (const other of roots.values()) if (other!==root) draw(other);
        },true);
        root.addEventListener('click',event=>{
          const button=event.target.closest('button');
          if (!button) return;
          if (button.classList.contains('progenv-topic-score')) askHide(button.dataset.topicKey);
          if (button.classList.contains('progenv-refresh')) refresh();
          if (button.classList.contains('progenv-task-retry')) retryTasks(button.dataset.topicKey);
        });
        addTopicControls(root);
        roots.set(area,root); draw(root);
      }
      const navigation = link.closest('[data-sidebar="menu"]') || link.closest('ul');
      if (navigation && navigation.nextElementSibling !== root) navigation.after(root);
      else if (!navigation && !root.isConnected) area.append(root);
    }
    if (roots.size && !loaded && !loading && Date.now()-lastAttempt > 30000) refresh();
    mountRestoreButtons();
  }
  const dialog=element('dialog','progenv-owned'); dialog.id='progenv-hide-dialog';
  dialog.setAttribute('aria-labelledby','progenv-hide-title');
  const dialogTitle=element('h2'); dialogTitle.id='progenv-hide-title';
  const dialogText=element('p');
  const dialogError=element('p'); dialogError.setAttribute('role','alert'); dialogError.hidden=true;
  const actions=element('div','progenv-dialog-actions');
  const cancelHide=element('button'), confirmHide=element('button','progenv-confirm-hide');
  cancelHide.type=confirmHide.type='button';
  actions.append(cancelHide,confirmHide); dialog.append(dialogTitle,dialogText,dialogError,actions); document.body.append(dialog);
  function askHide(key) {
    pendingHide=key;
    dialog.lang=locale();
    dialogTitle.textContent=translate('Feladat elrejtése','Hide topic');
    dialogText.textContent=translate('Biztosan el akarod rejteni ezt a feladatot a ball oldalról? Később a feladaton lévő gombbal újra megjelenítheted itt.','Are you sure you want to hide this topic from the sidebar? You can show it here again later using the button on its card or page.');
    cancelHide.textContent=translate('Mégse','Cancel'); confirmHide.textContent=translate('Elrejtés','Hide');
    dialogError.hidden=true;
    dialog.showModal(); cancelHide.focus();
  }
  let savingHidden=false;
  let backdropPress=false;
  const outsideDialog=event=>{const box=dialog.getBoundingClientRect();return event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom;};
  dialog.addEventListener('pointerdown',event=>{backdropPress=event.target===dialog && outsideDialog(event);});
  dialog.addEventListener('click',event=>{if(backdropPress && !savingHidden && event.target===dialog && outsideDialog(event)) dialog.close(); backdropPress=false;});
  cancelHide.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',event=>{if(savingHidden) event.preventDefault();});
  async function setHidden(key, hidden) {
    const settings=await browser.storage.local.get('progenvHiddenTopics');
    const next={...(settings.progenvHiddenTopics || hiddenTopics)};
    if (hidden) next[key]=true; else delete next[key];
    await browser.storage.local.set({progenvHiddenTopics:next});
    hiddenTopics=next; redraw(); mountRestoreButtons();
  }
  confirmHide.addEventListener('click',async()=>{
    if (savingHidden || !pendingHide) return;
    savingHidden=true; confirmHide.disabled=cancelHide.disabled=true;
    try {
      await setHidden(pendingHide,true); dialog.close();
      [...roots.values()][0]?.querySelector('summary')?.focus();
    } catch {
      dialogError.textContent=translate('Nem sikerült menteni. Próbáld újra.','Could not save. Try again.'); dialogError.hidden=false;
    } finally { savingHidden=false; confirmHide.disabled=cancelHide.disabled=false; }
  });
  function mountRestoreButtons() {
    const wanted=new Set();
    function add(parent,before,key,kind) {
      if (!parent || !hiddenTopics[key]) return;
      let button=[...parent.children].find(node=>node.matches('.progenv-topic-restore') && node.dataset.topicKey===key);
      if (!button) { button=element('button','progenv-topic-restore progenv-owned progenv-restore-'+kind); button.type='button'; button.dataset.topicKey=key; parent.insertBefore(button,before); }
      const label=translate('Megjelenítés a bal oldalon','Show in sidebar');
      if (!button.disabled && button.textContent!==label) button.textContent=label;
      wanted.add(button);
    }
    if (!isLoggedOut()) {
      for (const card of document.querySelectorAll('main [data-slot="card"]')) {
        const link=[...card.querySelectorAll('a[href]')].find(anchor=>model.route(anchor.href,location.href,locale())?.topicId);
        if (!link) continue;
        const score=card.querySelector('[aria-label^="Score "]');
        add(score?.parentElement || card,score || null,keyOf(link.href),'card');
      }
      const current=model.route(location.href,location.href,locale());
      if (current?.topicId) add(document.querySelector('main h1'),null,keyOf(current.url),'page');
    }
    for (const button of document.querySelectorAll('.progenv-topic-restore')) if (!wanted.has(button)) button.remove();
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest?.('.progenv-topic-restore');
    if (!button || button.disabled) return;
    event.preventDefault(); event.stopPropagation(); button.disabled=true;
    const key=button.dataset.topicKey;
    try {
      await setHidden(key,false);
      const restored=[...document.querySelectorAll('.progenv-topic')].find(link=>keyOf(link.href)===key);
      restored?.closest('details')?.setAttribute('open',''); restored?.focus();
      retryTasks(key);
    } catch {
      button.disabled=false; button.textContent=translate('Nem sikerült. Újrapróbálás','Failed. Retry');
    }
  },true);
  function authError() { const error=new Error(translate('Jelentkezz be a Progenv oldalon.','Sign in to Progenv.')); error.auth=true; return error; }
  async function readPage(url, signal, depth = 0) {
    const target = new URL(url,origin);
    if (target.origin !== origin) throw new Error('Invalid course origin');
    // A timeout belongs to one request, so one slow page cannot starve later topics.
    const requestController=new AbortController();
    const abort=()=>requestController.abort(signal.reason);
    if (signal.aborted) abort(); else signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>requestController.abort(new DOMException('Request timed out','TimeoutError')),15000);
    try {
    const response = await fetch(target.href,{credentials:'same-origin',headers:{Accept:'text/html'},signal:requestController.signal});
    if (response.status === 401 || response.status === 403) throw authError();
    if (!response.ok) throw new Error(translate('A kurzusok nem érhetők el.','Courses are unavailable.')+` (HTTP ${response.status})`);
    const resolved = new URL(response.url || target.href);
    if (resolved.origin !== origin || /\/login(?:\/|$)/.test(resolved.pathname)) throw authError();
    const doc = new DOMParser().parseFromString(await response.text(),'text/html');
    if (doc.querySelector('input[type="password"]')) throw authError();
    // Next.js can emit a streaming redirect as an HTML meta refresh.
    const redirect = doc.querySelector('meta[http-equiv="refresh" i]')?.getAttribute('content')?.match(/url\s*=\s*(.+)$/i)?.[1]?.replace(/^["']|["']$/g,'');
    if (redirect && depth < 2) {
      const next = model.route(redirect,resolved.href,locale());
      if (next) return await readPage(next.url,signal,depth+1);
    }
    return {doc,url:resolved.href};
    } finally { clearTimeout(timer); signal.removeEventListener('abort',abort); }
  }
  async function parallel(items,work,signal) {
    let next=0;
    await Promise.all(Array.from({length:Math.min(3,items.length)},async()=>{
      while (next<items.length && !signal.aborted) await work(items[next++]);
    }));
  }
  function matchingTopics(key) { return records.flatMap(record=>record.topics).filter(topic=>keyOf(topic.url)===key); }
  async function loadTasks(topic,mine,lang,signal) {
    let tasks, tasksError=false;
    try { const page=await readPage(localized(topic.url),signal); tasks=model.tasks(page.doc,page.url,lang); }
    catch(error) { if (error.auth) throw error; tasksError=true; }
    if (mine!==generation || signal.aborted) return;
    for (const entry of matchingTopics(keyOf(topic.url))) {
      if (tasks) entry.tasks=tasks;
      entry.tasksError=tasksError;
    }
    redraw();
  }
  const retrying=new Set();
  async function retryTasks(key) {
    const topic=matchingTopics(key)[0];
    if (!topic || !showTasks(topic) || isHidden(topic) || retrying.has(key)) return;
    retrying.add(key);
    try { await loadTasks(topic,generation,locale(),controller?.signal || new AbortController().signal); }
    catch(error) { if (error.auth) { ++generation; controller?.abort(); loading=false; records=[]; loaded=false; errorText=error.message; redraw(); } }
    finally { retrying.delete(key); }
  }
  async function refresh() {
    if (loading || isLoggedOut()) return;
    loading = true; lastAttempt = Date.now(); errorText = ''; redraw();
    const mine = ++generation; controller?.abort(); controller = new AbortController();
    try {
      const lang = locale(), signal = controller.signal;
      const page = await readPage(`${origin}/${lang}/courses`,signal);
      const courses = model.courses(page.doc,page.url,lang);
      const previous=records, results=new Map(), groupJobs=[];
      let failures=0;
      const keepPrevious=(courseId,groupId)=>previous.filter(record=>record.courseId===courseId && (!groupId || record.groupId===groupId));
      function failed(error,courseId,groupId) {
        if (error.auth) throw error;
        failures++;
        for (const record of keepPrevious(courseId,groupId)) results.set(record.key,record);
      }
      await parallel(courses,async course=>{
        try {
          const page=await readPage(course.url,signal);
          const direct=model.group(page.doc,page.url,lang,course);
          if (direct) results.set(direct.key,direct);
          else {
            const groups=model.groups(page.doc,page.url,lang,course.courseId);
            if (!groups.length) throw new Error('No readable groups');
            for (const item of groups) groupJobs.push({course,item});
          }
        } catch(error) { failed(error,course.courseId); }
      },signal);
      await parallel(groupJobs,async({course,item})=>{
        try {
          const page=await readPage(item.url,signal);
          const record=model.group(page.doc,page.url,lang,course,item);
          if (!record) throw new Error('No readable group');
          results.set(record.key,record);
        } catch(error) { failed(error,course.courseId,item.groupId); }
      },signal);
      if (mine !== generation) return;
      // Preserve course/group order regardless of which requests finish first.
      const order=new Map(courses.map((course,index)=>[course.courseId,index]));
      records=[...results.values()].sort((a,b)=>(order.get(a.courseId)-order.get(b.courseId)) || Number(a.groupId)-Number(b.groupId));
      const previousTopics=new Map(previous.flatMap(record=>record.topics).map(topic=>[keyOf(topic.url),topic]));
      for (const record of records) for (const topic of record.topics) {
        const old=previousTopics.get(keyOf(topic.url));
        if (old?.tasks) topic.tasks=old.tasks;
      }
      loaded=true;
      if (failures) errorText=translate('Néhány kurzus vagy csoport nem tölthető be.','Some courses or groups could not be loaded.');
      redraw();
      // Course-level topics can occur in several groups. Fetch each page once,
      // with bounded concurrency, and keep topics usable if a task page fails.
      const topics = [...new Map(records.flatMap(record => record.topics).filter(topic=>showTasks(topic) && !isHidden(topic)).map(topic => [keyOf(topic.url),topic])).values()];
      await parallel(topics,topic=>loadTasks(topic,mine,lang,signal),signal);
    } catch (error) {
      if (mine !== generation) return;
      if (error.auth) { controller.abort(); records=[]; loaded=false; }
      errorText = ['AbortError','TimeoutError'].includes(error.name) ? translate('A Progenv nem válaszolt időben.','Progenv did not respond in time.') : error.message;
    } finally {
      if (mine === generation) { loading = false; redraw(); }
    }
  }
  let queued = false;
  const observer = new MutationObserver(changes => {
    if (changes.every(change => change.target.closest?.('.progenv-quick-courses,.progenv-owned') ||
      [...change.addedNodes,...change.removedNodes].length && [...change.addedNodes,...change.removedNodes].every(node=>node.nodeType===Node.ELEMENT_NODE && node.matches('.progenv-owned')))) return;
    if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; mount(); }); }
  });
  // Hydration can add sidebar attributes without inserting any child nodes.
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sidebar','href']}); mount();
  setInterval(() => {
      if (location.href !== pageURL) {
        closeTopicMenu(); endTopicDrag();
        pageURL=location.href;
        if (locale()!==pageLocale) {
          pageLocale=locale(); ++generation; controller?.abort(); loading=false; loaded=false; lastAttempt=0;
        }
        mount(); redraw(); window.dispatchEvent(new Event('progenv-route-change'));
      }
      if (!roots.size) mount();
      if (roots.size && document.visibilityState === 'visible' && Date.now()-lastAttempt > 300000) refresh();
  },1000);
  browser.storage.onChanged?.addListener((changes,area)=>{
    if (area!=='local') return;
    if (changes.progenvHiddenTopics) { hiddenTopics=changes.progenvHiddenTopics.newValue || {}; redraw(); mountRestoreButtons(); }
    if (changes.progenvCollapsed) { collapsed=changes.progenvCollapsed.newValue || {}; redraw(); }
    if (changes.progenvTopicOrder) { topicOrder=preferenceMap(changes.progenvTopicOrder.newValue); redraw(); }
    if (changes.progenvTopicTasks) {
      const previous=taskVisibility; taskVisibility=preferenceMap(changes.progenvTopicTasks.newValue); redraw();
      const topics=new Map(records.flatMap(record=>record.topics).map(topic=>[keyOf(topic.url),topic]));
      for (const [key,topic] of topics) if (showTasks(topic) && !showTasks(topic,previous) && !Array.isArray(topic.tasks)) retryTasks(key);
    }
  });
})();
