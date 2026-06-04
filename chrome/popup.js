/**
 * D365 QuickBar v2 – Popup Script
 * Chrome (MV3, chrome.*-Callbacks) und Firefox (MV2, browser.*-Promises)
 */
(function () {
  'use strict';

  // ─── Browser-Wrapper ──────────────────────────────────────────────────────
  // Firefox Extension Pages (popup): `browser` ist global (Promise-basiert)
  // Chrome Extension Pages (popup): `chrome` ist global (Callback-basiert)
  /* global browser, chrome */
  const _api = (typeof browser !== 'undefined' && browser?.runtime) ? browser
             : (typeof chrome  !== 'undefined' && chrome?.runtime)  ? chrome
             : null;
  const isFirefox = _api && (typeof browser !== 'undefined') && _api === browser;

  function queryTabs(opts) {
    if (isFirefox) return _api.tabs.query(opts);
    return new Promise(r => _api.tabs.query(opts, r));
  }
  function sendMsg(tabId, msg) {
    if (isFirefox) return _api.tabs.sendMessage(tabId, msg);
    return new Promise((res, rej) =>
      _api.tabs.sendMessage(tabId, msg, resp => {
        if (_api.runtime.lastError) rej(_api.runtime.lastError);
        else res(resp);
      })
    );
  }

  // ─── DOM ──────────────────────────────────────────────────────────────────
  const statusDiv   = document.getElementById('status');
  const statusIcon  = document.getElementById('status-icon');
  const statusText  = document.getElementById('status-text');
  const pinToggle   = document.getElementById('pin-toggle');
  const pinCount    = document.getElementById('pin-count');
  const clearBtn    = document.getElementById('clear-btn');
  const exportBtn   = document.getElementById('export-btn');
  const importBtn   = document.getElementById('import-btn');
  const importFile  = document.getElementById('import-file');
  const ieStatus    = document.getElementById('ie-status');
  const modeButtons = document.querySelectorAll('.mode');

  let currentTab = null;
  let d365Active  = false;

  // ─── Init ─────────────────────────────────────────────────────────────────
  async function init() {
    let tabs;
    try { tabs = await queryTabs({ active: true, currentWindow: true }); } catch (_) {}
    currentTab = tabs?.[0] || null;

    // Schritt 1: URL-Prüfung (nur wenn Tab-URL verfügbar)
    if (currentTab?.url) {
      d365Active = currentTab.url.includes('.dynamics.com');
    }

    // Schritt 2: Content-Script kontaktieren
    // Wenn das Script antwortet, ist D365 definitiv aktiv.
    // Wenn nicht (Fehler), zeigen wir "neu laden" NUR wenn URL-Check positiv war.
    if (currentTab) {
      try {
        const state = await sendMsg(currentTab.id, { type: 'GET_STATE' });
        if (state) {
          d365Active = true; // Script hat geantwortet → sicher D365
          updateMode(state.displayMode);
          pinToggle.checked = state.pinMode;
          pinCount.textContent = state.pinnedCount;
          setStatus('✅', 'Dynamics 365 erkannt', false);
        }
      } catch (_) {
        if (d365Active) {
          // URL zeigt D365, aber Script antwortet nicht → Seite neu laden
          setStatus('🔄', 'Seite neu laden, um QuickBar zu aktivieren', true);
        } else {
          setStatus('⚠️', 'Keine D365-Seite erkannt', true);
        }
        disableControls();
        return;
      }
    } else {
      setStatus('⚠️', 'Kein aktiver Tab gefunden', true);
      disableControls();
      return;
    }
  }

  function setStatus(icon, text, warn) {
    statusIcon.textContent = icon;
    statusText.textContent = text;
    statusDiv.classList.toggle('warn', !!warn);
  }

  function updateMode(mode) {
    modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  }

  function disableControls() {
    pinToggle.disabled = true;
    clearBtn.disabled  = true;
    exportBtn.disabled = true;
    importBtn.disabled = true;
    modeButtons.forEach(b => { b.style.opacity = '.5'; b.style.pointerEvents = 'none'; });
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  modeButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      updateMode(btn.dataset.mode);
      await send({ type: 'SET_DISPLAY_MODE', mode: btn.dataset.mode });
    });
  });

  pinToggle.addEventListener('change', async () => {
    await send({ type: 'SET_PIN_MODE', enabled: pinToggle.checked });
  });

  clearBtn.addEventListener('click', async () => {
    if (!confirm('Alle gepinnten Buttons für diese Seite löschen?')) return;
    await send({ type: 'CLEAR_PINS' });
    pinCount.textContent = '0';
  });

  // ─── Export ───────────────────────────────────────────────────────────────
  exportBtn.addEventListener('click', async () => {
    try {
      const data = await send({ type: 'EXPORT_PINS' });
      if (!data) { showIEStatus('❌ Export fehlgeschlagen', true); return; }

      const json = JSON.stringify(data, null, 2);
      const date = new Date().toISOString().split('T')[0];
      const fname = `d365-quickbar-${date}.json`;

      // Download via Blob-URL (funktioniert in Extension-Popups)
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      showIEStatus(`✅ Exportiert: ${fname}`, false);
    } catch (e) {
      showIEStatus('❌ Export fehlgeschlagen', true);
    }
  });

  // ─── Import ───────────────────────────────────────────────────────────────
  importBtn.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validierung
      if (!Array.isArray(data.pinnedItems)) throw new Error('Ungültiges Format');

      const resp = await send({ type: 'IMPORT_PINS', data });
      if (resp?.ok) {
        pinCount.textContent = data.pinnedItems.filter(i => i.type === 'button').length;
        if (data.displayMode) updateMode(data.displayMode);
        showIEStatus(`✅ ${data.pinnedItems.filter(i=>i.type==='button').length} Buttons importiert`, false);
      } else {
        showIEStatus('❌ Import fehlgeschlagen', true);
      }
    } catch (err) {
      showIEStatus(`❌ Ungültige Datei: ${err.message}`, true);
    }
    e.target.value = '';
  });

  // ─── Hilfsfunktionen ──────────────────────────────────────────────────────
  async function send(msg) {
    if (!currentTab) return null;
    try { return await sendMsg(currentTab.id, msg); }
    catch (e) { console.warn('D365 QuickBar:', e); return null; }
  }

  function showIEStatus(msg, isErr) {
    ieStatus.textContent = msg;
    ieStatus.className = isErr ? 'err' : '';
    setTimeout(() => { ieStatus.textContent = ''; ieStatus.className = ''; }, 4000);
  }

  init();
})();
