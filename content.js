(() => {
  "use strict";
  if (document.getElementById("stuki-history-extension")) return;
  const model = globalThis.StukiHistoryModel;
  const host = document.createElement("div");
  host.id = "stuki-history-extension";
  const shadow = host.attachShadow({mode: "closed"});
  const style = document.createElement("style");
  style.textContent = `
    :host { all:initial; color-scheme:inherit; font:14px/1.45 var(--sh-font,system-ui,sans-serif); color:#000; }
    * { box-sizing:border-box; }
    button,input,a,summary { font:inherit; }
    button { cursor:pointer; background:var(--sh-button,#361b36); color:#fff; border:1px solid var(--sh-border,#b679b6); border-radius:5px; padding:4px 8px; font-weight:700; }
    button:not(#refresh):focus-visible,a:focus-visible,input:not(#search):focus-visible,summary:focus-visible { outline:2px solid var(--sh-border,#b679b6); outline-offset:2px; }
    #panel { position:fixed; top:var(--sh-top,3rem); bottom:var(--sh-bottom,0px); left:0; width:330px; max-width:95vw; z-index:2147483646; background:var(--sh-menu,#e0d8ba); border-right:1px solid var(--sh-border,#b679b6); display:flex; flex-direction:column; }
    [hidden] { display:none !important; }
    header { padding:8px 12px; background:var(--sh-menu,#e0d8ba); color:#000; }
    .heading { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    h2 { font-size:16px; font-weight:400; margin:0; }
    .tools { padding:0 12px 10px 12px; display:flex; gap:5px; background:var(--sh-menu,#e0d8ba); color:#000; }
    input { min-width:0; width:100%; border:1px solid #888; border-radius:3px; padding:5px 7px; background:var(--sh-menu,#e0d8ba); color:#000; }
    #search:focus { outline:none; box-shadow:none; }
    #refresh { all:revert; box-sizing:border-box; font:inherit; cursor:pointer; padding:4px 9px; }
    #updated { font-size:11px; opacity:.8; white-space:nowrap; }
    #counts { margin:8px 0 0; font-size:12px; opacity:.8; }
    #status { padding:8px 12px; font-size:12px; opacity:.8; white-space:pre-line; overflow-wrap:anywhere; }
    #status:empty { display:none; }
    #status.error { color:var(--sh-error,#c74747); opacity:1; }
    #list { flex:1; min-height:0; overflow:auto; padding:0 12px 12px; }
    article { margin:0 0 8px; padding:9px; border:1px solid color-mix(in srgb,#000 30%,transparent); border-radius:5px; background:var(--sh-menu,#e0d8ba); }
    article.active { border-color:var(--sh-border,#b679b6); background:color-mix(in srgb,#000 7%,var(--sh-menu,#e0d8ba)); }
    .name { font-size:14px; font-weight:700; overflow-wrap:anywhere; margin-bottom:4px; }
    .meta { font-size:12px; opacity:.75; }
    .row { display:flex; gap:10px; align-items:center; justify-content:space-between; padding:4px 0; }
    a { color:inherit; text-decoration:underline; text-underline-offset:2px; white-space:nowrap; }
    a:hover { opacity:.75; }
    a[aria-current] { font-weight:700; }
    details { border-top:1px solid color-mix(in srgb,#000 20%,transparent); margin-top:7px; padding-top:6px; }
    summary { cursor:pointer; font-size:12px; }
    .old { margin-top:5px; padding-left:7px; border-left:2px solid var(--sh-border,#b679b6); }
    .empty { opacity:.75; padding:16px 5px; }
    dialog { width:360px; max-width:calc(100vw - 32px); margin:auto; padding:18px; border:1px solid #888; border-radius:5px; background:var(--sh-menu,#e0d8ba); color:#000; font:inherit; }
    dialog::backdrop { background:#0007; }
    dialog h2 { margin-bottom:14px; font-weight:700; }
    dialog label { display:block; margin-bottom:6px; }
    .dialog-actions { display:flex; justify-content:flex-end; gap:6px; margin-top:16px; }
    #name-error { color:#a21d1d; margin:8px 0 0; font-size:12px; }
  `;
  shadow.append(style);
  // Static markup only. API fields below are always inserted with textContent.
  const template = document.createElement("template");
  template.innerHTML = `<section id="panel" hidden aria-label="Stuki mentési előzmények" lang="hu">
      <header><div class="heading"><h2>History</h2><span id="updated" role="status"></span></div></header>
      <div class="tools"><input id="search" type="search" placeholder="Keresés a mentésekben…" aria-label="Mentések keresése"><button id="refresh" title="Mentések frissítése" aria-label="Mentések frissítése">↻</button></div>
      <div id="status" role="status" aria-live="polite"></div><div id="list"></div>
    </section>
    <dialog id="name-dialog" aria-labelledby="name-title" lang="hu">
      <form id="name-form">
        <h2 id="name-title">Struktogram mentése</h2>
        <label for="save-name">Név</label>
        <input id="save-name" type="text" required maxlength="200" autocomplete="off" placeholder="Add meg a struktogram nevét…">
        <p id="name-error" role="alert" hidden></p>
        <div class="dialog-actions"><button id="name-cancel" type="button">Mégse</button><button id="name-submit" type="submit">Mentés</button></div>
      </form>
    </dialog>`;
  shadow.append(template.content.cloneNode(true));
  document.body.append(host);
  const layout = document.createElement("style");
  layout.textContent = `
    #stuki-history-toggle[aria-expanded="true"] { background-color:#602060; }
    #app header > nav button[data-stuki-empty]:disabled { opacity:.45; filter:grayscale(1); cursor:default; }
    @media(min-width:760px){
      html.stuki-history-open #app :is(.help,.menu,.structogram-panel){margin-left:330px!important;width:calc(100% - 330px)!important;min-width:0;box-sizing:border-box;}
    }
  `;
  document.head.append(layout);
  const $ = id => shadow.getElementById(id);
  const nameDialog = $("name-dialog");
  let replayingSave = false, applyingName = false;
  function nativeSave() {
    return [...document.querySelectorAll('#app header > nav button,#app header > nav input[type="button"]')]
      .find(element => /^Save(?:\s|$)/.test(element.value || element.textContent || ""));
  }
  function firstDiagram() { return document.querySelector("#app .structogram-editor .structogram"); }
  function hasContent() {
    return !!document.querySelector('#app .structogram-editor .structogram .body :is(.statement:not(.noop,.placeholder),.if,.while,.repeat,.switch)');
  }
  function updateSave() {
    const save = nativeSave();
    if (!save) return;
    if (!hasContent()) {
      if (!save.disabled) { save.dataset.stukiEmpty = ''; save.disabled = true; }
    } else if (save.hasAttribute('data-stuki-empty')) {
      save.disabled = false;
      delete save.dataset.stukiEmpty;
    }
  }
  const nextRender = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  async function revealName(diagram) {
    const control = diagram.querySelector('[title="Show/hide function header"]');
    if (!control) throw new Error("A függvénynév szerkesztője nem található. Töltsd újra a Stuki oldalt.");
    const wasHidden = !diagram.querySelector('.header-container .header[contenteditable="true"]');
    if (wasHidden) { control.click(); await nextRender(); }
    const field = diagram.querySelector('.header-container .header[contenteditable="true"]');
    if (!field) throw new Error("A függvénynév nem szerkeszthető ezen az oldalon.");
    return {field, control, wasHidden};
  }
  function showNameDialog() {
    if (nameDialog.open) { $("save-name").focus(); return; }
    const current = firstDiagram()?.querySelector('.header-container .header[contenteditable="true"]')?.textContent?.trim();
    $("save-name").value = current && current !== "Main" ? current : "";
    $("save-name").setCustomValidity("");
    $("name-error").hidden = true;
    nameDialog.showModal();
    $("save-name").focus();
    $("save-name").select();
  }
  // Let the editor perform the save itself, preserving authentication, version
  // linking, styling settings, and its existing failure behavior.
  document.addEventListener("click", event => {
    const save = nativeSave();
    if (!save || !event.composedPath().includes(save)) return;
    if (!hasContent()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (replayingSave || new URL(location.href).searchParams.get("uuid")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    showNameDialog();
  }, true);
  window.addEventListener("keydown", event => {
    if (!event.ctrlKey || event.key.toLowerCase() !== "s") return;
    if (!hasContent()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (!nameDialog.open && event.composedPath().includes(host)) return;
    if (!nameDialog.open && new URL(location.href).searchParams.get("uuid")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (nativeSave() && !nameDialog.open) showNameDialog();
  }, true);
  nameDialog.addEventListener("keydown", event => event.stopPropagation());
  nameDialog.addEventListener("close", () => nativeSave()?.focus());
  nameDialog.addEventListener("cancel", event => { if (applyingName) event.preventDefault(); });
  $("name-cancel").addEventListener("click", () => { if (!applyingName) nameDialog.close(); });
  $("save-name").addEventListener("input", () => $("save-name").setCustomValidity(""));
  $("name-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (applyingName) return;
    const name = $("save-name").value.trim();
    if (!name) {
      $("save-name").setCustomValidity("Adj meg egy nevet.");
      $("save-name").reportValidity(); return;
    }
    applyingName = true;
    $("name-submit").disabled = true; $("name-cancel").disabled = true;
    $("name-error").hidden = true;
    try {
      const diagram = firstDiagram();
      if (!diagram) throw new Error("Nincs menthető struktogram.");
      const {field, control, wasHidden} = await revealName(diagram);
      try {
        field.textContent = name;
        field.dispatchEvent(new Event("input", {bubbles:true, composed:true}));
        await nextRender();
      } finally {
        if (wasHidden) { control.click(); await nextRender(); }
      }
      const save = nativeSave();
      if (!save || save.disabled) throw new Error("A mentés gomb nem elérhető. Próbáld újra.");
      replayingSave = true;
      try { save.click(); } finally { replayingSave = false; }
      nameDialog.close();
    } catch (error) {
      $("name-error").textContent = error.message;
      $("name-error").hidden = false;
    } finally {
      applyingName = false;
      $("name-submit").disabled = false; $("name-cancel").disabled = false;
    }
  });
  const toggleWrap = document.createElement("div");
  toggleWrap.id = "stuki-history-control";
  const toggle = document.createElement("button");
  toggle.id = "stuki-history-toggle";
  toggle.type = "button";
  toggle.textContent = "History";
  toggle.title = "Mentett struktogramok";
  toggle.setAttribute("aria-expanded", "false");
  toggleWrap.append(toggle);
  // Place the control in the real header so the site's own CSS styles it.
  function mountHeader() {
    updateSave();
    const nav = document.querySelector("#app header > nav") || document.querySelector("#root header > nav");
    if (!nav) return;
    const theme = [...nav.querySelectorAll('button,input[type="button"]')].find(element => /^Theme\s*:/i.test(element.value || element.textContent || ""));
    const themeGroup = theme && [...nav.children].find(child => child.contains(theme));
    if (toggleWrap.parentElement !== nav || (themeGroup && toggleWrap.previousElementSibling !== themeGroup)) {
      if (themeGroup) themeGroup.after(toggleWrap); else nav.append(toggleWrap);
    }
    const header = nav.closest("header");
    const footer = document.querySelector("#app > footer");
    const menu = document.querySelector("#app .menu");
    const nativeButton = theme || nav.querySelector('input[type="button"],button:not(#stuki-history-toggle)');
    const set = (key,value) => { if (host.style.getPropertyValue(key) !== value) host.style.setProperty(key,value); };
    set("--sh-top", header.getBoundingClientRect().bottom + "px");
    set("--sh-bottom", footer ? Math.max(0, innerHeight - footer.getBoundingClientRect().top) + "px" : "0px");
    set("--sh-header", getComputedStyle(header).backgroundColor);
    set("--sh-font", getComputedStyle(document.body).fontFamily);
    if (menu) set("--sh-menu", getComputedStyle(menu).backgroundColor);
    if (nativeButton) {
      set("--sh-button", getComputedStyle(nativeButton).backgroundColor);
      set("--sh-border", getComputedStyle(nativeButton.parentElement).borderTopColor);
    }
    resize.observe(header);
    if (footer) resize.observe(footer);
  }
  const resize = new ResizeObserver(() => mountHeader());
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; mountHeader(); }); }
  });
  observer.observe(document.getElementById("root") || document.body, {childList:true,subtree:true,attributes:true,attributeFilter:["data-theme","value"]});
  window.addEventListener("resize", mountHeader);
  mountHeader();
  let opened = false, rows = [], busy = false, generation = 0;
  let currentUser = null;
  let lastURL = location.href, loaded = false, lastAttempt = 0;
  const expanded = new Set();
  function setStatus(message, error = false) {
    $("status").textContent = message;
    $("status").classList.toggle("error", error);
  }
  function date(row) {
    const parsed = new Date(row.created_at);
    return Number.isNaN(parsed.getTime()) ? "Ismeretlen dátum" : parsed.toLocaleString("hu-HU");
  }
  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }
  function render() {
    const list = $("list"); list.replaceChildren();
    const active = new URL(location.href).searchParams.get("uuid");
    const term = $("search").value.trim().toLocaleLowerCase("hu");
    const groups = model.groups(rows).filter(group => group.versions.some(row =>
      `${model.title(row)} ${row.uuid} ${date(row)}`.toLocaleLowerCase("hu").includes(term)));
    if (!groups.length) {
      list.append(el("p", "empty", term ? "Nincs találat." : loaded ? "Nincs megjeleníthető mentés." : "Nyomd meg a frissítés gombot a betöltéshez."));
    }
    function versionRow(row) {
      const line = el("div", "row"), label = el("span", "meta", date(row));
      const link = el("a", "", row.uuid === active ? "Megnyitva" : "Megnyitás");
      link.href = model.link(row);
      link.title = model.title(row) + " – " + row.uuid;
      if (row.uuid === active) link.setAttribute("aria-current", "page");
      // Normal navigation preserves the editor's unsaved-change confirmation.
      line.append(label, link); return line;
    }
    for (const group of groups) {
      const article = el("article", group.versions.some(row => row.uuid === active) ? "active" : "");
      article.append(el("div", "name", model.title(group.tip)), versionRow(group.tip));
      if (group.versions.length > 1) {
        const details = el("details");
        details.open = expanded.has(group.tip.id) || group.versions.slice(1).some(row => row.uuid === active);
        details.addEventListener("toggle", () => details.open ? expanded.add(group.tip.id) : expanded.delete(group.tip.id));
        details.append(el("summary", "", `Korábbi verziók (${group.versions.length - 1})`));
        const old = el("div", "old");
        group.versions.slice(1).forEach(row => old.append(versionRow(row)));
        details.append(old); article.append(details);
      }
      list.append(article);
    }
    if (loaded) {
      const counts = el("p", "", `${model.groups(rows).length} struktogram · ${rows.length} mentett verzió`);
      counts.id = "counts";
      list.append(counts);
    }
  }
  async function request(url, options = {}) {
    const response = await fetch(url, {...options, signal: AbortSignal.timeout(15000)});
    if (response.status === 401 || response.status === 403) throw new Error("Jelentkezz be a Stuki oldalon, majd nyomj a ↻ gombra.");
    if (response.status === 404) throw new Error("A szerver nem kínál mentéslistát ezen az API-végponton (404).");
    if (!response.ok) throw new Error(`A szerver hibát jelzett (HTTP ${response.status}).`);
    return response.json();
  }
  async function refresh(quiet = false) {
    if (busy) return;
    busy = true; lastAttempt = Date.now(); const mine = ++generation;
    $("refresh").disabled = true;
    if (!quiet) setStatus("Mentések betöltése…");
    try {
      // Firefox MV3 content-script fetch uses the page's network context,
      // matching the editor's own /me request, including container cookies.
      const me = await request("https://webprogramozas.inf.elte.hu:3000/me", {credentials:"include", headers:{Accept:"application/json"}});
      if (!me.accessToken) throw new Error("Nincs aktív bejelentkezés. Jelentkezz be a Stuki oldalon, majd frissítsd a listát.");
      const identity = String(me.user?.sub ?? me.user?.neptun ?? "");
      if (currentUser !== identity) { rows = []; loaded = false; currentUser = identity; render(); }
      const payload = await request("https://webprogramozas.inf.elte.hu:3001/structograms", {
        headers:{Authorization:`Bearer ${me.accessToken}`, Accept:"application/json"}
      });
      if (mine !== generation) return;
      rows = model.normalize(payload); loaded = true;
      setStatus("");
      $("updated").textContent = `Frissítve: ${new Date().toLocaleTimeString("hu-HU")}`;
      render();
    } catch (error) {
      if (mine !== generation) return;
      rows = []; loaded = false; render();
      $("updated").textContent = "";
      const message = error.name === "TimeoutError" ? "A szerver nem válaszolt időben. Próbáld újra a ↻ gombbal." :
        error instanceof TypeError ? "Az API nem érhető el. Ellenőrizd a kapcsolatot és a bővítmény webhelyengedélyét, majd frissíts." : error.message;
      setStatus(message, true);
    } finally { busy = false; $("refresh").disabled = false; }
  }
  async function open(value, focus = false) {
    opened = value;
    $("panel").hidden = !value;
    toggle.setAttribute("aria-expanded", String(value));
    document.documentElement.classList.toggle("stuki-history-open", value);
    browser.storage.local.set({panelOpen:value}).catch(() => {});
    if (value) { if (focus) $("search").focus(); await refresh(); }
    else if (focus) toggle.focus();
  }
  toggle.addEventListener("click", () => open(!opened, true));
  $("refresh").addEventListener("click", () => refresh());
  $("search").addEventListener("input", render);
  shadow.addEventListener("keydown", event => { if (event.key === "Escape" && opened) { event.stopPropagation(); open(false, true); } });
  // The editor's Ctrl+S/Z/Y handlers listen at window level. Searching must not edit the diagram.
  $("search").addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape" && opened) open(false, true);
  });
  setInterval(() => {
    const changed = lastURL !== location.href;
    if (changed) { lastURL = location.href; if (opened) { render(); refresh(true); } }
    if (opened && document.visibilityState === "visible" && Date.now() - lastAttempt > 30000) refresh(true);
  }, 2000);
  browser.storage.local.get("panelOpen").then(settings => {
    if (settings.panelOpen) open(true);
  }).catch(() => {});
})();
