import sqlite3
import os
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "ramus_ledger.db"

def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Accounts Table (Owner and Staff)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Inventory Items (Aggregated Stock Tracker)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL DEFAULT 'Groceries',
        qty REAL NOT NULL DEFAULT 0,
        total_cost REAL NOT NULL DEFAULT 0,
        last_price REAL NOT NULL DEFAULT 0,
        low_stock_threshold REAL DEFAULT 5,
        photo_url TEXT,
        entry_count INTEGER DEFAULT 1,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. Stock Entries (History of all item additions/scans)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stock_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Groceries',
        qty REAL NOT NULL,
        price REAL NOT NULL,
        total REAL NOT NULL,
        threshold REAL,
        photo_url TEXT,
        added_by TEXT,
        date_label TEXT,
        day_label TEXT,
        time_label TEXT,
        month_key TEXT,
        ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 4. Sales Table (Counter revenue logs)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL NOT NULL,
        note TEXT,
        payment_mode TEXT DEFAULT 'Cash',
        logged_by TEXT,
        date_label TEXT,
        day_label TEXT,
        time_label TEXT,
        month_key TEXT,
        ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 5. Settings Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # 6. AI Advisor Chat History
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_msg TEXT NOT NULL,
        bot_reply TEXT NOT NULL,
        ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Insert Default Owner Account if not present
    cursor.execute("SELECT id FROM accounts WHERE username = 'ramu'")
    if not cursor.fetchone():
        cursor.execute("INSERT INTO accounts (username, password, role) VALUES (?, ?, ?)", ("ramu", "admin 123", "owner"))

    # Insert Default Settings
    defaults = {
        "shop_name": "Ramu's Kirana & General Store",
        "currency_symbol": "₹",
        "low_stock_threshold": "5",
        "profile_photo_url": ""
    }
    for k, v in defaults.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_PATH)
