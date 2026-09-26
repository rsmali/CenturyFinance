import os
import re
import glob
import json
import shutil
import unicodedata
from datetime import datetime
import pandas as pd
from flask import Flask, render_template, jsonify, request, send_file
from werkzeug.utils import secure_filename

from extractor import parse_sg_pdf
from config import (
    CATEGORIES,
    CATEGORY_COLORS,
    CATEGORY_ICONS,
    DEFAULT_WORKSPACE_PROFILE
)
from classifier import (
    classify_transactions, 
    check_ollama_available,
    load_user_rules,
    save_user_rule,
    analyze_budget_insights,
    extract_merchant_from_desc
)
from analytics import (
    compute_multi_month_trends, 
    detect_recurring_subscriptions,
    compute_budget_baseline,
    get_month_key,
    get_month_label
)

app = Flask(__name__, template_folder="templates")
app.config["UPLOAD_FOLDER"] = os.path.dirname(os.path.abspath(__file__))
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB limit

WORKSPACES_ROOT = os.path.join(app.config["UPLOAD_FOLDER"], "workspaces")
os.makedirs(WORKSPACES_ROOT, exist_ok=True)

STATEMENTS_DIR = os.path.join(WORKSPACES_ROOT, "default", "cache")
os.makedirs(STATEMENTS_DIR, exist_ok=True)

def init_default_workspace():
    """Initializes default workspace and migrates existing PDFs & caches if needed."""
    os.makedirs(WORKSPACES_ROOT, exist_ok=True)
    def_dir = os.path.join(WORKSPACES_ROOT, "default")
    def_pdfs = os.path.join(def_dir, "statements")
    def_cache = os.path.join(def_dir, "cache")
    os.makedirs(def_pdfs, exist_ok=True)
    os.makedirs(def_cache, exist_ok=True)

    meta_file = os.path.join(def_dir, "meta.json")
    if not os.path.exists(meta_file):
        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump({
                "id": "default",
                "name": "Compte Principal (SG)",
                "icon": "🏦",
                "color": "#2D5A3C",
                "account_type": "Courant",
                "currency": "EUR",
                "profile": DEFAULT_WORKSPACE_PROFILE.copy(),
                "created_at": "2026-09-01"
            }, f, ensure_ascii=False, indent=2)

    # Migrate root PDFs into default workspace statements if empty
    existing_ws_pdfs = glob.glob(os.path.join(def_pdfs, "*.pdf"))
    if not existing_ws_pdfs:
        root_pdfs = glob.glob(os.path.join(app.config["UPLOAD_FOLDER"], "*.pdf"))
        for p in root_pdfs:
            dest = os.path.join(def_pdfs, os.path.basename(p))
            if not os.path.exists(dest):
                shutil.copy2(p, dest)

    # Migrate cache into default workspace cache
    existing_ws_caches = glob.glob(os.path.join(def_cache, "*.json"))
    if not existing_ws_caches and os.path.exists(STATEMENTS_DIR):
        root_caches = glob.glob(os.path.join(STATEMENTS_DIR, "*.json"))
        for c in root_caches:
            dest = os.path.join(def_cache, os.path.basename(c))
            if not os.path.exists(dest):
                shutil.copy2(c, dest)

def get_workspace_context(ws_id: str = None) -> dict:
    init_default_workspace()
    if not ws_id:
        ws_id = request.args.get("workspace") or request.headers.get("X-Workspace-Id") or "default"
    
    ws_dir = os.path.join(WORKSPACES_ROOT, ws_id)
    if not os.path.exists(ws_dir):
        ws_id = "default"
        ws_dir = os.path.join(WORKSPACES_ROOT, "default")
    
    pdf_dir = os.path.join(ws_dir, "statements")
    cache_dir = os.path.join(ws_dir, "cache")
    csv_path = os.path.join(ws_dir, "transactions.csv")
    meta_file = os.path.join(ws_dir, "meta.json")
    os.makedirs(pdf_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)

    meta = {
        "id": ws_id,
        "name": ws_id.capitalize(),
        "icon": "📁",
        "color": "#2D5A3C",
        "account_type": "Courant",
        "currency": "EUR",
        "profile": DEFAULT_WORKSPACE_PROFILE.copy()
    }
    if os.path.exists(meta_file):
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                loaded_meta = json.load(f)
                meta.update(loaded_meta)
                if "profile" not in meta or not meta["profile"]:
                    meta["profile"] = DEFAULT_WORKSPACE_PROFILE.copy()
        except Exception:
            pass

    return {
        "id": ws_id,
        "ws_dir": ws_dir,
        "pdf_dir": pdf_dir,
        "cache_dir": cache_dir,
        "csv_path": csv_path,
        "meta": meta
    }

def list_workspaces() -> list:
    init_default_workspace()
    workspaces = []
    if not os.path.exists(WORKSPACES_ROOT):
        return []

    for d in sorted(os.listdir(WORKSPACES_ROOT)):
        p = os.path.join(WORKSPACES_ROOT, d)
        if os.path.isdir(p):
            meta_f = os.path.join(p, "meta.json")
            meta = {"id": d, "name": d.capitalize(), "icon": "📁", "color": "#2D5A3C", "account_type": "Courant"}
            if os.path.exists(meta_f):
                try:
                    with open(meta_f, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                except Exception:
                    pass
            pdf_count = len(glob.glob(os.path.join(p, "statements", "*.pdf")))
            tx_count = 0
            for c_f in glob.glob(os.path.join(p, "cache", "*.json")):
                try:
                    with open(c_f, "r", encoding="utf-8") as f:
                        tx_count += len(json.load(f).get("transactions", []))
                except Exception:
                    pass

            meta["pdf_count"] = pdf_count
            meta["tx_count"] = tx_count
            workspaces.append(meta)

    workspaces.sort(key=lambda x: (0 if x.get("id") == "default" else 1, x.get("name", "")))
    return workspaces

def parse_and_cache_pdf(pdf_path: str, cache_dir: str = None, profile: dict = None, ws_dir: str = None, force: bool = False) -> list:
    """Parses a single PDF and caches its classified transactions."""
    filename = os.path.basename(pdf_path)
    if not cache_dir:
        cache_dir = STATEMENTS_DIR
    cache_path = os.path.join(cache_dir, f"{filename}.json")

    existing_overrides = {}
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if not force and data.get("transactions"):
                    return data["transactions"]
                # Collect existing manual overrides before force re-parse
                for t in data.get("transactions", []):
                    if t.get("manual_override"):
                        sig = (t.get("date"), t.get("amount"), t.get("description"))
                        ov = {
                            "category": t.get("category"),
                            "merchant": t.get("merchant"),
                            "manual_override": True,
                            "color": t.get("color"),
                            "icon": t.get("icon")
                        }
                        if t.get("holiday_trip_id"):
                            ov["holiday_trip_id"] = t.get("holiday_trip_id")
                        existing_overrides[sig] = ov
        except Exception:
            pass

    print(f"[App] Processing statement: {filename}")
    df = parse_sg_pdf(pdf_path)
    if df.empty:
        return []

    records = df.to_dict(orient="records")
    for i, r in enumerate(records):
        r["id"] = f"{filename}_{i+1}"
        r["statement_file"] = filename
        sig = (r.get("date"), r.get("amount"), r.get("description"))
        if sig in existing_overrides:
            r.update(existing_overrides[sig])

    classified = classify_transactions(records, profile=profile, workspace_dir=ws_dir, use_ollama=False)

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"filename": filename, "transactions": classified}, f, ensure_ascii=False, indent=2)

    return classified

def get_all_statements_transactions(pdf_dir: str = None, cache_dir: str = None, profile: dict = None, ws_dir: str = None, force_reparse: bool = False) -> list:
    """Aggregates transactions across all PDF files in specified directory."""
    if not pdf_dir:
        pdf_dir = app.config["UPLOAD_FOLDER"]
    if not cache_dir:
        cache_dir = STATEMENTS_DIR

    pdfs = glob.glob(os.path.join(pdf_dir, "*.pdf"))
    all_txs = []
    seen = set()

    # Also include transactions from cache JSON files that might not have raw PDFs present (e.g. demo data)
    cached_jsons = glob.glob(os.path.join(cache_dir, "*.json"))
    for c_path in cached_jsons:
        fn = os.path.basename(c_path).replace(".json", "")
        matching_pdf = os.path.join(pdf_dir, fn)
        if not os.path.exists(matching_pdf):
            try:
                with open(c_path, "r", encoding="utf-8") as fp:
                    c_data = json.load(fp)
                    for t in c_data.get("transactions", []):
                        sig = (t.get("date"), t.get("amount"), t.get("description"))
                        if sig not in seen:
                            seen.add(sig)
                            all_txs.append(t)
            except Exception:
                pass

    for p in pdfs:
        txs = parse_and_cache_pdf(p, cache_dir=cache_dir, profile=profile, ws_dir=ws_dir, force=force_reparse)
        for t in txs:
            # Deduplication key: date + amount + description
            sig = (t.get("date"), t.get("amount"), t.get("description"))
            if sig not in seen:
                seen.add(sig)
                all_txs.append(t)

    # Sort by date (convert to comparable YYYY-MM-DD)
    def parse_d(t):
        parts = t.get("date", "").split("/")
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
        return "1970-01-01"

    all_txs.sort(key=parse_d, reverse=True)
    return all_txs

def save_master_csv(transactions: list, csv_path: str = None):
    if not csv_path:
        csv_path = os.path.join(app.config["UPLOAD_FOLDER"], "sg_clean_transactions.csv")
    df = pd.DataFrame(transactions)
    cols = ["date", "valeur_date", "type", "amount", "category", "merchant", "description", "statement_file"]
    avail_cols = [c for c in cols if c in df.columns]
    df[avail_cols].to_csv(csv_path, index=False, encoding="utf-8-sig")

def get_statements_detailed_info(pdf_dir: str = None, cache_dir: str = None):
    if not pdf_dir:
        pdf_dir = app.config["UPLOAD_FOLDER"]
    if not cache_dir:
        cache_dir = STATEMENTS_DIR

    pdfs = sorted(glob.glob(os.path.join(pdf_dir, "*.pdf")))
    res = []
    total_bytes = 0
    seen_bases = set()

    for p in pdfs:
        base = os.path.basename(p)
        seen_bases.add(base)
        seen_bases.add(base[:-4] if base.endswith(".pdf") else base)
        size_bytes = os.path.getsize(p)
        total_bytes += size_bytes
        mtime = os.path.getmtime(p)
        cache_p = os.path.join(cache_dir, f"{base}.json")
        tx_count = 0
        if os.path.exists(cache_p):
            try:
                with open(cache_p, "r", encoding="utf-8") as f:
                    d = json.load(f)
                    tx_count = len(d.get("transactions", []))
            except Exception:
                pass
        res.append({
            "filename": base,
            "size_kb": round(size_bytes / 1024, 2),
            "size_formatted": f"{round(size_bytes / 1024, 1)} KB",
            "mtime": mtime,
            "uploaded_date": datetime.fromtimestamp(mtime).strftime("%d %b %Y, %H:%M"),
            "tx_count": tx_count,
            "status": "Completed"
        })

    # Also include cached statements if no matching PDF is on disk (e.g. demo data)
    cached_jsons = sorted(glob.glob(os.path.join(cache_dir, "*.json")))
    for j in cached_jsons:
        j_base = os.path.basename(j).replace(".json", "")
        if j_base not in seen_bases:
            seen_bases.add(j_base)
            fn = j_base if j_base.endswith(".pdf") else f"{j_base}.pdf"
            size_bytes = os.path.getsize(j)
            total_bytes += size_bytes
            mtime = os.path.getmtime(j)
            tx_count = 0
            try:
                with open(j, "r", encoding="utf-8") as f:
                    d = json.load(f)
                    tx_count = len(d.get("transactions", []))
            except Exception:
                pass
            res.append({
                "filename": fn,
                "size_kb": round(size_bytes / 1024, 2),
                "size_formatted": f"{round(size_bytes / 1024, 1)} KB",
                "mtime": mtime,
                "uploaded_date": datetime.fromtimestamp(mtime).strftime("%d %b %Y, %H:%M"),
                "tx_count": tx_count,
                "status": "Completed"
            })

    return res, total_bytes

def format_fr(val: float) -> str:
    parts = f"{abs(val):.2f}".split(".")
    int_part = re.sub(r"\B(?=(\d{3})+(?!\d))", ".", parts[0])
    res = f"{int_part},{parts[1]} €"
    return f"-{res}" if val < 0 else res

def generate_financial_time_machine_patterns(all_txs: list, trends: dict, insights: dict) -> list:
    patterns = []
    monthly_data = trends.get("monthly_data", [])
    n_months = max(1, len(monthly_data))
    total_living = sum(m.get("expenses_living", 0.0) for m in monthly_data)
    
    # 1. Dining, Bars & Food Delivery (Proportional budget share)
    delivery_total = insights.get("delivery_total", 0.0)
    restaurants_total = insights.get("restaurants_bars_total", 0.0)
    dining_sum = delivery_total + restaurants_total
    delivery_count = insights.get("delivery_count", 0)
    
    if dining_sum > 0:
        dining_share_pct = round((dining_sum / total_living * 100), 1) if total_living > 0 else 0.0
        avg_dining_mo = dining_sum / n_months
        pot_save_mo = (dining_sum * 0.35) / n_months
        patterns.append({
            "id": "dining",
            "type": "Budget",
            "badge": f"{dining_share_pct:.0f}% du budget" if dining_share_pct > 0 else "Alimentation",
            "badge_color": "rose",
            "icon": "🍽️",
            "title": "Restaurants, Bars & Livraisons de repas",
            "description": f"Vos dépenses en restaurants et repas commandés totalisent {format_fr(dining_sum)} ({format_fr(avg_dining_mo)}/mois), soit {dining_share_pct:.1f}% de vos dépenses de vie.",
            "details": f"Privilégier la cuisine maison et réduire les plateformes de livraison ({delivery_count} commandes, {format_fr(delivery_total)}) dégagerait environ {format_fr(pot_save_mo)}/mois d'épargne supplémentaire.",
        })

    # 2. Wealth & Savings (Multi-month smoothed capacity analysis)
    inv_analysis = trends.get("investment_analysis", {})
    inv_diag = inv_analysis.get("diagnosis")
    if inv_diag:
        patterns.append({
            "id": "investments",
            "type": "Patrimoine",
            "badge": inv_diag["badge"],
            "badge_color": inv_diag["badge_color"],
            "icon": inv_diag["icon"],
            "title": inv_diag["title"],
            "description": inv_diag["summary"],
            "details": inv_diag["advice"]
        })
    elif insights.get("investments_total", 0.0) > 0:
        investments_total = insights.get("investments_total", 0.0)
        patterns.append({
            "id": "investments",
            "type": "Patrimoine",
            "badge": "Épargne",
            "badge_color": "purple",
            "icon": "📈",
            "title": "Constitution de Patrimoine & Épargne",
            "description": f"Vous avez placé {format_fr(investments_total)} en investissements et épargne de précaution.",
            "details": "Ces flux financiers augmentent directement votre valeur patrimoniale et ne constituent pas des dépenses consommées."
        })

    # 3. Fixed Subscriptions & Recurring Bills
    fixed_total = insights.get("fixed_total", 0.0)
    if fixed_total > 0:
        fixed_monthly = fixed_total / n_months
        fixed_share_pct = round((fixed_total / total_living * 100), 1) if total_living > 0 else 0.0
        patterns.append({
            "id": "recurring",
            "type": "Charges Fixes",
            "badge": f"{fixed_share_pct:.0f}% des charges" if fixed_share_pct > 0 else "Récurrent",
            "badge_color": "amber",
            "icon": "🔄",
            "title": "Abonnements et Charges Fixes",
            "description": f"Vos prélèvements récurrents s'élèvent à environ {format_fr(fixed_monthly)}/mois ({format_fr(fixed_total)} au total pour abonnements, forfaits, assurances).",
            "details": "Charges fixes régulières identifiées sur l'ensemble de vos relevés bancaires."
        })

    # 4. Sports & Fitness
    sports_total = insights.get("sports_total", 0.0)
    if sports_total > 0:
        sports_monthly = sports_total / n_months
        patterns.append({
            "id": "lifestyle",
            "type": "Santé",
            "badge": "Discipline",
            "badge_color": "pink",
            "icon": "⚡",
            "title": "Discipline Sport & Bien-être",
            "description": f"Abonnement constant dédié à la santé et aux activités sportives ({format_fr(sports_monthly)}/mois).",
            "details": "Dépense saine et régulière identifiée sur l'ensemble des relevés analysés."
        })

    # 5. Anomalies or Genuine Out-of-Ordinary Spikes
    raw_anomalies = trends.get("anomalies", [])
    valid_anomalies = [
        a for a in raw_anomalies
        if a.get("amount", 0.0) >= 150.0 
        and a.get("pct_diff", 0) >= 50 
        and (a.get("amount", 0.0) - a.get("avg", 0.0)) >= 100.0
        and a.get("current", 0.0) > 0
    ]

    if valid_anomalies:
        for a in valid_anomalies[:2]:
            curr = a.get("current", a.get("amount", 0.0))
            prev = a.get("previous", 0.0)
            avg = a.get("avg", 0.0)
            pct = a.get("pct_diff", a.get("delta_pct", 0))

            if prev > 0:
                details_str = f"Dépense passée de {format_fr(prev)} le mois précédent à {format_fr(curr)} en {a.get('month', '')}."
            else:
                details_str = f"Dépense ponctuelle de {format_fr(curr)} dépassant votre moyenne habituelle ({format_fr(avg)}/mois) de {format_fr(curr - avg)}."

            patterns.append({
                "id": f"anomaly_{a.get('category')}",
                "type": "Alerte",
                "badge": f"+{pct:.0f}%",
                "badge_color": "amber",
                "icon": "⚠️",
                "title": f"Variation notable : {a.get('category')}",
                "description": a.get("message"),
                "details": details_str
            })
    else:
        patterns.append({
            "id": "regularity",
            "type": "Stabilité",
            "badge": "Maîtrisé",
            "badge_color": "emerald",
            "icon": "🛡️",
            "title": "Trajectoire Budgétaire Maîtrisée",
            "description": "Les flux de revenus et dépenses de vie courante restent stables et cohérents sur toute la période, sans pic anormal imprévu.",
            "details": "Excellente prévisibilité budgétaire constatée sur les relevés bancaires."
        })

    return patterns

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/workspaces", methods=["GET"])
def get_workspaces_list():
    ws_ctx = get_workspace_context()
    return jsonify({
        "status": "ok",
        "workspaces": list_workspaces(),
        "active_workspace": ws_ctx["meta"]
    })

@app.route("/api/workspaces/create", methods=["POST"])
def handle_create_workspace():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"status": "error", "error": "Le nom du dossier / compte est requis"}), 400
    
    icon = data.get("icon") or "📁"
    color = data.get("color") or "#2D5A3C"
    acc_type = data.get("account_type") or "Courant"
    
    # ID slug
    slug = re.sub(r'[^a-z0-9_-]', '', name.lower().replace(' ', '-'))[:25]
    if not slug:
        slug = f"ws-{int(datetime.now().timestamp())}"
    
    target_dir = os.path.join(WORKSPACES_ROOT, slug)
    if os.path.exists(target_dir):
        slug = f"{slug}-{int(datetime.now().timestamp()) % 1000}"
        target_dir = os.path.join(WORKSPACES_ROOT, slug)

    os.makedirs(os.path.join(target_dir, "statements"), exist_ok=True)
    os.makedirs(os.path.join(target_dir, "cache"), exist_ok=True)
    
    meta = {
        "id": slug,
        "name": name,
        "icon": icon,
        "color": color,
        "account_type": acc_type,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
    }
    with open(os.path.join(target_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    return jsonify({"status": "ok", "workspace": meta, "workspaces": list_workspaces()})

@app.route("/api/workspaces/delete", methods=["POST"])
def handle_delete_workspace():
    data = request.get_json() or {}
    ws_id = (data.get("id") or "").strip()
    if not ws_id or ws_id == "default":
        return jsonify({"status": "error", "error": "Impossible de supprimer l'espace principal par défaut"}), 400
    
    target_dir = os.path.join(WORKSPACES_ROOT, ws_id)
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir, ignore_errors=True)
        return jsonify({"status": "ok", "workspaces": list_workspaces()})
    return jsonify({"status": "error", "error": "Espace introuvable"}), 404

@app.route("/api/workspace/profile", methods=["GET", "POST"])
def handle_workspace_profile():
    ws_id = request.args.get("workspace") or (request.get_json() or {}).get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    meta_path = os.path.join(ws_ctx["ws_dir"], "meta.json")

    if request.method == "GET":
        return jsonify({
            "status": "ok",
            "workspace_id": ws_ctx["id"],
            "profile": ws_ctx["meta"].get("profile", DEFAULT_WORKSPACE_PROFILE)
        })

    data = request.get_json() or {}
    new_profile = data.get("profile")
    if not new_profile or not isinstance(new_profile, dict):
        return jsonify({"status": "error", "error": "Profil invalide"}), 400

    # Ensure profile has proper structure
    meta = ws_ctx["meta"]
    meta["profile"] = new_profile
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # Reclassify all cached statements in this workspace with new profile
    cache_files = glob.glob(os.path.join(ws_ctx["cache_dir"], "*.json"))
    for cache_f in cache_files:
        try:
            with open(cache_f, "r", encoding="utf-8") as f:
                c = json.load(f)
            txs = c.get("transactions", [])
            classified = classify_transactions(txs, profile=new_profile, workspace_dir=ws_ctx["ws_dir"], use_ollama=False)
            c["transactions"] = classified
            with open(cache_f, "w", encoding="utf-8") as f:
                json.dump(c, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[App] Error reclassifying cache {cache_f} with new profile: {e}")

    all_txs = get_all_statements_transactions(pdf_dir=ws_ctx["pdf_dir"], cache_dir=ws_ctx["cache_dir"], profile=new_profile, ws_dir=ws_ctx["ws_dir"])
    save_master_csv(all_txs, csv_path=ws_ctx["csv_path"])

    return jsonify({
        "status": "ok",
        "message": "Profil du compte mis à jour avec succès",
        "profile": new_profile,
        "workspace": meta
    })

# -------------------------------------------------------------
# HOLIDAY TRIPS & EXPENSE GROUPS
# -------------------------------------------------------------
def get_holiday_trips_path(ws_dir: str) -> str:
    return os.path.join(ws_dir, "holiday_trips.json")

def load_holiday_trips(ws_dir: str) -> list:
    path = get_holiday_trips_path(ws_dir)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("trips", [])
        except Exception as e:
            print(f"[HolidayTrips] Failed to load {path}: {e}")
    return []

def save_holiday_trips(ws_dir: str, trips: list):
    path = get_holiday_trips_path(ws_dir)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"trips": trips}, f, ensure_ascii=False, indent=2)

def compute_holiday_trips_summary(ws_dir: str, transactions: list) -> list:
    trips = load_holiday_trips(ws_dir)
    if not trips:
        return []

    trips_map = {}
    for t in trips:
        trips_map[t["id"]] = {
            **t,
            "total_spent": 0.0,
            "tx_count": 0,
            "categories": {},
            "transaction_ids": []
        }

    for tx in transactions:
        trip_id = tx.get("holiday_trip_id")
        if trip_id and trip_id in trips_map:
            amt = tx.get("amount", 0.0)
            tx_type = tx.get("type", "Debit")
            cat = tx.get("category", "Autre")
            
            # Enrich transaction in place so UI knows trip name, icon, color
            tx["holiday_trip_name"] = trips_map[trip_id].get("name")
            tx["holiday_trip_icon"] = trips_map[trip_id].get("icon", "🏖️")
            tx["holiday_trip_color"] = trips_map[trip_id].get("color", "#0ea5e9")

            trips_map[trip_id]["tx_count"] += 1
            trips_map[trip_id]["transaction_ids"].append(tx.get("id"))
            
            cost = abs(amt) if tx_type == "Debit" else -abs(amt)
            trips_map[trip_id]["total_spent"] += cost

            if cat not in trips_map[trip_id]["categories"]:
                trips_map[trip_id]["categories"][cat] = 0.0
            trips_map[trip_id]["categories"][cat] += cost

    result = []
    for trip_id, t in trips_map.items():
        t["total_spent"] = round(t["total_spent"], 2)
        budget = float(t.get("budget") or 0.0)
        t["budget"] = budget
        t["budget_remaining"] = round(max(0.0, budget - t["total_spent"]), 2) if budget > 0 else 0.0
        t["budget_pct"] = round((t["total_spent"] / budget * 100), 1) if budget > 0 else 0.0
        t["categories"] = {k: round(v, 2) for k, v in t["categories"].items() if v > 0}
        result.append(t)

    result.sort(key=lambda x: x.get("date_start") or x.get("created_at") or "", reverse=True)
    return result

@app.route("/api/holiday-trips", methods=["GET"])
def get_holiday_trips_api():
    ws_id = request.args.get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    ws_profile = ws_ctx["meta"].get("profile") or DEFAULT_WORKSPACE_PROFILE
    all_txs = get_all_statements_transactions(
        pdf_dir=ws_ctx["pdf_dir"], 
        cache_dir=ws_ctx["cache_dir"], 
        profile=ws_profile, 
        ws_dir=ws_ctx["ws_dir"]
    )
    summary = compute_holiday_trips_summary(ws_ctx["ws_dir"], all_txs)
    return jsonify({"status": "ok", "trips": summary})

@app.route("/api/holiday-trips/save", methods=["POST"])
def save_holiday_trip():
    data = request.get_json() or {}
    ws_id = data.get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    trip_data = data.get("trip") if isinstance(data.get("trip"), dict) else data

    name = (trip_data.get("name") or "").strip()
    if not name:
        return jsonify({"status": "error", "error": "Le nom du séjour est requis"}), 400

    trips = load_holiday_trips(ws_ctx["ws_dir"])
    trip_id = (trip_data.get("id") or "").strip()

    if not trip_id:
        slug = re.sub(r"[^a-zA-Z0-9]+", "_", name.lower()).strip("_")
        trip_id = f"trip_{slug}_{int(datetime.now().timestamp())}"
        trip_record = {
            "id": trip_id,
            "name": name,
            "destination": (trip_data.get("destination") or "").strip(),
            "date_start": (trip_data.get("date_start") or "").strip(),
            "date_end": (trip_data.get("date_end") or "").strip(),
            "budget": float(trip_data.get("budget") or 0.0),
            "icon": trip_data.get("icon") or "🏖️",
            "color": trip_data.get("color") or "#0ea5e9",
            "notes": (trip_data.get("notes") or "").strip(),
            "created_at": datetime.now().strftime("%Y-%m-%d")
        }
        trips.append(trip_record)
    else:
        found = False
        trip_record = None
        for i, t in enumerate(trips):
            if t.get("id") == trip_id:
                trips[i].update({
                    "name": name,
                    "destination": (trip_data.get("destination") or "").strip(),
                    "date_start": (trip_data.get("date_start") or "").strip(),
                    "date_end": (trip_data.get("date_end") or "").strip(),
                    "budget": float(trip_data.get("budget") or 0.0),
                    "icon": trip_data.get("icon") or t.get("icon") or "🏖️",
                    "color": trip_data.get("color") or t.get("color") or "#0ea5e9",
                    "notes": (trip_data.get("notes") or "").strip(),
                })
                trip_record = trips[i]
                found = True
                break
        if not found:
            trip_record = {
                "id": trip_id,
                "name": name,
                "destination": (trip_data.get("destination") or "").strip(),
                "date_start": (trip_data.get("date_start") or "").strip(),
                "date_end": (trip_data.get("date_end") or "").strip(),
                "budget": float(trip_data.get("budget") or 0.0),
                "icon": trip_data.get("icon") or "🏖️",
                "color": trip_data.get("color") or "#0ea5e9",
                "notes": (trip_data.get("notes") or "").strip(),
                "created_at": datetime.now().strftime("%Y-%m-%d")
            }
            trips.append(trip_record)

    save_holiday_trips(ws_ctx["ws_dir"], trips)

    # Optional auto-assign by date range
    auto_assign = data.get("auto_assign_dates", trip_data.get("auto_assign_dates", False))
    date_start = trip_record.get("date_start")
    date_end = trip_record.get("date_end")

    if auto_assign and date_start and date_end:
        cache_files = glob.glob(os.path.join(ws_ctx["cache_dir"], "*.json"))
        for cache_f in cache_files:
            try:
                with open(cache_f, "r", encoding="utf-8") as f:
                    c = json.load(f)
                updated = False
                for t in c.get("transactions", []):
                    d_parts = (t.get("date") or "").split("/")
                    if len(d_parts) == 3:
                        y = d_parts[2] if len(d_parts[2]) == 4 else f"20{d_parts[2]}"
                        iso_d = f"{y}-{d_parts[1].zfill(2)}-{d_parts[0].zfill(2)}"
                        if date_start <= iso_d <= date_end:
                            t["holiday_trip_id"] = trip_id
                            t["manual_override"] = True
                            updated = True
                if updated:
                    with open(cache_f, "w", encoding="utf-8") as f:
                        json.dump(c, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"[HolidayTrips] Auto-assign error: {e}")

    return jsonify({"status": "ok", "trip": trip_record})

@app.route("/api/holiday-trips/delete", methods=["POST"])
def delete_holiday_trip():
    data = request.get_json() or {}
    ws_id = data.get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    trip_id = (data.get("trip_id") or data.get("id") or "").strip()

    if not trip_id:
        return jsonify({"status": "error", "error": "ID du séjour manquant"}), 400

    trips = load_holiday_trips(ws_ctx["ws_dir"])
    trips = [t for t in trips if t.get("id") != trip_id]
    save_holiday_trips(ws_ctx["ws_dir"], trips)

    cache_files = glob.glob(os.path.join(ws_ctx["cache_dir"], "*.json"))
    for cache_f in cache_files:
        try:
            with open(cache_f, "r", encoding="utf-8") as f:
                c = json.load(f)
            updated = False
            for t in c.get("transactions", []):
                if t.get("holiday_trip_id") == trip_id:
                    t.pop("holiday_trip_id", None)
                    t["manual_override"] = True
                    updated = True
            if updated:
                with open(cache_f, "w", encoding="utf-8") as f:
                    json.dump(c, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    return jsonify({"status": "ok", "message": "Séjour supprimé"})

@app.route("/api/holiday-trips/assign", methods=["POST"])
def assign_holiday_transactions():
    data = request.get_json() or {}
    ws_id = data.get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    trip_id = (data.get("trip_id") or data.get("id") or "").strip()
    raw_tx_ids = data.get("transaction_ids") if data.get("transaction_ids") is not None else data.get("tx_ids")
    if raw_tx_ids is None:
        return jsonify({"status": "error", "error": "Aucune opération spécifiée"}), 400

    tx_ids = set(raw_tx_ids)

    if not trip_id:
        return jsonify({"status": "error", "error": "ID du séjour manquant"}), 400

    cache_files = glob.glob(os.path.join(ws_ctx["cache_dir"], "*.json"))
    modified_count = 0
    for cache_f in cache_files:
        try:
            with open(cache_f, "r", encoding="utf-8") as f:
                c = json.load(f)
            updated = False
            for t in c.get("transactions", []):
                t_id = t.get("id")
                # If transaction should be in this trip
                if t_id in tx_ids:
                    if t.get("holiday_trip_id") != trip_id:
                        t["holiday_trip_id"] = trip_id
                        t["manual_override"] = True
                        updated = True
                        modified_count += 1
                # If transaction was previously in this trip but was deselected
                elif t.get("holiday_trip_id") == trip_id:
                    t.pop("holiday_trip_id", None)
                    t["manual_override"] = True
                    updated = True
                    modified_count += 1
            if updated:
                with open(cache_f, "w", encoding="utf-8") as f:
                    json.dump(c, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[HolidayTrips] Assign error in {cache_f}: {e}")

    return jsonify({"status": "ok", "modified_count": modified_count})

@app.route("/api/data", methods=["GET"])
def get_dashboard_data():
    """
    Main API endpoint returning all data for the Monarch-style dashboard:
    Supports filtering by month (?month=2026-06 or ?month=ALL) and workspace (?workspace=default).
    """
    ws_id = request.args.get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    ws_profile = ws_ctx["meta"].get("profile") or DEFAULT_WORKSPACE_PROFILE
    selected_month = request.args.get("month", "ALL")

    all_transactions = get_all_statements_transactions(
        pdf_dir=ws_ctx["pdf_dir"], 
        cache_dir=ws_ctx["cache_dir"], 
        profile=ws_profile, 
        ws_dir=ws_ctx["ws_dir"]
    )
    save_master_csv(all_transactions, csv_path=ws_ctx["csv_path"])

    # Compute multi-month trends across ALL transactions in this workspace
    trends = compute_multi_month_trends(all_transactions, profile=ws_profile)
    recurring = detect_recurring_subscriptions(all_transactions)
    budget_baseline = compute_budget_baseline(all_transactions, months_count=4, profile=ws_profile)

    # Filter transactions if a specific month is requested
    if selected_month != "ALL":
        filtered_txs = [t for t in all_transactions if get_month_key(t.get("date", "")) == selected_month]
    else:
        filtered_txs = all_transactions

    # Category totals for filtered transactions (including offsetting credits for investments & reimbursements)
    cat_totals = {}
    for tx in filtered_txs:
        c = tx.get("category", "Autre")
        amt = tx.get("amount", 0.0)
        tx_type = tx.get("type", "Debit")
        
        # Pure external income categories are excluded from spending categories
        if c in ["Salaires & Revenus", "Cadeaux & Dons"]:
            continue

        if c not in cat_totals:
            cat_totals[c] = {
                "total": 0.0,
                "count": 0,
                "color": tx.get("color", "#94a3b8"),
                "icon": tx.get("icon", "📦")
            }
        if tx_type == "Debit":
            cat_totals[c]["total"] += abs(amt)
            cat_totals[c]["count"] += 1
        elif tx_type == "Credit":
            # Credit reduces category spending (e.g. withdrawal from Livret A, rent reimbursement)
            cat_totals[c]["total"] -= abs(amt)
            cat_totals[c]["count"] += 1

    for c in cat_totals:
        cat_totals[c]["total"] = round(cat_totals[c]["total"], 2)

    # Sort categories by spending (highest net spending first)
    sorted_cat_totals = {k: v for k, v in sorted(cat_totals.items(), key=lambda x: x[1]["total"], reverse=True)}

    # Dynamic profile keywords
    salary_keywords = [k.upper().strip() for k in ws_profile.get("salary_keywords", []) if k.strip()]
    family_keywords = [k.upper().strip() for k in ws_profile.get("family_keywords", []) if k.strip()]
    rent_keywords = [k.upper().strip() for k in ws_profile.get("rent_keywords", []) if k.strip()]
    account_holders = [k.upper().strip() for k in ws_profile.get("account_holder_keywords", []) if k.strip()]
    investment_accounts = ws_profile.get("investment_accounts", [
        {"id": "livret_a", "name": "Livret A", "keywords": ["LIVRET", "RETRAIT LIVRET"]},
        {"id": "cto", "name": "CTO / Bourse", "keywords": ["INTERACTIVE", "IBKR", "CTO"]}
    ])

    # KPIs for the selected view
    debits = [t for t in filtered_txs if t.get("type") == "Debit"]
    credits = [t for t in filtered_txs if t.get("type") == "Credit"]
    
    # Dynamic classification of credits based on workspace profile
    salary_credits = []
    gifts_credits = []
    rent_credits = []
    invest_credits = []
    other_reimb_credits = []

    for t in credits:
        c = t.get("category", "")
        desc_u = (t.get("description") or "").upper()
        merch_u = (t.get("merchant") or "").upper()
        
        is_inv_w = (
            c == "Investissements & Épargne"
            or "RETRAIT LIVRET" in merch_u
            or "RETRAIT" in merch_u
            or (account_holders and any(k in desc_u for k in account_holders))
            or "LIVRET" in desc_u
        )
        if is_inv_w:
            invest_credits.append(t)
        elif (
            c == "Logement & Énergie"
            or (rent_keywords and any(k in desc_u for k in rent_keywords))
            or (rent_keywords and any(k in merch_u for k in rent_keywords))
        ):
            rent_credits.append(t)
        elif (
            c == "Salaires & Revenus"
            or (salary_keywords and any(k in desc_u for k in salary_keywords))
        ):
            salary_credits.append(t)
        elif (
            c == "Cadeaux & Dons"
            or (family_keywords and any(k in desc_u for k in family_keywords))
        ):
            gifts_credits.append(t)
        else:
            other_reimb_credits.append(t)

    tot_salary = sum(t.get("amount", 0.0) for t in salary_credits)
    tot_gifts = sum(t.get("amount", 0.0) for t in gifts_credits)
    tot_rent_reimb = sum(t.get("amount", 0.0) for t in rent_credits)
    tot_other_reimb = sum(t.get("amount", 0.0) for t in other_reimb_credits)
    tot_reimb = tot_rent_reimb + tot_other_reimb
    tot_deb = sum(t.get("amount", 0.0) for t in debits)

    # Separate living expenses from wealth accumulation
    living_debits = [t for t in debits if t.get("category") != "Investissements & Épargne"]
    invest_debits = [t for t in debits if t.get("category") == "Investissements & Épargne"]
    tot_living_deb_raw = sum(t.get("amount", 0.0) for t in living_debits)

    # Rent reimbursements: user explicitly instructed that rent reimbursed must cancel out and not count as an expense
    tot_living_deb = min(0.0, tot_living_deb_raw + tot_rent_reimb)

    # Dynamic calculation of investment accounts breakdown
    inv_by_account = {}
    for inv in investment_accounts:
        acc_id = inv.get("id") or inv.get("name", "inv").lower()
        inv_by_account[acc_id] = {
            "id": acc_id,
            "name": inv.get("name", acc_id),
            "color": inv.get("color", "#7C3AED"),
            "type": inv.get("type", "brokerage"),
            "deposits": 0.0,
            "withdrawals": 0.0,
            "net": 0.0
        }

    for t in invest_debits:
        desc_u = (t.get("description") or "").upper()
        merch_u = (t.get("merchant") or "").upper()
        amt = abs(t.get("amount", 0.0))
        matched_id = None
        for inv in investment_accounts:
            keys = [k.upper() for k in inv.get("keywords", []) if k]
            inv_name = (inv.get("name") or "").upper()
            if any(k in desc_u for k in keys) or any(k in merch_u for k in keys) or (inv_name and inv_name in merch_u):
                matched_id = inv.get("id") or inv.get("name", "inv").lower()
                break
        if not matched_id and investment_accounts:
            matched_id = investment_accounts[0].get("id") or investment_accounts[0].get("name", "inv").lower()
        if matched_id and matched_id in inv_by_account:
            inv_by_account[matched_id]["deposits"] += amt
            inv_by_account[matched_id]["net"] += amt

    for t in invest_credits:
        desc_u = (t.get("description") or "").upper()
        merch_u = (t.get("merchant") or "").upper()
        amt = abs(t.get("amount", 0.0))
        matched_id = None
        for inv in investment_accounts:
            keys = [k.upper() for k in inv.get("keywords", []) if k]
            inv_name = (inv.get("name") or "").upper()
            if any(k in desc_u for k in keys) or any(k in merch_u for k in keys) or (inv_name and inv_name in merch_u):
                matched_id = inv.get("id") or inv.get("name", "inv").lower()
                break
        if not matched_id and investment_accounts:
            matched_id = investment_accounts[0].get("id") or investment_accounts[0].get("name", "inv").lower()
        if matched_id and matched_id in inv_by_account:
            inv_by_account[matched_id]["withdrawals"] += amt
            inv_by_account[matched_id]["net"] -= amt

    # Compatibility aliases
    livret_a_acc = inv_by_account.get("livret_a", {})
    non_livret_accs = [v for k, v in inv_by_account.items() if k != "livret_a"]
    second_acc = non_livret_accs[0] if non_livret_accs else inv_by_account.get("cto", {})
    livret_a_deposits = livret_a_acc.get("deposits", 0.0)
    livret_a_withdrawals = livret_a_acc.get("withdrawals", 0.0)
    invest_livret_a = livret_a_acc.get("net", 0.0)
    invest_cto = second_acc.get("net", 0.0)
    tot_invest = sum(acc["net"] for acc in inv_by_account.values()) if inv_by_account else (invest_livret_a + invest_cto)

    # Net real savings on salary income = salary income + living_debits (living_debits is negative)
    tot_living_deb_net = min(0.0, tot_living_deb + tot_other_reimb)
    net_real = tot_salary + tot_living_deb
    net_real_with_reimb = tot_salary + tot_living_deb_net
    savings_rate_real = round(((net_real / tot_salary) * 100), 1) if tot_salary > 0 else 0.0
    savings_rate_net = round(((net_real_with_reimb / tot_salary) * 100), 1) if tot_salary > 0 else 0.0

    max_exp_tx = min(living_debits if living_debits else debits, key=lambda t: t.get("amount", 0.0), default=None)
    max_expense = abs(max_exp_tx.get("amount", 0.0)) if max_exp_tx else 0.0
    max_exp_desc = max_exp_tx.get("merchant") or max_exp_tx.get("description") if max_exp_tx else "Aucune"

    # Major expenditures: One-off living debits with amount >= 300 EUR or category High-Tech & Équipement (excluding pure investments)
    major_expenditures = [
        t for t in filtered_txs 
        if t.get("type") == "Debit" 
        and t.get("category") != "Investissements & Épargne" 
        and (abs(t.get("amount", 0.0)) >= 300.0 or t.get("category") == "High-Tech & Équipement")
    ]
    major_expenditures.sort(key=lambda x: abs(x.get("amount", 0.0)), reverse=True)
    tot_major_exp = sum(abs(t.get("amount", 0.0)) for t in major_expenditures)

    insights = analyze_budget_insights(filtered_txs)

    # Detailed statements info for this workspace
    detailed_statements, total_bytes = get_statements_detailed_info(pdf_dir=ws_ctx["pdf_dir"], cache_dir=ws_ctx["cache_dir"])
    
    # Compute date range label
    all_months = trends.get("months", [])
    if len(all_months) == 1:
        date_range_label = get_month_label(all_months[0])
    elif len(all_months) > 1:
        date_range_label = f"{get_month_label(all_months[0])} - {get_month_label(all_months[-1])}"
    else:
        date_range_label = "Période active"

    num_active_months = len(all_months) if selected_month == "ALL" else 1
    num_active_months = max(1, num_active_months)
    monthly_avg_savings = round(net_real / num_active_months, 2)
    raw_pot_savings = insights.get("potential_savings", 125.0)
    monthly_pot_savings = round(raw_pot_savings / num_active_months, 2)

    time_machine_patterns = generate_financial_time_machine_patterns(all_transactions, trends, insights)
    holiday_trips_summary = compute_holiday_trips_summary(ws_ctx["ws_dir"], all_transactions)

    return jsonify({
        "status": "ok",
        "workspace": ws_ctx["meta"],
        "workspaces": list_workspaces(),
        "budget_baseline": budget_baseline,
        "holiday_trips": holiday_trips_summary,
        "selected_month": selected_month,
        "selected_month_label": get_month_label(selected_month) if selected_month != "ALL" else "Tous les mois",
        "date_range_label": date_range_label,
        "transactions": filtered_txs,
        "summary": {
            "total_debits": tot_deb,
            "total_credits": tot_salary,
            "total_salary": tot_salary,
            "total_gifts": tot_gifts,
            "total_reimbursements": tot_reimb,
            "total_rent_reimbursements": tot_rent_reimb,
            "total_living_debits": tot_living_deb,
            "total_living_debits_raw": tot_living_deb_raw,
            "total_living_debits_gross": tot_living_deb,
            "total_living_debits_net": tot_living_deb_net,
            "total_investments": tot_invest,
            "investments_livret_a": invest_livret_a,
            "investments_livret_a_deposits": livret_a_deposits,
            "investments_livret_a_withdrawals": livret_a_withdrawals,
            "investments_cto": invest_cto,
            "investments_by_account": inv_by_account,
            "investment_accounts": investment_accounts,
            "total_major_expenditures": tot_major_exp,
            "count_major_expenditures": len(major_expenditures),
            "net": net_real,
            "net_real": net_real,
            "net_real_with_reimb": net_real_with_reimb,
            "monthly_avg_savings": monthly_avg_savings,
            "savings_rate": savings_rate_real,
            "savings_rate_net": savings_rate_net,
            "savings_rate_gross": round(((tot_salary + tot_deb) / tot_salary * 100), 1) if tot_salary > 0 else 0.0,
            "count_debits": len(debits),
            "count_credits": len(credits),
            "total_count": len(filtered_txs),
            "max_expense": max_expense,
            "max_expense_desc": max_exp_desc,
            "potential_savings": monthly_pot_savings,
            "potential_savings_monthly": monthly_pot_savings,
            "potential_savings_total": raw_pot_savings
        },
        "major_expenditures": major_expenditures,
        "category_totals": sorted_cat_totals,
        "trends": trends,
        "recurring": recurring,
        "insights": insights,
        "patterns": time_machine_patterns,
        "statements": [s["filename"] for s in detailed_statements],
        "statements_detailed": detailed_statements,
        "statements_meta": {
            "total_files": len(detailed_statements),
            "processed": len(detailed_statements),
            "processing": 0,
            "total_size_kb": round(total_bytes / 1024, 2),
            "total_size_formatted": f"{round(total_bytes / 1024, 1)} KB"
        },
        "categories": CATEGORIES,
        "category_colors": CATEGORY_COLORS,
        "category_icons": CATEGORY_ICONS,
        "user_rules": load_user_rules(workspace_dir=ws_ctx["ws_dir"]),
        "ollama_available": check_ollama_available()
    })

# Maintain backward compatibility with old route
@app.route("/api/transactions", methods=["GET"])
def get_transactions_legacy():
    return get_dashboard_data()

@app.route("/api/upload", methods=["POST"])
def upload_multiple():
    """Handles uploading single or multiple statement PDFs to active workspace."""
    ws_id = request.form.get("workspace") or request.args.get("workspace")
    ws_ctx = get_workspace_context(ws_id)

    files = request.files.getlist("pdf")
    if not files or len(files) == 0:
        return jsonify({"status": "error", "error": "Aucun fichier reçu"}), 400

    saved_count = 0
    for file in files:
        if file and file.filename.lower().endswith(".pdf"):
            filename = secure_filename(file.filename)
            filepath = os.path.join(ws_ctx["pdf_dir"], filename)
            file.save(filepath)
            parse_and_cache_pdf(filepath, cache_dir=ws_ctx["cache_dir"], profile=ws_ctx["meta"].get("profile"), ws_dir=ws_ctx["ws_dir"], force=True)
            saved_count += 1

    all_txs = get_all_statements_transactions(pdf_dir=ws_ctx["pdf_dir"], cache_dir=ws_ctx["cache_dir"], profile=ws_ctx["meta"].get("profile"), ws_dir=ws_ctx["ws_dir"], force_reparse=False)
    save_master_csv(all_txs, csv_path=ws_ctx["csv_path"])

    return jsonify({
        "status": "ok",
        "saved_count": saved_count,
        "total_transactions": len(all_txs),
        "workspace": ws_ctx["meta"]
    })

@app.route("/api/delete-statement", methods=["POST"])
def delete_statement():
    data = request.get_json() or {}
    filename = data.get("filename", "").strip()
    ws_id = data.get("workspace")
    ws_ctx = get_workspace_context(ws_id)

    if not filename:
        return jsonify({"status": "error", "error": "Nom de fichier manquant"}), 400

    target_name = os.path.basename(filename)
    norm_target = unicodedata.normalize('NFC', target_name)

    # 1. Remove PDF from workspace
    for p in glob.glob(os.path.join(ws_ctx["pdf_dir"], "*.pdf")):
        base = os.path.basename(p)
        if base == target_name or unicodedata.normalize('NFC', base) == norm_target:
            try:
                os.remove(p)
                print(f"[App] Deleted PDF from workspace {ws_ctx['id']}: {base}")
            except Exception as e:
                print(f"[App] Error removing PDF {p}: {e}")

    # 2. Remove JSON cache from workspace cache
    for j in glob.glob(os.path.join(ws_ctx["cache_dir"], "*.json")):
        base = os.path.basename(j)
        stem = base[:-5] if base.endswith(".json") else base
        if stem == target_name or unicodedata.normalize('NFC', stem) == norm_target or base == target_name:
            try:
                os.remove(j)
                print(f"[App] Deleted statement cache: {base}")
            except Exception as e:
                print(f"[App] Error removing cache {j}: {e}")

    # Re-aggregate remaining transactions
    all_txs = get_all_statements_transactions(pdf_dir=ws_ctx["pdf_dir"], cache_dir=ws_ctx["cache_dir"], profile=ws_ctx["meta"].get("profile"), ws_dir=ws_ctx["ws_dir"], force_reparse=False)
    save_master_csv(all_txs, csv_path=ws_ctx["csv_path"])
    return jsonify({
        "status": "ok",
        "remaining_statements": [os.path.basename(p) for p in glob.glob(os.path.join(ws_ctx["pdf_dir"], "*.pdf"))],
        "remaining_transactions": len(all_txs)
    })

@app.route("/api/reprocess-statement", methods=["POST"])
def reprocess_statement():
    data = request.get_json() or {}
    filename = data.get("filename", "").strip()
    ws_id = data.get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    ws_profile = ws_ctx["meta"].get("profile") or DEFAULT_WORKSPACE_PROFILE

    if not filename:
        return jsonify({"status": "error", "error": "Nom de fichier manquant"}), 400
    filepath = os.path.join(ws_ctx["pdf_dir"], os.path.basename(filename))
    if os.path.exists(filepath):
        parse_and_cache_pdf(filepath, cache_dir=ws_ctx["cache_dir"], profile=ws_profile, ws_dir=ws_ctx["ws_dir"], force=True)
        all_txs = get_all_statements_transactions(pdf_dir=ws_ctx["pdf_dir"], cache_dir=ws_ctx["cache_dir"], profile=ws_profile, ws_dir=ws_ctx["ws_dir"], force_reparse=False)
        save_master_csv(all_txs, csv_path=ws_ctx["csv_path"])
        return jsonify({"status": "ok", "message": f"{filename} retraité avec succès", "total_transactions": len(all_txs)})
    return jsonify({"status": "error", "error": "Fichier introuvable"}), 404

@app.route("/api/update-category", methods=["POST"])
def update_category():
    data = request.get_json() or {}
    tx_id = data.get("id")
    new_cat = data.get("category")
    remember_rule = data.get("remember_rule", False)
    custom_pattern = (data.get("pattern") or "").strip()
    ws_id = data.get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    ws_profile = ws_ctx["meta"].get("profile") or DEFAULT_WORKSPACE_PROFILE

    if not tx_id or not new_cat or new_cat not in CATEGORIES:
        return jsonify({"status": "error", "message": "Catégorie ou ID invalide"}), 400

    # Search in workspace cache files first
    target_statement = None
    matched_desc = ""
    cache_files = glob.glob(os.path.join(ws_ctx["cache_dir"], "*.json"))
    found = False

    for cache_f in cache_files:
        try:
            with open(cache_f, "r", encoding="utf-8") as f:
                c = json.load(f)
            for t in c.get("transactions", []):
                if t.get("id") == tx_id:
                    t["category"] = new_cat
                    t["color"] = CATEGORY_COLORS.get(new_cat, "#94a3b8")
                    t["icon"] = CATEGORY_ICONS.get(new_cat, "📦")
                    t["manual_override"] = True
                    if data.get("merchant"):
                        t["merchant"] = data.get("merchant").strip()
                    if "holiday_trip_id" in data:
                        h_id = (data.get("holiday_trip_id") or "").strip()
                        if h_id:
                            t["holiday_trip_id"] = h_id
                        else:
                            t.pop("holiday_trip_id", None)
                    target_statement = cache_f
                    matched_desc = t.get("description", "")
                    found = True
                    break
            if found:
                with open(cache_f, "w", encoding="utf-8") as f:
                    json.dump(c, f, ensure_ascii=False, indent=2)
                break
        except Exception:
            pass

    # If not found in active workspace cache, search across all workspaces
    if not found:
        all_cache_files = glob.glob(os.path.join(WORKSPACES_ROOT, "*", "cache", "*.json"))
        for cache_f in all_cache_files:
            if cache_f in cache_files:
                continue
            try:
                with open(cache_f, "r", encoding="utf-8") as f:
                    c = json.load(f)
                for t in c.get("transactions", []):
                    if t.get("id") == tx_id:
                        t["category"] = new_cat
                        t["color"] = CATEGORY_COLORS.get(new_cat, "#94a3b8")
                        t["icon"] = CATEGORY_ICONS.get(new_cat, "📦")
                        t["manual_override"] = True
                        if data.get("merchant"):
                            t["merchant"] = data.get("merchant").strip()
                        if "holiday_trip_id" in data:
                            h_id = (data.get("holiday_trip_id") or "").strip()
                            if h_id:
                                t["holiday_trip_id"] = h_id
                            else:
                                t.pop("holiday_trip_id", None)
                        target_statement = cache_f
                        matched_desc = t.get("description", "")
                        found = True
                        break
                if found:
                    with open(cache_f, "w", encoding="utf-8") as f:
                        json.dump(c, f, ensure_ascii=False, indent=2)
                    ws_dir_candidate = os.path.dirname(os.path.dirname(cache_f))
                    if os.path.exists(ws_dir_candidate):
                        ws_ctx["ws_dir"] = ws_dir_candidate
                        ws_ctx["cache_dir"] = os.path.dirname(cache_f)
                    break
            except Exception:
                pass

    if remember_rule:
        kw = custom_pattern
        if not kw and matched_desc:
            clean = re.sub(r"^(?:CARTE\s+X\d+\s+\d\d/\d\d\s+|PAIEMENT\s+CB\s+\d\d/\d\d\s+|VIR\s+EUROPEEN\s+EMIS\s+LOGITEL\s+POUR:\s+|VIREMENT\s+SEPA\s+EMIS\s+|PRELEVEMENT\s+SEPA\s+|COTISATION\s+)", "", matched_desc, flags=re.I).strip()
            kw = clean.split()[0] if clean else ""
        if kw and kw.upper() != "DIVERS":
            save_user_rule(kw, new_cat, data.get("merchant") or kw, workspace_dir=ws_ctx["ws_dir"])
            if ws_ctx["id"] == "default":
                save_user_rule(kw, new_cat, data.get("merchant") or kw, workspace_dir=app.config["UPLOAD_FOLDER"])
            for cache_f in glob.glob(os.path.join(ws_ctx["cache_dir"], "*.json")):
                try:
                    with open(cache_f, "r", encoding="utf-8") as f:
                        c = json.load(f)
                    c["transactions"] = classify_transactions(c.get("transactions", []), profile=ws_profile, workspace_dir=ws_ctx["ws_dir"], use_ollama=False)
                    with open(cache_f, "w", encoding="utf-8") as f:
                        json.dump(c, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass

    return jsonify({"status": "ok"})

@app.route("/api/bulk-update-category", methods=["POST"])
def bulk_update_category():
    data = request.get_json() or {}
    tx_ids = data.get("ids", [])
    new_cat = data.get("category")
    ws_id = data.get("workspace")
    ws_ctx = get_workspace_context(ws_id)

    if not tx_ids or not new_cat or new_cat not in CATEGORIES:
        return jsonify({"status": "error", "message": "Catégorie ou identifiants invalides"}), 400

    id_set = set(tx_ids)
    cache_files = glob.glob(os.path.join(ws_ctx["cache_dir"], "*.json"))
    updated_count = 0

    for cache_f in cache_files:
        try:
            with open(cache_f, "r", encoding="utf-8") as f:
                c = json.load(f)
            modified = False
            for t in c.get("transactions", []):
                if t.get("id") in id_set:
                    t["category"] = new_cat
                    t["color"] = CATEGORY_COLORS.get(new_cat, "#94a3b8")
                    t["icon"] = CATEGORY_ICONS.get(new_cat, "📦")
                    t["manual_override"] = True
                    if t.get("merchant") in ["Divers", "Restauration & Sorties", "Autre", None]:
                        extracted = extract_merchant_from_desc(t.get("description", ""))
                        if extracted and extracted != "Divers":
                            t["merchant"] = extracted
                    updated_count += 1
                    modified = True
            if modified:
                with open(cache_f, "w", encoding="utf-8") as f:
                    json.dump(c, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[Bulk Update] Error updating {cache_f}: {e}")

    # Fallback across all workspaces if some IDs not found
    if updated_count < len(id_set):
        all_cache_files = glob.glob(os.path.join(WORKSPACES_ROOT, "*", "cache", "*.json"))
        for cache_f in all_cache_files:
            if cache_f in cache_files:
                continue
            try:
                with open(cache_f, "r", encoding="utf-8") as f:
                    c = json.load(f)
                modified = False
                for t in c.get("transactions", []):
                    if t.get("id") in id_set:
                        t["category"] = new_cat
                        t["color"] = CATEGORY_COLORS.get(new_cat, "#94a3b8")
                        t["icon"] = CATEGORY_ICONS.get(new_cat, "📦")
                        t["manual_override"] = True
                        if t.get("merchant") in ["Divers", "Restauration & Sorties", "Autre", None]:
                            extracted = extract_merchant_from_desc(t.get("description", ""))
                            if extracted and extracted != "Divers":
                                t["merchant"] = extracted
                        updated_count += 1
                        modified = True
                if modified:
                    with open(cache_f, "w", encoding="utf-8") as f:
                        json.dump(c, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

    return jsonify({"status": "ok", "updated_count": updated_count})


@app.route("/api/custom-rules", methods=["GET", "POST"])
def handle_custom_rules():
    ws_id = request.args.get("workspace") or (request.get_json() or {}).get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    ws_profile = ws_ctx["meta"].get("profile") or DEFAULT_WORKSPACE_PROFILE

    if request.method == "GET":
        return jsonify({"status": "ok", "rules": load_user_rules(workspace_dir=ws_ctx["ws_dir"])})

    data = request.get_json() or {}
    pattern = data.get("pattern", "").strip()
    category = data.get("category", "").strip()
    merchant = data.get("merchant", "").strip()

    if not pattern or not category or category not in CATEGORIES:
        return jsonify({"status": "error", "error": "Pattern ou catégorie invalide"}), 400

    save_user_rule(pattern, category, merchant, workspace_dir=ws_ctx["ws_dir"])
    if ws_ctx["id"] == "default":
        save_user_rule(pattern, category, merchant, workspace_dir=app.config["UPLOAD_FOLDER"])

    # Re-apply rules across workspace caches
    cache_files = glob.glob(os.path.join(ws_ctx["cache_dir"], "*.json"))
    for cache_f in cache_files:
        try:
            with open(cache_f, "r", encoding="utf-8") as f:
                c = json.load(f)
            classified = classify_transactions(c.get("transactions", []), profile=ws_profile, workspace_dir=ws_ctx["ws_dir"], use_ollama=False)
            c["transactions"] = classified
            with open(cache_f, "w", encoding="utf-8") as f:
                json.dump(c, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    return jsonify({"status": "ok", "rules": load_user_rules(workspace_dir=ws_ctx["ws_dir"])})

@app.route("/api/reclassify", methods=["POST"])
def reclassify():
    ws_id = request.args.get("workspace") or (request.get_json() or {}).get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    ws_profile = ws_ctx["meta"].get("profile") or DEFAULT_WORKSPACE_PROFILE
    print(f"[App] Running full reclassification for workspace {ws_ctx['id']}...")
    cache_files = glob.glob(os.path.join(ws_ctx["cache_dir"], "*.json"))
    for cache_f in cache_files:
        try:
            with open(cache_f, "r", encoding="utf-8") as f:
                c = json.load(f)
            classified = classify_transactions(c.get("transactions", []), profile=ws_profile, workspace_dir=ws_ctx["ws_dir"], use_ollama=True, model="qwen2.5:7b")
            c["transactions"] = classified
            with open(cache_f, "w", encoding="utf-8") as f:
                json.dump(c, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    return jsonify({"status": "ok"})

@app.route("/api/export-csv", methods=["GET"])
def export_csv():
    ws_id = request.args.get("workspace")
    ws_ctx = get_workspace_context(ws_id)
    if os.path.exists(ws_ctx["csv_path"]):
        return send_file(ws_ctx["csv_path"], mimetype="text/csv", as_attachment=True, download_name=f"{ws_ctx['id']}_transactions.csv")
    csv_path = os.path.join(app.config["UPLOAD_FOLDER"], "sg_clean_transactions.csv")
    if not os.path.exists(csv_path):
        all_txs = get_all_statements_transactions()
        save_master_csv(all_txs)
    return send_file(csv_path, mimetype="text/csv", as_attachment=True, download_name="sg_clean_transactions.csv")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"\n=======================================================")
    print(f"  Century Finance (Monarch Edition) running locally!")
    print(f"  Open in browser: http://localhost:{port}")
    print(f"=======================================================\n")
    app.run(host="0.0.0.0", port=port, debug=False)
