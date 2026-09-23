import sqlite3
from datetime import datetime, timedelta
from database import get_db_connection, init_db

SAMPLE_ENTRIES = [
  {"name": "Toor Dal (Premium 1kg)", "category": "Groceries", "qty": 25, "price": 145, "threshold": 8},
  {"name": "Aashirvaad Shudh Chakki Atta 5kg", "category": "Groceries", "qty": 18, "price": 260, "threshold": 5},
  {"name": "Amul Butter 500g", "category": "Dairy", "qty": 14, "price": 275, "threshold": 4},
  {"name": "Tata Salt (Iodized 1kg)", "category": "Groceries", "qty": 40, "price": 28, "threshold": 10},
  {"name": "Fortune Sunlite Refined Oil 1L", "category": "Groceries", "qty": 30, "price": 138, "threshold": 6},
  {"name": "Red Label Tea 500g", "category": "Beverages", "qty": 15, "price": 270, "threshold": 5},
  {"name": "Farm Fresh Red Onions (kg)", "category": "Vegetables & Fruits", "qty": 50, "price": 35, "threshold": 15},
  {"name": "Fresh Potatoes (kg)", "category": "Vegetables & Fruits", "qty": 45, "price": 28, "threshold": 12},
  {"name": "Parle-G Gold Biscuits (Pkt)", "category": "Snacks", "qty": 60, "price": 10, "threshold": 20},
  {"name": "Surf Excel Quick Wash 1kg", "category": "Household", "qty": 20, "price": 155, "threshold": 5},
  {"name": "Good Life Sugar (1kg)", "category": "Groceries", "qty": 35, "price": 44, "threshold": 10},
  {"name": "Maggi 2-Minute Noodles (4-Pack)", "category": "Snacks", "qty": 3, "price": 56, "threshold": 8} # low stock
]

def seed():
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if entries already exist
    cursor.execute("SELECT COUNT(*) FROM stock_entries")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    now = datetime.now()

    for i, item in enumerate(SAMPLE_ENTRIES):
        entry_time = now - timedelta(days=(i % 5), hours=(i * 2))
        date_label = entry_time.strftime("%d %b %Y")
        day_label = entry_time.strftime("%A")
        time_label = entry_time.strftime("%I:%M %p")
        month_key = entry_time.strftime("%Y-%m")
        total = item["qty"] * item["price"]

        # Insert into stock_entries
        cursor.execute("""
        INSERT INTO stock_entries (name, category, qty, price, total, threshold, added_by, date_label, day_label, time_label, month_key, ts)
        VALUES (?, ?, ?, ?, ?, ?, 'ramu', ?, ?, ?, ?, ?)
        """, (item["name"], item["category"], item["qty"], item["price"], total, item["threshold"], date_label, day_label, time_label, month_key, entry_time.isoformat()))
        entry_id = cursor.lastrowid

        # Insert into inventory_items
        cursor.execute("""
        INSERT INTO inventory_items (name, category, qty, total_cost, last_price, low_stock_threshold, entry_count, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        """, (item["name"], item["category"], item["qty"], total, item["price"], item["threshold"], entry_time.isoformat()))

    # Seed Sample Counter Sales
    sales_samples = [
        (3850.0, "Morning counter cash & milk sales", "Cash", now - timedelta(days=2)),
        (5420.0, "Afternoon grocery & grain sales", "UPI", now - timedelta(days=1)),
        (4680.0, "Evening counter sales", "Cash", now)
    ]

    for amount, note, pmode, s_time in sales_samples:
        cursor.execute("""
        INSERT INTO sales (amount, note, payment_mode, logged_by, date_label, day_label, time_label, month_key, ts)
        VALUES (?, ?, ?, 'ramu', ?, ?, ?, ?, ?)
        """, (amount, note, pmode, s_time.strftime("%d %b %Y"), s_time.strftime("%A"), s_time.strftime("%I:%M %p"), s_time.strftime("%Y-%m"), s_time.isoformat()))

    conn.commit()
    conn.close()
    print("Sample Kirana data seeded successfully!")

if __name__ == "__main__":
    seed()
