/**
 * Builds a mock D365 F&O list page plus the QuickBar UI (same markup/classes as
 * chrome/content.js, English labels) for store screenshots.
 * Scene is chosen via URL hash: #sidebar | #pin | #ribbon | #edit | #popup
 */
(function () {
  'use strict';

  const scene = (location.hash || '#sidebar').slice(1);
  const x = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const I = hex => `<i class="mdl">&#x${hex};</i>`;

  // ── Dummy pins (same shape as pinnedItems in content.js) ───────────────────
  const pins = [
    { type: 'group',  id: 'g1', title: 'Daily routine' },
    { type: 'button', id: 'p1', label: 'Confirmation',          tabLabel: 'Sell' },
    { type: 'button', id: 'p2', label: 'Packing slip',          tabLabel: 'Sell' },
    { type: 'button', id: 'p3', label: 'Invoice',               tabLabel: 'Sell' },
    { type: 'group',  id: 'g2', title: 'Order handling' },
    { type: 'button', id: 'p4', label: 'Copy from all',         tabLabel: 'Sales order' },
    { type: 'button', id: 'p5', label: 'Delivery date control', tabLabel: 'Sell' },
    { type: 'button', id: 'p6', label: 'Totals',                tabLabel: 'Sell' },
    { type: 'group',  id: 'g3', title: 'Warehouse' },
    { type: 'button', id: 'p7', label: 'Release to warehouse',  tabLabel: 'Warehouse' },
    { type: 'button', id: 'p8', label: 'Reservation',           tabLabel: 'Warehouse' },
  ];
  if (scene === 'pin') pins.push({ type: 'button', id: 'p9', label: 'Picking list', tabLabel: 'Sell' });

  // ── Dummy sales orders ─────────────────────────────────────────────────────
  const customers = [
    ['US-004', 'Alpine Outdoor Supply'],   ['US-011', 'Blue Harbor Retail'],
    ['US-017', 'Cedar Ridge Wholesale'],   ['US-002', 'Northwind Traders'],
    ['US-023', 'Fabrikam Electronics'],    ['US-008', 'Lakeside Furniture'],
    ['US-031', 'Summit Industrial Parts'], ['US-014', 'Greenfield Foods'],
    ['US-027', 'Harbor Point Marine'],     ['US-019', 'Maple Street Hardware'],
    ['US-036', 'Riverbend Logistics'],     ['US-005', 'Oakwood Office Supply'],
    ['US-042', 'Silverline Tools'],        ['US-029', 'Brightway Medical'],
    ['US-012', 'Pioneer Agriculture'],     ['US-038', 'Coastal Beverage Co.'],
    ['US-021', 'Redwood Construction'],    ['US-033', 'Evergreen Garden Center'],
    ['US-045', 'Ironclad Machinery'],      ['US-009', 'Sunrise Bakery Supply'],
  ];
  const statuses = [
    ['Open order', 'Open'], ['Open order', 'Released'], ['Delivered', 'Released'],
    ['Invoiced', 'Released'], ['Open order', 'Partially released'], ['Backorder', 'Open'],
  ];
  const rows = customers.map(([acc, name], i) => {
    const [status, release] = statuses[(i * 5) % statuses.length];
    const amount = ((i * 7919) % 48000 + 1250 + (i % 4) * 0.25).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const day = 28 - (i % 18);
    return {
      so: `SO-0${13062 - i * 3}`, acc, name, status, release, amount,
      type: i % 7 === 3 ? 'Return order' : 'Sales order',
      date: `${day > 10 ? 9 : 10}/${day > 10 ? day - 10 : day + 2}/2026`,
      mode: ['Ground', 'Air', 'Truck', 'Parcel'][i % 4],
    };
  });

  // ── D365 shell ─────────────────────────────────────────────────────────────
  const tabs = ['Sales order', 'Sell', 'Invoice', 'General', 'Warehouse', 'Pick and pack', 'Options'];
  const openTab = scene === 'pin' ? 'Sell' : null;

  const sellFlyout = [
    ['Generate',             [['E8A5', 'Confirmation'], ['E7C3', 'Picking list'], ['E8C8', 'Packing slip'], ['E8A5', 'Invoice']]],
    ['Journals',             [['E82D', 'Sales order confirmations'], ['E82D', 'Packing slip journal'], ['E82D', 'Invoice journal']]],
    ['Calculate',            [['E8EF', 'Totals'], ['E787', 'Delivery date control'], ['E8EF', 'Sales tax']]],
    ['Prices and discounts', [['E8C7', 'Recalculate prices'], ['E8C7', 'Multiline discount']]],
  ];

  document.body.innerHTML = `
    <div class="nav">
      <div class="nav-waffle">${I('ECAA')}</div>
      <div class="nav-title">Finance and Operations</div>
      <div class="nav-spacer"></div>
      <div class="nav-search">${I('E721')} Search for a page</div>
      <div class="nav-cmp">USMF</div>
      <div class="nav-ico">${I('EA8F')}</div>
      <div class="nav-ico">${I('E713')}</div>
      <div class="nav-ico">${I('E897')}</div>
      <div class="nav-avatar">AS</div>
    </div>
    <div class="main">
      <div class="rail">${['E700', 'E80F', 'E734', 'E823', 'ECA5', 'E8FD'].map(I).join('')}</div>
      <div class="page">
        <div class="appBar">
          <div class="appBar-toolbar">
            <div class="actionGroup">
              ${[['E70F', 'Edit'], ['E710', 'New'], ['E74D', 'Delete']].map(([ic, l]) =>
                `<button class="dynamicsButton"><div class="button-container">${I(ic)}<span class="button-label">${l}</span></div></button>`).join('')}
            </div>
            ${tabs.map(t => `<div class="appBarTab"><button class="appBarTab-header${t === openTab ? ' open' : ''}"><span class="appBarTab-headerLabel">${t}</span></button></div>`).join('')}
            <div class="ap-search">${I('E721')}</div>
          </div>
          ${openTab ? `
          <div class="appBar-flyout">
            ${sellFlyout.map(([title, btns]) => `
              <div class="group">
                <label class="group_title">${title}</label>
                <div class="group_content">
                  ${btns.map(([ic, l]) => `
                    <button class="dynamicsButton${l === 'Picking list' ? ' hov' : ''}" data-qb-overlay="1">
                      <div class="button-container" style="position:relative">${I(ic)}<span class="button-label">${l}</span><div class="d365qb-overlay" title="Pin to QuickBar">📌</div></div>
                    </button>`).join('')}
                </div>
              </div>`).join('')}
          </div>` : ''}
        </div>
        <div class="content">
          <div class="pg-view">Standard view ${I('E70D')}</div>
          <div class="pg-title">All sales orders</div>
          <div class="filters">
            <div class="filter-box">${I('E71C')} Filter</div>
            <div class="filter-dd">Show: <b>All</b> ${I('E70D')}</div>
            <div class="filter-dd">Customer account: <b>All</b> ${I('E70D')}</div>
          </div>
          <table class="grid">
            <colgroup>
              <col style="width:36px"><col style="width:110px"><col style="width:118px"><col style="width:220px">
              <col style="width:110px"><col style="width:100px"><col style="width:130px"><col style="width:120px">
              <col style="width:110px"><col style="width:90px">
            </colgroup>
            <tr><th><span class="chk"></span></th><th>Sales order</th><th>Customer account</th><th>Name</th><th>Order type</th>
                <th>Status</th><th>Release status</th><th>Requested ship</th><th class="num">Amount</th><th>Delivery</th></tr>
            ${rows.map((r, i) => `
              <tr class="${i === 2 ? 'sel' : ''}"><td><span class="chk"></span></td><td><a>${r.so}</a></td><td>${r.acc}</td><td>${x(r.name)}</td>
                <td>${r.type}</td><td>${r.status}</td><td>${r.release}</td><td>${r.date}</td><td class="num">${r.amount}</td><td>${r.mode}</td></tr>`).join('')}
          </table>
        </div>
      </div>
    </div>`;

  // ── QuickBar markup (mirrors content.js, English labels) ──────────────────
  function normalHTML() {
    return pins.map(it => it.type === 'group'
      ? `<div class="d365qb-grp-hd">${x(it.title)}</div>`
      : `<div class="d365qb-pin-item" data-pid="${it.id}">
           <button class="d365qb-pin-btn" title="${x(it.tabLabel)}: ${x(it.label)}">
             <span class="d365qb-lbl">${x(it.label)}</span>
             <span class="d365qb-tab-lbl">${x(it.tabLabel)}</span>
           </button>
           <button class="d365qb-rm-btn" title="Remove">✕</button>
         </div>`).join('');
  }

  function editHTML() {
    return pins.map(it => {
      const cls = it.id === 'p6' ? ' d365qb-dragging' : it.id === 'p4' ? ' d365qb-drop-a' : '';
      return it.type === 'group'
        ? `<div class="d365qb-edit-item d365qb-grp-edit" data-pid="${it.id}">
             <span class="d365qb-drag">⠿</span>
             <input class="d365qb-grp-inp" value="${x(it.title)}" placeholder="Group name">
             <button class="d365qb-rm-btn" title="Remove">✕</button>
           </div>`
        : `<div class="d365qb-edit-item d365qb-btn-edit${cls}" data-pid="${it.id}">
             <span class="d365qb-drag">⠿</span>
             <div class="d365qb-edit-info">
               <span class="d365qb-lbl">${x(it.label)}</span>
               <span class="d365qb-tab-lbl">${x(it.tabLabel)}</span>
             </div>
             <button class="d365qb-rm-btn" title="Remove">✕</button>
           </div>`;
    }).join('');
  }

  function mkSidebar({ edit = false, pinMode = false, collapsed = false } = {}) {
    const sb = document.createElement('div');
    sb.id = 'd365qb-sidebar';
    if (edit) sb.classList.add('d365qb-edit-mode');
    if (collapsed) sb.classList.add('d365qb-collapsed');
    sb.innerHTML = `
      <button class="d365qb-expand-strip" title="Expand QuickBar">
        <span>⚡</span><span class="d365qb-expand-arrow">▶</span>
      </button>
      <div class="d365qb-hd">
        <span class="d365qb-hd-title">⚡ QuickBar</span>
        <div class="d365qb-hd-btns">
          <button class="d365qb-icon-btn" title="${edit ? 'Done' : 'Edit'}">${edit ? '✓' : '✏️'}</button>
          <button class="d365qb-icon-btn" title="Collapse">◁</button>
        </div>
      </div>
      <div class="d365qb-body">${edit ? editHTML() : normalHTML()}</div>
      <div class="d365qb-foot">
        ${edit
          ? `<button class="d365qb-foot-btn">＋ Add group</button>`
          : `<button class="d365qb-foot-btn">${pinMode ? '🔴 Pin mode active' : '📌 Pin mode'}</button>`}
      </div>`;
    document.body.appendChild(sb);
    document.body.classList.add('d365qb-has-sidebar');
  }

  function mkRibbon() {
    const appBar = document.querySelector('.appBar-toolbar');

    const tabBtn = document.createElement('button');
    tabBtn.className = 'appBarTab-header d365qb-ribbon-hdr-btn d365qb-r-active';
    tabBtn.innerHTML = `<span class="appBarTab-headerLabel">⚡ QuickBar</span>`;
    appBar.insertBefore(tabBtn, appBar.firstChild);

    const sections = [];
    let cur = null;
    pins.forEach(it => {
      if (it.type === 'group') { cur = { title: it.title, buttons: [] }; sections.push(cur); }
      else cur.buttons.push(it);
    });

    const tc = document.createElement('div');
    tc.className = 'appBarTab-content d365qb-ribbon-tc';
    tc.innerHTML = sections.map(sec => `
      <div class="group button-group d365qb-ribbon-group">
        <div class="group_header"><label class="group_title">${x(sec.title)}</label></div>
        <div class="group_content layout-container layout-horizontal">
          ${sec.buttons.map(b => `
            <div class="d365qb-r-item">
              <button class="button dynamicsButton d365qb-r-btn${b.id === 'p5' ? ' hov' : ''}" title="${x(b.tabLabel)}: ${x(b.label)}">
                <div class="button-container">
                  <span class="button-label">${x(b.label)}</span>
                  <span class="d365qb-r-badge">${x(b.tabLabel)}</span>
                </div>
              </button>
              <button class="d365qb-r-rm" title="Remove"${b.id === 'p5' ? ' style="opacity:1"' : ''}>✕</button>
            </div>`).join('')}
        </div>
      </div>`).join('') + `
      <div class="group button-group d365qb-ribbon-group d365qb-r-mgmt">
        <div class="group_header"><label class="group_title">QuickBar</label></div>
        <div class="group_content layout-container layout-vertical">
          <button class="button dynamicsButton d365qb-manage"><div class="button-container"><span class="button-label">✏️ Edit</span></div></button>
          <button class="button dynamicsButton d365qb-manage"><div class="button-container"><span class="button-label">📌 Pin mode</span></div></button>
        </div>
      </div>`;
    appBar.parentElement.insertBefore(tc, appBar.nextSibling);
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.id = 'd365qb-toast';
    t.className = 'd365qb-toast-on';
    t.textContent = msg;
    document.body.appendChild(t);
  }

  // ── Scenes ─────────────────────────────────────────────────────────────────
  switch (scene) {
    case 'sidebar': mkSidebar(); break;
    case 'edit':    mkSidebar({ edit: true }); break;
    case 'popup':   mkSidebar({ collapsed: true }); break;
    case 'ribbon':  mkRibbon(); break;
    case 'pin':
      document.body.classList.add('d365qb-pin-mode');
      mkSidebar({ pinMode: true });
      toast('📌 "Picking list" pinned!');
      break;
  }
})();
