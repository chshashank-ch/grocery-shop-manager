/**
 * Ramu's Ledger — Shop Manager Main Application Logic
 */

let currentAccount = null;
let currentSalesView = 'daily';
let pendingPhotoFile = null;

const fmtMoney = n => "₹" + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney0 = n => "₹" + Math.round(Number(n) || 0).toLocaleString('en-IN');

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function todayParts(d = new Date()) {
  return {
    day: d.toLocaleDateString('en-IN', { weekday: 'long' }),
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  };
}

// ----------------- App Lifecycle -----------------
document.addEventListener('DOMContentLoaded', async () => {
  initLogin();
  initNavigation();
  initAddItem();
  initSales();
  initCalculator();
  initChatAdvisor();
  initSettings();

  const savedSession = sessionStorage.getItem('ramuLedgerSession');
  if (savedSession) {
    try {
      currentAccount = JSON.parse(savedSession);
      enterApp();
    } catch (e) {
      sessionStorage.removeItem('ramuLedgerSession');
    }
  }
});

// ----------------- Login & Session -----------------
function initLogin() {
  const loginBtn = $('#loginBtn');
  const userIn = $('#loginUser');
  const passIn = $('#loginPass');

  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
    userIn.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    passIn.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  }

  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('ramuLedgerSession');
      currentAccount = null;
      $('#app').style.display = 'none';
      $('#loginScreen').style.display = 'flex';
      $('#loginUser').value = '';
      $('#loginPass').value = '';
      toast('Signed out from shop ledger');
    });
  }
}

async function handleLogin() {
  const u = $('#loginUser').value.trim();
  const p = $('#loginPass').value;
  const errEl = $('#loginError');

  if (!u || !p) {
    errEl.textContent = 'Please enter both username and password';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res = await API.login(u, p);
    currentAccount = { username: res.username, role: res.role };
    sessionStorage.setItem('ramuLedgerSession', JSON.stringify(currentAccount));
    errEl.style.display = 'none';
    enterApp();
  } catch (err) {
    errEl.textContent = err.message || 'Invalid username or password';
    errEl.style.display = 'block';
  }
}

function enterApp() {
  $('#loginScreen').style.display = 'none';
  $('#app').style.display = 'block';

  // Populate user profile info in sidebar
  const uname = currentAccount ? currentAccount.username : 'ramu';
  const role = currentAccount ? currentAccount.role : 'owner';
  $('#sideUsername').textContent = uname + (role === 'staff' ? ' (staff)' : '');
  $('#sideAvatarFallback').textContent = uname.charAt(0).toUpperCase();

  // Role permissions: Hide staff management card from staff members
  const staffCard = $('#staffCard');
  if (staffCard) {
    staffCard.style.display = (role === 'owner') ? 'block' : 'none';
  }

  const t = todayParts();
  $('#todayLabel').textContent = `${t.day}, ${t.date}`;

  loadDashboard();
  loadStaffList();
}

// ----------------- Navigation -----------------
function initNavigation() {
  $$('.navlink').forEach(btn => {
    btn.addEventListener('click', () => goPage(btn.dataset.page));
  });

  $$('[data-page]').forEach(el => {
    if (!el.classList.contains('navlink')) {
      el.addEventListener('click', () => goPage(el.dataset.page));
    }
  });
}

function goPage(pageId) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.navlink').forEach(b => b.classList.remove('active'));

  const page = $(`#page-${pageId}`);
  if (page) page.classList.add('active');

  const navlink = $(`.navlink[data-page="${pageId}"]`);
  if (navlink) navlink.classList.add('active');

  if (pageId === 'dashboard') loadDashboard();
  if (pageId === 'inventory') loadInventory();
  if (pageId === 'history') loadHistory();
  if (pageId === 'sales') loadSales();
  if (pageId === 'reports') loadReports();
}

// ----------------- Dashboard -----------------
async function loadDashboard() {
  try {
    const data = await API.getDashboardStats();

    $('#statTypes').textContent = data.stat_types || 0;
    $('#statUnits').textContent = (data.stat_units || 0).toLocaleString('en-IN');
    $('#statCost').textContent = fmtMoney0(data.stat_cost || 0);

    const pl = data.stat_profit || 0;
    $('#statProfit').textContent = (pl < 0 ? '-' : '+') + fmtMoney0(Math.abs(pl));

    const delta = $('#statProfitDelta');
    if (data.current_month_sales === 0 && data.current_month_expenses === 0) {
      delta.textContent = 'No transactions yet this month';
      delta.className = 'delta';
    } else if (pl >= 0) {
      delta.textContent = 'Profit surplus this month';
      delta.className = 'delta up';
    } else {
      delta.textContent = 'Net deficit this month';
      delta.className = 'delta down';
    }

    // Low stock warning banner
    const banner = $('#lowStockBanner');
    const lowStock = data.low_stock || [];
    if (lowStock.length > 0) {
      banner.style.display = 'flex';
      $('#lowStockText').textContent = lowStock.length === 1
        ? `⚠️ Low Stock Alert: "${lowStock[0].name}" has only ${lowStock[0].qty} units left.`
        : `⚠️ Low Stock Alert: ${lowStock.length} items running low: ${lowStock.slice(0, 3).map(r => r.name).join(', ')}${lowStock.length > 3 ? ', ...' : ''}.`;
    } else {
      banner.style.display = 'none';
    }

    // Recent items list
    const recent = data.recent_entries || [];
    const recentList = $('#dashRecent');
    if (recent.length === 0) {
      recentList.innerHTML = '<div class="empty">No items logged yet. Use "Add Item".</div>';
    } else {
      recentList.innerHTML = recent.map(en => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">
          ${thumb(en.photo_url)}
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13.5px;">${escapeHtml(en.name)}</div>
            <div class="muted" style="font-size:11.5px;">${en.day_label || ''} · ${en.time_label || ''}</div>
          </div>
          <div style="font-weight:600;font-size:13.5px;">${fmtMoney0(en.total)}</div>
        </div>
      `).join('');
    }

    // Top items by spend
    const top = data.top_items || [];
    const topList = $('#dashTop');
    if (top.length === 0) {
      topList.innerHTML = '<div class="empty">No inventory items yet.</div>';
    } else {
      topList.innerHTML = top.map(r => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">
          ${thumb(r.photo_url)}
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13.5px;">${escapeHtml(r.name)}</div>
            <div class="muted" style="font-size:11.5px;">${r.qty} units in stock</div>
          </div>
          <div style="font-weight:600;font-size:13.5px;">${fmtMoney0(r.total_cost)}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

function thumb(url) {
  return url
    ? `<img class="item-thumb" src="${url}" alt="thumbnail">`
    : `<div class="item-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;">📦</div>`;
}

// ----------------- Add Item -----------------
function initAddItem() {
  const photoBox = $('#photoBox');
  const photoInput = $('#photoInput');
  const previewImg = $('#photoPreview');
  const photoIcon = $('#photoIcon');
  const photoHint = $('#photoHint');
  const clearBtn = $('#clearPhotoBtn');

  if (photoBox && photoInput) {
    photoBox.addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      pendingPhotoFile = file;

      const reader = new FileReader();
      reader.onload = () => {
        previewImg.src = reader.result;
        previewImg.style.display = 'block';
        photoIcon.style.display = 'none';
        photoHint.style.display = 'none';
        clearBtn.style.display = 'inline-flex';
      };
      reader.readAsDataURL(file);
    });

    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pendingPhotoFile = null;
      photoInput.value = '';
      previewImg.style.display = 'none';
      photoIcon.style.display = 'block';
      photoHint.style.display = 'block';
      clearBtn.style.display = 'none';
    });
  }

  // Dynamic price calculation
  const qtyIn = $('#itemQty');
  const priceIn = $('#itemPrice');
  const nameIn = $('#itemName');
  const totalPrev = $('#itemTotalPreview');
  const matchHint = $('#matchHint');

  function updateItemTotal() {
    const q = parseFloat(qtyIn.value) || 0;
    const p = parseFloat(priceIn.value) || 0;
    totalPrev.textContent = fmtMoney(q * p);
  }

  qtyIn.addEventListener('input', updateItemTotal);
  priceIn.addEventListener('input', updateItemTotal);

  nameIn.addEventListener('input', async () => {
    const n = nameIn.value.trim();
    if (!n) {
      matchHint.textContent = '';
      return;
    }
    const inv = await API.getInventory('', n);
    const exact = inv.find(i => i.name.toLowerCase() === n.toLowerCase());
    if (exact) {
      matchHint.textContent = `💡 Matches existing inventory item "${exact.name}" (${exact.qty} currently in stock). New units will be added to this stock.`;
    } else {
      matchHint.textContent = '';
    }
  });

  // Save stock entry button
  $('#saveItemBtn').addEventListener('click', async () => {
    const name = nameIn.value.trim();
    const qty = parseFloat(qtyIn.value);
    const price = parseFloat(priceIn.value);
    const category = $('#itemCategory').value;
    const thresholdRaw = $('#itemThreshold').value;
    const threshold = thresholdRaw !== '' ? parseFloat(thresholdRaw) : null;

    if (!name) { toast('Please enter the item name'); return; }
    if (!qty || qty <= 0) { toast('Please enter a valid quantity'); return; }
    if (isNaN(price) || price < 0) { toast('Please enter a valid price'); return; }

    const saveBtn = $('#saveItemBtn');
    const origHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    saveBtn.disabled = true;

    const fd = new FormData();
    fd.append('name', name);
    fd.append('qty', qty);
    fd.append('price', price);
    fd.append('category', category);
    if (threshold !== null) fd.append('threshold', threshold);
    if (currentAccount) fd.append('added_by', currentAccount.username);
    if (pendingPhotoFile) fd.append('file', pendingPhotoFile);

    try {
      await API.addStockEntry(fd);
      toast(`Added "${name}" to shop ledger`);
      $('#saveMsg').style.display = 'block';
      setTimeout(() => $('#saveMsg').style.display = 'none', 2000);

      // Reset form
      nameIn.value = '';
      qtyIn.value = '';
      priceIn.value = '';
      if ($('#itemThreshold')) $('#itemThreshold').value = '';
      totalPrev.textContent = '₹0.00';
      matchHint.textContent = '';
      clearBtn.click();
    } catch (err) {
      toast('Failed to save entry: ' + err.message);
    } finally {
      saveBtn.innerHTML = origHtml;
      saveBtn.disabled = false;
    }
  });
}

// ----------------- Inventory -----------------
async function loadInventory() {
  const container = $('#inventoryTable');
  if (!container) return;
  container.innerHTML = '<div class="empty"><i class="fas fa-spinner fa-spin"></i> Loading stock items...</div>';

  try {
    const items = await API.getInventory();
    if (items.length === 0) {
      container.innerHTML = '<div class="empty">No items in stock yet — add one from "Add Item".</div>';
      return;
    }

    let html = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:10px; flex-wrap:wrap;">
        <input type="text" id="invSearchInput" placeholder="Filter by item name..." style="padding:8px 12px; border-radius:8px; border:1px solid var(--border); font-size:13.5px; width:220px;">
        <div style="display:flex; gap:8px;">
          <a href="/api/export/inventory.csv" class="btn btn-ghost" style="padding:6px 12px; font-size:12px;" download><i class="fas fa-download"></i> Export CSV</a>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Item Name</th>
            <th>Category</th>
            <th class="num">Entries</th>
            <th class="num">Stock Units</th>
            <th class="num">Total Spend</th>
            <th>Stock Status</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody id="invTableBody">
    `;

    items.forEach(r => {
      html += `
        <tr>
          <td>${thumb(r.photo_url)}</td>
          <td style="font-weight:600;">${escapeHtml(r.name)}</td>
          <td><span class="pill gold">${escapeHtml(r.category || 'Groceries')}</span></td>
          <td class="num">${r.entry_count || 1}</td>
          <td class="num" style="font-weight:600;">${r.qty}</td>
          <td class="num">${fmtMoney(r.total_cost)}</td>
          <td>${r.low_stock ? '<span class="pill danger">Low Stock</span>' : '<span class="pill green">Healthy</span>'}</td>
          <td class="muted">${r.last_updated ? new Date(r.last_updated).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Search input listener
    const searchIn = $('#invSearchInput');
    if (searchIn) {
      searchIn.addEventListener('input', () => {
        const q = searchIn.value.toLowerCase().trim();
        $$('#invTableBody tr').forEach(tr => {
          const text = tr.children[1].textContent.toLowerCase();
          tr.style.display = text.includes(q) ? '' : 'none';
        });
      });
    }
  } catch (err) {
    container.innerHTML = `<div class="empty" style="color:var(--danger);">Error loading inventory: ${err.message}</div>`;
  }
}

// ----------------- Entry History & Receipt -----------------
async function loadHistory() {
  const container = $('#historyTable');
  if (!container) return;
  container.innerHTML = '<div class="empty"><i class="fas fa-spinner fa-spin"></i> Loading entry history...</div>';

  try {
    const entries = await API.getEntries();
    if (entries.length === 0) {
      container.innerHTML = '<div class="empty">No entries logged yet.</div>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Item Name</th>
            <th class="num">Qty</th>
            <th class="num">Unit Price</th>
            <th class="num">Total</th>
            <th>Date</th>
            <th>Day</th>
            <th>Time</th>
            <th>Added By</th>
            <th class="num">Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    entries.forEach(en => {
      html += `
        <tr>
          <td>${thumb(en.photo_url)}</td>
          <td style="font-weight:600;">${escapeHtml(en.name)}</td>
          <td class="num">${en.qty}</td>
          <td class="num">${fmtMoney(en.price)}</td>
          <td class="num" style="font-weight:600;">${fmtMoney(en.total)}</td>
          <td>${en.date_label || '-'}</td>
          <td class="muted">${en.day_label || '-'}</td>
          <td class="muted">${en.time_label || '-'}</td>
          <td class="muted">${escapeHtml(en.added_by || 'ramu')}</td>
          <td class="num">
            <button class="icon-btn" onclick="handleDeleteEntry(${en.id})" title="Delete Entry">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
            </button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Connect print receipt button
    const printBtn = $('#printTodayBtn');
    if (printBtn && !printBtn.dataset.bound) {
      printBtn.dataset.bound = 'true';
      printBtn.addEventListener('click', printTodayReceipt);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty" style="color:var(--danger);">Error loading history: ${err.message}</div>`;
  }
}

window.handleDeleteEntry = async function(id) {
  if (!confirm('Are you sure you want to delete this stock entry? It will deduct from inventory.')) return;
  try {
    await API.deleteEntry(id);
    toast('Entry removed and inventory adjusted');
    loadHistory();
  } catch (err) {
    toast('Failed to delete entry: ' + err.message);
  }
};

async function printTodayReceipt() {
  const t = todayParts();
  const entries = await API.getEntries();
  const todays = entries.filter(e => e.date_label === t.date);

  if (todays.length === 0) {
    toast('No entries logged today to print.');
    return;
  }

  const total = todays.reduce((s, e) => s + (Number(e.total) || 0), 0);
  const rows = todays.map(e => `
    <tr>
      <td>${escapeHtml(e.name)}</td>
      <td class="num">${e.qty}</td>
      <td class="num">${fmtMoney(e.price)}</td>
      <td class="num">${fmtMoney(e.total)}</td>
    </tr>
  `).join('');

  $('#receiptContent').innerHTML = `
    <h2>Ramu's Ledger — Daily Stock Receipt</h2>
    <div class="meta">${t.day}, ${t.date} · Printed at ${t.time}</div>
    <table>
      <thead>
        <tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="3">Total Stock Purchased</td>
          <td class="num">${fmtMoney(total)}</td>
        </tr>
      </tbody>
    </table>
  `;

  window.print();
}

// ----------------- Sales Management -----------------
function initSales() {
  const saveBtn = $('#saveSaleBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const amt = parseFloat($('#saleAmount').value);
      const note = $('#saleNote').value.trim();

      if (!amt || amt <= 0) {
        toast('Please enter a valid sale amount');
        return;
      }

      saveBtn.disabled = true;
      try {
        await API.logSale(amt, note, 'Cash', currentAccount ? currentAccount.username : 'ramu');
        toast(`Sale of ₹${amt.toLocaleString('en-IN')} logged!`);
        $('#saleMsg').style.display = 'block';
        setTimeout(() => $('#saleMsg').style.display = 'none', 2000);

        $('#saleAmount').value = '';
        $('#saleNote').value = '';
        loadSales();
      } catch (err) {
        toast('Could not log sale: ' + err.message);
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  const dailyBtn = $('#salesTabDaily');
  const monthlyBtn = $('#salesTabMonthly');

  if (dailyBtn && monthlyBtn) {
    dailyBtn.addEventListener('click', () => {
      currentSalesView = 'daily';
      dailyBtn.className = 'btn btn-primary';
      monthlyBtn.className = 'btn btn-ghost';
      loadSales();
    });

    monthlyBtn.addEventListener('click', () => {
      currentSalesView = 'monthly';
      monthlyBtn.className = 'btn btn-primary';
      dailyBtn.className = 'btn btn-ghost';
      loadSales();
    });
  }
}

async function loadSales() {
  const container = $('#salesTable');
  if (!container) return;
  container.innerHTML = '<div class="empty"><i class="fas fa-spinner fa-spin"></i> Loading sales records...</div>';

  try {
    const list = await API.getSales(currentSalesView);
    if (list.length === 0) {
      container.innerHTML = '<div class="empty">No sales logged yet. Log your counter cash to see totals.</div>';
      return;
    }

    if (currentSalesView === 'daily') {
      let html = `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th class="num">Transactions</th>
              <th class="num">Total Sales</th>
            </tr>
          </thead>
          <tbody>
      `;
      list.forEach(r => {
        html += `
          <tr>
            <td style="font-weight:600;">${r.date_label || r.day_key}</td>
            <td class="num">${r.count}</td>
            <td class="num" style="font-weight:700; color:var(--green);">${fmtMoney(r.amount)}</td>
          </tr>
        `;
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    } else {
      let html = `
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th class="num">Entries</th>
              <th class="num">Monthly Total</th>
            </tr>
          </thead>
          <tbody>
      `;
      list.forEach(r => {
        html += `
          <tr>
            <td style="font-weight:600;">${r.month_key}</td>
            <td class="num">${r.count}</td>
            <td class="num" style="font-weight:700; color:var(--green);">${fmtMoney(r.amount)}</td>
          </tr>
        `;
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    }
  } catch (err) {
    container.innerHTML = `<div class="empty" style="color:var(--danger);">Error loading sales: ${err.message}</div>`;
  }
}

// ----------------- Reports & Analytics -----------------
async function loadReports() {
  try {
    const data = await API.getReports();
    const summary = data.monthly_summary || [];
    const catSpend = data.category_spend || [];

    const expCont = $('#reportExpenses');
    const salCont = $('#reportSales');
    const plCont = $('#reportPL');
    const catCont = $('#reportCategory');

    if (summary.length === 0) {
      expCont.innerHTML = '<div class="empty">No expense data yet.</div>';
      salCont.innerHTML = '<div class="empty">No sales data yet.</div>';
      plCont.innerHTML = '<div class="empty">No profit/loss data yet.</div>';
      return;
    }

    const maxExp = Math.max(...summary.map(m => m.expenses), 1);
    const maxSal = Math.max(...summary.map(m => m.sales), 1);
    const maxPL = Math.max(...summary.map(m => Math.abs(m.profit_loss)), 1);

    expCont.innerHTML = summary.map(m => barRow(m.month_key, m.expenses, maxExp, 'var(--clay)')).join('');
    salCont.innerHTML = summary.map(m => barRow(m.month_key, m.sales, maxSal, 'var(--green)')).join('');
    plCont.innerHTML = summary.map(m => {
      const color = m.profit_loss >= 0 ? 'var(--green)' : 'var(--danger)';
      const prefix = m.profit_loss < 0 ? '-' : '+';
      return barRow(m.month_key, Math.abs(m.profit_loss), maxPL, color, prefix);
    }).join('');

    const maxCat = Math.max(...catSpend.map(c => c.total), 1);
    catCont.innerHTML = catSpend.length > 0
      ? catSpend.map(c => barRow(c.category, c.total, maxCat, 'var(--gold)')).join('')
      : '<div class="empty">No category spend data.</div>';
  } catch (err) {
    console.error('Failed to load reports:', err);
  }
}

function barRow(label, val, max, color, prefix = '') {
  const pct = Math.max(5, Math.round((val / max) * 100));
  return `
    <div class="bar-row">
      <div class="lbl">${label}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%; background:${color};"></div>
      </div>
      <div class="amt">${prefix}${fmtMoney0(val)}</div>
    </div>
  `;
}

// ----------------- AI Business Advisor -----------------
function initChatAdvisor() {
  const sendBtn = $('#chatSendBtn');
  const input = $('#chatInput');
  const suggestWrap = $('#chatSuggest');

  const suggestions = [
    "How can I reduce losses this month?",
    "Which items should I stock more of?",
    "What's driving my expenses up?",
    "How's my profit trending?"
  ];

  if (suggestWrap) {
    suggestWrap.innerHTML = suggestions.map(s => `
      <button class="chip-btn" data-q="${escapeHtml(s)}">${s}</button>
    `).join('');

    $$('.chip-btn', suggestWrap).forEach(b => {
      b.addEventListener('click', () => {
        input.value = b.dataset.q;
        sendAdvisorMessage();
      });
    });
  }

  if (sendBtn && input) {
    sendBtn.addEventListener('click', sendAdvisorMessage);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') sendAdvisorMessage(); });
  }
}

async function sendAdvisorMessage() {
  const input = $('#chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  addChatBubble('user', msg);

  const thinkingEl = addChatBubble('bot', 'Analyzing shop ledger...', true);

  try {
    const res = await API.askAdvisor(msg);
    thinkingEl.classList.remove('thinking');
    thinkingEl.textContent = res.reply;
  } catch (err) {
    thinkingEl.classList.remove('thinking');
    thinkingEl.textContent = "Could not reach shop advisor right now. Please check your network.";
  }
}

function addChatBubble(role, text, thinking = false) {
  const log = $('#chatLog');
  const div = document.createElement('div');
  div.className = `msg ${role} ${thinking ? 'thinking' : ''}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

// ----------------- Calculator -----------------
const calcKeys = ['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='];
let calcExpr = '';

function initCalculator() {
  const grid = $('#calcGrid');
  if (!grid) return;

  grid.innerHTML = calcKeys.map(k => {
    const cls = ['÷', '×', '−', '+'].includes(k) ? 'op' : (k === '=' ? 'eq' : (k === 'C' ? 'clear' : ''));
    return `<button class="calc-key ${cls}" data-k="${k}">${k}</button>`;
  }).join('');

  $$('.calc-key', grid).forEach(b => b.addEventListener('click', () => calcPress(b.dataset.k)));
}

function calcSafeEval(expr) {
  const js = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/%/g, '/100');
  if (!/^[0-9+\-*/.() ]*$/.test(js)) return null;
  try {
    const v = Function('"use strict";return (' + js + ')')();
    return isFinite(v) ? v : null;
  } catch (e) {
    return null;
  }
}

function calcPress(k) {
  const exprEl = $('#calcExpr');
  const valEl = $('#calcVal');

  if (k === 'C') {
    calcExpr = '';
  } else if (k === '⌫') {
    calcExpr = calcExpr.slice(0, -1);
  } else if (k === '=') {
    const v = calcSafeEval(calcExpr);
    exprEl.textContent = calcExpr || '\u00A0';
    valEl.textContent = v === null ? 'Error' : (Math.round(v * 100) / 100).toLocaleString('en-IN');
    calcExpr = v === null ? '' : String(Math.round(v * 100) / 100);
    return;
  } else if (k === '±') {
    calcExpr = calcExpr.startsWith('-') ? calcExpr.slice(1) : '-' + calcExpr;
  } else {
    calcExpr += k;
  }

  exprEl.textContent = calcExpr || '\u00A0';
  const live = calcSafeEval(calcExpr);
  valEl.textContent = live === null ? (calcExpr || '0') : (Math.round(live * 100) / 100).toLocaleString('en-IN');
}

// ----------------- Settings & Staff Management -----------------
function initSettings() {
  const saveBtn = $('#saveSettingsBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const cur = $('#curPass').value;
      const newU = $('#newUser').value.trim();
      const newP = $('#newPass').value;
      const msgEl = $('#settingsMsg');

      if (!cur) {
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--danger)';
        msgEl.textContent = 'Please enter your current password';
        return;
      }

      try {
        const res = await API.changeCredentials(cur, newU, newP, currentAccount ? currentAccount.username : 'ramu');
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--green)';
        msgEl.textContent = 'Credentials updated successfully!';
        toast('Password and settings updated');

        if (newU) {
          currentAccount.username = newU;
          sessionStorage.setItem('ramuLedgerSession', JSON.stringify(currentAccount));
          $('#sideUsername').textContent = newU;
        }

        $('#curPass').value = '';
        $('#newUser').value = '';
        $('#newPass').value = '';
      } catch (err) {
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--danger)';
        msgEl.textContent = err.message || 'Could not update credentials';
      }
    });
  }

  const addStaffBtn = $('#addStaffBtn');
  if (addStaffBtn) {
    addStaffBtn.addEventListener('click', async () => {
      const u = $('#staffUser').value.trim();
      const p = $('#staffPass').value;
      const msgEl = $('#staffMsg');

      if (!u || !p) {
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--danger)';
        msgEl.textContent = 'Please enter a username and password';
        return;
      }

      try {
        await API.addStaff(u, p, 'staff');
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--green)';
        msgEl.textContent = `Staff account "${u}" created!`;
        toast(`Added staff member "${u}"`);

        $('#staffUser').value = '';
        $('#staffPass').value = '';
        loadStaffList();
      } catch (err) {
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--danger)';
        msgEl.textContent = err.message || 'Failed to add staff';
      }
    });
  }
}

async function loadStaffList() {
  const container = $('#staffList');
  if (!container) return;

  try {
    const list = await API.listStaff();
    container.innerHTML = list.map(a => `
      <div class="staff-row">
        <div>
          <div class="who">${escapeHtml(a.username)}</div>
          <div class="role">${a.role === 'owner' ? 'Owner / Admin' : 'Staff Worker'}</div>
        </div>
        ${a.role !== 'owner' ? `
          <button class="icon-btn" onclick="handleDeleteStaff(${a.id})" title="Remove staff account">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
          </button>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.warn('Could not load staff list:', err);
  }
}

window.handleDeleteStaff = async function(id) {
  if (!confirm('Are you sure you want to remove this staff account?')) return;
  try {
    await API.deleteStaff(id);
    toast('Staff account removed');
    loadStaffList();
  } catch (err) {
    toast('Could not delete staff: ' + err.message);
  }
};
