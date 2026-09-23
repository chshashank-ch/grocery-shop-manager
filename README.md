# 🏪 Ramu's Ledger — Shop Manager (Full-Fledged Full-Stack)

A modern, full-fledged shop manager application designed for Kirana / grocery and retail store owners. Built with a fast **Python FastAPI + SQLite** backend and a modular **HTML5, CSS3 & JavaScript** frontend with Fraunces & Inter typography.

---

## 🚀 Quick Start (1-Click Run)

### 1. Install Requirements
```bash
cd ramus_ledger/backend
pip install -r requirements.txt
```

### 2. Run Server
Double-click `start.bat` or run:
```bash
py -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

Then open your browser at **http://localhost:8000**

---

## 🔑 Default Sign-in
- **Username**: `ramu`
- **Password**: `admin 123`
*(Staff accounts can be added from the Settings page once signed in).*

---

## 🌟 Key Features

### 1. 📊 Live Dashboard
- Real-time item types stocked count, units tally, and total stock valuation (cost).
- Current month profit and loss calculation (sales revenue vs. stock spending).
- Automated **Low-Stock Alert Banners** when items fall below safety levels.
- Top stock items sorted by capital value and recent purchase entries.

### 2. 📦 Add Stock Item & Auto-Merge Inventory
- Photo attachment & preview (with drag-and-drop / mobile camera capture).
- Auto-calculated total cost (`Quantity × Price`).
- Category selection (`Groceries`, `Dairy`, `Produce`, `Snacks`, `Beverages`, `Household`).
- Per-item custom low-stock threshold warning.
- Auto-merges with existing inventory items if re-ordering the same goods.

### 3. 🗃️ Stock Inventory & CSV Export
- Search items by name with instant live filtering.
- Category filters.
- Stock health badges (`Healthy` vs `Low Stock`).
- **1-Click CSV Export** (`ramus_ledger_inventory.csv`) for Excel and accounting.

### 4. 📜 Purchase History & Printable Receipt
- Chronological timeline of all stock purchases.
- Individual entry deletion with automatic stock deduction.
- **Print Today's Stock Bill**: Formatted thermal/A4 printable invoice with itemized table.

### 5. 💵 Counter Sales Management
- Record daily cash & UPI collections with optional notes.
- Switch between **Daily Breakdown** and **Monthly Summaries**.
- Live tracking of total revenue.

### 6. 📈 Performance Reports & Category Analytics
- Visual comparative bar charts:
  1. Stock purchasing cost by month
  2. Sales revenue by month
  3. Net Profit / Loss trend
  4. Spend by product category

### 7. 🤖 Kirana Business AI Advisor
- Direct, data-grounded insights analyzing your actual SQLite inventory and financial records.
- Fast answers for:
  - *"How can I reduce losses this month?"*
  - *"Which items should I stock more of?"*
  - *"What's driving my expenses up?"*
  - *"How's my profit trending?"*

### 8. 🧮 Counter Calculator
- Fast 4-function arithmetic keypad with error-handling and memory display.

### 9. ⚙️ Settings & Staff Accounts
- Change owner username and password.
- Multi-user support: Create and delete staff worker logins.
- Role-based permissions (Staff can log sales and add stock, but cannot delete records or manage other staff).

---

## 📁 Project Architecture

```
ramus_ledger/
├── backend/
│   ├── app.py              # FastAPI server (all REST routes + static frontend mounting)
│   ├── database.py         # SQLite persistence (accounts, inventory, entries, sales, settings)
│   ├── models.py           # Pydantic data schemas
│   ├── seed_data.py        # Realistic Kirana seed dataset
│   ├── ai_service.py       # Shop data business intelligence advisor engine
│   ├── ramus_ledger.db     # SQLite database
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── index.html          # Semantic HTML5 single-page application (9 views)
│   ├── css/
│   │   └── styles.css      # Design system with Fraunces & Inter typography
│   └── js/
│       ├── api.js          # REST API client with local fallback
│       └── app.js          # App state, routing, and interactivity
├── uploads/                # Item photos and user attachments
└── start.bat               # Windows 1-click startup script
```
