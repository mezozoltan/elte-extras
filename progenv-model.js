(function(scope) {
  "use strict";
  const ORIGIN = "https://progenv.inf.elte.hu";
  const clean = value => String(value || "").replace(/\s+/g," ").trim();
  function route(href, base = ORIGIN + "/hu", locale = "hu") {
    try {
      const url = new URL(href,base);
      if (url.origin !== ORIGIN) return null;
      const match = url.pathname.match(/^\/(?:(hu|en)\/)?courses\/(\d+)(?:\/groups\/(\d+))?(?:\/topics\/(\d+))?\/?$/);
      if (!match) return null;
      const path = url.pathname.replace(/^\/(?:hu|en)(?=\/)/,"");
      return {courseId:match[2],groupId:match[3] || null,topicId:match[4] || null,url:ORIGIN+"/"+locale+path};
    } catch { return null; }
  }
  function courseName(value) {
    const name = clean(value);
    return name.replace(/^[\w-]+\s+[-–]\s+/,"");
  }
  function groupLabel(value) {
    const name = clean(value);
    const match = name.match(/(?:^|\s)(\d+)\.?\s*(?:csoport|group)\b/i) || name.match(/^group\s+(\d+)$/i);
    return match ? match[1]+".cs." : name;
  }
  function cards(doc) { return [...doc.querySelectorAll('main [data-slot="card"]')]; }
  function courses(doc, base, locale) {
    const result = new Map();
    for (const card of cards(doc)) {
      if (card.closest('[hidden]')) continue;
      for (const anchor of card.querySelectorAll('a[href]')) {
        const target = route(anchor.getAttribute('href'),base,locale);
        if (!target || target.groupId || target.topicId || !clean(anchor.textContent)) continue;
        result.set(target.courseId,{...target,name:courseName(anchor.textContent)});
      }
    }
    return [...result.values()];
  }
  function groups(doc, base, locale, courseId) {
    const result = new Map();
    for (const anchor of doc.querySelectorAll('main a[href]')) {
      if (anchor.closest('[hidden]')) continue;
      const target = route(anchor.getAttribute('href'),base,locale);
      if (!target || target.courseId !== courseId || !target.groupId || target.topicId) continue;
      result.set(target.groupId,{...target,name:clean(anchor.textContent)});
    }
    return [...result.values()];
  }
  function group(doc, base, locale, course, fallback = null) {
    let target = route(base,base,locale);
    if (!target || target.topicId) return null;
    const heading = clean(doc.querySelector('main h1')?.textContent);
    if (!target.groupId) {
      const ids = new Set([...doc.querySelectorAll('main a[href]')].map(a => route(a.getAttribute('href'),base,locale))
        .filter(r => r?.courseId === course.courseId && r.groupId && r.topicId).map(r => r.groupId));
      if (ids.size === 1) target = {...target,groupId:[...ids][0]};
      else if (fallback?.groupId) target = {...target,groupId:fallback.groupId};
      else return null;
      target.url = ORIGIN+`/${locale}/courses/${course.courseId}/groups/${target.groupId}`;
    }
    const topics = new Map();
    for (const card of cards(doc)) {
      const anchor = [...card.querySelectorAll('a[href]')].find(a => {
        const r = route(a.getAttribute('href'),base,locale);
        return r?.topicId && r.courseId === course.courseId && (!r.groupId || r.groupId === target.groupId);
      });
      if (!anchor) continue;
      const link = route(anchor.getAttribute('href'),base,locale);
      const scoreElement = card.querySelector('[aria-label^="Score "]');
      const scoreMatch = scoreElement?.getAttribute('aria-label')?.match(/([\d.,]+)\s*%/);
      const score = scoreMatch ? Math.min(100,Math.max(0,Number(scoreMatch[1].replace(',','.')))) : null;
      const spans = [...card.querySelectorAll('span')].map(span => clean(span.textContent));
      const count = spans.find(text => /^\d+\s+(?:feladat|tasks?)$/i.test(text)) || "";
      const deadline = spans.find(text => /^(?:Határidő|Deadline|Due)\s*:/i.test(text)) || "";
      topics.set(link.url,{...link,name:clean(anchor.textContent),score,count,deadline});
    }
    return {...target,key:`${course.courseId}/${target.groupId}`,courseName:course.name,
      name:heading || fallback?.name || "",label:groupLabel(heading || fallback?.name || ""),topics:[...topics.values()]};
  }
  const api = {route,courseName,groupLabel,courses,groups,group};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.ProgenvSidebarModel = api;
})(globalThis);
