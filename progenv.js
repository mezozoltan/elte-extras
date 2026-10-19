(() => {
  "use strict";
  const model = globalThis.ProgenvSidebarModel;
  const origin = "https://progenv.inf.elte.hu";
  const locale = () => location.pathname.split('/')[1] === 'en' ? 'en' : 'hu';
  const translate = (hu,en) => locale() === 'hu' ? hu : en;
  const roots = new Map();
  const showTasks = topic => Number.isFinite(topic.expiresAt);
  let records = [], loading = false, loaded = false, lastAttempt = 0, pageURL = location.href;
  let controller = null, collapsed = {}, errorText = "", generation = 0;
  const style = document.createElement('style');
  style.textContent = `
    .progenv-quick-courses { color:var(--sidebar-foreground,inherit); font:inherit; margin-top:8px; padding:8px 0 5px; border-top:1px solid var(--sidebar-border,#8884); min-width:0; }
    .progenv-quick-courses * { box-sizing:border-box; }
    .progenv-quick-courses details { margin:2px 0 5px; }
    .progenv-quick-courses summary { display:flex; align-items:center; gap:5px; min-height:32px; padding:5px 7px; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; list-style:none; }
    .progenv-quick-courses summary::-webkit-details-marker { display:none; }
    .progenv-quick-courses summary::before { content:''; width:7px; height:7px; margin:0 4px 0 1px; flex:none; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(-45deg); transform-origin:center; transition:transform .12s ease; }
    .progenv-quick-courses details[open] > summary::before { transform:rotate(45deg); }
    .progenv-quick-courses summary:hover,.progenv-quick-courses a:hover { background:var(--sidebar-accent,#8882); color:var(--sidebar-accent-foreground,inherit); }
    .progenv-quick-courses summary:focus-visible,.progenv-quick-courses a:focus-visible,.progenv-quick-courses button:focus-visible { outline:2px solid var(--sidebar-ring,#888); outline-offset:-2px; }
    .progenv-course-name { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .progenv-group-number { flex:0 1 auto; max-width:55%; text-align:right; overflow-wrap:anywhere; font-size:11px; font-weight:500; color:var(--muted-foreground,#888); }
    .progenv-topic-list { margin:2px 0 0; padding:0; border:0; list-style:none; }
    .progenv-quick-courses .progenv-topic { display:flex; align-items:center; gap:6px; border-radius:5px; padding:6px 5px; margin:1px 0; text-decoration:none; color:inherit; }
    .progenv-topic-text { flex:1; min-width:0; }
    .progenv-quick-courses .progenv-topic[aria-current="page"] { background:var(--sidebar-accent,#8882); color:var(--sidebar-accent-foreground,inherit); }
    .progenv-topic-line { display:flex; gap:5px; align-items:flex-start; }
    .progenv-topic-name { flex:1; min-width:0; font-size:12px; line-height:1.35; overflow-wrap:anywhere; }
    .progenv-topic-meta { display:block; font-size:10px; line-height:1.4; color:var(--muted-foreground,#888); margin-top:2px; }
    .progenv-topic-score { flex:none; min-width:38px; text-align:center; font-size:11px; font-weight:500; line-height:1.4; padding:3px 5px; border-radius:4px; }
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
  function draw(root) {
    root.replaceChildren();
    for (const record of records) {
      const details = element('details');
      details.open = !collapsed[record.key];
      const summary = element('summary');
      summary.title = record.courseName + (record.name ? ' · '+record.name : '');
      summary.append(element('span','progenv-course-name',record.courseName),element('span','progenv-group-number',record.label));
      details.append(summary);
      const list = element('ul','progenv-topic-list');
      for (const topic of model.sortTopics(record.topics)) {
        const item = element('li');
        const anchor = element('a','progenv-topic'); anchor.href = topic.url;
        const current = model.route(location.href,location.href,locale());
        if (current?.topicId && current.url === topic.url) anchor.setAttribute('aria-current','page');
        anchor.title = [topic.name,topic.count,topic.deadline].filter(Boolean).join(' · ');
        const line = element('span','progenv-topic-line');
        line.append(element('span','progenv-topic-name',topic.name));
        const text = element('span','progenv-topic-text');
        text.append(line);
        const meta = [topic.count,topic.deadline].filter(Boolean).join(' · ');
        if (meta) text.append(element('span','progenv-topic-meta',meta));
        anchor.append(text);
        if (topic.score != null) {
          const score = element('span','progenv-topic-score',topic.score+'%');
          score.dataset.result = topic.score === 100 ? 'complete' : topic.score === 0 ? 'incomplete' : 'partial';
          score.setAttribute('aria-label',translate('Teljesítés: ','Completion: ')+topic.score+'%');
          anchor.append(score);
        }
        // Native navigation preserves the site's own auth and content handling.
        item.append(anchor);
        if (showTasks(topic) && topic.tasks?.length) {
          const tasks = element('ul','progenv-task-list');
          for (const task of topic.tasks) {
            const taskItem = element('li'), link = element('a','progenv-task',task.name);
            link.href = task.url;
            if (new URL(location.href).pathname === new URL(task.url).pathname) {
              link.setAttribute('aria-current','page');
              anchor.setAttribute('aria-current','page');
            }
            taskItem.append(link); tasks.append(taskItem);
          }
          item.append(tasks);
        }
        if (showTasks(topic) && topic.tasksError) item.append(element('div','progenv-quick-status',translate('A feladatlista most nem érhető el.','The task list is currently unavailable.')));
        list.append(item);
      }
      if (!record.topics.length) list.append(element('li','progenv-quick-status',translate('Még nincs témakör.','No topics yet.')));
      details.append(list);
      details.addEventListener('toggle',() => {
        if (!details.isConnected) return;
        const isCollapsed = !details.open;
        if (Boolean(collapsed[record.key]) === isCollapsed) return;
        if (isCollapsed) collapsed[record.key] = true; else delete collapsed[record.key];
        browser.storage.local.set({progenvCollapsed:collapsed}).catch(() => {});
        for (const otherRoot of roots.values()) {
          if (otherRoot !== root) draw(otherRoot);
        }
      });
      root.append(details);
    }
    const status = element('div','progenv-quick-status'); status.setAttribute('role','status');
    if (errorText) {
      status.append(document.createTextNode(errorText));
      const retry = element('button','',translate('Újrapróbálás','Retry')); retry.type = 'button';
      retry.addEventListener('click',() => refresh()); status.append(retry);
    } else if (loading && !loaded) status.textContent = translate('Kurzusok betöltése…','Loading courses…');
    else if (loaded && !records.length) status.textContent = translate('Nincs elérhető kurzus.','No available courses.');
    root.append(status);
  }
  function redraw() { for (const root of roots.values()) draw(root); }
  function mount() {
    for (const [area,root] of roots) if (!area.isConnected) { root.remove(); roots.delete(area); }
    if (isLoggedOut()) {
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
        roots.set(area,root); draw(root);
      }
      const navigation = link.closest('[data-sidebar="menu"]') || link.closest('ul');
      if (navigation && navigation.nextElementSibling !== root) navigation.after(root);
      else if (!navigation && !root.isConnected) area.append(root);
    }
    if (roots.size && !loaded && !loading && Date.now()-lastAttempt > 30000) refresh();
  }
  async function readPage(url, signal, depth = 0) {
    const target = new URL(url,origin);
    if (target.origin !== origin) throw new Error('Invalid course origin');
    const response = await fetch(target.href,{credentials:'same-origin',headers:{Accept:'text/html'},signal});
    if (response.status === 401 || response.status === 403) throw new Error(translate('Jelentkezz be a Progenv oldalon.','Sign in to Progenv.'));
    if (!response.ok) throw new Error(translate('A kurzusok nem érhetők el.','Courses are unavailable.')+` (HTTP ${response.status})`);
    const resolved = new URL(response.url || target.href);
    if (resolved.origin !== origin || /\/login(?:\/|$)/.test(resolved.pathname)) throw new Error(translate('Jelentkezz be a Progenv oldalon.','Sign in to Progenv.'));
    const doc = new DOMParser().parseFromString(await response.text(),'text/html');
    if (doc.querySelector('input[type="password"]')) throw new Error(translate('Jelentkezz be a Progenv oldalon.','Sign in to Progenv.'));
    // Next.js can emit a streaming redirect as an HTML meta refresh.
    const redirect = doc.querySelector('meta[http-equiv="refresh" i]')?.getAttribute('content')?.match(/url\s*=\s*(.+)$/i)?.[1]?.replace(/^["']|["']$/g,'');
    if (redirect && depth < 2) {
      const next = model.route(redirect,resolved.href,locale());
      if (next) return readPage(next.url,signal,depth+1);
    }
    return {doc,url:resolved.href};
  }
  async function refresh() {
    if (loading || isLoggedOut()) return;
    loading = true; lastAttempt = Date.now(); errorText = ''; redraw();
    const mine = ++generation; controller?.abort(); controller = new AbortController();
    const currentController = controller;
    const timer = setTimeout(() => currentController.abort(),30000);
    try {
      const lang = locale(), signal = controller.signal;
      const page = await readPage(`${origin}/${lang}/courses`,signal);
      const courses = model.courses(page.doc,page.url,lang);
      const result = [];
      for (const course of courses) {
        const page = await readPage(course.url,signal);
        const direct = model.group(page.doc,page.url,lang,course);
        if (direct) result.push(direct);
        else {
          const groups = model.groups(page.doc,page.url,lang,course.courseId);
          for (const item of groups) {
            const groupPage = await readPage(item.url,signal);
            const record = model.group(groupPage.doc,groupPage.url,lang,course,item);
            if (record) result.push(record);
          }
          if (!groups.length) throw new Error(translate('A csoportlista nem olvasható ezen a kurzuson.','The group list could not be read for this course.'));
        }
      }
      if (mine !== generation) return;
      records = [...new Map(result.map(record => [record.key,record])).values()]; loaded = true;
      redraw();
      // Course-level topics can occur in several groups. Fetch each page once,
      // with bounded concurrency, and keep topics usable if a task page fails.
      const topics = [...new Map(records.flatMap(record => record.topics).filter(showTasks).map(topic => [topic.url,topic])).values()];
      let next = 0;
      await Promise.all(Array.from({length:Math.min(3,topics.length)},async () => {
        while (next < topics.length && mine === generation && !signal.aborted) {
          const topic = topics[next++];
          let tasks = [], tasksError = false;
          try {
            const page = await readPage(topic.url,signal);
            tasks = model.tasks(page.doc,page.url,lang);
          } catch { tasksError = true; }
          if (mine !== generation) return;
          for (const record of records) for (const entry of record.topics) {
            if (entry.url === topic.url) Object.assign(entry,{tasks,tasksError});
          }
          redraw();
        }
      }));
    } catch (error) {
      if (mine !== generation) return;
      records = []; loaded = false;
      errorText = error.name === 'AbortError' ? translate('A Progenv nem válaszolt időben.','Progenv did not respond in time.') : error.message;
    } finally {
      clearTimeout(timer);
      if (mine === generation) { loading = false; redraw(); }
    }
  }
  let queued = false;
  const observer = new MutationObserver(changes => {
    if (changes.every(change => change.target.closest?.('.progenv-quick-courses'))) return;
    if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; mount(); }); }
  });
  browser.storage.local.get('progenvCollapsed').then(settings => {
    if (settings.progenvCollapsed && typeof settings.progenvCollapsed === 'object') collapsed = settings.progenvCollapsed;
  }).catch(() => {}).finally(() => {
    observer.observe(document.body,{childList:true,subtree:true}); mount();
    setInterval(() => {
      if (location.href !== pageURL) { pageURL = location.href; mount(); redraw(); }
      if (roots.size && document.visibilityState === 'visible' && Date.now()-lastAttempt > 300000) refresh();
    },1000);
  });
})();
