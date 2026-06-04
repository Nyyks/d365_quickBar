# D365 QuickBar – Browser Extension

## Projektbeschrieb

**D365 QuickBar** ist eine Browser-Erweiterung für Chrome und Firefox, die das Arbeiten in Microsoft Dynamics 365 Finance & Operations effizienter macht.

### Problem
In D365 F&O sind Funktionen auf mehrere Ribbon-Tabs verteilt. Häufig genutzte Buttons liegen auf verschiedenen Seiten, was unnötige Navigation erfordert.

### Lösung
D365 QuickBar ermöglicht es, beliebige Ribbon-Buttons aus D365 anzupinnen und zentral erreichbar zu machen – entweder als:
- **Sidebar** (rechts eingeblendet, immer sichtbar)
- **Eigener Ribbon-Tab** ("QuickBar"-Tab direkt im Ribbon)

---

## Features

- 📌 **Pin-Modus**: Hover über beliebigen Ribbon-Button → Pin-Icon erscheint → Klick = angepinnt
- 🗂️ **Zwei Darstellungsmodi**: Sidebar oder eigener Ribbon-Tab
- 💾 **Persistenz**: Gepinnte Buttons werden pro D365-Seite (URL-Pfad) gespeichert
- 🗑️ **Verwaltung**: Pins können im Popup oder direkt in der Sidebar/im Tab entfernt werden
- 🌐 **Mehrsprachig**: Funktioniert mit deutschen und englischen D365-Instanzen

---

## Projektstruktur

```
d365-quickbar/
├── README.md               ← Diese Datei
├── chrome/                 ← Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js
│   ├── content.css
│   ├── popup.html
│   ├── popup.js
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── firefox/                ← Firefox Extension (Manifest V2)
    ├── manifest.json
    ├── content.js
    ├── content.css
    ├── popup.html
    ├── popup.js
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

---

## Installation (Entwicklermodus)

### Chrome
1. `chrome://extensions/` öffnen
2. "Entwicklermodus" aktivieren (oben rechts)
3. "Entpackte Erweiterung laden" → Ordner `chrome/` auswählen

### Firefox
1. `about:debugging#/runtime/this-firefox` öffnen
2. "Temporäre Erweiterung laden"
3. Datei `firefox/manifest.json` auswählen

---

## Verwendung

1. D365 F&O im Browser öffnen
2. Extension-Icon klicken → Darstellungsmodus wählen (Sidebar / Ribbon-Tab)
3. **Pin-Modus aktivieren**: Im Popup "Pin-Modus" einschalten
4. Ribbon-Button im D365 hovern → 📌 erscheint → Klicken zum Anpinnen
5. Pin-Modus deaktivieren → Buttons erscheinen in Sidebar oder QuickBar-Tab

---

## Technische Details

- **Manifest V3** (Chrome) / **Manifest V2** (Firefox)
- Kommunikation via `chrome.storage.local` / `browser.storage.local`
- Content Script injiziert sich auf `*.dynamics.com`-Seiten
- Mutation Observer erkennt dynamisch geladene Ribbon-Inhalte
- Kein externes Framework, reines Vanilla JS

---

## Bekannte Einschränkungen

- D365 lädt Ribbon-Inhalte dynamisch (per AJAX). Der Mutation Observer stellt sicher, dass neue Tabs erkannt werden.
- Die geklonten Buttons rufen die originalen D365-Click-Handler auf (`click`-Event auf dem Original-Button).
- Bei D365-Updates kann sich die HTML-Struktur ändern. Selektoren ggf. anpassen (`appBar-toolbar`, `.dynamicsButton`).
