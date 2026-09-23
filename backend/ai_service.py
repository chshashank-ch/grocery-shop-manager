import os
import sqlite3
from typing import List, Dict, Any

def get_shop_analysis(user_msg: str, conn: sqlite3.Connection) -> str:
    """
    Intelligent Kirana Shop Business Advisor.
    Extracts real shop metrics from SQLite and returns grounded, actionable advice.
    """
    cursor = conn.cursor()

    # 1. Total inventory valuation & item count
    cursor.execute("SELECT COUNT(*), SUM(qty), SUM(total_cost) FROM inventory_items")
    inv_row = cursor.fetchone()
    total_types = inv_row[0] or 0
    total_units = inv_row[1] or 0
    total_stock_value = inv_row[2] or 0

    # 2. Low stock items
    cursor.execute("SELECT name, qty, low_stock_threshold FROM inventory_items WHERE qty <= low_stock_threshold ORDER BY qty ASC")
    low_stock_rows = cursor.fetchall()
    low_stock_names = [f"{r[0]} ({r[1]} left)" for r in low_stock_rows[:5]]

    # 3. Monthly expenses and sales
    cursor.execute("""
    SELECT 
        strftime('%Y-%m', ts) as m, 
        SUM(total) 
    FROM stock_entries 
    GROUP BY m 
    ORDER BY m DESC 
    LIMIT 3
    """)
    exp_months = {r[0]: r[1] for r in cursor.fetchall()}

    cursor.execute("""
    SELECT 
        strftime('%Y-%m', ts) as m, 
        SUM(amount) 
    FROM sales 
    GROUP BY m 
    ORDER BY m DESC 
    LIMIT 3
    """)
    sal_months = {r[0]: r[1] for r in cursor.fetchall()}

    all_months = sorted(list(set(list(exp_months.keys()) + list(sal_months.keys()))), reverse=True)
    current_m = all_months[0] if all_months else "Current"
    cur_exp = exp_months.get(current_m, 0)
    cur_sal = sal_months.get(current_m, 0)
    cur_pl = cur_sal - cur_exp

    # 4. Top 3 highest spend items
    cursor.execute("SELECT name, total_cost, qty FROM inventory_items ORDER BY total_cost DESC LIMIT 3")
    top_items = cursor.fetchall()
    top_items_str = ", ".join([f"{r[0]} (₹{round(r[1]):,})" for r in top_items]) if top_items else "None"

    # Contextual responses based on user query
    q = user_msg.lower()

    if "loss" in q or "profit" in q or "trend" in q:
        if cur_pl < 0:
            return (
                f"📊 Current Month Financial Summary:\n"
                f"• Sales: ₹{round(cur_sal):,} | Stock Spend: ₹{round(cur_exp):,} | Net Deficit: ₹{round(abs(cur_pl)):,}.\n"
                f"• Top capital tied up in: {top_items_str}.\n"
                f"💡 Recommendation: Hold off on bulk reorders for high-cost stock until current units sell down. Ensure counter sales are logged consistently each evening."
            )
        else:
            return (
                f"📈 Positive Trend:\n"
                f"• Current Month Sales: ₹{round(cur_sal):,} against Stock Cost: ₹{round(cur_exp):,}.\n"
                f"• Net Surplus: +₹{round(cur_pl):,}.\n"
                f"💡 Recommendation: Reinvest 20% of profits into fast-moving daily essentials to maximize turnover."
            )

    elif "stock" in q or "more" in q or "buy" in q or "order" in q or "reorder" in q:
        if low_stock_rows:
            return (
                f"⚠️ Urgent Restock Alert ({len(low_stock_rows)} items running low):\n"
                f"• Critical items: {', '.join(low_stock_names)}.\n"
                f"💡 Reorder these items immediately in small batches from local distributors to avoid losing walk-in customers."
            )
        else:
            return (
                f"✅ All inventory items are currently above their safety thresholds ({total_types} item types active).\n"
                f"💡 Consider tracking expiration dates or offering bundled offers on high-cost items: {top_items_str}."
            )

    elif "expense" in q or "cut" in q or "reduce" in q or "save" in q:
        return (
            f"💰 Expense Control Breakdown:\n"
            f"1. Your largest cash commitments are currently in {top_items_str}.\n"
            f"2. Negotiate 3-5% cash-settlement discounts with your FMCG and grains wholesalers.\n"
            f"3. Keep perishable items (dairy/produce) to 2-day inventory turns to eliminate spoilage loss."
        )

    else:
        status_line = f"Surplus: +₹{round(cur_pl):,}" if cur_pl >= 0 else f"Deficit: -₹{round(abs(cur_pl)):,}"
        return (
            f"🏪 Shop Snapshot for {current_m}:\n"
            f"• Total Stocked: {total_types} types ({round(total_units)} total units valued at ₹{round(total_stock_value):,}).\n"
            f"• Revenue vs Cost: Sales ₹{round(cur_sal):,} vs Spend ₹{round(cur_exp):,} ({status_line}).\n"
            f"• Alerts: {len(low_stock_rows)} items running low on shelf.\n"
            f"💡 Ask me: 'Which items to stock?', 'How to cut losses?', or 'Review my profit'."
        )
