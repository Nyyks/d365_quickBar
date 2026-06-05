/**
 * D365 QuickBar v2 – Popup Script
 * Kompatibel mit Chrome MV3 und Firefox MV3.
 * In Extension-Popup-Seiten sind `browser` (Firefox) und `chrome` (Chrome) globale Variablen.
 */
(function () {
  'use strict';

  /* global browser, chrome */

  // ── Browser-API ─────────────────────────────────────────────────────────────
  const _api = (typeof browser !== 'undefined' && browser?.runtime) ? browser
             : (typeof chrome  !== 'undefined' && chrome?.runtime)  ? chrome
             : null;

  if (!_api) { console.error('D365 QuickBar Popup: Keine Extension-API.'); return; }

  const isFF = (_api === (typeof browser !== 'undefined' ? browser : null));

  // Tabs-Query: immer Promise zurückgeben
  function queryTabs(opts) {
    if (isFF) return _api.tabs.query(opts);
    return new Promise(r => _api.tabs.query(opts, r));
  }

  // Nachricht an Content Script senden
  function sendMsg(tabId, msg) {
    if (isFF) return _api.tabs.sendMessage(tabId, msg);
    return new Promise((res, rej) =>
      _api.tabs.sendMessage(tabId, msg, resp => {
        if (_api.runtime.lastError) rej(_api.runtime.lastError);
        else res(resp);
      })
    );
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────
  const statusDiv   = document.getElementById('status');
  const statusIcon  = document.getElementById('status-icon');
  const statusText  = document.getElementById('status-text');
  const pinToggle   = document.getElementById('pin-toggle');
  const pinCount    = document.getElementById('pin-count');
  const clearBtn    = document.getElementById('clear-btn');
  const exportBtn   = document.getElementById('export-btn');
  const importBtn   = document.getElementById('import-btn');
  const ieStatus    = document.getElementById('ie-status');
  const modeButtons = document.querySelectorAll('.mode');

  let currentTab = null;

  // ── Init ────────────────────────────────────────────────────────────────────
  async function init() {
    // Aktiven Tab ermitteln
    let tabs;
    try { tabs = await queryTabs({ active: true, currentWindow: true }); }
    catch (_) { /* Ignorieren */ }
    currentTab = tabs?.[0] ?? null;

    if (!currentTab) {
      setStatus('⚠️', 'Kein Tab gefunden', true);
      disableAll(); return;
    }

    // Schnell-Check via URL (nur wenn Tabs-Permission URL liefert)
    const urlOk = currentTab.url?.includes('.dynamics.com') ?? false;

    // Content Script kontaktieren – wenn es antwortet, ist D365 bestätigt
    try {
      const state = await sendMsg(currentTab.id, { type: 'GET_STATE' });
      if (state) {
        setStatus('✅', 'Dynamics 365 erkannt', false);
        setMode(state.displayMode);
        pinToggle.checked    = state.pinMode;
        pinCount.textContent = state.pinnedCount;
        return; // Erfolgreich
      }
    } catch (_) { /* Content Script nicht erreichbar */ }

    // Content Script hat nicht geantwortet
    if (urlOk) {
      setStatus('🔄', 'Seite neu laden, um QuickBar zu aktivieren', true);
    } else {
      setStatus('⚠️', 'Keine D365-Seite erkannt', true);
    }
    disableAll();
  }

  function setStatus(icon, text, warn) {
    statusIcon.textContent = icon;
    statusText.textContent = text;
    statusDiv.classList.toggle('warn', warn);
  }

  function setMode(mode) {
    modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  }

  function disableAll() {
    [pinToggle, clearBtn, exportBtn].forEach(el => el.disabled = true);
    if (importBtn) { importBtn.style.opacity = '0.5'; importBtn.style.pointerEvents = 'none'; }
    modeButtons.forEach(b => { b.style.opacity = '.5'; b.style.pointerEvents = 'none'; });
  }

  // ── Events ──────────────────────────────────────────────────────────────────
  modeButtons.forEach(btn => btn.addEventListener('click', async () => {
    setMode(btn.dataset.mode);
    await send({ type: 'SET_DISPLAY_MODE', mode: btn.dataset.mode });
  }));

  pinToggle.addEventListener('change', async () =>
    send({ type: 'SET_PIN_MODE', enabled: pinToggle.checked })
  );

  clearBtn.addEventListener('click', async () => {
    if (!confirm('Alle gepinnten Buttons für diese Seite löschen?')) return;
    await send({ type: 'CLEAR_PINS' });
    pinCount.textContent = '0';
  });

  // ── Export ──────────────────────────────────────────────────────────────────
  exportBtn.addEventListener('click', async () => {
    try {
      const data = await send({ type: 'EXPORT_PINS' });
      if (!data) return showIE('❌ Export fehlgeschlagen', true);

      const json  = JSON.stringify(data, null, 2);
      const date  = new Date().toISOString().split('T')[0];
      const fname = `d365-quickbar-${date}.json`;
      const blob  = new Blob([json], { type: 'application/json' });
      const url   = URL.createObjectURL(blob);
      const a     = Object.assign(document.createElement('a'), { href: url, download: fname });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showIE(`✅ ${fname}`, false);
    } catch (e) { showIE('❌ Export fehlgeschlagen', true); }
  });

  // ── Import ──────────────────────────────────────────────────────────────────
  // Import läuft im Kontext der D365-Seite (Content Script), nicht im Popup.
  // Grund: Firefox schliesst Popup beim Öffnen des Datei-Dialogs → change-Event
  // kommt nie an. Content Script erstellt den File-Input direkt in der Seite.
  importBtn.addEventListener('click', async () => {
    const resp = await send({ type: 'TRIGGER_IMPORT' });
    if (!resp) showIE('❌ Kein D365-Tab aktiv – Seite neu laden', true);
    else        showIE('📂 Datei auswählen… Ergebnis erscheint als Toast auf der Seite', false);
  });


  // ── Hilfsfunktionen ─────────────────────────────────────────────────────────
  async function send(msg) {
    if (!currentTab) return null;
    try { return await sendMsg(currentTab.id, msg); }
    catch (e) { console.warn('D365 QuickBar:', e); return null; }
  }

  function showIE(msg, isErr) {
    ieStatus.textContent = msg;
    ieStatus.className   = isErr ? 'err' : '';
    clearTimeout(ieStatus._t);
    ieStatus._t = setTimeout(() => { ieStatus.textContent = ''; ieStatus.className = ''; }, 5000);
  }

  init();
})();
