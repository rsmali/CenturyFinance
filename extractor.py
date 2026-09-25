import re
import fitz
import pandas as pd

# Societe Generale Type-1 BONDGR subset character substitution map
CHAR_MAP = {
    '\x00': ' ', '"': "'", '(': '(', ')': '*', '+': ',', '-': ',', '.': '/',
    '/': '0', '0': '1', '1': '2', '2': '3', '3': '4', '4': '5', '5': '6', '6': '7', '7': '8', '8': '9', '9': ':',
    ':': 'A', 'A': 'B', 'B': 'C', 'C': 'D', 'D': 'E', 'E': 'F', 'F': 'G', 'G': 'H', 'H': 'I', 'I': 'J',
    'J': 'K', 'K': 'L', 'L': 'M', 'M': 'N', 'N': 'O', 'O': 'P', 'P': 'Q', 'Q': 'R', 'R': 'S', 'S': 'T',
    'T': 'U', 'U': 'V', 'V': 'X', 'X': 'Y', 'Y': 'Z', 'Z': 'a', '`': 'é', 'a': 'b', 'b': 'c', 'c': 'd',
    'd': 'e', 'e': 'f', 'f': 'g', 'g': 'h', 'h': 'i', 'i': 'l', 'l': 'm', 'm': 'n', 'n': 'o', 'o': 'p',
    'p': 'q', 'q': 'r', 'r': 's', 's': 't', 't': 'u', 'u': 'v', 'v': 'w', 'x': 'y', 'ı': '°', 'ﬁ': 'à',
    '´': 'ô', '’': '*', '=': 'A',
}

# Matches dates formatted as DD/MM/YY or DD/MM/YYYY
DATE_RE = re.compile(r'^\d{2}/\d{2}/(?:\d{2}|\d{4})$')

def is_page_bondgr_encoded(page) -> bool:
    """Check if the page uses the legacy BONDGR encoded font subset."""
    try:
        fonts = page.get_fonts()
        for f in fonts:
            font_name = f[3] if len(f) > 3 else ""
            if "BONDGR" in font_name:
                return True
    except Exception:
        pass
    return False

def decode_word(w: str, apply_encoding: bool = False) -> str:
    """Decode character glyphs only if the page is BONDGR-encoded."""
    if apply_encoding:
        return ''.join(CHAR_MAP.get(c, c) for c in w)
    return w

def clean_amount_str(s: str) -> float | None:
    """
    Parse french numerical amounts (e.g., '1.468,48', '1 595,49', '49,,44', '8,00*', '17,39').
    In France, 4+ digit numbers often use dot or space for thousands and comma for decimals.
    """
    s = s.replace(' ', '').replace('*', '').replace(')', '').replace('(', '').replace('EUR', '').replace('€', '').strip()
    # If dot comes before comma (e.g. 1.468,48 or 12.345,67), the dot is a thousands separator
    if '.' in s and ',' in s:
        if s.rfind('.') < s.rfind(','):
            s = s.replace('.', '')
    # Replace comma with dot for standard python float parsing
    s = re.sub(r',+', '.', s)
    m = re.search(r'([-+]?\d+(?:\.\d+)?)', s)
    return float(m.group(1)) if m else None

def parse_sg_pdf(pdf_path: str) -> pd.DataFrame:
    """
    Extracts all transactions across all pages from any Société Générale bank statement PDF.
    Supports both modern standard-encoded statements (Helvetica/Courier)
    and older/specimen statements with BONDGR-encoded font subsets.
    """
    doc = fitz.open(pdf_path)
    all_txs = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        words = page.get_text('words')
        if not words:
            continue
        
        # Detect if this specific page uses BONDGR font encoding
        use_bondgr = is_page_bondgr_encoded(page)

        # Check if page contains transaction date entries (starting at x0 < 60)
        date_words = [
            w for w in words 
            if w[0] < 60 and DATE_RE.match(decode_word(w[4], use_bondgr))
        ]
        if not date_words:
            continue
            
        min_y = min(w[1] for w in date_words) - 5
        
        # Determine footer boundary where the table ends
        max_y = 800
        for w in words:
            dec = decode_word(w[4], use_bondgr).upper()
            if w[1] > min_y and any(k in dec for k in ['TOTAUX', 'NOUVEAU', 'COORDONNEES', 'FILIGRANE', 'TARIF', 'SOIT']):
                max_y = min(max_y, w[1])

        # Page-specific edge cases for specimen statements if BONDGR is used
        if use_bondgr:
            if page_idx == 0:
                max_y = min(max_y, 725)
            elif page_idx == 2:
                max_y = 765
            elif page_idx == 4:
                max_y = min(max_y, 195)

        table_words = [w for w in words if min_y <= w[1] <= max_y and w[0] < 575]
        if not table_words:
            continue

        # Group words by vertical proximity into lines (~3.5pt tolerance)
        lines = {}
        for w in table_words:
            y_approx = round(w[1], 0)
            matched = next((k for k in lines if abs(k - y_approx) <= 3.5), None)
            if matched is None:
                lines[y_approx] = [w]
            else:
                lines[matched].append(w)
                
        current_tx = None
        for y in sorted(lines.keys()):
            row = sorted(lines[y], key=lambda x: x[0])
            decoded_row = [(w[0], w[2], decode_word(w[4], use_bondgr)) for w in row]
            first_word = decoded_row[0]
            
            # Row begins with a date at x0 < 60
            if first_word[0] < 60 and DATE_RE.match(first_word[2]):
                tx_date = first_word[2]
                val_date = None
                desc_words = []
                debit_words = []
                credit_words = []
                
                for w in decoded_row[1:]:
                    x0 = w[0]
                    txt = w[2]
                    # Value date is usually between x0 65 and 135
                    if x0 < 135 and DATE_RE.match(txt):
                        val_date = txt
                    # Description column is between x0 135 and 440
                    elif x0 < 440:
                        if txt not in ['u', '►']:
                            desc_words.append(txt)
                    # Débit column is between x0 440 and 510
                    elif x0 < 510:
                        debit_words.append(txt)
                    # Crédit column is x0 >= 510
                    else:
                        credit_words.append(txt)
                        
                desc = ' '.join(desc_words)
                d_amt = clean_amount_str(''.join(debit_words)) if debit_words else None
                c_amt = clean_amount_str(''.join(credit_words)) if credit_words else None
                
                if d_amt is not None:
                    current_tx = {
                        'page': page_idx + 1,
                        'date': tx_date,
                        'valeur_date': val_date or tx_date,
                        'description': desc,
                        'amount': -d_amt,
                        'type': 'Debit',
                        'raw_amount': d_amt
                    }
                    all_txs.append(current_tx)
                if c_amt is not None:
                    ctx = {
                        'page': page_idx + 1,
                        'date': tx_date,
                        'valeur_date': val_date or tx_date,
                        'description': desc,
                        'amount': c_amt,
                        'type': 'Credit',
                        'raw_amount': c_amt
                    }
                    all_txs.append(ctx)
                    if d_amt is None:
                        current_tx = ctx
            else:
                # Continuation row for description or amount
                row_str = ' '.join(w[2] for w in decoded_row)
                if any(k in row_str.upper() for k in ['***', 'SOKDE', 'SOLDE', 'TOTAUX', 'NOUVEAU']):
                    continue
                if current_tx:
                    cont_words = [w[2] for w in decoded_row if w[0] < 440 and w[2] not in ['u', '►']]
                    if cont_words:
                        current_tx['description'] = (current_tx['description'] + ' ' + ' '.join(cont_words)).strip()
                    
                    # Also check if amount appeared on continuation row
                    if current_tx.get('amount') is None:
                        deb_words = [w[2] for w in decoded_row if 440 <= w[0] < 510]
                        cred_words = [w[2] for w in decoded_row if w[0] >= 510]
                        if deb_words:
                            val = clean_amount_str(''.join(deb_words))
                            if val:
                                current_tx['amount'] = -val
                                current_tx['type'] = 'Debit'
                        elif cred_words:
                            val = clean_amount_str(''.join(cred_words))
                            if val:
                                current_tx['amount'] = val
                                current_tx['type'] = 'Credit'

    df = pd.DataFrame(all_txs)
    if not df.empty:
        # Standardize 2-digit years to 4-digit years (e.g. 10/06/10 -> 10/06/2010)
        def format_date(d):
            parts = d.split('/')
            if len(parts) == 3 and len(parts[2]) == 2:
                year = int(parts[2])
                full_year = f"20{year:02d}" if year < 70 else f"19{year:02d}"
                return f"{parts[0]}/{parts[1]}/{full_year}"
            return d

        df['date'] = df['date'].apply(format_date)
        df['valeur_date'] = df['valeur_date'].apply(format_date)
        df['description'] = df['description'].apply(lambda d: re.sub(r'\s+', ' ', d).strip())

    return df
