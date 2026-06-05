/**
 * D365 QuickBar – Import Page Script
 * Läuft in der eigenen Extension-Seite (nicht im Popup).
 * Popup schliesst sich wenn File-Dialog öffnet → separate Seite umgeht das.
 */
(function () {
  'use strict';

  /* global browser, chrome */
  const _api = (typeof browser !== 'undefined' && browser?.runtime) ? browser
             : (typeof chrome  !== 'undefined' && chrome?.runtime)  ? chrome
             : null;
  const isFF = _api && typeof browser !== 'undefined' && _api === browser;

  const fileInput = document.getElementById('import-file');
  const status    = document.getElementById('status');

  function showStatus(msg, type) {
    status.textContent = msg;
    status.className   = type; // 'ok', 'err', 'inf'
  }

  function queryTabs(opts) {
    if (isFF) return _api.tabs.query(opts);
    return new Promise(r => _api.tabs.query(opts, r));
  }
  function sendMsg(tabId, msg) {
    if (isFF) return _api.tabs.sendMessage(tabId, msg);
    return new Promise((res, rej) =>
      _api.tabs.sendMessage(tabId, msg, resp => {
        if (_api.runtime.lastError) rej(_api.runtime.lastError);
        else res(resp);
      })
    );
  }

  fileInput.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    showStatus('⏳ Lese Datei…', 'inf');

    try {
      // Datei lesen
      const text = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = ev => res(ev.target.result);
        r.onerror = () => rej(new Error('Datei konnte nicht gelesen werden'));
        r.readAsText(file, 'UTF-8');
      });

      // JSON parsen
      let data;
      try { data = JSON.parse(text); }
      catch (_) { throw new Error('Ungültiges JSON'); }

      if (!data || !Array.isArray(data.pinnedItems))
        throw new Error('Ungültiges Format: pinnedItems fehlt');

      showStatus('🔍 Suche D365-Tab…', 'inf');

      // D365-Tab finden
      const tabs = await queryTabs({ url: '*://*.dynamics.com/*' });
      if (!tabs || tabs.length === 0)
        throw new Error('Kein D365-Tab gefunden – bitte D365 öffnen und erneut versuchen');

      const d365Tab = tabs[0];
      showStatus('📤 Sende Daten…', 'inf');

      // Import ans Content Script senden
      const resp = await sendMsg(d365Tab.id, { type: 'IMPORT_PINS', data });

      if (resp?.ok) {
        const n = data.pinnedItems.filter(i => i.type === 'button').length;
        showStatus(`✅ ${n} Button(s) erfolgreich importiert! Diese Seite schliesst sich…`, 'ok');
        setTimeout(() => window.close(), 2000);
      } else {
        throw new Error(resp?.error || 'Content Script meldet Fehler');
      }

    } catch (err) {
      showStatus(`❌ ${err.message}`, 'err');
    }

    fileInput.value = '';
  });
})();
