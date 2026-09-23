import os
import sys
import shutil
import uuid
import csv
import io
from pathlib import Path
from datetime import datetime
from typing import Optional, List

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Header, Depends, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from database import get_db_connection, init_db
from models import (
    LoginRequest, AccountCreate, PasswordChangeRequest, 
    StockEntryCreate, SaleCreate, SettingsUpdateRequest, AIChatRequest
)
from seed_data import seed
from ai_service import get_shop_analysis

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
FRONTEND_DIR = BASE_DIR / "frontend"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
(FRONTEND_DIR / "css").mkdir(parents=True, exist_ok=True)
(FRONTEND_DIR / "js").mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Ramu's Ledger — Shop Manager API",
    description="Full-fledged Backend API for inventory stock, counter sales, monthly reports, staff control and AI advice",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()
    seed()

# Helper for current time labels
def get_time_labels():
    now = datetime.now()
    return {
        "ts": now.isoformat(),
        "date_label": now.strftime("%d %b %Y"),
        "day_label": now.strftime("%A"),
        "time_label": now.strftime("%I:%M %p"),
        "month_key": now.strftime("%Y-%m")
    }

# ----------------- AUTH & ACCOUNTS -----------------

@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, password FROM accounts WHERE username = ?", (req.username.strip(),))
    user = cursor.fetchone()
    conn.close()

    if not user or user["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return {
        "authenticated": True,
        "username": user["username"],
        "role": user["role"]
    }

@app.get("/api/staff")
def list_staff():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, created_at FROM accounts ORDER BY role DESC, id ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/staff")
def add_staff(req: AccountCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO accounts (username, password, role) VALUES (?, ?, ?)",
                       (req.username.strip(), req.password, req.role or "staff"))
        new_id = cursor.lastrowid
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail="Username already exists")
    conn.close()
    return {"message": "Staff account added", "id": new_id, "username": req.username, "role": req.role}

@app.delete("/api/staff/{account_id}")
def delete_staff(account_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM accounts WHERE id = ?", (account_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Account not found")
    if row["role"] == "owner":
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot delete owner account")

    cursor.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return {"message": "Staff account deleted"}

@app.post("/api/auth/change-credentials")
def change_credentials(req: PasswordChangeRequest, x_username: str = Header("ramu")):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, password FROM accounts WHERE username = ?", (x_username,))
    row = cursor.fetchone()
    if not row or row["password"] != req.current_password:
        conn.close()
        raise HTTPException(status_code=400, detail="Current password incorrect")

    new_u = req.new_username.strip() if req.new_username else x_username
    new_p = req.new_password if req.new_password else row["password"]

    try:
        cursor.execute("UPDATE accounts SET username = ?, password = ? WHERE id = ?", (new_u, new_p, row["id"]))
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="Username already in use")

    conn.close()
    return {"message": "Credentials updated successfully", "username": new_u}

# ----------------- DASHBOARD METRICS -----------------

@app.get("/api/dashboard/stats")
def get_dashboard_stats():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Total Types & Units
    cursor.execute("SELECT COUNT(*), SUM(qty), SUM(total_cost) FROM inventory_items")
    inv = cursor.fetchone()
    total_types = inv[0] or 0
    total_units = round(inv[1] or 0, 2)
    total_cost = round(inv[2] or 0, 2)

    # Current Month Sales and Profit/Loss
    now = datetime.now()
    cur_m = now.strftime("%Y-%m")

    cursor.execute("SELECT SUM(total) FROM stock_entries WHERE month_key = ?", (cur_m,))
    m_exp = cursor.fetchone()[0] or 0.0

    cursor.execute("SELECT SUM(amount) FROM sales WHERE month_key = ?", (cur_m,))
    m_sal = cursor.fetchone()[0] or 0.0

    pl = round(m_sal - m_exp, 2)

    # Low stock items
    cursor.execute("SELECT name, qty, low_stock_threshold FROM inventory_items WHERE qty <= low_stock_threshold ORDER BY qty ASC")
    low_stock = [dict(r) for r in cursor.fetchall()]

    # Recent entries (last 6)
    cursor.execute("SELECT * FROM stock_entries ORDER BY id DESC LIMIT 6")
    recent_entries = [dict(r) for r in cursor.fetchall()]

    # Top items by total cost (last 6)
    cursor.execute("SELECT * FROM inventory_items ORDER BY total_cost DESC LIMIT 6")
    top_items = [dict(r) for r in cursor.fetchall()]

    conn.close()

    return {
        "stat_types": total_types,
        "stat_units": total_units,
        "stat_cost": total_cost,
        "stat_profit": pl,
        "current_month_sales": round(m_sal, 2),
        "current_month_expenses": round(m_exp, 2),
        "low_stock": low_stock,
        "recent_entries": recent_entries,
        "top_items": top_items
    }

# ----------------- STOCK ENTRIES & INVENTORY -----------------

@app.get("/api/inventory")
def get_inventory(category: Optional[str] = None, search: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM inventory_items WHERE 1=1"
    params = []

    if category and category != "All":
        query += " AND category = ?"
        params.append(category)

    if search:
        query += " AND name LIKE ?"
        params.append(f"%{search.strip()}%")

    query += " ORDER BY total_cost DESC"
    cursor.execute(query, params)
    items = [dict(r) for r in cursor.fetchall()]
    conn.close()

    for item in items:
        thresh = item.get("low_stock_threshold") or 5
        item["low_stock"] = item["qty"] <= thresh

    return items

@app.post("/api/entries")
async def add_stock_entry(
    name: str = Form(...),
    qty: float = Form(...),
    price: float = Form(...),
    category: str = Form("Groceries"),
    threshold: Optional[float] = Form(None),
    added_by: str = Form("ramu"),
    file: Optional[UploadFile] = File(None)
):
    clean_name = name.strip()
    total = round(qty * price, 2)
    t_labels = get_time_labels()

    photo_url = None
    if file and file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
            fname = f"{uuid.uuid4().hex[:10]}_{file.filename.replace(' ', '_')}"
            dest = UPLOADS_DIR / fname
            with open(dest, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            photo_url = f"/uploads/{fname}"

    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Insert into stock_entries
    cursor.execute("""
    INSERT INTO stock_entries (name, category, qty, price, total, threshold, photo_url, added_by, date_label, day_label, time_label, month_key, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (clean_name, category, qty, price, total, threshold, photo_url, added_by, t_labels["date_label"], t_labels["day_label"], t_labels["time_label"], t_labels["month_key"], t_labels["ts"]))
    entry_id = cursor.lastrowid

    # 2. Check and Merge with inventory_items
    cursor.execute("SELECT id, qty, total_cost, photo_url, low_stock_threshold, entry_count FROM inventory_items WHERE LOWER(name) = LOWER(?)", (clean_name,))
    existing = cursor.fetchone()

    if existing:
        new_qty = existing["qty"] + qty
        new_total = existing["total_cost"] + total
        new_photo = photo_url if photo_url else existing["photo_url"]
        new_thresh = threshold if (threshold is not None and threshold > 0) else existing["low_stock_threshold"]
        new_count = (existing["entry_count"] or 1) + 1

        cursor.execute("""
        UPDATE inventory_items 
        SET qty = ?, total_cost = ?, last_price = ?, low_stock_threshold = ?, photo_url = ?, entry_count = ?, last_updated = ?
        WHERE id = ?
        """, (new_qty, new_total, price, new_thresh, new_photo, new_count, t_labels["ts"], existing["id"]))
    else:
        cursor.execute("""
        INSERT INTO inventory_items (name, category, qty, total_cost, last_price, low_stock_threshold, photo_url, entry_count, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        """, (clean_name, category, qty, total, price, threshold or 5, photo_url, t_labels["ts"]))

    conn.commit()
    conn.close()

    return {"message": "Stock entry added and merged into inventory", "entry_id": entry_id, "name": clean_name}

@app.get("/api/entries")
def get_entries(limit: int = 200):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM stock_entries ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.delete("/api/entries/{entry_id}")
def delete_entry(entry_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name, qty, total FROM stock_entries WHERE id = ?", (entry_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Entry not found")

    name = row["name"]
    qty = row["qty"]
    total = row["total"]

    # Delete entry
    cursor.execute("DELETE FROM stock_entries WHERE id = ?", (entry_id,))

    # Deduct from inventory
    cursor.execute("SELECT id, qty, total_cost, entry_count FROM inventory_items WHERE LOWER(name) = LOWER(?)", (name,))
    inv = cursor.fetchone()
    if inv:
        updated_qty = max(0, inv["qty"] - qty)
        updated_total = max(0, inv["total_cost"] - total)
        updated_count = max(0, (inv["entry_count"] or 1) - 1)
        if updated_count == 0 or updated_qty == 0:
            cursor.execute("DELETE FROM inventory_items WHERE id = ?", (inv["id"],))
        else:
            cursor.execute("UPDATE inventory_items SET qty = ?, total_cost = ?, entry_count = ? WHERE id = ?",
                           (updated_qty, updated_total, updated_count, inv["id"]))

    conn.commit()
    conn.close()
    return {"message": "Entry removed successfully"}

# ----------------- SALES MANAGEMENT -----------------

@app.post("/api/sales")
def log_sale(sale: SaleCreate, x_username: str = Header("ramu")):
    t = get_time_labels()
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    INSERT INTO sales (amount, note, payment_mode, logged_by, date_label, day_label, time_label, month_key, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (sale.amount, sale.note, sale.payment_mode or "Cash", x_username, t["date_label"], t["day_label"], t["time_label"], t["month_key"], t["ts"]))

    new_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"message": "Sale logged successfully", "id": new_id, "amount": sale.amount}

@app.get("/api/sales")
def get_sales(view: str = "daily"):
    conn = get_db_connection()
    cursor = conn.cursor()

    if view == "daily":
        cursor.execute("""
        SELECT 
            date_label, 
            substr(ts, 1, 10) as day_key, 
            COUNT(*) as count, 
            SUM(amount) as amount 
        FROM sales 
        GROUP BY day_key 
        ORDER BY day_key DESC 
        LIMIT 31
        """)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    else:
        cursor.execute("""
        SELECT 
            month_key, 
            COUNT(*) as count, 
            SUM(amount) as amount 
        FROM sales 
        GROUP BY month_key 
        ORDER BY month_key DESC 
        LIMIT 12
        """)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

@app.delete("/api/sales/{sale_id}")
def delete_sale(sale_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sales WHERE id = ?", (sale_id,))
    conn.commit()
    conn.close()
    return {"message": "Sale deleted"}

# ----------------- MONTHLY REPORTS & ANALYTICS -----------------

@app.get("/api/reports")
def get_reports():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Expenses by month
    cursor.execute("SELECT month_key, SUM(total) FROM stock_entries GROUP BY month_key ORDER BY month_key DESC LIMIT 6")
    exp_by_m = {r[0]: r[1] for r in cursor.fetchall()}

    # Sales by month
    cursor.execute("SELECT month_key, SUM(amount) FROM sales GROUP BY month_key ORDER BY month_key DESC LIMIT 6")
    sal_by_m = {r[0]: r[1] for r in cursor.fetchall()}

    # Spend by category
    cursor.execute("SELECT category, SUM(total) FROM stock_entries GROUP BY category ORDER BY SUM(total) DESC")
    cat_spend = [{"category": r[0], "total": round(r[1], 2)} for r in cursor.fetchall()]

    conn.close()

    months = sorted(list(set(list(exp_by_m.keys()) + list(sal_by_m.keys()))), reverse=True)[:6]

    monthly_summary = []
    for m in months:
        e = round(exp_by_m.get(m, 0), 2)
        s = round(sal_by_m.get(m, 0), 2)
        monthly_summary.append({
            "month_key": m,
            "expenses": e,
            "sales": s,
            "profit_loss": round(s - e, 2)
        })

    return {
        "monthly_summary": monthly_summary,
        "category_spend": cat_spend
    }

# ----------------- AI BUSINESS ADVISOR -----------------

@app.post("/api/advisor/chat")
def advisor_chat(req: AIChatRequest):
    conn = get_db_connection()
    reply = get_shop_analysis(req.message, conn)

    cursor = conn.cursor()
    cursor.execute("INSERT INTO chat_history (user_msg, bot_reply) VALUES (?, ?)", (req.message, reply))
    conn.commit()
    conn.close()

    return {"reply": reply}

# ----------------- SETTINGS & EXPORT -----------------

@app.get("/api/settings")
def get_settings():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    settings = {r[0]: r[1] for r in cursor.fetchall()}
    conn.close()
    return settings

@app.put("/api/settings")
def update_settings(req: SettingsUpdateRequest):
    conn = get_db_connection()
    cursor = conn.cursor()

    data = req.dict(exclude_unset=True)
    for k, v in data.items():
        if v is not None:
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))

    conn.commit()
    conn.close()
    return {"message": "Settings updated"}

@app.get("/api/export/inventory.csv")
def export_inventory_csv():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name, category, qty, last_price, total_cost, low_stock_threshold, last_updated FROM inventory_items ORDER BY category, name")
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Item Name", "Category", "Quantity In Stock", "Last Cost Price", "Total Spend", "Low Stock Threshold", "Last Updated"])
    for r in rows:
        writer.writerow(list(r))

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ramus_ledger_inventory.csv"}
    )

# ----------------- STATIC MOUNTING & SERVE -----------------

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")

@app.get("/")
def serve_index():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse({"status": "Frontend not ready yet"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
