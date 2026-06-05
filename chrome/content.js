/**
 * D365 QuickBar v2 – Content Script
 * Läuft auf *.dynamics.com Seiten als isoliertes Content Script.
 *
 * Wichtig: In Content Scripts sind `browser` (Firefox) und `chrome` (Chrome)
 * direkte Globals – NICHT window.browser / window.chrome!
 */
(function () {
  'use strict';

  // ── Browser-API ────────────────────────────────────────────────────────────
  /* global browser, chrome */
  const _api = (typeof browser !== 'undefined' && browser?.runtime) ? browser
             : (typeof chrome  !== 'undefined' && chrome?.runtime)  ? chrome
             : null;

  if (!_api) { console.error('D365 QuickBar: Keine Extension-API.'); return; }

  const isFF = (_api === (typeof browser !== 'undefined' ? browser : null));

  // Storage-Wrapper: Firefox gibt Promise zurück, Chrome braucht Callback
  const stGet = keys => isFF
    ? _api.storage.local.get(keys)
    : new Promise(r => _api.storage.local.get(keys, r));
  const stSet = obj => isFF
    ? _api.storage.local.set(obj)
    : new Promise(r => _api.storage.local.set(obj, r));

  // ── Zustand ────────────────────────────────────────────────────────────────
  let pinMode        = false;
  let editMode       = false;
  let displayMode    = 'sidebar';
  let pinnedItems    = [];          // [{type:'button',...} | {type:'group',...}]
  let ribbonVisible  = false;

  const pageKey     = () => `d365qb_v2_${location.pathname.split('/').slice(0,4).join('_')}`;
  const SETTINGS_KEY = 'd365qb_settings';

  // ── KRITISCH: Listener SOFORT registrieren (vor init-Delay!) ───────────────
  // Firefox erkennt die Seite nicht wenn der Listener erst nach 1500ms aktiv ist
  registerListener();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 1500));
  } else {
    setTimeout(boot, 1500);
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  async function boot() {
    const d = await stGet([pageKey(), SETTINGS_KEY]);
    pinnedItems  = d[pageKey()]     || [];
    displayMode  = (d[SETTINGS_KEY] || {}).displayMode || 'sidebar';
    renderUI();
    watchDom();
  }

  // ── Message-Listener ───────────────────────────────────────────────────────
  // Muster: sendResponse(data) + return true
  // Das funktioniert in Chrome MV3 UND Firefox MV3 gleich.
  // Für async-Operationen (IMPORT) wird sendResponse nach dem await aufgerufen.
  function registerListener() {
    _api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

      switch (msg.type) {

        case 'GET_STATE':
          sendResponse({
            displayMode, pinMode,
            pinnedCount: pinnedItems.filter(i => i.type === 'button').length
          });
          return true;

        case 'SET_DISPLAY_MODE':
          displayMode = msg.mode;
          stSet({ [SETTINGS_KEY]: { displayMode } });
          renderUI();
          sendResponse({ ok: true });
          return true;

        case 'SET_PIN_MODE':
          pinMode = msg.enabled;
          applyPinMode();
          sendResponse({ ok: true });
          return true;

        case 'CLEAR_PINS':
          pinnedItems = [];
          stSet({ [pageKey()]: [] });
          renderUI();
          sendResponse({ ok: true });
          return true;

        case 'EXPORT_PINS':
          sendResponse({ pinnedItems, displayMode, exportedAt: new Date().toISOString() });
          return true;

        case 'IMPORT_PINS':
          ;(async () => {
            try {
              const data = msg.data;
              if (!data || !Array.isArray(data.pinnedItems)) {
                return sendResponse({ ok: false, error: 'Ungültiges Format' });
              }
              pinnedItems = data.pinnedItems;
              if (data.displayMode) displayMode = data.displayMode;
              await stSet({ [pageKey()]: pinnedItems });
              await stSet({ [SETTINGS_KEY]: { displayMode } });
              renderUI();
              sendResponse({ ok: true });
            } catch (e) {
              sendResponse({ ok: false, error: e.message });
            }
          })();
          return true;




        default:
          return true;
      }
    });
  }

  // ── DOM & Navigation beobachten ────────────────────────────────────────────
  let _watchTimer = null;
  let _rebootTimer = null;

  function watchDom() {
    // SPA-Navigation: D365 wechselt Apps ohne echten Page-Reload
    // → pushState/popstate abfangen und UI neu aufbauen
    const scheduleReboot = () => {
      clearTimeout(_rebootTimer);
      _rebootTimer = setTimeout(boot, 1500);
    };
    try {
      const origPush = history.pushState.bind(history);
      history.pushState = (...args) => { origPush(...args); scheduleReboot(); };
      window.addEventListener('popstate', scheduleReboot);
    } catch(_) {}

    new MutationObserver(() => {
      // Pin-Overlays nachführen
      if (pinMode) {
        clearTimeout(_watchTimer);
        _watchTimer = setTimeout(addPinOverlays, 200);
      }
      // Ribbon-Tab wiederherstellen wenn D365 den AppBar neu gerendert hat
      if (displayMode === 'ribbon'
          && !document.getElementById('d365qb-ribbon-btn')
          && document.querySelector('.appBar-toolbar')) {
        clearTimeout(_rebootTimer);
        _rebootTimer = setTimeout(renderUI, 400);
      }
    }).observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['style']
    });
  }

  // ── Pin-Modus ──────────────────────────────────────────────────────────────
  function applyPinMode() {
    document.body.classList.toggle('d365qb-pin-mode', pinMode);
    if (pinMode) addPinOverlays();
    else removePinOverlays();
    const btn = document.getElementById('d365qb-sidebar-pinmode');
    if (btn) btn.textContent = pinMode ? '🔴 Pin-Modus aktiv' : '📌 Pin-Modus';
  }

  function addPinOverlays() {
    // D365-Struktur (aus echtem HTML):
    //   .appBar
    //   ├── .appBar-toolbar
    //   │   ├── .actionGroup  →  button.dynamicsButton  (Neu, Löschen, …)
    //   │   └── .appBarTab
    //   │       └── .appBar-flyout (hidden)
    //   │           └── .appBarTab-content  →  button.dynamicsButton
    //   └── .appBar-flyout  (aktuell offener Tab, SIBLING zu .appBar-toolbar!)
    //       └── .appBarTab-content  →  button.dynamicsButton
    document.querySelectorAll(
      'button.dynamicsButton:not([data-qb-overlay])'
    ).forEach(btn => {
      if (btn.closest('#d365qb-ribbon-tab')) return;
      if (btn.classList.contains('d365qb-manage')) return;
      const wrap = btn.querySelector('.button-container');
      if (!wrap) return;

      btn.setAttribute('data-qb-overlay', '1');
      const pin = document.createElement('div');
      pin.className = 'd365qb-overlay';
      pin.title = 'In QuickBar anpinnen';
      pin.textContent = '📌';
      pin.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); doPinBtn(btn); });
      wrap.style.position = 'relative';
      wrap.appendChild(pin);
    });
  }

  function removePinOverlays() {
    document.querySelectorAll('[data-qb-overlay]').forEach(btn => {
      btn.removeAttribute('data-qb-overlay');
      btn.querySelectorAll('.d365qb-overlay').forEach(o => o.remove());
    });
  }

  // ── Button anpinnen ────────────────────────────────────────────────────────
  function doPinBtn(btn) {
    const labelEl = btn.querySelector('.button-label');
    let label = labelEl?.textContent.trim() || '';
    if (!label) label = btn.getAttribute('aria-label') || btn.getAttribute('dyn-data-optional-label') || 'Unbekannt';

    const controlName = btn.getAttribute('data-dyn-controlname') || btn.getAttribute('name') || btn.id;
    const tabLabel    = getTabLabel(btn);

    if (pinnedItems.find(i => i.type === 'button' && i.controlName === controlName)) {
      toast(`"${label}" ist bereits angepinnt.`); return;
    }
    pinnedItems.push({ type: 'button', id: `p_${Date.now()}`, label, controlName, tabLabel, buttonId: btn.id });
    stSet({ [pageKey()]: pinnedItems });
    renderUI();
    toast(`📌 "${label}" angepinnt!`);
  }

  function getTabLabel(btn) {
    // Fall 1: Button in internem Tab-Flyout
    const tab = btn.closest('.appBarTab');
    if (tab) {
      const el = tab.querySelector(':scope > button.appBarTab-header .appBarTab-headerLabel');
      if (el) return el.textContent.trim();
    }
    // Fall 2: Button in externem Flyout (ID endet auf _flyout)
    const flyout = btn.closest('.appBar-flyout');
    if (flyout?.id) {
      const tabEl = document.getElementById(flyout.id.replace(/_flyout$/, ''));
      const el = tabEl?.querySelector('.appBarTab-headerLabel');
      if (el) return el.textContent.trim();
    }
    return '';
  }

  // ── UI Rendern ─────────────────────────────────────────────────────────────
  function renderUI() {
    rmSidebar(); rmRibbon();
    if (displayMode === 'sidebar') mkSidebar();
    else if (pinnedItems.some(i => i.type === 'button')) mkRibbon();
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  function rmSidebar() {
    document.getElementById('d365qb-sidebar')?.remove();
    document.body.classList.remove('d365qb-has-sidebar');
  }

  function mkSidebar() {
    const sb = document.createElement('div');
    sb.id = 'd365qb-sidebar';
    if (editMode) sb.classList.add('d365qb-edit-mode');

    sb.innerHTML = `
      <button class="d365qb-expand-strip" id="d365qb-expand" title="QuickBar ausklappen">
        <span>⚡</span><span class="d365qb-expand-arrow">▶</span>
      </button>
      <div class="d365qb-hd">
        <span class="d365qb-hd-title">⚡ QuickBar</span>
        <div class="d365qb-hd-btns">
          <button class="d365qb-icon-btn" id="d365qb-edit-toggle"
            title="${editMode ? 'Fertig' : 'Bearbeiten'}">${editMode ? '✓' : '✏️'}</button>
          <button class="d365qb-icon-btn" id="d365qb-collapse" title="Einklappen">◁</button>
        </div>
      </div>
      <div class="d365qb-body" id="d365qb-body">
        ${editMode ? mkEditHTML() : mkNormalHTML()}
      </div>
      <div class="d365qb-foot">
        ${editMode
          ? `<button class="d365qb-foot-btn" id="d365qb-add-group">＋ Gruppe hinzufügen</button>`
          : `<button class="d365qb-foot-btn" id="d365qb-sidebar-pinmode">${pinMode ? '🔴 Pin-Modus aktiv' : '📌 Pin-Modus'}</button>`
        }
      </div>`;

    document.body.appendChild(sb);
    document.body.classList.add('d365qb-has-sidebar');

    // Expand-Strip (nur sichtbar wenn eingeklappt)
    sb.querySelector('#d365qb-expand').addEventListener('click', () => {
      sb.classList.remove('d365qb-collapsed');
    });

    // Einklappen
    sb.querySelector('#d365qb-collapse').addEventListener('click', () => {
      sb.classList.toggle('d365qb-collapsed');
    });

    // Edit-Toggle
    sb.querySelector('#d365qb-edit-toggle').addEventListener('click', () => {
      editMode = !editMode; renderUI();
    });

    const body = sb.querySelector('#d365qb-body');

    if (editMode) {
      sb.querySelector('#d365qb-add-group').addEventListener('click', () => {
        pinnedItems.push({ type: 'group', id: `g_${Date.now()}`, title: 'Neue Gruppe' });
        stSet({ [pageKey()]: pinnedItems });
        editMode = true; renderUI();
      });
      bindDrag(body);
      bindGroupEdit(body);
      bindEditRemove(body);
    } else {
      sb.querySelector('#d365qb-sidebar-pinmode').addEventListener('click', () => {
        pinMode = !pinMode; applyPinMode();
      });
      body.querySelectorAll('.d365qb-pin-item[data-pid]').forEach(el => {
        const pid = el.getAttribute('data-pid');
        el.querySelector('.d365qb-pin-btn')?.addEventListener('click', () => {
          const item = pinnedItems.find(i => i.id === pid);
          if (item) fireBtn(item);
        });
        el.querySelector('.d365qb-rm-btn')?.addEventListener('click', e => {
          e.stopPropagation();
          pinnedItems = pinnedItems.filter(i => i.id !== pid);
          stSet({ [pageKey()]: pinnedItems });
          renderUI();
        });
      });
    }
  }

  function mkNormalHTML() {
    if (!pinnedItems.length) return `
      <div class="d365qb-empty">
        Noch keine Buttons angepinnt.<br><br>
        <strong>📌 Pin-Modus</strong> aktivieren, dann Ribbon-Tab öffnen und Button anklicken.
      </div>`;
    return pinnedItems.map(it => it.type === 'group'
      ? `<div class="d365qb-grp-hd">${x(it.title)}</div>`
      : `<div class="d365qb-pin-item" data-pid="${it.id}">
           <button class="d365qb-pin-btn" title="${it.tabLabel ? x(it.tabLabel)+': ' : ''}${x(it.label)}">
             <span class="d365qb-lbl">${x(it.label)}</span>
             ${it.tabLabel ? `<span class="d365qb-tab-lbl">${x(it.tabLabel)}</span>` : ''}
           </button>
           <button class="d365qb-rm-btn" title="Entfernen">✕</button>
         </div>`
    ).join('');
  }

  function mkEditHTML() {
    if (!pinnedItems.length) return `<div class="d365qb-empty">Noch keine Buttons angepinnt.</div>`;
    return pinnedItems.map(it => it.type === 'group'
      ? `<div class="d365qb-edit-item d365qb-grp-edit" draggable="true" data-pid="${it.id}">
           <span class="d365qb-drag">⠿</span>
           <input class="d365qb-grp-inp" data-gid="${it.id}" value="${x(it.title)}" placeholder="Gruppenname">
           <button class="d365qb-rm-btn" title="Entfernen">✕</button>
         </div>`
      : `<div class="d365qb-edit-item d365qb-btn-edit" draggable="true" data-pid="${it.id}">
           <span class="d365qb-drag">⠿</span>
           <div class="d365qb-edit-info">
             <span class="d365qb-lbl">${x(it.label)}</span>
             ${it.tabLabel ? `<span class="d365qb-tab-lbl">${x(it.tabLabel)}</span>` : ''}
           </div>
           <button class="d365qb-rm-btn" title="Entfernen">✕</button>
         </div>`
    ).join('');
  }

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  function bindDrag(container) {
    let srcId = null;
    container.querySelectorAll('.d365qb-edit-item').forEach(el => {
      el.addEventListener('dragstart', e => {
        srcId = el.dataset.pid;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => el.classList.add('d365qb-dragging'), 0);
      });
      el.addEventListener('dragend', () => {
        srcId = null;
        el.classList.remove('d365qb-dragging');
        container.querySelectorAll('.d365qb-drop-a,.d365qb-drop-b').forEach(x => x.classList.remove('d365qb-drop-a','d365qb-drop-b'));
      });
      el.addEventListener('dragover', e => {
        e.preventDefault();
        container.querySelectorAll('.d365qb-drop-a,.d365qb-drop-b').forEach(x => x.classList.remove('d365qb-drop-a','d365qb-drop-b'));
        const above = e.clientY < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
        el.classList.add(above ? 'd365qb-drop-a' : 'd365qb-drop-b');
      });
      el.addEventListener('dragleave', () => el.classList.remove('d365qb-drop-a','d365qb-drop-b'));
      el.addEventListener('drop', e => {
        e.preventDefault();
        const tgt = el.dataset.pid;
        if (!srcId || srcId === tgt) return;
        const above = e.clientY < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
        const fi = pinnedItems.findIndex(i => i.id === srcId);
        const [moved] = pinnedItems.splice(fi, 1);
        const ti = pinnedItems.findIndex(i => i.id === tgt);
        pinnedItems.splice(above ? ti : ti + 1, 0, moved);
        stSet({ [pageKey()]: pinnedItems });
        editMode = true; renderUI();
      });
    });
  }

  function bindGroupEdit(container) {
    container.querySelectorAll('.d365qb-grp-inp').forEach(inp => {
      inp.addEventListener('mousedown', e => e.stopPropagation());
      inp.addEventListener('input', () => {
        const it = pinnedItems.find(i => i.id === inp.dataset.gid);
        if (it) { it.title = inp.value; stSet({ [pageKey()]: pinnedItems }); }
      });
    });
  }

  function bindEditRemove(container) {
    container.querySelectorAll('.d365qb-rm-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const el = btn.closest('[data-pid]');
        if (el) {
          pinnedItems = pinnedItems.filter(i => i.id !== el.dataset.pid);
          stSet({ [pageKey()]: pinnedItems });
          editMode = true; renderUI();
        }
      });
    });
  }

  // ── Ribbon-Tab ─────────────────────────────────────────────────────────────
  function rmRibbon() {
    document.getElementById('d365qb-ribbon-tab')?.remove();
    document.getElementById('d365qb-ribbon-btn')?.remove();
  }

  function mkRibbon() {
    const appBar = document.querySelector('.appBar-toolbar');
    if (!appBar) return;

    // Tab-Header-Button
    const tabBtn = document.createElement('button');
    tabBtn.id = 'd365qb-ribbon-btn';
    tabBtn.className = 'appBarTab-header allowFlyoutClickPropagation d365qb-ribbon-hdr-btn';
    tabBtn.type = 'button';
    tabBtn.innerHTML = `<span class="appBarTab-headerLabel allowFlyoutClickPropagation">⚡ QuickBar</span>`;
    appBar.insertBefore(tabBtn, appBar.firstChild);

    // Tab-Inhalt
    const tc = document.createElement('div');
    tc.id = 'd365qb-ribbon-tab';
    tc.className = `appBarTab-content d365qb-ribbon-tc${editMode ? ' d365qb-ribbon-edit' : ''}`;

    let html = '';

    if (editMode) {
      html += `
        <div class="d365qb-ribbon-edit-panel">
          <div class="d365qb-ribbon-edit-hint">⠿ Ziehen zum Sortieren</div>
          <div class="d365qb-ribbon-edit-body" id="d365qb-ribbon-edit-body">${mkEditHTML()}</div>
        </div>`;
    } else {
      // Gruppen aufbauen
      let sections = [], cur = { title: 'QuickBar', buttons: [] };
      pinnedItems.forEach(it => {
        if (it.type === 'group') {
          if (cur.buttons.length) sections.push({ ...cur });
          cur = { title: it.title, buttons: [] };
        } else { cur.buttons.push(it); }
      });
      if (cur.buttons.length) sections.push(cur);

      html += sections.map(sec => `
        <div class="group button-group d365qb-ribbon-group">
          <div class="group_header"><label class="group_title">${x(sec.title)}</label></div>
          <div class="group_content layout-container layout-horizontal">
            ${sec.buttons.map(b => `
              <div class="d365qb-r-item">
                <button class="button dynamicsButton d365qb-r-btn" data-pid="${b.id}"
                  title="${b.tabLabel ? x(b.tabLabel)+': '+x(b.label) : x(b.label)}">
                  <div class="button-container">
                    <span class="button-label">${x(b.label)}</span>
                    ${b.tabLabel ? `<span class="d365qb-r-badge">${x(b.tabLabel)}</span>` : ''}
                  </div>
                </button>
                <button class="d365qb-r-rm" data-pid="${b.id}" title="Entfernen">✕</button>
              </div>`).join('')}
          </div>
        </div>`).join('');
    }

    // Verwaltungsgruppe (immer rechts)
    html += `
      <div class="group button-group d365qb-ribbon-group d365qb-r-mgmt">
        <div class="group_header"><label class="group_title">QuickBar</label></div>
        <div class="group_content layout-container layout-vertical">
          <button class="button dynamicsButton d365qb-manage" id="d365qb-r-edit">
            <div class="button-container">
              <span class="button-label">${editMode ? '✓ Fertig' : '✏️ Bearbeiten'}</span>
            </div>
          </button>
          ${editMode ? `
          <button class="button dynamicsButton d365qb-manage" id="d365qb-r-addgrp">
            <div class="button-container"><span class="button-label">＋ Gruppe</span></div>
          </button>` : ''}
          <button class="button dynamicsButton d365qb-manage" id="d365qb-r-pin">
            <div class="button-container">
              <span class="button-label">${pinMode ? '🔴 Pin-Modus' : '📌 Pin-Modus'}</span>
            </div>
          </button>
        </div>
      </div>`;

    tc.innerHTML = html;
    appBar.parentElement.insertBefore(tc, appBar.nextSibling);

    // Events: Edit-Modus
    if (editMode) {
      const eb = tc.querySelector('#d365qb-ribbon-edit-body');
      if (eb) { bindDrag(eb); bindGroupEdit(eb); bindEditRemove(eb); }
      tc.querySelector('#d365qb-r-addgrp')?.addEventListener('click', () => {
        pinnedItems.push({ type: 'group', id: `g_${Date.now()}`, title: 'Neue Gruppe' });
        stSet({ [pageKey()]: pinnedItems });
        editMode = true; renderUI(); reopenRibbon();
      });
    } else {
      // Events: Normal
      tc.querySelectorAll('.d365qb-r-btn').forEach(btn => {
        const item = pinnedItems.find(i => i.id === btn.dataset.pid);
        btn.addEventListener('click', () => { if (item) fireBtn(item); });
      });
      tc.querySelectorAll('.d365qb-r-rm').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          pinnedItems = pinnedItems.filter(i => i.id !== btn.dataset.pid);
          stSet({ [pageKey()]: pinnedItems });
          renderUI(); reopenRibbon();
        });
      });
    }

    // Edit-Toggle
    tc.querySelector('#d365qb-r-edit')?.addEventListener('click', () => {
      editMode = !editMode; renderUI(); reopenRibbon();
    });

    // Pin-Modus
    tc.querySelector('#d365qb-r-pin')?.addEventListener('click', () => {
      pinMode = !pinMode; applyPinMode();
      const lbl = tc.querySelector('#d365qb-r-pin .button-label');
      if (lbl) lbl.textContent = pinMode ? '🔴 Pin-Modus' : '📌 Pin-Modus';
    });

    // Tab öffnen/schliessen
    tabBtn.addEventListener('click', () => {
      ribbonVisible = !ribbonVisible;
      tc.style.display = ribbonVisible ? 'flex' : 'none';
      tabBtn.classList.toggle('d365qb-r-active', ribbonVisible);
    });
    // Zustand wiederherstellen
    tc.style.display = ribbonVisible ? 'flex' : 'none';
    tabBtn.classList.toggle('d365qb-r-active', ribbonVisible);
  }

  function reopenRibbon() {
    if (!ribbonVisible) return;
    requestAnimationFrame(() => {
      const tc  = document.getElementById('d365qb-ribbon-tab');
      const btn = document.getElementById('d365qb-ribbon-btn');
      if (tc)  tc.style.display = 'flex';
      if (btn) btn.classList.add('d365qb-r-active');
    });
  }

  // ── Original-Button auslösen ───────────────────────────────────────────────
  function fireBtn(pin) {
    let btn = document.getElementById(pin.buttonId);
    if (!btn && pin.controlName) btn = document.querySelector(`[data-dyn-controlname="${pin.controlName}"]`);
    if (!btn) { toast(`⚠️ "${pin.label}" nicht auf dieser Seite gefunden.`); return; }

    const flyout = btn.closest('.appBar-flyout');
    if (flyout) {
      const hidden = getComputedStyle(flyout).display === 'none';
      if (hidden) {
        // Internes Flyout: Tab öffnen
        const tabEl = flyout.closest('.appBarTab');
        const hdr   = tabEl?.querySelector(':scope > button.appBarTab-header')
                    || (flyout.id && document.getElementById(flyout.id.replace(/_flyout$/,''))?.querySelector('button.appBarTab-header'));
        if (hdr) { hdr.click(); setTimeout(() => btn.click(), 250); return; }
      }
    }
    btn.click();
  }

  // ── Seiten-Import (umgeht Firefox-Popup-Fokus-Problem) ───────────────────
  function triggerPageImport() {
    // File-Input direkt in der D365-Seite erstellen, NICHT im Popup.
    // Firefox schliesst den Extension-Popup wenn ein Datei-Dialog öffnet,
    // weshalb change-Events im Popup-Kontext nie ankommen.
    // Durch Erstellen des Inputs in der Seite bleibt der Kontext stabil.
    const inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = '.json';
    inp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;';
    document.body.appendChild(inp);

    inp.addEventListener('change', () => {
      const file = inp.files?.[0];
      inp.remove();
      if (!file) return;

      const reader = new FileReader();
      reader.onerror = () => toast('❌ Datei konnte nicht gelesen werden');
      reader.onload  = async evt => {
        try {
          const data = JSON.parse(evt.target.result);
          if (!data || !Array.isArray(data.pinnedItems))
            throw new Error('Ungültiges Format: pinnedItems fehlt');

          pinnedItems = data.pinnedItems;
          if (data.displayMode) displayMode = data.displayMode;
          await stSet({ [pageKey()]: pinnedItems });
          await stSet({ [SETTINGS_KEY]: { displayMode } });
          renderUI();
          const n = pinnedItems.filter(i => i.type === 'button').length;
          toast(`✅ ${n} Button(s) importiert`);
        } catch (err) {
          toast(`❌ Import fehlgeschlagen: ${err.message}`);
        }
      };
      reader.readAsText(file, 'UTF-8');
    });

    inp.click();
  }

  // ── Hilfsfunktionen ────────────────────────────────────────────────────────
  const x = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function toast(msg) {
    let t = document.getElementById('d365qb-toast');
    if (!t) { t = document.createElement('div'); t.id = 'd365qb-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('d365qb-toast-on');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('d365qb-toast-on'), 2800);
  }

})();
