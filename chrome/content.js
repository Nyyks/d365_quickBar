/**
 * D365 QuickBar v2 – Content Script
 * Korrekte Selektoren basierend auf echtem D365 HTML:
 *   - Toolbar-Buttons: .appBar-toolbar .actionGroup button.dynamicsButton
 *   - Tab-Flyout-Buttons: .appBarTab .appBar-flyout .appBarTab-content button.dynamicsButton
 *   - Offener Tab-Flyout: .appBar > .appBar-flyout .appBarTab-content button.dynamicsButton
 */
(function () {
  'use strict';

  // ─── Browser API ──────────────────────────────────────────────────────────
  // Firefox Content Scripts: `browser` ist global (NICHT window.browser!)
  // Chrome Content Scripts: `chrome` ist global
  // window.browser / window.chrome sind undefined in Content Scripts!
  /* global browser, chrome */
  const _api = (typeof browser !== 'undefined' && browser && browser.runtime) ? browser
             : (typeof chrome  !== 'undefined' && chrome  && chrome.runtime)  ? chrome
             : null;

  if (!_api) {
    console.error('D365 QuickBar: Keine Browser-Extension-API gefunden.');
    return;
  }

  const isFirefox = _api === (typeof browser !== 'undefined' ? browser : null);

  function storageGet(keys) {
    if (isFirefox) return _api.storage.local.get(keys);
    return new Promise(r => _api.storage.local.get(keys, r));
  }
  function storageSet(obj) {
    if (isFirefox) return _api.storage.local.set(obj);
    return new Promise(r => _api.storage.local.set(obj, r));
  }

  // ─── State ────────────────────────────────────────────────────────────────
  let pinMode    = false;
  let editMode   = false;
  let displayMode = 'sidebar';
  // pinnedItems: [{type:'button', id, label, controlName, tabLabel, buttonId}]
  //           or [{type:'group',  id, title}]
  let pinnedItems = [];

  const storageKey  = () => `d365qb_v2_${location.pathname.split('/').slice(0, 4).join('_')}`;
  const settingsKey = 'd365qb_settings';

  // ─── KRITISCH: Listener SOFORT registrieren (vor init-Delay) ─────────────
  // Firefox findet die Seite nicht, wenn der Listener erst nach 1500ms aktiv ist.
  listenForMessages();

  // Init mit Verzögerung, damit D365 den Ribbon rendern kann
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
  } else {
    setTimeout(init, 1500);
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  async function init() {
    const data = await storageGet([storageKey(), settingsKey]);
    pinnedItems  = data[storageKey()] || [];
    const settings = data[settingsKey] || {};
    displayMode  = settings.displayMode || 'sidebar';
    pinMode      = false;
    editMode     = false;
    renderUI();
    observeRibbon();
  }

  function savePins()      { return storageSet({ [storageKey()]: pinnedItems }); }
  function saveSettings(s) { return storageSet({ [settingsKey]: s }); }

  // ─── Message Listener ─────────────────────────────────────────────────────
  function listenForMessages() {
    _api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      switch (msg.type) {
        case 'GET_STATE':
          sendResponse({
            displayMode,
            pinMode,
            pinnedCount: pinnedItems.filter(i => i.type === 'button').length
          });
          return true;

        case 'SET_DISPLAY_MODE':
          displayMode = msg.mode;
          saveSettings({ displayMode });
          renderUI();
          sendResponse({ ok: true });
          return true;

        case 'SET_PIN_MODE':
          pinMode = msg.enabled;
          updatePinMode();
          sendResponse({ ok: true });
          return true;

        case 'CLEAR_PINS':
          pinnedItems = [];
          savePins();
          renderUI();
          sendResponse({ ok: true });
          return true;

        case 'EXPORT_PINS':
          sendResponse({ pinnedItems, displayMode, exportedAt: new Date().toISOString() });
          return true;

        case 'IMPORT_PINS':
          try {
            pinnedItems = Array.isArray(msg.data.pinnedItems) ? msg.data.pinnedItems : [];
            if (msg.data.displayMode) displayMode = msg.data.displayMode;
            savePins();
            saveSettings({ displayMode });
            renderUI();
            sendResponse({ ok: true });
          } catch (e) {
            sendResponse({ ok: false, error: e.message });
          }
          return true;
      }
      return true; // Immer true zurückgeben (Firefox-Pflicht)
    });
  }

  // ─── Ribbon Observation ───────────────────────────────────────────────────
  let _overlayTimer = null;
  function observeRibbon() {
    const observer = new MutationObserver(() => {
      if (!pinMode) return;
      clearTimeout(_overlayTimer);
      _overlayTimer = setTimeout(attachPinOverlays, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  // ─── Pin-Modus ────────────────────────────────────────────────────────────
  function updatePinMode() {
    if (pinMode) {
      document.body.classList.add('d365qb-pin-mode');
      attachPinOverlays();
    } else {
      document.body.classList.remove('d365qb-pin-mode');
      removePinOverlays();
    }
    // Sidebar-Button aktualisieren
    const btn = document.getElementById('d365qb-sidebar-pinmode');
    if (btn) btn.textContent = pinMode ? '🔴 Pin-Modus aktiv' : '📌 Pin-Modus';
  }

  function attachPinOverlays() {
    // Echte D365-Struktur (aus HTML-Export):
    //
    //  div.appBar
    //  ├── div.appBar-toolbar
    //  │   ├── div.actionGroup.appBar-button-group      ← immer sichtbare Buttons (Neu, Löschen, ...)
    //  │   │   └── button.dynamicsButton                ← ANPINNBAR
    //  │   ├── div.appBarTab                            ← Tab-Eintrag ("Arbeit", "Person", ...)
    //  │   │   ├── button.appBarTab-header              ← Tab-Klick-Button (NICHT anpinnbar)
    //  │   │   └── div.appBar-flyout                    ← Flyout (hidden: display:none !important)
    //  │   │       └── div.appBarTab-content
    //  │   │           └── button.dynamicsButton        ← ANPINNBAR
    //  │   └── div.actionGroup-right                   ← rechte Toolbar-Buttons (Office, Attach, ...)
    //  │       └── button.dynamicsButton                ← ANPINNBAR
    //  └── div.appBar-flyout (aktuell geöffneter/angepinnter Tab)  ← SIBLING zu .appBar-toolbar!
    //      └── div.appBarTab-content
    //          └── button.dynamicsButton                ← ANPINNBAR
    //
    // Selektor: alle button.dynamicsButton innerhalb .appBar, AUSSER eigene QuickBar-Buttons

    document.querySelectorAll('.appBar button.dynamicsButton:not([data-d365qb-overlay])').forEach(btn => {
      if (btn.closest('#d365qb-ribbon-tab')) return;
      if (btn.classList.contains('d365qb-manage-btn')) return;

      // Nur Buttons mit .button-container (echter D365-Ribbon-Button)
      const container = btn.querySelector('.button-container');
      if (!container) return;

      btn.setAttribute('data-d365qb-overlay', '1');

      const overlay = document.createElement('div');
      overlay.className = 'd365qb-pin-overlay';
      overlay.title = 'In QuickBar anpinnen';
      overlay.textContent = '📌';
      overlay.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        pinButton(btn);
      });

      container.style.position = 'relative';
      container.appendChild(overlay);
    });
  }

  function removePinOverlays() {
    document.querySelectorAll('button[data-d365qb-overlay]').forEach(btn => {
      btn.removeAttribute('data-d365qb-overlay');
      btn.querySelectorAll('.d365qb-pin-overlay').forEach(o => o.remove());
    });
  }

  // ─── Button anpinnen ──────────────────────────────────────────────────────
  function pinButton(btn) {
    // Label: .button-label ist der sichtbare Text
    const labelEl = btn.querySelector('.button-label');
    let label = labelEl ? labelEl.textContent.trim() : '';
    // Fallback: aria-label oder dyn-data-optional-label (für Icon-Only-Buttons)
    if (!label) label = btn.getAttribute('aria-label') || btn.getAttribute('dyn-data-optional-label') || '';
    if (!label) label = 'Unbekannt';

    const controlName = btn.getAttribute('data-dyn-controlname') || btn.getAttribute('name') || btn.id;
    const tabLabel    = getTabLabel(btn);

    if (pinnedItems.find(i => i.type === 'button' && i.controlName === controlName)) {
      showToast(`"${label}" ist bereits angepinnt.`);
      return;
    }

    pinnedItems.push({ type: 'button', id: `pin_${Date.now()}`, label, controlName, tabLabel, buttonId: btn.id });
    savePins();
    renderUI();
    showToast(`📌 "${label}" angepinnt!`);
  }

  // ─── Tab-Label ermitteln ──────────────────────────────────────────────────
  function getTabLabel(btn) {
    // Fall 1: Button in internem Flyout innerhalb .appBarTab
    const appBarTab = btn.closest('.appBarTab');
    if (appBarTab) {
      const el = appBarTab.querySelector(':scope > button.appBarTab-header .appBarTab-headerLabel');
      if (el) return el.textContent.trim();
    }

    // Fall 2: Button in externem Flyout (Sibling zu .appBar-toolbar)
    // Die Flyout-ID ist z.B. "...SystemDefinedOptions_flyout"
    const flyout = btn.closest('.appBar-flyout');
    if (flyout && flyout.id) {
      const tabId = flyout.id.replace(/_flyout$/, '');
      const tabEl = document.getElementById(tabId);
      if (tabEl) {
        const el = tabEl.querySelector('.appBarTab-headerLabel');
        if (el) return el.textContent.trim();
      }
    }

    return ''; // Direkter Toolbar-Button (Neu, Löschen, etc.) – kein Tab
  }

  // ─── UI Rendern ───────────────────────────────────────────────────────────
  function renderUI() {
    removeSidebar();
    removeRibbonTab();
    if (displayMode === 'sidebar') {
      renderSidebar(); // Sidebar immer anzeigen (auch leer, damit Pin-Modus zugänglich ist)
    } else {
      if (pinnedItems.some(i => i.type === 'button')) renderRibbonTab();
    }
  }

  // ─── Sidebar ──────────────────────────────────────────────────────────────
  function removeSidebar() {
    document.getElementById('d365qb-sidebar')?.remove();
    document.body.classList.remove('d365qb-has-sidebar');
  }

  function renderSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = 'd365qb-sidebar';
    if (editMode) sidebar.classList.add('d365qb-edit-mode');

    sidebar.innerHTML = `
      <div class="d365qb-sidebar-header">
        <span class="d365qb-sidebar-title">⚡ QuickBar</span>
        <div class="d365qb-sidebar-hbtns">
          <button class="d365qb-icon-btn" id="d365qb-edit-toggle"
            title="${editMode ? 'Bearbeitung beenden' : 'Bearbeiten'}">${editMode ? '✓' : '✏️'}</button>
          <button class="d365qb-icon-btn" id="d365qb-sidebar-collapse" title="Einklappen">◁</button>
        </div>
      </div>
      <div class="d365qb-sidebar-body" id="d365qb-sidebar-body">
        ${editMode ? buildEditHTML() : buildNormalHTML()}
      </div>
      <div class="d365qb-sidebar-footer">
        ${editMode
          ? `<button class="d365qb-footer-btn" id="d365qb-add-group">＋ Gruppe hinzufügen</button>`
          : `<button class="d365qb-footer-btn" id="d365qb-sidebar-pinmode">
               ${pinMode ? '🔴 Pin-Modus aktiv' : '📌 Pin-Modus'}
             </button>`
        }
      </div>
    `;
    document.body.appendChild(sidebar);
    document.body.classList.add('d365qb-has-sidebar');

    // Header-Buttons
    sidebar.querySelector('#d365qb-edit-toggle').addEventListener('click', () => {
      editMode = !editMode;
      renderUI();
    });
    sidebar.querySelector('#d365qb-sidebar-collapse').addEventListener('click', () => {
      const collapsed = sidebar.classList.toggle('d365qb-sidebar-collapsed');
      sidebar.querySelector('#d365qb-sidebar-collapse').textContent = collapsed ? '▷' : '◁';
    });

    const body = sidebar.querySelector('#d365qb-sidebar-body');

    if (editMode) {
      sidebar.querySelector('#d365qb-add-group').addEventListener('click', () => {
        pinnedItems.push({ type: 'group', id: `grp_${Date.now()}`, title: 'Neue Gruppe' });
        savePins();
        editMode = true;
        renderUI();
      });
      setupDragDrop(body);
      setupGroupEditing(body);
      setupEditRemove(body);
    } else {
      // Pin-Modus Toggle
      sidebar.querySelector('#d365qb-sidebar-pinmode').addEventListener('click', () => {
        pinMode = !pinMode;
        updatePinMode();
        sidebar.querySelector('#d365qb-sidebar-pinmode').textContent =
          pinMode ? '🔴 Pin-Modus aktiv' : '📌 Pin-Modus';
      });
      // Button-Klicks und Entfernen
      body.querySelectorAll('.d365qb-pinned-item[data-pin-id]').forEach(el => {
        const pid = el.getAttribute('data-pin-id');
        el.querySelector('.d365qb-pinned-btn')?.addEventListener('click', () => {
          const item = pinnedItems.find(i => i.id === pid);
          if (item) triggerOriginalButton(item);
        });
        el.querySelector('.d365qb-remove-btn')?.addEventListener('click', e => {
          e.stopPropagation();
          pinnedItems = pinnedItems.filter(i => i.id !== pid);
          savePins();
          renderUI();
        });
      });
    }
  }

  // ─── Sidebar: Normal-Modus HTML ───────────────────────────────────────────
  function buildNormalHTML() {
    if (pinnedItems.length === 0) {
      return `<div class="d365qb-empty">
        Noch keine Buttons angepinnt.<br><br>
        Aktiviere den <strong>Pin-Modus</strong> unten, öffne einen Ribbon-Tab in D365 und klicke 📌 auf einem Button.
      </div>`;
    }
    return pinnedItems.map(item => {
      if (item.type === 'group') {
        return `<div class="d365qb-group-header">${esc(item.title)}</div>`;
      }
      return `
        <div class="d365qb-pinned-item" data-pin-id="${item.id}">
          <button class="d365qb-pinned-btn"
            title="${item.tabLabel ? esc(item.tabLabel) + ': ' : ''}${esc(item.label)}">
            <span class="d365qb-pinned-label">${esc(item.label)}</span>
            ${item.tabLabel ? `<span class="d365qb-pinned-tab">${esc(item.tabLabel)}</span>` : ''}
          </button>
          <button class="d365qb-remove-btn" title="Entfernen">✕</button>
        </div>`;
    }).join('');
  }

  // ─── Sidebar: Edit-Modus HTML ─────────────────────────────────────────────
  function buildEditHTML() {
    if (pinnedItems.length === 0) {
      return `<div class="d365qb-empty">Noch keine Buttons angepinnt.</div>`;
    }
    return pinnedItems.map(item => {
      if (item.type === 'group') {
        return `
          <div class="d365qb-edit-item d365qb-group-edit" draggable="true" data-pin-id="${item.id}">
            <span class="d365qb-drag-handle">⠿</span>
            <input class="d365qb-group-input" data-group-id="${item.id}"
              value="${esc(item.title)}" placeholder="Gruppenname">
            <button class="d365qb-remove-btn" title="Entfernen">✕</button>
          </div>`;
      }
      return `
        <div class="d365qb-edit-item d365qb-btn-edit" draggable="true" data-pin-id="${item.id}">
          <span class="d365qb-drag-handle">⠿</span>
          <div class="d365qb-edit-info">
            <span class="d365qb-pinned-label">${esc(item.label)}</span>
            ${item.tabLabel ? `<span class="d365qb-pinned-tab">${esc(item.tabLabel)}</span>` : ''}
          </div>
          <button class="d365qb-remove-btn" title="Entfernen">✕</button>
        </div>`;
    }).join('');
  }

  // ─── Drag & Drop ──────────────────────────────────────────────────────────
  function setupDragDrop(container) {
    let srcId = null;

    container.querySelectorAll('.d365qb-edit-item').forEach(el => {
      el.addEventListener('dragstart', e => {
        srcId = el.getAttribute('data-pin-id');
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => el.classList.add('d365qb-dragging'), 0);
      });
      el.addEventListener('dragend', () => {
        srcId = null;
        el.classList.remove('d365qb-dragging');
        container.querySelectorAll('.d365qb-drop-above,.d365qb-drop-below').forEach(x => {
          x.classList.remove('d365qb-drop-above', 'd365qb-drop-below');
        });
      });
      el.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.d365qb-drop-above,.d365qb-drop-below').forEach(x => {
          x.classList.remove('d365qb-drop-above', 'd365qb-drop-below');
        });
        const rect = el.getBoundingClientRect();
        el.classList.add(e.clientY < rect.top + rect.height / 2 ? 'd365qb-drop-above' : 'd365qb-drop-below');
      });
      el.addEventListener('dragleave', () => {
        el.classList.remove('d365qb-drop-above', 'd365qb-drop-below');
      });
      el.addEventListener('drop', e => {
        e.preventDefault();
        const tgtId = el.getAttribute('data-pin-id');
        if (!srcId || srcId === tgtId) return;
        const above = e.clientY < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
        const fromIdx = pinnedItems.findIndex(i => i.id === srcId);
        const [moved] = pinnedItems.splice(fromIdx, 1);
        const toIdx = pinnedItems.findIndex(i => i.id === tgtId);
        pinnedItems.splice(above ? toIdx : toIdx + 1, 0, moved);
        savePins();
        editMode = true;
        renderUI();
      });
    });
  }

  function setupGroupEditing(container) {
    container.querySelectorAll('.d365qb-group-input').forEach(input => {
      // Drag nicht beim Tippen
      input.addEventListener('mousedown', e => e.stopPropagation());
      input.addEventListener('input', () => {
        const item = pinnedItems.find(i => i.id === input.getAttribute('data-group-id'));
        if (item) { item.title = input.value; savePins(); }
      });
    });
  }

  function setupEditRemove(container) {
    container.querySelectorAll('.d365qb-remove-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const el = btn.closest('[data-pin-id]');
        if (el) {
          pinnedItems = pinnedItems.filter(i => i.id !== el.getAttribute('data-pin-id'));
          savePins();
          editMode = true;
          renderUI();
        }
      });
    });
  }

  // ─── Ribbon-Tab ───────────────────────────────────────────────────────────
  function removeRibbonTab() {
    document.getElementById('d365qb-ribbon-tab')?.remove();
    document.getElementById('d365qb-ribbon-tab-btn')?.remove();
  }

  function renderRibbonTab() {
    const appBar = document.querySelector('.appBar-toolbar');
    if (!appBar) return;

    // Tab-Header-Button
    const tabBtn = document.createElement('button');
    tabBtn.id        = 'd365qb-ribbon-tab-btn';
    tabBtn.className = 'appBarTab-header allowFlyoutClickPropagation d365qb-ribbon-tab-btn';
    tabBtn.type      = 'button';
    tabBtn.innerHTML = `<span class="appBarTab-headerLabel allowFlyoutClickPropagation">⚡ QuickBar</span>`;
    appBar.insertBefore(tabBtn, appBar.firstChild);

    // Tab-Inhalt
    const tabContent = document.createElement('div');
    tabContent.id        = 'd365qb-ribbon-tab';
    tabContent.className = 'appBarTab-content d365qb-ribbon-tab-content';

    // Gruppen aus pinnedItems aufbauen
    const sections = buildRibbonSections();
    let html = sections.map(sec => `
      <div class="group button-group d365qb-ribbon-group">
        <div class="group_header"><label class="group_title">${esc(sec.title)}</label></div>
        <div class="group_content layout-container layout-horizontal">
          ${sec.buttons.map(b => `
            <div class="d365qb-ribbon-item">
              <button class="button dynamicsButton d365qb-ribbon-pinned-btn" data-pin-id="${b.id}"
                title="${b.tabLabel ? esc(b.tabLabel) + ': ' + esc(b.label) : esc(b.label)}">
                <div class="button-container">
                  <span class="button-label">${esc(b.label)}</span>
                  ${b.tabLabel ? `<span class="d365qb-ribbon-badge">${esc(b.tabLabel)}</span>` : ''}
                </div>
              </button>
              <button class="d365qb-ribbon-remove" data-pin-id="${b.id}" title="Entfernen">✕</button>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    // Verwaltungsgruppe
    html += `
      <div class="group button-group d365qb-ribbon-group">
        <div class="group_header"><label class="group_title">Verwaltung</label></div>
        <div class="group_content">
          <button class="button dynamicsButton d365qb-manage-btn" id="d365qb-ribbon-pinmode">
            <div class="button-container">
              <span class="button-label">${pinMode ? '🔴 Pin-Modus' : '📌 Pin-Modus'}</span>
            </div>
          </button>
        </div>
      </div>`;

    tabContent.innerHTML = html;
    appBar.parentElement.insertBefore(tabContent, appBar.nextSibling);

    // Events
    tabContent.querySelectorAll('.d365qb-ribbon-pinned-btn').forEach(btn => {
      const item = pinnedItems.find(i => i.id === btn.getAttribute('data-pin-id'));
      btn.addEventListener('click', () => { if (item) triggerOriginalButton(item); });
    });
    tabContent.querySelectorAll('.d365qb-ribbon-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        pinnedItems = pinnedItems.filter(i => i.id !== btn.getAttribute('data-pin-id'));
        savePins(); renderUI();
      });
    });
    tabContent.querySelector('#d365qb-ribbon-pinmode')?.addEventListener('click', () => {
      pinMode = !pinMode;
      updatePinMode();
      tabContent.querySelector('#d365qb-ribbon-pinmode .button-label').textContent =
        pinMode ? '🔴 Pin-Modus' : '📌 Pin-Modus';
    });

    // Tab-Sichtbarkeit
    let visible = false;
    tabBtn.addEventListener('click', () => {
      visible = !visible;
      tabContent.style.display = visible ? 'flex' : 'none';
      tabBtn.classList.toggle('d365qb-tab-active', visible);
    });
    tabContent.style.display = 'none';
  }

  function buildRibbonSections() {
    const sections = [];
    let current = { title: 'QuickBar', buttons: [] };
    pinnedItems.forEach(item => {
      if (item.type === 'group') {
        if (current.buttons.length) sections.push({ ...current });
        current = { title: item.title, buttons: [] };
      } else {
        current.buttons.push(item);
      }
    });
    if (current.buttons.length) sections.push(current);
    return sections;
  }

  // ─── Original-Button auslösen ─────────────────────────────────────────────
  function triggerOriginalButton(pin) {
    let btn = document.getElementById(pin.buttonId);
    if (!btn && pin.controlName) {
      btn = document.querySelector(`[data-dyn-controlname="${pin.controlName}"]`);
    }
    if (!btn) {
      showToast(`⚠️ "${pin.label}" nicht auf dieser Seite gefunden.`);
      return;
    }

    // Wenn der Button in einem ausgeblendeten Flyout liegt: Tab zuerst öffnen
    const flyout = btn.closest('.appBar-flyout');
    if (flyout) {
      const cs = getComputedStyle(flyout);
      const hidden = cs.display === 'none' || flyout.style.cssText.includes('display: none');
      if (hidden) {
        // Fall 1: internes Flyout (.appBarTab > .appBar-flyout)
        const appBarTab = flyout.closest('.appBarTab');
        if (appBarTab) {
          const header = appBarTab.querySelector(':scope > button.appBarTab-header');
          if (header) { header.click(); setTimeout(() => btn.click(), 250); return; }
        }
        // Fall 2: externes Flyout (ID endet auf _flyout)
        if (flyout.id) {
          const tabEl = document.getElementById(flyout.id.replace(/_flyout$/, ''));
          if (tabEl) {
            const header = tabEl.querySelector('button.appBarTab-header');
            if (header) { header.click(); setTimeout(() => btn.click(), 250); return; }
          }
        }
      }
    }
    btn.click();
  }

  // ─── Hilfsfunktionen ──────────────────────────────────────────────────────
  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function showToast(msg) {
    let t = document.getElementById('d365qb-toast');
    if (!t) { t = document.createElement('div'); t.id = 'd365qb-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('d365qb-toast-visible');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('d365qb-toast-visible'), 2800);
  }

})();
