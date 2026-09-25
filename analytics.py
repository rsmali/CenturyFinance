"""
Century Finance Financial Analytics & Trend Engine
Computes:
- Multi-month trend aggregation
- Dynamic investment breakdown (Livret A, Brokerage/CTO, PEA, etc.)
- Reimbursed rent neutralization
- Anomaly / out-of-ordinary category detection
- Recurring subscriptions & baseline budget calculation
"""

import re
from datetime import datetime
from collections import defaultdict

from config import (
    CATEGORIES,
    CATEGORY_COLORS,
    CATEGORY_ICONS,
    DEFAULT_WORKSPACE_PROFILE
)

MONTH_NAMES_FR = {
    "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril",
    "05": "Mai", "06": "Juin", "07": "Juillet", "08": "Août",
    "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre"
}

def get_month_key(date_str: str) -> str:
    """Converts DD/MM/YYYY to YYYY-MM for sorting and grouping."""
    parts = date_str.split('/')
    if len(parts) == 3:
        day, month, year = parts
        if len(year) == 2:
            year = f"20{year}"
        return f"{year}-{month.zfill(2)}"
    return "Inconnu"

def get_month_label(month_key: str) -> str:
    """Converts YYYY-MM to 'Juin 2026'."""
    if "-" in month_key:
        y, m = month_key.split("-")
        m_name = MONTH_NAMES_FR.get(m, m)
        return f"{m_name} {y}"
    return month_key

def compute_multi_month_trends(transactions: list, profile: dict = None) -> dict:
    """
    Computes month-over-month trends, category evolution,
    dynamically categorized investments, and detects out-of-ordinary category spending.
    """
    if not transactions:
        return {}

    profile = profile or DEFAULT_WORKSPACE_PROFILE
    account_holders = [k.upper().strip() for k in profile.get("account_holder_keywords", []) if k.strip()]
    salary_keywords = [k.upper().strip() for k in profile.get("salary_keywords", ["SALAIRE", "REMUNERATION", "PAYE"]) if k.strip()]
    family_keywords = [k.upper().strip() for k in profile.get("family_keywords", []) if k.strip()]
    rent_keywords = [k.upper().strip() for k in profile.get("rent_keywords", ["LOYER", "RENT"]) if k.strip()]
    investment_accounts = profile.get("investment_accounts", [])

    # Group transactions by YYYY-MM
    months_dict = defaultdict(lambda: {
        "income": 0.0,
        "income_salary": 0.0,
        "gifts": 0.0,
        "reimbursements": 0.0,
        "rent_reimbursements": 0.0,
        "expenses": 0.0,
        "investments_debits": 0.0,
        "investments_withdrawals": 0.0,
        "investments_total": 0.0,
        "investments_livret_a": 0.0,
        "investments_livret_a_deposits": 0.0,
        "investments_livret_a_withdrawals": 0.0,
        "investments_cto": 0.0,
        "investments_by_account": defaultdict(lambda: {"deposits": 0.0, "withdrawals": 0.0, "net": 0.0}),
        "categories": defaultdict(float),
        "merchants": defaultdict(float),
        "count": 0,
        "transactions": []
    })

    for tx in transactions:
        d = tx.get("date", "")
        m_key = get_month_key(d)
        if m_key == "Inconnu":
            continue

        amt = tx.get("amount", 0.0)
        cat = tx.get("category", "Autre")
        merch = tx.get("merchant") or tx.get("description", "Autre")
        desc_u = tx.get("description", "").upper()
        merch_u = merch.upper()

        months_dict[m_key]["count"] += 1
        months_dict[m_key]["transactions"].append(tx)

        if tx.get("type") == "Credit":
            # 1. Money coming from savings / investments back to checking
            is_inv_withdrawal = (
                cat == "Investissements & Épargne"
                or "RETRAIT LIVRET" in merch_u
                or "RETRAIT" in merch_u
                or (account_holders and any(k in desc_u for k in account_holders))
                or "LIVRET" in desc_u
            )

            if is_inv_withdrawal:
                months_dict[m_key]["investments_withdrawals"] += amt
                months_dict[m_key]["investments_total"] -= amt
                # Subtract from category spending for Investissements & Épargne
                months_dict[m_key]["categories"]["Investissements & Épargne"] -= amt

                # Attribute to specific investment account
                matched_acc_id = None
                for inv in investment_accounts:
                    inv_keys = [k.upper() for k in inv.get("keywords", []) if k]
                    if any(k in desc_u for k in inv_keys) or any(k in merch_u for k in inv_keys):
                        matched_acc_id = inv.get("id")
                        break

                if not matched_acc_id and investment_accounts:
                    matched_acc_id = investment_accounts[0].get("id")

                if matched_acc_id == "livret_a" or "LIVRET" in desc_u or "LIVRET" in merch_u or is_inv_withdrawal:
                    months_dict[m_key]["investments_livret_a_withdrawals"] += amt
                    months_dict[m_key]["investments_livret_a"] -= amt

                if matched_acc_id:
                    months_dict[m_key]["investments_by_account"][matched_acc_id]["withdrawals"] += amt
                    months_dict[m_key]["investments_by_account"][matched_acc_id]["net"] -= amt

            elif (
                cat == "Logement & Énergie"
                or any(k in desc_u for k in rent_keywords)
                or any(k in merch_u for k in rent_keywords)
            ):
                # Rent reimbursement cancels out rent expense
                months_dict[m_key]["categories"]["Logement & Énergie"] -= amt
                months_dict[m_key]["rent_reimbursements"] += amt
                months_dict[m_key]["reimbursements"] += amt

            elif (
                cat == "Salaires & Revenus"
                or any(k in desc_u for k in salary_keywords)
            ):
                months_dict[m_key]["income_salary"] += amt
                months_dict[m_key]["income"] += amt

            elif (
                cat == "Cadeaux & Dons"
                or (family_keywords and any(k in desc_u for k in family_keywords))
            ):
                months_dict[m_key]["gifts"] += amt

            else:
                months_dict[m_key]["reimbursements"] += amt
                if cat in CATEGORIES and cat not in ["Remboursements & Avoirs"]:
                    months_dict[m_key]["categories"][cat] -= amt
        else:
            exp = abs(amt)
            months_dict[m_key]["expenses"] += exp
            months_dict[m_key]["categories"][cat] += exp
            months_dict[m_key]["merchants"][merch] += exp

            # Categorize investment debits
            is_inv_debit = (
                cat == "Investissements & Épargne"
                or any(
                    any(k.upper() in desc_u for k in inv.get("keywords", []))
                    for inv in investment_accounts
                )
            )

            if is_inv_debit:
                months_dict[m_key]["investments_debits"] += exp
                months_dict[m_key]["investments_total"] += exp

                matched_acc_id = None
                for inv in investment_accounts:
                    inv_keys = [k.upper() for k in inv.get("keywords", []) if k]
                    inv_name = (inv.get("name") or "").upper()
                    if any(k in desc_u for k in inv_keys) or any(k in merch_u for k in inv_keys) or (inv_name and inv_name in merch_u):
                        matched_acc_id = inv.get("id")
                        break

                if not matched_acc_id and investment_accounts:
                    matched_acc_id = investment_accounts[0].get("id")

                if matched_acc_id:
                    months_dict[m_key]["investments_by_account"][matched_acc_id]["deposits"] += exp
                    months_dict[m_key]["investments_by_account"][matched_acc_id]["net"] += exp

                # Compatibility legacy fields for older components
                if matched_acc_id == "livret_a" or "LIVRET" in desc_u or "LIVRET" in merch_u:
                    months_dict[m_key]["investments_livret_a_deposits"] += exp
                    months_dict[m_key]["investments_livret_a"] += exp
                else:
                    months_dict[m_key]["investments_cto"] += exp

    sorted_month_keys = sorted(months_dict.keys())

    # Build monthly summaries
    monthly_data = []
    all_categories = set()

    for m_key in sorted_month_keys:
        m = months_dict[m_key]
        inc_salary = m["income_salary"]
        exp_total = m["expenses"]
        invest_debits = m["investments_debits"]
        invest_total = m["investments_total"]
        invest_livret_a = m["investments_livret_a"]
        invest_cto = m["investments_cto"]
        reimb_total = m["reimbursements"]
        rent_reimb = m.get("rent_reimbursements", 0.0)

        # Living expenses: total debits minus investment deposits minus reimbursed rent
        exp_living = max(0.0, exp_total - invest_debits - rent_reimb)
        other_reimb = max(0.0, reimb_total - rent_reimb)
        exp_living_net = max(0.0, exp_living - other_reimb)

        # Real savings on operational living expenses
        savings_real = inc_salary - exp_living
        savings_rate_real = ((savings_real / inc_salary) * 100) if inc_salary > 0 else 0.0

        cats = {c: round(v, 2) for c, v in m["categories"].items()}
        all_categories.update(cats.keys())

        # Top 3 merchants for this month
        top_merch = sorted(m["merchants"].items(), key=lambda x: x[1], reverse=True)[:3]

        monthly_data.append({
            "month_key": m_key,
            "label": get_month_label(m_key),
            "income": round(inc_salary, 2),
            "income_salary": round(inc_salary, 2),
            "gifts": round(m["gifts"], 2),
            "reimbursements": round(reimb_total, 2),
            "expenses": round(exp_living, 2),       # Living expenses (net of rent reimbursement)
            "expenses_total": round(exp_total, 2),   # Raw total debits
            "expenses_living": round(exp_living, 2),
            "expenses_living_net": round(exp_living_net, 2), # Deducting all reimbursements
            "investments": round(invest_total, 2),
            "investments_livret_a": round(invest_livret_a, 2),
            "investments_livret_a_deposits": round(m["investments_livret_a_deposits"], 2),
            "investments_livret_a_withdrawals": round(m["investments_livret_a_withdrawals"], 2),
            "investments_cto": round(invest_cto, 2),
            "investments_by_account": {k: {"deposits": round(v["deposits"], 2), "withdrawals": round(v["withdrawals"], 2), "net": round(v["net"], 2)} for k, v in m["investments_by_account"].items()},
            "savings": round(inc_salary - exp_living, 2),
            "savings_real": round(savings_real, 2),
            "savings_rate": round(savings_rate_real, 1),
            "savings_rate_real": round(savings_rate_real, 1),

            "count": m["count"],
            "categories": cats,
            "top_merchants": [{"name": k, "amount": round(v, 2)} for k, v in top_merch]
        })

    # Detailed Category Trends with Monthly History & Out-of-Ordinary Anomaly Detection
    month_labels = [m["label"] for m in monthly_data]
    category_trends = []

    for cat in sorted(list(all_categories)):
        history = [m["categories"].get(cat, 0.0) for m in monthly_data]
        total_spent = sum(history)
        has_tx = any(t.get("category") == cat for t in transactions)
        if total_spent == 0 and not has_tx:
            continue

        non_zero = [v for v in history if v > 0]
        avg_spend = (total_spent / len(history)) if history else 0.0

        # Compute standard deviation for anomaly detection
        variance = sum((x - avg_spend) ** 2 for x in history) / len(history) if history else 0.0
        std_dev = variance ** 0.5

        unusual_months = []
        for idx, (val, m_obj) in enumerate(zip(history, monthly_data)):
            is_unusual = False
            pct_diff = round(((val - avg_spend) / avg_spend) * 100) if avg_spend > 0 else 0

            # Significant spending (> 35 EUR) and > 1.45x average or jump
            if val >= 35.0 and avg_spend > 0:
                if val >= (avg_spend * 1.45) or (std_dev > 0 and val >= (avg_spend + 1.15 * std_dev)):
                    is_unusual = True
                elif idx > 0 and (val - history[idx - 1]) >= 40.0 and history[idx - 1] > 0 and (val / history[idx - 1]) >= 1.5:
                    is_unusual = True

            if is_unusual:
                unusual_months.append({
                    "index": idx,
                    "month_key": m_obj["month_key"],
                    "month_label": m_obj["label"],
                    "amount": round(val, 2),
                    "avg": round(avg_spend, 2),
                    "pct_diff": pct_diff,
                    "message": f"Dépense inhabituelle en {m_obj['label']} : {val:.2f} € (+{pct_diff}% vs moyenne)."
                })

        # Informative badge if rent was 100% reimbursed
        is_rent_neutral = (cat == "Logement & Énergie" and total_spent <= 0 and has_tx)
        anomaly_badge = f"⚠️ Pic inhabituel ({unusual_months[0]['month_label']})" if unusual_months else None
        if is_rent_neutral:
            anomaly_badge = "✅ Loyer 100% compensé (0 € net)"

        category_trends.append({
            "category": cat,
            "color": CATEGORY_COLORS.get(cat, "#94a3b8"),
            "icon": CATEGORY_ICONS.get(cat, "📦"),
            "history": [round(v, 2) for v in history],
            "months": month_labels,
            "total_spent": round(max(0.0, total_spent), 2),
            "avg_monthly": round(max(0.0, avg_spend), 2),
            "current_month": round(history[-1] if history else 0.0, 2),
            "max_amount": round(max(history) if history else 0.0, 2),
            "out_of_ordinary": len(unusual_months) > 0,
            "unusual_months": unusual_months,
            "anomaly_badge": anomaly_badge,
            "rent_neutral": is_rent_neutral
        })

    # Sort category trends by total spending descending
    category_trends.sort(key=lambda x: x["total_spent"], reverse=True)

    # Anomaly / Overspending detection for general alerts
    anomalies = []
    for ct in category_trends:
        if ct["category"] == "Investissements & Épargne":
            continue
        if ct["out_of_ordinary"] and ct["unusual_months"]:
            for u in ct["unusual_months"]:
                anomalies.append({
                    "category": ct["category"],
                    "month": u["month_label"],
                    "amount": u["amount"],
                    "avg": u["avg"],
                    "pct_diff": u["pct_diff"],
                    "message": u["message"]
                })

    return {
        "months": sorted_month_keys,
        "monthly_data": monthly_data,
        "category_trends": category_trends,
        "all_categories": sorted(list(all_categories)),
        "anomalies": anomalies
    }

def detect_recurring_subscriptions(transactions: list) -> list:
    """
    Detects subscriptions and recurring monthly bills (telecom, streaming, insurance, banking).
    """
    subscriptions = []
    seen_patterns = set()

    for t in transactions:
        desc = t.get("description", "").upper()
        amt = abs(t.get("amount", 0.0))
        cat = t.get("category", "")

        is_sub = False
        name = t.get("merchant") or t.get("description", "")
        periodicity = "Mensuel"

        if re.search(r"ORANGE|FRANCE\s+TELECOM|SFR|BOUYGUES|FREE\s+MOBILE", desc):
            is_sub = True
            name = "Forfait Télécom / Internet"
        elif re.search(r"NETFLIX|SPOTIFY|DEEZER|PRIME|CANAL", desc) or ("APPLE" in desc and amt < 50.0):
            is_sub = True
            name = "Abonnement Streaming / Services"
        elif re.search(r"IMAGINE\s*R|NAVIGO|RATP", desc):
            is_sub = True
            name = "Pass Transport Navigo / Imagine R"
        elif re.search(r"SOBRIO|JAZZ|COTISATION\s+CARTE|SOGESSUR|MESSALIA", desc):
            is_sub = True
            name = t.get("merchant") or "Cotisation Bancaire"
        elif re.search(r"EDF|ENGIE|TOTALENERGIES", desc):
            is_sub = True
            name = "Énergie / Électricité"
        elif re.search(r"BASIC-FIT|FITNESS|SALLE", desc):
            is_sub = True
            name = "Abonnement Sport / Salle"

        if is_sub and name not in seen_patterns:
            seen_patterns.add(name)
            subscriptions.append({
                "name": name,
                "category": cat,
                "amount": amt,
                "periodicity": periodicity,
                "date": t.get("date", "")
            })

        subscriptions.sort(key=lambda s: s["amount"], reverse=True)
    return subscriptions

def compute_budget_baseline(transactions: list, months_count: int = 4, profile: dict = None) -> dict:
    """
    Computes a realistic baseline for the Budget Simulator:
    - Average monthly salary income
    - Average monthly spending broken down by each category over the last N months
    - Average monthly investments
    - Money left over ('reste à vivre')
    """
    if not transactions:
        return {
            "months_considered": [],
            "months_count": 0,
            "income": 0.0,
            "income_salary": 0.0,
            "categories": {c: 0.0 for c in CATEGORIES if c not in ["Salaires & Revenus", "Cadeaux & Dons", "Remboursements & Avoirs", "Investissements & Épargne"]},
            "investments": 0.0,
            "total_expenses": 0.0,
            "money_left_over": 0.0,
            "savings_rate": 0.0
        }

    trends = compute_multi_month_trends(transactions, profile=profile)
    monthly_data = trends.get("monthly_data", [])

    if not monthly_data:
        return {
            "months_considered": [],
            "months_count": 0,
            "income": 0.0,
            "income_salary": 0.0,
            "categories": {c: 0.0 for c in CATEGORIES if c not in ["Salaires & Revenus", "Cadeaux & Dons", "Remboursements & Avoirs", "Investissements & Épargne"]},
            "investments": 0.0,
            "total_expenses": 0.0,
            "money_left_over": 0.0,
            "savings_rate": 0.0
        }

    target_months = monthly_data[-months_count:] if len(monthly_data) >= months_count else monthly_data
    n = len(target_months)

    avg_salary = sum(m.get("income_salary", 0.0) for m in target_months) / n
    avg_invest = sum(m.get("investments", 0.0) for m in target_months) / n
    avg_livret_a = sum(m.get("investments_livret_a", 0.0) for m in target_months) / n
    avg_cto = sum(m.get("investments_cto", 0.0) for m in target_months) / n

    living_categories = [
        c for c in CATEGORIES 
        if c not in ["Salaires & Revenus", "Cadeaux & Dons", "Remboursements & Avoirs", "Investissements & Épargne"]
    ]

    cat_averages = {}
    total_living_expenses = 0.0

    for c in living_categories:
        avg_val = sum(m.get("categories", {}).get(c, 0.0) for m in target_months) / n
        cat_averages[c] = round(avg_val, 2)
        total_living_expenses += avg_val

    money_left_over = avg_salary - total_living_expenses - avg_invest
    savings_rate = ((money_left_over + avg_invest) / avg_salary * 100) if avg_salary > 0 else 0.0

    inv_accs = (profile or {}).get("investment_accounts", [])
    investments_by_account_avg = {}
    for inv in inv_accs:
        acc_id = inv.get("id")
        avg_acc = sum(m.get("investments_by_account", {}).get(acc_id, {}).get("net", 0.0) for m in target_months) / n
        investments_by_account_avg[acc_id] = round(avg_acc, 2)

    return {
        "months_considered": [m["label"] for m in target_months],
        "months_count": n,
        "income": round(avg_salary, 2),
        "income_salary": round(avg_salary, 2),
        "categories": cat_averages,
        "investments": round(avg_invest, 2),
        "investments_livret_a": round(avg_livret_a, 2),
        "investments_cto": round(avg_cto, 2),
        "investments_by_account": investments_by_account_avg,
        "investment_accounts": inv_accs,
        "total_expenses": round(total_living_expenses, 2),
        "money_left_over": round(money_left_over, 2),
        "savings_rate": round(savings_rate, 1)
    }
