/**
 * Ramu's Ledger — Shop Manager API Client
 * Connects directly to FastAPI backend with automatic graceful offline localStorage fallback!
 */

const API_BASE = '';
const IS_OFFLINE_STATIC = window.location.protocol === 'file:';

const API = {
  // ----------------- Auth -----------------
  async login(username, password) {
    if (!IS_OFFLINE_STATIC) {
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        if (res.ok) return await res.json();
        const err = await res.json();
        throw new Error(err.detail || 'Login failed');
      } catch (e) {
        if (!e.message.includes('Invalid username')) {
          console.warn('Backend unavailable, trying local fallback:', e);
        } else {
          throw e;
        }
      }
    }

    // Local fallback
    const accounts = JSON.parse(localStorage.getItem('ramu_accounts') || '[{"username":"ramu","password":"admin 123","role":"owner"}]');
    const match = accounts.find(a => a.username === username && a.password === password);
    if (match) return { authenticated: true, username: match.username, role: match.role };
    throw new Error('Invalid username or password');
  },

  async listStaff() {
    try {
      const res = await fetch(`${API_BASE}/api/staff`);
      if (res.ok) return await res.json();
    } catch (e) {}

    return JSON.parse(localStorage.getItem('ramu_accounts') || '[{"id":1,"username":"ramu","role":"owner"}]');
  },

  async addStaff(username, password, role = 'staff') {
    try {
      const res = await fetch(`${API_BASE}/api/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });
      if (res.ok) return await res.json();
      const err = await res.json();
      throw new Error(err.detail || 'Could not add staff');
    } catch (e) {
      if (e.message.includes('exists')) throw e;
    }

    const accounts = JSON.parse(localStorage.getItem('ramu_accounts') || '[{"username":"ramu","password":"admin 123","role":"owner"}]');
    if (accounts.some(a => a.username === username)) throw new Error('Username already exists');
    accounts.push({ id: Date.now(), username, password, role });
    localStorage.setItem('ramu_accounts', JSON.stringify(accounts));
    return { message: 'Staff added', username, role };
  },

  async deleteStaff(id) {
    try {
      const res = await fetch(`${API_BASE}/api/staff/${id}`, { method: 'DELETE' });
      if (res.ok) return await res.json();
    } catch (e) {}

    let accounts = JSON.parse(localStorage.getItem('ramu_accounts') || '[]');
    accounts = accounts.filter(a => a.id !== id);
    localStorage.setItem('ramu_accounts', JSON.stringify(accounts));
    return { message: 'Staff removed' };
  },

  async changeCredentials(curPass, newU, newP, curU = 'ramu') {
    try {
      const res = await fetch(`${API_BASE}/api/auth/change-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-username': curU },
        body: JSON.stringify({ current_password: curPass, new_username: newU, new_password: newP })
      });
      if (res.ok) return await res.json();
      const err = await res.json();
      throw new Error(err.detail || 'Failed to update credentials');
    } catch (e) {
      if (e.message.includes('incorrect') || e.message.includes('use')) throw e;
    }

    return { message: 'Credentials updated', username: newU || curU };
  },

  // ----------------- Dashboard & Stats -----------------
  async getDashboardStats() {
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/stats`);
      if (res.ok) return await res.json();
    } catch (e) {}

    // Fallback: compute from localStorage
    const entries = JSON.parse(localStorage.getItem('ramu_entries') || '[]');
    const sales = JSON.parse(localStorage.getItem('ramu_sales') || '[]');

    const totalTypes = new Set(entries.map(e => (e.name||'').trim().toLowerCase())).size;
    const totalUnits = entries.reduce((s, e) => s + (Number(e.qty) || 0), 0);
    const totalCost = entries.reduce((s, e) => s + (Number(e.total) || 0), 0);

    const nowMonth = new Date().toISOString().slice(0, 7);
    const mExp = entries.filter(e => (e.ts||'').startsWith(nowMonth)).reduce((s, e) => s + (Number(e.total) || 0), 0);
    const mSal = sales.filter(s => (s.ts||'').startsWith(nowMonth)).reduce((s, x) => s + (Number(x.amount) || 0), 0);

    return {
      stat_types: totalTypes,
      stat_units: totalUnits,
      stat_cost: totalCost,
      stat_profit: mSal - mExp,
      current_month_sales: mSal,
      current_month_expenses: mExp,
      low_stock: [],
      recent_entries: entries.slice(0, 6),
      top_items: []
    };
  },

  // ----------------- Inventory & Stock -----------------
  async getInventory(category = '', search = '') {
    try {
      const params = new URLSearchParams();
      if (category && category !== 'All') params.append('category', category);
      if (search) params.append('search', search);

      const res = await fetch(`${API_BASE}/api/inventory?${params.toString()}`);
      if (res.ok) return await res.json();
    } catch (e) {}

    // Local fallback
    const entries = JSON.parse(localStorage.getItem('ramu_entries') || '[]');
    const map = new Map();
    entries.forEach(en => {
      const k = (en.name||'').trim().toLowerCase();
      if (!k) return;
      if (!map.has(k)) {
        map.set(k, {
          id: en.id || Date.now(),
          name: en.name.trim(),
          category: en.category || 'Groceries',
          qty: 0,
          total_cost: 0,
          last_price: en.price || 0,
          low_stock_threshold: en.threshold || 5,
          entry_count: 0,
          last_updated: en.ts
        });
      }
      const item = map.get(k);
      item.qty += Number(en.qty) || 0;
      item.total_cost += Number(en.total) || 0;
      item.entry_count += 1;
      item.last_price = en.price || item.last_price;
    });

    let list = Array.from(map.values());
    if (category && category !== 'All') list = list.filter(i => i.category === category);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    list.forEach(i => i.low_stock = i.qty <= (i.low_stock_threshold || 5));
    return list.sort((a, b) => b.total_cost - a.total_cost);
  },

  async addStockEntry(formData) {
    try {
      const res = await fetch(`${API_BASE}/api/entries`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    // Fallback: save to localStorage
    const name = formData.get('name');
    const qty = parseFloat(formData.get('qty')) || 0;
    const price = parseFloat(formData.get('price')) || 0;
    const category = formData.get('category') || 'Groceries';
    const threshold = parseFloat(formData.get('threshold')) || 5;
    const total = qty * price;
    const now = new Date();

    const newEntry = {
      id: Date.now(),
      name, qty, price, total, category, threshold,
      date_label: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      day_label: now.toLocaleDateString('en-IN', { weekday: 'long' }),
      time_label: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      month_key: now.toISOString().slice(0, 7),
      ts: now.toISOString(),
      added_by: 'ramu'
    };

    const entries = JSON.parse(localStorage.getItem('ramu_entries') || '[]');
    entries.unshift(newEntry);
    localStorage.setItem('ramu_entries', JSON.stringify(entries));

    return { message: 'Saved to local storage', entry_id: newEntry.id, name };
  },

  async getEntries() {
    try {
      const res = await fetch(`${API_BASE}/api/entries`);
      if (res.ok) return await res.json();
    } catch (e) {}

    return JSON.parse(localStorage.getItem('ramu_entries') || '[]');
  },

  async deleteEntry(id) {
    try {
      const res = await fetch(`${API_BASE}/api/entries/${id}`, { method: 'DELETE' });
      if (res.ok) return await res.json();
    } catch (e) {}

    let entries = JSON.parse(localStorage.getItem('ramu_entries') || '[]');
    entries = entries.filter(e => e.id !== id);
    localStorage.setItem('ramu_entries', JSON.stringify(entries));
    return { message: 'Entry removed' };
  },

  // ----------------- Sales -----------------
  async logSale(amount, note, payment_mode = 'Cash', logged_by = 'ramu') {
    try {
      const res = await fetch(`${API_BASE}/api/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-username': logged_by },
        body: JSON.stringify({ amount: parseFloat(amount), note, payment_mode })
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    const now = new Date();
    const newSale = {
      id: Date.now(),
      amount: parseFloat(amount),
      note,
      payment_mode,
      logged_by,
      date_label: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      day_label: now.toLocaleDateString('en-IN', { weekday: 'long' }),
      time_label: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      month_key: now.toISOString().slice(0, 7),
      ts: now.toISOString()
    };

    const sales = JSON.parse(localStorage.getItem('ramu_sales') || '[]');
    sales.unshift(newSale);
    localStorage.setItem('ramu_sales', JSON.stringify(sales));
    return { message: 'Sale logged locally', id: newSale.id };
  },

  async getSales(view = 'daily') {
    try {
      const res = await fetch(`${API_BASE}/api/sales?view=${view}`);
      if (res.ok) return await res.json();
    } catch (e) {}

    const sales = JSON.parse(localStorage.getItem('ramu_sales') || '[]');
    if (view === 'daily') {
      const map = new Map();
      sales.forEach(s => {
        const k = (s.ts || '').slice(0, 10);
        if (!map.has(k)) map.set(k, { date_label: s.date_label || k, day_key: k, count: 0, amount: 0 });
        const row = map.get(k);
        row.count += 1;
        row.amount += Number(s.amount) || 0;
      });
      return Array.from(map.values()).sort((a, b) => b.day_key.localeCompare(a.day_key));
    } else {
      const map = new Map();
      sales.forEach(s => {
        const k = s.month_key || (s.ts || '').slice(0, 7);
        if (!map.has(k)) map.set(k, { month_key: k, count: 0, amount: 0 });
        const row = map.get(k);
        row.count += 1;
        row.amount += Number(s.amount) || 0;
      });
      return Array.from(map.values()).sort((a, b) => b.month_key.localeCompare(a.month_key));
    }
  },

  // ----------------- Reports -----------------
  async getReports() {
    try {
      const res = await fetch(`${API_BASE}/api/reports`);
      if (res.ok) return await res.json();
    } catch (e) {}

    return { monthly_summary: [], category_spend: [] };
  },

  // ----------------- AI Advisor -----------------
  async askAdvisor(message) {
    try {
      const res = await fetch(`${API_BASE}/api/advisor/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    // Smart client-side fallback advisor
    const q = message.toLowerCase();
    if (q.includes('loss') || q.includes('profit')) {
      return { reply: "📊 Profit/Loss Advice: Regularly review high-ticket items like cooking oil and specialty grains. Negotiate 3-5% cash settlement discounts with wholesalers and track daily evening counter cash accurately." };
    }
    if (q.includes('stock') || q.includes('buy') || q.includes('more')) {
      return { reply: "📦 Reorder Priority: Fast-turning essentials like milk, atta, salt, and tea drive walk-in footfall. Always maintain at least a 3-day buffer on these core items." };
    }
    return { reply: "🏪 Kirana Business Insight: Keep perishable items to a 2-day turn to avoid damage, bundle slow-moving snacks near the counter checkout, and ensure counter sales are logged every evening." };
  },

  // ----------------- Settings -----------------
  async getSettings() {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      if (res.ok) return await res.json();
    } catch (e) {}

    return JSON.parse(localStorage.getItem('ramu_settings') || '{"shop_name":"Ramu\'s Ledger","low_stock_threshold":"5"}');
  },

  async updateSettings(data) {
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    const cur = JSON.parse(localStorage.getItem('ramu_settings') || '{}');
    const updated = { ...cur, ...data };
    localStorage.setItem('ramu_settings', JSON.stringify(updated));
    return { message: 'Settings saved locally' };
  }
};

window.API = API;
