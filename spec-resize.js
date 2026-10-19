(() => {
  "use strict";
  if (document.getElementById('spec-panel-divider')) return;
  const editor = document.getElementById('editor-container');
  const data = document.getElementById('data-container');
  const history = document.getElementById('history-container');
  const visualization = document.getElementById('visualization-container');
  const left = editor?.parentElement;
  const row = left?.parentElement;
  if (!row || data?.parentElement !== row) return;
  const DEFAULT = 2/3;
  let ratio = DEFAULT, displayedRatio = DEFAULT, dragging = null, queued = false;
  let visualizationRatio = .5, displayedVisualizationRatio = .5, visualizationDragging = null;
  const style = document.createElement('style');
  style.textContent = `
    .spec-resizable-panels { display:grid!important; grid-template-rows:minmax(0,1fr); min-height:0; }
    .spec-resizable-panels > * { min-width:0; min-height:0; grid-row:1; }
    /* Overlap the native border without reserving space or drawing another line. */
    #spec-panel-divider { position:relative; width:9px; margin-left:-4px; align-self:stretch; border:0!important; outline:none!important; background:transparent; cursor:col-resize; touch-action:none; user-select:none; z-index:2; }
    #spec-panel-divider[hidden] { display:none!important; }
    #spec-panel-divider:focus-visible::after { content:''; position:absolute; top:0; bottom:0; left:3px; width:1px; background:#94a3b8; pointer-events:none; }
    html.spec-divider-dragging,html.spec-divider-dragging * { cursor:col-resize!important; user-select:none!important; }
    .spec-resizable-stack { grid-template-columns:minmax(0,1fr); }
    .spec-resizable-stack:not(.hidden):not([hidden]) { display:grid!important; }
    .spec-resizable-stack > * { min-height:0; min-width:0; grid-column:1; }
    #spec-visualization-divider { position:relative; height:9px; margin-top:-4px; align-self:start; justify-self:stretch; border:0!important; outline:none!important; background:transparent; cursor:row-resize; touch-action:none; user-select:none; z-index:3; }
    #spec-visualization-divider[hidden] { display:none!important; }
    #spec-visualization-divider:focus-visible::after { content:''; position:absolute; left:0; right:0; top:4px; height:1px; background:#94a3b8; pointer-events:none; }
    html.spec-visualization-dragging,html.spec-visualization-dragging * { cursor:row-resize!important; user-select:none!important; }
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
    const available = Math.max(1,row.clientWidth-historyWidth);
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
    if (showDivider) add(divider,'0px');
    if (showData) add(data,showLeft ? `minmax(0,${1-displayedRatio}fr)` : 'minmax(0,1fr)');
    row.style.gridTemplateColumns = tracks.join(' ') || 'minmax(0,1fr)';
    divider.setAttribute('aria-valuemin',String(Math.round(minimum*100)));
    divider.setAttribute('aria-valuemax',String(Math.round(maximum*100)));
    divider.setAttribute('aria-valuenow',String(Math.round(displayedRatio*100)));
    divider.setAttribute('aria-valuetext',`Specification ${Math.round(displayedRatio*100)}%, Data ${Math.round((1-displayedRatio)*100)}%`);
    applyVisualization();
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
    dragging = {id:event.pointerId,ratio,offset:event.clientX-left.getBoundingClientRect().right};
    divider.focus();
    divider.setPointerCapture(event.pointerId);
    document.documentElement.classList.add('spec-divider-dragging');
  });
  divider.addEventListener('pointermove',event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    const {available,minimum,maximum} = bounds();
    ratio = Math.min(maximum,Math.max(minimum,(event.clientX-left.getBoundingClientRect().left-dragging.offset)/available));
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
  const visualizationDivider = visualization?.parentElement === left ? document.createElement('div') : null;
  if (visualizationDivider) {
    visualizationDivider.id = 'spec-visualization-divider';
    visualizationDivider.tabIndex = 0;
    visualizationDivider.setAttribute('role','separator');
    visualizationDivider.setAttribute('aria-orientation','horizontal');
    visualizationDivider.setAttribute('aria-label','Resize Specification and Visualization panels');
    visualizationDivider.setAttribute('aria-controls',editor.id+' '+visualization.id);
    visualizationDivider.title = 'Drag to resize · Up/Down to adjust · Double-click to reset';
    left.insertBefore(visualizationDivider,visualization);
    left.classList.add('spec-resizable-stack');
    visualizationDivider.addEventListener('pointerdown',event => {
      if (event.button !== 0 || visualizationDivider.hidden) return;
      event.preventDefault();
      visualizationDragging = {id:event.pointerId,ratio:visualizationRatio,offset:event.clientY-editor.getBoundingClientRect().bottom};
      visualizationDivider.focus();
      visualizationDivider.setPointerCapture(event.pointerId);
      document.documentElement.classList.add('spec-visualization-dragging');
    });
    visualizationDivider.addEventListener('pointermove',event => {
      if (!visualizationDragging || event.pointerId !== visualizationDragging.id) return;
      const {available,minimum,maximum} = visualizationBounds();
      visualizationRatio = Math.min(maximum,Math.max(minimum,(event.clientY-left.getBoundingClientRect().top-visualizationDragging.offset)/available));
      applyVisualization();
    });
    visualizationDivider.addEventListener('pointerup',() => finishVisualization());
    visualizationDivider.addEventListener('pointercancel',() => finishVisualization(true));
    visualizationDivider.addEventListener('lostpointercapture',() => finishVisualization());
    window.addEventListener('blur',() => finishVisualization());
    visualizationDivider.addEventListener('dblclick',() => { visualizationRatio = .5; applyVisualization(); saveVisualization(); });
    visualizationDivider.addEventListener('keydown',event => {
      if (event.key === 'Escape' && visualizationDragging) { event.preventDefault(); event.stopPropagation(); finishVisualization(true); return; }
      const {minimum,maximum} = visualizationBounds();
      const step = event.shiftKey ? .1 : .02;
      if (event.key === 'ArrowUp') visualizationRatio = Math.max(minimum,displayedVisualizationRatio-step);
      else if (event.key === 'ArrowDown') visualizationRatio = Math.min(maximum,displayedVisualizationRatio+step);
      else if (event.key === 'Home') visualizationRatio = minimum;
      else if (event.key === 'End') visualizationRatio = maximum;
      else return;
      event.preventDefault(); event.stopPropagation(); applyVisualization(); saveVisualization();
    });
  }
  function visualizationBounds() {
    const available = Math.max(1,left.clientHeight);
    const minimum = Math.min(.45,Math.max(.1,120/available));
    return {available,minimum,maximum:1-minimum};
  }
  function applyVisualization() {
    if (!visualizationDivider) return;
    const showEditor = visible(editor), showVisualization = visible(visualization);
    const show = Boolean(visible(left) && showEditor && showVisualization);
    visualizationDivider.hidden = !show;
    if (!show && visualizationDragging) finishVisualization();
    const {minimum,maximum} = visualizationBounds();
    displayedVisualizationRatio = Math.min(maximum,Math.max(minimum,visualizationRatio));
    editor.style.gridRow = '1';
    visualizationDivider.style.gridRow = '2';
    visualization.style.gridRow = showEditor ? '3' : '1';
    left.style.gridTemplateRows = show ? `minmax(0,${displayedVisualizationRatio}fr) 0px minmax(0,${1-displayedVisualizationRatio}fr)` : 'minmax(0,1fr)';
    visualizationDivider.setAttribute('aria-valuemin',String(Math.round(minimum*100)));
    visualizationDivider.setAttribute('aria-valuemax',String(Math.round(maximum*100)));
    visualizationDivider.setAttribute('aria-valuenow',String(Math.round(displayedVisualizationRatio*100)));
    visualizationDivider.setAttribute('aria-valuetext',`Specification ${Math.round(displayedVisualizationRatio*100)}%, Visualization ${Math.round((1-displayedVisualizationRatio)*100)}%`);
  }
  function saveVisualization() { browser.storage.local.set({specVisualizationRatio:visualizationRatio}).catch(() => {}); }
  function finishVisualization(cancel = false) {
    if (!visualizationDragging) return;
    const previous = visualizationDragging;
    visualizationDragging = null;
    if (cancel) visualizationRatio = previous.ratio;
    document.documentElement.classList.remove('spec-visualization-dragging');
    if (visualizationDivider.hasPointerCapture(previous.id)) visualizationDivider.releasePointerCapture(previous.id);
    if (cancel) applyVisualization();
    else saveVisualization();
  }
  const observer = new MutationObserver(schedule);
  for (const panel of [left,data,history,editor,visualization]) {
    if (panel) observer.observe(panel,{attributes:true,attributeFilter:['class','hidden']});
  }
  const resize = new ResizeObserver(schedule);
  resize.observe(row);
  resize.observe(left);
  document.getElementById('panel-buttons')?.addEventListener('change',schedule);
  document.getElementById('panel-buttons')?.addEventListener('click',schedule);
  browser.storage.local.get(['specPanelRatio','specVisualizationRatio']).then(settings => {
    if (!dragging && Number.isFinite(settings.specPanelRatio) && settings.specPanelRatio >= .05 && settings.specPanelRatio <= .95) ratio = settings.specPanelRatio;
    if (!visualizationDragging && Number.isFinite(settings.specVisualizationRatio) && settings.specVisualizationRatio >= .05 && settings.specVisualizationRatio <= .95) visualizationRatio = settings.specVisualizationRatio;
    apply();
  }).catch(() => apply());
  apply();
})();
