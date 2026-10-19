(() => {
  "use strict";
  if (document.getElementById('spec-panel-divider')) return;
  const editor = document.getElementById('editor-container');
  const data = document.getElementById('data-container');
  const history = document.getElementById('history-container');
  const left = editor?.parentElement;
  const row = left?.parentElement;
  if (!row || data?.parentElement !== row) return;
  const DEFAULT = 2/3;
  let ratio = DEFAULT, displayedRatio = DEFAULT, dragging = null, queued = false;
  const style = document.createElement('style');
  style.textContent = `
    .spec-resizable-panels { display:grid!important; grid-template-rows:minmax(0,1fr); min-height:0; }
    .spec-resizable-panels > * { min-width:0; min-height:0; grid-row:1; }
    #spec-panel-divider { position:relative; width:7px; align-self:stretch; border:0!important; background:transparent; cursor:col-resize; touch-action:none; user-select:none; z-index:2; }
    #spec-panel-divider[hidden] { display:none!important; }
    #spec-panel-divider::after { content:''; position:absolute; top:0; bottom:0; left:3px; width:1px; background:currentColor; opacity:.3; }
    #spec-panel-divider:hover,#spec-panel-divider:focus-visible { background:#94a3b840; outline:1px solid #94a3b8; outline-offset:-1px; }
    html.spec-divider-dragging,html.spec-divider-dragging * { cursor:col-resize!important; user-select:none!important; }
  `;
  document.head.append(style);
  const divider = document.createElement('div');
  divider.id = 'spec-panel-divider';
  divider.tabIndex = 0;
  divider.setAttribute('role','separator');
  divider.setAttribute('aria-orientation','vertical');
  divider.setAttribute('aria-label','Resize Specification and Data panels');
  divider.title = 'Drag to resize · Arrow keys to adjust · Double-click to reset';
  if (!left.id) left.id = 'spec-left-panels';
  divider.setAttribute('aria-controls',left.id+' '+data.id);
  row.insertBefore(divider,data);
  row.classList.add('spec-resizable-panels');
  const visible = node => node && !node.hidden && getComputedStyle(node).display !== 'none';
  function bounds() {
    const historyWidth = visible(history) ? row.clientWidth * .25 : 0;
    const available = Math.max(1,row.clientWidth-historyWidth-7);
    const minimum = Math.min(.45,Math.max(.1,120/available));
    return {available,minimum,maximum:1-minimum};
  }
  function apply() {
    const showLeft = visible(left), showData = visible(data), showHistory = visible(history);
    const showDivider = Boolean(showLeft && showData);
    divider.hidden = !showDivider;
    if (!showDivider && dragging) finish();
    const {minimum,maximum} = bounds();
    displayedRatio = Math.min(maximum,Math.max(minimum,ratio));
    const tracks = [];
    function add(node,track) { node.style.gridColumn = String(tracks.length+1); tracks.push(track); }
    if (showHistory) add(history,showLeft || showData ? 'minmax(0,25%)' : 'minmax(0,1fr)');
    if (showLeft) add(left,showData ? `minmax(0,${displayedRatio}fr)` : 'minmax(0,1fr)');
    if (showDivider) add(divider,'7px');
    if (showData) add(data,showLeft ? `minmax(0,${1-displayedRatio}fr)` : 'minmax(0,1fr)');
    row.style.gridTemplateColumns = tracks.join(' ') || 'minmax(0,1fr)';
    divider.setAttribute('aria-valuemin',String(Math.round(minimum*100)));
    divider.setAttribute('aria-valuemax',String(Math.round(maximum*100)));
    divider.setAttribute('aria-valuenow',String(Math.round(displayedRatio*100)));
    divider.setAttribute('aria-valuetext',`Specification ${Math.round(displayedRatio*100)}%, Data ${Math.round((1-displayedRatio)*100)}%`);
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  }
  function save() { browser.storage.local.set({specPanelRatio:ratio}).catch(() => {}); }
  function finish(cancel = false) {
    if (!dragging) return;
    const previous = dragging;
    dragging = null;
    if (cancel) ratio = previous.ratio;
    document.documentElement.classList.remove('spec-divider-dragging');
    if (divider.hasPointerCapture(previous.id)) divider.releasePointerCapture(previous.id);
    if (cancel) apply();
    else save();
  }
  divider.addEventListener('pointerdown',event => {
    if (event.button !== 0 || divider.hidden) return;
    event.preventDefault();
    dragging = {id:event.pointerId,ratio};
    divider.focus();
    divider.setPointerCapture(event.pointerId);
    document.documentElement.classList.add('spec-divider-dragging');
  });
  divider.addEventListener('pointermove',event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    const {available,minimum,maximum} = bounds();
    ratio = Math.min(maximum,Math.max(minimum,(event.clientX-left.getBoundingClientRect().left-3.5)/available));
    apply();
  });
  divider.addEventListener('pointerup',() => finish());
  divider.addEventListener('pointercancel',() => finish(true));
  divider.addEventListener('lostpointercapture',() => finish());
  window.addEventListener('blur',() => finish());
  divider.addEventListener('dblclick',() => { ratio = DEFAULT; apply(); save(); });
  divider.addEventListener('keydown',event => {
    if (event.key === 'Escape' && dragging) { event.preventDefault(); finish(true); return; }
    const {minimum,maximum} = bounds();
    const step = event.shiftKey ? .1 : .02;
    if (event.key === 'ArrowLeft') ratio = Math.max(minimum,displayedRatio-step);
    else if (event.key === 'ArrowRight') ratio = Math.min(maximum,displayedRatio+step);
    else if (event.key === 'Home') ratio = minimum;
    else if (event.key === 'End') ratio = maximum;
    else return;
    event.preventDefault(); event.stopPropagation(); apply(); save();
  });
  const observer = new MutationObserver(schedule);
  for (const panel of [left,data,history,editor,document.getElementById('visualization-container')]) {
    if (panel) observer.observe(panel,{attributes:true,attributeFilter:['class','hidden']});
  }
  new ResizeObserver(schedule).observe(row);
  document.getElementById('panel-buttons')?.addEventListener('change',schedule);
  document.getElementById('panel-buttons')?.addEventListener('click',schedule);
  browser.storage.local.get('specPanelRatio').then(settings => {
    if (!dragging && Number.isFinite(settings.specPanelRatio) && settings.specPanelRatio >= .05 && settings.specPanelRatio <= .95) ratio = settings.specPanelRatio;
    apply();
  }).catch(() => apply());
  apply();
})();
