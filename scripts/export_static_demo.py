#!/usr/bin/env python3
"""
Century Finance - Static GitHub Pages Demo Exporter
Generates pre-rendered JSON files and standalone index.html in `docs/`
so the repository can be hosted for free on GitHub Pages.
"""

import os
import sys
import json
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app import app

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
DATA_DIR = os.path.join(DOCS_DIR, "data")
TEMPLATE_SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates", "index.html")
INDEX_DEST = os.path.join(DOCS_DIR, "index.html")

def export_demo():
    os.makedirs(DATA_DIR, exist_ok=True)
    client = app.test_client()
    
    print("⏳ Exporting Demo Workspace data for GitHub Pages...")
    
    # 1. Export ALL months
    res = client.get("/api/data?workspace=demo&month=ALL")
    if res.status_code != 200:
        print(f"❌ Failed to fetch demo ALL: {res.status_code}")
        return False
    
    all_data = res.get_json()
    all_path = os.path.join(DATA_DIR, "demo_ALL.json")
    with open(all_path, "w", encoding="utf-8") as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Exported: {all_path} ({len(all_data.get('transactions', []))} transactions)")
    
    # 2. Export individual months from trends
    months = all_data.get("trends", {}).get("months", [])
    for m in months:
        m_res = client.get(f"/api/data?workspace=demo&month={m}")
        if m_res.status_code == 200:
            m_data = m_res.get_json()
            m_path = os.path.join(DATA_DIR, f"demo_{m}.json")
            with open(m_path, "w", encoding="utf-8") as f:
                json.dump(m_data, f, ensure_ascii=False, indent=2)
            print(f"  ✓ Exported: {m_path} ({len(m_data.get('transactions', []))} transactions)")

    # 3. Export workspace profile & meta
    ws_res = client.get("/api/workspaces?workspace=demo")
    if ws_res.status_code == 200:
        ws_path = os.path.join(DATA_DIR, "workspaces.json")
        with open(ws_path, "w", encoding="utf-8") as f:
            json.dump(ws_res.get_json(), f, ensure_ascii=False, indent=2)
        print(f"  ✓ Exported: {ws_path}")

    # 4. Generate docs/index.html with GitHub Pages compatibility
    with app.test_request_context("/"):
        from flask import render_template
        rendered_html = render_template("index.html")
    with open(INDEX_DEST, "w", encoding="utf-8") as f:
        f.write(rendered_html)
    print(f"  ✓ Generated: {INDEX_DEST}")
    
    print("\n🎉 GitHub Pages Demo Export complete!")
    print(f"👉 To test locally without Python, run: python3 -m http.server 8000 --directory docs")
    print(f"👉 On GitHub: Enable GitHub Pages in Settings > Pages > Source: main branch, /docs folder.")
    return True

if __name__ == "__main__":
    export_demo()
