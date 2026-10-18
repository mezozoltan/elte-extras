(() => {
  "use strict";
  if (document.getElementById("stuki-history-extension")) return;
  const model = globalThis.StukiHistoryModel;
  const host = document.createElement("div");
  host.id = "stuki-history-extension";
  const shadow = host.attachShadow({mode: "closed"});
  const style = document.createElement("style");
  style.textContent = `
    :host { all:initial; font:14px/1.45 var(--sh-font,system-ui,sans-serif); color:#000; }
    * { box-sizing:border-box; }
    button,input,a,summary { font:inherit; }
    button { cursor:pointer; background:var(--sh-button,#361b36); color:#fff; border:1px solid var(--sh-border,#b679b6); border-radius:5px; padding:4px 8px; font-weight:700; }
    button:focus-visible,a:focus-visible,input:focus-visible,summary:focus-visible { outline:2px solid var(--sh-border,#b679b6); outline-offset:2px; }
    #panel { position:fixed; top:var(--sh-top,3rem); bottom:var(--sh-bottom,0px); left:0; width:330px; max-width:95vw; z-index:2147483646; background:var(--sh-menu,#e0d8ba); border-right:1px solid var(--sh-border,#b679b6); display:flex; flex-direction:column; }
    [hidden] { display:none !important; }
    header { padding:8px 12px; background:var(--sh-menu,#e0d8ba); color:#000; }
    .heading { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    h2 { font-size:16px; font-weight:400; margin:0; }
    .tools { padding:10px 12px; display:flex; gap:5px; background:var(--sh-menu,#e0d8ba); color:#000; }
    input { min-width:0; width:100%; border:1px solid #888; border-radius:3px; padding:5px 7px; background:var(--sh-menu,#e0d8ba); color:var(--struct-text-color,#000); }
    #refresh { padding:4px 9px; }
    #status { padding:8px 12px; font-size:12px; opacity:.8; white-space:pre-line; overflow-wrap:anywhere; }
    #status.error { color:var(--sh-error,#c74747); opacity:1; }
    #list { flex:1; overflow:auto; padding:0 12px 12px; }
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
  `;
  shadow.append(style);
  // Static markup only. API fields below are always inserted with textContent.
  const template = document.createElement("template");
  template.innerHTML = `<section id="panel" hidden aria-label="Stuki mentési előzmények" lang="hu">
      <header><div class="heading"><h2>History</h2></div></header>
      <div class="tools"><input id="search" type="search" placeholder="Keresés a mentésekben…" aria-label="Mentések keresése"><button id="refresh" title="Mentések frissítése" aria-label="Mentések frissítése">↻</button></div>
      <div id="status" role="status" aria-live="polite"></div><div id="list"></div>
    </section>`;
  shadow.append(template.content.cloneNode(true));
  document.body.append(host);
  const layout = document.createElement("style");
  layout.textContent = `
    #stuki-history-toggle[aria-expanded="true"] { background-color:#602060; }
    @media(min-width:760px){
      html.stuki-history-open #app :is(.menu,.structogram-panel){margin-left:330px!important;width:calc(100% - 330px)!important;min-width:0;}
    }
  `;
  document.head.append(layout);
  const $ = id => shadow.getElementById(id);
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
      return;
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
      const count = model.groups(rows).length;
      setStatus(`${count} struktogram · ${rows.length} mentett verzió\nFrissítve: ${new Date().toLocaleTimeString("hu-HU")}`);
      render();
    } catch (error) {
      if (mine !== generation) return;
      rows = []; loaded = false; render();
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
