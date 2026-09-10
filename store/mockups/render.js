/**
 * Renders the store screenshots with headless Chrome.
 * Usage: node store/mockups/render.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dir = __dirname;
const out = path.join(dir, '..', 'screenshots');
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-shot-'));

function shot(file, hash, name, w, h, scale = 1) {
  const url = pathToFileURL(path.join(dir, file)).href + (hash ? '#' + hash : '');
  const target = path.join(out, name);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-lcd-text',
    `--user-data-dir=${profile}`, '--allow-file-access-from-files',
    `--force-device-scale-factor=${scale}`, `--window-size=${w},${h}`,
    '--virtual-time-budget=3000', `--screenshot=${target}`, url,
  ], { stdio: 'ignore' });
  console.log('✓', name);
}

shot('shot.html', 'sidebar', '01-sidebar.png',       1280, 800);
shot('shot.html', 'pin',     '02-pin-mode.png',      1280, 800);
shot('shot.html', 'ribbon',  '03-ribbon-tab.png',    1280, 800);
shot('shot.html', 'edit',    '04-edit-groups.png',   1280, 800);
shot('shot.html', 'popup',   '05-popup.png',         1280, 800);
shot('shot.html', 'import',  '06-import.png',        1280, 800);
shot('popup-en.html', '',    'popup-standalone@2x.png', 286, 512, 2);
shot('promo.html', 'small',   'promo-small-440x280.png',    440, 280);
shot('promo.html', 'marquee', 'promo-marquee-1400x560.png', 1400, 560);

fs.rmSync(profile, { recursive: true, force: true });
