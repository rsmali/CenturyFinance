# Century Finance — Developer & Agent Reference (AGENTS.md)

Century Finance is a 100% local, privacy-first personal wealth management web dashboard inspired by *Monarch Money* and Mid-Century Modern design. It extracts, normalizes, classifies, and visualizes bank statements (PDFs) without sending any financial data to the cloud.

---

## 🏗️ Architecture & Tech Stack

- **Backend**: Python 3.10+, Flask (`app.py`), PyMuPDF / `fitz` (`extractor.py`), Pandas (`analytics.py`).
- **Frontend**: Lightweight SPA using Tailwind CSS CDN, Chart.js CDN, Plus Jakarta Sans & Newsreader fonts.
- **Templating**: Modular Jinja2 partials (`templates/views/`, `templates/partials/`, `templates/modals/`).
- **AI & Classification**: Hybrid 3-tier engine (`classifier.py`):
  1. User Custom Rules (`user_rules.json`) — strictly prioritized for both Debits and Credits.
  2. Workspace Profile Keywords & Universal Heuristics (`config.py`).
  3. Local Ollama LLM (`qwen2.5:7b` on `http://localhost:11434`) — optional fallback for ambiguous labels.
- **Persistence**: 100% file-based on disk (NO SQL database).
  - Transactions cached in `workspaces/<workspace_id>/cache/*.json`.
  - User keyword rules in `workspaces/<workspace_id>/user_rules.json`.
  - Account configuration profiles in `workspaces/<workspace_id>/meta.json`.
  - Master exports in `workspaces/<workspace_id>/transactions.csv`.

---

## 📁 Repository Directory Structure

```text
century-finance/
├── app.py                     # Flask web app, REST API routes, workspace manager
├── main.py                    # Standalone CLI pipeline runner
├── classifier.py              # Hybrid transaction classifier & rule engine
├── extractor.py               # PyMuPDF parser for French bank statements (Société Générale)
├── analytics.py               # Multi-month trends, recurring charges, 50/30/20 budget baseline
├── config.py                  # 14 categories, palette, icons, universal heuristics, default profile
├── user_rules.json            # Fallback global user rules (synced with default workspace)
│
├── templates/                 # Jinja2 template structure
│   ├── index.html             # Master layout shell (~57 lines)
│   ├── partials/
│   │   ├── head.html          # Fonts, Tailwind CDN, custom styles
│   │   ├── sidebar.html       # Sidebar navigation & workspace selector
│   │   ├── scripts.html       # Master script loader (Jinja include manifest)
│   │   └── scripts/           # Modular client-side JavaScript controllers
│   │       ├── core.js        # Global AppState, formatting, router, data fetcher
│   │       ├── workspaces.js  # Workspace switching, profile settings, account modals
│   │       ├── overview.js    # Financial overview KPIs, spline charts, audit modal
│   │       ├── timemachine.js # Time machine & pattern discovery charts
│   │       ├── files.js       # Statement manager, reprocessing, PDF upload
│   │       ├── transactions.js# Transactions table, filter logic, bulk reclassify
│   │       ├── categories.js  # Category sparklines, zoom chart, merchant breakdown donut
│   │       ├── budget.js      # Budget simulator, 50/30/20 baseline, scenario testing
│   │       ├── rules.js       # Custom regex rules manager & Ollama AI trigger
│   │       └── holidays.js    # Séjours & Vacances trips, budgeting, assignment modal
│   ├── views/                 # Modular window views (toggled via switchView())
│   │   ├── overview.html      # View 1: Overview KPIs, wealth accumulation, major debits
│   │   ├── budget.html        # View 8: Budget & scenario simulator (50/30/20)
│   │   ├── timemachine.html   # View 2: Financial Time Machine & pattern discovery
│   │   ├── files.html         # View 3: Statement file manager & reprocess actions
│   │   ├── upload.html        # View 4: Drag & drop PDF upload zone
│   │   ├── transactions.html  # View 5: Transaction review table with search & filters
│   │   ├── categories.html    # View 6: Category sparklines & anomaly drill-downs
│   │   └── rules.html         # View 7: User rules manager & Ollama batch trigger
│   └── modals/
│       ├── workspace_create.html    # Modal: Create new workspace account
│       ├── workspace_profile.html   # Modal: Account profile (salary, rent, family, investments)
│       ├── category_edit.html       # Modal: Transaction category reassignment
│       └── audit_modal.html         # Modal: Formula calculation breakdown
│
├── workspaces/                # Multi-account data isolation (gitignored except demo)
│   ├── default/               # Main primary account (statements/, cache/, meta.json, etc.)
│   └── demo/                  # Pre-seeded 6-month synthetic dataset for testing
│
├── docs/                      # Static demo hosted on GitHub Pages (pre-rendered JSON + HTML)
└── scripts/
    └── export_static_demo.py  # Exports static JSON datasets and compiles docs/index.html
```

---

## ⚡ Key Workflows & Common Commands

```bash
# Activate virtual environment
source .venv/bin/activate

# Start local server (runs on http://localhost:5001)
python app.py

# CLI extraction to CSV
python main.py --pdf <path_to_statement.pdf> --output clean.csv

# Re-generate static GitHub Pages demo (in docs/)
python scripts/export_static_demo.py
```

---

## 🧠 Critical Guidelines for AI Agents & Developers

1. **Always Pass `workspace` in API Calls**:
   - Frontend JS (`templates/partials/scripts.html`): Any `fetch('/api/...')` that reads or mutates data MUST include `workspace: AppState.activeWorkspace || 'default'`.
   - Backend (`app.py`): Routes must call `get_workspace_context(ws_id)` to resolve `pdf_dir`, `cache_dir`, `ws_dir`, and `meta`.

2. **Strict Rule Precedence in Classifier (`classifier.py`)**:
   - `user_rules` (`user_rules.json`) MUST be evaluated FIRST in `rule_classify()` for BOTH Debits and Credits.
   - User manual rules always override profile keywords or general banking heuristics.

3. **Preserve Manual Overrides (`manual_override: true`)**:
   - Transactions edited individually get `manual_override: true`.
   - When statements are re-parsed (`parse_and_cache_pdf(..., force=True)`), existing manual overrides in the old JSON cache must be preserved.

4. **Modular Template Maintenance**:
   - Edit the specific window view in `templates/views/<name>.html` or modal in `templates/modals/<name>.html`.
   - After updating HTML templates or static demo data, run `python scripts/export_static_demo.py` to keep `docs/index.html` updated.

5. **French Financial Formatting**:
   - Number format: `1.468,48 €` (dot for thousands, comma for decimals).
   - Use `formatFR(amount)` in JavaScript and `format_fr(amount)` in Python.
