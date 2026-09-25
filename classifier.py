"""
Century Finance Transaction Classifier
Hybrid Classification:
1. Dynamic Workspace Profile (Salary, Account Holders, Investment Accounts, Family transfers)
2. Persistent User Rules (Workspace-specific user_rules.json)
3. Universal Deterministic Heuristics (Standard French Banking patterns)
4. Local Ollama LLM (Qwen 2.5:7b) for ambiguous / unknown merchants
"""

import re
import json
import os
import requests

from config import (
    CATEGORIES,
    CATEGORY_COLORS,
    CATEGORY_ICONS,
    UNIVERSAL_RULES,
    DEFAULT_WORKSPACE_PROFILE
)

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
GLOBAL_RULES_FILE = os.path.join(ROOT_DIR, "user_rules.json")

def load_user_rules(workspace_dir: str = None) -> list:
    """Load persistent custom user rules from workspace or fallback to root for legacy standalone mode."""
    if workspace_dir:
        ws_path = os.path.join(workspace_dir, "user_rules.json")
        if os.path.exists(ws_path):
            try:
                with open(ws_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get("rules", [])
            except Exception as e:
                print(f"[Classifier] Failed to load rules from {ws_path}: {e}")
        return []

    # Standalone legacy fallback only if no workspace directory is provided
    if os.path.exists(GLOBAL_RULES_FILE):
        try:
            with open(GLOBAL_RULES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("rules", [])
        except Exception as e:
            print(f"[Classifier] Failed to load global rules from {GLOBAL_RULES_FILE}: {e}")
    return []

def save_user_rule(pattern: str, category: str, merchant: str = "", workspace_dir: str = None):
    """Save or update a custom rule in the active workspace user_rules.json (or global fallback)."""
    target_path = os.path.join(workspace_dir, "user_rules.json") if workspace_dir else GLOBAL_RULES_FILE
    rules = load_user_rules(workspace_dir)
    found = False
    clean_pat = pattern.strip().upper()

    for r in rules:
        if r.get("pattern", "").strip().upper() == clean_pat:
            r["category"] = category
            if merchant:
                r["merchant"] = merchant
            found = True
            break

    if not found:
        rules.append({
            "pattern": pattern.strip(),
            "category": category,
            "merchant": merchant.strip() or pattern.strip()
        })

    try:
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump({"rules": rules}, f, ensure_ascii=False, indent=2)
        print(f"[Classifier] Saved rule '{pattern}' -> '{category}' to {target_path}")
    except Exception as e:
        print(f"[Classifier] Error saving rule: {e}")

def rule_classify(desc: str, amount: float, tx_type: str, profile: dict = None, user_rules: list = None):
    """
    Dynamically classifies transaction using:
    1. Workspace Profile keywords (salary, account holder, family, investment accounts)
    2. Workspace Custom User Rules
    3. Universal French Banking Heuristics (groceries, telecom, dining, etc.)
    """
    clean_desc = desc.upper()
    profile = profile or {}
    user_rules = user_rules if user_rules is not None else load_user_rules()

    account_holders = [k.upper().strip() for k in profile.get("account_holder_keywords", []) if k.strip()]
    salary_keywords = [k.upper().strip() for k in profile.get("salary_keywords", ["SALAIRE", "REMUNERATION", "PAYE"]) if k.strip()]
    family_keywords = [k.upper().strip() for k in profile.get("family_keywords", []) if k.strip()]
    rent_keywords = [k.upper().strip() for k in profile.get("rent_keywords", ["LOYER", "RENT"]) if k.strip()]
    investment_accounts = profile.get("investment_accounts", [])

    # 1. Credits / Inflows
    if tx_type == "Credit":
        # A. Internal transfer from own savings / investment account back to checking:
        is_own_transfer = False
        if account_holders and any(k in clean_desc for k in account_holders):
            is_own_transfer = True
        elif "LIVRET" in clean_desc or "EPARGNE" in clean_desc:
            is_own_transfer = True

        if is_own_transfer:
            matched_inv_name = "Épargne"
            for inv in investment_accounts:
                inv_keys = [k.upper() for k in inv.get("keywords", []) if k]
                if any(k in clean_desc for k in inv_keys):
                    matched_inv_name = inv.get("name", "Épargne")
                    break
            return "Investissements & Épargne", f"Retrait {matched_inv_name}"

        # B. Primary Salary Income
        if any(k in clean_desc for k in salary_keywords):
            employer_name = profile.get("salary_employer_name", "Employeur (Salaire)")
            return "Salaires & Revenus", employer_name

        # C. Family gifts or rent advances
        if family_keywords and any(k in clean_desc for k in family_keywords):
            if any(k in clean_desc for k in rent_keywords):
                return "Logement & Énergie", "Remboursement Loyer (Famille)"
            return "Cadeaux & Dons", "Don / Cadeau (Famille)"

        # D. Direct rent reimbursements
        if any(k in clean_desc for k in rent_keywords):
            return "Logement & Énergie", "Remboursement Loyer"

        # E. General reimbursements (CAF, CPAM, etc.)
        return "Remboursements & Avoirs", "Remboursement"

    # 2. Check workspace user-defined custom rules
    for rule in user_rules:
        pat = rule.get("pattern", "")
        if pat and re.search(pat, clean_desc, re.IGNORECASE):
            return rule.get("category", "Autre"), rule.get("merchant", desc)

    # 3. Dynamic Investment Debits (Deposits to Livret A, Brokerage, PEA, etc.)
    for inv in investment_accounts:
        inv_keys = [k.upper() for k in inv.get("keywords", []) if k]
        if any(k in clean_desc for k in inv_keys):
            return "Investissements & Épargne", inv.get("name", "Investissement")

    # 4. High-Tech & Hardware vs Telecom services:
    if re.search(r"APPLE", clean_desc):
        if abs(amount) >= 60.0:
            return "High-Tech & Équipement", "Apple (Matériel / High-Tech)"
        else:
            return "Télécom & Abonnements", "Apple Services"

    if re.search(r"FNAC|DARTY|BOULANGER|LDLC|DELL\b|LENOVO|MATERIEL\.NET|MICROSOFT\s*STORE", clean_desc):
        if abs(amount) >= 60.0:
            return "High-Tech & Équipement", "High-Tech & Électronique"
        else:
            return "Shopping & Soins", "High-Tech & Électronique"

    # 5. Universal French heuristics
    for pattern, cat, default_merchant in UNIVERSAL_RULES:
        if re.search(pattern, clean_desc):
            merchant = default_merchant
            if "UBER" in clean_desc and "EATS" in clean_desc:
                merchant = "Uber Eats"
            elif "MAC DONALD" in clean_desc:
                merchant = "McDonald's"
            elif "KENTUCKY FRIED" in clean_desc:
                merchant = "KFC"
            elif "CARREFOUR" in clean_desc:
                merchant = "Carrefour"
            elif "ORANGE" in clean_desc:
                merchant = "Orange"
            elif "APRR" in clean_desc:
                merchant = "APRR Autoroutes"
            elif "PHARMA" in clean_desc:
                merchant = "Pharmacie"
            return cat, merchant

    # Fallback default
    return "Autre", "Divers"

def check_ollama_available(host: str = "http://localhost:11434") -> bool:
    try:
        r = requests.get(f"{host}/api/tags", timeout=2)
        return r.status_code == 200
    except Exception:
        return False

def classify_with_ollama(transactions: list, model: str = "qwen2.5:7b", host: str = "http://localhost:11434") -> list:
    """Classify unclassified or batch transactions using Ollama local LLM."""
    if not check_ollama_available(host):
        return transactions

    items_to_classify = []
    for i, tx in enumerate(transactions):
        items_to_classify.append({
            "id": i,
            "description": tx.get("description", ""),
            "amount": tx.get("amount", 0.0),
            "type": tx.get("type", "Debit")
        })

    prompt = f"""Tu es un analyste financier expert pour des comptes bancaires français.
Catégorise chaque transaction bancaire suivante.
Choisis EXCLUSIVEMENT parmi ces catégories :
{json.dumps(CATEGORIES, ensure_ascii=False)}

Règles strictes :
- Toute livraison de nourriture, fast food, bar ou resto (Uber Eats, Deliveroo, McDonald's, etc.) = "Restaurants & Sorties".
- Abonnements bancaires (Sobrio, Sogessur, Jazz, etc.) = "Frais Bancaires".
- Transports en commun (Imagine R, Navigo, SNCF, RATP) = "Transports & Péages".

Transactions à catégoriser :
{json.dumps(items_to_classify, ensure_ascii=False, indent=2)}

Réponds STRICTEMENT par un objet JSON valide suivant exactement cette structure :
{{
  "results": [
    {{"id": 0, "category": "Catégorie exacte", "merchant": "Nom propre du commerçant ou de l'entité"}}
  ]
}}"""

    try:
        resp = requests.post(f"{host}/api/generate", json={
            "model": model,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.1}
        }, timeout=45)

        if resp.status_code == 200:
            raw_text = resp.json().get("response", "")
            out = json.loads(raw_text)
            results_map = {r["id"]: r for r in out.get("results", [])}

            for i, tx in enumerate(transactions):
                if i in results_map:
                    cat = results_map[i].get("category", "")
                    if cat in CATEGORIES:
                        tx["category"] = cat
                    if results_map[i].get("merchant"):
                        tx["merchant"] = results_map[i].get("merchant")
    except Exception as e:
        print(f"[Classifier] Ollama error: {e}")

    return transactions

def classify_transactions(transactions: list, profile: dict = None, workspace_dir: str = None, use_ollama: bool = True, model: str = "qwen2.5:7b") -> list:
    """Hybrid classification: dynamic profile + persistent user rules + universal heuristics + Ollama local LLM."""
    user_rules = load_user_rules(workspace_dir)
    investment_accounts = (profile or {}).get("investment_accounts", [])

    for tx in transactions:
        # STRICT MANUAL OVERRIDE PROTECTION:
        # Never overwrite a user's manual category or merchant assignment
        if tx.get("manual_override"):
            cat = tx.get("category", "Autre")
            tx["color"] = CATEGORY_COLORS.get(cat, "#94a3b8")
            tx["icon"] = CATEGORY_ICONS.get(cat, "📦")
            if cat == "Investissements & Épargne" and not tx.get("investment_type"):
                desc_u = tx.get("description", "").upper()
                for inv in investment_accounts:
                    if any(k.upper() in desc_u for k in inv.get("keywords", [])):
                        tx["investment_type"] = inv.get("name")
                        break
            continue

        cat, merchant = rule_classify(
            tx.get("description", ""),
            tx.get("amount", 0.0),
            tx.get("type", "Debit"),
            profile=profile,
            user_rules=user_rules
        )
        tx["category"] = cat
        tx["merchant"] = merchant
        tx["color"] = CATEGORY_COLORS.get(cat, "#94a3b8")
        tx["icon"] = CATEGORY_ICONS.get(cat, "📦")

        if cat == "Investissements & Épargne":
            desc_u = tx.get("description", "").upper()
            matched_inv = None
            for inv in investment_accounts:
                if any(k.upper() in desc_u for k in inv.get("keywords", [])):
                    matched_inv = inv.get("name")
                    break
            tx["investment_type"] = matched_inv or (investment_accounts[0]["name"] if investment_accounts else "Épargne")

    # Use Ollama for any unclassified transactions or items flagged as 'Autre'
    # strictly excluding transactions with manual_override
    if use_ollama and check_ollama_available():
        unclassified = [tx for tx in transactions if tx.get("category") == "Autre" and not tx.get("manual_override")]
        if unclassified:
            print(f"[Classifier] Refining {len(unclassified)} ambiguous transactions with Ollama ({model})...")
            classify_with_ollama(unclassified, model=model)
            for tx in unclassified:
                cat = tx.get("category", "Autre")
                tx["color"] = CATEGORY_COLORS.get(cat, "#94a3b8")
                tx["icon"] = CATEGORY_ICONS.get(cat, "📦")

    return transactions

def analyze_budget_insights(transactions: list, profile: dict = None) -> dict:
    """
    Computes financial insights:
    - Recurring fixed charges (subscriptions, telecom, insurance, bank fees, utilities)
    - Discretionary / avoidable spending (restaurants, delivery/Uber Eats, bars, shopping)
    - Potential monthly savings recommendations
    """
    debits = [t for t in transactions if t.get("type") == "Debit"]
    credits = [t for t in transactions if t.get("type") == "Credit"]
    total_debits = sum(abs(t.get("amount", 0.0)) for t in debits)
    total_credits = sum(t.get("amount", 0.0) for t in credits)

    # 1. Recurring Fixed Charges
    fixed_categories = ["Logement & Énergie", "Télécom & Abonnements", "Frais Bancaires", "Transports & Péages"]
    fixed_txs = [t for t in debits if t.get("category") in fixed_categories]
    fixed_total = sum(abs(t.get("amount", 0.0)) for t in fixed_txs)

    # 2. Food & Essentials
    essential_categories = ["Alimentation & Supermarchés", "Santé & Pharmacie"]
    essential_txs = [t for t in debits if t.get("category") in essential_categories]
    essential_total = sum(abs(t.get("amount", 0.0)) for t in essential_txs)

    # 3. Discretionary / Lifestyle / Avoidable ("Plaisir & Sorties")
    discretionary_categories = ["Restaurants & Sorties", "Shopping & Soins", "Tabac & Presse"]
    discretionary_txs = [t for t in debits if t.get("category") in discretionary_categories]
    discretionary_total = sum(abs(t.get("amount", 0.0)) for t in discretionary_txs)

    # Cash & Cheques
    cash_cheques_txs = [t for t in debits if t.get("category") in ["Retraits Espèces (DAB)", "Chèques Émis"]]
    cash_cheques_total = sum(abs(t.get("amount", 0.0)) for t in cash_cheques_txs)

    # Specific focus on Food Delivery & Fast Food & Going Out (Uber Eats, Bars, etc.)
    delivery_txs = [t for t in debits if re.search(r"UBER|DELIVEROO|EATS", t.get("description", ""), re.I)]
    delivery_total = sum(abs(t.get("amount", 0.0)) for t in delivery_txs)

    restaurants_bars_txs = [t for t in debits if t.get("category") == "Restaurants & Sorties"]
    restaurants_bars_total = sum(abs(t.get("amount", 0.0)) for t in restaurants_bars_txs)

    # 4. Investments & Wealth Transfers
    investments_txs = [t for t in debits if t.get("category") == "Investissements & Épargne"]
    investments_total = sum(abs(t.get("amount", 0.0)) for t in investments_txs)

    # 5. Sports & Fitness
    sports_txs = [t for t in debits if t.get("category") == "Sports & Fitness"]
    sports_total = sum(abs(t.get("amount", 0.0)) for t in sports_txs)

    # Potential savings: cutting 35% of discretionary spending
    potential_savings = (discretionary_total * 0.35)

    recommendations = []
    if investments_total > 0:
        recommendations.append({
            "type": "info",
            "title": "Investissements & Épargne",
            "message": f"Vous avez placé {investments_total:.2f} € en investissements / épargne. Cet argent constitue votre patrimoine et n'est pas une dépense perdue !"
        })
    if delivery_total > 50:
        recommendations.append({
            "type": "warning",
            "title": "Livraisons de repas (Uber Eats / Deliveroo)",
            "message": f"Vous avez dépensé {delivery_total:.2f} € en livraisons ce mois-ci ({len(delivery_txs)} commandes). Préparer vos repas pourrait vous faire économiser ~{(delivery_total * 0.7):.0f} €/mois."
        })
    if sports_total > 0:
        recommendations.append({
            "type": "neutral",
            "title": "Sport & Fitness",
            "message": f"Dépenses sport / abonnements sportifs : {sports_total:.2f} €/mois."
        })
    if restaurants_bars_total > 100:
        recommendations.append({
            "type": "info",
            "title": "Restaurants & Sorties",
            "message": f"Ce poste représente {restaurants_bars_total:.2f} € ({((restaurants_bars_total / total_debits)*100 if total_debits else 0):.1f}% de vos dépenses). Réduire les sorties de moitié libérerait ~{(restaurants_bars_total * 0.5):.0f} €."
        })
    if fixed_total > 0:
        recommendations.append({
            "type": "neutral",
            "title": "Charges fixes & Abonnements",
            "message": f"Vos charges fixes récurrentes s'élèvent à {fixed_total:.2f} €/mois (Télécom, Énergie, Banque, Transports)."
        })

    return {
        "total_debits": total_debits,
        "total_credits": total_credits,
        "fixed_total": fixed_total,
        "essential_total": essential_total,
        "discretionary_total": discretionary_total,
        "cash_cheques_total": cash_cheques_total,
        "delivery_total": delivery_total,
        "delivery_count": len(delivery_txs),
        "restaurants_bars_total": restaurants_bars_total,
        "investments_total": investments_total,
        "sports_total": sports_total,
        "potential_savings": potential_savings,
        "recommendations": recommendations,
        "breakdown_pct": {
            "fixed": ((fixed_total / total_debits) * 100) if total_debits else 0,
            "essentials": ((essential_total / total_debits) * 100) if total_debits else 0,
            "discretionary": ((discretionary_total / total_debits) * 100) if total_debits else 0,
            "cash_cheques": ((cash_cheques_total / total_debits) * 100) if total_debits else 0,
        }
    }
