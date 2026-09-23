import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "grocery_shop_manager", "backend"))

from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_all():
    print("1. Testing login with default username 'ramu' and password 'admin 123'...")
    r = client.post("/api/auth/login", json={"username": "ramu", "password": "admin 123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    user = r.json()
    print("   Login OK:", user)

    print("2. Testing settings and profile...")
    r = client.get("/api/settings")
    assert r.status_code == 200
    settings = r.json()
    print("   Settings OK:", settings.get("shop_name", "Ramu's Kirana"))

    print("3. Testing dashboard stats (types, units, total cost, profit/loss)...")
    r = client.get("/api/dashboard/stats")
    assert r.status_code == 200
    stats = r.json()
    print(f"   Dashboard stats OK: Types={stats['stat_types']}, Units={stats['stat_units']}, Spend=Rs.{stats['stat_cost']}, Net P&L=Rs.{stats['stat_profit']}")

    print("4. Testing inventory list...")
    r = client.get("/api/inventory")
    assert r.status_code == 200
    items = r.json()
    print(f"   Inventory OK: {len(items)} grocery items in database")

    print("5. Testing adding a grocery item & auto-recognition merge...")
    # Add 5 kg of an existing item or new item
    r = client.post("/api/entries", data={
        "name": "Tata Salt Crystal",
        "qty": 5.0,
        "price": 28.0,
        "category": "Groceries",
        "threshold": 3.0,
        "added_by": "ramu"
    })
    assert r.status_code == 200, f"Add entry failed: {r.text}"
    entry_res = r.json()
    print("   Stock entry OK:", entry_res)

    print("6. Testing history log (date, day of week, time for every entry)...")
    r = client.get("/api/entries")
    assert r.status_code == 200
    entries = r.json()
    latest = entries[0]
    print(f"   History OK: {len(entries)} entries logged.")
    print(f"   Latest entry stamp: {latest['day_label']}, {latest['date_label']} at {latest['time_label']} (Total: Rs.{latest['total']})")

    print("7. Testing sales counter & monthly report...")
    r = client.post("/api/sales", json={"amount": 450.0, "note": "Counter cash sale", "payment_mode": "Cash"})
    assert r.status_code == 200
    rep = client.get("/api/reports")
    assert rep.status_code == 200
    print("   Reports OK:", rep.json()["monthly_summary"][:1])

    print("8. Testing AI Business Advisor chat board...")
    r = client.post("/api/advisor/chat", json={"message": "What measures should I take to reduce losses and gain more profit?"})
    assert r.status_code == 200
    ai_reply = r.json()["reply"]
    print("   AI Advisor Response OK (length: %d chars)" % len(ai_reply))
    print("   AI Snippet:", ai_reply[:140].encode('ascii', 'replace').decode() + "...")

    print("\n--------------------------------------------------------------")
    print(" SUCCESS: ALL GROCERY SHOP BACKEND AND WORKFLOW TESTS PASSED! ")
    print("--------------------------------------------------------------")

if __name__ == "__main__":
    test_all()
