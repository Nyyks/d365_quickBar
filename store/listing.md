# D365 QuickBar – Store Listing (EN)

Copy/paste text for the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (AMO).
Everything inside the code blocks is plain text (no Markdown), because the stores don't render Markdown.

---

## Name

```
D365 QuickBar
```

## Short description / summary

Chrome Web Store (max. 132 characters). **Chrome takes this from `"description"` in `manifest.json`**, so update the manifest too:

```
Pin your most-used Dynamics 365 Finance & Operations ribbon buttons to a sidebar or your own QuickBar ribbon tab.
```

Firefox AMO summary (max. 250 characters) / Edge short description:

```
Stop hunting through ribbon tabs in Dynamics 365 Finance & Operations. Pin any action pane button once and reach it with one click – in a collapsible sidebar or in your own QuickBar ribbon tab. Organize pins in groups and share your setup via import/export.
```

## Detailed description

```
D365 QuickBar puts the Dynamics 365 Finance & Operations buttons you use every day in one place.

In D365 F&O, actions are spread across many ribbon (action pane) tabs. Confirming an order, posting a packing slip and creating an invoice can mean clicking through several tabs – every single time. QuickBar lets you pin those buttons once and reach them with a single click from then on.

HOW IT WORKS
1. Open Dynamics 365 F&O and turn on Pin mode – in the extension popup or directly in QuickBar.
2. Open any ribbon tab: every button now shows a small 📌 pin icon.
3. Click the pin – the button is added to your QuickBar.
4. Turn Pin mode off and start working. When you click a pinned button, QuickBar opens the right ribbon tab and triggers the original D365 button for you.

FEATURES
• Pin any ribbon button – standard and custom action pane buttons
• Two display modes: a collapsible sidebar on the right, or a "⚡ QuickBar" tab inserted directly into the D365 ribbon
• Groups – organize your pins into named sections like "Daily routine" or "Warehouse"
• Drag & drop – reorder buttons and groups in edit mode
• Every pin shows the ribbon tab it came from, so you always know where it lives
• Remove single pins with one click, or clear them all at once
• Import / Export – save your setup as a JSON file, move it to another PC or share it with your team
• Works with English, German and other D365 UI languages
• Pins and display mode are saved and restored automatically

PRIVACY
• No account, no tracking, no analytics
• Your pins are stored locally in your browser's extension storage – nothing is sent to any server
• The extension only runs on *.dynamics.com pages

Available for Chrome, Microsoft Edge and Firefox.

D365 QuickBar is an independent project and is not affiliated with, sponsored or endorsed by Microsoft. Microsoft and Dynamics 365 are trademarks of the Microsoft group of companies.
```

## Screenshot captions

Use these as AMO screenshot captions (and as reference for the order of uploads).

| File | Caption |
|---|---|
| `01-sidebar.png` | Sidebar mode – your pinned buttons, organized in groups, always one click away. |
| `02-pin-mode.png` | Pin mode – open any ribbon tab and click 📌 to add a button to QuickBar. |
| `03-ribbon-tab.png` | Ribbon-tab mode – a QuickBar tab right inside the D365 action pane. |
| `04-edit-groups.png` | Edit mode – rename groups and reorder buttons with drag & drop. |
| `05-popup.png` | The popup – switch display mode, toggle pin mode, clear pins, import or export. The sidebar is collapsed to a slim strip. |
| `06-import.png` | Import a shared configuration from a JSON file. |

---

## Category & tags

| Store | Category |
|---|---|
| Chrome Web Store | Productivity → Workflow & Planning |
| Edge Add-ons | Productivity |
| Firefox AMO | Other (AMO has no productivity category) |

Tags / keywords (AMO allows tags):

```
dynamics 365, d365, finance and operations, erp, microsoft dynamics, ribbon, action pane, toolbar, productivity
```

---

## Privacy / permission justifications (Chrome "Privacy practices" tab, Edge, AMO reviewer notes)

**Single purpose**

```
D365 QuickBar lets users pin frequently used Dynamics 365 Finance & Operations ribbon buttons into a sidebar or a custom ribbon tab for one-click access.
```

**storage**

```
Stores the user's pinned buttons, groups and display-mode setting locally in extension storage.
```

**activeTab**

```
Lets the popup communicate with the currently open Dynamics 365 tab to read and change QuickBar state (pin mode, display mode, clear pins, export).
```

**Host permission `*://*.dynamics.com/*`**

```
The content script that adds the QuickBar sidebar / ribbon tab and the pin icons must run on Dynamics 365 Finance & Operations pages, which are hosted on *.dynamics.com (e.g. *.operations.dynamics.com). The extension does not run on any other site.
```

**tabs** (Firefox manifest only)

```
The import page needs to find the open Dynamics 365 tab so it can send the imported configuration to it.
```

**Remote code:** No, all code ships in the package.

**Data usage:** No user data is collected or transmitted. Leave all data-type checkboxes unchecked and confirm the three certifications (not sold to third parties, not used for unrelated purposes, not used for creditworthiness/lending).

---

## Image assets

All files are in `store/screenshots/`. Regenerate with `node store/mockups/render.js`.

| File | Size | Use |
|---|---|---|
| `01`–`05` | 1280×800 | Chrome (max. 5 screenshots), Edge, AMO |
| `06-import.png` | 1280×800 | Edge, AMO (Chrome allows only 5) |
| `promo-small-440x280.png` | 440×280 | Chrome small promo tile, Edge small promotional tile |
| `promo-marquee-1400x560.png` | 1400×560 | Chrome marquee, Edge large promotional tile (optional) |
| `popup-standalone@2x.png` | 572×1024 | Popup on its own, for README / docs |
| `chrome/icons/icon128.png` | 128×128 | Store icon |
