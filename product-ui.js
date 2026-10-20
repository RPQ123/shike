/* Shared line icons and presentation controls. No simulated data lives here. */
(() => {
  'use strict';
  const paths={
    cube:'<path d="m12 3 9 5v8l-9 5-9-5V8Zm0 9 9-4M12 12 3 8M12 12v9M7.5 5.5l9 5"/>',
    top:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
    chart:'<path d="M4 3v17h17M7 14l4-5 4 3 6-8"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    locate:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    play:'<path d="m9 6 9 6-9 6Z"/>',pause:'<path d="M9 5v14M15 5v14"/>',
    document:'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v6h5M9 13h6M9 17h6"/>',
    settings:'<path d="m9 3-.6 2.2L6 6l-2.1-.6L2.4 8l1.6 1.7-.2 2.5L2 14l1.5 2.6 2.3-.4L8 17.5 9 20h3l1-2.5 2.2-1.3 2.3.4L19 14l-1.8-1.8-.2-2.5L18.6 8l-1.5-2.6L15 6l-2.4-.8L12 3Z"/><circle cx="10.5" cy="11.5" r="3"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3ZM16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/>',
    meal:'<path d="M5 3v7a3 3 0 0 0 6 0V3M8 3v18M17 3c-3 3-3 9 1 9h1V3h-2ZM18 12v9"/>',
    walk:'<circle cx="14" cy="4" r="2"/><path d="m12 8-2 5 4 3 1 5M10 13l-3 7M12 8l4 4 4 1M10 9l-4 3"/>',
    seat:'<path d="M6 12V4h11v8M5 12h14v5H5ZM7 17v4M17 17v4M6 8h11"/>',
    dining:'<circle cx="7" cy="5" r="2"/><path d="M6 10v5h6l3 6M4 11v7h7M11 10h10M18 10v11M14 6l1 2 2-2"/>',
    return:'<path d="m8 5-5 5 5 5M3 10h12a6 6 0 0 1 0 12h-4"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    expand:'<path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    layers:'<path d="m3 8 9-5 9 5-9 5ZM3 13l9 5 9-5M3 18l9 5 9-5"/>',
    note:'<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M2 7h5M2 12h5M2 17h5M10 7h6M10 11h6M10 15h4"/>',
    speed:'<path d="M4 18a9 9 0 1 1 16 0M12 13l5-5M6 9l1 1M12 5v2"/><circle cx="12" cy="13" r="1"/>'
  };
  function icon(name){return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.document)+'</svg>';}
  window.DiningIcons=icon;
  document.querySelectorAll('[data-icon]').forEach(el=>el.insertAdjacentHTML('afterbegin',icon(el.dataset.icon)));
  const panel=document.querySelector('.scene-panel'),expand=document.getElementById('scene-expand');
  function setExpanded(value){panel.classList.toggle('scene-expanded',value);document.body.classList.toggle('has-expanded-scene',value);expand.setAttribute('aria-pressed',String(value));expand.setAttribute('aria-label',value?'退出场景放大':'放大场景');window.dispatchEvent(new Event('resize'));}
  expand.onclick=()=>setExpanded(!panel.classList.contains('scene-expanded'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')setExpanded(false);});
  // Icon names refer to the same seven full-population event counts.
  window.DiningCountIcons=['users','meal','walk','seat','dining','return','check'];
})();
