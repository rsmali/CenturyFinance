"""
Century Finance Configuration & Global Defaults
Centralized configuration for categories, colors, icons, and universal banking heuristics.
"""

CATEGORIES = [
    "Alimentation & Supermarchés",
    "Restaurants & Bars",
    "Sorties",
    "Voyages & Vacances",
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
    "Alimentation & Supermarchés": "#2D5A3C",    # Century Forest / Sage Green
    "Restaurants & Bars": "#C08435",             # Warm Bistrot Amber / Caramel
    "Sorties": "#9E4756",                        # Vintage Wine / Dusty Burgundy Rose
    "Voyages & Vacances": "#366B80",             # Mediterranean Slate / Aegean Teal
    "Sports & Fitness": "#417B66",               # Deep Eucalyptus / Pine
    "Investissements & Épargne": "#2C4A6F",      # Century Royal Navy / Heritage Wealth Blue
    "High-Tech & Équipement": "#52616B",         # Graphite / Industrial Slate
    "Logement & Énergie": "#3D4F5C",            # Architectural Nordic Slate
    "Télécom & Abonnements": "#5C5975",         # Dusk Indigo / Muted Slate Violet
    "Transports & Péages": "#4A6984",           # Slate Blue / Steel
    "Santé & Pharmacie": "#5B7B7A",             # Muted Celadon / Apothecary Sage
    "Shopping & Soins": "#85586F",              # Muted Mauve / Heather Plum
    "Livres": "#8C6D58",                        # Book Leather / Warm Taupe
    "Tabac & Presse": "#78716C",                # Flint Stone / Warm Ash
    "Frais Bancaires": "#964B55",               # Muted Rust / Terracotta Crimson
    "Retraits Espèces (DAB)": "#A87042",        # Warm Bronze
    "Chèques Émis": "#64748B",                  # Neutral Slate
    "Salaires & Revenus": "#234B34",            # Deep Heritage Pine Green
    "Cadeaux & Dons": "#8C5369",                # Dusty Plum Rose
    "Remboursements & Avoirs": "#3A7068",       # Deep Mineral Teal
    "Autre": "#8C8D89"                          # French Gray / Warm Muted Slate
}

CATEGORY_ICONS = {
    "Alimentation & Supermarchés": "🛒",
    "Restaurants & Bars": "🍽️",
    "Sorties": "🎟️",
    "Voyages & Vacances": "🏖️",
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
    # Food delivery, Dining & Bars
    (r"UBER\s*\*?\s*EATS|DELIVEROO", "Restaurants & Bars", "Livraison Repas"),
    (r"MAC\s*DONALD|KENTUCKY\s*FRIED|BURGER\s*KING|SUBWAY|FIVE\s*GUYS|CREP\s+|RESTAURANT|PIZZA|BRASSERIE|BISTROT|POULET|DELICES|BAR\b|PUB\b|BIERE|BEER|COCKTAIL|BOMBARDIER|EVEREST", "Restaurants & Bars", "Restaurant / Bar"),
    
    # Sorties, Cinema, Culture & Events
    (r"UGC\b|PATHE|GAUMONT|CGR|CINEMA|THEATRE|CONCERT|SPECTACLE|MUSEE|EXPOSITION|OPERA|DISCOTHEQUE|NIGHTCLUB|CLUB\b|BOWLING|FESTIVAL", "Sorties", "Sorties & Événements"),
    
    # Bakeries & Delis
    (r"BOULANGERIE|PATISSERIE", "Alimentation & Supermarchés", "Boulangerie"),
    
    # Travel, Hotels & Vacations
    (r"AIRBNB|BOOKING(?:\.COM)?|HOTEL|HOSTEL|VOYAGE|EXPEDIA|EASYJET|RYANAIR|TRANSAVIA|AIR\s*FRANCE|VUELING|TRIPADVISOR|GITES\s+DE\s+FRANCE|CAMPING|AGODA|CLUB\s+MED|HILTON|ACCOR|IBIS|NOVOTEL|MERCURE|MARRIOTT|LUFTHANSA|EUROWINGS|VOLOTEA|SEJOUR|SEJOURS|LOCATION\s+VACANCE", "Voyages & Vacances", "Voyage & Vacances"),
    
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
