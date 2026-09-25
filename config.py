"""
Century Finance Configuration & Global Defaults
Centralized configuration for categories, colors, icons, and universal banking heuristics.
"""

CATEGORIES = [
    "Alimentation & Supermarchés",
    "Restaurants & Sorties",
    "Sports & Fitness",
    "Investissements & Épargne",
    "High-Tech & Équipement",
    "Logement & Énergie",
    "Télécom & Abonnements",
    "Transports & Péages",
    "Santé & Pharmacie",
    "Shopping & Soins",
    "Livres",
    "Tabac & Presse",
    "Frais Bancaires",
    "Retraits Espèces (DAB)",
    "Chèques Émis",
    "Salaires & Revenus",
    "Cadeaux & Dons",
    "Remboursements & Avoirs",
    "Autre"
]

CATEGORY_COLORS = {
    "Alimentation & Supermarchés": "#10b981",    # Emerald
    "Restaurants & Sorties": "#f59e0b",          # Amber
    "Sports & Fitness": "#0284c7",               # Ocean Blue
    "Investissements & Épargne": "#8b5cf6",      # Purple / Violet
    "High-Tech & Équipement": "#0ea5e9",         # Sky Blue / Tech Cyan
    "Logement & Énergie": "#6366f1",            # Indigo
    "Télécom & Abonnements": "#a855f7",         # Violet
    "Transports & Péages": "#06b6d4",           # Cyan
    "Santé & Pharmacie": "#ec4899",             # Pink
    "Shopping & Soins": "#d946ef",              # Fuchsia
    "Livres": "#d97706",                        # Amber / Book Leather
    "Tabac & Presse": "#78716c",                # Warm Stone
    "Frais Bancaires": "#ef4444",               # Red
    "Retraits Espèces (DAB)": "#f97316",        # Orange
    "Chèques Émis": "#64748b",                  # Slate
    "Salaires & Revenus": "#22c55e",            # Green
    "Cadeaux & Dons": "#ec4899",                # Rose / Pink
    "Remboursements & Avoirs": "#14b8a6",       # Teal
    "Autre": "#94a3b8"                          # Gray
}

CATEGORY_ICONS = {
    "Alimentation & Supermarchés": "🛒",
    "Restaurants & Sorties": "🍽️",
    "Sports & Fitness": "🏋️",
    "Investissements & Épargne": "📈",
    "High-Tech & Équipement": "💻",
    "Logement & Énergie": "⚡",
    "Télécom & Abonnements": "📱",
    "Transports & Péages": "🚗",
    "Santé & Pharmacie": "💊",
    "Shopping & Soins": "🛍️",
    "Livres": "📚",
    "Tabac & Presse": "📰",
    "Frais Bancaires": "🏦",
    "Retraits Espèces (DAB)": "🏧",
    "Chèques Émis": "📝",
    "Salaires & Revenus": "💰",
    "Cadeaux & Dons": "🎁",
    "Remboursements & Avoirs": "🔄",
    "Autre": "📦"
}

# Standard universal heuristics for French banking statements (independent of individual users)
UNIVERSAL_RULES = [
    # Food delivery & Fast Food & Dining
    (r"UBER\s*\*?\s*EATS|DELIVEROO", "Restaurants & Sorties", "Livraison Repas"),
    (r"MAC\s*DONALD|KENTUCKY\s*FRIED|BURGER\s*KING|SUBWAY|CREP\s+|RESTAURANT|PIZZA|BRASSERIE|BISTROT|CAFE|BAR\b|PUB\b", "Restaurants & Sorties", "Restauration & Sorties"),
    
    # Supermarkets & Groceries
    (r"CARREFOUR|AUCHAN|LECLERC|MONOPRIX|CASINO|LIDL|INTERMARCHE|FRANPRIX|SUPER\s+U|GIE\s+(?:DU\s+)?SECBRON|GRENIER\s+GOURMAND", "Alimentation & Supermarchés", "Supermarché"),
    
    # Telecom & Streaming subscriptions
    (r"ORANGE|FRANCE\s+TELECOM|SFR|BOUYGUES|FREE\s+MOBILE|FREE\s+TELECOM|NETFLIX|SPOTIFY|DEEZER|DISNEY|PRIME\s+VIDEO", "Télécom & Abonnements", "Abonnement & Télécom"),
    (r"IMAGINE\s*R|NAVIGO|RATP|SNCF|TRANSILIEN", "Transports & Péages", "Transports en Commun"),
    (r"APRR|ASF|ESCOTA|SANEF|VINCI\s+AUTOROUTES|AUTOROUTE|TOTAL|ESSO|BP\s+STATION|SHELL", "Transports & Péages", "Carburant & Péages"),
    
    # Energy, utilities & home
    (r"EDF|ENGIE|TOTALENERGIES|VEOLIA|DIRECT\s+ENERGIE|ENEDIS", "Logement & Énergie", "Énergie & Eau"),
    
    # Health & Medical
    (r"DOCTEUR|PHARMA|PHARMACIE|CHIRURGIEN|DENTISTE|LABORATOIRE|OPHTALM|CPAM|AMELI|MUTUELLE", "Santé & Pharmacie", "Santé"),
    
    # Culture & Books
    (r"GIBERT|FNAC\s+LIVRES|LIBRAIRIE|DECITRE|FURET\s+DU\s+NORD", "Livres", "Librairie"),
    
    # Cinema & Culture
    (r"UGC\b|PATHE|GAUMONT|CGR|CINEMA", "Restaurants & Sorties", "Cinéma"),
    
    # Fitness
    (r"BASIC-FIT|FITNESS\s*PARK|KEEP\s*COOL|NEONESS", "Sports & Fitness", "Salle de Sport"),
    
    # Banking fees & common insurances
    (r"COTISATION\s+CARTE|COTISATION\s+JAZZ|SOBRIO|SOGESSUR|ABONNEMENT\s+MENSUEL\s+MESSALIA|FRAIS\s+BANCAIRE|COMMISSION\s+D['\s]INTERVENTION", "Frais Bancaires", "Frais Bancaires"),
    
    # Cash withdrawals
    (r"RETRAIT\s+DAB", "Retraits Espèces (DAB)", "Retrait DAB"),
    
    # Cheques
    (r"CHEQUE\s+(\d+)", "Chèques Émis", "Chèque"),
    
    # Tobacco & News
    (r"TABAC|PRESSE|RELAY", "Tabac & Presse", "Tabac / Presse")
]

# Default profile template for newly initialized workspaces
DEFAULT_WORKSPACE_PROFILE = {
    "account_holder_keywords": [],
    "salary_employer_name": "Employeur Principal",
    "salary_keywords": ["SALAIRE", "REMUNERATION", "PAYE", "VIREMENT NET A PAYER"],
    "family_keywords": [],
    "rent_keywords": ["LOYER", "RENT"],
    "investment_accounts": [
        {
            "id": "livret_a",
            "name": "Livret A",
            "keywords": ["LIVRET A", "LIVRET"],
            "type": "savings",
            "color": "#2C4A6F"
        },
        {
            "id": "cto",
            "name": "CTO (Bourse)",
            "keywords": ["INTERACTIVE BROKERS", "IBKR", "DEGIRO", "TRADE REPUBLIC", "CTO"],
            "type": "brokerage",
            "color": "#7C3AED"
        }
    ]
}
