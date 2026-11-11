(async () => {
  'use strict';
  const loginURL = 'https://klettner.web.elte.hu/Downloads/progptin/login.txt';
  const search = document.querySelector('#masthead #bar > #searchicon');
  // Only show the status on course pages that use this protected login endpoint.
  if (!search || !Array.from(document.querySelectorAll('.entry-content a[href]')).some(link => link.href === loginURL)) return;
  const {siteEnabled = {}} = await browser.storage.local.get('siteEnabled').catch(() => ({}));
  if (siteEnabled.klettner === false || document.getElementById('elte-extras-klettner-login')) return;

  const style = document.createElement('style');
  style.textContent = `
    #masthead #bar:has(> #elte-extras-klettner-login:not([hidden])) { display:flex; align-items:flex-start; }
    #masthead #bar > #elte-extras-klettner-login:not([hidden]) + #searchicon { position:static; }
    #elte-extras-klettner-login { flex:none; align-self:center; margin:0 12px 0 auto; }
    #elte-extras-klettner-login[hidden] { display:none!important; }
    #elte-extras-klettner-login > :is(a,span) {
      display:inline-block; padding:11px 17px; border-radius:0; background:#b14437;
      color:#fff; font:600 14px/1.4 system-ui,sans-serif; text-decoration:none; text-transform:uppercase;
    }
    #elte-extras-klettner-login > a:hover { background:#96392e; color:#fff; }
    #elte-extras-klettner-login > a:focus-visible { outline:2px solid #fff; outline-offset:2px; }
    #elte-extras-klettner-dialog {
      position:fixed; inset:0; margin:auto; padding:0; box-sizing:border-box;
      width:min(410px,calc(100vw - 24px)); height:min(450px,calc(100dvh - 24px));
      border:0; border-radius:0; background:#fff; overflow:hidden;
    }
    #elte-extras-klettner-dialog::backdrop { background:#0009; }
    #elte-extras-klettner-dialog iframe { display:block; width:100%; height:100%; border:0; }
    #elte-extras-slide-viewer {
      --slide-ratio:1.333333; --toolbar-height:36px;
      position:fixed; inset:0; margin:auto; padding:0; box-sizing:border-box;
      width:min(calc(100vw - 24px),calc((100dvh - 24px - var(--toolbar-height)) * var(--slide-ratio)));
      height:fit-content; max-width:none; max-height:none; overflow:hidden;
      border:0; background:#33363b; color:#fff; font-size:14px; line-height:1.4;
    }
    #elte-extras-slide-viewer::backdrop { background:#000c; }
    #elte-extras-slide-viewer .elte-slide-toolbar {
      display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:8px;
      height:var(--toolbar-height); box-sizing:border-box; padding:0 8px; background:#705241;
    }
    #elte-extras-slide-viewer .elte-slide-toolbar strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #elte-extras-slide-viewer .elte-slide-navigation { display:flex; align-items:center; gap:6px; }
    #elte-extras-slide-viewer :is(button,input) {
      appearance:none; color:inherit; background:#b14437; border:0; border-radius:0; box-shadow:none;
      text-shadow:none; font:inherit; height:28px; padding:0 7px; box-sizing:border-box;
    }
    #elte-extras-slide-viewer button:enabled { cursor:pointer; }
    #elte-extras-slide-viewer button:enabled:hover { background:#96392e; }
    #elte-extras-slide-viewer button:disabled { opacity:.45; }
    #elte-extras-slide-viewer input { width:5ch; text-align:center; background:#33363b; }
    #elte-extras-slide-viewer :is(button,input):focus-visible { outline:2px solid #fff; outline-offset:1px; }
    #elte-extras-slide-viewer .elte-slide-stage {
      position:relative; display:grid; place-items:center; aspect-ratio:var(--slide-ratio);
    }
    #elte-extras-slide-viewer .elte-slide-stage img {
      position:absolute; width:100%; height:100%; object-fit:contain; border:0; padding:0; margin:0;
    }
    #elte-extras-slide-viewer .elte-slide-stage p { position:relative; margin:0; }
    @media(max-width:767px) {
      #elte-extras-klettner-login { align-self:flex-start; margin-top:8px; margin-right:6px; }
      #elte-extras-klettner-login > :is(a,span) { padding-inline:12px; }
    }
  `;
  document.head.append(style);
  const slot = document.createElement('div');
  slot.id = 'elte-extras-klettner-login';
  slot.setAttribute('aria-live','polite');
  slot.hidden = true;
  search.before(slot);

  const dialog = document.createElement('dialog');
  dialog.id = 'elte-extras-klettner-dialog';
  dialog.setAttribute('aria-label','ELTE központi bejelentkezés');
  document.body.append(dialog);
  dialog.addEventListener('click',event=>{
    if (event.target === dialog) dialog.close();
  });
  let frame = null;
  dialog.addEventListener('close',()=>{
    if (dialog.open) return;
    frame?.remove();
    frame = null;
  });

  function isNormalClick(event) {
    return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
  }

  function openLogin() {
    if (dialog.open) return;
    frame?.remove();
    const loginFrame = document.createElement('iframe');
    loginFrame.title = 'ELTE központi bejelentkezés';
    loginFrame.addEventListener('load',async()=>{
      // The identity provider is cross-origin. Only react once it returns to
      // the original site's login file, and verify with our own session check.
      try {
        if (loginFrame.contentWindow.location.href !== loginURL) return;
      } catch { return; }
      if (checking) await checking;
      if (dialog.open && frame === loginFrame) await refresh(true);
    });
    loginFrame.src = loginURL;
    frame = loginFrame;
    dialog.append(loginFrame);
    dialog.showModal();
  }

  function openSlides(link) {
    const group = link.dataset.slbGroup;
    const links = Array.from(link.closest('.entry-content').querySelectorAll('a[href]'))
      .filter(page=>isSlide(page) && page.dataset.slbGroup === group);
    // The site labels each deck on its first link and groups all slides on the page.
    let deckTitle = 'Diák';
    const pages = links.map(page=>{
      deckTitle = page.textContent.trim() || deckTitle;
      return {url:page.href, title:deckTitle};
    });

    const viewer = document.createElement('dialog');
    viewer.id = 'elte-extras-slide-viewer';
    viewer.setAttribute('aria-labelledby','elte-slide-title');
    viewer.innerHTML = `
      <div class="elte-slide-toolbar">
        <strong id="elte-slide-title"></strong>
        <div class="elte-slide-navigation">
          <button type="button" aria-label="Előző oldal">←</button>
          <input type="text" inputmode="numeric" aria-label="Oldalszám">
          <span></span>
          <button type="button" aria-label="Következő oldal">→</button>
        </div>
        <button type="button" autofocus>Bezárás</button>
      </div>
      <div class="elte-slide-stage" tabindex="-1"><p role="status"></p></div>`;
    const title = viewer.querySelector('strong');
    const input = viewer.querySelector('input');
    const [previous,next,close] = viewer.querySelectorAll('button[type="button"]');
    const stage = viewer.querySelector('.elte-slide-stage');
    const status = stage.querySelector('p');
    viewer.querySelector('.elte-slide-navigation span').textContent = `/ ${pages.length}`;

    const images = new Map();
    let current = links.indexOf(link);
    const wrap = index => (index % pages.length + pages.length) % pages.length;
    function updateStatus() {
      const image = images.get(current);
      if (image?.naturalHeight) viewer.style.setProperty('--slide-ratio',image.naturalWidth / image.naturalHeight);
      status.textContent = !image?.complete ? 'Betöltés…' : image.naturalWidth ? '' : 'A dia nem tölthető be.';
    }
    function loadPage(index, priority) {
      if (!images.has(index)) {
        const image = new Image();
        image.alt = `${index + 1}. oldal`;
        image.decoding = 'async';
        image.fetchPriority = priority;
        image.onload = image.onerror = updateStatus;
        images.set(index,image);
        image.src = pages[index].url;
      }
      return images.get(index);
    }
    function showPage(index, updatePageField=true) {
      current = wrap(index);
      const image = loadPage(current,'high');
      image.fetchPriority = 'high';
      stage.replaceChildren(image,status);
      title.textContent = title.title = pages[current].title;
      if (updatePageField) input.value = String(current + 1);
      updateStatus();

      const nearby = new Set([current]);
      for (let offset = 1; offset <= 6; offset++) nearby.add(wrap(current + offset));
      for (let offset = 1; offset <= 2; offset++) nearby.add(wrap(current - offset));
      for (const [page,cachedImage] of images) {
        if (nearby.has(page)) continue;
        if (!cachedImage.complete) cachedImage.removeAttribute('src');
        images.delete(page);
      }
      for (const page of nearby) loadPage(page,'low');
    }

    input.addEventListener('input',()=>{
      const page = Number(input.value);
      if (/^\d+$/.test(input.value) && page >= 1 && page <= pages.length && page !== current + 1) {
        showPage(page - 1,false);
      }
    });
    input.addEventListener('blur',()=>{ input.value = String(current + 1); });
    input.addEventListener('keydown',event=>{ if (event.key === 'Enter') stage.focus(); });
    previous.addEventListener('click',()=>showPage(current - 1));
    next.addEventListener('click',()=>showPage(current + 1));
    close.addEventListener('click',()=>viewer.close());
    viewer.addEventListener('click',event=>{
      if (event.target !== viewer) return;
      const {left,right,top,bottom} = viewer.getBoundingClientRect();
      if (event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom) viewer.close();
    });
    viewer.addEventListener('keydown',event=>{
      if (event.target === input || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      showPage(current + (event.key === 'ArrowRight' ? 1 : -1));
    });
    viewer.addEventListener('close',()=>{
      for (const image of images.values()) if (!image.complete) image.removeAttribute('src');
      viewer.remove();
    });
    document.body.append(viewer);
    showPage(current);
    viewer.showModal();
  }

  let rendered = null;
  function render(state) {
    if (state === rendered) return;
    rendered = state;
    slot.replaceChildren();
    slot.hidden = state === null;
    if (state === null) return;
    const control = document.createElement(state === 'out' ? 'a' : 'span');
    if (state === 'out') {
      control.href = loginURL;
      control.target = '_blank';
      control.rel = 'noopener';
      control.textContent = 'Bejelentkezés';
      control.setAttribute('aria-haspopup','dialog');
      control.addEventListener('click',event=>{
        if (!isNormalClick(event)) return;
        event.preventDefault();
        openLogin();
      });
    } else {
      control.textContent = 'Bejelentkezve';
    }
    slot.append(control);
  }

  async function check() {
    try {
      const response = await fetch(loginURL, {
        credentials:'same-origin', cache:'no-store', redirect:'manual',
        signal:AbortSignal.timeout(5000)
      });
      if (response.type === 'opaqueredirect') return 'out';
      if (response.ok && /^text\/plain(?:\s*;|$)/i.test(response.headers.get('Content-Type') || '')) {
        // Some responses use a legacy encoding or already contain a replacement character for é.
        const message = await response.text();
        if (/^Sikeres bejelentkez[é\uFFFD]s![^\S\r\n]*(?:\r\n?|\n|$)/u.test(message.trimStart())) return 'in';
      }
    } catch { /* Retry inconclusive responses without claiming the session expired. */ }
    return null;
  }

  let checking = null;
  let lastCheckFinished = -Infinity;
  function refresh(allowDuringLogin=false) {
    if (checking) return checking;
    if (document.visibilityState === 'hidden' || (dialog.open && !allowDuringLogin)) return;
    checking = (async()=>{
      let state = await check();
      if (state === null) {
        await new Promise(resolve => setTimeout(resolve,700));
        state = await check();
      }
      render(state);
      if (state === 'in' && dialog.open) dialog.close();
      return state;
    })().finally(()=>{
      lastCheckFinished = performance.now();
      checking = null;
    });
    return checking;
  }
  let checkingSlide = false;
  function isSlide(link) {
    return link.origin === location.origin && /^\/Downloads\/progptin\/dia\d+\/Dia\d+\.jpg$/i.test(link.pathname);
  }
  document.addEventListener('click',async event=>{
    if (!event.isTrusted || !isNormalClick(event)) return;
    const link = event.target.closest?.('.entry-content a[href]');
    if (!link || !isSlide(link)) return;

    // Capture the click before the site's viewer handles it. The session may
    // have expired since the navigation badge was last checked.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (checkingSlide) return;
    checkingSlide = true;
    try {
      const state = await refresh();
      if (state === 'out') openLogin();
      else if (state === 'in' && link.isConnected) openSlides(link);
      else if (link.isConnected) link.click(); // Let the site's viewer handle the replayed click.
    } finally {
      checkingSlide = false;
    }
  },true);
  window.addEventListener('focus',()=>{
    // Closing the iframe restores focus to the page; don't check twice for it.
    if (performance.now() - lastCheckFinished > 1000) refresh();
  });
  window.addEventListener('pageshow',event=>{ if (event.persisted) refresh(); });
  document.addEventListener('visibilitychange',()=>refresh());
  setInterval(refresh,120000);
  refresh();
})();
