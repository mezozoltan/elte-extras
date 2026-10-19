(async () => {
  'use strict';
  const site = /^\/stuki(?:\/|$)/.test(location.pathname) ? 'stuki'
    : /^\/specifikacio(?:\/|$)/.test(location.pathname) ? 'speci' : null;
  if (!site) return;
  const {siteEnabled = {}} = await browser.storage.local.get('siteEnabled').catch(() => ({}));
  if (siteEnabled[site] === false) return;
  const href = browser.runtime.getURL(site === 'stuki' ? 'icons/struktogram.png' : 'icons/specifikacio.png');
  function apply() {
    const icons = [...document.head.querySelectorAll('link[rel~="icon"]')];
    if (!icons.length) {
      const icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.append(icon);
      icons.push(icon);
    }
    for (const icon of icons) {
      if (icon.getAttribute('href') !== href) icon.setAttribute('href',href);
      if (icon.type !== 'image/png') icon.type = 'image/png';
      if (icon.getAttribute('sizes') !== '16x16') icon.setAttribute('sizes','16x16');
    }
  }
  apply();
  new MutationObserver(apply).observe(document.head,{subtree:true,childList:true,attributes:true,attributeFilter:['href','rel','type','sizes']});
})();
